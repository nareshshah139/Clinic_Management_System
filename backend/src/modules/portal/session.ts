import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';

type Db = Prisma.TransactionClient | PrismaClient;

export const SESSION_COOKIE = '__Host-portal_session';
export const IDLE_MS = 30 * 60 * 1000;
export const ABSOLUTE_MS = 24 * 3600 * 1000;
/** Activity closer together than this does not rewrite the session row. */
export const TOUCH_MS = 60 * 1000;

/**
 * @cc [owner:nareshshah139,label:security] portal-session-cookie
 * A portal session MUST travel only in the `__Host-` cookie, HttpOnly, Secure and SameSite=Lax,
 * with no Domain and Path=/, and the server MUST keep only the token's hash (PP-58).
 */
export const cookieOptions = (maxAgeMs: number) => ({ httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: maxAgeMs });

export const newSessionToken = () => randomBytes(32).toString('base64url');
export const hashSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function sessionTokenFrom(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)__Host-portal_session=([^;]+)/);
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  return TOKEN.test(token) ? token : null;
}

function refSecret() {
  const s = process.env.PORTAL_CODE_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error('PORTAL_CODE_SECRET or JWT_SECRET must be set');
  return s;
}

/** An opaque, per-session name for one profile, so no portal body carries a patient id. */
export const profileRef = (sessionId: string, patientId: string) =>
  createHmac('sha256', refSecret()).update(`profile:${sessionId}:${patientId}`).digest('base64url').slice(0, 22);

export function sameRef(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type PortalProfileEntry = { patientId: string; firstName: string; branch: string; branchId: string };

/**
 * @cc [owner:nareshshah139,label:security] profiles-rebuilt-each-request
 * The profiles a portal identity may open MUST be every patient whose profile has that number,
 * portalEnabled and is not archived, across branches, read again on every request (PP-61).
 */
export async function profilesFor(db: Db, phoneE164: string): Promise<PortalProfileEntry[]> {
  const rows = await db.patientPortalProfile.findMany({
    where: { phoneE164, portalEnabled: true, patient: { isArchived: false } },
    select: { patientId: true, patient: { select: { name: true, branchId: true, branch: { select: { name: true } } } } },
  });
  return rows
    .map((r) => ({ patientId: r.patientId, firstName: r.patient.name.trim().split(/\s+/)[0] ?? '', branch: r.patient.branch?.name ?? '', branchId: r.patient.branchId }))
    .sort((a, b) => a.firstName.localeCompare(b.firstName) || a.branch.localeCompare(b.branch) || a.patientId.localeCompare(b.patientId));
}

/** A number can sign in when some patient on it has confirmed it and has the portal on (PP-55). */
export async function numberCanSignIn(db: Db, phoneE164: string): Promise<boolean> {
  const n = await db.patientPortalProfile.count({
    where: { phoneE164, phoneConfirmedAt: { not: null }, portalEnabled: true, patient: { isArchived: false } },
  });
  return n > 0;
}

/**
 * @cc [owner:nareshshah139,label:security] patient-change-revokes-sessions
 * A phone change, the portal turned off, or a merge MUST revoke the sessions whose chosen patient
 * is that patient, in the same transaction as the change (PP-07, PP-09, PP-10).
 */
export async function revokePatientSessions(db: Db, patientId: string, reason: string, at = new Date()) {
  const { count } = await db.portalSession.updateMany({ where: { patientId, revokedAt: null }, data: { revokedAt: at, revokeReason: reason } });
  return count;
}
