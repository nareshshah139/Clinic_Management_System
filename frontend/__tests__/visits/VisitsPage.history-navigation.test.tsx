import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import VisitsPage from '@/app/dashboard/visits/page';
import { useEffect, useState, type ReactNode } from 'react';
import { DashboardUserProvider } from '@/components/layout/dashboard-user-context';
import type { User } from '@/lib/types';
import { apiClient } from '@/lib/api';
let mockQuery = '';
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mockQuery) }));
jest.mock('@/lib/api', () => ({ apiClient: { getPatients: jest.fn(), getPatient: jest.fn().mockResolvedValue({ id: 'patient-123', name: 'Synthetic Patient' }), getUser: jest.fn().mockResolvedValue({ id: 'doctor-123', firstName: 'Synthetic', lastName: 'Doctor' }), get: jest.fn(), getAllPatientVisitHistory: jest.fn().mockResolvedValue([]) } }));
jest.mock('@/components/visits/MedicalVisitForm', () => function Form({ identity }: { identity?: React.ReactNode }) { return <div data-testid="medical-form">{identity}</div>; });
jest.mock('@/components/patients/PatientProgressTracker', () => function Tracker() { return null; });
jest.mock('@/components/common/QuickGuide', () => ({ QuickGuide: () => null }));
function LayoutSession({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ user: User | null; loading: boolean }>({ user: null, loading: true });
  useEffect(() => {
    apiClient.get<User>('/auth/me').then((user) => setSession({ user, loading: false }), () => setSession({ user: null, loading: false }));
  }, []);
  return <DashboardUserProvider value={{ ...session, refresh: async () => {}, logout: async () => {} }}>{children}</DashboardUserProvider>;
}
beforeEach(() => {
  mockQuery = '';
  jest.clearAllMocks();
  jest.mocked(apiClient.getPatients).mockResolvedValue({ patients: [{ id: 'patient-123', name: 'Synthetic Patient' }] });
  jest.mocked(apiClient.get).mockImplementation(async (endpoint) => endpoint === '/auth/me' ? { id: 'doctor-123', role: 'DOCTOR' } : { users: [{ id: 'doctor-123', firstName: 'Synthetic', lastName: 'Doctor' }] });
});
it('keeps setup and history accessible after selecting a patient', async () => {
  render(<VisitsPage />, { wrapper: LayoutSession });
  const search = await screen.findByPlaceholderText('Search name, phone, or email');
  expect(screen.queryByTestId('medical-form')).not.toBeInTheDocument();
  fireEvent.focus(search);
  fireEvent.keyDown(search, { key: 'Enter' });
  await screen.findByRole('tab', { name: 'Patient History' });
  expect(screen.queryByTestId('medical-form')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Start Visit Documentation' }));
  expect(await screen.findByTestId('medical-form')).toBeInTheDocument();
});
it('opens a patient deep link and allows returning to setup', async () => {
  mockQuery = 'patientId=patient-123';
  render(<VisitsPage />, { wrapper: LayoutSession });
  expect(await screen.findByTestId('medical-form')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back to Setup' }));
  await screen.findByRole('tab', { name: 'Patient History' });
  await waitFor(() => expect(screen.queryByTestId('medical-form')).not.toBeInTheDocument());
});
it('opens on the patient and doctor pickers, and lists matches by name and phone without internal ids', async () => {
  jest.mocked(apiClient.getPatients).mockResolvedValue({ patients: [{ id: 'cmwft0hg900047d31j1bsifdp', name: 'Ananya Reddy', phone: '9848010000' }] } as never);
  render(<VisitsPage />, { wrapper: LayoutSession });
  const search = await screen.findByPlaceholderText('Search name, phone, or email');
  expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Visit Documentation']);
  expect(['Start New Visit', 'Your Role & Permissions', 'Available Features'].map((text) => screen.queryByText(text) !== null)).toEqual([true, false, false]);
  fireEvent.focus(search);
  const match = await screen.findByRole('option', { name: /Ananya Reddy/ });
  expect(match).toHaveTextContent(/^Ananya Reddy9848010000$/);
});
