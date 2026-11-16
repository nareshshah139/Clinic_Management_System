export type ConsultationType = 'IN_PERSON' | 'TELE_VIDEO';

// CR-07 wording supplied by the clinic; keep server PDF wording in sync.
export const TELE_VIDEO_DISCLAIMER = "This prescription was issued after a tele-video consultation, conducted with the patient's consent. It is based on the history and visual examination available over video and is not valid for medico-legal purposes.";
export const TELE_VIDEO_CONSENT_REQUIRED = 'Patient consent is required before saving a tele-video consultation.';
