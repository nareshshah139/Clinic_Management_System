import { Language, Prisma, WhatsAppConsentState } from '@prisma/client';
import { toE164 } from './phone-e164';

type Tx = Prisma.TransactionClient;

export type ConsentEvent =
  | { kind: 'agreed'; byUserId: string; method: string }
  | { kind: 'confirmed'; method: string }
  | { kind: 'refused'; byUserId: string | null; method: string }
  | { kind: 'confirmationExpired' }
  | { kind: 'lapsed' };

const NEXT: Record<ConsentEvent['kind'], Partial<Record<WhatsAppConsentState, WhatsAppConsentState>>> = {
  agreed: { NOT_ASKED: 'PENDING', OPTED_OUT: 'PENDING', PENDING: 'PENDING' },
  confirmed: { PENDING: 'OPTED_IN' },
  refused: { NOT_ASKED: 'OPTED_OUT', PENDING: 'OPTED_OUT', OPTED_IN: 'OPTED_OUT', OPTED_OUT: 'OPTED_OUT' },
  confirmationExpired: { PENDING: 'NOT_ASKED' },
  lapsed: { OPTED_IN: 'PENDING' },
};

/**
 * @cc [owner:nareshshah139,label:security;product] whatsapp-consent-transitions
 * WhatsApp consent MUST move only along NOT_ASKED -> PENDING -> OPTED_IN -> OPTED_OUT -> PENDING as
 * the spec's consent machine allows. Only the number confirming itself reaches OPTED_IN.
 */
export function nextConsent(from: WhatsAppConsentState, event: ConsentEvent['kind']): WhatsAppConsentState | null {
  return NEXT[event][from] ?? null;
}

export const CONSENT_STATES = Object.values(WhatsAppConsentState);
export const LANGUAGES = Object.values(Language);

/**
 * @cc [owner:nareshshah139,label:security] phone-change-resets-consent
 * Writing a patient's phone MUST, in the same transaction, store the E.164 number derived from it,
 * and when that number changes, set consent to NOT_ASKED and clear the confirmation.
 */
export async function syncPatientPhone(tx: Tx, patientId: string, phone: string) {
  const phoneE164 = toE164(phone);
  const current = await tx.patientPortalProfile.findUnique({ where: { patientId } });
  if (!current) {
    return tx.patientPortalProfile.create({ data: { patientId, phoneE164 } });
  }
  if (current.phoneE164 === phoneE164) return current;
  return tx.patientPortalProfile.update({
    where: { patientId },
    data: {
      phoneE164,
      phoneConfirmedAt: null,
      consentState: WhatsAppConsentState.NOT_ASKED,
      consentRecordedById: null,
      consentRecordedAt: new Date(),
      consentMethod: 'phone-changed',
    },
  });
}

export async function ensureProfile(tx: Tx, patientId: string) {
  const existing = await tx.patientPortalProfile.findUnique({ where: { patientId } });
  if (existing) return existing;
  const patient = await tx.patient.findUniqueOrThrow({ where: { id: patientId }, select: { phone: true } });
  return tx.patientPortalProfile.create({ data: { patientId, phoneE164: toE164(patient.phone) } });
}

type Profile = { consentState: WhatsAppConsentState; portalEnabled: boolean; mergeHoldReason: string | null; preferredLanguage: Language; phoneConfirmedAt: Date | null; consentRecordedAt: Date | null; consentRecordedById: string | null; consentMethod: string | null; lastSeenAt: Date | null; phoneE164: string | null };

/** Merge rule: an opt-out on either row wins, and a disabled portal on either row wins. */
export function combineProfiles(kept: Profile | null, dup: Profile | null): Partial<Profile> | null {
  if (!dup) return null;
  if (!kept) return { ...dup, phoneE164: dup.phoneE164 };
  const optedOut = kept.consentState === 'OPTED_OUT' ? kept : dup.consentState === 'OPTED_OUT' ? dup : null;
  const consentFrom = optedOut ?? kept;
  return {
    consentState: consentFrom.consentState,
    consentRecordedAt: consentFrom.consentRecordedAt,
    consentRecordedById: consentFrom.consentRecordedById,
    consentMethod: consentFrom.consentMethod,
    portalEnabled: kept.portalEnabled && dup.portalEnabled,
    mergeHoldReason: kept.mergeHoldReason ?? dup.mergeHoldReason,
  };
}

/**
 * @cc [owner:nareshshah139,label:security] phone-match-is-e164-equality
 * Matching a phone to patients MUST use equality on the stored E.164 number only: no prefix match
 * and no match on secondaryPhone.
 */
export function patientsForNumber(tx: Tx, phoneE164: string) {
  return tx.patientPortalProfile.findMany({
    where: { phoneE164, portalEnabled: true, patient: { isArchived: false } },
    select: { patientId: true, consentState: true, preferredLanguage: true, patient: { select: { branchId: true } } },
    orderBy: { patientId: 'asc' },
  });
}
