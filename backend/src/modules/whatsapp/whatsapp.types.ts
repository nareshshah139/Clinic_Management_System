import type {
  WhatsAppMessageKind,
  WhatsAppMessageStatus,
} from '@prisma/client';

export type SenderSource = 'DOCTOR' | 'CLINIC' | 'SERVER_ENV';

export type WhatsAppSender = {
  token: string;
  phoneNumberId: string;
  source: SenderSource;
};

export type WhatsAppSendResult =
  | { status: 'ACCEPTED'; wamid: string; source: SenderSource }
  | { status: 'NOT_CONFIGURED' }
  | { status: 'FAILED'; code?: number; reason: string };

export type TemplateParameter =
  | { type: 'text'; text: string }
  | { type: 'document'; document: { id: string; filename: string } }
  | {
      type: 'currency';
      currency: { fallback_value: string; code: string; amount_1000: number };
    }
  | { type: 'date_time'; date_time: { fallback_value: string } };

export type TemplateComponent =
  | { type: 'header'; parameters?: TemplateParameter[] }
  | { type: 'body'; parameters?: TemplateParameter[] }
  | {
      type: 'button';
      sub_type?: 'quick_reply' | 'url';
      index?: string;
      parameters?: TemplateParameter[];
    };

export type TemplateMessage = {
  name: string;
  language: string;
  components?: TemplateComponent[];
};

export type DocumentTemplate = {
  name: string;
  language: string;
  bodyParams: number;
};

export type PhoneNumberProfile = {
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating: string | null;
};

export type MessageStatusUpdate = {
  wamid: string;
  status: Exclude<WhatsAppMessageStatus, 'ACCEPTED'>;
  errorCode: number | null;
  errorTitle: string | null;
};

export type { WhatsAppMessageKind, WhatsAppMessageStatus };

/** Prescription templates are filled with these values, in this order, up to the template's body parameter count. */
export const PRESCRIPTION_BODY_VALUES = [
  'patientName',
  'doctorName',
  'clinicName',
] as const;
