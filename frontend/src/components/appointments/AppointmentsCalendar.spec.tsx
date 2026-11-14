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

describe('AppointmentsCalendar room filter', () => {
  const roomFilterShown = async (readsRooms: boolean) => {
    const { unmount } = render(<AppointmentsCalendar controlledDoctorId="d1" controlledDate="2099-01-01" hideHeaderControls readsRooms={readsRooms} />);
    await screen.findByRole('region', { name: 'Confirmed' });
    const shown = screen.queryByRole('combobox', { name: 'Room' }) !== null;
    unmount();
    return shown;
  };

  it('offers the room filter only to a role that may read rooms', async () => {
    expect([await roomFilterShown(true), await roomFilterShown(false)]).toEqual([true, false]);
  });
});

describe('AppointmentsCalendar toolbar and legend', () => {
  it('keeps the legend closed until its button opens it, and Escape closes it', async () => {
    const user = userEvent.setup();
    render(<AppointmentsCalendar controlledDoctorId="d1" controlledDate="2099-01-01" hideHeaderControls />);
    await screen.findByRole('region', { name: 'Confirmed' });
    expect(screen.queryByText('Booking In Progress')).toBeNull();
    expect(screen.queryByText('Doctor Calendar')).toBeNull();

    const legend = screen.getByRole('button', { name: 'Legend' });
    await user.click(legend);
    expect(await screen.findByText('Booking In Progress')).toBeInTheDocument();
    expect(screen.getByText(/press/)).toHaveTextContent('Open a scheduled patient and press Confirm to move them to Confirmed at the same time.');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Booking In Progress')).toBeNull());
    expect(legend).toHaveFocus();
  });

  it('puts visit type, room, patient search and grid interval in one toolbar', async () => {
    render(<AppointmentsCalendar controlledDoctorId="d1" controlledDate="2099-01-01" hideHeaderControls />);
    const toolbar = await screen.findByRole('toolbar', { name: 'Calendar filters' });
    for (const name of ['Visit type', 'Room', 'Grid interval']) {
      expect(within(toolbar).getByRole('combobox', { name })).toBeInTheDocument();
    }
    expect(within(toolbar).getByRole('textbox', { name: 'Patient' })).toBeInTheDocument();
  });
});
