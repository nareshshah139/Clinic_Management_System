import { BadRequestException } from '@nestjs/common';

export enum ConsultationType {
  IN_PERSON = 'IN_PERSON',
  TELE_VIDEO = 'TELE_VIDEO',
}

export const TELE_VIDEO_DISCLAIMER = "This prescription was issued after a tele-video consultation, conducted with the patient's consent. It is based on the history and visual examination available over video and is not valid for medico-legal purposes.";
export const TELE_VIDEO_CONSENT_REQUIRED = 'Patient consent is required before saving a tele-video consultation.';

type ConsultationRecord = {
  consultationType?: string;
  teleVideoConsentById?: string | null;
  teleVideoConsentAt?: Date | null;
};

/**
 * @cc [owner:nareshshah139,label:product] consent-before-tele-video
 * A new tele-video consultation requires explicit true consent and an authenticated
 * actor; invalid types, non-boolean consent and revoked consent fail before writes.
 */
/**
 * @cc [owner:nareshshah139,label:security] server-owned-consent-receipt
 * Consent receipts use the authenticated actor and server time, retain the first
 * receipt on unchanged tele-video saves, and require new consent after in-person.
 * In-person visits retain the previous receipt as inactive audit evidence.
 */
export function consultationPatch(
  input: { consultationType?: ConsultationType; teleVideoConsent?: boolean },
  current: ConsultationRecord | undefined,
  actorId?: string,
): Omit<ConsultationRecord, 'consultationType'> & { consultationType?: ConsultationType } {
  if (input.consultationType !== undefined && !Object.values(ConsultationType).includes(input.consultationType)) {
    throw new BadRequestException('Choose In-person or Tele-video consultation.');
  }
  if (input.teleVideoConsent !== undefined && typeof input.teleVideoConsent !== 'boolean') {
    throw new BadRequestException(TELE_VIDEO_CONSENT_REQUIRED);
  }
  const consultationType = input.consultationType ?? (current?.consultationType === ConsultationType.TELE_VIDEO ? ConsultationType.TELE_VIDEO : ConsultationType.IN_PERSON);
  if (consultationType === ConsultationType.IN_PERSON) {
    return input.consultationType !== undefined || !current ? { consultationType } : {};
  }
  const hasReceipt = current?.consultationType === ConsultationType.TELE_VIDEO &&
    current.teleVideoConsentById && current.teleVideoConsentAt;
  if (input.teleVideoConsent === false || (!hasReceipt && input.teleVideoConsent !== true)) {
    throw new BadRequestException(TELE_VIDEO_CONSENT_REQUIRED);
  }
  if (hasReceipt) return { consultationType };
  if (!actorId) throw new BadRequestException('Sign in before recording tele-video consent.');
  return { consultationType, teleVideoConsentById: actorId, teleVideoConsentAt: new Date() };
}
