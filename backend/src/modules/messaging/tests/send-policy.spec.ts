import { inSendWindow, kolkataDay, nextDayWindowStart, nextWindowStart } from '../send-policy';

const ist = (s: string) => new Date(`${s}+05:30`);

describe('send window and Kolkata day (PP-14, PP-15)', () => {
  it('allows 09:00 to 19:59 Kolkata and refuses 20:00 to 08:59', () => {
    expect(inSendWindow(ist('2026-11-24T08:59:59'))).toBe(false);
    expect(inSendWindow(ist('2026-11-24T09:00:00'))).toBe(true);
    expect(inSendWindow(ist('2026-11-24T19:59:59'))).toBe(true);
    expect(inSendWindow(ist('2026-11-24T20:00:00'))).toBe(false);
  });

  it('defers a late-night message to 09:00 the next Kolkata morning and an early one to 09:00 the same day', () => {
    expect(nextWindowStart(ist('2026-11-24T21:30:00')).toISOString()).toBe(ist('2026-11-25T09:00:00').toISOString());
    expect(nextWindowStart(ist('2026-11-24T06:00:00')).toISOString()).toBe(ist('2026-11-24T09:00:00').toISOString());
    expect(nextDayWindowStart(ist('2026-11-24T10:00:00')).toISOString()).toBe(ist('2026-11-25T09:00:00').toISOString());
  });

  it('counts the day in Kolkata, not UTC', () => {
    expect(kolkataDay(new Date('2026-11-24T19:00:00Z'))).toBe('2026-11-25');
    expect(kolkataDay(new Date('2026-11-24T18:29:00Z'))).toBe('2026-11-24');
  });
});
