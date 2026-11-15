import { act, fireEvent, render, screen } from '@testing-library/react';
import PrescriptionBuilder from '@/components/visits/PrescriptionBuilder';
import { apiClient } from '@/lib/api';
import type { VoiceFillApply, VoiceFillApplyResult } from '@/lib/voice-fill';

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
const fucibet = { id: 'fucibet', inventoryItemId: 'inv-fucibet', name: 'Fucibet cream', dosageForm: 'CREAM' };
const usual = { duration: 10, durationUnit: 'DAYS', frequency: 'ONCE_DAILY', dosePattern: '0-0-1', timing: 'PM', instructions: 'on the rash' };

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  jest.clearAllMocks();
  get.mockImplementation((url: string, params?: { q?: string }) => Promise.resolve(
    url === '/prescriptions/drugs/autocomplete' ? (params?.q?.toLowerCase().startsWith('fuci') ? [fucibet] : [])
      : url.endsWith('/regimen-defaults') ? { values: usual, source: 'doctor' } : {},
  ));
});
afterEach(() => jest.useRealTimers());

const drugInputs = () => screen.getAllByPlaceholderText('Search medicine name...').map((input) => (input as HTMLInputElement).value);

it('adds spoken medicines before the blank row, keeps spoken values over usual ones, and undo removes them', async () => {
  localStorage.setItem('rxDraft:voice-rx:standalone', JSON.stringify({ items: [
    { drugName: '', dosage: '', dosageUnit: 'TABLET', frequency: '', duration: '', durationUnit: 'DAYS' },
  ] }));
  render(<PrescriptionBuilder patientId="voice-rx" visitId={null} doctorId="doctor" />);
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(drugInputs()).toEqual(['']);

  let result: VoiceFillApplyResult = { filled: [], undo: () => {} };
  await act(async () => {
    result = await applyVoiceFill({
      diagnosis: 'Impetigo',
      prescriptionItems: [
        { drugName: 'fucibet cream', duration: 7, durationUnit: 'DAYS', applicationSite: 'face' },
        { drugName: 'kojic soap', instructions: 'wash face twice daily' },
      ],
    });
  });

  expect(result.filled.map((f) => f.label)).toEqual(['Diagnosis', '2 medicines']);
  expect(drugInputs()).toEqual(['Fucibet cream', 'kojic soap', '']);
  expect((document.getElementById('rx-row-0-drug') as HTMLInputElement).value).toBe('Fucibet cream');
  const durations = screen.getAllByPlaceholderText('#').map((input) => (input as HTMLInputElement).value);
  expect(durations).toEqual(['7', '', '']);
  const instructions = screen.getAllByPlaceholderText('e.g., Avoid alcohol').map((input) => (input as HTMLInputElement).value);
  expect(instructions).toEqual(['on the rash', 'wash face twice daily', '']);
  expect(get.mock.calls.filter(([url]) => url.endsWith('/regimen-defaults')).map(([url]) => url)).toEqual(['/prescriptions/drugs/fucibet/regimen-defaults']);

  const diagnosis = () => (document.getElementById('visit-diagnosis') as HTMLInputElement).value;
  expect(diagnosis()).toBe('Impetigo');
  act(() => result.undo());
  expect(drugInputs()).toEqual(['']);
  expect(diagnosis()).toBe('');
});

it('links a spoken stocked medicine by its standard name and keeps an unstocked strength visible in the name', async () => {
  const doxy = { id: 'doxy', inventoryItemId: 'inv-doxy-100', name: 'Cap. Doxycycline 100 mg', dosageForm: 'CAPSULE', knownNames: [], totalStock: 40 };
  get.mockImplementation((url: string, params?: { q?: string }) => Promise.resolve(
    url === '/prescriptions/drugs/autocomplete' ? (params?.q === 'doxycycline' ? [doxy] : [])
      : url === '/pharmacy/prescription-queue/inventory-stock/inv-doxy-100' ? { stockStatus: 'IN_STOCK', totalNonExpiredStock: 40 } : {},
  ));
  render(<PrescriptionBuilder patientId="voice-rx" visitId={null} doctorId="doctor" />);
  await act(async () => { jest.advanceTimersByTime(1000); });

  await act(async () => {
    await applyVoiceFill({ prescriptionItems: [
      { drugName: 'doxycycline', dosage: 100, dosageUnit: 'MG', dosePattern: '1-0-1' },
      { drugName: 'telma', dosage: 40, dosageUnit: 'MG' },
    ] });
  });

  expect(drugInputs()).toEqual(['Cap. Doxycycline 100 mg', 'telma 40 mg', '']);
  const doxyCell = (document.getElementById('rx-row-0-drug') as HTMLInputElement).closest('td')!;
  await act(async () => { fireEvent.mouseEnter(doxyCell); });
  expect(doxyCell).toHaveTextContent('Stock: 40');
});
