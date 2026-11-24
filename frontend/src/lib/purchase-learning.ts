export type LearnedField = 'product' | 'manufacturer' | 'distributorName';

export type LearnedCorrection = {
  field: LearnedField;
  from: string;
  to: string;
  support: number;
  tier: 'SUGGEST' | 'APPLY' | 'TRUSTED';
};

const LEARNED_FIELDS: Record<LearnedField, { formKey: 'productName' | 'manufacturer' | 'distributorName'; flag: string }> = {
  product: { formKey: 'productName', flag: 'learned_product_needs_confirmation' },
  manufacturer: { formKey: 'manufacturer', flag: 'learned_manufacturer_needs_confirmation' },
  distributorName: { formKey: 'distributorName', flag: 'learned_distributor_needs_confirmation' },
};

export function learnedFormKey(field: LearnedField) {
  return LEARNED_FIELDS[field].formKey;
}

export function parseLearnedCorrections(value: unknown): LearnedCorrection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): LearnedCorrection[] => {
    const item = entry as Partial<LearnedCorrection> | null;
    if (!item || !(item.field! in LEARNED_FIELDS) || typeof item.from !== 'string' || typeof item.to !== 'string') return [];
    return [{ field: item.field!, from: item.from, to: item.to, support: Number(item.support) || 0, tier: item.tier || 'APPLY' }];
  });
}

export function learnedChipText(correction: LearnedCorrection) {
  const base = `Learned: '${correction.from}' → ${correction.to}`;
  return correction.support > 0 ? `${base} · chosen ${correction.support}× for this supplier` : base;
}

export function isLearnedFlag(flag: string, field: LearnedField) {
  return flag.trim().toLowerCase().endsWith(LEARNED_FIELDS[field].flag);
}

export function withoutLearnedFlag(flags: string, field: LearnedField) {
  return flags.split(',').map(part => part.trim()).filter(part => part && !isLearnedFlag(part, field)).join(', ');
}

export function serializeLearnedCorrections(corrections: LearnedCorrection[]) {
  return corrections.length ? JSON.stringify(corrections) : undefined;
}

export function readLearnedCorrections(serialized?: string): LearnedCorrection[] {
  if (!serialized) return [];
  try {
    return parseLearnedCorrections(JSON.parse(serialized));
  } catch {
    return [];
  }
}

/**
 * Undo restores the value the OCR read and drops the learned confirmation flag. The caller still
 * owns the invoice: this never touches amounts, batch or any other field. Line forms keep every
 * value as a string, so the remaining corrections stay serialized.
 */
export function undoLearnedCorrection<T extends { learnedCorrections?: string }>(
  row: T & Record<string, unknown>, correction: LearnedCorrection, flagsKey: string,
): T {
  return {
    ...row,
    [learnedFormKey(correction.field)]: correction.from,
    [flagsKey]: withoutLearnedFlag(String(row[flagsKey] ?? ''), correction.field),
    learnedCorrections: serializeLearnedCorrections(readLearnedCorrections(row.learnedCorrections).filter(entry => entry.field !== correction.field)),
  };
}
