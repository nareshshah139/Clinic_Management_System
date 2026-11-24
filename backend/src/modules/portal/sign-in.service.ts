import { randomInt, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { toE164 } from '../patients/portal/phone-e164';
import { hashCode } from '../messaging/number-confirmation';
import { enqueueOutbound } from '../messaging/outbox';
import { auditAttentionUpsert } from '../messaging/attention';
import { SendPassService } from '../messaging/send-pass.service';
import { ABSOLUTE_MS, IDLE_MS, hashSessionToken, newSessionToken, numberCanSignIn, profileRef, profilesFor, sameRef } from './session';
import type { PortalIdentityPrincipal } from './principal';

type Tx = Prisma.TransactionClient;

export const SIGN_IN_TTL_MS = 5 * 60 * 1000;
export const SIGN_IN_MAX_ATTEMPTS = 5;
export const PHONE_WINDOW_MS = 15 * 60 * 1000;
export const PHONE_WINDOW_MAX = 3;
export const DAY_MS = 24 * 3600 * 1000;
export const PHONE_DAY_MAX = 10;
export const WRONG_DAY_MAX = 10;
export const CLINIC_HOUR_MS = 3600 * 1000;
export const SIGN_IN_CODE_SUBJECT = 'PORTAL_OTP';
export const clinicCodesPerHour = () => Math.max(1, Number(process.env.PORTAL_CODES_PER_HOUR) || 300);

/** The one answer every code request gets, sent or not (PP-55). */
export const CODE_REQUEST_ANSWER = { message: 'If this number can sign in, a code is on its way on WhatsApp. It works for 5 minutes.' };
/** The one answer every failed verification gets. */
export const CODE_REJECTED_MESSAGE = 'That code did not work. Check the number and code, or ask for a new code.';

export type CodeRequestOutcome = 'sent' | 'invalid-number' | 'not-eligible' | 'phone-window' | 'phone-day' | 'phone-locked' | 'clinic-ceiling';
export type VerifyOutcome =
  | { ok: true; token: string; principal: PortalIdentityPrincipal; absoluteExpiresAt: Date }
  | { ok: false; reason: 'invalid-number' | 'none' | 'expired' | 'locked' | 'wrong' | 'phone-locked' | 'not-eligible' };

export type ProfileList = { profiles: { ref: string; firstName: string; branch: string }[]; chosen: string | null };

/** Wrong attempts across every sign-in code of a number in the last day (PP-57). */
async function wrongAttempts(tx: Tx, phoneE164: string, now: Date) {
  const [row] = await tx.$queryRaw<{ wrong: bigint | null }[]>`
    SELECT coalesce(sum("attempts" - CASE WHEN "consumedAt" IS NULL THEN 0 ELSE 1 END), 0) AS wrong
    FROM "portal_otp_challenges"
    WHERE "phoneE164" = ${phoneE164} AND "purpose" = 'SIGN_IN' AND "createdAt" >= ${new Date(now.getTime() - DAY_MS)}`;
  return Number(row?.wrong ?? 0);
}

async function lockNumber(tx: Tx, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

@Injectable()
export class SignInService {
  private readonly logger = new Logger(SignInService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sendPass: SendPassService,
  ) {}

  /**
   * @cc [owner:nareshshah139,label:security] sign-in-code-issue
   * A sign-in code MUST go only to a confirmed number with a portal-enabled patient, within the
   * per-number limits and the clinic-wide hourly ceiling counted in the database, and the code
   * MUST be stored only as a keyed hash (PP-55, PP-57).
   */
  async requestCode(rawPhone: unknown, now = new Date()): Promise<CodeRequestOutcome> {
    const phoneE164 = typeof rawPhone === 'string' && rawPhone.length <= 32 ? toE164(rawPhone) : null;
    if (!phoneE164) return 'invalid-number';
    const issued = await this.prisma.$transaction(async (tx): Promise<CodeRequestOutcome | { outboundId: string }> => {
      await lockNumber(tx, `portal-sign-in:${phoneE164}`);
      if (!(await numberCanSignIn(tx, phoneE164))) return 'not-eligible';
      const recent = (ms: number) =>
        tx.portalOtpChallenge.count({ where: { phoneE164, purpose: 'SIGN_IN', createdAt: { gte: new Date(now.getTime() - ms) } } });
      if ((await wrongAttempts(tx, phoneE164, now)) >= WRONG_DAY_MAX) return 'phone-locked';
      if ((await recent(PHONE_WINDOW_MS)) >= PHONE_WINDOW_MAX) return 'phone-window';
      if ((await recent(DAY_MS)) >= PHONE_DAY_MAX) return 'phone-day';
      await lockNumber(tx, 'portal-sign-in:clinic');
      const lastHour = await tx.portalOtpChallenge.count({ where: { purpose: 'SIGN_IN', createdAt: { gte: new Date(now.getTime() - CLINIC_HOUR_MS) } } });
      if (lastHour >= clinicCodesPerHour()) {
        await this.openCeilingItem(tx, now);
        return 'clinic-ceiling';
      }
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const challenge = await tx.portalOtpChallenge.create({
        data: { purpose: 'SIGN_IN', phoneE164, codeHash: hashCode(phoneE164, code), expiresAt: new Date(now.getTime() + SIGN_IN_TTL_MS), createdAt: now },
      });
      const profile = await tx.patientPortalProfile.findFirst({
        where: { phoneE164, phoneConfirmedAt: { not: null }, portalEnabled: true, patient: { isArchived: false } },
        orderBy: { phoneConfirmedAt: 'desc' },
        select: { preferredLanguage: true },
      });
      const dedupeKey = `portal-code:${challenge.id}`;
      await enqueueOutbound(tx, {
        dedupeKey,
        purpose: 'PORTAL_SIGN_IN_CODE',
        patientId: null,
        toE164: phoneE164,
        templateKey: 'portal_sign_in_code',
        subjectType: SIGN_IN_CODE_SUBJECT,
        subjectId: challenge.id,
        params: { code, language: profile?.preferredLanguage ?? 'EN' },
        notBefore: now,
        createdAt: now,
      });
      const row = await tx.outboundMessage.findUniqueOrThrow({ where: { dedupeKey }, select: { id: true } });
      return { outboundId: row.id };
    });
    if (typeof issued === 'string') return issued;
    try {
      await this.sendPass.sendNow(issued.outboundId, now);
    } finally {
      // The code leaves the outbox once the send is decided; a send that did not happen is withdrawn (no SMS fallback).
      await this.prisma.outboundMessage.update({ where: { id: issued.outboundId }, data: { params: { withdrawn: true } } });
    }
    return 'sent';
  }

  private async openCeilingItem(tx: Tx, now: Date) {
    const hour = now.toISOString().slice(0, 13);
    const written = await tx.$queryRaw<{ id: string; inserted: boolean }[]>`
      INSERT INTO "attention_items" ("id", "kind", "state", "subjectKey", "patientId", "phoneE164", "branchId", "reason", "lastEventAt", "createdAt", "updatedAt")
      VALUES (${`att_codes_${now.getTime()}`}, 'DELIVERY_FAILURE', 'OPEN', ${`portal-codes:${hour}`}, NULL, NULL, NULL, 'sign-in-code-ceiling', ${now}, ${now}, ${now})
      ON CONFLICT ("kind", "subjectKey") WHERE "state" <> 'RESOLVED'
      DO UPDATE SET "lastEventAt" = EXCLUDED."lastEventAt", "updatedAt" = EXCLUDED."updatedAt"
      RETURNING "id", (xmax = 0) AS "inserted"`;
    await auditAttentionUpsert(tx, written, ['lastEventAt', 'updatedAt']);
    this.logger.warn('Portal sign-in codes paused: clinic-wide hourly ceiling reached');
  }

  /**
   * @cc [owner:nareshshah139,label:security] sign-in-code-consume
   * A sign-in code MUST expire after five minutes, lock after five wrong attempts, and be consumed
   * by a conditional update in the transaction that creates the session, so two concurrent
   * correct submissions yield one session (PP-56).
   */
  async verifyCode(rawPhone: unknown, rawCode: unknown, now = new Date()): Promise<VerifyOutcome> {
    const phoneE164 = typeof rawPhone === 'string' && rawPhone.length <= 32 ? toE164(rawPhone) : null;
    const code = typeof rawCode === 'string' ? rawCode.trim() : '';
    if (!phoneE164 || !/^\d{6}$/.test(code)) return { ok: false, reason: 'invalid-number' };
    return this.prisma.$transaction(async (tx): Promise<VerifyOutcome> => {
      // Guesses on one number are counted one at a time, so concurrent tries cannot pass the daily limit together.
      await lockNumber(tx, `portal-sign-in:${phoneE164}`);
      const challenge = await tx.portalOtpChallenge.findFirst({
        where: { phoneE164, purpose: 'SIGN_IN', consumedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (!challenge) return { ok: false, reason: 'none' };
      if (challenge.expiresAt <= now) return { ok: false, reason: 'expired' };
      if ((await wrongAttempts(tx, phoneE164, now)) >= WRONG_DAY_MAX) return { ok: false, reason: 'phone-locked' };
      const spent = await tx.portalOtpChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, attempts: { lt: SIGN_IN_MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      if (!spent.count) return { ok: false, reason: 'locked' };
      const want = Buffer.from(challenge.codeHash, 'hex');
      const got = Buffer.from(hashCode(phoneE164, code), 'hex');
      if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: 'wrong' };
      const consumed = await tx.portalOtpChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: now } });
      if (!consumed.count) return { ok: false, reason: 'none' };
      if (!(await numberCanSignIn(tx, phoneE164))) return { ok: false, reason: 'not-eligible' };
      const identity = await tx.portalIdentity.upsert({
        where: { phoneE164 },
        create: { phoneE164, lastSignInAt: now },
        update: { lastSignInAt: now },
      });
      const token = newSessionToken();
      const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_MS);
      const session = await tx.portalSession.create({
        data: { tokenHash: hashSessionToken(token), identityId: identity.id, challengeId: challenge.id, lastActiveAt: now, idleExpiresAt: new Date(now.getTime() + IDLE_MS), absoluteExpiresAt, createdAt: now },
      });
      // A completed sign-in keeps consent from lapsing (PP-08).
      await tx.patientPortalProfile.updateMany({ where: { phoneE164 }, data: { lastSeenAt: now } });
      await tx.portalAccessEvent.create({ data: { identityId: identity.id, sessionId: session.id, kind: 'SIGN_IN', createdAt: now } });
      const profiles = await profilesFor(tx, phoneE164);
      if (profiles.length === 1) {
        await tx.portalSession.update({ where: { id: session.id }, data: { patientId: profiles[0].patientId } });
        await tx.portalAccessEvent.create({ data: { identityId: identity.id, sessionId: session.id, patientId: profiles[0].patientId, kind: 'PROFILE_CHOICE', createdAt: now } });
      }
      return { ok: true, token, principal: { kind: 'portal-identity', sessionId: session.id, identityId: identity.id, phoneE164 }, absoluteExpiresAt };
    });
  }

  /**
   * @cc [owner:nareshshah139,label:security] portal-session-expiry
   * A portal session MUST stop working 30 minutes after its last request and 24 hours after sign-in,
   * and once revoked (PP-60).
   */
  async resolve(token: string, now = new Date()) {
    const session = await this.prisma.portalSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { identity: { select: { id: true, phoneE164: true } } },
    });
    if (!session || session.revokedAt || now >= session.idleExpiresAt || now >= session.absoluteExpiresAt) return null;
    const idle = Math.min(now.getTime() + IDLE_MS, session.absoluteExpiresAt.getTime());
    await this.prisma.portalSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { lastActiveAt: now, idleExpiresAt: new Date(idle) } });
    const profiles = await profilesFor(this.prisma, session.identity.phoneE164);
    const chosen = session.patientId ? profiles.find((p) => p.patientId === session.patientId) ?? null : null;
    return { session, phoneE164: session.identity.phoneE164, profiles, chosen };
  }

  async profileList(principal: PortalIdentityPrincipal): Promise<ProfileList> {
    const session = await this.prisma.portalSession.findUnique({ where: { id: principal.sessionId }, select: { patientId: true } });
    const chosenPatientId = session?.patientId ?? null;
    const profiles = await profilesFor(this.prisma, principal.phoneE164);
    return {
      profiles: profiles.map((p) => ({ ref: profileRef(principal.sessionId, p.patientId), firstName: p.firstName, branch: p.branch })),
      chosen: chosenPatientId && profiles.some((p) => p.patientId === chosenPatientId) ? profileRef(principal.sessionId, chosenPatientId) : null,
    };
  }

  /** Switching profile needs no new code; a ref only names a profile on this session's current list (PP-61). */
  async chooseProfile(principal: PortalIdentityPrincipal, ref: unknown, now = new Date()): Promise<boolean> {
    if (typeof ref !== 'string') return false;
    const profiles = await profilesFor(this.prisma, principal.phoneE164);
    const pick = profiles.find((p) => sameRef(profileRef(principal.sessionId, p.patientId), ref));
    if (!pick) return false;
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.portalSession.updateMany({ where: { id: principal.sessionId, revokedAt: null }, data: { patientId: pick.patientId } });
      if (!count) return false;
      await tx.portalAccessEvent.create({ data: { identityId: principal.identityId, sessionId: principal.sessionId, patientId: pick.patientId, kind: 'PROFILE_CHOICE', createdAt: now } });
      return true;
    });
  }

  async signOut(principal: PortalIdentityPrincipal, everywhere: boolean, now = new Date()) {
    await this.prisma.$transaction(async (tx) => {
      await tx.portalSession.updateMany({
        where: everywhere ? { identityId: principal.identityId, revokedAt: null } : { id: principal.sessionId, revokedAt: null },
        data: { revokedAt: now, revokeReason: everywhere ? 'signed-out-everywhere' : 'signed-out' },
      });
      await tx.portalAccessEvent.create({
        data: { identityId: principal.identityId, sessionId: principal.sessionId, kind: everywhere ? 'SIGN_OUT_EVERYWHERE' : 'SIGN_OUT', createdAt: now },
      });
    });
  }
}
