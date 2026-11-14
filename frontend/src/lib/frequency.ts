// Centralized frequency and dose pattern options for reuse across UI modules

export const DEFAULT_FREQUENCY_OPTIONS = [
  'ONCE_DAILY',
  'TWICE_DAILY',
  'THREE_TIMES_DAILY',
  'FOUR_TIMES_DAILY',
  'EVERY_4_HOURS',
  'EVERY_6_HOURS',
  'EVERY_8_HOURS',
  'EVERY_12_HOURS',
  'AS_NEEDED',
  'WEEKLY',
  'MONTHLY',
] as const;

/** @deprecated Use DEFAULT_FREQUENCY_OPTIONS + custom frequencies via getFrequencyOptions() */
export const FREQUENCY_OPTIONS = DEFAULT_FREQUENCY_OPTIONS;

export type FrequencyOption = typeof DEFAULT_FREQUENCY_OPTIONS[number] | string;

// ---------------------------------------------------------------------------
// Generic localStorage-backed custom option helpers
// ---------------------------------------------------------------------------

function getCustomOptions(storageKey: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addCustomOption(
  storageKey: string,
  value: string,
  defaults: readonly string[],
  normalize: (v: string) => string = (v) => v.trim().toUpperCase().replace(/\s+/g, '_'),
): string[] {
  const normalized = normalize(value);
  if (!normalized) return getCustomOptions(storageKey);
  const existing = getCustomOptions(storageKey);
  if (
    (defaults as readonly string[]).includes(normalized) ||
    existing.includes(normalized)
  ) {
    return existing;
  }
  const updated = [...existing, normalized];
  localStorage.setItem(storageKey, JSON.stringify(updated));
  return updated;
}

// ---------------------------------------------------------------------------
// Frequency
// ---------------------------------------------------------------------------

const CUSTOM_FREQ_STORAGE_KEY = 'clinic_custom_frequencies';

export function getCustomFrequencies(): string[] {
  return getCustomOptions(CUSTOM_FREQ_STORAGE_KEY);
}

export function addCustomFrequency(freq: string): string[] {
  return addCustomOption(CUSTOM_FREQ_STORAGE_KEY, freq, DEFAULT_FREQUENCY_OPTIONS);
}

export function getAllFrequencyOptions(): string[] {
  return [...DEFAULT_FREQUENCY_OPTIONS, ...getCustomFrequencies()];
}

const FREQUENCY_LABELS: Record<string, string> = {
  ONCE_DAILY: 'Once a day',
  TWICE_DAILY: 'Twice a day',
  THREE_TIMES_DAILY: 'Three times a day',
  FOUR_TIMES_DAILY: 'Four times a day',
  EVERY_4_HOURS: 'Every 4 hours',
  EVERY_6_HOURS: 'Every 6 hours',
  EVERY_8_HOURS: 'Every 8 hours',
  EVERY_12_HOURS: 'Every 12 hours',
  AS_NEEDED: 'When needed',
  WEEKLY: 'Once a week',
  MONTHLY: 'Once a month',
};

/** Words a doctor reads for a stored frequency code or dose pattern. Display only: stored and printed values keep their codes. */
export function frequencyLabel(value: string): string {
  if (FREQUENCY_LABELS[value]) return FREQUENCY_LABELS[value];
  if (/^[A-Z0-9]+(_[A-Z0-9]+)+$/.test(value)) {
    const words = value.replaceAll('_', ' ').toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return value.toUpperCase();
}

// ---------------------------------------------------------------------------
// Timing / When
// ---------------------------------------------------------------------------

const ALL_TIMING_OPTIONS = [
  'AM', 'PM',
  'After Breakfast', 'After Lunch', 'After Dinner',
  'Before Meals', 'QHS', 'HS', 'With Food', 'Empty Stomach',
] as const;

const CUSTOM_TIMING_STORAGE_KEY = 'clinic_custom_timings';

export function getCustomTimings(): string[] {
  return getCustomOptions(CUSTOM_TIMING_STORAGE_KEY);
}

export function addCustomTiming(timing: string): string[] {
  return addCustomOption(
    CUSTOM_TIMING_STORAGE_KEY,
    timing,
    ALL_TIMING_OPTIONS as unknown as readonly string[],
    (v) => v.trim(),
  );
}

export function getAllTimingOptions(): string[] {
  return [...ALL_TIMING_OPTIONS, ...getCustomTimings()];
}

/**
 * Returns appropriate timing/when options for a given frequency.
 * - ONCE_DAILY / TWICE_DAILY / WEEKLY / MONTHLY: no AM/PM (those imply
 *   a full-day schedule, not a specific half of day)
 * - Hourly intervals: all options
 * - AS_NEEDED: all options
 * Custom timings are always included.
 */
export function getTimingOptionsForFrequency(frequency: string): string[] {
  const f = (frequency || '').toUpperCase();
  const custom = getCustomTimings();
  switch (f) {
    case 'ONCE_DAILY':
    case 'TWICE_DAILY':
    case 'WEEKLY':
    case 'MONTHLY': {
      const base = (ALL_TIMING_OPTIONS as unknown as string[]).filter((t) => t !== 'AM' && t !== 'PM');
      return [...base, ...custom];
    }
    default:
      return [...ALL_TIMING_OPTIONS, ...custom];
  }
}

export const TIMING_OPTIONS = [...ALL_TIMING_OPTIONS] as string[];

// ---------------------------------------------------------------------------
// Dose Pattern
// ---------------------------------------------------------------------------

const CUSTOM_DOSE_PATTERN_STORAGE_KEY = 'clinic_custom_dose_patterns';

export function getCustomDosePatterns(): string[] {
  return getCustomOptions(CUSTOM_DOSE_PATTERN_STORAGE_KEY);
}

export function addCustomDosePattern(pattern: string): string[] {
  return addCustomOption(
    CUSTOM_DOSE_PATTERN_STORAGE_KEY,
    pattern,
    DOSE_PATTERN_OPTIONS as unknown as readonly string[],
    (v) => v.trim().toLowerCase(),
  );
}

export function getAllDosePatternOptions(): string[] {
  return [...DOSE_PATTERN_OPTIONS, ...getCustomDosePatterns()];
}

// ---------------------------------------------------------------------------
// Duration Unit
// ---------------------------------------------------------------------------

export const DEFAULT_DURATION_UNITS = ['DAYS', 'WEEKS', 'MONTHS', 'YEARS'] as const;

const CUSTOM_DURATION_UNIT_STORAGE_KEY = 'clinic_custom_duration_units';

export function getCustomDurationUnits(): string[] {
  return getCustomOptions(CUSTOM_DURATION_UNIT_STORAGE_KEY);
}

export function addCustomDurationUnit(unit: string): string[] {
  return addCustomOption(CUSTOM_DURATION_UNIT_STORAGE_KEY, unit, DEFAULT_DURATION_UNITS);
}

export function getAllDurationUnitOptions(): string[] {
  return [...DEFAULT_DURATION_UNITS, ...getCustomDurationUnits()];
}

/**
 * @cc [owner:nareshshah139,label:safety] dose-pattern-presets-infer-daily-count
 * Every preset offered in the prescription dose-pattern picker MUST infer the frequency whose
 * daily count equals its meaning (n non-zero slots is n doses a day, qNh is every N hours,
 * prn is as needed), so picking a preset never writes a different dosing frequency.
 */
export const DOSE_PATTERN_OPTIONS = [
  '1-0-0',
  '0-1-0',
  '0-0-1',
  '1-1-0',
  '1-0-1',
  '0-1-1',
  '1-1-1',
  '2-0-2',
  'q4h',
  'q6h',
  'q8h',
  'q12h',
  'prn',
] as const;

/**
 * @cc [owner:nareshshah139,label:safety;target] unknown-dose-text-never-becomes-a-frequency
 * Known codes (od, qd, hs, bd, bid, tid, qid, qNh, prn and the spelled-out forms) MUST map to their
 * exact frequency regardless of case and outer spacing, and blank or all-zero input MUST return null.
 * Text that is neither a known code nor an N-N-N slot pattern (tds, sos, q3h, every 5 hours, 1.5-0-1)
 * MUST return null so the doctor picks the frequency. This is a target obligation, not a pass claim:
 * any unknown text containing digits is counted as slots (q3h gives ONCE_DAILY).
 */
export function inferFrequencyFromDosePattern(pattern: string): FrequencyOption | null {
  const raw = (pattern || '').trim().toLowerCase();
  if (!raw) return null;

  const map: Record<string, FrequencyOption> = {
    od: 'ONCE_DAILY',
    qd: 'ONCE_DAILY',
    once: 'ONCE_DAILY',
    hs: 'ONCE_DAILY',
    qhs: 'ONCE_DAILY',
    bid: 'TWICE_DAILY',
    bd: 'TWICE_DAILY',
    twice: 'TWICE_DAILY',
    tid: 'THREE_TIMES_DAILY',
    thrice: 'THREE_TIMES_DAILY',
    qid: 'FOUR_TIMES_DAILY',
    q4h: 'EVERY_4_HOURS',
    'every 4 hours': 'EVERY_4_HOURS',
    q6h: 'EVERY_6_HOURS',
    'every 6 hours': 'EVERY_6_HOURS',
    q8h: 'EVERY_8_HOURS',
    'every 8 hours': 'EVERY_8_HOURS',
    q12h: 'EVERY_12_HOURS',
    'every 12 hours': 'EVERY_12_HOURS',
    prn: 'AS_NEEDED',
  };
  if (map[raw]) return map[raw];

  const tokens = raw.split(/[^0-9]+/).filter(Boolean);
  if (tokens.length > 0) {
    const doses = tokens
      .map((t) => Number(t))
      .filter((n) => !Number.isNaN(n) && Number.isFinite(n));
    if (doses.length > 0) {
      const total = doses.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
      if (total <= 0) return null;
      if (total === 1) return 'ONCE_DAILY';
      if (total === 2) return 'TWICE_DAILY';
      if (total === 3) return 'THREE_TIMES_DAILY';
      return 'FOUR_TIMES_DAILY';
    }
  }
  return null;
}

/**
 * @cc [owner:nareshshah139,label:safety] timing-inferred-only-from-single-slot-patterns
 * Timing MUST be inferred only when the first three numbers of the pattern have exactly one slot
 * non-zero (morning gives AM, afternoon or evening gives PM); every other input MUST return null
 * so a multi-dose or unrecognised pattern never gets a single-period timing.
 */
export function inferTimingFromDosePattern(pattern: string): string | null {
  const raw = (pattern || '').trim().toLowerCase();
  if (!raw) return null;

  // Try to infer AM/PM from simple 3-part patterns
  const tokens = raw.split(/[^0-9]+/).filter(Boolean);
  if (tokens.length >= 3) {
    const [m, a, e] = tokens.slice(0, 3).map((t) => Number(t));
    if (Number.isFinite(m) && Number.isFinite(a) && Number.isFinite(e)) {
      if ((m > 0) && a === 0 && e === 0) return 'AM';
      if (m === 0 && (a > 0) && e === 0) return 'PM';
      if (m === 0 && a === 0 && (e > 0)) return 'PM';
    }
  }
  return null;
}


