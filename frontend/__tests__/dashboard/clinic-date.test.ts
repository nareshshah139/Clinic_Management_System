import { getISTDateString } from '@/lib/utils';

it.each([
  ['2026-11-04T18:29:59.000Z', '2026-11-04'],
  ['2026-11-04T18:30:00.000Z', '2026-11-05'],
  ['2026-12-31T18:30:00.000Z', '2027-01-01'],
  ['2011-12-29T18:30:00.000Z', '2011-12-30'],
])('returns the IST day for %s regardless of the host timezone', (instant, expected) => {
  expect(getISTDateString(new Date(instant))).toBe(expected);
});

it('uses the current instant when no date is supplied', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-04T20:00:00.000Z'));
  try {
    expect(getISTDateString()).toBe('2026-11-05');
  } finally {
    jest.useRealTimers();
  }
});
