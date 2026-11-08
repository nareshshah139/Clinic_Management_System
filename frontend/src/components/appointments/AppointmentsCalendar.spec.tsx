import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppointmentsCalendar from './AppointmentsCalendar';
import { apiClient } from '@/lib/api';

const toast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const kavya = { id: 'p1', name: 'Kavya Patel', firstName: 'Kavya', lastName: 'Patel', phone: '9876543213' };

jest.mock('@/lib/api', () => ({
  apiClient: {
    getDoctorSchedule: jest.fn().mockResolvedValue({ appointments: [] }),
    getDoctorDay: jest.fn().mockResolvedValue(null),
    getRooms: jest.fn().mockResolvedValue({ rooms: [] }),
    getRoomSchedule: jest.fn().mockResolvedValue({ appointments: [] }),
    getGoogleCalendarConfigured: jest.fn().mockResolvedValue({ configured: false }),
    getGoogleCalendarStatus: jest.fn().mockResolvedValue({ connected: false }),
    getGoogleCalendarDoctorStatus: jest.fn().mockResolvedValue({ connected: false }),
    getPatients: jest.fn(),
    getPatient: jest.fn(),
    createAppointment: jest.fn(),
  },
}));

const api = apiClient as unknown as Record<string, jest.Mock>;
const doctor = { id: 'd1', firstName: 'Shravya', lastName: 'Rao', role: 'DOCTOR' } as never;

beforeEach(() => {
  toast.mockClear();
  api.getPatients.mockResolvedValue({ data: [kavya] });
  api.getPatient.mockResolvedValue(kavya);
  api.createAppointment.mockReset().mockResolvedValue({ id: 'apt-1', slot: '09:00-09:30', patient: { name: 'Kavya Patel' } });
});

async function clickFirstFreeSlot(user: ReturnType<typeof userEvent.setup>) {
  const tiles = await screen.findAllByRole('button', { name: /^Book \d{2}:\d{2}-\d{2}:\d{2}$/ });
  await user.click(tiles[0]);
  return screen.findByRole('dialog', { name: 'Book Appointment' });
}

it('books slot-first: a free slot opens the dialog, the patient is found inside it, and the booking clears the patient', async () => {
  const user = userEvent.setup();
  render(<AppointmentsCalendar doctor={doctor} date="2099-01-01" />);

  const dialog = await clickFirstFreeSlot(user);
  const search = within(dialog).getByPlaceholderText('Search patient by name or phone');
  expect(search).toHaveFocus();
  expect(within(dialog).getByRole('button', { name: 'Confirm Booking' })).toBeDisabled();

  await user.type(search, 'kav');
  await user.click(await within(dialog).findByRole('option', { name: 'Kavya Patel — 9876543213' }));
  expect(within(dialog).getByText('Kavya Patel')).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Confirm Booking' }));

  await waitFor(() => expect(api.createAppointment).toHaveBeenCalledTimes(1));
  expect(api.createAppointment.mock.calls[0][0]).toMatchObject({ doctorId: 'd1', patientId: 'p1', date: '2099-01-01', visitType: 'OPD' });
  expect(await screen.findByText(/Kavya Patel\s+scheduled for 09:00-09:30/)).toBeInTheDocument();
  expect(screen.queryByText(/Booking for Kavya Patel/)).toBeNull();
});

it('books the patient from a chart link without searching again', async () => {
  const user = userEvent.setup();
  render(<AppointmentsCalendar doctor={doctor} date="2099-01-01" prefillPatientId="p1" />);

  expect(await screen.findByText('Booking for Kavya Patel — 9876543213')).toBeInTheDocument();
  const dialog = await clickFirstFreeSlot(user);
  expect(within(dialog).queryByPlaceholderText('Search patient by name or phone')).toBeNull();
  await user.click(within(dialog).getByRole('button', { name: 'Confirm Booking' }));

  await waitFor(() => expect(api.createAppointment).toHaveBeenCalledTimes(1));
  expect(api.createAppointment.mock.calls[0][0]).toMatchObject({ patientId: 'p1', doctorId: 'd1' });
});

it('offers the suggested slots when the server reports a conflict', async () => {
  const user = userEvent.setup();
  api.createAppointment.mockRejectedValue(Object.assign(new Error('conflict'), {
    status: 409,
    body: { message: 'Scheduling conflict detected', suggestions: ['10:30-11:00', '11:00-11:30'] },
  }));
  render(<AppointmentsCalendar doctor={doctor} date="2099-01-01" prefillPatientId="p1" />);

  await screen.findByText('Booking for Kavya Patel — 9876543213');
  const dialog = await clickFirstFreeSlot(user);
  await user.click(within(dialog).getByRole('button', { name: 'Confirm Booking' }));

  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
    variant: 'destructive',
    title: 'Scheduling Conflict',
    description: 'Scheduling conflict detected — Try: 10:30-11:00, 11:00-11:30',
  })));
});
