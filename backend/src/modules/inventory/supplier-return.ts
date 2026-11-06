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
