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

type Fixture = { id: string; slot: string; name: string; status: AppointmentStatus; calendar: AppointmentCalendar; phone?: string };
const toSchedule = (rows: Fixture[]) => ({
  appointments: rows.map(({ id, slot, name, status, calendar, phone }) => ({ id, slot, status, calendar, visitType: 'OPD', patient: { name, phone } })),
}) as never;

const ravi: Fixture = { id: 'a1', slot: '10:00-10:30', name: 'Ravi Kumar', status: AppointmentStatus.SCHEDULED, calendar: 'SCHEDULED', phone: '+91 98450 12345' };
const priya: Fixture = { id: 'a2', slot: '11:00-11:30', name: 'Priya Nair', status: AppointmentStatus.CONFIRMED, calendar: 'CONFIRMED' };
const suresh: Fixture = { id: 'a3', slot: '12:00-12:30', name: 'Suresh Babu', status: AppointmentStatus.IN_PROGRESS, calendar: 'CONFIRMED' };

const column = (name: 'Scheduled' | 'Confirmed') => within(screen.getByRole('region', { name }));
const conflict = (overbook?: object) => Object.assign(new Error('Scheduling conflict detected'), {
  status: 409, body: { message: 'Scheduling conflict detected', suggestions: [], conflicts: [], ...(overbook ? { overbook } : {}) },
});

async function renderDay(...rows: Fixture[]) {
  api.getDoctorSchedule.mockResolvedValue(toSchedule(rows));
  const onSelectSlot = jest.fn();
  render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" onSelectSlot={onSelectSlot} />);
  await screen.findByRole('region', { name: 'Scheduled' });
  return onSelectSlot;
}

