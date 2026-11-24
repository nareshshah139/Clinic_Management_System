export type AttentionKind = 'PATIENT_MESSAGE' | 'DELIVERY_FAILURE' | 'RESPONSE_FLAG' | 'MISSED_CHECK_IN';
export type AttentionPriority = 'URGENT' | 'HIGH' | 'NORMAL';
export type AttentionState = 'OPEN' | 'CLAIMED' | 'RESOLVED';
export type DeliveryState = 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'SUPPRESSED' | 'EXPIRED';

export type FollowUpPlan = { key: string; planVersionId: string; version: number; name: { EN: string }; steps: { key: string; offsetDays: number; windowDays: number }[] };
export type ActiveTrack = {
  id: string;
  visitId: string;
  anchorDate: string;
  createdAt: string;
  planVersion: { id: string; version: number; content: { name?: { EN?: string } }; plan: { key: string } };
  checkIns: { id: string; stepKey: string; state: string; opensAt: string; closesAt: string }[];
};

type PatientRef = { id: string; name: string; patientCode?: string | null } | null;

export type WorklistItem = {
  id: string;
  kind: AttentionKind;
  state: AttentionState;
  priority: AttentionPriority;
  reason: string | null;
  patient: PatientRef;
  phoneE164: string | null;
  claimedBy: { id: string; name: string } | null;
  createdAt: string;
  lastEventAt: string;
  ageMinutes: number;
};

export type ResponseView = {
  id: string;
  submittedAt: string;
  score: number | null;
  flag: AttentionPriority | null;
  instrument: string;
  instrumentVersion: number;
  answers: { key: string; prompt: string; value: string }[];
  photos: { id: string; itemKey: string | null }[];
};

export type ThreadMessage = {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  channel: string;
  kind: string;
  body: string | null;
  hasMedia: boolean;
  photos: string[];
  assignment: 'EXACT' | 'SUGGESTED' | 'CONFIRMED' | 'UNASSIGNED';
  patient: PatientRef;
  phoneE164: string;
  authorKind: string;
  author: string | null;
  readAt: string | null;
  createdAt: string;
  delivery: { state: DeliveryState; outcome: string | null } | null;
};

export type WorklistItemDetail = WorklistItem & {
  resolutionCode: string | null;
  resolutionNote: string | null;
  resolvedBy: { id: string; name: string } | null;
  resolvedAt: string | null;
  canResolve: boolean;
  checkIn: {
    id: string; stepKey: string; state: string; opensAt: string; closesAt: string; plan: string;
    delivery: { purpose: string; state: DeliveryState; outcome: string | null; sentAt: string | null } | null;
  } | null;
  response: ResponseView | null;
  earlierResponses: ResponseView[];
  thread: ThreadMessage[];
  reply:
    | { canReply: true; via?: 'whatsapp'; windowClosesAt: string }
    | { canReply: true; via: 'portal'; message: string }
    | { canReply: false; reason: string; message: string };
};

export type WaitingCheckIn = {
  checkInId: string;
  stepKey: string;
  patient: PatientRef;
  plan: string;
  opensAt: string;
  closesAt: string;
  closesInMinutes: number;
  delivery: { purpose: string; state: DeliveryState; outcome: string | null; sentAt: string | null } | null;
};

export type MessageThread = {
  subjectKey: string;
  patient: PatientRef;
  phoneE164: string;
  unread: number;
  lastMessageAt: string;
  preview: string;
  suggested: boolean;
  itemId: string | null;
};

export type PatientTimeline = {
  profile: { phoneE164: string | null; phoneConfirmedAt: string | null; consentState: string; preferredLanguage: string; portalEnabled: boolean } | null;
  tracks: {
    id: string; state: 'ACTIVE' | 'COMPLETED' | 'STOPPED'; anchorDate: string; stopReason: string | null; stoppedAt: string | null; completedAt: string | null;
    visitId: string; plan: string; planVersion: number;
    checkIns: { id: string; stepKey: string; state: string; opensAt: string; closesAt: string; response: ResponseView | null }[];
  }[];
  messages: ThreadMessage[];
};

export const KIND_LABEL: Record<AttentionKind, string> = {
  PATIENT_MESSAGE: 'Patient message',
  DELIVERY_FAILURE: 'Message not delivered',
  RESPONSE_FLAG: 'Check-in answer needs review',
  MISSED_CHECK_IN: 'Missed check-in',
};

export const PRIORITY_LABEL: Record<AttentionPriority, string> = { URGENT: 'Urgent', HIGH: 'High', NORMAL: 'Normal' };

export const DELIVERY_LABEL: Record<DeliveryState, string> = {
  QUEUED: 'Waiting to send',
  SENDING: 'Sending',
  SENT: 'Sent',
  DELIVERED: 'Delivered',
  READ: 'Read',
  FAILED: 'Not delivered',
  SUPPRESSED: 'Not sent',
  EXPIRED: 'Not sent (no longer needed)',
};

export const RESOLUTION_OPTIONS = [
  { value: 'REPLIED', label: 'Replied on WhatsApp' },
  { value: 'CALLED', label: 'Called the patient' },
  { value: 'REVIEW_BOOKED', label: 'Booked a review' },
  { value: 'ADVICE_GIVEN', label: 'Gave advice' },
  { value: 'NO_ACTION_NEEDED', label: 'No action needed' },
  { value: 'WRONG_NUMBER', label: 'Wrong number' },
] as const;

export const STOP_REASON_LABEL: Record<string, string> = {
  'doctor-stopped': 'stopped by the doctor',
  'plan-changed': 'plan changed on the visit',
  'visit-deleted': 'visit deleted',
  'patient-archived': 'patient archived',
};

/** "5 min", "3 h", "2 d": how long an item has waited. */
export function formatAge(minutes: number): string {
  if (minutes < 60) return `${Math.max(0, Math.floor(minutes))} min`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / (24 * 60))} d`;
}

export function patientLabel(patient: PatientRef, phone: string | null): string {
  if (patient) return patient.name;
  return phone ? `Unknown sender ${phone}` : 'Unknown sender';
}
