import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MedicalVisitForm from '@/components/visits/MedicalVisitForm';
import { apiClient } from '@/lib/api';
import { mergeClinicalPatch } from '@/lib/clinical-patch';

jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn(), getPatient: jest.fn().mockResolvedValue({ id: 'p', name: 'Synthetic patient' }),
  getClinicAssets: jest.fn().mockResolvedValue([]), getPrinterProfiles: jest.fn().mockResolvedValue([]),
  getAllPatientVisitHistory: jest.fn().mockResolvedValue([]), getPatientVisitHistory: jest.fn().mockResolvedValue({ visits: [] }),
  getVisits: jest.fn().mockResolvedValue({ visits: [] }), getPrescriptions: jest.fn().mockResolvedValue({ prescriptions: [] }),
  getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [] }), getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
  autocompletePrescriptionField: jest.fn().mockResolvedValue([]), updateVisit: jest.fn(), createVisit: jest.fn(), completeVisit: jest.fn(), createPrescription: jest.fn(), updatePrescription: jest.fn(),
} }));
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
let mockPhotoVersion: ((version: number) => void) | undefined;
jest.mock('@/components/visits/VisitPhotos', () => function Photos({ onVisitVersion }: any) { mockPhotoVersion = onVisitVersion; return null; });
jest.mock('@/components/tours', () => ({ DoctorTour: () => null }));

let saved: Record<string, any>;
beforeEach(() => {
  localStorage.clear(); jest.clearAllMocks();
  saved = {
    id: 'v', patientId: 'p', doctorId: 'd', version: 3, status: 'IN_PROGRESS', complaints: [{ complaint: 'Keep complaint' }],
    diagnosis: [{ diagnosis: 'Saved diagnosis' }], history: { pastHistory: 'Saved past history', medicationHistory: 'Saved medication history', menstrualHistory: 'Saved menstrual history', personalHistory: 'Keep personal history' },
    exam: { generalAppearance: 'Keep examination' }, vitals: { systolicBP: 120, diastolicBP: 80, heartRate: 72, weight: 60, height: 160 },
    plan: { followUpDate: '2026-10-15', followUpInstructions: 'Saved instructions', investigations: ['CBC'], procedurePlanned: 'Saved procedure plan', dermatology: { procedures: [{ type: 'Saved procedure' }], counseling: 'Keep advice' } },
  };
  (apiClient.get as jest.Mock).mockImplementation(async url => url === '/visits/v' ? JSON.parse(JSON.stringify(saved)) : {});
  (apiClient.updateVisit as jest.Mock).mockImplementation(async (_id, patch) => {
    if (patch.version !== saved.version) throw Object.assign(new Error('Visit changed'), { status: 409 });
    const { treatmentPlan, examination, version, ...rest } = patch;
    saved = mergeClinicalPatch(saved, { ...rest, plan: treatmentPlan, exam: examination, version: saved.version + 1 });
    return JSON.parse(JSON.stringify(saved));
  });
});

async function openForm() {
  const view = render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />);
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Prescription' }), { button: 0, ctrlKey: false });
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Diagnosis' })).toHaveValue('Saved diagnosis'));
  return view;
}

it('omits hydrated fields when saving an unrelated note', async () => {
  await openForm();
  fireEvent.change(screen.getByRole('textbox', { name: 'Past history' }), { target: { value: 'Edited history' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })));
  const patch = (apiClient.updateVisit as jest.Mock).mock.calls.at(-1)[1];
  expect(patch.history).toEqual({ pastHistory: 'Edited history', personalHistory: 'Keep personal history' });
  expect(patch.diagnosis).toBeUndefined();
  expect(patch.vitals).toBeUndefined();
  expect(patch.treatmentPlan).toBeUndefined();
  expect(patch.status).toBeUndefined();
});

