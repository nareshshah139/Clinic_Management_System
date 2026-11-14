import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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

describe('AppointmentsCalendar late booking response', () => {
  it('does not place a booking answered after the date changed in the newly selected day', async () => {
    const user = userEvent.setup();
    let answer!: (value: unknown) => void;
    createAppointment.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    const { rerender } = render(<AppointmentsCalendar prefillPatientId="p1" controlledDoctorId="d1" controlledDate="2099-01-01" hideHeaderControls />);
    await screen.findByText(/Selected: Synthetic Patient/);
    await user.click(await within(await screen.findByRole('region', { name: 'Confirmed' })).findByRole('button', { name: 'Book 10:00-10:30' }));
    await user.click(await screen.findByText('Confirm Booking'));
    await waitFor(() => expect(createAppointment).toHaveBeenCalled());
    rerender(<AppointmentsCalendar prefillPatientId="p1" controlledDoctorId="d1" controlledDate="2099-01-02" hideHeaderControls />);
    await act(async () => answer({ id: 'late', slot: '10:00-10:15', patient: { name: 'Synthetic Patient' } }));
    expect(screen.queryByRole('button', { name: /Synthetic Patient, 10:00-10:15/ })).toBeNull();
  });
});

describe('AppointmentsCalendar room filter', () => {
  const roomFilterShown = async (readsRooms: boolean) => {
    const { unmount } = render(<AppointmentsCalendar controlledDoctorId="d1" controlledDate="2099-01-01" hideHeaderControls readsRooms={readsRooms} />);
    await screen.findByRole('region', { name: 'Confirmed' });
    const shown = screen.queryByText('Room', { selector: 'label' }) !== null;
    unmount();
    return shown;
  };

  it('offers the room filter only to a role that may read rooms', async () => {
    expect([await roomFilterShown(true), await roomFilterShown(false)]).toEqual([true, false]);
  });
});
