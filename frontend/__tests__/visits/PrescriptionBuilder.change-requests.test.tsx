import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn().mockResolvedValue({}), post: jest.fn(), getClinicAssets: jest.fn().mockResolvedValue([]),
  getPrinterProfiles: jest.fn().mockResolvedValue([]), getPatientVisitHistory: jest.fn().mockResolvedValue({ visits: [] }),
  getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [] }), getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
  autocompletePrescriptionField: jest.fn().mockResolvedValue([]),
  getInvestigationOptions: jest.fn().mockResolvedValue([]), createInvestigationOption: jest.fn(), updateInvestigationOption: jest.fn(), deleteInvestigationOption: jest.fn(),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

beforeEach(() => {
  localStorage.clear(); jest.clearAllMocks();
  jest.mocked(apiClient.get).mockImplementation(async url => url === '/auth/me' ? { role: 'DOCTOR' } : {});
  jest.mocked(apiClient.getInvestigationOptions).mockResolvedValue([]);
});

it('keeps detailed examination collapsed, remembers the doctor choice and preserves values', async () => {
  const onClinicalDataChange = jest.fn();
  const { unmount } = render(<PrescriptionBuilder patientId="p" visitId={null} doctorId="d" onClinicalDataChange={onClinicalDataChange} />);
  await waitFor(() => expect(apiClient.getInvestigationOptions).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: 'On Examination' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('button', { name: 'Acne vulgaris' })).not.toBeInTheDocument();
  expect(screen.queryByText('Triggers')).not.toBeInTheDocument();
  expect(screen.queryByText('Prior Treatments')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Examination' }), { target: { value: 'Dry patches on both arms' } });
  fireEvent.click(screen.getByRole('button', { name: 'On Examination' }));
  fireEvent.click(screen.getByRole('button', { name: 'Acne vulgaris' }));
  fireEvent.click(screen.getByRole('button', { name: 'On Examination' }));
  expect(onClinicalDataChange).toHaveBeenLastCalledWith(expect.objectContaining({ examination: expect.objectContaining({ generalAppearance: 'Dry patches on both arms' }) }));
  expect(localStorage.getItem('cms:examination:expanded:d')).toBe('false');
  unmount();
  render(<PrescriptionBuilder patientId="next" visitId={null} doctorId="d" />);
  expect(screen.getByRole('button', { name: 'On Examination' })).toHaveAttribute('aria-expanded', 'false');
});

it('inserts a row after a middle medicine without moving its edited regimen to another medicine', async () => {
  localStorage.setItem('rxDraft:p:standalone', JSON.stringify({ items: [
    { drugName: 'First', frequency: '', duration: 3, durationUnit: 'WEEKS', dosage: '', dosageUnit: 'TABLET', instructions: 'Keep first instructions' },
    { drugName: 'Second', frequency: '', duration: 8, durationUnit: 'DAYS', dosage: '', dosageUnit: 'TABLET', instructions: 'Keep second instructions' },
  ] }));
  render(<PrescriptionBuilder patientId="p" visitId={null} doctorId="d" />);
  await screen.findByDisplayValue('Second');
  const secondInput = screen.getByDisplayValue('Second');
  fireEvent.click(screen.getByRole('button', { name: 'Add row after First' }));
  expect(screen.getAllByPlaceholderText('Search medicine name...').map(input => (input as HTMLInputElement).value)).toEqual(['First', '', 'Second']);
  expect(screen.getByDisplayValue('Second')).toBe(secondInput);
  expect(screen.getByRole('spinbutton', { name: 'Duration for First' })).toHaveValue(3);
  expect(screen.getByRole('spinbutton', { name: 'Duration for Second' })).toHaveValue(8);
  expect(screen.getByRole('textbox', { name: 'Instructions for Second' })).toHaveValue('Keep second instructions');
});

it('saves custom investigations to the catalog and retains visit snapshots through rename and removal', async () => {
  const option = { id: 'test', name: 'Patch test', version: 1 };
  jest.mocked(apiClient.createInvestigationOption).mockResolvedValue(option);
  jest.mocked(apiClient.updateInvestigationOption).mockResolvedValue({ ...option, name: 'Extended patch test', version: 2 });
  jest.mocked(apiClient.deleteInvestigationOption).mockResolvedValue({ archived: true });
  const onClinicalDataChange = jest.fn();
  render(<PrescriptionBuilder patientId="p" visitId={null} doctorId="d" onClinicalDataChange={onClinicalDataChange} />);
  await waitFor(() => expect(screen.getByPlaceholderText('e.g., MRI Brain, CT Scan')).not.toBeDisabled());
  fireEvent.change(screen.getByPlaceholderText('e.g., MRI Brain, CT Scan'), { target: { value: 'Patch test' } });
  fireEvent.keyDown(screen.getByPlaceholderText('e.g., MRI Brain, CT Scan'), { key: 'Enter' });
  expect(await screen.findByRole('checkbox', { name: 'Patch test' })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Manage saved investigations' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit Patch test' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Rename Patch test' }), { target: { value: 'Extended patch test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
  expect(await screen.findByRole('checkbox', { name: 'Extended patch test' })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Patch test' })).toBeChecked();
  expect(apiClient.updateInvestigationOption).toHaveBeenCalledWith('test', 'Extended patch test', 1);
  fireEvent.click(screen.getByRole('button', { name: 'Remove Extended patch test from reusable list' }));
  await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Extended patch test' })).not.toBeInTheDocument());
  expect(apiClient.deleteInvestigationOption).toHaveBeenCalledWith('test', 2);
  expect(screen.getByRole('checkbox', { name: 'Patch test' })).toBeChecked();
});

it('shows selected investigations but hides catalog management from non-prescribers', async () => {
  jest.mocked(apiClient.get).mockImplementation(async url => url === '/auth/me' ? { role: 'RECEPTION' } : {});
  localStorage.setItem('rxDraft:p:standalone', JSON.stringify({ investigations: ['Historical biopsy'] }));
  render(<PrescriptionBuilder patientId="p" visitId={null} doctorId="d" />);
  expect(await screen.findByRole('checkbox', { name: 'Historical biopsy' })).toBeChecked();
  expect(screen.queryByRole('button', { name: 'Manage saved investigations' })).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText('e.g., MRI Brain, CT Scan')).not.toBeInTheDocument();
});

it('refreshes a stale catalog version before retrying and preserves the selected snapshot', async () => {
  jest.mocked(apiClient.getInvestigationOptions)
    .mockResolvedValueOnce([{ id: 'test', name: 'Patch test', version: 1 }])
    .mockResolvedValue([{ id: 'test', name: 'Colleague name', version: 2 }]);
  jest.mocked(apiClient.updateInvestigationOption)
    .mockRejectedValueOnce(new Error('The investigation changed. Refresh and try again.'))
    .mockResolvedValueOnce({ id: 'test', name: 'Final name', version: 3 });
  localStorage.setItem('rxDraft:p:standalone', JSON.stringify({ investigations: ['Patch test'] }));
  render(<PrescriptionBuilder patientId="p" visitId={null} doctorId="d" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Manage saved investigations' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Patch test' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Rename Patch test' }), { target: { value: 'My stale name' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The list has been refreshed');
  expect(screen.getByRole('checkbox', { name: 'Patch test' })).toBeChecked();
  expect(screen.queryByRole('checkbox', { name: 'My stale name' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit Colleague name' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Rename Colleague name' }), { target: { value: 'Final name' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
  expect(await screen.findByRole('checkbox', { name: 'Final name' })).not.toBeChecked();
  expect(apiClient.updateInvestigationOption).toHaveBeenLastCalledWith('test', 'Final name', 2);
  expect(screen.getByRole('checkbox', { name: 'Patch test' })).toBeChecked();
});

it.each([false, true])('does not select a delayed catalog addition after navigation (return to original: %s)', async returnToOriginal => {
  let complete!: (value: { id: string; name: string; version: number }) => void;
  jest.mocked(apiClient.createInvestigationOption).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const onClinicalDataChange = jest.fn();
  const { rerender } = render(<PrescriptionBuilder patientId="patient-a" visitId={null} doctorId="d" onClinicalDataChange={onClinicalDataChange} />);
  const field = await screen.findByPlaceholderText('e.g., MRI Brain, CT Scan');
  await waitFor(() => expect(field).not.toBeDisabled());
  fireEvent.change(field, { target: { value: 'Patient A patch test' } });
  fireEvent.keyDown(field, { key: 'Enter' });
  await waitFor(() => expect(apiClient.createInvestigationOption).toHaveBeenCalled());
  rerender(<PrescriptionBuilder patientId="patient-b" visitId={null} doctorId="d" onClinicalDataChange={onClinicalDataChange} />);
  if (returnToOriginal) rerender(<PrescriptionBuilder patientId="patient-a" visitId={null} doctorId="d" onClinicalDataChange={onClinicalDataChange} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'CBC' }));
  await act(async () => complete({ id: 'late', name: 'Patient A patch test', version: 1 }));
  expect((screen.queryByRole('checkbox', { name: 'Patient A patch test' }) as HTMLInputElement | null)?.checked ?? false).toBe(false);
  expect(screen.getByRole('checkbox', { name: 'CBC' })).toBeChecked();
  expect(onClinicalDataChange).toHaveBeenLastCalledWith(expect.objectContaining({ treatmentPlan: expect.objectContaining({ investigations: ['CBC'] }) }));
});

it('ignores a catalog load that resolves after a newer visit load', async () => {
  let complete!: (options: Array<{ id: string; name: string; version: number }>) => void;
  jest.mocked(apiClient.getInvestigationOptions)
    .mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }))
    .mockResolvedValue([{ id: 'new', name: 'Latest option', version: 2 }]);
  const { rerender } = render(<PrescriptionBuilder patientId="patient-a" visitId={null} doctorId="d" />);
  await waitFor(() => expect(apiClient.getInvestigationOptions).toHaveBeenCalledTimes(1));
  rerender(<PrescriptionBuilder patientId="patient-b" visitId={null} doctorId="d" />);
  await screen.findByRole('checkbox', { name: 'Latest option' });
  await act(async () => complete([{ id: 'old', name: 'Stale option', version: 1 }]));
  expect(screen.getByRole('checkbox', { name: 'Latest option' })).toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Stale option' })).not.toBeInTheDocument();
});

