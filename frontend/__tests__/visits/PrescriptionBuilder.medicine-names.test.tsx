import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const mockGet = apiClient.get as jest.Mock;
const flutas = { id: 'drug-flutas', inventoryItemId: 'flutas', name: 'Tab. Flutas 150 mg', knownNames: ['13 74 | Flutas 150Mg(Pc)'], strengthMissing: false, dosageForm: 'TABLET', totalStock: 30 };
const acnosis = { id: undefined, inventoryItemId: 'acnosis', name: 'Tab. Acnosis', knownNames: ['199 | Acnosis Tab (loose tablets)'], strengthMissing: true, dosageForm: 'TABLET', totalStock: 12 };

beforeEach(() => {
  localStorage.clear(); jest.clearAllMocks();
  mockGet.mockImplementation(async (url: string, params?: any) => {
    if (url === '/prescriptions/drugs/autocomplete') return /acnosis/i.test(params?.q) ? [acnosis] : [flutas];
    return {};
  });
});
function mountRow(name: string) {
  localStorage.setItem('rxDraft:synthetic:standalone', JSON.stringify({ items: [{ drugName: name, dosage: '', dosageUnit: 'MG', frequency: 'ONCE_DAILY', duration: 7, durationUnit: 'DAYS' }] }));
  render(<PrescriptionBuilder patientId="synthetic" visitId={null} doctorId="doctor" />);
  const input = screen.getByPlaceholderText('Search medicine name...') as HTMLInputElement;
  return { input, cell: input.closest('td')! };
}

it('finds the stock of an old prescription line by the name the item was recorded under', async () => {
  const { cell } = mountRow('13 74 | Flutas 150Mg(Pc)');
  await act(async () => { fireEvent.mouseEnter(cell); });
  expect(cell).toHaveTextContent('Stock: 30');
});

it('shows the standard name with a quiet strength-missing hint and saves that name when picked', async () => {
  const { input } = mountRow('acnosis');
  fireEvent.focus(input);
  const result = (await screen.findByText('Best Match')).closest('div[title]') as HTMLElement;
  expect(result.querySelector('.font-medium')).toHaveTextContent(/^Tab. Acnosis$/);
  expect(within(result).getByText('Strength missing')).toBeVisible();
  fireEvent.click(within(result).getByRole('button', { name: 'Select' }));
  await waitFor(() => expect(input.value).toBe('Tab. Acnosis'));
  await waitFor(() => expect(JSON.parse(localStorage.getItem('rxDraft:synthetic:standalone')!).items[0])
    .toMatchObject({ drugName: 'Tab. Acnosis', inventoryItemId: 'acnosis' }), { timeout: 5000 });
});
