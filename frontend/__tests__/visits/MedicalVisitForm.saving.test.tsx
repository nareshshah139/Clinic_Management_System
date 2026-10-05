import { act, fireEvent, render, screen } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), getPatient: jest.fn(), getPatientVisitHistory: jest.fn(), getAllPatientVisitHistory: jest.fn(), getVisits: jest.fn(), updateVisit: jest.fn(), createVisit: jest.fn(), completeVisit: jest.fn() } }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
let mockPhotoVersion: ((version: number) => void) | undefined;
let mockRxSaved: ((visit: { version: number }) => void) | undefined;
let mockExportResult: Promise<string> | undefined;
jest.mock('@/components/visits/PrescriptionBuilder', () => function Editor({ onClinicalDataChange, onBeforeExport, onVisitSaved }: any) { mockRxSaved = onVisitSaved; return <><button onClick={() => { mockExportResult = onBeforeExport(); }}>Export saved visit</button><button onClick={() => onClinicalDataChange({ vitals: { systolicBP: 110 } })}>Set editor blood pressure</button><input aria-label="Clinical note" onChange={e => onClinicalDataChange({ history: { pastHistory: e.target.value } })} /></>; });
jest.mock('@/components/visits/VisitPhotos', () => function Photos({ onVisitVersion }: any) { mockPhotoVersion = onVisitVersion; return null; });
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
it('saves all parent-form sections together, including independent subjective and assessment notes', async () => {
  localStorage.setItem('clinic:visit-draft:d:p:visit-v', JSON.stringify({ version: 1, visitId: 'v', data: {
    complaints: ['Complaint'], subjective: 'Subjective narrative', objective: 'Objective narrative', assessment: 'Assessment narrative', plan: 'Treatment narrative',
    vitals: { bpS: '120', bpD: '80', hr: '72', temp: '98.6', weight: '60', height: '160', spo2: '99', rr: '16' },
    skinConcerns: ['Dryness'], painScore: '0', skinType: 'III', morphology: ['Papules'], distribution: ['Face'], acneSeverity: 'Mild', itchScore: '0', triggers: 'Sun', priorTx: 'Prior cream', dermDx: ['Diagnosis'],
    procType: 'Laser', fluence: '12', spotSize: '4', passes: '2', topicals: 'Topical plan', systemics: 'Systemic plan', counseling: 'Advice', reviewDate: '2026-10-01',
    labSelections: ['CBC'], labResults: { CBC: { value: '12', unit: 'g/dL', notes: 'Result note' } }, completedSections: [],
  } }));
  await openForm();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })); });
  const payload = (apiClient.updateVisit as jest.Mock).mock.calls.at(-1)[1];
  expect(payload).toMatchObject({
    complaints: [{ complaint: 'Complaint' }], history: { subjective: 'Subjective narrative' }, scribeJson: { assessment: 'Assessment narrative' },
    vitals: { systolicBP: 120, diastolicBP: 80, heartRate: 72, temperature: 37, weight: 60, height: 160, oxygenSaturation: 99, respiratoryRate: 16 },
    examination: { generalAppearance: 'Objective narrative', dermatology: { skinType: 'III', morphology: ['Papules'], distribution: ['Face'], acneSeverity: 'Mild', itchScore: 0, painScore: 0, triggers: 'Sun', priorTreatments: 'Prior cream', skinConcerns: ['Dryness'] } },
    diagnosis: [{ diagnosis: 'Diagnosis' }], treatmentPlan: { notes: 'Treatment narrative', followUpDate: '2026-10-01', dermatology: { procedures: [{ type: 'Laser', fluence: 12, spotSize: 4, passes: 2 }], medications: { topicals: 'Topical plan', systemics: 'Systemic plan' }, counseling: 'Advice', investigations: ['CBC'], labResults: { CBC: { value: '12', unit: 'g/dL', notes: 'Result note' } } } },
  });
});

it('keeps the latest vitals-tab edit when the prescription editor holds an older value', async () => {
  await openForm();
  fireEvent.click(screen.getByRole('button', { name: 'Set editor blood pressure' }));
  fireEvent.change(screen.getAllByPlaceholderText('mmHg')[0], { target: { value: '130' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })); });
  expect(apiClient.updateVisit).toHaveBeenLastCalledWith('v', expect.objectContaining({ vitals: expect.objectContaining({ systolicBP: 130 }) }), expect.anything());
});

