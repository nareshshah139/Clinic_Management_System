import { act, fireEvent, render, screen, within } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn(), getPatient: jest.fn().mockResolvedValue({}),
  getClinicAssets: jest.fn().mockResolvedValue([]), getPrinterProfiles: jest.fn().mockResolvedValue([]),
  getAllPatientVisitHistory: jest.fn().mockResolvedValue([]), getPatientVisitHistory: jest.fn().mockResolvedValue({ visits: [] }),
  getPrescriptions: jest.fn().mockResolvedValue({ prescriptions: [] }),
  getPrescriptionTemplates: jest.fn().mockResolvedValue({ templates: [] }),
  getPrescriptionPrintEvents: jest.fn().mockResolvedValue({ totals: {} }),
  autocompletePrescriptionField: jest.fn().mockResolvedValue([]),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
const get = apiClient.get as jest.Mock;
const drug = { id: 'fucibet', name: 'Fucibet cream', dosageForm: 'CREAM' };
async function tick(ms = 300) { await act(async () => { jest.advanceTimersByTime(ms); }); }
async function mount(patch = {}) {
  localStorage.setItem('rxDraft:defaults-test:standalone', JSON.stringify({ items: [{
    drugName: '', dosage: '', dosageUnit: 'TABLET', frequency: '', duration: '', durationUnit: 'DAYS', ...patch,
  }] }));
  render(<PrescriptionBuilder patientId="defaults-test" visitId={null} doctorId="doctor" />);
  await tick(1000);
  return screen.getByPlaceholderText('Search medicine name...').closest('tr')!;
}
async function select(row: HTMLElement, name = 'Fucibet') {
  const input = within(row).getByPlaceholderText('Search medicine name...');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: name } });
  await tick();
  fireEvent.click(screen.getByRole('button', { name: /^Select$/ }));
  await tick();
}
beforeEach(() => {
  jest.useFakeTimers(); localStorage.clear(); jest.clearAllMocks();
  get.mockImplementation(url => Promise.resolve(url === '/prescriptions/drugs/autocomplete' ? [drug] : {}));
});
afterEach(() => jest.useRealTimers());

it('leaves duration blank when a selected medicine has no history or inventory defaults', async () => {
  const row = await mount();
  await select(row);
  expect(within(row).getByPlaceholderText('#')).toHaveValue(null);
});

it('preserves a duration the doctor entered before selecting a medicine', async () => {
  const row = await mount({ durationUnit: 'WEEKS' });
  fireEvent.change(within(row).getByPlaceholderText('#'), { target: { value: '3' } });
  await select(row);
  expect(within(row).getByPlaceholderText('#')).toHaveValue(3);
  expect(within(row).getByText('WEEKS')).toBeInTheDocument();
});

const usual = { duration: 10, durationUnit: 'DAYS', frequency: 'TWICE_DAILY', dosePattern: '1-0-1', timing: 'AM/PM', instructions: 'on the rash' };
function suggest(values = usual, source = 'doctor') {
  get.mockImplementation(url => Promise.resolve(url === '/prescriptions/drugs/autocomplete' ? [drug]
    : url.endsWith('/regimen-defaults') ? { values, source } : {}));
}

it('suggests all four usual fields without needing a diagnosis and allows individual acceptance', async () => {
  suggest(); const row = await mount(); await select(row);
  expect(within(row).getByPlaceholderText('#')).toHaveValue(10);
  expect(within(row).getByText('1-0-1')).toBeInTheDocument();
  expect(within(row).getByText('AM/PM')).toBeInTheDocument();
  expect(within(row).getByPlaceholderText('e.g., Avoid alcohol')).toHaveValue('on the rash');
  expect(within(row).getAllByText('Suggested · Accept')).toHaveLength(4);
  fireEvent.click(within(row).getByRole('button', { name: 'Accept suggested duration' }));
  expect(within(row).queryByRole('button', { name: 'Accept suggested duration' })).not.toBeInTheDocument();
  suggest({ ...usual, duration: 21 }); await select(row, 'Another search');
  expect(within(row).getByPlaceholderText('#')).toHaveValue(10);
});

it('preserves edited suggestions and replaces untouched ones when another medicine is selected', async () => {
  suggest(); const row = await mount(); await select(row);
  fireEvent.change(within(row).getByPlaceholderText('#'), { target: { value: '3' } });
  expect(within(row).queryByRole('button', { name: 'Accept suggested duration' })).not.toBeInTheDocument();
  suggest({ ...usual, duration: 21, instructions: 'on the face' }); await select(row, 'Another');
  expect(within(row).getByPlaceholderText('#')).toHaveValue(3);
  expect(within(row).getByPlaceholderText('e.g., Avoid alcohol')).toHaveValue('on the face');
});

