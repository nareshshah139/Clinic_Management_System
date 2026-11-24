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

export type LearningWeek = { weekStart: string; lines: number; touches: number; per100: number | null };

export type LearningLesson = {
  key: string;
  field: LearnedField;
  from: string;
  to: string;
  tier: LearnedCorrection['tier'];
  reviews: number;
};

const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? value as Record<string, unknown> : {});
const finite = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

export function parseLearningWeeks(response: unknown): LearningWeek[] {
  const weeks = record(response).weeks;
  if (!Array.isArray(weeks)) return [];
  return weeks.flatMap((entry): LearningWeek[] => {
    const week = record(entry);
    if (typeof week.weekStart !== 'string') return [];
    const lines = finite(week.lines) ?? 0;
    const touches = finite(week.reviewerTouches) ?? 0;
    const per100 = finite(week.touchesPer100Lines) ?? (lines > 0 ? (touches / lines) * 100 : null);
    return [{ weekStart: week.weekStart, lines, touches, per100 }];
  });
}

export function parseLearningLessons(response: unknown): LearningLesson[] {
  const list = Array.isArray(response) ? response : record(response).lessons;
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry): LearningLesson[] => {
    const lesson = record(entry);
    const field = lesson.field as LearnedField;
    if (typeof lesson.key !== 'string' || !(field in LEARNED_FIELDS) || typeof lesson.finalValue !== 'string') return [];
    const rawKey = typeof lesson.rawKey === 'string' ? lesson.rawKey.split('|')[0] : '';
    const from = typeof lesson.rawValue === 'string' && lesson.rawValue ? lesson.rawValue : rawKey;
    const tier = lesson.tier === 'TRUSTED' || lesson.tier === 'SUGGEST' ? lesson.tier : 'APPLY';
    return [{ key: lesson.key, field, from, to: lesson.finalValue, tier, reviews: finite(lesson.independent) ?? 0 }];
  });
}

export const activeLessonCount = (lessons: LearningLesson[]) => lessons.filter(lesson => lesson.tier !== 'SUGGEST').length;

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
