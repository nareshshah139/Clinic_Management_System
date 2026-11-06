import { addDays, financialYear, formatDisplayDay, isDay, parseDisplayDay, rangeError, rangePresets } from '@/lib/date-ranges';
import { displayClinicDateTimeCompact } from '@/lib/date-display';

it('names and bounds every preset from the clinic day', () => {
  expect(rangePresets('2026-11-06').map(({ label, range }) => [label, range.from, range.to])).toEqual([
    ['Today', '2026-11-06', '2026-11-06'],
    ['Yesterday', '2026-11-05', '2026-11-05'],
    ['Last 7 days', '2026-10-31', '2026-11-06'],
    ['This month', '2026-11-01', '2026-11-30'],
    ['FY 2026-27', '2026-04-01', '2027-03-31'],
    ['FY 2025-26', '2025-04-01', '2026-03-31'],
  ]);
});

it('puts January to March in the financial year that began the April before', () => {
  expect(financialYear('2027-02-10')).toEqual({ from: '2026-04-01', to: '2027-03-31' });
  expect(financialYear('2026-04-01')).toEqual({ from: '2026-04-01', to: '2027-03-31' });
  expect(rangePresets('2027-03-01').slice(4).map((p) => p.label)).toEqual(['FY 2026-27', 'FY 2025-26']);
  expect(rangePresets('2027-03-01')[3].range).toEqual({ from: '2027-03-01', to: '2027-03-31' });
});

it('crosses month and year ends when stepping days', () => {
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
});

it('reads dd/mm/yyyy as the Indian staff type it and rejects impossible or pre-2000 days', () => {
  expect(parseDisplayDay('6/4/2026')).toBe('2026-04-06');
  expect(parseDisplayDay(' 31-03-2027 ')).toBe('2027-03-31');
  expect(parseDisplayDay('01.04.2026')).toBe('2026-04-01');
  expect(parseDisplayDay('01042026')).toBe('2026-04-01');
  expect(parseDisplayDay('31/02/2026')).toBeNull();
  expect(parseDisplayDay('01/04/0202')).toBeNull();
  expect(parseDisplayDay('04/01/1999')).toBeNull();
  expect(parseDisplayDay('2026-04-01')).toBeNull();
  expect(formatDisplayDay('2026-04-01')).toBe('01/04/2026');
  expect(isDay('2024-02-29')).toBe(true);
  expect(isDay('1999-12-31')).toBe(false);
});

it('shows the entry time compactly and the year only outside the current one', () => {
  expect(displayClinicDateTimeCompact('2026-11-06T04:50:00.000Z', '2026-11-06')).toBe('06 Nov, 10:20 am');
  expect(displayClinicDateTimeCompact('2025-12-28T05:00:00.000Z', '2026-11-06')).toBe('28 Dec 2025, 10:30 am');
  expect(displayClinicDateTimeCompact('2026-12-31T19:00:00.000Z', '2027-01-15')).toBe('01 Jan, 12:30 am');
  expect(displayClinicDateTimeCompact('not a date', '2026-11-06')).toBe('—');
});

describe('rangeError', () => {
  it('accepts up to 400 days and names the first problem otherwise', () => {
    expect(rangeError({ from: '2026-04-01', to: '2027-03-31' })).toBeNull();
    expect(rangeError({ from: '2025-04-01', to: '2026-05-05' })).toBeNull();
    expect(rangeError({ from: '2025-04-01', to: '2026-05-06' })).toBe('Pick at most 400 days at a time.');
    expect(rangeError({ from: '2026-05-01', to: '2026-03-31' })).toBe('The From date is after the To date.');
  });
});
