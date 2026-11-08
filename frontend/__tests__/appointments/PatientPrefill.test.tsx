import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import AppointmentsCalendar from '@/components/appointments/AppointmentsCalendar';
import AppointmentScheduler from '@/components/appointments/AppointmentScheduler';
import { apiClient } from '@/lib/api';
import { usePrefilledPatient } from '@/components/appointments/usePrefilledPatient';

jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }), toast: jest.fn() }));
jest.mock('@/lib/api', () => ({ apiClient: {
  getPatient: jest.fn().mockResolvedValue({ id: 'patient-1', name: 'Chosen Patient' }),
  getUsers: jest.fn().mockResolvedValue({ users: [] }),
  getUser: jest.fn().mockResolvedValue({}),
  getRooms: jest.fn().mockResolvedValue({ rooms: [] }),
  getAvailableSlots: jest.fn().mockResolvedValue({ availableSlots: [] }),
  getGoogleCalendarStatus: jest.fn().mockResolvedValue({ connected: false }),
  getGoogleCalendarConfigured: jest.fn().mockResolvedValue({ configured: false }),
} }));
jest.mock('@/components/appointments/DoctorDayCalendar', () => ({
  __esModule: true,
  default: ({ onSelectSlot }: any) => <button onClick={() => onSelectSlot('10:00-10:30')}>Choose slot</button>,
}));
jest.mock('@/components/appointments/AppointmentBookingDialog', () => ({
  __esModule: true,
  default: ({ open, patient }: any) => open ? <div>Booking for {patient?.name || 'missing patient'}</div> : null,
}));

it.each([AppointmentsCalendar, AppointmentScheduler])('loads the chart patient before opening booking', async (Component) => {
  render(<Component prefillPatientId="patient-1" controlledDoctorId="doctor-1" controlledDate="2099-01-01" hideHeaderControls />);
  await waitFor(() => expect(apiClient.getPatient).toHaveBeenCalledWith('patient-1'));
  await screen.findByRole('button', { name: 'Clear' });
  fireEvent.click(screen.getByRole('button', { name: 'Choose slot' }));
  expect(await screen.findByText('Booking for Chosen Patient')).toBeInTheDocument();
});

it('does not replace a newer selection when the chart lookup finishes late', async () => {
  let finish!: (value: any) => void;
  jest.mocked(apiClient.getPatient).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }) as any);
  const { result } = renderHook(() => {
    const [id, setId] = useState('');
    const [patient, setPatient] = useState<any>(null);
    usePrefilledPatient('patient-1', id, setId, setPatient);
    return { id, patient, setId, setPatient };
  });
  await waitFor(() => expect(finish).toBeDefined());
  act(() => { result.current.setId('patient-2'); result.current.setPatient({ id: 'patient-2', name: 'New choice' }); });
  await act(async () => finish({ id: 'patient-1', name: 'Old choice' }));
  expect(result.current.patient).toEqual({ id: 'patient-2', name: 'New choice' });
});
