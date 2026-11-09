import {
  DOSE_PATTERN_OPTIONS,
  inferFrequencyFromDosePattern,
  inferTimingFromDosePattern,
} from '@/lib/frequency';

describe('dose-pattern-presets-infer-daily-count', () => {
  const expected: Record<(typeof DOSE_PATTERN_OPTIONS)[number], string> = {
    '1-0-0': 'ONCE_DAILY',
    '0-1-0': 'ONCE_DAILY',
    '0-0-1': 'ONCE_DAILY',
    '1-1-0': 'TWICE_DAILY',
    '1-0-1': 'TWICE_DAILY',
    '0-1-1': 'TWICE_DAILY',
    '1-1-1': 'THREE_TIMES_DAILY',
    '2-0-2': 'TWICE_DAILY',
    q4h: 'EVERY_4_HOURS',
    q6h: 'EVERY_6_HOURS',
    q8h: 'EVERY_8_HOURS',
    q12h: 'EVERY_12_HOURS',
    prn: 'AS_NEEDED',
  };

  it('has an expectation for every preset the picker offers', () => {
    expect(Object.keys(expected).sort()).toEqual([...DOSE_PATTERN_OPTIONS].sort());
  });

  it.each(DOSE_PATTERN_OPTIONS.map((p) => [p, expected[p]]))('preset %s infers %s', (preset, freq) => {
    expect(inferFrequencyFromDosePattern(preset)).toBe(freq);
  });

  it('counts non-zero slots, not dose size', () => {
    expect(inferFrequencyFromDosePattern('2-0-2')).toBe('TWICE_DAILY');
    expect(inferFrequencyFromDosePattern('1-1-1-1')).toBe('FOUR_TIMES_DAILY');
    expect(inferFrequencyFromDosePattern('1-1-1-1-1')).toBe('FOUR_TIMES_DAILY');
  });
});

describe('unknown-dose-text-never-becomes-a-frequency', () => {
  it.each([
    ['od', 'ONCE_DAILY'],
    ['qd', 'ONCE_DAILY'],
    ['once', 'ONCE_DAILY'],
    ['hs', 'ONCE_DAILY'],
    ['qhs', 'ONCE_DAILY'],
    ['bd', 'TWICE_DAILY'],
    ['bid', 'TWICE_DAILY'],
    ['twice', 'TWICE_DAILY'],
    ['tid', 'THREE_TIMES_DAILY'],
    ['thrice', 'THREE_TIMES_DAILY'],
    ['qid', 'FOUR_TIMES_DAILY'],
    ['q4h', 'EVERY_4_HOURS'],
    ['every 4 hours', 'EVERY_4_HOURS'],
    ['q6h', 'EVERY_6_HOURS'],
    ['every 6 hours', 'EVERY_6_HOURS'],
    ['q8h', 'EVERY_8_HOURS'],
    ['every 8 hours', 'EVERY_8_HOURS'],
    ['q12h', 'EVERY_12_HOURS'],
    ['every 12 hours', 'EVERY_12_HOURS'],
    ['prn', 'AS_NEEDED'],
  ])('known code %s maps to %s', (code, freq) => {
    expect(inferFrequencyFromDosePattern(code)).toBe(freq);
  });

  it.each([
    ['OD', 'ONCE_DAILY'],
    ['Bd', 'TWICE_DAILY'],
    ['QID', 'FOUR_TIMES_DAILY'],
    ['PRN', 'AS_NEEDED'],
    ['  bd  ', 'TWICE_DAILY'],
    ['\tTID\n', 'THREE_TIMES_DAILY'],
    ['Q8H', 'EVERY_8_HOURS'],
    ['  Every 12 Hours ', 'EVERY_12_HOURS'],
  ])('case and outer spacing variant %j maps to %s', (code, freq) => {
    expect(inferFrequencyFromDosePattern(code)).toBe(freq);
  });

  it.each(['', '   ', null, undefined, '0-0-0', '0'])('blank or all-zero input %j returns null', (input) => {
    expect(inferFrequencyFromDosePattern(input as string)).toBeNull();
  });

  it.each(['tds', 'TDS', 'sos', 'SOS', 'stat', 'weekly', 'with food', 'abc'])(
    'text without digits that is not a known code (%s) returns null',
    (input) => {
      expect(inferFrequencyFromDosePattern(input)).toBeNull();
    },
  );

  it.failing.each(['q3h', 'every 5 hours', 'q2h', '1.5-0-1', 'twice a day 2 weeks'])(
    'target: unknown text with digits (%s) returns null',
    (input) => {
      expect(inferFrequencyFromDosePattern(input)).toBeNull();
    },
  );
});

describe('timing-inferred-only-from-single-slot-patterns', () => {
  it.each([
    ['1-0-0', 'AM'],
    ['2-0-0', 'AM'],
    ['0-1-0', 'PM'],
    ['0-0-1', 'PM'],
    ['0-0-2', 'PM'],
  ])('single-slot pattern %s infers %s', (pattern, timing) => {
    expect(inferTimingFromDosePattern(pattern)).toBe(timing);
  });

  it.each(['1-0-1', '1-1-0', '0-1-1', '1-1-1', '0-0-0', 'od', 'bd', 'prn', 'q6h', '1-0', '', '  ', null, undefined])(
    'multi-dose, empty or unrecognised %j returns null',
    (pattern) => {
      expect(inferTimingFromDosePattern(pattern as string)).toBeNull();
    },
  );
});
