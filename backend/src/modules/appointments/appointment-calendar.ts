import { AppointmentStatus } from '@prisma/client';

export type AppointmentCalendar = 'SCHEDULED' | 'CONFIRMED';

/**
 * @cc [owner:nareshshah139,label:product] appointment-calendars
 * Each calendar has its own capacity: a booking or move counts only the appointments in its target calendar.
 * A move between calendars MUST check the target calendar under the doctor-day lock and write with a
 * compare-and-set on the status, date and slot it read. A request that already took effect MUST succeed unchanged.
 * Model: verification/appointment-calendars/AppointmentCalendars.tla.
 */
export const CALENDAR_STATUSES: Record<AppointmentCalendar, readonly AppointmentStatus[]> = {
  SCHEDULED: [AppointmentStatus.SCHEDULED],
  CONFIRMED: [
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CHECKED_IN,
    AppointmentStatus.IN_PROGRESS,
    AppointmentStatus.COMPLETED,
    AppointmentStatus.NO_SHOW,
  ],
};

export const CALENDARS = Object.keys(CALENDAR_STATUSES) as AppointmentCalendar[];

export function calendarOf(status: AppointmentStatus): AppointmentCalendar | null {
  return CALENDARS.find((c) => CALENDAR_STATUSES[c].includes(status)) ?? null;
}

export function statusEnteringCalendar(calendar: AppointmentCalendar): AppointmentStatus {
  return AppointmentStatus[calendar];
}

export function isMovable(status: AppointmentStatus): boolean {
  return (CALENDARS as string[]).includes(status);
}
