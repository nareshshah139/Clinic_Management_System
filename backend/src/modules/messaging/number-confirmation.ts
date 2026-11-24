import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { Prisma, WhatsAppConsentState } from '@prisma/client';
import { enqueueOutbound } from './outbox';

type Tx = Prisma.TransactionClient;
export const CONFIRMATION_TTL_MS = 7 * 24 * 3600 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
export const CONFIRM_PAYLOAD_PREFIX = 'confirm:';

function secret() {
  const s = process.env.PORTAL_CODE_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error('PORTAL_CODE_SECRET or JWT_SECRET must be set');
  return s;
}

export const hashCode = (phoneE164: string, code: string) =>
  createHmac('sha256', secret()).update(`${phoneE164}:${code}`).digest('hex');

export const clinicName = () => process.env.CLINIC_NAME || 'the clinic';

/**
 * @cc [owner:nareshshah139,label:security] number-confirmation-message
 * Asking a number to confirm MUST queue one confirmation message that names the clinic and no
 * person, carrying a 6-digit code stored only as a keyed hash and a "Yes" button.
 */
export async function requestNumberConfirmation(tx: Tx, phoneE164: string, language: string, patientId: string | null) {
  const open = await tx.portalOtpChallenge.findFirst({
    where: { phoneE164, purpose: 'CONFIRM_NUMBER', consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (open && (await tx.outboundMessage.count({ where: { dedupeKey: `confirm:${open.id}`, state: 'QUEUED' } }))) return open;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const challenge = await tx.portalOtpChallenge.create({
    data: { purpose: 'CONFIRM_NUMBER', phoneE164, codeHash: hashCode(phoneE164, code), expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS) },
  });
  await enqueueOutbound(tx, {
    dedupeKey: `confirm:${challenge.id}`,
    purpose: 'NUMBER_CONFIRMATION',
    patientId,
    toE164: phoneE164,
    templateKey: 'number_confirmation',
    params: { clinic: clinicName(), code, language, payload: `${CONFIRM_PAYLOAD_PREFIX}${challenge.id}` },
  });
  return challenge;
}

/**
 * @cc [owner:nareshshah139,label:security] one-confirmation-covers-number
 * A confirmation from a number MUST move every PENDING patient on that number to OPTED_IN, and no
 * other path may set OPTED_IN.
 */
export async function confirmNumber(tx: Tx, phoneE164: string, method: string, at = new Date()) {
  const { count } = await tx.patientPortalProfile.updateMany({
    where: { phoneE164, consentState: WhatsAppConsentState.PENDING },
    data: { consentState: WhatsAppConsentState.OPTED_IN, phoneConfirmedAt: at, lastSeenAt: at, consentMethod: method, consentRecordedAt: at, consentRecordedById: null },
  });
  return count;
}

export type CodeResult = 'confirmed' | 'wrong' | 'expired' | 'locked' | 'none';

export async function confirmByCode(tx: Tx, phoneE164: string, code: string, at = new Date()): Promise<CodeResult> {
  const challenge = await tx.portalOtpChallenge.findFirst({
    where: { phoneE164, purpose: 'CONFIRM_NUMBER', consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge) return 'none';
  if (challenge.expiresAt <= at) return 'expired';
  // Spend the attempt before comparing, so parallel guesses cannot share one remaining attempt.
  const spent = await tx.portalOtpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null, attempts: { lt: MAX_CODE_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (!spent.count) return 'locked';
  const want = Buffer.from(challenge.codeHash, 'hex');
  const got = Buffer.from(hashCode(phoneE164, code.trim()), 'hex');
  if (want.length !== got.length || !timingSafeEqual(want, got)) return 'wrong';
  const consumed = await tx.portalOtpChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: at } });
  if (!consumed.count) return 'none';
  await confirmNumber(tx, phoneE164, 'code-entered', at);
  return 'confirmed';
}

export async function confirmByTap(tx: Tx, phoneE164: string, payload: string, at = new Date()): Promise<boolean> {
  if (!payload.startsWith(CONFIRM_PAYLOAD_PREFIX)) return false;
  const id = payload.slice(CONFIRM_PAYLOAD_PREFIX.length);
  const challenge = await tx.portalOtpChallenge.findFirst({ where: { id, phoneE164, consumedAt: null, expiresAt: { gt: at } } });
  if (!challenge) return false;
  await tx.portalOtpChallenge.update({ where: { id }, data: { consumedAt: at } });
  await confirmNumber(tx, phoneE164, 'tapped-yes', at);
  return true;
}
