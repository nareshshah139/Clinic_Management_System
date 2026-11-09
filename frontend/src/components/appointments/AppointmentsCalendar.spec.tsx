import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppointmentsCalendar from './AppointmentsCalendar';

const createAppointment = jest.fn().mockResolvedValue({ id: 'apt-1' });

const stableToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: stableToast }),
}));

jest.mock('@/lib/api', () => ({
  apiClient: {
    getDoctorSchedule: jest.fn().mockResolvedValue({ appointments: [] }),
    getPatient: jest.fn().mockResolvedValue({ id: 'p1', firstName: 'Synthetic', lastName: 'Patient', phone: '0000000000' }),
    getUsers: jest.fn().mockResolvedValue({ data: [{ id: 'd1', firstName: 'Do', lastName: 'Ctor', role: 'DOCTOR' }] }),
    getRooms: jest.fn().mockResolvedValue({ rooms: [] }),
    getRoomSchedule: jest.fn().mockResolvedValue({ appointments: [] }),
    createAppointment: (...args: any[]) => createAppointment(...args),
  },
}));

// Mock the booking dialog to bypass internal validation and call onConfirm
jest.mock('./AppointmentBookingDialog', () => ({
  __esModule: true,
  default: (props: any) => (
    <button onClick={() => props.onConfirm({ visitType: 'OPD', slot: props.slot })}>Confirm Booking</button>
  ),
}));

async function bookIn(column: 'Scheduled' | 'Confirmed', slot: string) {
  const user = userEvent.setup();
  render(<AppointmentsCalendar prefillPatientId="p1" controlledDoctorId="d1" controlledDate="2099-01-01" hideHeaderControls />);
  await screen.findByText(/Selected: Synthetic Patient/);
  await user.click(await within(await screen.findByRole('region', { name: column })).findByRole('button', { name: `Book ${slot}` }));
  await user.click(await screen.findByText('Confirm Booking'));
}

describe('AppointmentsCalendar booking flow', () => {
  beforeEach(() => createAppointment.mockClear());

  it('books a free time in the Scheduled column into the Scheduled calendar', async () => {
    await bookIn('Scheduled', '10:00-10:30');
    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    expect(createAppointment.mock.calls[0][0]).toEqual({
      doctorId: 'd1', patientId: 'p1', date: '2099-01-01', slot: '10:00-10:15', visitType: 'OPD', roomId: undefined, notes: undefined, calendar: 'SCHEDULED',
    });
  });

  it('books a free time in the Confirmed column into the Confirmed calendar and says so', async () => {
    createAppointment.mockResolvedValueOnce({ id: 'apt-2', slot: '14:00-14:15', patient: { name: 'Synthetic Patient' } });
    await bookIn('Confirmed', '14:00-14:30');
    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    expect(createAppointment.mock.calls[0][0]).toMatchObject({ slot: '14:00-14:15', calendar: 'CONFIRMED' });
    expect((await screen.findByText('Appointment Successfully Booked!')).parentElement).toHaveTextContent('Synthetic Patient scheduled for 14:00-14:15 in the Confirmed calendar');
  });
});
