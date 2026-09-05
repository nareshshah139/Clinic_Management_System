import { act, fireEvent, render, screen } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), getPatient: jest.fn(), getPatientVisitHistory: jest.fn(), getAllPatientVisitHistory: jest.fn(), getVisits: jest.fn(), updateVisit: jest.fn(), createVisit: jest.fn(), completeVisit: jest.fn() } }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/components/visits/PrescriptionBuilder', () => function Editor({ onClinicalDataChange }: any) { return <input aria-label="Clinical note" onChange={e => onClinicalDataChange({ history: { pastHistory: e.target.value } })} />; });
jest.mock('@/components/visits/VisitPhotos', () => function Photos() { return null; });
jest.mock('@/components/tours', () => ({ DoctorTour: () => null }));
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); localStorage.clear();
  (apiClient.get as jest.Mock).mockResolvedValue({ id: 'v', patientId: 'p', complaints: [], history: {}, plan: {}, exam: {} });
  (apiClient.getPatient as jest.Mock).mockResolvedValue({ id: 'p', name: 'Synthetic Patient' });
  (apiClient.getPatientVisitHistory as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.getAllPatientVisitHistory as jest.Mock).mockResolvedValue([]);
  (apiClient.getVisits as jest.Mock).mockResolvedValue({ visits: [] });
  (apiClient.updateVisit as jest.Mock).mockResolvedValue({ id: 'v' });
});
afterEach(() => { jest.useRealTimers(); });
async function openForm() { render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />); await flush(); }
it('autosaves editor-only notes and includes them in the recoverable draft', async () => {
  await openForm(); fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'Synthetic clinical detail' } });
  await act(async () => { jest.advanceTimersByTime(8100); });
  expect(apiClient.updateVisit).toHaveBeenCalledWith('v', expect.objectContaining({ history: { pastHistory: 'Synthetic clinical detail' } }), expect.anything());
  expect(Object.values(localStorage).some(value => String(value).includes('Synthetic clinical detail'))).toBe(true);
});
it('does not mark newer edits saved when an older request finishes', async () => {
  let finish: (v: any) => void = () => {};
  (apiClient.updateVisit as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await openForm(); fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'First draft' } });
  await act(async () => { jest.advanceTimersByTime(8100); });
  fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'Newer draft' } });
  await act(async () => finish({ id: 'v' }));
  expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(8100); });
  expect(apiClient.updateVisit).toHaveBeenLastCalledWith('v', expect.objectContaining({ history: { pastHistory: 'Newer draft' } }), expect.anything());
});
it('keeps notes in the local draft and reports a rejected save', async () => {
  (apiClient.updateVisit as jest.Mock).mockRejectedValue(new Error('Synthetic network failure'));
  await openForm(); fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'Keep on failure' } });
  await act(async () => { jest.advanceTimersByTime(8100); });
  expect(screen.getByText('Save failed')).toBeInTheDocument();
  expect(Object.values(localStorage).some(value => String(value).includes('Keep on failure'))).toBe(true);
});
it('saves editor-only notes through the explicit Save Draft action', async () => {
  await openForm(); fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'Manual save detail' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })); });
  expect(apiClient.updateVisit).toHaveBeenCalledWith('v', expect.objectContaining({ history: { pastHistory: 'Manual save detail' } }), expect.anything());
});
it('stops automatic retries when authentication expires', async () => {
  (apiClient.updateVisit as jest.Mock).mockRejectedValue(Object.assign(new Error('Expired'), { status: 401 }));
  await openForm(); fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'Keep until signed in' } });
  await act(async () => { jest.advanceTimersByTime(8100); });
  const attempts = (apiClient.updateVisit as jest.Mock).mock.calls.length;
  await act(async () => { jest.advanceTimersByTime(30000); });
  expect((apiClient.updateVisit as jest.Mock).mock.calls.length).toBe(attempts);
  expect(screen.getByText('Save failed')).toBeInTheDocument();
});
