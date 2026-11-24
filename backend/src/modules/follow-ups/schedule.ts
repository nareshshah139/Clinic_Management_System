import { WINDOW_END_HOUR, WINDOW_START_HOUR, kolkataDay } from '../messaging/send-policy';

const DAY_MS = 24 * 3600 * 1000;
const IST_OFFSET_MS = 330 * 60 * 1000;

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function kolkataAt(day: string, hour: number): Date {
  return new Date(Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00.000Z`) - IST_OFFSET_MS);
}

/**
 * @cc [owner:nareshshah139,label:product] check-in-window
 * A check-in MUST open at 09:00 Asia/Kolkata on anchor + offsetDays and close at 20:00
 * Asia/Kolkata on the last day of its window (PP-30).
 */
export function checkInWindow(anchorDay: string, step: { offsetDays: number; windowDays: number }) {
  const due = addDays(anchorDay, step.offsetDays);
  return {
    opensAt: kolkataAt(due, WINDOW_START_HOUR),
    closesAt: kolkataAt(addDays(due, Math.max(1, step.windowDays) - 1), WINDOW_END_HOUR),
  };
}

/**
 * The close time for a check-in opened at `now`. Opened after its first send window ended, it
 * stays open until 20:00 on the first day whose 09:00 window it covers whole (PP-30).
 */
export function closeAfterOpening(opensAt: Date, closesAt: Date, now: Date): Date {
  if (now < kolkataAt(kolkataDay(opensAt), WINDOW_END_HOUR)) return closesAt;
  const today = kolkataDay(now);
  const day = now <= kolkataAt(today, WINDOW_START_HOUR) ? today : addDays(today, 1);
  const whole = kolkataAt(day, WINDOW_END_HOUR);
  return whole > closesAt ? whole : closesAt;
}
