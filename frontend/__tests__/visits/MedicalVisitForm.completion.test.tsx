import { act, fireEvent, render, screen } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), getPatient: jest.fn(), getPatientVisitHistory: jest.fn(), getAllPatientVisitHistory: jest.fn(), getVisits: jest.fn(), updateVisit: jest.fn(), createVisit: jest.fn(), completeVisit: jest.fn() } }));
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
let mockSettle: jest.Mock;
const doctorWrote = (pending: 'none' | 'save' | 'cancel', saving = false) => ({ hasComplaintOrDiagnosis: true, pending, saving });
jest.mock('@/components/visits/PrescriptionBuilder', () => function Editor({ onCompletionStateChange, settlePrescriptionRef, ensureVisitId }: any) {
  settlePrescriptionRef.current = () => mockSettle(ensureVisitId, onCompletionStateChange);
  return <>
    <button onClick={() => onCompletionStateChange(doctorWrote('save'))}>Write a complaint and two medicines</button>
    <button onClick={() => onCompletionStateChange(doctorWrote('none'))}>Write a complaint and advice only</button>
    <button onClick={() => onCompletionStateChange(doctorWrote('save', true))}>Press Create Prescription</button>
  </>;
});
jest.mock('@/components/visits/VisitPhotos', () => function Photos() { return null; });
jest.mock('@/components/tours', () => ({ DoctorTour: () => null }));

const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const completeButton = () => screen.getByRole('button', { name: /^(Complete visit|Completing\.\.\.)$/ });

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); localStorage.clear();
  mockSettle = jest.fn(async (ensureVisitId: () => Promise<string>, report: (state: object) => void) => {
    await ensureVisitId();
    report(doctorWrote('none'));
    return true;
  });
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

it('names what is missing until there is a complaint, then saves the prescription, completes and returns to the dashboard', async () => {
  render(<MedicalVisitForm patientId="p" doctorId="d" appointmentId="appt-1" userRole="DOCTOR" />); await flush();
  expect(completeButton()).toBeDisabled();
  expect(screen.getByText('Still needed: a complaint or a diagnosis. Progress does not verify clinical completeness.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Write a complaint and two medicines' }));
  expect(completeButton()).toBeEnabled();
  expect(screen.queryByText(/Still needed/)).not.toBeInTheDocument();

  await act(async () => { fireEvent.click(completeButton()); });
  await flush();
  expect(mockSettle).toHaveBeenCalledTimes(1);
  expect(apiClient.createVisit).toHaveBeenCalledTimes(1);
  expect(apiClient.updateVisit).toHaveBeenCalledWith('new-visit', expect.objectContaining({ version: 1, consultationType: 'IN_PERSON' }), expect.anything());
  expect(apiClient.completeVisit).toHaveBeenCalledWith('new-visit', { version: 2 }, expect.anything());
  expect(mockToast).toHaveBeenCalledWith({ variant: 'success', title: 'Visit completed', description: undefined });
  expect(mockPush).toHaveBeenCalledWith('/dashboard');
});

it('disables Complete visit while saving, ignores a second click, and stays on the visit when completion fails', async () => {
  let finishRx!: (saved: boolean) => void;
  mockSettle = jest.fn(() => new Promise(resolve => { finishRx = resolve; }));
  (apiClient.get as jest.Mock).mockResolvedValue({ id: 'v', version: 4, complaints: [] });
  (apiClient.updateVisit as jest.Mock).mockResolvedValue({ id: 'v', version: 5 });
  (apiClient.completeVisit as jest.Mock).mockRejectedValue(new Error('Server unavailable'));
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="DOCTOR" />); await flush();
  fireEvent.click(screen.getByRole('button', { name: 'Write a complaint and two medicines' }));

  await act(async () => { fireEvent.click(completeButton()); });
  expect(completeButton()).toHaveTextContent('Completing...');
  expect(completeButton()).toBeDisabled();
  fireEvent.click(completeButton());
  expect(mockSettle).toHaveBeenCalledTimes(1);

  await act(async () => { finishRx(true); });
  await flush();
  expect(apiClient.completeVisit).toHaveBeenCalledWith('v', { version: 5 }, expect.anything());
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Unable to save visit', description: 'Server unavailable' }));
  expect(mockPush).not.toHaveBeenCalled();
  expect(completeButton()).toHaveTextContent('Complete visit');
  expect(completeButton()).toBeEnabled();
});

