export const RETURN_REASONS = [
  'EXPIRY',
  'NEAR_EXPIRY',
  'BREAKAGE',
  'WRONG_ITEM',
  'EXCESS_SUPPLY',
  'OTHER',
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number];

const LEGACY_REASONS: Record<string, ReturnReason> = {
  DAMAGE: 'BREAKAGE',
  EXCESS: 'EXCESS_SUPPLY',
};

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  EXPIRY: 'Expired',
  NEAR_EXPIRY: 'Near expiry',
  BREAKAGE: 'Breakage',
  WRONG_ITEM: 'Wrong item supplied',
  EXCESS_SUPPLY: 'Excess supply',
  OTHER: 'Other',
};

export function returnReasonOf(value: unknown): ReturnReason | null {
  const text = String(value ?? '').trim().toUpperCase();
  if ((RETURN_REASONS as readonly string[]).includes(text)) return text as ReturnReason;
  return LEGACY_REASONS[text] ?? null;
}

export const CREDIT_NOTE_NUMBER_MAX = 50;

export const creditNoteNumberOf = (value: unknown) =>
  String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

const CREDIT_NOTE_INDEX = 'inventory_supplier_credits_open_credit_note_key';

export function isCreditNoteNumberClash(error: unknown) {
  const failure = error as { code?: string; meta?: { target?: unknown } } | null;
  if (failure?.code !== 'P2002') return false;
  const target = failure.meta?.target;
  return target === CREDIT_NOTE_INDEX || (Array.isArray(target) && target.includes('creditNoteNumber'));
}

const rupeeFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
export const rupees = (value: number) => rupeeFormat.format(value);
export const displayDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

export const supplierReturnReason = (payload: unknown): ReturnReason | null => {
  const source = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  return returnReasonOf(source.returnReason ?? source.returnType);
};

export function returnMovementReason(payload: { returnReason?: unknown; reason?: unknown }) {
  const reason = supplierReturnReason(payload);
  const note = String(payload.reason ?? '').trim();
  return [reason && RETURN_REASON_LABELS[reason], note].filter(Boolean).join(' · ');
}
