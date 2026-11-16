// Repo path: frontend/src/lib/working-hours.ts
// Extracted from the hours effect in AppointmentsCalendar.tsx:117-142, so the calendar and the
// voice booking read a doctor's hours with one function. Package C creates it; package P switches
// the calendar's effect to it.

export interface WorkingHours { startHour: number; endHour: number }

/**
 * Hours for one doctor on one IST date. Same rules as the calendar today:
 * metadata may be an object or a JSON string; `workingHours.byDay[mon..sun]` wins over the
 * top-level startHour/endHour; any value that is not an integer falls back to `fallback`.
 */
export function workingHoursOn(metadata: unknown, date: string, fallback: WorkingHours): WorkingHours {
  // meta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata ?? {}
  // wh = meta.workingHours; !wh -> fallback
  // dayKey from `${date}T12:00:00.000Z` in Asia/Kolkata
  // startHour = int(byDay.startHour) ?? int(wh.startHour) ?? fallback.startHour; same for endHour
  throw new Error('not implemented');
}
