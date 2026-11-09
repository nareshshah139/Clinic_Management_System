import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SalesBillPage from '@/app/dashboard/pharmacy/sales/bill/page';
import { apiClient } from '@/lib/api';

const mockToast = jest.fn();
const mockNav = { query: new URLSearchParams(), listeners: new Set<() => void>() };
const mockGo = jest.fn((href: string) => {
  mockNav.query = new URL(href, 'http://clinic.test').searchParams;
  mockNav.listeners.forEach((listener) => listener());
});
jest.mock('next/navigation', () => {
  const { useSyncExternalStore } = jest.requireActual('react');
  const subscribe = (listener: () => void) => {
    mockNav.listeners.add(listener);
    return () => mockNav.listeners.delete(listener);
  };
  return {
    useRouter: () => ({ push: mockGo, replace: mockGo }),
    useSearchParams: () => useSyncExternalStore(subscribe, () => mockNav.query),
  };
});
jest.mock('@/lib/api', () => ({
  apiClient: {
    get: jest.fn(), getPatients: jest.fn(), getPatient: jest.fn(), getUsers: jest.fn(), getPrescription: jest.fn(),
    post: jest.fn(), updatePharmacyInvoice: jest.fn(), delete: jest.fn(), getPharmacyInvoicePrintData: jest.fn(),
  },
}));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

const api = apiClient as jest.Mocked<typeof apiClient>;
const patient = { id: 'patient-1', name: 'Meera Shah', phone: '9876543210' };
const doctor = { id: 'doctor-1', firstName: 'Ravi', lastName: 'Synthetic' };
const cream = { id: 'drug-1', name: 'Synthetic Cream', price: 50, gstRate: 12, manufacturerName: 'Synthetic', packSizeLabel: '1 tube', totalStock: 10 };
const tablet = { id: 'drug-2', name: 'Synthetic Tablet', price: 30, gstRate: 5, manufacturerName: 'Synthetic', packSizeLabel: '10 tabs', totalStock: 5 };
const savedLine = (drug: typeof cream, overrides: Record<string, unknown>) => ({
  id: `line-${drug.id}`, itemType: 'DRUG', drugId: drug.id, inventoryItemId: null, packageId: null, quantity: 1, unitPrice: drug.price,
  discountPercent: 0, taxPercent: drug.gstRate, dosage: null, frequency: null, duration: null, instructions: null,
  drug: { id: drug.id, name: drug.name, manufacturerName: drug.manufacturerName, packSizeLabel: drug.packSizeLabel }, package: null, ...overrides,
});
let invoice: Record<string, any>;
const conflict = (status: number, message: string) => Object.assign(new Error(message), { status, body: { message } });

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  mockNav.query = new URLSearchParams();
  Element.prototype.scrollIntoView = jest.fn();
  invoice = {
    id: 'd-1', invoiceNumber: 'PH-7', status: 'DRAFT', mutationVersion: 3, patientId: patient.id, doctorId: doctor.id, prescriptionId: null,
    paymentMethod: 'UPI', billingName: 'Meera Shah', billingPhone: '9876543210', billingAddress: null, billingCity: null, billingState: null,
    billingPincode: null, notes: 'Collect at 5 pm', patient, doctor,
    items: [
      savedLine(cream, { inventoryItemId: 'batch-1', quantity: 2, discountPercent: 10, dosage: 'thin layer', frequency: 'twice daily', duration: '7 days', instructions: 'after bath' }),
      savedLine(tablet, {}),
    ],
  };
  api.getPatients.mockResolvedValue({ data: [patient] } as any);
  api.getUsers.mockResolvedValue({ users: [doctor] } as any);
  api.get.mockImplementation(async (url: string, query?: any) => {
    if (url === '/pharmacy/prescription-queue') return { data: [], pagination: { page: 1, limit: 20, total: 0, pages: 1 } };
    if (url === '/pharmacy/invoices/d-1') return JSON.parse(JSON.stringify(invoice));
    if (url === '/drugs') return { data: query?.search ? [cream, tablet].filter((d) => d.name.toLowerCase().includes(query.search.toLowerCase())) : [cream, tablet] };
    return {};
  });
});

