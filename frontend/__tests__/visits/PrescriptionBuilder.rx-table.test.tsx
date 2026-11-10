import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn().mockResolvedValue({}), getPatient: jest.fn().mockResolvedValue({}),
  getClinicAssets: jest.fn().mockResolvedValue([]), getPrinterProfiles: jest.fn().mockResolvedValue([]),
  getAllPatientVisitHistory: jest.fn().mockResolvedValue([]), getPatientVisitHistory: jest.fn().mockResolvedValue({ visits: [] }),
  getPrescriptions: jest.fn().mockResolvedValue({ prescriptions: [] }),
  getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [] }),
  getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
  autocompletePrescriptionField: jest.fn().mockResolvedValue([]),
  createQuickPrescription: jest.fn().mockResolvedValue({ id: 'rx-1' }),
  post: jest.fn().mockResolvedValue({ id: 'tpl-1' }),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const medicine = (drugName: string, extra = {}) => ({ drugName, dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', dosePattern: '1-0-0', duration: 5, durationUnit: 'DAYS', ...extra });
const names = () => screen.getAllByPlaceholderText('Search medicine name...').map(input => (input as HTMLInputElement).value);
const named = (name: string) => screen.getByDisplayValue(name) as HTMLInputElement;
const LONG = 'Apply a thin layer on the affected skin twice daily after cleansing and keep out of direct sunlight, reapply after swimming';

beforeEach(() => {
  localStorage.clear();
  jest.mocked(apiClient.get).mockReset().mockImplementation(async (url: string) => url === '/prescriptions/drugs/autocomplete' ? [] : {});
  jest.mocked(apiClient.createQuickPrescription).mockClear();
});

async function mount(items: object[]) {
  localStorage.setItem('rxDraft:patient:standalone', JSON.stringify({ items }));
  const onClinicalDataChange = jest.fn();
  render(<PrescriptionBuilder patientId="patient" visitId={null} doctorId="doctor" standalone onClinicalDataChange={onClinicalDataChange} />);
  await screen.findByDisplayValue(items.length ? (items[0] as { drugName: string }).drugName : '');
  return onClinicalDataChange;
}
const medicationPlan = (spy: jest.Mock) => spy.mock.calls.at(-1)![0].treatmentPlan.dermatology.medicationPlan.map((item: { drugName: string }) => item.drugName);

it('inserts a medicine between two others, focuses it, and saves the medicines in that order', async () => {
  const onClinicalDataChange = await mount([medicine('Amoxicillin'), medicine('Cetirizine'), medicine('Doxycycline')]);
  expect(names().filter(Boolean)).toEqual(['Amoxicillin', 'Cetirizine', 'Doxycycline']);
  fireEvent.click(screen.getByRole('button', { name: 'Add a medicine below Amoxicillin' }));
  expect(names().slice(0, 4)).toEqual(['Amoxicillin', '', 'Cetirizine', 'Doxycycline']);
  await waitFor(() => expect(screen.getAllByPlaceholderText('Search medicine name...')[1]).toHaveFocus());
  fireEvent.change(screen.getAllByPlaceholderText('Search medicine name...')[1], { target: { value: 'Ibuprofen' } });
  expect(names().filter(Boolean)).toEqual(['Amoxicillin', 'Ibuprofen', 'Cetirizine', 'Doxycycline']);
  await waitFor(() => expect(medicationPlan(onClinicalDataChange)).toEqual(['Amoxicillin', 'Ibuprofen', 'Cetirizine', 'Doxycycline']));
  fireEvent.click(screen.getByRole('button', { name: 'Create Prescription' }));
  await waitFor(() => expect(apiClient.createQuickPrescription).toHaveBeenCalledTimes(1));
  const saved = jest.mocked(apiClient.createQuickPrescription).mock.calls[0][0] as { items: { drugName: string }[] };
  expect(saved.items.map(item => item.drugName)).toEqual(['Amoxicillin', 'Ibuprofen', 'Cetirizine', 'Doxycycline']);
});

it('names each control after its medicine, or after its position while the row has no name', async () => {
  await mount([medicine('Amoxicillin'), medicine('Cetirizine')]);
  fireEvent.click(screen.getByRole('button', { name: 'Add Row' }));
  expect(names()).toEqual(['Amoxicillin', 'Cetirizine', '']);
  expect(screen.getAllByRole('button', { name: /^Add a medicine below / }).map(button => button.getAttribute('aria-label'))).toEqual([
    'Add a medicine below Amoxicillin', 'Add a medicine below Cetirizine', 'Add a medicine below row 3',
  ]);
  expect(screen.getAllByRole('button', { name: /^Remove / }).map(button => button.getAttribute('aria-label'))).toEqual(['Remove Amoxicillin', 'Remove Cetirizine', 'Remove row 3']);
  expect(screen.getAllByRole('combobox', { name: /^(Frequency|When|Duration unit) for / }).map(box => box.getAttribute('aria-label'))).toEqual([
    'Frequency for Amoxicillin', 'When for Amoxicillin', 'Duration unit for Amoxicillin',
    'Frequency for Cetirizine', 'When for Cetirizine', 'Duration unit for Cetirizine',
    'Frequency for row 3', 'When for row 3', 'Duration unit for row 3',
  ]);
  expect(screen.getAllByRole('columnheader').map(header => header.textContent)).toEqual(['Medicine', 'Frequency (0-1-0)', 'When', 'Duration', 'Instructions', 'Actions']);
});

it('removes a medicine from the middle with its icon button and keeps the rest in order', async () => {
  const onClinicalDataChange = await mount([medicine('Amoxicillin'), medicine('Cetirizine', { instructions: 'At night' }), medicine('Doxycycline')]);
  fireEvent.click(screen.getByRole('button', { name: 'Remove Cetirizine' }));
  expect(names().filter(Boolean)).toEqual(['Amoxicillin', 'Doxycycline']);
  expect(screen.queryByDisplayValue('At night')).not.toBeInTheDocument();
  await waitFor(() => expect(medicationPlan(onClinicalDataChange)).toEqual(['Amoxicillin', 'Doxycycline']));
});

it('does not stack blank rows when a blank row is already below', async () => {
  await mount([medicine('Amoxicillin'), medicine('Cetirizine')]);
  fireEvent.click(screen.getByRole('button', { name: 'Add a medicine below Amoxicillin' }));
  const afterFirst = names();
  fireEvent.click(screen.getByRole('button', { name: 'Add a medicine below Amoxicillin' }));
  expect(names()).toEqual(afterFirst);
  expect(afterFirst.slice(0, 3)).toEqual(['Amoxicillin', '', 'Cetirizine']);
});

it('keeps the footer Add Row appending at the end and Enter adding a row under the current one', async () => {
  await mount([medicine('Amoxicillin'), medicine('Cetirizine'), medicine('Doxycycline')]);
  fireEvent.click(screen.getByRole('button', { name: 'Add Row' }));
  const afterFooter = names();
  expect(afterFooter.slice(0, 3)).toEqual(['Amoxicillin', 'Cetirizine', 'Doxycycline']);
  expect(afterFooter.at(-1)).toBe('');
  expect(afterFooter.length).toBeGreaterThan(3);
  fireEvent.keyDown(named('Amoxicillin'), { key: 'Enter' });
  expect(names().slice(0, 4)).toEqual(['Amoxicillin', '', 'Cetirizine', 'Doxycycline']);
  await waitFor(() => expect(screen.getAllByPlaceholderText('Search medicine name...')[1]).toHaveFocus());
});

it('shows a long instruction in full in a wrapping field and keeps it on one logical line', async () => {
  await mount([medicine('Fucibet cream', { instructions: '1 pea size amount- whole face' }), medicine('Cleanser', { instructions: LONG })]);
  const short = screen.getByDisplayValue('1 pea size amount- whole face');
  const long = screen.getByDisplayValue(LONG);
  expect(short.tagName).toBe('TEXTAREA');
  expect(long.tagName).toBe('TEXTAREA');
  expect(long).toHaveValue(LONG);
  fireEvent.change(long, { target: { value: 'Use gently\nat night' } });
  expect(screen.getByDisplayValue('Use gently at night')).toBeInTheDocument();
  fireEvent.keyDown(screen.getByDisplayValue('Use gently at night'), { key: 'Enter' });
  expect(screen.getByDisplayValue('Use gently at night')).toBeInTheDocument();
});

it('moves the duration controls and instructions together when a row is inserted above them', async () => {
  await mount([medicine('Amoxicillin', { duration: 30, instructions: 'First' }), medicine('Cetirizine', { duration: 7, instructions: 'Second' })]);
  fireEvent.click(screen.getByRole('button', { name: 'Add a medicine below Amoxicillin' }));
  const rows = screen.getAllByPlaceholderText('Search medicine name...').map(input => input.closest('tr')!);
  expect(within(rows[0]).getByLabelText('Duration for Amoxicillin')).toHaveValue(30);
  expect(within(rows[0]).getByDisplayValue('First')).toBeInTheDocument();
  expect(within(rows[1]).queryByDisplayValue('First')).not.toBeInTheDocument();
  expect(within(rows[2]).getByLabelText('Duration for Cetirizine')).toHaveValue(7);
  expect(within(rows[2]).getByDisplayValue('Second')).toBeInTheDocument();
});

describe('template editor', () => {
  async function openEditor() {
    jest.mocked(apiClient.getPrescriptionTemplates).mockResolvedValue({ templates: [] } as any);
    render(<PrescriptionBuilder patientId="patient" visitId={null} doctorId="doctor" standalone />);
    fireEvent.click(await screen.findByRole('button', { name: 'New template' }));
    return within(await screen.findByRole('dialog'));
  }
  it('inserts a row between two medicines and wraps long instructions', async () => {
    const dialog = await openEditor();
    const inputs = () => dialog.getAllByPlaceholderText('Medicine name') as HTMLInputElement[];
    fireEvent.change(inputs()[0], { target: { value: 'Alpha' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Add Row' }));
    fireEvent.change(inputs()[1], { target: { value: 'Gamma' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Add a medicine below Alpha' }));
    expect(inputs().map(input => input.value)).toEqual(['Alpha', '', 'Gamma']);
    await waitFor(() => expect(inputs()[1]).toHaveFocus());
    fireEvent.change(inputs()[1], { target: { value: 'Beta' } });
    const instructions = dialog.getAllByPlaceholderText('e.g., Avoid alcohol');
    fireEvent.change(instructions[1], { target: { value: LONG } });
    expect(dialog.getByDisplayValue(LONG).tagName).toBe('TEXTAREA');
    expect(inputs().map(input => input.value)).toEqual(['Alpha', 'Beta', 'Gamma']);
    fireEvent.change(dialog.getByPlaceholderText('e.g., Acne follow-up (Derm)'), { target: { value: 'Ordered template' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Create Template' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    const saved = jest.mocked(apiClient.post).mock.calls[0][1] as { items: { drugName: string; instructions?: string }[] };
    expect(saved.items.map(item => item.drugName)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(saved.items[1].instructions).toBe(LONG);
  });
});
