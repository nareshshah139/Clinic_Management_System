import {
  TimeOffRow,
  WeeklyHoursRow,
  istClock,
  parseWeeklyHoursInput,
  resolveDayAvailability,
  resolveWeeklyHours,
  timeOffOverlappingSlot,
} from './availability';

// 2026-11-09 is a Monday.
const MONDAY = '2026-11-09';
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const off = (
  kind: TimeOffRow['kind'],
  startsAt: Date,
  endsAt: Date,
  reason: string | null = null,
): TimeOffRow => ({ id: `${kind}-${startsAt.toISOString()}`, kind, startsAt, endsAt, reason });
const row = (weekday: number, start: number, end: number): WeeklyHoursRow => ({
  weekday,
  startMinute: start * 60,
  endMinute: end * 60,
});
const h = (start: number, end: number) => ({ start: start * 60, end: end * 60 });

describe('resolveWeeklyHours', () => {
  it.each([
    {
      name: 'defaults to 09:00-18:00 with no rows and no metadata',
      rows: [],
      metadata: null,
      source: 'default',
      monday: [h(9, 18)],
    },
    {
      name: 'defaults when metadata has no workingHours',
      rows: [],
      metadata: '{"whatsappAutoConfirmAppointments":true}',
      source: 'default',
      monday: [h(9, 18)],
    },
    {
      name: 'defaults when metadata is not valid JSON',
      rows: [],
      metadata: '{not json',
      source: 'default',
      monday: [h(9, 18)],
    },
    {
      name: 'reads legacy start/end from a JSON string',
      rows: [],
      metadata: JSON.stringify({ workingHours: { startHour: 10, endHour: 14 } }),
      source: 'legacy',
      monday: [h(10, 14)],
    },
    {
      name: 'applies legacy byDay overrides field by field',
      rows: [],
      metadata: { workingHours: { startHour: 10, endHour: 14, byDay: { mon: { endHour: 20 } } } },
      source: 'legacy',
      monday: [h(10, 20)],
    },
    {
      name: 'fills a missing legacy field with the default',
      rows: [],
      metadata: { workingHours: { startHour: 11 } },
      source: 'legacy',
      monday: [h(11, 18)],
    },
    {
      name: 'clamps legacy end to at least an hour after start, as before',
      rows: [],
      metadata: { workingHours: { startHour: 15, endHour: 12 } },
      source: 'legacy',
      monday: [h(15, 16)],
    },
    {
      name: 'prefers configured rows over legacy metadata',
      rows: [row(1, 8, 12)],
      metadata: { workingHours: { startHour: 10, endHour: 14 } },
      source: 'configured',
      monday: [h(8, 12)],
    },
    {
      name: 'treats a weekday without configured rows as a day off',
      rows: [row(2, 9, 17)],
      metadata: { workingHours: { startHour: 10, endHour: 14 } },
      source: 'configured',
      monday: [],
    },
    {
      name: 'keeps split shifts in order',
      rows: [row(1, 14, 18), row(1, 9, 13)],
      metadata: null,
      source: 'configured',
      monday: [h(9, 13), h(14, 18)],
    },
  ])('$name', ({ rows, metadata, source, monday }) => {
    const day = resolveDayAvailability(MONDAY, resolveWeeklyHours(rows, metadata), []);
    expect(day.source).toBe(source);
    expect(day.weekday).toBe(1);
    expect(day.working).toEqual(monday);
    expect(day.intervals).toEqual(monday);
  });
});