const lineFor = async (name: string) => (await screen.findByRole('heading', { name, level: 4 })).closest('[data-invoice-item]') as HTMLElement;
const open = (query: string) => {
  mockNav.query = new URLSearchParams(query);
  render(<SalesBillPage />);
};

it('saves a new bill as a draft without remounting, then saves changes against the draft version', async () => {
  open('');
  fireEvent.change(await screen.findByLabelText('Patient *'), { target: { value: 'Meera' } });
  fireEvent.mouseDown(await screen.findByText('Meera Shah', { selector: '.font-medium' }));
  fireEvent.change(screen.getByLabelText('Search Drugs'), { target: { value: 'Cream' } });
  const result = (await screen.findByRole('heading', { name: cream.name, level: 4 })).closest('[role="button"]') as HTMLElement;
  fireEvent.click(within(result).getByRole('button', { name: 'Add' }));
  api.post.mockResolvedValueOnce({ id: 'd-1', invoiceNumber: 'PH-7', mutationVersion: 0 } as any);
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

  expect(await screen.findByText('All changes saved to draft PH-7')).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith('/pharmacy/invoices', expect.objectContaining({
    patientId: 'patient-1', billingName: 'Meera Shah', billingPhone: '9876543210', paymentMethod: 'CASH',
    items: [expect.objectContaining({ drugId: 'drug-1', quantity: 1, unitPrice: 50 })],
  }));
  expect(mockGo).toHaveBeenLastCalledWith('/dashboard/pharmacy/sales/bill?draft=d-1', { scroll: false });
  expect(screen.getByText('PH-7 not final')).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalledWith('/pharmacy/invoices/d-1');

  fireEvent.change(within(await lineFor(cream.name)).getByLabelText('Quantity'), { target: { value: '3' } });
  expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  api.updatePharmacyInvoice.mockResolvedValueOnce({ id: 'd-1', invoiceNumber: 'PH-7', mutationVersion: 1 } as any);
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await screen.findByText('All changes saved to draft PH-7');
  expect(api.updatePharmacyInvoice).toHaveBeenCalledWith('d-1', expect.objectContaining({
    expectedVersion: 0, items: [expect.objectContaining({ drugId: 'drug-1', quantity: 3 })],
  }));
});