it('clears previous untouched suggestions for an unknown medicine', async () => {
  suggest(); const row = await mount(); await select(row);
  get.mockImplementation(url => Promise.resolve(url === '/prescriptions/drugs/autocomplete' ? [{ ...drug, id: 'unknown', name: 'Unknown cream' }]
    : url.endsWith('/regimen-defaults') ? { values: {}, source: 'none' } : {}));
  await select(row, 'Unknown');
  expect(within(row).getByPlaceholderText('#')).toHaveValue(null);
  expect(within(row).getByPlaceholderText('e.g., Avoid alcohol')).toHaveValue('');
  expect(within(row).queryByText('Suggested · Accept')).not.toBeInTheDocument();
});

it('protects edits including intentional clearing while suggestions are loading', async () => {
  let resolve!: (value: unknown) => void;
  get.mockImplementation(url => url.endsWith('/regimen-defaults') ? new Promise(done => { resolve = done; })
    : Promise.resolve(url === '/prescriptions/drugs/autocomplete' ? [drug] : {}));
  const row = await mount(); await select(row);
  fireEvent.change(within(row).getByPlaceholderText('#'), { target: { value: '3' } });
  fireEvent.change(within(row).getByPlaceholderText('#'), { target: { value: '' } });
  fireEvent.change(within(row).getByPlaceholderText('e.g., Avoid alcohol'), { target: { value: 'doctor instructions' } });
  await act(async () => resolve({ values: usual, source: 'doctor' }));
  expect(within(row).getByPlaceholderText('#')).toHaveValue(null);
  expect(within(row).getByPlaceholderText('e.g., Avoid alcohol')).toHaveValue('doctor instructions');
  expect(within(row).getByText('AM/PM')).toBeInTheDocument();
});

it('keeps two medicines independent and ignores late responses for replaced medicines', async () => {
  let resolveOld!: (value: unknown) => void;
  let selectedDrug = drug;
  get.mockImplementation(url => url.includes('/fucibet/regimen-defaults') ? new Promise(done => { resolveOld = done; })
    : Promise.resolve(url === '/prescriptions/drugs/autocomplete' ? [selectedDrug]
      : url.endsWith('/regimen-defaults') ? { values: { ...usual, duration: url.includes('/third/') ? 21 : 14 }, source: 'clinic' } : {}));
  const row = await mount(); await select(row);
  selectedDrug = { ...drug, id: 'other', name: 'Other cream' };
  await select(row, 'Other');
  const row2 = screen.getAllByPlaceholderText('Search medicine name...')[1].closest('tr')!;
  selectedDrug = { ...drug, id: 'third', name: 'Third cream' };
  await select(row2, 'Third');
  await act(async () => resolveOld({ values: usual, source: 'doctor' }));
  expect(within(row).getByPlaceholderText('#')).toHaveValue(14);
  expect(within(row2).getByPlaceholderText('#')).toHaveValue(21);
  fireEvent.change(within(row).getByPlaceholderText('#'), { target: { value: '3' } });
  expect(within(row2).getByPlaceholderText('#')).toHaveValue(21);
});

it('uses inventory suggestions and stays blank with an actionable message if the lookup fails', async () => {
  suggest(usual, 'inventory'); const row = await mount(); await select(row);
  expect(within(row).getByRole('button', { name: 'Accept suggested duration' })).toHaveAttribute('title', 'Suggested from inventory defaults');
  get.mockImplementation(url => url.endsWith('/regimen-defaults') ? Promise.reject(new Error('offline'))
    : Promise.resolve(url === '/prescriptions/drugs/autocomplete' ? [drug] : {}));
  await select(row, 'Retry');
  expect(within(row).getByPlaceholderText('#')).toHaveValue(null);
  expect(within(row).getByRole('status')).toHaveTextContent('Suggestions unavailable');
});

it('preserves all four pre-existing values, including custom units, when choosing from inventory', async () => {
  suggest();
  const row = await mount({ duration: 3, durationUnit: 'WEEKS', frequency: 'ONCE_DAILY', dosePattern: '0-0-1', timing: 'PM', instructions: 'doctor instructions' });
  await select(row);
  expect(within(row).getByPlaceholderText('#')).toHaveValue(3);
  expect(within(row).getByText('WEEKS')).toBeInTheDocument();
  expect(within(row).getByText('0-0-1')).toBeInTheDocument();
  expect(within(row).getByText('PM')).toBeInTheDocument();
  expect(within(row).getByPlaceholderText('e.g., Avoid alcohol')).toHaveValue('doctor instructions');
  expect(within(row).queryByText('Suggested · Accept')).not.toBeInTheDocument();
});

it('does not apply a removed row’s pending suggestion to the row that replaces it', async () => {
  let resolve!: (value: unknown) => void;
  get.mockImplementation(url => url.endsWith('/regimen-defaults') ? new Promise(done => { resolve = done; })
    : Promise.resolve(url === '/prescriptions/drugs/autocomplete' ? [drug] : {}));
  const row = await mount(); await select(row);
  fireEvent.click(within(row).getByRole('button', { name: 'Remove' }));
  await act(async () => resolve({ values: usual, source: 'doctor' }));
  expect(screen.getByPlaceholderText('#')).toHaveValue(null);
  expect(screen.queryByText('Suggested · Accept')).not.toBeInTheDocument();
});
