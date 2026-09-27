import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PharmacyPage from '@/app/dashboard/pharmacy/page';
import { apiClient } from '@/lib/api';

const mockPush = jest.fn();
const mockToast = jest.fn();
const params = new URLSearchParams('section=billing');
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), useSearchParams: () => params }));
jest.mock('next/dynamic', () => () => () => null);
jest.mock('@/components/pharmacy/PharmacyCounterCockpit', () => ({ PharmacyCounterCockpit: () => null }));
jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn(), getPatients: jest.fn(), getPatient: jest.fn(), getUsers: jest.fn(),
  getPrescription: jest.fn(), post: jest.fn(), patch: jest.fn(), getPharmacyInvoicePrintData: jest.fn(),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

const api = apiClient as jest.Mocked<typeof apiClient>;
const names = ['Itin 12 tablet', 'Nixiper 1 Creme Rinse Shampoo 150 Gm', 'Fucibet cream', 'Bilashine 40mg Tablet'];
const quantities = [14, 5, 20, 5];
const patient = { id: 'patient-trina', name: 'Trina Ganguly', phone: '9000000000' };
const secondPatient = { id: 'patient-other', name: 'Synthetic Patient Two', phone: '9000000001' };
const doctor = { id: 'doctor-1', firstName: 'Test', lastName: 'Doctor' };
const drugs = names.map((name, index) => ({ id: `drug-${index}`, name, price: 100, gstRate: 5, manufacturerName: 'Test', packSizeLabel: '1', totalStock: 100 }));
const stock = names.map((drugName, index) => ({ drugName, matchedDrug: drugs[index], stockStatus: index === 0 ? 'OUT_OF_STOCK' : 'IN_STOCK', totalNonExpiredStock: index === 0 ? 0 : 100, lowStock: false, nearExpiry: false, alternatives: [] }));
const entries = [patient, secondPatient].map((p, index) => ({
  prescriptionId: `rx-${index}`, visitId: `visit-${index}`, patient: p, doctor: { id: doctor.id, name: 'Test Doctor' },
  createdAt: new Date().toISOString(), pendingHours: 22, isOverTwoHours: true, linkedInvoiceIds: [], status: 'pending',
  medications: (index === 0 ? names : ['Unmatched cream']).map((drugName, i) => ({ drugName, prescribedQuantity: quantities[i], dispensedQuantity: 0, coverageStatus: 'not_started' })),
}));
let saved = false;
const scrollIntoView = jest.fn();

beforeEach(() => {
  jest.clearAllMocks(); saved = false;
  Element.prototype.scrollIntoView = scrollIntoView;
  api.getPatients.mockResolvedValue({ data: [patient, secondPatient] } as any);
  api.getPatient.mockImplementation(async id => id === patient.id ? patient : secondPatient as any);
  api.getUsers.mockResolvedValue({ users: [doctor] } as any);
  api.getPrescription.mockImplementation(async id => ({
    id, visit: { patient: id === 'rx-0' ? patient : secondPatient, doctor },
    items: (id === 'rx-0' ? names : ['Unmatched cream']).map((drugName, i) => ({ drugName, quantity: quantities[i] })),
  }) as any);
  api.get.mockImplementation(async (url, query: any) => {
    if (url === '/pharmacy/prescription-queue') return { data: saved ? entries.slice(1) : entries, pagination: { page: 1, limit: 20, total: saved ? 1 : 2, pages: 1 } };
    if (url.includes('/stock-check')) return { items: url.includes('rx-0') ? stock : [{ drugName: 'Unmatched cream', matchedDrug: null, stockStatus: 'UNMATCHED', totalNonExpiredStock: 0, lowStock: true, alternatives: [] }] };
    if (url.startsWith('/drugs/')) return drugs.find(d => url === `/drugs/${d.id}`) || drugs;
    if (url === '/drugs') return { data: query?.search ? drugs.filter(d => d.name.toLowerCase().includes(query.search.toLowerCase())) : drugs };
    if (url.startsWith('/visits/')) return { patient, doctor, prescription: { id: 'rx-0' } };
    return {};
  });
  api.post.mockResolvedValue({ id: 'invoice-1', invoiceNumber: 'PH-1' } as any);
  api.patch.mockImplementation(async () => { saved = true; return {} as any; });
  api.getPharmacyInvoicePrintData.mockResolvedValue({ id: 'invoice-1', invoiceNumber: 'PH-1' } as any);
});

async function loadPatient(name = patient.name) {
  const row = (await screen.findByText(name)).closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Load' }));
  await screen.findByRole('heading', { name: 'Linked Prescription' });
}

