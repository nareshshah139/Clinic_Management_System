import { fireEvent, render, screen } from '@testing-library/react';
import VisitsPage from '@/app/dashboard/visits/page';
import { apiClient } from '@/lib/api';
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }));
jest.mock('@/lib/api', () => ({ apiClient: { getPatients: jest.fn(), getPatient: jest.fn().mockResolvedValue({ id: 'patient-123', name: 'Synthetic Patient' }), getUser: jest.fn().mockResolvedValue({ id: 'doctor-123', firstName: 'Synthetic', lastName: 'Doctor' }), get: jest.fn(), getAllPatientVisitHistory: jest.fn().mockResolvedValue([]) } }));
jest.mock('@/components/visits/MedicalVisitForm', () => function Form() { return <div data-testid="medical-form" />; });
jest.mock('@/components/patients/PatientProgressTracker', () => function Tracker() { return null; });
jest.mock('@/components/common/QuickGuide', () => ({ QuickGuide: () => null }));
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(apiClient.getPatients).mockResolvedValue({ patients: [{ id: 'patient-123', name: 'Synthetic Patient' }] } as never);
  jest.mocked(apiClient.get).mockImplementation(async (endpoint) => endpoint === '/auth/me' ? { role: 'ADMIN' } : { users: [{ id: 'doctor-123', firstName: 'Synthetic', lastName: 'Doctor' }] });
});
it('Start stays available while history is shown', async () => {
  render(<VisitsPage />);
  const search = await screen.findByPlaceholderText('Search name, phone, or email');
  fireEvent.focus(search);
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(await screen.findByText('No documented history to show')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start Visit Documentation' })).toBeInTheDocument();
  expect(screen.getByText('Ready to start visit')).toBeInTheDocument();
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
});
it('the setup screen has no role cards', async () => {
  render(<VisitsPage />);
  await screen.findByPlaceholderText('Search name, phone, or email');
  expect(screen.queryByText('Your Role & Permissions')).not.toBeInTheDocument();
  expect(screen.queryByText('Available Features')).not.toBeInTheDocument();
});
