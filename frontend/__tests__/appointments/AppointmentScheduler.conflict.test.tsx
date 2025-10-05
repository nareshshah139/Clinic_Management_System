import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AppointmentScheduler from '@/components/appointments/AppointmentScheduler';

// Mock API to produce a 409 conflict on createAppointment
jest.mock('@/lib/api', () => {
  const suggestions = ['10:30-11:00', '11:00-11:30'];
  const err: any = new Error('Scheduling conflict detected');
  err.status = 409;
  err.body = { message: 'Scheduling conflict detected', suggestions };

  return {
    apiClient: {
      getUsers: jest.fn().mockResolvedValue({ users: [{ id: 'doc-1', firstName: 'Doc', lastName: 'Tor', role: 'DOCTOR' }] }),
      getAvailableSlots: jest.fn().mockResolvedValue({ availableSlots: ['10:00-10:30'] }),
      getPatients: jest.fn().mockResolvedValue({ patients: [{ id: 'pat-1', firstName: 'Pat', lastName: 'Ient', phone: '9999999999' }] }),
      createAppointment: jest.fn().mockRejectedValue(err),
      getDoctorSchedule: jest.fn().mockResolvedValue({ appointments: [] }),
      getRooms: jest.fn().mockResolvedValue({ rooms: [] }),
    },
  };
});

// Capture toast calls
const toastMock = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

describe('AppointmentScheduler - conflict handling (toast)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows toast with suggested alternative slots on conflict', async () => {
    render(<AppointmentScheduler />);

    // Wait for doctor and slots to load
    await waitFor(() => expect(screen.getByText('Appointment Scheduler')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('10:00-10:30')).toBeInTheDocument());

    // Search and select patient
    const patientInput = screen.getByPlaceholderText('Search patient by name/phone');
    fireEvent.change(patientInput, { target: { value: 'Pat' } });
    await waitFor(() => expect(screen.getByText(/Pat Ient/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Pat Ient/));

    // Click the slot to open booking dialog
    fireEvent.click(screen.getByText('10:00-10:30'));

    // Confirm booking, which will trigger conflict toast
    const confirmBtn = await screen.findByRole('button', { name: /Confirm Booking/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
      const args = toastMock.mock.calls[0][0];
      expect(args.title).toMatch(/Scheduling Conflict/i);
      expect(String(args.description)).toMatch(/10:30-11:00/);
      expect(String(args.description)).toMatch(/11:00-11:30/);
      expect(args.variant).toBe('destructive');
    });
  });
});