it('Load opens a visible bill with all four prescribed quantities and flags unavailable stock', async () => {
  render(<PharmacyPage />);
  await loadPatient();
  for (const name of names) expect(await screen.findByRole('heading', { name, level: 4 })).toBeInTheDocument();
  expect(screen.getByText('Out of stock')).toBeInTheDocument();
  const bill = screen.getByRole('region', { name: 'Prescription bill' });
  expect(scrollIntoView.mock.instances).toContain(bill);
  expect(api.get).not.toHaveBeenCalledWith('/visits/visit-0');
  for (const [i, name] of names.entries()) expect(within(screen.getByRole('heading', { name, level: 4 }).closest('[data-invoice-item]') as HTMLElement).getByLabelText('Quantity')).toHaveValue(quantities[i]);
});

it('retains an unmatched item, allows removal, and does not retain another patient’s medicines', async () => {
  render(<PharmacyPage />);
  await loadPatient();
  await screen.findByRole('heading', { name: names[0], level: 4 });
  await loadPatient(secondPatient.name);
  await screen.findByRole('heading', { name: 'Unmatched cream', level: 4 });
  expect(screen.queryByRole('heading', { name: names[0], level: 4 })).not.toBeInTheDocument();
  const item = screen.getByRole('heading', { name: 'Unmatched cream', level: 4 }).closest('[data-invoice-item]') as HTMLElement;
  expect(within(item).getByText('No match')).toBeInTheDocument();
  fireEvent.click(within(item).getByRole('button', { name: 'Remove Unmatched cream' }));
  expect(screen.queryByRole('heading', { name: 'Unmatched cream', level: 4 })).not.toBeInTheDocument();
});

it('loads inside StrictMode when effects are mounted again', async () => {
  render(<StrictMode><PharmacyPage /></StrictMode>);
  await loadPatient();
  expect(await screen.findByRole('heading', { name: names[0], level: 4 })).toBeInTheDocument();
  expect(screen.queryByText('Loading prescription data...')).not.toBeInTheDocument();
});

it('uses the inventory-matched ID even when search returns another medicine first', async () => {
  const get = api.get.getMockImplementation()!;
  api.get.mockImplementation(async (url, query) => url === '/drugs' ? { data: [{ ...drugs[0], id: 'wrong-drug', name: 'Wrong medicine' }, ...drugs] } as any : get(url, query));
  render(<PharmacyPage />);
  await loadPatient();
  expect(await screen.findByRole('heading', { name: names[0], level: 4 })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Wrong medicine' })).not.toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/drugs/drug-0');
});

it('uses the queue quantity inference when an older prescription omitted explicit quantities', async () => {
  const original = api.getPrescription.getMockImplementation()!;
  api.getPrescription.mockImplementation(async id => ({ ...await original(id) as any, items: names.map(drugName => ({ drugName, frequency: 'TWICE_DAILY', duration: 7, durationUnit: 'DAYS' })) }));
  const get = api.get.getMockImplementation()!;
  api.get.mockImplementation(async (url, query) => url.endsWith('/stock-check') ? { items: stock.map(item => ({ ...item, prescribedQuantity: 14 })) } as any : get(url, query));
  render(<PharmacyPage />);
  await loadPatient();
  await screen.findByRole('heading', { name: names[0], level: 4 });
  expect(screen.getAllByLabelText('Quantity').map(input => (input as HTMLInputElement).value)).toEqual(['14', '14', '14', '14']);
});

it('retrying an inventory failure preserves removed lines and reviewed quantities', async () => {
  const get = api.get.getMockImplementation()!;
  let fail = true;
  api.get.mockImplementation(async (url, query) => {
    if (url === '/drugs/drug-0' && fail) throw new Error('Product read failed');
    return get(url, query);
  });
  render(<PharmacyPage />);
  await loadPatient();
  await screen.findByRole('heading', { name: names[0], level: 4 });
  fireEvent.click(screen.getByRole('button', { name: `Remove ${names[2]}` }));
  const item = screen.getByRole('heading', { name: names[1], level: 4 }).closest('[data-invoice-item]') as HTMLElement;
  fireEvent.change(within(item).getByLabelText('Quantity'), { target: { value: '2' } });
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading prescription' }));
  await waitFor(() => expect(screen.queryByText('Inventory check failed')).not.toBeInTheDocument());
  expect(screen.queryByRole('heading', { name: names[2], level: 4 })).not.toBeInTheDocument();
  expect(within(item).getByLabelText('Quantity')).toHaveValue(2);
});