it('creates a medicine with verified catalog fields and preserves its ID in the prescription', async () => {
  jest.mocked(apiClient.post).mockImplementation(async (_url, payload) => ({ id: 'created-drug', ...(payload as object) }));
  const onClinicalDataChange = jest.fn();
  render(<PrescriptionBuilder patientId="p" visitId={null} doctorId="d" onClinicalDataChange={onClinicalDataChange} />);
  fireEvent.click(screen.getByRole('button', { name: '+ Add to Drug Database' }));
  fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Dolo' } });
  fireEvent.change(screen.getByLabelText('Manufacturer'), { target: { value: 'Verified manufacturer' } });
  fireEvent.change(screen.getByLabelText('Generic / salt composition'), { target: { value: 'Paracetamol' } });
  fireEvent.change(screen.getByLabelText('Therapeutic category'), { target: { value: 'Analgesic' } });
  fireEvent.change(screen.getByLabelText('Medicine form'), { target: { value: 'tablet' } });
  fireEvent.change(screen.getByLabelText('Strength'), { target: { value: '650 mg' } });
  fireEvent.change(screen.getByLabelText('Prescription requirement'), { target: { value: 'true' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save & Add' }));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/drugs', expect.objectContaining({
    name: 'Tab. Dolo 650 mg', brandName: 'Dolo', dosageForm: 'tablet', strength: '650 mg', composition1: 'Paracetamol',
    category: 'Analgesic', combinationProduct: false, requiresPrescription: true,
  })));
  await screen.findByDisplayValue('Tab. Dolo 650 mg');
  expect(onClinicalDataChange).toHaveBeenLastCalledWith(expect.objectContaining({ treatmentPlan: expect.objectContaining({ dermatology: expect.objectContaining({ medicationPlan: expect.arrayContaining([expect.objectContaining({ drugId: 'created-drug', dosageForm: 'tablet', strength: '650 mg' })]) }) }) }));
});

it.each([['cream', false], ['capsule', true]] as const)('allows verified %s products without inventing a strength', async (form, combination) => {
  jest.mocked(apiClient.post).mockImplementation(async (_url, payload) => ({ id: 'created-drug', ...(payload as object) }));
  render(<PrescriptionBuilder patientId="p" visitId={null} doctorId="d" />);
  fireEvent.click(screen.getByRole('button', { name: '+ Add to Drug Database' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save & Add' }));
  expect(apiClient.post).not.toHaveBeenCalled();
  for (const [label, value] of [['Brand name', 'Verified brand'], ['Manufacturer', 'Verified manufacturer'], ['Generic / salt composition', 'Verified composition'], ['Therapeutic category', 'Verified category'], ['Medicine form', form], ['Prescription requirement', 'false']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  if (combination) fireEvent.click(screen.getByRole('checkbox', { name: 'Combination product' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save & Add' }));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/drugs', expect.objectContaining({ dosageForm: form, strength: '', combinationProduct: combination, requiresPrescription: false })));
});
