import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import VisitsPage from '@/app/dashboard/visits/page';
import { apiClient } from '@/lib/api';
let mockQuery = '';
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mockQuery) }));
jest.mock('@/lib/api', () => ({ apiClient: { getPatients: jest.fn(), getPatient: jest.fn().mockResolvedValue({ id: 'patient-123', name: 'Synthetic Patient' }), getUser: jest.fn().mockResolvedValue({ id: 'doctor-123', firstName: 'Synthetic', lastName: 'Doctor' }), get: jest.fn(), getAllPatientVisitHistory: jest.fn().mockResolvedValue([]), getAppointment: jest.fn() } }));
jest.mock('@/components/visits/MedicalVisitForm', () => function Form({ headerActions }: { headerActions?: React.ReactNode }) { return <div data-testid="medical-form">{headerActions}</div>; });
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
  fireEvent.click(screen.getByRole('button', { name: 'Start visit' }));
  expect(await screen.findByTestId('medical-form')).toBeInTheDocument();
});
it('opens a patient deep link and allows returning to setup', async () => {
  mockQuery = 'patientId=patient-123';
  render(<VisitsPage />);
  expect(await screen.findByTestId('medical-form')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  await screen.findByRole('tab', { name: 'Patient History' });
  await waitFor(() => expect(screen.queryByTestId('medical-form')).not.toBeInTheDocument());
});
it('leaves an appointment visit through a link to the landing page, never through browser history', async () => {
  mockQuery = 'patientId=patient-123&appointmentId=appointment-1&autoStart=true';
  jest.mocked(apiClient.getAppointment).mockResolvedValue({ id: 'appointment-1', patientId: 'patient-123', doctorId: 'doctor-123', slot: '11:30-11:45', visitType: 'OPD', status: 'CONFIRMED' });
  const back = jest.spyOn(window.history, 'back');
  render(<VisitsPage />);
  expect(await screen.findByRole('link', { name: 'Back' })).toHaveAttribute('href', '/dashboard');
  expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  expect(back).not.toHaveBeenCalled();
});
