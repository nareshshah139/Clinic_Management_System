'use client';

import { usePathname } from 'next/navigation';
import type { TourStep } from '@/hooks/useIntroTour';
import { TourButton } from './TourButton';

const replay: TourStep = {
  element: '[data-tour="help-button"]',
  title: 'Tours on other pages',
  intro: 'Dashboard, Appointments, Patients, Rooms and the Pharmacy pages each have their own tour. Press Start tour on any of them.',
};

export const RECEPTIONIST_TOURS: Readonly<Record<string, readonly TourStep[]>> = {
  '/dashboard': [
    {
      element: '[data-tour="sidebar"], [aria-label="Open clinic navigation"]',
      title: 'Pages',
      intro: 'Open Appointments, Patients, Rooms, the Pharmacy pages and Billing from here. On a phone the menu button opens the same list.',
      position: 'right',
    },
    {
      element: '[data-tour="dashboard-stats"]',
      title: 'What needs attention',
      intro: 'Each row counts one job: today’s bookings not yet confirmed, tomorrow’s bookings to confirm, and patients checked in and waiting for the doctor. Click a row to open those appointments.',
    },
    {
      element: '[data-tour="appointments-list"]',
      title: 'Today’s appointments',
      intro: 'Every booking today, grouped by doctor in time order. Click a patient to open their record.',
      position: 'top',
    },
    replay,
  ],
  '/dashboard/appointments': [
    {
      element: '[data-tour="doctor-select"]',
      title: 'Doctor',
      intro: 'Choose whose day to see. The page remembers your last choice.',
    },
    {
      element: '[data-tour="date-picker"]',
      title: 'Day',
      intro: 'Step a day back or forward, type a date, or press Today.',
    },
    {
      element: 'input[aria-label="Patient"]',
      title: 'Book a patient',
      intro: 'Find the patient by name or phone and pick them, then click a free time in the calendar. The booking dialog sets the duration, from 15 to 90 minutes. No match? Create the new patient from the same search.',
    },
    {
      element: '[role="group"][aria-label="Calendar"], div:has(> section[data-calendar])',
      title: 'Scheduled and Confirmed',
      intro: 'Scheduled holds patients booked ahead who still need a confirmation call. Confirmed is the doctor’s real day, with walk-ins. Click an appointment to view, confirm, reschedule or cancel it. Legend explains the colours.',
    },
    {
      element: '[aria-label="Quick guide"]',
      title: 'Quick guide',
      intro: 'This page’s tips stay here whenever you need them.',
    },
  ],
  '/dashboard/patients': [
    {
      element: '[data-tour="search-patients"]',
      title: 'Find a patient',
      intro: 'Search by name, phone, ABHA number or email. Check here before adding someone, so the clinic keeps one record per patient.',
    },
    {
      element: '[data-tour="add-patient-btn"]',
      title: 'New Patient',
      intro: 'Register a patient. First name, gender and phone are required. Age, email, address and the rest are optional. A walk-in can be booked with a doctor from the same form.',
    },
    {
      element: '[data-tour="patients-table"]',
      title: 'Patient list',
      intro: 'Click a patient to open their record. The ⋯ button on each row edits their details, books an appointment or sends a WhatsApp reminder.',
      position: 'top',
    },
  ],
  '/dashboard/rooms': [
    {
      element: '[data-tour="room-calendar"]',
      title: 'Room calendar',
      intro: 'Each column is a room and each block a booking, by time of day. Change the day with the arrows or the date box, and Now jumps to the current hour. Click a booking to see it. Rooms are chosen when an appointment is booked.',
      position: 'top',
    },
  ],
  '/dashboard/pharmacy': [
    {
      title: 'Pharmacy Desk',
      intro: 'The desk opens Pharmacy Counter and Inventory Control. Pharmacy assistant answers questions about stock and drug records, and you approve every change it suggests.',
    },
    {
      title: 'Pharmacy Counter',
      intro: 'Review prescriptions waiting to be dispensed, check stock and substitutions, then send them on to billing.',
    },
  ],
};

const fallback: readonly TourStep[] = [{ title: 'Tours', intro: replay.intro }];

export function ReceptionistTour() {
  const pathname = usePathname();
  const steps = RECEPTIONIST_TOURS[pathname] ?? fallback;
  return (
    <TourButton key={pathname} steps={steps} label="Start tour">
      <span>Start tour</span>
    </TourButton>
  );
}
