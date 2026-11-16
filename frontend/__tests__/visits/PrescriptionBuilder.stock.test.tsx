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
const drug = { id: 'stock-test-drug', inventoryItemId: 'stock-item', name: 'Synthetic cream', dosageForm: 'CREAM', totalStock: 13 };
const stockUrl = `/pharmacy/prescription-queue/inventory-stock/${drug.inventoryItemId}`;

beforeEach(() => {
  localStorage.clear(); jest.clearAllMocks();
  mockGet.mockImplementation(async (url: string) => {
    if (url === '/prescriptions/drugs/autocomplete') return [drug];
    if (url === stockUrl) return { stockStatus: 'IN_STOCK', totalNonExpiredStock: 13 };
    return {};
  });
});
function mountRow(name = drug.name, linked = true) {
  localStorage.setItem('rxDraft:synthetic:standalone', JSON.stringify({ items: [{
    drugName: name, ...(linked ? { drugId: drug.id, inventoryItemId: drug.inventoryItemId } : {}),
    dosage: '', dosageUnit: 'MG', frequency: 'ONCE_DAILY', duration: 7, durationUnit: 'DAYS',
  }] }));
  render(<PrescriptionBuilder patientId="synthetic" visitId={null} doctorId="doctor" />);
  const input = screen.getByPlaceholderText('Search medicine name...');
  return { input, cell: input.closest('td')! };
}
async function findSearchResult() { return (await screen.findByText('Best Match')).closest('div[title]')! as HTMLElement; }

it('restores the inventory identity and uses its available stock despite a changed display name', async () => {
  const { cell } = mountRow('SYNTHETIC cream extra words');
  await act(async () => { fireEvent.mouseEnter(cell); });
  expect(mockGet).toHaveBeenCalledWith(stockUrl);
  expect(cell).toHaveTextContent('Stock: 13');
  expect(cell).toHaveAttribute('title', 'Remaining stock: 13');
  expect(mockGet).not.toHaveBeenCalledWith('/drugs', expect.anything());
});
it.each([
  ['zero', { stockStatus: 'OUT_OF_STOCK', totalNonExpiredStock: 0 }, '0'],
  ['not linked', { stockStatus: 'UNMATCHED', totalNonExpiredStock: 0 }, '—'],
  ['unavailable quantity', {}, '—'],
])('shows %s truthfully', async (_label, result, expected) => {
  mockGet.mockImplementation(async (url: string) => url === stockUrl ? result : {});
  const { cell } = mountRow();
  await act(async () => { fireEvent.mouseEnter(cell); });
  expect(cell).toHaveTextContent(`Stock: ${expected}`);
});
it('uses clinic inventory for a legacy free-text row without borrowing a partial match', async () => {
  const { cell } = mountRow('Synthetic', false);
  await act(async () => { fireEvent.mouseEnter(cell); });
  expect(cell).toHaveTextContent('Stock: —');
  expect(mockGet).toHaveBeenCalledWith('/prescriptions/drugs/autocomplete', { q: 'Synthetic', limit: 30 });
});
it('keeps selected row and tooltip stock consistent and retains the selected ID', async () => {
  const { input, cell } = mountRow('Synthetic', false);
  fireEvent.focus(input);
  const result = await findSearchResult();
  fireEvent.click(within(result).getByRole('button', { name: 'Select' }));
  await waitFor(() => expect(cell).toHaveTextContent('Stock: 13'));
  fireEvent.mouseEnter(cell);
  expect(mockGet.mock.calls.filter(([url]) => url === stockUrl)).toHaveLength(1);
});
it('shares an in-flight inventory request and retries after a failed read', async () => {
  let resolveStock!: (value: unknown) => void;
  const pending = new Promise(resolve => { resolveStock = resolve; });
  const original = mockGet.getMockImplementation()!;
  mockGet.mockImplementation((url: string) => url === stockUrl ? pending : original(url));
  const { input, cell } = mountRow();
  fireEvent.focus(input);
  const result = await findSearchResult();
  await act(async () => { fireEvent.mouseEnter(result); fireEvent.mouseEnter(cell); });
  await act(async () => { resolveStock({ stockStatus: 'IN_STOCK', totalNonExpiredStock: 9 }); });
  expect(cell).toHaveTextContent('Stock: 9');
  expect(result).toHaveAttribute('title', 'Remaining stock: 9');
  expect(mockGet.mock.calls.filter(([url]) => url === stockUrl)).toHaveLength(1);
});
it('allows retry of failed inventory reads', async () => {
  let offline = true;
  mockGet.mockImplementation(async (url: string) => {
    if (url === stockUrl) { if (offline) throw new Error('offline'); return { stockStatus: 'IN_STOCK', totalNonExpiredStock: 4 }; }
    return {};
  });
  const { cell } = mountRow();
  await act(async () => { fireEvent.mouseEnter(cell); });
  expect(cell).toHaveTextContent('Stock: —');
  offline = false; fireEvent.mouseLeave(cell);
  await act(async () => { fireEvent.mouseEnter(cell); });
  expect(cell).toHaveTextContent('Stock: 4');
});
it('clears the previous inventory identity when another medicine is typed', async () => {
  const { input, cell } = mountRow();
  fireEvent.change(input, { target: { value: 'Different medicine' } });
  await act(async () => { fireEvent.mouseEnter(cell); });
  expect(mockGet).not.toHaveBeenCalledWith(stockUrl);
  expect(cell).toHaveTextContent('Stock: —');
});