it('clears populated clinical fields and keeps them clear after saving and reopening from the server', async () => {
  const view = await openForm();
  for (const label of ['Diagnosis', 'Past history', 'Medication history', 'Menstrual history', 'Follow-up instructions', 'Procedures performed', 'Procedures planned', 'Review date']) {
    fireEvent.change(screen.getByLabelText(label, { selector: 'input,textarea' }), { target: { value: '' } });
  }
  for (const label of ['Systolic blood pressure', 'Diastolic blood pressure', 'Pulse', 'Weight', 'Height']) {
    fireEvent.change(screen.getByRole('spinbutton', { name: label }), { target: { value: '' } });
  }
  fireEvent.click(within(document.getElementById('section-investigations-content')!).getByRole('checkbox', { name: 'CBC' }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })));
  expect(saved).toMatchObject({
    diagnosis: [], history: { pastHistory: '', medicationHistory: '', menstrualHistory: '', personalHistory: 'Keep personal history' },
    vitals: { systolicBP: null, diastolicBP: null, heartRate: null, weight: null, height: null },
    plan: { followUpDate: null, followUpInstructions: '', investigations: [], procedurePlanned: '', dermatology: { procedures: [], counseling: 'Keep advice' } },
    complaints: [{ complaint: 'Keep complaint' }], exam: { generalAppearance: 'Keep examination' },
  });
  view.unmount(); localStorage.clear();
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />);
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Prescription' }), { button: 0, ctrlKey: false });
  await waitFor(() => expect(screen.getByLabelText('Personal history')).toHaveValue('Keep personal history'));
  expect(screen.getByRole('textbox', { name: 'Diagnosis' })).toHaveValue('');
  expect(screen.getByLabelText('Past history')).toHaveValue('');
  expect(screen.getByLabelText('Review date')).toHaveValue('');
  expect(screen.getByLabelText('Follow-up instructions')).toHaveValue('');
  expect(screen.getByLabelText('Procedures performed')).toHaveValue('');
  expect(screen.getByLabelText('Systolic blood pressure')).toHaveValue(null);
  expect(within(document.getElementById('section-investigations-content')!).getByRole('checkbox', { name: 'CBC' })).not.toBeChecked();
});

it('keeps an intentional clear while delayed hydration fills untouched siblings', async () => {
  let resolveVisit!: (value: unknown) => void;
  const pending = new Promise(resolve => { resolveVisit = resolve; });
  (apiClient.get as jest.Mock).mockImplementation(url => url === '/visits/v' ? pending : Promise.resolve({}));
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />);
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Prescription' }), { button: 0, ctrlKey: false });
  fireEvent.change(screen.getByLabelText('Past history'), { target: { value: 'New draft' } });
  fireEvent.change(screen.getByLabelText('Past history'), { target: { value: '' } });
  await act(async () => resolveVisit(saved));
  expect(screen.getByLabelText('Past history')).toHaveValue('');
  expect(screen.getByLabelText('Medication history')).toHaveValue('Saved medication history');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })));
  expect(saved.history).toEqual({ pastHistory: '', medicationHistory: 'Saved medication history', menstrualHistory: 'Saved menstrual history', personalHistory: 'Keep personal history' });
});

it('loads completed walk-in status from the server even when an old local draft says in-progress', async () => {
  saved.status = 'COMPLETED'; saved.completedAt = '2026-10-05T10:00:00Z';
  localStorage.setItem('clinic:visit-draft:d:p:visit-v', JSON.stringify({ version: 1, data: { visitStatus: 'in-progress' } }));
  await openForm();
  expect(screen.getAllByText('COMPLETED').length).toBeGreaterThan(0);
});

it('recovers a rejected clear after immediate unmount without resurrecting the server value', async () => {
  const view = await openForm();
  (apiClient.updateVisit as jest.Mock).mockRejectedValueOnce(new Error('Synthetic offline failure'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Diagnosis' }), { target: { value: '' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Past history' }), { target: { value: '' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })));
  view.unmount();
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />);
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Prescription' }), { button: 0, ctrlKey: false });
  await waitFor(() => expect(screen.getByLabelText('Personal history')).toHaveValue('Keep personal history'));
  expect(screen.getByRole('textbox', { name: 'Diagnosis' })).toHaveValue('');
  expect(screen.getByRole('textbox', { name: 'Past history' })).toHaveValue('');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })));
  expect(saved.diagnosis).toEqual([]);
  expect(saved.history.pastHistory).toBe('');
});