async function openDetails(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}, `) }));
  return within(await screen.findByRole('dialog', { name: 'Appointment Details' }));
}

describe('DoctorDayCalendar Scheduled and Confirmed calendars', () => {
  beforeEach(() => jest.clearAllMocks());

  it('draws each appointment only in the column its calendar names, with counts in the headers', async () => {
    await renderDay(ravi, priya, suresh);

    expect(column('Scheduled').getByRole('button', { name: 'Ravi Kumar, 10:00-10:30, Scheduled' })).toBeInTheDocument();
    expect(column('Scheduled').queryByText('Priya Nair')).toBeNull();
    expect(column('Scheduled').queryByText('Suresh Babu')).toBeNull();
    expect(column('Confirmed').getByRole('button', { name: 'Priya Nair, 11:00-11:30, Confirmed' })).toBeInTheDocument();
    expect(column('Confirmed').getByRole('button', { name: 'Suresh Babu, 12:00-12:30, In consultation' })).toBeInTheDocument();
    expect(column('Confirmed').queryByText('Ravi Kumar')).toBeNull();

    expect(column('Scheduled').getByText('1 patient to confirm')).toBeInTheDocument();
    expect(column('Confirmed').getByText('2 patients confirmed')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /patient queue/i })).toBeNull();
  });

  it('counts capacity per calendar, so a confirmed patient does not close the same time in Scheduled', async () => {
    await renderDay(priya);
    expect(column('Scheduled').getByRole('button', { name: 'Book 11:00-11:30' })).toBeInTheDocument();
    expect(column('Confirmed').queryByRole('button', { name: /^Book 11:00-11:30/ })).toBeNull();
  });

  it('books a free time in the Confirmed column into the Confirmed calendar', async () => {
    const onSelectSlot = await renderDay(ravi);
    fireEvent.click(column('Confirmed').getByRole('button', { name: 'Book 15:00-15:30' }));
    expect(onSelectSlot).toHaveBeenCalledWith('15:00-15:15', 'CONFIRMED');
  });

  it('confirms at the same time and shows the patient in Confirmed after the refresh', async () => {
    await renderDay(ravi);
    api.rescheduleAppointment.mockResolvedValueOnce({ id: 'a1' } as never);
    api.getDoctorSchedule.mockResolvedValue(toSchedule([{ ...ravi, status: AppointmentStatus.CONFIRMED, calendar: 'CONFIRMED' }]));

    fireEvent.click((await openDetails('Ravi Kumar')).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(column('Confirmed').getByRole('button', { name: 'Ravi Kumar, 10:00-10:30, Confirmed' })).toBeInTheDocument();
    expect(column('Scheduled').queryByText('Ravi Kumar')).toBeNull();
    expect(api.rescheduleAppointment.mock.calls).toEqual([['a1', { date: '2099-01-01', slot: '10:00-10:30', roomId: undefined, calendar: 'CONFIRMED' }]]);
    expect(stableToast).toHaveBeenCalledWith({ variant: 'success', title: 'Appointment confirmed', description: 'Ravi Kumar is now at 10:00-10:30 in Confirmed.' });
  });

  it('sends one confirm for a double click', async () => {
    await renderDay(ravi);
    api.rescheduleAppointment.mockReturnValueOnce(new Promise(() => {}) as never);
    const dialog = await openDetails('Ravi Kumar');
    fireEvent.click(dialog.getByRole('button', { name: 'Confirm' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Confirming…' }));
    expect(dialog.getByRole('button', { name: 'Confirming…' })).toBeDisabled();
    expect(api.rescheduleAppointment).toHaveBeenCalledTimes(1);
  });

  it('turns a confirm into a time taken in Confirmed into a move limited to the Confirmed calendar', async () => {
    await renderDay(ravi, { ...priya, slot: '10:00-10:30' });
    api.rescheduleAppointment.mockRejectedValueOnce(conflict()).mockResolvedValueOnce({ id: 'a1' } as never);

    fireEvent.click((await openDetails('Ravi Kumar')).getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('10:00-10:30 is taken in Confirmed. Click a free time in the Confirmed calendar, or change the date to pick another day.')).toBeInTheDocument();
    expect(screen.getByText('Moving Ravi Kumar to Confirmed')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(column('Scheduled').queryByRole('button', { name: /^(Move to|Book) / })).toBeNull();

    fireEvent.click(column('Confirmed').getByRole('button', { name: 'Move to 11:00-11:30' }));
    await waitFor(() => expect(api.rescheduleAppointment).toHaveBeenCalledTimes(2));
    expect(api.rescheduleAppointment.mock.calls[1]).toEqual(['a1', { date: '2099-01-01', slot: '11:00-11:30', roomId: undefined, calendar: 'CONFIRMED' }]);
    await waitFor(() => expect(screen.queryByText(/is taken in Confirmed/)).toBeNull());
  });

  it('offers Move to Scheduled for a confirmed patient, at the same time, but not once the visit has started', async () => {
    await renderDay(priya, suresh);
    api.rescheduleAppointment.mockResolvedValueOnce({ id: 'a2' } as never);

    const started = await openDetails('Suresh Babu');
    expect(started.getByRole('button', { name: 'Start Visit' })).toBeInTheDocument();
    expect(started.queryByRole('button', { name: 'Move to Scheduled' })).toBeNull();
    fireEvent.click(started.getAllByRole('button', { name: 'Close' })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click((await openDetails('Priya Nair')).getByRole('button', { name: 'Move to Scheduled' }));
    await waitFor(() => expect(api.rescheduleAppointment).toHaveBeenCalledTimes(1));
    expect(api.rescheduleAppointment.mock.calls[0]).toEqual(['a2', { date: '2099-01-01', slot: '11:00-11:30', roomId: undefined, calendar: 'SCHEDULED' }]);
  });

  it('offers Reschedule only while an appointment can still move', async () => {
    const missed: Fixture = { id: 'a4', slot: '13:00-13:30', name: 'Meena Rao', status: AppointmentStatus.NO_SHOW, calendar: 'CONFIRMED' };
    await renderDay(ravi, missed);

    expect(column('Scheduled').getAllByRole('button', { name: /^Reschedule / })).toHaveLength(1);
    expect(column('Confirmed').queryAllByRole('button', { name: /^Reschedule / })).toHaveLength(0);
    const noShow = await openDetails('Meena Rao');
    expect(noShow.getByRole('button', { name: /Cancel Appointment/ })).toBeInTheDocument();
    expect(noShow.queryByRole('button', { name: 'Reschedule' })).toBeNull();
    fireEvent.click(noShow.getAllByRole('button', { name: 'Close' })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await openDetails('Ravi Kumar')).getByRole('button', { name: 'Reschedule' })).toBeInTheDocument();
  });

  it('reschedules into whichever column the free time is clicked in', async () => {
    await renderDay(ravi);
    api.rescheduleAppointment.mockResolvedValueOnce({ id: 'a1' } as never);
    fireEvent.click((await openDetails('Ravi Kumar')).getByRole('button', { name: 'Reschedule' }));

    expect(await screen.findByText('Click a free time in either calendar. To move to another day, change the date first.')).toBeInTheDocument();
    expect(column('Scheduled').getByRole('button', { name: 'Move to 14:00-14:30' })).toBeInTheDocument();
    fireEvent.click(column('Confirmed').getByRole('button', { name: 'Move to 14:00-14:30' }));

    await waitFor(() => expect(api.rescheduleAppointment).toHaveBeenCalledTimes(1));
    expect(api.rescheduleAppointment.mock.calls[0]).toEqual(['a1', { date: '2099-01-01', slot: '14:00-14:30', roomId: undefined, calendar: 'CONFIRMED' }]);
  });

  it('keeps a reschedule going when the date changes and moves the appointment to that day', async () => {
    api.getDoctorSchedule.mockImplementation(async (_doctor: string, day: string) => toSchedule(day === '2099-01-01' ? [ravi] : [priya]));
    api.rescheduleAppointment.mockResolvedValueOnce({ id: 'a1' } as never);
    const { rerender } = render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" />);
    await screen.findByRole('region', { name: 'Scheduled' });
    fireEvent.click((await openDetails('Ravi Kumar')).getByRole('button', { name: 'Reschedule' }));
    expect(await screen.findByText('Rescheduling Ravi Kumar')).toBeInTheDocument();

    rerender(<DoctorDayCalendar doctorId="doc-1" date="2099-01-02" />);

    await screen.findByRole('button', { name: 'Priya Nair, 11:00-11:30, Confirmed' });
    expect(column('Scheduled').queryByText('Ravi Kumar')).toBeNull();
    expect(screen.getByText('Rescheduling Ravi Kumar')).toBeInTheDocument();
    expect(screen.getByText('Click a free time in either calendar to move this appointment from 01 Jan 2099 to 02 Jan 2099.')).toBeInTheDocument();
    fireEvent.click(column('Scheduled').getByRole('button', { name: 'Move to 11:00-11:30' }));

    await waitFor(() => expect(api.rescheduleAppointment).toHaveBeenCalledTimes(1));
    expect(api.rescheduleAppointment.mock.calls[0]).toEqual(['a1', { date: '2099-01-02', slot: '11:00-11:30', roomId: undefined, calendar: 'SCHEDULED' }]);
    await waitFor(() => expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Appointment rescheduled',
      description: 'Ravi Kumar is now on 02 Jan 2099 at 11:00-11:30 in Scheduled.',
    })));
    await waitFor(() => expect(screen.queryByText('Rescheduling Ravi Kumar')).toBeNull());
  });

  it('ends a reschedule when the doctor changes', async () => {
    api.getDoctorSchedule.mockResolvedValue(toSchedule([ravi]));
    const { rerender } = render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" />);
    await screen.findByRole('region', { name: 'Scheduled' });
    fireEvent.click((await openDetails('Ravi Kumar')).getByRole('button', { name: 'Reschedule' }));
    expect(await screen.findByText('Rescheduling Ravi Kumar')).toBeInTheDocument();

    rerender(<DoctorDayCalendar doctorId="doc-2" date="2099-01-01" />);

    await waitFor(() => expect(api.getDoctorSchedule).toHaveBeenCalledWith('doc-2', '2099-01-01'));
    expect(await screen.findByRole('button', { name: 'Ravi Kumar, 10:00-10:30, Scheduled' })).toBeInTheDocument();
    expect(screen.queryByText('Rescheduling Ravi Kumar')).toBeNull();
  });

  it('shows the phone number as a link that dials it', async () => {
    await renderDay(ravi);
    const dialog = await openDetails('Ravi Kumar');
    expect(dialog.getByRole('link', { name: '+91 98450 12345' })).toHaveAttribute('href', 'tel:+919845012345');
  });
});
