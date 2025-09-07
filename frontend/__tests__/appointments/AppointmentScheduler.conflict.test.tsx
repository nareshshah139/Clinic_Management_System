import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AppointmentScheduler from '@/components/appointments/AppointmentScheduler';

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
    },
  };
});

describe('AppointmentScheduler - conflict handling', () => {
  const originalAlert = window.alert;
  beforeEach(() => {
    window.alert = jest.fn();
  });
  afterEach(() => {
    window.alert = originalAlert;
    jest.clearAllMocks();
  });

  it('shows alert with suggested alternative slots on conflict', async () => {
    render(<AppointmentScheduler />);

    // Wait for doctor and slots to load
    await waitFor(() => expect(screen.getByText('Appointment Scheduler')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('10:00-10:30')).toBeInTheDocument());

    // Search and select patient
    const patientInput = screen.getByPlaceholderText('Search patient by name/phone');
    fireEvent.change(patientInput, { target: { value: 'Pat' } });
    await waitFor(() => expect(screen.getByText(/Pat Ient/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Pat Ient/));

    // Click the slot to book -> triggers conflict
    fireEvent.click(screen.getByText('10:00-10:30'));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalled();
      const alertMsg = (window.alert as jest.Mock).mock.calls[0][0] as string;
      expect(alertMsg).toMatch(/Scheduling conflict detected/i);
      expect(alertMsg).toMatch(/10:30-11:00/);
      expect(alertMsg).toMatch(/11:00-11:30/);
    });
  });
}); 