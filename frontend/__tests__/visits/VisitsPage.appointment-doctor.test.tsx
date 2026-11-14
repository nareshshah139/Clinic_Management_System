import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import VisitsPage from '@/app/dashboard/visits/page';
import { apiClient } from '@/lib/api';
const navigation = jest.requireMock('next/navigation');

jest.mock('@/lib/api', () => ({
  apiClient: {
    getPatients: jest.fn(), getPatient: jest.fn(), getUser: jest.fn(), get: jest.fn(), getAppointment: jest.fn(),
    getPatientVisitHistory: jest.fn(), getAllPatientVisitHistory: jest.fn(), getVisits: jest.fn(),
    updateVisit: jest.fn(), createVisit: jest.fn(), completeVisit: jest.fn(),
  },
}));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }), toast: jest.fn() }));
jest.mock('@/components/visits/PrescriptionBuilder', () => function Editor() { return null; });
jest.mock('@/components/visits/VisitPhotos', () => function Photos() { return null; });
jest.mock('@/components/tours/DoctorTour', () => ({ DoctorTour: () => null }));

const doctors = [
  { id: 'doctor-1', firstName: 'Shravya', lastName: 'Rao' },
  { id: 'doctor-2', firstName: 'Praneeta', lastName: 'Jain' },
];

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  HTMLElement.prototype.scrollIntoView = jest.fn();
  jest.mocked(apiClient.getPatients).mockResolvedValue({ data: [{ id: 'patient-123', name: 'Patient' }] } as any);
  jest.mocked(apiClient.getPatient).mockResolvedValue({ id: 'patient-123', firstName: 'Pat', lastName: 'Ient' } as any);
  jest.mocked(apiClient.getUser).mockImplementation(async (id: string) => doctors.find((d) => d.id === id) as any);
  jest.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === '/auth/me') return { id: 'doctor-1', role: 'DOCTOR' } as any;
    if (path === '/users') return { users: doctors, pagination: { totalPages: 1 } } as any;
    return {} as any;
  });
  jest.mocked(apiClient.getAppointment).mockResolvedValue({ id: 'appt-1', patientId: 'patient-123', doctorId: 'doctor-2' } as any);
  jest.mocked(apiClient.getPatientVisitHistory).mockResolvedValue({ visits: [] } as any);
  jest.mocked(apiClient.getAllPatientVisitHistory).mockResolvedValue([] as any);
  jest.mocked(apiClient.getVisits).mockResolvedValue({ visits: [] } as any);
  jest.mocked(apiClient.createVisit).mockResolvedValue({ id: 'new-visit', version: 0 } as any);
  jest.spyOn(navigation, 'useSearchParams').mockReturnValue(
    new URLSearchParams('patientId=patient-123&appointmentId=appt-1&doctorId=doctor-1') as any,
  );
});

it("saves a colleague's appointment visit under the appointment's doctor", async () => {
  render(<VisitsPage />);
  const picker = await screen.findByRole('combobox', { name: 'Attending doctor' });
  await waitFor(() => expect(picker).toHaveTextContent('Dr. Praneeta Jain'));
  expect(picker).toBeDisabled();

  await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Save Draft' })); });

  await waitFor(() => expect(apiClient.createVisit).toHaveBeenCalled());
  expect(apiClient.createVisit).toHaveBeenCalledWith(
    expect.objectContaining({ patientId: 'patient-123', doctorId: 'doctor-2', appointmentId: 'appt-1' }),
    expect.anything(),
  );
});

it('disables the picker once a visit is created in this session', async () => {
  jest.spyOn(navigation, 'useSearchParams').mockReturnValue(new URLSearchParams('patientId=patient-123') as any);
  jest.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === '/auth/me') return { id: 'admin-1', role: 'ADMIN' } as any;
    if (path === '/users') return { users: doctors, pagination: { totalPages: 1 } } as any;
    return {} as any;
  });
  render(<VisitsPage />);
  fireEvent.click(await screen.findByRole('combobox', { name: 'Select Doctor' }));
  fireEvent.click(await screen.findByRole('option', { name: /Dr\. Shravya Rao/ }));
  const picker = await screen.findByRole('combobox', { name: 'Attending doctor' });
  expect(picker).toBeEnabled();

  await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Save Draft' })); });

  await waitFor(() => expect(picker).toBeDisabled());
  expect(apiClient.createVisit).toHaveBeenCalledWith(expect.objectContaining({ doctorId: 'doctor-1' }), expect.anything());
});
