import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DoctorDayCalendar from './DoctorDayCalendar';
import { apiClient } from '@/lib/api';
import { AppointmentStatus, type AppointmentCalendar } from '@cms/shared-types';

const stableToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: stableToast }),
}));

jest.mock('@/lib/api', () => ({
  apiClient: {
    getDoctorSchedule: jest.fn(),
    deleteAppointment: jest.fn(),
    rescheduleAppointment: jest.fn(),
  },
}));

const api = apiClient as jest.Mocked<typeof apiClient>;

type Fixture = { id: string; slot: string; name: string; status: AppointmentStatus; calendar: AppointmentCalendar };
const toSchedule = (rows: Fixture[]) => ({
  appointments: rows.map(({ id, slot, name, status, calendar }) => ({ id, slot, status, calendar, visitType: 'OPD', patient: { name } })),
}) as never;

const ravi: Fixture = { id: 'a1', slot: '10:00-10:30', name: 'Ravi Kumar', status: AppointmentStatus.SCHEDULED, calendar: 'SCHEDULED' };
const priya: Fixture = { id: 'a2', slot: '11:00-11:30', name: 'Priya Nair', status: AppointmentStatus.CONFIRMED, calendar: 'CONFIRMED' };
const suresh: Fixture = { id: 'a3', slot: '12:00-12:30', name: 'Suresh Babu', status: AppointmentStatus.IN_PROGRESS, calendar: 'CONFIRMED' };

const FOLDED = ['SCHEDULED'] as const;
const region = (name: 'Scheduled' | 'Confirmed') => within(screen.getByRole('region', { name }));
const raviTile = () => screen.queryByRole('button', { name: 'Ravi Kumar, 10:00-10:30, Scheduled' });
const show = () => screen.getByRole('button', { name: 'Show Scheduled calendar' });
const hide = () => screen.getByRole('button', { name: 'Hide Scheduled calendar' });
const conflict = () => Object.assign(new Error('Scheduling conflict detected'), {
  status: 409, body: { message: 'Scheduling conflict detected', suggestions: [], conflicts: [] },
});

async function renderDay(rows: Fixture[], folded?: readonly AppointmentCalendar[]) {
  api.getDoctorSchedule.mockResolvedValue(toSchedule(rows));
  const view = render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" foldedCalendars={folded} />);
  await screen.findByRole('region', { name: 'Scheduled' });
  return view;
}

describe('DoctorDayCalendar folded calendars', () => {
  beforeEach(() => jest.clearAllMocks());

  it('folds Scheduled to its count and keeps the Confirmed day on screen', async () => {
    await renderDay([ravi, priya, suresh], FOLDED);

    expect(raviTile()).toBeNull();
    expect(region('Scheduled').getByText('1 to confirm')).toBeInTheDocument();
    expect(region('Confirmed').getByRole('button', { name: 'Priya Nair, 11:00-11:30, Confirmed' })).toBeInTheDocument();
    expect(region('Confirmed').getByRole('button', { name: 'Suresh Babu, 12:00-12:30, In consultation' })).toBeInTheDocument();
    expect(show()).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens on Show and hides again on Hide, keeping keyboard focus on the toggle', async () => {
    await renderDay([ravi, priya], FOLDED);

    fireEvent.click(show());
    expect(raviTile()).toBeInTheDocument();
    expect(hide()).toHaveAttribute('aria-expanded', 'true');
    expect(hide()).toHaveFocus();

    fireEvent.click(hide());
    expect(raviTile()).toBeNull();
    expect(show()).toHaveFocus();
  });

  it('shows both calendars with no fold control to a viewer without a folded calendar', async () => {
    await renderDay([ravi, priya]);

    expect(raviTile()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Priya Nair, 11:00-11:30, Confirmed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Show|Hide) .* calendar$/ })).toBeNull();
  });

  it('keeps an opened calendar open when the date changes', async () => {
    const { rerender } = await renderDay([ravi, priya], FOLDED);
    fireEvent.click(show());

    rerender(<DoctorDayCalendar doctorId="doc-1" date="2099-01-02" foldedCalendars={FOLDED} />);

    await waitFor(() => expect(api.getDoctorSchedule).toHaveBeenCalledWith('doc-1', '2099-01-02'));
    await screen.findByRole('region', { name: 'Scheduled' });
    expect(raviTile()).toBeInTheDocument();
    expect(hide()).toBeInTheDocument();
  });

  it('shows a folded calendar while a refused move is limited to it, and folds it again afterwards', async () => {
    await renderDay([{ ...ravi, slot: '11:00-11:30' }, priya], FOLDED);
    api.rescheduleAppointment.mockRejectedValueOnce(conflict());

    fireEvent.click(screen.getByRole('button', { name: 'Priya Nair, 11:00-11:30, Confirmed' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Appointment Details' })).getByRole('button', { name: 'Move to Scheduled' }));

    expect(await screen.findByText('Moving Priya Nair to Scheduled')).toBeInTheDocument();
    expect(screen.getByText('11:00-11:30 is taken in Scheduled. Click a free time in the Scheduled calendar, or change the date to pick another day.')).toBeInTheDocument();
    expect(region('Scheduled').getByRole('button', { name: 'Move to 14:00-14:30' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Moving Priya Nair to Scheduled')).toBeNull());
    expect(show()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move to 14:00-14:30' })).toBeNull();
  });

  it('names the one open calendar in the reschedule hint', async () => {
    await renderDay([ravi, priya], FOLDED);

    fireEvent.click(screen.getByRole('button', { name: 'Priya Nair, 11:00-11:30, Confirmed' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Appointment Details' })).getByRole('button', { name: 'Reschedule' }));

    expect(await screen.findByText('Click a free time in the Confirmed calendar. To move to another day, change the date first.')).toBeInTheDocument();
  });

  it('says no one is left to confirm when the folded calendar is empty', async () => {
    await renderDay([priya], FOLDED);

    expect(region('Scheduled').getByText('No one left to confirm')).toBeInTheDocument();
  });
});
