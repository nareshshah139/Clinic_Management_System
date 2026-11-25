import { OutboundMessagePurpose as P } from '@prisma/client';

const IST_OFFSET_MS = 330 * 60 * 1000;
export const WINDOW_START_HOUR = 9;
export const WINDOW_END_HOUR = 20;

/** Automated care and study messages: send window and one-a-day cap apply (PP-14, PP-15). */
export const CARE_PRIORITY: Partial<Record<P, number>> = {
  [P.REVIEW_REMINDER]: 0,
  [P.CHECK_IN_OPENED]: 1,
  [P.CHECK_IN_REMINDER]: 2,
};
export const isCare = (p: P) => p in CARE_PRIORITY;

/** Messages that need OPTED_IN consent and the confirmed number at send time (PP-13). */
export const needsConsent = (p: P) => isCare(p) || p === P.APPOINTMENT_CONFIRMATION || p === P.PORTAL_REPLY_NOTICE;

export function kolkataDay(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function kolkataAt(day: string, hour: number): Date {
  return new Date(Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00.000Z`) - IST_OFFSET_MS);
}

export function kolkataDayBounds(at: Date): { start: Date; end: Date } {
  const start = kolkataAt(kolkataDay(at), 0);
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
}

/**
 * @cc [owner:nareshshah139,label:product] care-send-window
 * Automated care and study messages MUST leave only between 09:00 and 20:00 Asia/Kolkata;
 * confirmations, one-time codes, acknowledgements and staff replies are exempt.
 */
export function inSendWindow(at: Date): boolean {
  const hour = new Date(at.getTime() + IST_OFFSET_MS).getUTCHours();
  return hour >= WINDOW_START_HOUR && hour < WINDOW_END_HOUR;
}

/** The next 09:00 Kolkata strictly after the window that contains `at` (today's if before 09:00). */
export function nextWindowStart(at: Date): Date {
  const today = kolkataAt(kolkataDay(at), WINDOW_START_HOUR);
  return at < today ? today : new Date(today.getTime() + 24 * 3600 * 1000);
}

export function nextDayWindowStart(at: Date): Date {
  return new Date(kolkataAt(kolkataDay(at), WINDOW_START_HOUR).getTime() + 24 * 3600 * 1000);
}
