import { AppointmentStatus, type AppointmentCalendar } from '@cms/shared-types';

export type SlotChoice = { slot: string; calendar: AppointmentCalendar };

export interface CalendarSpec {
  title: string;
  accentColor: string;
  description: string;
  /** What the header says beside the title when `waiting` patients are still to be dealt with. */
  count: (waiting: number) => string;
  empty: string;
  entryStatus: AppointmentStatus;
  move: { label: string; busyLabel: string; to: AppointmentCalendar; offeredWhile: AppointmentStatus; primary: boolean };
  /** Toast title when an appointment arrives here from the other calendar. */
  arrivedTitle: string;
}

/** Display names for the codes the server stores. */
export const VISIT_TYPE_LABEL: Record<string, string> = {
  OPD: 'Consultation',
  PROCEDURE: 'Procedure',
  TELEMED: 'Video call',
};

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  [AppointmentStatus.SCHEDULED]: 'Scheduled',
  [AppointmentStatus.CONFIRMED]: 'Confirmed',
  [AppointmentStatus.CHECKED_IN]: 'Checked in',
  [AppointmentStatus.IN_PROGRESS]: 'In progress',
  [AppointmentStatus.COMPLETED]: 'Completed',
  [AppointmentStatus.NO_SHOW]: 'No-show',
  [AppointmentStatus.CANCELLED]: 'Cancelled',
};

export const visitTypeLabel = (visitType?: string) => VISIT_TYPE_LABEL[visitType || 'OPD'] ?? visitType ?? '';

export const CALENDARS: Record<AppointmentCalendar, CalendarSpec> = {
  SCHEDULED: {
    title: 'Scheduled',
    accentColor: '#94a3b8',
    description: 'Booked ahead. Call to confirm.',
    count: (n) => `${n} to confirm`,
    empty: 'No one left to confirm',
    entryStatus: AppointmentStatus.SCHEDULED,
    move: { label: 'Confirm', busyLabel: 'Confirming…', to: 'CONFIRMED', offeredWhile: AppointmentStatus.SCHEDULED, primary: true },
    arrivedTitle: 'Moved to Scheduled',
  },
  CONFIRMED: {
    title: 'Confirmed',
    accentColor: '#0ea5e9',
    description: 'Confirmed, walk-ins and visits.',
    count: (n) => `${n}`,
    empty: 'none waiting',
    entryStatus: AppointmentStatus.CONFIRMED,
    move: { label: 'Move to Scheduled', busyLabel: 'Moving…', to: 'SCHEDULED', offeredWhile: AppointmentStatus.CONFIRMED, primary: false },
    arrivedTitle: 'Appointment confirmed',
  },
};

/** Left to right on screen, in the table's order. */
export const CALENDAR_ORDER = Object.keys(CALENDARS) as AppointmentCalendar[];

/** Only appointments still being planned can move; the server refuses the rest. */
export const canMove = (status: AppointmentStatus) => CALENDAR_ORDER.some((c) => CALENDARS[c].entryStatus === status);

/** Finished with: no longer waiting to be seen. */
export const isWaiting = (status: AppointmentStatus) => status !== AppointmentStatus.COMPLETED && status !== AppointmentStatus.NO_SHOW && status !== AppointmentStatus.CANCELLED;
