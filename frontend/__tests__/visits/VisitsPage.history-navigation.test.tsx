import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import VisitsPage from '@/app/dashboard/visits/page';
import { apiClient } from '@/lib/api';
let mockQuery = '';
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mockQuery) }));
jest.mock('@/lib/api', () => ({ apiClient: { getPatients: jest.fn(), get: jest.fn(), getAllPatientVisitHistory: jest.fn().mockResolvedValue([]) } }));
jest.mock('@/components/visits/MedicalVisitForm', () => function Form() { return <div data-testid="medical-form" />; });
jest.mock('@/components/patients/PatientProgressTracker', () => function Tracker() { return null; });
jest.mock('@/components/common/QuickGuide', () => ({ QuickGuide: () => null }));
beforeEach(() => {
  mockQuery = '';
  jest.clearAllMocks();
  jest.mocked(apiClient.getPatients).mockResolvedValue({ patients: [{ id: 'patient-123', name: 'Synthetic Patient' }] });
  jest.mocked(apiClient.get).mockImplementation(async (endpoint) => endpoint === '/auth/me' ? { role: 'ADMIN' } : { users: [{ id: 'doctor-123', firstName: 'Synthetic', lastName: 'Doctor' }] });
});
it('keeps setup and history accessible after selecting a patient', async () => {
  render(<VisitsPage />);
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
  render(<VisitsPage />);
  expect(await screen.findByTestId('medical-form')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back to Setup' }));
  await screen.findByRole('tab', { name: 'Patient History' });
  await waitFor(() => expect(screen.queryByTestId('medical-form')).not.toBeInTheDocument());
});
