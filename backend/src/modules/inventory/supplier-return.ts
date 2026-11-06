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
