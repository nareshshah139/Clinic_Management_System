export type PrescriptionField = 'frequency' | 'dosageUnit' | 'durationUnit' | 'route';

const labels: Record<PrescriptionField, Readonly<Record<string, string>>> = {
  frequency: {
    ONCE_DAILY: 'Once daily', TWICE_DAILY: 'Twice daily', THREE_TIMES_DAILY: 'Three times daily',
    FOUR_TIMES_DAILY: 'Four times daily', EVERY_4_HOURS: 'Every 4 hours', EVERY_6_HOURS: 'Every 6 hours',
    EVERY_8_HOURS: 'Every 8 hours', EVERY_12_HOURS: 'Every 12 hours', AS_NEEDED: 'As needed',
    WEEKLY: 'Weekly', MONTHLY: 'Monthly',
  },
  dosageUnit: {
    MG: 'mg', ML: 'ml', MCG: 'mcg', IU: 'IU', G: 'g', TABLET: 'tablet', CAPSULE: 'capsule',
    DROP: 'drop', DROPS: 'drops', SPRAY: 'spray', PATCH: 'patch', INJECTION: 'injection',
  },
  durationUnit: { DAYS: 'days', WEEKS: 'weeks', MONTHS: 'months', YEARS: 'years' },
  route: {
    ORAL: 'Oral', TOPICAL: 'Topical', IV: 'IV', IM: 'IM', SC: 'Subcutaneous', INTRALESIONAL: 'Intralesional',
    INHALATION: 'Inhalation', NASAL: 'Nasal', OPHTHALMIC: 'Eye', OTIC: 'Ear', SUBLINGUAL: 'Sublingual',
  },
};

/**
 * Human label for a stored prescription code; custom codes such as ALTERNATE_DAYS read as "Alternate days".
 * Dose patterns ("1-0-1", "stat") are not codes and keep their clinical upper-case shorthand.
 */
export function prescriptionLabel(field: PrescriptionField, value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const known = labels[field][raw.toUpperCase()];
  if (known) return known;
  if (!/^[A-Z0-9_]+$/.test(raw) || !/[A-Z]/.test(raw)) return field === 'frequency' ? raw.toUpperCase() : raw;
  const words = raw.toLowerCase().replace(/_+/g, ' ');
  return field === 'frequency' || field === 'route' ? words.charAt(0).toUpperCase() + words.slice(1) : words;
}

export const FREQUENCY_CODES = Object.keys(labels.frequency);

const plurals: Readonly<Record<string, string>> = {
  tablet: 'tablets', capsule: 'capsules', drop: 'drops', spray: 'sprays', patch: 'patches', injection: 'injections',
  day: 'days', week: 'weeks', month: 'months', year: 'years',
};
const singulars = Object.fromEntries(Object.entries(plurals).map(([one, many]) => [many, one]));

/** "1 CAPSULE" parts read "1 capsule", "1 DAYS" reads "1 day"; a unit with no amount reads as nothing. */
export function prescriptionAmount(unitField: 'dosageUnit' | 'durationUnit', amount: unknown, unit: unknown): string {
  const count = String(amount ?? '').trim();
  if (!count) return '';
  const label = prescriptionLabel(unitField, unit);
  const one = singulars[label] ?? label;
  return `${count} ${plurals[one] && Number(count) !== 1 ? plurals[one] : one}`.trim();
}

export function isPrescriptionField(key: string): key is PrescriptionField {
  return key in labels;
}