it('advances the acknowledged version for consecutive saves and retains a conflicting edit', async () => {
  await openForm();
  fireEvent.change(screen.getByRole('textbox', { name: 'Past history' }), { target: { value: 'First edit' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })));
  expect((apiClient.updateVisit as jest.Mock).mock.calls.at(-1)[1].version).toBe(3);
  fireEvent.change(screen.getByRole('textbox', { name: 'Past history' }), { target: { value: '' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })));
  expect((apiClient.updateVisit as jest.Mock).mock.calls.at(-1)[1].version).toBe(4);
  expect(saved.history.pastHistory).toBe('');
  saved.version += 1;
  fireEvent.change(screen.getByRole('textbox', { name: 'Past history' }), { target: { value: 'Unsaved local note' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })));
  expect(screen.getByText('Save failed')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Past history' })).toHaveValue('Unsaved local note');
  expect(saved.history.pastHistory).toBe('');
});


it('keeps a conflicting draft across reopening and explicitly replaces it with the saved visit', async () => {
  const view = await openForm();
  fireEvent.change(screen.getByLabelText('Past history'), { target: { value: 'Conflicting local history' } });
  saved.version = 4;
  saved.history.pastHistory = 'History saved elsewhere';
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })));
  view.unmount();
  render(<MedicalVisitForm patientId="p" doctorId="d" initialVisitId="v" userRole="ADMIN" />);
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Prescription' }), { button: 0, ctrlKey: false });
  await waitFor(() => expect(screen.getByLabelText('Past history')).toHaveValue('Conflicting local history'));
  expect(screen.getByRole('alert')).toHaveTextContent('Autosave is paused');
  expect(JSON.parse(localStorage.getItem('clinic:visit-draft:d:p:visit-v')!).data).toMatchObject({ visitVersion: 3, saveConflict: true });

  (apiClient.get as jest.Mock).mockResolvedValueOnce(JSON.parse(JSON.stringify(saved))).mockRejectedValue(new Error('No second fetch needed for recovery'));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Discard draft and reload saved visit' })));
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Prescription' }), { button: 0, ctrlKey: false });
  await waitFor(() => expect(screen.getByLabelText('Past history')).toHaveValue('History saved elsewhere'));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(localStorage.getItem('rxDraft:p:v') || '').not.toContain('Conflicting local history');
  fireEvent.change(screen.getByLabelText('Past history'), { target: { value: 'Reviewed new edit' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })));
  expect((apiClient.updateVisit as jest.Mock).mock.calls.at(-1)[1].version).toBe(4);
  expect(saved.history.pastHistory).toBe('Reviewed new edit');
  expect(saved.version).toBe(5);
});

it('retains the conflicting draft when loading the saved visit fails', async () => {
  await openForm();
  fireEvent.change(screen.getByLabelText('Past history'), { target: { value: 'Keep until reload succeeds' } });
  saved.version = 4;
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })));
  (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('Synthetic reload failure'));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Discard draft and reload saved visit' })));
  expect(screen.getByRole('alert')).toHaveTextContent('Autosave is paused');
  expect(screen.getByLabelText('Past history')).toHaveValue('Keep until reload succeeds');
  expect(JSON.parse(localStorage.getItem('clinic:visit-draft:d:p:visit-v')!).data).toMatchObject({ visitVersion: 3, saveConflict: true });
  expect(localStorage.getItem('clinic:visit-draft:d:p:visit-v')).toContain('Keep until reload succeeds');
});


it.each(['create', 'update'])('blocks autosave after an Rx %s conflict despite later photo receipts, until explicit recovery', async mode => {
  jest.useFakeTimers();
  try {
    localStorage.setItem('rxDraft:p:v', JSON.stringify({ items: [{ drugName: 'Synthetic medicine', frequency: 'ONCE_DAILY', dosageUnit: 'MG', duration: 7, durationUnit: 'DAYS' }] }));
    if (mode === 'update') saved.prescription = { id: 'rx' };
    const saveRx = (mode === 'update' ? apiClient.updatePrescription : apiClient.createPrescription) as jest.Mock;
    saveRx.mockRejectedValue(Object.assign(new Error('Visit changed; reload before saving'), { status: 409 }));
    await openForm();
    fireEvent.change(screen.getByLabelText('Past history'), { target: { value: 'Stale Rx edit' } });
    saved.version = 4;
    saved.history.pastHistory = 'Saved externally';
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create Prescription' })));
    expect(saveRx.mock.calls.at(-1)[mode === 'update' ? 1 : 0].clinicalData.version).toBe(3);
    expect(screen.getByRole('alert')).toHaveTextContent('Autosave is paused');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Visit changed elsewhere' }));
    expect(JSON.parse(localStorage.getItem('clinic:visit-draft:d:p:visit-v')!).data).toMatchObject({ visitVersion: 3, saveConflict: true });
    expect(localStorage.getItem('rxDraft:p:v')).toContain('Stale Rx edit');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Photos' }), { button: 0, ctrlKey: false });
    saved.version = 5;
    await act(async () => mockPhotoVersion!(5));
    await act(async () => jest.advanceTimersByTime(40000));
    expect(apiClient.updateVisit).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('clinic:visit-draft:d:p:visit-v')!).data).toMatchObject({ visitVersion: 3, saveConflict: true });
    expect(localStorage.getItem('rxDraft:p:v')).toContain('Stale Rx edit');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Discard draft and reload saved visit' })));
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Prescription' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.getByLabelText('Past history')).toHaveValue('Saved externally'));
    fireEvent.change(screen.getByLabelText('Past history'), { target: { value: 'Reviewed edit' } });
    await act(async () => jest.advanceTimersByTime(8100));
    expect(apiClient.updateVisit).toHaveBeenLastCalledWith('v', expect.objectContaining({ version: 5, history: expect.objectContaining({ pastHistory: 'Reviewed edit' }) }), expect.anything());
  } finally { jest.useRealTimers(); }
});


