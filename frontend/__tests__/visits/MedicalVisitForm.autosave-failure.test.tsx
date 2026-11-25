import { act, fireEvent, render, screen } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';
import { UserRole } from '@cms/shared-types';
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), getPatient: jest.fn(), getPatientVisitHistory: jest.fn(), getAllPatientVisitHistory: jest.fn(), getVisits: jest.fn(), updateVisit: jest.fn(), createVisit: jest.fn(), completeVisit: jest.fn() } }));
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@/components/visits/VisitPhotos', () => function Photos() { return null; });
jest.mock('@/components/tours/DoctorTour', () => ({ DoctorTour: () => null }));
jest.mock('@/components/visits/PrescriptionBuilder', () => function Editor({ onClinicalDataChange }: any) {
  const React = jest.requireActual('react');
  const [note, setNote] = React.useState(undefined);
  React.useEffect(() => { onClinicalDataChange({ history: { pastHistory: note } }); }, [note, onClinicalDataChange]);
  return <input aria-label="Clinical note" onChange={(event: any) => setNote(event.target.value)} />;
});

const flush = async () => { await act(async () => { jest.advanceTimersByTime(100); await Promise.resolve(); }); };

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); localStorage.clear();
  (apiClient.get as jest.Mock).mockResolvedValue({ id: 'v', patientId: 'p', version: 3, status: 'IN_PROGRESS', consultationType: 'IN_PERSON', complaints: [], history: {}, plan: {}, exam: {} });
  (apiClient.getPatient as jest.Mock).mockResolvedValue({ id: 'p', name: 'Synthetic Patient' });
  (apiClient.getPatientVisitHistory as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.getAllPatientVisitHistory as jest.Mock).mockResolvedValue([]);
  (apiClient.getVisits as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.updateVisit as jest.Mock).mockRejectedValue(Object.assign(new Error('Service unavailable'), { status: 503 }));
});
afterEach(() => { jest.useRealTimers(); });

it('tells the doctor once that autosave failed while it keeps retrying', async () => {
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole={UserRole.ADMIN} />);
  await flush(); await flush();
  fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'Itchy plaques on elbows' } });
  await flush();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await act(async () => { jest.advanceTimersByTime(16000); });
    await flush();
  }

  expect((apiClient.updateVisit as jest.Mock).mock.calls.length).toBe(3);
  expect(mockToast.mock.calls.map(([toast]) => toast.title)).toEqual(['Auto-save failed']);
  expect(screen.getByRole('status')).toHaveTextContent('Save failed');
});

it('tells the doctor again when autosave fails after it had recovered', async () => {
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole={UserRole.ADMIN} />);
  await flush(); await flush();
  fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'Itchy plaques' } });
  await act(async () => { jest.advanceTimersByTime(9000); });
  await flush();

  (apiClient.updateVisit as jest.Mock).mockResolvedValue({ id: 'v', version: 4, status: 'IN_PROGRESS' });
  await act(async () => { jest.advanceTimersByTime(16000); });
  await flush();
  expect(screen.getByRole('status')).toHaveTextContent(/^Saved/);

  (apiClient.updateVisit as jest.Mock).mockRejectedValue(Object.assign(new Error('Service unavailable'), { status: 503 }));
  fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'Itchy plaques on elbows' } });
  await act(async () => { jest.advanceTimersByTime(9000); });
  await flush();

  expect(mockToast.mock.calls.map(([toast]) => toast.title)).toEqual(['Auto-save failed', 'Auto-save failed']);
});
