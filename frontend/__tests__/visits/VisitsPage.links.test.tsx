import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import VisitsPage from '@/app/dashboard/visits/page';
import { useEffect, useState, type ReactNode } from 'react';
import { DashboardUserProvider } from '@/components/layout/dashboard-user-context';
import type { User } from '@/lib/types';
import { apiClient } from '@/lib/api';
import { UserRole } from '@cms/shared-types';

let mockQuery = '';
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mockQuery) }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    getPatients: jest.fn(),
    getPatient: jest.fn(),
    getUser: jest.fn(),
    get: jest.fn(),
    getAppointment: jest.fn(),
    getAllPatientVisitHistory: jest.fn().mockResolvedValue([]),
    getOpenVisit: jest.fn().mockResolvedValue({ visit: null }),
  },
}));
jest.mock('@/components/visits/MedicalVisitForm', () => function Form({ patientId, doctorId, initialVisitId, appointmentId, visitDate, identity, onUnsavedChange }: { patientId: string; doctorId: string; initialVisitId?: string; appointmentId?: string; visitDate?: string; identity?: ReactNode; onUnsavedChange?: (unsaved: boolean) => void }) {
  return (
    <div>
      <button type="button" onClick={() => onUnsavedChange?.(true)}>Type a note</button>
      <p data-testid="medical-form">{`Patient: ${patientId}, Doctor: ${doctorId}, Visit: ${initialVisitId ?? 'new'}, Appointment: ${appointmentId ?? 'none'}`}</p>
      <p data-testid="draft-day">{visitDate}</p>
      {identity}
    </div>
  );
});
jest.mock('@/components/patients/PatientProgressTracker', () => function Tracker() { return null; });
jest.mock('@/components/common/QuickGuide', () => ({ QuickGuide: () => null }));

function LayoutSession({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ user: User | null; loading: boolean }>({ user: null, loading: true });
  useEffect(() => {
    apiClient.get<User>('/auth/me').then((user) => setSession({ user, loading: false }), () => setSession({ user: null, loading: false }));
  }, []);
  return <DashboardUserProvider value={{ ...session, refresh: async () => {}, logout: async () => {} }}>{children}</DashboardUserProvider>;
}

const patients = [
  { id: 'cpatientasha00000000000001', name: 'Asha Verma' },
  { id: 'cpatientbhavna000000000001', name: 'Bhavna Rao' },
];
const doctors = [
  { id: 'doctor-me', firstName: 'Signed', lastName: 'In' },
  { id: 'doctor-booked', firstName: 'Praneeta', lastName: 'Jain' },
];

beforeEach(() => {
  mockQuery = '';
  jest.clearAllMocks();
  jest.mocked(apiClient.getPatients).mockResolvedValue({ patients } as never);
  jest.mocked(apiClient.getPatient).mockImplementation(async (id: string) => patients.find((p) => p.id === id) as never);
  jest.mocked(apiClient.getUser).mockImplementation(async (id: string) => doctors.find((d) => d.id === id) as never);
  jest.mocked(apiClient.get).mockImplementation(async (endpoint: string) => {
    if (endpoint === '/auth/me') return { id: 'doctor-me', role: UserRole.DOCTOR } as never;
    if (endpoint === '/visits/cvisitofasha000000000000001') return { id: 'cvisitofasha000000000000001', patient: { id: 'cpatientasha00000000000001' }, doctor: { id: 'doctor-me' } } as never;
    return { users: doctors } as never;
  });
});

it("starts a fresh visit for a newly chosen patient instead of reopening the linked patient's visit", async () => {
  mockQuery = 'visitId=cvisitofasha000000000000001';
  render(<VisitsPage />, { wrapper: LayoutSession });
  expect(await screen.findByTestId('medical-form')).toHaveTextContent('Patient: cpatientasha00000000000001, Doctor: doctor-me, Visit: cvisitofasha000000000000001');

  fireEvent.click(screen.getByRole('button', { name: 'Back to Setup' }));
  fireEvent.focus(await screen.findByPlaceholderText('Search name, phone, or email'));
  fireEvent.click(await screen.findByRole('option', { name: /Bhavna Rao/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Start Visit Documentation' }));

  expect(await screen.findByTestId('medical-form')).toHaveTextContent('Patient: cpatientbhavna000000000001, Doctor: doctor-me, Visit: new');
});

it('opens the booked patient and doctor from a link that carries only the appointment', async () => {
  mockQuery = 'appointmentId=capptasha0000000000000000001';
  jest.mocked(apiClient.getAppointment).mockResolvedValue({
    id: 'capptasha0000000000000000001',
    patientId: 'cpatientasha00000000000001',
    doctorId: 'doctor-booked',
  } as never);
  render(<VisitsPage />, { wrapper: LayoutSession });
  expect(await screen.findByTestId('medical-form')).toHaveTextContent(
    'Patient: cpatientasha00000000000001, Doctor: doctor-booked, Visit: new, Appointment: capptasha0000000000000000001',
  );
});

it('keys a walk-in draft to the clinic day, so a reload later that day finds it', async () => {
  jest.useFakeTimers({ advanceTimers: true });
  jest.setSystemTime(new Date('2026-11-24T18:40:00Z'));
  mockQuery = 'patientId=cpatientasha00000000000001';
  const first = render(<VisitsPage />, { wrapper: LayoutSession });
  expect(await screen.findByTestId('draft-day')).toHaveTextContent(/^2026-11-25$/);
  first.unmount();

  jest.setSystemTime(new Date('2026-11-24T19:15:00Z'));
  render(<VisitsPage />, { wrapper: LayoutSession });
  expect(await screen.findByTestId('draft-day')).toHaveTextContent(/^2026-11-25$/);
  jest.useRealTimers();
});

it('asks before Back to Setup leaves a visit with unsaved changes', async () => {
  mockQuery = 'patientId=cpatientasha00000000000001';
  render(<VisitsPage />, { wrapper: LayoutSession });
  await screen.findByTestId('medical-form');
  fireEvent.click(screen.getByRole('button', { name: 'Type a note' }));

  fireEvent.click(screen.getByRole('button', { name: 'Back to Setup' }));
  expect(await screen.findByRole('alertdialog', { name: 'Leave with unsaved changes?' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(screen.getByTestId('medical-form')).toHaveTextContent('Patient: cpatientasha00000000000001');

  fireEvent.click(screen.getByRole('button', { name: 'Back to Setup' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Leave anyway' }));
  expect(await screen.findByRole('button', { name: 'Start Visit Documentation' })).toBeInTheDocument();
  expect(screen.queryByTestId('medical-form')).not.toBeInTheDocument();
});