describe('resolveDayAvailability with time off', () => {
  const weekly = resolveWeeklyHours([row(1, 9, 13), row(1, 14, 18)], null);

  it.each([
    {
      name: 'full-day leave removes every interval',
      timeOff: [off('LEAVE', ist(MONDAY, '00:00'), ist('2026-11-10', '00:00'), 'Conference')],
      intervals: [],
      blocked: [{ start: 0, end: 1440, kind: 'LEAVE', reason: 'Conference' }],
    },
    {
      name: 'multi-day leave is clipped to the IST day',
      timeOff: [off('LEAVE', ist('2026-11-07', '00:00'), ist('2026-11-12', '00:00'))],
      intervals: [],
      blocked: [{ start: 0, end: 1440, kind: 'LEAVE', reason: null }],
    },
    {
      name: 'a partial block splits a shift',
      timeOff: [off('BLOCKED', ist(MONDAY, '10:00'), ist(MONDAY, '11:30'), 'Rounds')],
      intervals: [h(9, 10), { start: 690, end: 780 }, h(14, 18)],
      blocked: [{ start: 600, end: 690, kind: 'BLOCKED', reason: 'Rounds' }],
    },
    {
      name: 'a branch holiday blocks the whole day',
      timeOff: [off('HOLIDAY', ist(MONDAY, '00:00'), ist('2026-11-10', '00:00'), 'Diwali')],
      intervals: [],
      blocked: [{ start: 0, end: 1440, kind: 'HOLIDAY', reason: 'Diwali' }],
    },
    {
      name: 'time off ending exactly at IST midnight does not touch the next day',
      timeOff: [off('LEAVE', ist('2026-11-08', '00:00'), ist(MONDAY, '00:00'))],
      intervals: [h(9, 13), h(14, 18)],
      blocked: [],
    },
    {
      name: 'time off spilling past IST midnight into the morning is clipped',
      timeOff: [off('BLOCKED', ist('2026-11-08', '22:00'), ist(MONDAY, '09:30'))],
      intervals: [{ start: 570, end: 780 }, h(14, 18)],
      blocked: [{ start: 0, end: 570, kind: 'BLOCKED', reason: null }],
    },
    {
      name: 'a block during lunch leaves shifts intact',
      timeOff: [off('BLOCKED', ist(MONDAY, '13:00'), ist(MONDAY, '14:00'))],
      intervals: [h(9, 13), h(14, 18)],
      blocked: [{ start: 780, end: 840, kind: 'BLOCKED', reason: null }],
    },
  ])('$name', ({ timeOff, intervals, blocked }) => {
    const day = resolveDayAvailability(MONDAY, weekly, timeOff);
    expect(day.working).toEqual([h(9, 13), h(14, 18)]);
    expect(day.intervals).toEqual(intervals);
    expect(day.blocked.map(({ id: _id, ...b }) => b)).toEqual(blocked);
  });

  it('resolves the weekday from the IST calendar date, not the UTC instant', () => {
    // 2026-11-08 18:30Z is already Monday in IST.
    const sundayOnly = resolveWeeklyHours([row(0, 9, 12)], null);
    expect(resolveDayAvailability('2026-11-08', sundayOnly, []).working).toEqual([h(9, 12)]);
    expect(resolveDayAvailability(MONDAY, sundayOnly, []).working).toEqual([]);
  });
});

describe('timeOffOverlappingSlot', () => {
  const block = off('BLOCKED', ist(MONDAY, '10:00'), ist(MONDAY, '11:00'), 'Rounds');

  it.each([
    ['09:30-10:00', false],
    ['09:45-10:15', true],
    ['10:30-10:45', true],
    ['11:00-11:30', false],
  ])('slot %s overlaps: %s', (slot, expected) => {
    expect(Boolean(timeOffOverlappingSlot(MONDAY, slot, [block]))).toBe(expected);
  });

  it('ignores time off on another day', () => {
    expect(timeOffOverlappingSlot('2026-11-10', '10:00-10:30', [block])).toBeUndefined();
  });
});

describe('parseWeeklyHoursInput', () => {
  it('converts HH:MM to minutes and sorts', () => {
    expect(
      parseWeeklyHoursInput([
        { weekday: 1, start: '14:00', end: '18:00' },
        { weekday: 1, start: '09:00', end: '13:00' },
        { weekday: 0, start: '10:00', end: '24:00' },
      ]),
    ).toEqual({
      rows: [
        { weekday: 0, startMinute: 600, endMinute: 1440 },
        { weekday: 1, startMinute: 540, endMinute: 780 },
        { weekday: 1, startMinute: 840, endMinute: 1080 },
      ],
    });
  });

  it.each([
    [[{ weekday: 1, start: '10:00', end: '10:00' }], /must end after/],
    [[{ weekday: 1, start: '12:00', end: '09:00' }], /must end after/],
    [[{ weekday: 7, start: '09:00', end: '10:00' }], /Invalid weekday/],
    [[{ weekday: 1, start: '9:00', end: '10:00' }], /HH:MM/],
    [[{ weekday: 1, start: '09:00', end: '24:30' }], /HH:MM/],
    [
      [
        { weekday: 1, start: '09:00', end: '13:00' },
        { weekday: 1, start: '12:30', end: '15:00' },
      ],
      /overlap on mon/,
    ],
  ])('rejects %j', (input, message) => {
    const result = parseWeeklyHoursInput(input);
    expect('error' in result && result.error).toMatch(message);
  });

  it('allows back-to-back shifts and the same times on different days', () => {
    expect(
      parseWeeklyHoursInput([
        { weekday: 1, start: '09:00', end: '13:00' },
        { weekday: 1, start: '13:00', end: '15:00' },
        { weekday: 2, start: '09:00', end: '13:00' },
      ]),
    ).toHaveProperty('rows');
  });
});

describe('istClock', () => {
  it('reports the IST date and minutes regardless of server timezone', () => {
    expect(istClock(new Date('2026-11-08T19:00:00Z'))).toEqual({ date: MONDAY, minutes: 30 });
    expect(istClock(new Date('2026-11-09T12:00:00Z'))).toEqual({ date: MONDAY, minutes: 17 * 60 + 30 });
  });
});
