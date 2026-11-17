import { AppointmentStatus, UserRole, type AppointmentCalendar } from '@cms/shared-types';

export type SlotChoice = { slot: string; calendar: AppointmentCalendar };

export interface CalendarSpec {
  title: string;
  accentColor: string;
  description: string;
  count: (patients: number) => string;
  /** The short count line of a folded calendar, whose column is too narrow for `count`. */
  foldedCount: (patients: number) => string;
  empty: string;
  entryStatus: AppointmentStatus;
  move: { label: string; busyLabel: string; to: AppointmentCalendar; offeredWhile: AppointmentStatus; primary: boolean };
  /** Toast title when an appointment arrives here from the other calendar. */
  arrivedTitle: string;
}

const patients = (n: number) => `${n} ${n === 1 ? 'patient' : 'patients'}`;

export const CALENDARS: Record<AppointmentCalendar, CalendarSpec> = {
  SCHEDULED: {
    title: 'Scheduled',
    accentColor: 'var(--muted-foreground)',
    description: 'Booked ahead. Call to confirm.',
    count: (n) => `${patients(n)} to confirm`,
    foldedCount: (n) => `${n} to confirm`,
    empty: 'No one left to confirm',
    entryStatus: AppointmentStatus.SCHEDULED,
    move: { label: 'Confirm', busyLabel: 'Confirming…', to: 'CONFIRMED', offeredWhile: AppointmentStatus.SCHEDULED, primary: true },
    arrivedTitle: 'Moved to Scheduled',
  },
  CONFIRMED: {
    title: 'Confirmed',
    accentColor: 'var(--info)',
    description: 'Confirmed, walk-ins and visits.',
    count: (n) => `${patients(n)} confirmed`,
    foldedCount: (n) => `${n} confirmed`,
    empty: 'No confirmed patients yet',
    entryStatus: AppointmentStatus.CONFIRMED,
    move: { label: 'Move to Scheduled', busyLabel: 'Moving…', to: 'SCHEDULED', offeredWhile: AppointmentStatus.CONFIRMED, primary: false },
    arrivedTitle: 'Appointment confirmed',
  },
};

/** Left to right on screen, in the table's order. */
export const CALENDAR_ORDER = Object.keys(CALENDARS) as AppointmentCalendar[];

/** Only appointments still being planned can move; the server refuses the rest. */
export const canMove = (status: AppointmentStatus) => CALENDAR_ORDER.some((c) => CALENDARS[c].entryStatus === status);

/**
 * @cc [owner:nareshshah139,label:product] doctor-day-is-confirmed
 * A doctor's day MUST open on the Confirmed calendar. Each other calendar folds to its count, which
 * the doctor can open and hide again. Every other role MUST see every calendar open and is offered
 * no fold control. This is a default view, not a permission.
 */
export const foldedCalendarsFor = (role: string | undefined): readonly AppointmentCalendar[] =>
  role === UserRole.DOCTOR ? ['SCHEDULED'] : [];
