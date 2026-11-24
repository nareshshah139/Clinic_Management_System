import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';

function linkSecret(): string {
  const secret = process.env.PORTAL_LINK_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('PORTAL_LINK_SECRET or JWT_SECRET must be set');
  return secret;
}

/**
 * @cc [owner:nareshshah139,label:security] task-link-token
 * A task-link token MUST be base64url(HMAC-SHA256(PORTAL_LINK_SECRET or JWT_SECRET, linkId)),
 * 256 bits, never stored; the database keeps only sha256(token) in PortalTaskLink.tokenHash.
 */
export function deriveTaskToken(linkId: string): string {
  return createHmac('sha256', linkSecret()).update(linkId).digest('base64url');
}

export function hashTaskToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** True when `token` is the token of `linkId`, compared in constant time. */
export function verifyTaskToken(token: string, linkId: string): boolean {
  const want = Buffer.from(deriveTaskToken(linkId));
  const got = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** The one place that turns a token into the URL a patient opens. */
export function taskLinkUrl(token: string): string {
  return `${(process.env.PORTAL_BASE_URL ?? '').replace(/\/$/, '')}/p/t#${token}`;
}

/**
 * @cc [owner:nareshshah139,label:security] task-link-revocation
 * Turning the portal off, opting out, or changing the phone number MUST revoke, in the same
 * transaction, every unrevoked task link of the affected patients (PP-38).
 */
export async function revokeTaskLinks(tx: Prisma.TransactionClient, patientIds: string[], now = new Date()): Promise<number> {
  if (!patientIds.length) return 0;
  const { count } = await tx.portalTaskLink.updateMany({ where: { patientId: { in: patientIds }, revokedAt: null }, data: { revokedAt: now } });
  return count;
}
