// Repo path: frontend/src/lib/voice/spoken-time.ts
// Pure matching of spoken words to dates, times, doctors, batches and units, in Asia/Kolkata.
// The only module that mints IstDate and ClockTime (private casts below).

import type { ParsedAppointment } from '@cms/shared-types/voice';
import type { User } from '@/lib/types';
import type { WorkingHours } from '@/lib/working-hours';
import type { ClockTime, IstDate } from './types';

type Said = ParsedAppointment['fields'];

/** Injected so tests fix "now". Production: istClock below, built on getISTDateString (lib/utils.ts:173). */
export interface IstClock { today(): IstDate; minutesNow(): number }

export const istClock: IstClock = {
  today: () => { throw new Error('not implemented'); },      // asIstDate(getISTDateString())
  minutesNow: () => { throw new Error('not implemented'); }, // IST hh * 60 + mm
};

/**
 * @cc [owner:nareshshah139,label:product] voice-date-ist
 * Relative and partial dates MUST resolve against the Asia/Kolkata calendar date from the clock;
 * past and impossible dates MUST NOT resolve.
 */
export function resolveSpokenDate(said: Said, today: IstDate):
  | { ok: true; date: IstDate }
  | { ok: false; reason: 'missing' | 'past' | 'invalid' } {
  // TODAY / TOMORROW / DAY_AFTER from `today`; WEEKDAY = next such date strictly after today
  // CALENDAR: day only -> this month, or next month if passed; day + month -> next occurrence >= today;
  //   day + month + year -> that date, 'past' if before today; Feb 30 -> 'invalid'
  // nothing said -> 'missing'
  throw new Error('not implemented');
}

/**
 * @cc [owner:nareshshah139,label:product] voice-time-unambiguous
 * A time said without am or pm MUST resolve only when exactly one 12-hour reading lies within the
 * doctor's working hours for that date; two readings MUST be offered as a choice.
 */
export function resolveSpokenTime(
  said: Said,
  hours: WorkingHours,
  at: { date: IstDate; today: IstDate; minutesNow: number },
):
  | { ok: true; start: ClockTime }
  | { ok: false; reason: 'missing' | 'outside-hours' | 'past' }
  | { ok: false; reason: 'ambiguous'; options: readonly [ClockTime, ClockTime] } {
  // hour null -> missing
  // hour >= 13 or meridiem given -> one reading
  // else readings = [h, h + 12] filtered to [startHour*60, endHour*60)
  //   0 -> outside-hours; 1 -> ok; 2 -> ambiguous
  // date === today and start <= minutesNow -> past
  throw new Error('not implemented');
}

export function matchDoctor(spoken: string | null, doctors: readonly User[]):
  | { kind: 'not-said' } | { kind: 'one'; doctor: User } | { kind: 'none' }
  | { kind: 'many'; doctors: readonly User[] } {
  // strip "dr", "dr.", "doctor", punctuation and case; match first, last or full name
  throw new Error('not implemented');
}

/** Upper-case; strip spaces, '-', '/', '.'. 'b-12 ' -> 'B12'. */
export function normalizeBatch(s: string | null | undefined): string {
  throw new Error('not implemented');
}

/** Singular lower-case compare; no pack conversion, ever. */
export function sameStockUnit(spoken: string | null, rowUnit: string): 'match' | 'not-said' | 'mismatch' {
  throw new Error('not implemented');
}

/** 'Tue 17 Nov 2026' */
export function formatIstDateLong(date: IstDate): string { throw new Error('not implemented'); }
/** Calendar slot key 'HH:MM-HH:MM' (the format AppointmentsCalendar already uses for pendingBookingSlot). */
export function slotFrom(start: ClockTime, minutes: number): string { throw new Error('not implemented'); }
/** '4:30 pm' for review lines and messages. */
export function formatClock12(t: ClockTime): string { throw new Error('not implemented'); }
