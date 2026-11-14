import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import VisitsPage from '@/app/dashboard/visits/page';
import { apiClient } from '@/lib/api';

let mockQuery = '';
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mockQuery) }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    getPatients: jest.fn(),
    getPatient: jest.fn().mockResolvedValue({ id: 'patient-1', name: 'Synthetic Patient' }),
    getUser: jest.fn().mockResolvedValue({ id: 'd1', firstName: 'Synthetic', lastName: 'Doctor' }),
    get: jest.fn(),
    getAppointment: jest.fn(),
    getAllPatientVisitHistory: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('@/components/visits/MedicalVisitForm', () => function Form({ doctorId }: { doctorId: string }) {
  return <div data-testid="medical-form">Doctor: {doctorId}</div>;
});
jest.mock('@/components/patients/PatientProgressTracker', () => function Tracker() { return null; });
jest.mock('@/components/common/QuickGuide', () => ({ QuickGuide: () => null }));

const D1 = 'cdoctor1aaaaaaaaaaaaaaaaaaaaa';
const D2 = 'cdoctor2bbbbbbbbbbbbbbbbbbbbb';
const doctors = [
  { id: D1, firstName: 'Arjun', lastName: 'Bhatt' },
  { id: D2, firstName: 'Priya', lastName: 'Menon' },
];

function mockUsers(me: unknown, usersImpl?: (params: any) => unknown) {
  jest.mocked(apiClient.get).mockImplementation(async (path: string, params?: any) => {
    if (path === '/auth/me') {
      if (me instanceof Error) throw me;
      return me as any;
    }
    return (usersImpl ? usersImpl(params) : { users: doctors }) as any;
  });
}

beforeEach(() => {
  mockQuery = '';
  jest.clearAllMocks();
  jest.mocked(apiClient.getPatients).mockResolvedValue({ patients: [{ id: 'patient-1', name: 'Synthetic Patient' }] } as never);
});

describe('VisitsPage load and default doctor', () => {
  it('defaults to the signed-in doctor', async () => {
    mockUsers({ id: D2, role: 'DOCTOR' });
    render(<VisitsPage />);
    const trigger = await screen.findByRole('combobox', { name: 'Select Doctor' });
    await waitFor(() => expect(trigger).toHaveTextContent('Dr. Priya Menon'));
  });

  it('keeps the first doctor for a login that is not in the doctor list', async () => {
    mockUsers({ id: 'u9', role: 'RECEPTION' });
    render(<VisitsPage />);
    const trigger = await screen.findByRole('combobox', { name: 'Select Doctor' });
    await waitFor(() => expect(trigger).toHaveTextContent('Dr. Arjun Bhatt'));
  });

  it('keeps the first doctor when /auth/me fails', async () => {
    mockUsers(new Error('boom'));
    render(<VisitsPage />);
    const trigger = await screen.findByRole('combobox', { name: 'Select Doctor' });
    await waitFor(() => expect(trigger).toHaveTextContent('Dr. Arjun Bhatt'));
  });

  it('a doctorId link wins over the signed-in doctor', async () => {
    mockQuery = `patientId=${'c' + 'p'.repeat(24)}&doctorId=${D1}`;
    jest.mocked(apiClient.getPatients).mockResolvedValue({ patients: [{ id: 'c' + 'p'.repeat(24), name: 'Synthetic Patient' }] } as never);
    mockUsers({ id: D2, role: 'DOCTOR' });
    render(<VisitsPage />);
    expect(await screen.findByTestId('medical-form')).toHaveTextContent(`Doctor: ${D1}`);
  });

  it('a failed patients request offers Retry instead of Setup Required', async () => {
    mockUsers({ id: D2, role: 'DOCTOR' });
    jest.mocked(apiClient.getPatients)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ patients: [{ id: 'patient-1', name: 'Synthetic Patient' }] } as never);
    render(<VisitsPage />);
    expect(await screen.findByText("Couldn't load visit setup")).toBeInTheDocument();
    expect(screen.queryByText('Setup Required')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByPlaceholderText('Search name, phone, or email')).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load visit setup")).not.toBeInTheDocument();
  });

  it('a failed doctors page fails the load visibly', async () => {
    mockUsers({ id: D2, role: 'DOCTOR' }, (params) => {
      if (params?.page === 2) throw new Error('page 2 failed');
      return { users: doctors, pagination: { totalPages: 2 } };
    });
    render(<VisitsPage />);
    expect(await screen.findByText("Couldn't load visit setup")).toBeInTheDocument();
    expect(screen.queryByText('Setup Required')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
