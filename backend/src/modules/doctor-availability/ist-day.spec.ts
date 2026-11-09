import {
  TimeOffRow,
  istClock,
  istDayEnd,
  istDayStart,
  timeOffOverlappingSlot,
} from './availability';

const off = (
  startsAt: string,
  endsAt: string,
  kind: TimeOffRow['kind'] = 'LEAVE',
): TimeOffRow => ({
  id: `${kind}-${startsAt}`,
  kind,
  startsAt: new Date(startsAt),
  endsAt: new Date(endsAt),
  reason: null,
});

describe('ist-day-is-a-fixed-24-hour-window', () => {
  it.each([
    ['2026-11-09', '2026-11-08T18:30:00.000Z', '2026-11-09T18:30:00.000Z'],
    ['2026-01-01', '2025-12-31T18:30:00.000Z', '2026-01-01T18:30:00.000Z'],
    ['2028-02-29', '2028-02-28T18:30:00.000Z', '2028-02-29T18:30:00.000Z'],
    ['2026-03-08', '2026-03-07T18:30:00.000Z', '2026-03-08T18:30:00.000Z'],
    ['2026-10-25', '2026-10-24T18:30:00.000Z', '2026-10-25T18:30:00.000Z'],
  ])('%s runs %s to %s', (date, start, end) => {
    expect(istDayStart(date).toISOString()).toBe(start);
    expect(istDayEnd(date).toISOString()).toBe(end);
    expect(istDayEnd(date).getTime() - istDayStart(date).getTime()).toBe(
      24 * 3_600_000,
    );
  });

  it('consecutive days share a boundary with no gap or overlap', () => {
    expect(istDayEnd('2026-11-09').getTime()).toBe(
      istDayStart('2026-11-10').getTime(),
    );
  });
});

describe('ist-clock-maps-instants-to-clinic-date', () => {
  it.each([
    ['2026-11-08T18:29:59.999Z', '2026-11-08', 23 * 60 + 59],
    ['2026-11-08T18:30:00.000Z', '2026-11-09', 0],
    ['2026-11-08T18:30:00.001Z', '2026-11-09', 0],
    ['2026-11-09T00:00:00.000Z', '2026-11-09', 330],
    ['2026-11-09T12:00:00.000Z', '2026-11-09', 17 * 60 + 30],
    ['2026-12-31T18:30:00.000Z', '2027-01-01', 0],
    ['2026-12-31T18:29:00.000Z', '2026-12-31', 23 * 60 + 59],
    ['2028-02-28T18:30:00.000Z', '2028-02-29', 0],
  ])('%s is %s at minute %d', (instant, date, minutes) => {
    expect(istClock(new Date(instant))).toEqual({ date, minutes });
  });

  it('agrees with the day window at both edges', () => {
    for (const date of ['2026-11-09', '2026-12-31', '2028-02-29']) {
      expect(istClock(istDayStart(date))).toEqual({ date, minutes: 0 });
      expect(istClock(new Date(istDayEnd(date).getTime() - 1))).toEqual({
        date,
        minutes: 24 * 60 - 1,
      });
    }
  });
});

describe('time-off-is-clipped-to-the-ist-day', () => {
  it('blocks the last half hour of an IST day for leave that crosses IST midnight', () => {
    const leave = [off('2026-11-08T18:00:00.000Z', '2026-11-08T19:00:00.000Z')];
    expect(
      timeOffOverlappingSlot('2026-11-08', '23:30-24:00', leave),
    ).toMatchObject({ start: 1410, end: 1440 });
    expect(
      timeOffOverlappingSlot('2026-11-08', '23:00-23:30', leave),
    ).toBeUndefined();
    expect(
      timeOffOverlappingSlot('2026-11-09', '00:00-00:30', leave),
    ).toMatchObject({ start: 0, end: 30 });
    expect(
      timeOffOverlappingSlot('2026-11-09', '00:30-01:00', leave),
    ).toBeUndefined();
  });

  it('does not block a day that time off only touches', () => {
    const leave = [off('2026-11-08T12:00:00.000Z', '2026-11-08T18:30:00.000Z')];
    expect(
      timeOffOverlappingSlot('2026-11-09', '00:00-00:30', leave),
    ).toBeUndefined();
    expect(
      timeOffOverlappingSlot('2026-11-08', '23:30-24:00', leave),
    ).toMatchObject({ start: 1050, end: 1440 });
  });

  it('does not block a slot that ends exactly when time off starts or starts when it ends', () => {
    const leave = [off('2026-11-09T04:30:00.000Z', '2026-11-09T05:30:00.000Z')];
    expect(
      timeOffOverlappingSlot('2026-11-09', '09:30-10:00', leave),
    ).toBeUndefined();
    expect(
      timeOffOverlappingSlot('2026-11-09', '10:00-10:30', leave),
    ).toMatchObject({ start: 600, end: 660 });
    expect(
      timeOffOverlappingSlot('2026-11-09', '11:00-11:30', leave),
    ).toBeUndefined();
  });

  it('rounds a partial minute up so a sliver of time off still blocks', () => {
    const leave = [off('2026-11-08T18:00:00.000Z', '2026-11-08T18:30:00.001Z')];
    expect(
      timeOffOverlappingSlot('2026-11-09', '00:00-00:30', leave),
    ).toMatchObject({ start: 0, end: 1 });
  });

  it('blocks every day inside multi-day leave and none outside it', () => {
    const leave = [
      off('2026-11-08T18:30:00.000Z', '2026-11-11T18:30:00.000Z', 'HOLIDAY'),
    ];
    for (const date of ['2026-11-09', '2026-11-10', '2026-11-11']) {
      expect(timeOffOverlappingSlot(date, '12:00-12:30', leave)).toMatchObject({
        kind: 'HOLIDAY',
        start: 0,
        end: 1440,
      });
    }
    expect(
      timeOffOverlappingSlot('2026-11-08', '12:00-12:30', leave),
    ).toBeUndefined();
    expect(
      timeOffOverlappingSlot('2026-11-12', '12:00-12:30', leave),
    ).toBeUndefined();
  });

  it('returns nothing without time off', () => {
    expect(
      timeOffOverlappingSlot('2026-11-09', '12:00-12:30', []),
    ).toBeUndefined();
  });
});
