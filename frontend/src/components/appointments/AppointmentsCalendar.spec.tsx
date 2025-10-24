import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

describe('AppointmentsCalendar booking flow', () => {
  it('books when clicking a free slot and confirming', async () => {
    const user = userEvent.setup();

    render(
      <AppointmentsCalendar
        prefillPatientId="p1"
        controlledDoctorId="d1"
        controlledDate="2099-01-01"
        hideHeaderControls
      />
    );

    // Wait for doctor selection effect to run
    await waitFor(() => expect(screen.getByText('Doctor Calendar')).toBeInTheDocument());

    // There should be free tiles; pick the first book button by regex Book HH:MM-HH:MM
    const tiles = await screen.findAllByRole('button', { name: /Book \d{2}:\d{2}-\d{2}:\d{2}/i });
    await user.click(tiles[0]);

    const confirm = await screen.findByText('Confirm Booking');
    await user.click(confirm);

    await waitFor(() => expect(createAppointment).toHaveBeenCalled());
    expect(createAppointment).toHaveBeenCalledWith(expect.objectContaining({
      doctorId: 'd1',
      patientId: 'p1',
      date: '2099-01-01',
    }));
  });
});
