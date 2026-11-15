import { act, fireEvent, render, screen } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
import { apiClient } from '@/lib/api';
import type { VoiceFillApply, VoiceFillRow } from '@/lib/voice-fill';

let applyVoiceFill: VoiceFillApply = () => ({ filled: [], undo: () => {} });

jest.mock('@/components/voice/VoiceFillButton', () => ({
  VoiceFillButton: ({ apply }: { apply: VoiceFillApply }) => {
    applyVoiceFill = apply;
    return null;
  },
}));
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
const teczine = { id: 'teczine', inventoryItemId: 'inv-teczine', name: 'Tab. Teczine 10 mg', dosageForm: 'TABLET', knownNames: [], totalStock: 40 };
const telma = { id: 'telma', inventoryItemId: 'inv-telma', name: 'Tab. Telma 40 mg', dosageForm: 'TABLET', knownNames: [], totalStock: 12 };
const doxy = { id: 'doxy', inventoryItemId: 'inv-doxy', name: 'Cap. Doxycycline 100 mg', dosageForm: 'CAPSULE', knownNames: [], totalStock: 30 };
const stock = [teczine, telma, doxy];

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  jest.clearAllMocks();
  get.mockImplementation((url: string, params?: { q?: string }) => Promise.resolve(
    url === '/prescriptions/drugs/autocomplete'
      ? stock.filter((drug) => drug.name.toLowerCase().includes(String(params?.q || '').toLowerCase()))
      : url === '/prescriptions/drugs/teczine/regimen-defaults' ? { values: { duration: 5, durationUnit: 'DAYS', frequency: 'ONCE_DAILY' }, source: 'doctor' }
        : url === '/pharmacy/prescription-queue/inventory-stock/inv-teczine' ? { stockStatus: 'IN_STOCK', totalNonExpiredStock: 40 } : {},
  ));
});
afterEach(() => jest.useRealTimers());

const drugInputs = () => screen.getAllByPlaceholderText('Search medicine name...').map((input) => (input as HTMLInputElement).value);
const chips = () => screen.queryAllByText(/Did you mean/).map((chip) => chip.textContent);

async function speak(prescriptionItems: VoiceFillRow[]) {
  render(<PrescriptionBuilder patientId="voice-suggest" visitId={null} doctorId="doctor" />);
  await act(async () => { jest.advanceTimersByTime(1000); });
  await act(async () => { await applyVoiceFill({ prescriptionItems }); });
  await act(async () => { jest.advanceTimersByTime(0); });
}

it('offers the stocked medicine under a misheard name only, and Use links it with the spoken values kept', async () => {
  await speak([
    { drugName: 'texine', dosage: 10, dosageUnit: 'MG', duration: 14, durationUnit: 'DAYS' },
    { drugName: 'doxycycline', dosage: 100, dosageUnit: 'MG' },
    { drugName: 'kojic soap' },
  ]);

  expect(drugInputs()).toEqual(['texine 10 mg', 'Cap. Doxycycline 100 mg', 'kojic soap', '']);
  expect(chips()).toEqual(['Did you mean Tab. Teczine 10 mg?']);
  const texineCell = (document.getElementById('rx-row-0-drug') as HTMLInputElement).closest('td')!;
  expect(texineCell).toHaveTextContent('Did you mean Tab. Teczine 10 mg?');

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Use Tab. Teczine 10 mg' })); });

  expect(drugInputs()).toEqual(['Tab. Teczine 10 mg', 'Cap. Doxycycline 100 mg', 'kojic soap', '']);
  expect(chips()).toEqual([]);
  expect(texineCell).toHaveTextContent('Stock: 40');
  expect(screen.getAllByPlaceholderText('#').map((input) => (input as HTMLInputElement).value)).toEqual(['14', '', '', '']);
  expect(get.mock.calls.filter(([url]) => url.endsWith('/regimen-defaults')).map(([url]) => url))
    .toEqual(['/prescriptions/drugs/doxy/regimen-defaults', '/prescriptions/drugs/teczine/regimen-defaults']);
});

it('dismissing the suggestion leaves the spoken name as written', async () => {
  await speak([{ drugName: 'tekzin' }]);
  expect(chips()).toEqual(['Did you mean Tab. Teczine 10 mg?']);

  fireEvent.click(screen.getByRole('button', { name: 'Dismiss suggestion Tab. Teczine 10 mg' }));

  expect(chips()).toEqual([]);
  expect(drugInputs()).toEqual(['tekzin', '']);
});

it('offers nothing for a medicine name the doctor types', async () => {
  await speak([{ drugName: 'texine' }]);
  expect(chips()).toEqual(['Did you mean Tab. Teczine 10 mg?']);

  fireEvent.change(screen.getAllByPlaceholderText('Search medicine name...')[1], { target: { value: 'tekzin' } });
  await act(async () => { jest.advanceTimersByTime(1000); });

  expect(drugInputs()).toEqual(['texine', 'tekzin', '']);
  expect(chips()).toEqual(['Did you mean Tab. Teczine 10 mg?']);
  expect((document.getElementById('rx-row-1-drug') as HTMLInputElement).closest('td')).not.toHaveTextContent('Did you mean');
});
