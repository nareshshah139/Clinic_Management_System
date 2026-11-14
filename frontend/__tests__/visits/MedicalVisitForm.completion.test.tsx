import { act, fireEvent, render, screen } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), getPatient: jest.fn(), getPatientVisitHistory: jest.fn(), getAllPatientVisitHistory: jest.fn(), getVisits: jest.fn(), updateVisit: jest.fn(), createVisit: jest.fn(), completeVisit: jest.fn() } }));
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
let mockRxSave: jest.Mock;
jest.mock('@/components/visits/PrescriptionBuilder', () => function Editor({ onCompletionStateChange, savePrescriptionRef, ensureVisitId }: any) {
  savePrescriptionRef.current = () => mockRxSave(ensureVisitId);
  return <button onClick={() => onCompletionStateChange({ hasComplaintOrDiagnosis: true, medicines: 2, unsavedMedicines: true, saved: false })}>Write a complaint and two medicines</button>;
});
jest.mock('@/components/visits/VisitPhotos', () => function Photos() { return null; });
jest.mock('@/components/tours', () => ({ DoctorTour: () => null }));

const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const completeButton = () => screen.getByRole('button', { name: /^(Complete visit|Completing\.\.\.)$/ });

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); localStorage.clear();
  mockRxSave = jest.fn(async (ensureVisitId: () => Promise<string>) => { await ensureVisitId(); return 'rx-1'; });
  (apiClient.get as jest.Mock).mockResolvedValue({});
  (apiClient.getPatient as jest.Mock).mockResolvedValue({ id: 'p', name: 'Synthetic Patient' });
  (apiClient.getPatientVisitHistory as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.getAllPatientVisitHistory as jest.Mock).mockResolvedValue([]);
  (apiClient.getVisits as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.createVisit as jest.Mock).mockResolvedValue({ id: 'new-visit', version: 1 });
  (apiClient.updateVisit as jest.Mock).mockResolvedValue({ id: 'new-visit', version: 2 });
  (apiClient.completeVisit as jest.Mock).mockResolvedValue({ id: 'new-visit', status: 'COMPLETED', version: 3 });
});
afterEach(() => jest.useRealTimers());

it('opens a doctor on the Prescription tab and other roles on Overview', async () => {
  const { unmount } = render(<MedicalVisitForm patientId="p" doctorId="d" userRole="DOCTOR" />); await flush();
  expect(screen.getByRole('tab', { name: 'Prescription' })).toHaveAttribute('aria-selected', 'true');
  unmount();
  render(<MedicalVisitForm patientId="p2" doctorId="d" userRole="NURSE" />); await flush();
  expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
});

it('names what is missing until there is a complaint and a medicine, then saves the prescription, completes and returns to the dashboard', async () => {
  render(<MedicalVisitForm patientId="p" doctorId="d" appointmentId="appt-1" userRole="DOCTOR" />); await flush();
  expect(completeButton()).toBeDisabled();
  expect(screen.getByText('Still needed: complaint or diagnosis, prescription. Progress does not verify clinical completeness.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Write a complaint and two medicines' }));
  expect(completeButton()).toBeEnabled();
  expect(screen.queryByText(/Still needed/)).not.toBeInTheDocument();

  await act(async () => { fireEvent.click(completeButton()); });
  await flush();
  expect(mockRxSave).toHaveBeenCalledTimes(1);
  expect(apiClient.createVisit).toHaveBeenCalledTimes(1);
  expect(apiClient.updateVisit).toHaveBeenCalledWith('new-visit', expect.objectContaining({ version: 1, consultationType: 'IN_PERSON' }), expect.anything());
  expect(apiClient.completeVisit).toHaveBeenCalledWith('new-visit', { version: 2 }, expect.anything());
  expect(mockToast).toHaveBeenCalledWith({ variant: 'success', title: 'Visit completed', description: undefined });
  expect(mockPush).toHaveBeenCalledWith('/dashboard');
});

it('disables Complete visit while saving, ignores a second click, and stays on the visit when completion fails', async () => {
  let finishRx!: (id: string) => void;
  mockRxSave = jest.fn(() => new Promise(resolve => { finishRx = resolve; }));
  (apiClient.get as jest.Mock).mockResolvedValue({ id: 'v', version: 4, complaints: [] });
  (apiClient.updateVisit as jest.Mock).mockResolvedValue({ id: 'v', version: 5 });
  (apiClient.completeVisit as jest.Mock).mockRejectedValue(new Error('Server unavailable'));
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="DOCTOR" />); await flush();
  fireEvent.click(screen.getByRole('button', { name: 'Write a complaint and two medicines' }));

  await act(async () => { fireEvent.click(completeButton()); });
  expect(completeButton()).toHaveTextContent('Completing...');
  expect(completeButton()).toBeDisabled();
  fireEvent.click(completeButton());
  expect(mockRxSave).toHaveBeenCalledTimes(1);

  await act(async () => { finishRx('rx-1'); });
  await flush();
  expect(apiClient.completeVisit).toHaveBeenCalledWith('v', { version: 5 }, expect.anything());
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Unable to save visit', description: 'Server unavailable' }));
  expect(mockPush).not.toHaveBeenCalled();
  expect(completeButton()).toHaveTextContent('Complete visit');
  expect(completeButton()).toBeEnabled();
});
