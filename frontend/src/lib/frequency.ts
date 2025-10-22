// Centralized frequency and dose pattern options for reuse across UI modules

export const FREQUENCY_OPTIONS = [
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

export type FrequencyOption = typeof FREQUENCY_OPTIONS[number];

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