it('identifies a duplicate prescription while preserving its clinical draft for reconciliation', async () => {
  localStorage.setItem('rxDraft:p:v', JSON.stringify({ items: [{ drugName: 'Synthetic medicine', frequency: 'ONCE_DAILY', dosageUnit: 'MG', duration: 7, durationUnit: 'DAYS' }] }));
  (apiClient.createPrescription as jest.Mock).mockRejectedValue(Object.assign(new Error('Prescription already exists for this visit'), { status: 409 }));
  await openForm();
  fireEvent.change(screen.getByLabelText('Past history'), { target: { value: 'Keep duplicate attempt detail' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create Prescription' })));
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Prescription already exists' }));
  expect(screen.getByLabelText('Past history')).toHaveValue('Keep duplicate attempt detail');
  expect(screen.getByRole('alert')).toHaveTextContent('Autosave is paused');
});


it.each(['manual', 'Rx'])('requires explicit recovery when an appointment visit appears during %s creation', async mode => {
  jest.useFakeTimers();
  try {
    let appeared = false;
    saved.version = 4;
    saved.appointmentId = 'appointment';
    saved.history.pastHistory = 'Concurrent saved history';
    (apiClient.getVisits as jest.Mock).mockImplementation(async () => ({ visits: appeared ? [saved] : [] }));
    (apiClient.createVisit as jest.Mock).mockImplementation(async () => {
      appeared = true;
      throw Object.assign(new Error('Visit already exists for this appointment'), { status: 409 });
    });
    localStorage.setItem('rxDraft:p:standalone', JSON.stringify({ items: [{ drugName: 'Synthetic medicine', frequency: 'ONCE_DAILY', dosageUnit: 'MG', duration: 7, durationUnit: 'DAYS' }] }));
    render(<MedicalVisitForm patientId="p" doctorId="d" appointmentId="appointment" userRole="ADMIN" />);
    await act(async () => {});
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Prescription' }), { button: 0, ctrlKey: false });
    fireEvent.change(screen.getByLabelText('Past history'), { target: { value: 'Unsaved new-visit history' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: mode === 'manual' ? 'Save Draft' : 'Create Prescription' })));
    expect(apiClient.createVisit).toHaveBeenCalled();
    expect(apiClient.updateVisit).not.toHaveBeenCalled();
    expect(apiClient.createPrescription).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Autosave is paused');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Prescription' }), { button: 0, ctrlKey: false });
    expect(screen.getByLabelText('Past history')).toHaveValue('Unsaved new-visit history');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create Prescription' })));
    await act(async () => jest.advanceTimersByTime(40000));
    expect(apiClient.updateVisit).not.toHaveBeenCalled();
    expect(apiClient.createPrescription).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Discard draft and reload saved visit' })));
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Prescription' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.getByLabelText('Past history')).toHaveValue('Concurrent saved history'));
    fireEvent.change(screen.getByLabelText('Past history'), { target: { value: 'Reviewed appointment edit' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Draft' })));
    expect(apiClient.updateVisit).toHaveBeenLastCalledWith('v', expect.objectContaining({ version: 4 }), expect.anything());
  } finally { jest.useRealTimers(); }
});