it('completes a visit with no medicines without creating a prescription', async () => {
  render(<MedicalVisitForm patientId="p" doctorId="d" appointmentId="appt-1" userRole="DOCTOR" />); await flush();
  fireEvent.click(screen.getByRole('button', { name: 'Write a complaint and advice only' }));
  expect(completeButton()).toBeEnabled();
  await act(async () => { fireEvent.click(completeButton()); });
  await flush();
  expect(mockSettle).not.toHaveBeenCalled();
  expect(apiClient.createVisit).toHaveBeenCalledTimes(1);
  expect(apiClient.completeVisit).toHaveBeenCalledWith('new-visit', { version: 1 }, expect.anything());
  expect(mockPush).toHaveBeenCalledWith('/dashboard');
});

it('stops waiting for a new visit that never loads, says it was not completed, and completes on retry without saving twice', async () => {
  (apiClient.get as jest.Mock).mockImplementation((url: string) => url === '/visits/new-visit' ? new Promise(() => {}) : Promise.resolve({}));
  render(<MedicalVisitForm patientId="p" doctorId="d" appointmentId="appt-1" userRole="DOCTOR" />); await flush();
  fireEvent.click(screen.getByRole('button', { name: 'Write a complaint and two medicines' }));
  await act(async () => { fireEvent.click(completeButton()); });
  await flush();
  expect(completeButton()).toHaveTextContent('Completing...');
  await act(async () => { jest.advanceTimersByTime(9_000); });
  expect(completeButton()).toBeDisabled();
  await act(async () => { jest.advanceTimersByTime(1_500); });
  await flush();
  expect(mockToast).toHaveBeenCalledWith({ variant: 'destructive', title: 'Visit not completed', description: 'The visit took too long to load. Press Complete visit again to retry.' });
  expect(apiClient.completeVisit).not.toHaveBeenCalled();
  expect(completeButton()).toHaveTextContent('Complete visit');
  expect(completeButton()).toBeEnabled();

  await act(async () => { fireEvent.click(completeButton()); });
  await flush();
  expect(mockSettle).toHaveBeenCalledTimes(1);
  expect(apiClient.createVisit).toHaveBeenCalledTimes(1);
  expect(apiClient.completeVisit).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith('/dashboard');
});

it('checks the shortcut like the button: no complaint means nothing is saved', async () => {
  render(<MedicalVisitForm patientId="p" doctorId="d" appointmentId="appt-1" userRole="DOCTOR" />); await flush();
  await act(async () => { fireEvent.keyDown(document, { key: 'S', ctrlKey: true, shiftKey: true }); });
  await flush();
  expect(mockSettle).not.toHaveBeenCalled();
  expect(apiClient.createVisit).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith({ variant: 'warning', title: 'More details needed to complete', description: 'Still needed: a complaint or a diagnosis.' });
});

it('holds Complete visit while Create Prescription is saving', async () => {
  render(<MedicalVisitForm patientId="p" doctorId="d" appointmentId="appt-1" userRole="DOCTOR" />); await flush();
  fireEvent.click(screen.getByRole('button', { name: 'Press Create Prescription' }));
  expect(completeButton()).toBeDisabled();
  await act(async () => { fireEvent.keyDown(document, { key: 'S', ctrlKey: true, shiftKey: true }); });
  expect(mockSettle).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith({ variant: 'warning', title: 'Prescription still saving', description: 'Complete the visit once the prescription is saved.' });
  fireEvent.click(screen.getByRole('button', { name: 'Write a complaint and two medicines' }));
  expect(completeButton()).toBeEnabled();
});

it("shows a nurse's progress over the sections a nurse can see", async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({ id: 'v', version: 4, complaints: [] });
  (apiClient.updateVisit as jest.Mock).mockResolvedValue({ id: 'v', version: 5 });
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="NURSE" />); await flush();
  expect(screen.getByText('Vitals:')).toBeInTheDocument();
  expect(screen.getByText('Photos:')).toBeInTheDocument();
  expect(screen.getByText('0%')).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Vitals' }));
  await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Save vitals' })); });
  await flush();
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Overview' }));
  expect(await screen.findByText('50%')).toBeInTheDocument();
});