it('keeps every line when an inventory lookup fails and exposes a retry', async () => {
  const get = api.get.getMockImplementation()!;
  api.get.mockImplementation(async (url, query) => {
    if (url.endsWith('/stock-check')) throw new Error('Inventory unavailable');
    return get(url, query);
  });
  render(<PharmacyPage />);
  await loadPatient();
  for (const name of names) expect(await screen.findByRole('heading', { name, level: 4 })).toBeInTheDocument();
  expect(screen.getAllByText('Inventory check failed')).toHaveLength(4);
  expect(within(screen.getByRole('region', { name: 'Prescription bill' })).getByRole('alert')).toHaveTextContent('inventory details could not be checked');
  expect(screen.getByRole('button', { name: 'Retry loading prescription' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Print Preview' }));
  expect(api.post).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Medicine needs review' }));
});

it('substitutes an unmatched line with the chosen product and keeps its edited quantity', async () => {
  render(<PharmacyPage />);
  await loadPatient(secondPatient.name);
  const heading = await screen.findByRole('heading', { name: 'Unmatched cream', level: 4 });
  const item = heading.closest('[data-invoice-item]') as HTMLElement;
  fireEvent.change(within(item).getByLabelText('Quantity'), { target: { value: '2' } });
  fireEvent.click(within(item).getByRole('button', { name: 'Substitute Unmatched cream' }));
  fireEvent.change(screen.getByLabelText('Search Drugs'), { target: { value: 'Nixiper' } });
  const result = (await screen.findByRole('heading', { name: names[1], level: 4 })).closest('[role="button"]') as HTMLElement;
  fireEvent.click(within(result).getByRole('button', { name: 'Add' }));
  expect(within(item).getByRole('heading', { name: names[1], level: 4 })).toBeInTheDocument();
  expect(within(item).getByText('Prescribed: Unmatched cream')).toBeInTheDocument();
  expect(within(item).getByLabelText('Quantity')).toHaveValue(2);
  expect(within(item).queryByText('No match')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Print Preview' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm Invoice' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/pharmacy/invoices', expect.objectContaining({
    prescriptionId: 'rx-1', patientId: secondPatient.id,
    items: [expect.objectContaining({ drugId: 'drug-1', quantity: 2, unitPrice: 100, taxPercent: 5 })],
  })));
});

it('ignores a late prescription response after switching patients', async () => {
  let resolveFirst!: (value: any) => void;
  const original = api.getPrescription.getMockImplementation()!;
  api.getPrescription.mockImplementation(id => id === 'rx-0' ? new Promise(resolve => { resolveFirst = resolve; }) : original(id));
  render(<PharmacyPage />);
  const row = (await screen.findByText(patient.name)).closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Load' }));
  await waitFor(() => expect(api.getPrescription).toHaveBeenCalledWith('rx-0'));
  await loadPatient(secondPatient.name);
  await screen.findByRole('heading', { name: 'Unmatched cream', level: 4 });
  await act(async () => resolveFirst(await original('rx-0')));
  expect(screen.queryByRole('heading', { name: names[0], level: 4 })).not.toBeInTheDocument();
  expect(screen.getByDisplayValue(secondPatient.name)).toBeInTheDocument();
});

it('keeps a pending prescription visible and reports a failed confirmation', async () => {
  api.patch.mockRejectedValue(new Error('Insufficient inventory stock'));
  render(<PharmacyPage />);
  await loadPatient();
  await screen.findByRole('heading', { name: names[0], level: 4 });
  fireEvent.click(screen.getByRole('button', { name: 'Print Preview' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm Invoice' }));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Error Confirming Invoice', description: 'Insufficient inventory stock' })));
  expect(screen.getByText(patient.name, { selector: 'td *' }).closest('tr')).not.toBeNull();
});

it('shows a visible load error and retries the same prescription', async () => {
  api.getPrescription.mockRejectedValueOnce(new Error('Prescription service unavailable'));
  render(<PharmacyPage />);
  const row = (await screen.findByText(patient.name)).closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Load' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Prescription service unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading prescription' }));
  expect(await screen.findByRole('heading', { name: names[0], level: 4 })).toBeInTheDocument();
});

it('refreshes Pending after confirmation while preserving the prescription link in the saved bill', async () => {
  render(<PharmacyPage />);
  await loadPatient();
  await screen.findByRole('heading', { name: names[0], level: 4 });
  fireEvent.click(screen.getByRole('button', { name: 'Print Preview' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm Invoice' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/pharmacy/invoices', expect.objectContaining({ prescriptionId: 'rx-0', patientId: patient.id, items: drugs.map((d, i) => expect.objectContaining({ drugId: d.id, quantity: quantities[i] })) })));
  await waitFor(() => expect(screen.queryByText(patient.name, { selector: 'td *' })).not.toBeInTheDocument());
});