it('saves the full current form and returns the confirmed visit ID before export', async () => {
  await openForm();
  fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'Latest note for PDF' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Export saved visit' })); });
  await expect(mockExportResult).resolves.toBe('v');
  expect(apiClient.updateVisit).toHaveBeenCalledWith('v', expect.objectContaining({ history: { pastHistory: 'Latest note for PDF' } }), expect.anything());
});

it('blocks export if newer form edits arrive while saving', async () => {
  let finish!: (value: any) => void;
  (apiClient.updateVisit as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await openForm();
  fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'First note' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Export saved visit' })); });
  const rejected = expect(mockExportResult).rejects.toThrow('latest visit details');
  fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'New note during save' } });
  await act(async () => finish({ id: 'v' }));
  await rejected;
  expect(Object.values(localStorage).some(value => String(value).includes('New note during save'))).toBe(true);
});


it.each(['manual', 'autosave'])('keeps the newest mutation acknowledgement when an older %s response arrives late', async mode => {
  let finish!: (value: unknown) => void;
  let serverVersion = 3;
  let first = true;
  (apiClient.get as jest.Mock).mockResolvedValue({ id: 'v', version: 3, patientId: 'p', complaints: [], history: {}, plan: {}, exam: {} });
  (apiClient.updateVisit as jest.Mock).mockImplementation((_id, payload) => {
    if (payload.version !== serverVersion) return Promise.reject(Object.assign(new Error('Stale version'), { status: 409 }));
    serverVersion += 1;
    if (first) {
      first = false;
      return new Promise(resolve => { finish = resolve; });
    }
    return Promise.resolve({ id: 'v', version: serverVersion });
  });
  await openForm();
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Photos' }), { button: 0, ctrlKey: false });
  fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'First edit' } });
  await act(async () => {
    if (mode === 'manual') fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    else jest.advanceTimersByTime(8100);
  });
  serverVersion = 5;
  await act(async () => { mockPhotoVersion!(5); });
  await act(async () => { finish({ id: 'v', version: 4 }); });
  await act(async () => { mockRxSaved!({ version: 4 }); });
  fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'Newest edit' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })));
  expect(apiClient.updateVisit).toHaveBeenLastCalledWith('v', expect.objectContaining({ version: 5, history: { pastHistory: 'Newest edit' } }), expect.anything());
  expect(serverVersion).toBe(6);
  expect(screen.queryByText('Save failed')).not.toBeInTheDocument();
});

it('keeps a manual conflict draft without retrying automatically or rebasing after further edits', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({ id: 'v', version: 3, patientId: 'p', complaints: [], history: {}, plan: {}, exam: {} });
  (apiClient.updateVisit as jest.Mock).mockRejectedValue(Object.assign(new Error('Visit changed elsewhere'), { status: 409 }));
  await openForm();
  fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'Keep conflicted edit' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })));
  expect(apiClient.updateVisit).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(40000); });
  expect(apiClient.updateVisit).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'Keep newer local edit' } });
  await act(async () => { jest.advanceTimersByTime(40000); });
  expect(apiClient.updateVisit).toHaveBeenCalledTimes(1);
  expect(Object.values(localStorage).some(value => String(value).includes('Keep newer local edit'))).toBe(true);
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Photos' }), { button: 0, ctrlKey: false });
  await act(async () => { mockPhotoVersion!(5); mockRxSaved!({ version: 4 }); });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })));
  expect(apiClient.updateVisit).toHaveBeenCalledTimes(2);
  expect(apiClient.updateVisit).toHaveBeenLastCalledWith('v', expect.objectContaining({ version: 3 }), expect.anything());
});


it('pauses autosave for a restored stale draft before it can overwrite a newer server visit', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({ id: 'v', version: 3, status: 'IN_PROGRESS' });
  const view = render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />);
  await flush();
  fireEvent.change(screen.getByLabelText('Clinical note'), { target: { value: 'Offline draft' } });
  view.unmount();
  (apiClient.get as jest.Mock).mockResolvedValue({ id: 'v', version: 4, status: 'IN_PROGRESS' });
  await openForm();
  expect(screen.getByRole('alert')).toHaveTextContent('Autosave is paused');
  await act(async () => { jest.advanceTimersByTime(40000); });
  expect(apiClient.updateVisit).not.toHaveBeenCalled();
  const draft = JSON.parse(localStorage.getItem('clinic:visit-draft:d:p:visit-v')!);
  expect(draft.data.visitVersion).toBe(3);
  expect(draft.data.prescriptionClinical.history.pastHistory).toBe('Offline draft');
});