it('reopens a draft with every line restored and finishes that same bill', async () => {
  open('draft=d-1');
  const creamLine = await lineFor(cream.name);
  const tabletLine = await lineFor(tablet.name);
  expect([
    within(creamLine).getByLabelText('Quantity'),
    within(tabletLine).getByLabelText('Quantity'),
    screen.getByLabelText('Patient *'),
    screen.getByLabelText('Billing Name *'),
    screen.getByLabelText('Notes'),
  ].map((input) => (input as HTMLInputElement).value)).toEqual(['2', '1', 'Meera Shah (9876543210)', 'Meera Shah', 'Collect at 5 pm']);
  expect(within(creamLine).getByDisplayValue('10')).toBeInTheDocument();
  expect(within(creamLine).getByDisplayValue('thin layer')).toBeInTheDocument();
  expect(screen.getByText('PH-7 not final')).toBeInTheDocument();
  expect(screen.getByText('All changes saved to draft PH-7')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();

  fireEvent.change(within(creamLine).getByLabelText('Quantity'), { target: { value: '4' } });
  api.post.mockResolvedValueOnce({ id: 'd-1', invoiceNumber: 'PH-7', status: 'CONFIRMED' } as any);
  api.getPharmacyInvoicePrintData.mockResolvedValueOnce({ id: 'd-1', invoiceNumber: 'PH-7' } as any);
  fireEvent.click(screen.getByRole('button', { name: 'Print Preview' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm Invoice' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/pharmacy/invoices/checkout', expect.objectContaining({
    requestKey: expect.any(String), draftId: 'd-1', draftVersion: 3, patientId: 'patient-1', doctorId: 'doctor-1', paymentMethod: 'UPI', notes: 'Collect at 5 pm',
    items: [
      expect.objectContaining({ drugId: 'drug-1', inventoryItemId: 'batch-1', quantity: 4, discountPercent: 10, taxPercent: 12, dosage: 'thin layer' }),
      expect.objectContaining({ drugId: 'drug-2', quantity: 1, taxPercent: 5 }),
    ],
  })));
  expect(api.post).toHaveBeenCalledTimes(1);
});

it('refuses a save over a newer change with a plain message, and reloads the latest draft', async () => {
  open('draft=d-1');
  fireEvent.change(await screen.findByLabelText('Notes'), { target: { value: 'My edit' } });
  const message = 'This draft was changed after you opened it. Reload it to see the latest version.';
  api.updatePharmacyInvoice.mockRejectedValueOnce(conflict(409, message));
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(`${message} Your changes on this screen were not saved.`);
  expect(api.updatePharmacyInvoice).toHaveBeenCalledWith('d-1', expect.objectContaining({ expectedVersion: 3, notes: 'My edit' }));

  invoice = { ...invoice, mutationVersion: 4, notes: 'From the other tab' };
  fireEvent.click(screen.getByRole('button', { name: 'Reload draft' }));
  await waitFor(() => expect(screen.getByLabelText('Notes')).toHaveValue('From the other tab'));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('discards a draft only after confirming and returns to Sales', async () => {
  open('draft=d-1');
  fireEvent.click(await screen.findByRole('button', { name: 'Discard draft' }));
  const dialog = await screen.findByRole('dialog', { name: 'Discard this draft?' });
  expect(dialog).toHaveTextContent('PH-7 for Meera Shah will be removed from Sales.');
  expect(api.delete).not.toHaveBeenCalled();
  api.delete.mockResolvedValueOnce({ message: 'Invoice deleted successfully' } as any);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Discard draft' }));
  await waitFor(() => expect(mockGo).toHaveBeenLastCalledWith('/dashboard/pharmacy/sales'));
  expect(api.delete).toHaveBeenCalledWith('/pharmacy/invoices/d-1?version=3');
});

it.each([
  ['a finished bill', () => ({ ...invoice, status: 'CONFIRMED' }), 'This bill is already finished', 'Bill PH-7 was finished, so it can no longer be edited.'],
  ['a discarded draft', () => { throw conflict(404, 'Invoice not found'); }, 'This draft no longer exists', 'It was discarded, or the link is out of date.'],
])('explains %s instead of opening an editor', async (_, answer, title, detail) => {
  const get = api.get.getMockImplementation()!;
  api.get.mockImplementation(async (url: string, query?: any) => (url === '/pharmacy/invoices/d-1' ? answer() : get(url, query)));
  open('draft=d-1');
  expect(await screen.findByText(title)).toBeInTheDocument();
  expect(screen.getByText(detail, { exact: false })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
});

it('keeps a finished checkout with its own bill and still offers a pending one anywhere', async () => {
  const attempt = (confirmed: boolean) => JSON.stringify({
    requestKey: 'k-1', confirmed, context: JSON.stringify(['patient-1', 'rx-1', undefined, undefined]),
    payload: { patientId: 'patient-1', billingName: 'Meera Shah', items: [] }, previewItems: [],
  });
  sessionStorage.setItem('pharmacy-checkout-attempt-v1', attempt(true));
  open('');
  expect(await screen.findByRole('button', { name: 'Save draft' })).toBeInTheDocument();
  expect(screen.queryByText('This checkout is confirmed. Reopen it for another copy.')).not.toBeInTheDocument();
  expect(sessionStorage.getItem('pharmacy-checkout-attempt-v1')).toBeNull();

  sessionStorage.setItem('pharmacy-checkout-attempt-v1', attempt(false));
  open('draft=d-1');
  expect(await screen.findByText('A checkout for Meera Shah needs confirmation. Retry it before starting another sale.')).toBeInTheDocument();
});
