import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import VisitsPage from '@/app/dashboard/visits/page';
import { apiClient } from '@/lib/api';
let mockQuery = '';
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mockQuery) }));
jest.mock('@/lib/api', () => ({ apiClient: { getPatients: jest.fn(), getPatient: jest.fn().mockResolvedValue({ id: 'patient-123', name: 'Synthetic Patient' }), get: jest.fn(), getAppointment: jest.fn(), getAllPatientVisitHistory: jest.fn().mockResolvedValue([]) } }));
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
  await screen.findByRole('button', { name: /Synthetic Patient/ });
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

describe('which doctor a visit is for', () => {
  const doctors = { users: [{ id: 'doctor-a', firstName: 'Ada', lastName: 'One' }, { id: 'doctor-b', firstName: 'Bea', lastName: 'Two' }] };

  it('starts a patient visit for the signed-in doctor, not the first doctor in the list', async () => {
    mockQuery = 'patientId=patient-123&autoStart=true';
    jest.mocked(apiClient.get).mockImplementation(async (endpoint) => endpoint === '/auth/me' ? { id: 'doctor-b', role: 'DOCTOR' } : doctors);
    render(<VisitsPage />);
    expect(await screen.findByTestId('medical-form')).toBeInTheDocument();
    expect(screen.getByText(/Patient: Synthetic Patient/)).toHaveTextContent('Doctor: Dr. Bea Two');
  });

  it('asks a non-doctor to choose when there are several doctors', async () => {
    mockQuery = 'patientId=patient-123&autoStart=true';
    jest.mocked(apiClient.get).mockImplementation(async (endpoint) => endpoint === '/auth/me' ? { id: 'reception-1', role: 'RECEPTION' } : doctors);
    render(<VisitsPage />);
    expect(await screen.findByText('Please select a doctor to start the visit.')).toBeInTheDocument();
    expect(screen.queryByTestId('medical-form')).not.toBeInTheDocument();
  });

  it('opens an appointment-only link with that appointment\'s patient and doctor', async () => {
    mockQuery = 'appointmentId=appt-1';
    jest.mocked(apiClient.get).mockImplementation(async (endpoint) => endpoint === '/auth/me' ? { id: 'doctor-b', role: 'DOCTOR' } : doctors);
    jest.mocked(apiClient.getAppointment).mockResolvedValue({ id: 'appt-1', patientId: 'patient-123', doctorId: 'doctor-a', slot: '10:00-10:30', visitType: 'OPD' } as never);
    render(<VisitsPage />);
    expect(await screen.findByTestId('medical-form')).toBeInTheDocument();
    expect(screen.getByText(/Patient: Synthetic Patient/)).toHaveTextContent('Doctor: Dr. Ada One');
  });
});
