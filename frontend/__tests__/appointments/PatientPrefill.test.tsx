import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import AppointmentsCalendar from '@/components/appointments/AppointmentsCalendar';
import { apiClient } from '@/lib/api';
import { usePrefilledPatient } from '@/components/appointments/usePrefilledPatient';
import { usePatientBox } from '@/components/appointments/usePatientBox';

jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }), toast: jest.fn() }));
jest.mock('@/lib/api', () => ({ apiClient: {
  getPatient: jest.fn().mockResolvedValue({ id: 'patient-1', name: 'Chosen Patient' }),
  getAppointments: jest.fn().mockResolvedValue({ appointments: [] }),
  getUsers: jest.fn().mockResolvedValue({ users: [] }),
  getUser: jest.fn().mockResolvedValue({}),
  getRooms: jest.fn().mockResolvedValue({ rooms: [] }),
  getAvailableSlots: jest.fn().mockResolvedValue({ availableSlots: [] }),
  getGoogleCalendarStatus: jest.fn().mockResolvedValue({ connected: false }),
  getGoogleCalendarConfigured: jest.fn().mockResolvedValue({ configured: false }),
} }));
jest.mock('@/components/appointments/DoctorDayCalendar', () => ({
  __esModule: true,
  default: ({ onSelectSlot }: any) => <button onClick={() => onSelectSlot('10:00-10:30', 'SCHEDULED')}>Choose slot</button>,
}));
jest.mock('@/components/appointments/AppointmentBookingDialog', () => ({
  __esModule: true,
  default: ({ open, patient }: any) => open ? <div>Booking for {patient?.name || 'missing patient'}</div> : null,
}));

it('loads the chart patient before opening booking', async () => {
  render(<AppointmentsCalendar prefillPatientId="patient-1" controlledDoctorId="doctor-1" controlledDate="2099-01-01" hideHeaderControls />);
  await waitFor(() => expect(apiClient.getPatient).toHaveBeenCalledWith('patient-1'));
  await screen.findByRole('button', { name: 'Clear' });
  fireEvent.click(screen.getByRole('button', { name: 'Choose slot' }));
  expect(await screen.findByText('Booking for Chosen Patient')).toBeInTheDocument();
});

it('does not replace a newer selection when the chart lookup finishes late', async () => {
  let finish!: (value: any) => void;
  jest.mocked(apiClient.getPatient).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }) as any);
  const { result } = renderHook(() => {
    const patientBox = usePatientBox(async () => []);
    usePrefilledPatient('patient-1', patientBox);
    return patientBox;
  });
  await waitFor(() => expect(finish).toBeDefined());
  act(() => { result.current.select({ id: 'patient-2', name: 'New choice' } as any); });
  await act(async () => finish({ id: 'patient-1', name: 'Old choice' }));
  expect(result.current.box).toEqual({ kind: 'selected', patient: { id: 'patient-2', name: 'New choice' } });
});
