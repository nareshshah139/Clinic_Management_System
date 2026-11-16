import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PharmacyInvoiceBuilderFixed } from '@/components/pharmacy/PharmacyInvoiceBuilderFixed';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  apiClient: {
    get: jest.fn(), getPatients: jest.fn(), getUsers: jest.fn(),
    getPrescription: jest.fn(), post: jest.fn(), patch: jest.fn(),
    getPharmacyInvoicePrintData: jest.fn(),
  },
}));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const api = apiClient as jest.Mocked<typeof apiClient>;
const patient = { id: 'patient-1', name: 'Test Patient', phone: '9000000000' };
const drug = (gstRate?: number | null) => ({
  id: 'drug-1', name: 'Test Cream', price: 100, gstRate,
  manufacturerName: 'Test maker', packSizeLabel: '20g',
});
const taxInput = () => screen.getByText('Tax %').parentElement!.querySelector('input')!;

beforeEach(() => {
  jest.clearAllMocks();
  api.getPatients.mockResolvedValue({ data: [patient] } as any);
  api.getUsers.mockResolvedValue({ users: [] } as any);
  api.get.mockResolvedValue({ data: [] } as any);
  api.post.mockResolvedValue({ id: 'invoice-1', invoiceNumber: 'PH-1' } as any);
  api.patch.mockResolvedValue({} as any);
  api.getPharmacyInvoicePrintData.mockResolvedValue({ id: 'invoice-1', invoiceNumber: 'PH-1' } as any);
});

async function addDrug(gstRate?: number | null) {
  api.get.mockImplementation(async (url: string) =>
    url === '/drugs/autocomplete' ? [drug(gstRate)] : { data: [] } as any);
  render(<PharmacyInvoiceBuilderFixed prefill={{ patientId: patient.id }} />);
  await screen.findByDisplayValue(patient.name);
  fireEvent.change(screen.getByLabelText('Search Drugs'), { target: { value: 'Test' } });
  const result = (await screen.findByRole('heading', { name: 'Test Cream', level: 4 })).closest('[role="button"]')!;
  fireEvent.click(within(result as HTMLElement).getByRole('button', { name: 'Add' }));
}

it.each([5, 12, 0])('uses Inventory GST %s%% in the line and invoice total', async (gstRate) => {
  await addDrug(gstRate);
  expect(taxInput()).toHaveValue(gstRate);
  expect(screen.getByDisplayValue('₹100.00')).toBeInTheDocument();
  expect(screen.getByText('Total:').nextElementSibling).toHaveTextContent('₹100.00');
  expect(screen.getByText('GST included:').nextElementSibling).toHaveTextContent(`₹${(100 * gstRate / (100 + gstRate)).toFixed(2)}`);
});

it('extracts GST after a discount and previews the inclusive total', async () => {
  await addDrug(12);
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Discount %'), { target: { value: '10' } });
  expect(screen.getByDisplayValue('₹180.00')).toBeInTheDocument();
  expect(screen.getByText('GST included:').nextElementSibling).toHaveTextContent('₹19.29');
  fireEvent.click(screen.getByRole('button', { name: 'Print Preview' }));
  const frame = await screen.findByTitle('Pharmacy invoice print preview');
  expect(frame.getAttribute('srcdoc')).toContain('GST included:');
  expect(frame.getAttribute('srcdoc')).toContain('₹180.00');
  expect(frame.getAttribute('srcdoc')).toContain('₹19.29');
});

it('submits the Inventory rate when the invoice is confirmed', async () => {
  await addDrug(5);
  fireEvent.click(screen.getByRole('button', { name: 'Print Preview' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm Invoice' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/pharmacy/invoices', expect.objectContaining({
    items: [expect.objectContaining({ drugId: 'drug-1', taxPercent: 5, unitPrice: 100 })],
  })));
});

it.each([null, undefined])('requires an explicit rate when Inventory GST is %s', async (gstRate) => {
  await addDrug(gstRate);
  expect(taxInput()).toHaveValue(null);
  expect(screen.getByText(/GST rate needs review/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Print Preview' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();

  fireEvent.change(taxInput(), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Print Preview' }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
});

it('does not turn a cleared tax field into a zero-rate invoice', async () => {
  await addDrug(12);
  fireEvent.change(taxInput(), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Print Preview' }));
  expect(taxInput()).toHaveValue(null);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('preserves a reviewed tax override when the same drug is added again', async () => {
  await addDrug(12);
  fireEvent.change(taxInput(), { target: { value: '5' } });
  fireEvent.change(screen.getByLabelText('Search Drugs'), { target: { value: 'Test' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Add', exact: true }));
  expect(taxInput()).toHaveValue(5);
  expect(screen.getByDisplayValue('₹200.00')).toBeInTheDocument();
});

it('uses Inventory GST for prescription-prefilled drugs too', async () => {
  api.getPrescription.mockResolvedValue({
    id: 'prescription-1', patient, items: [{ drugName: 'Test Cream', quantity: 2 }],
  } as any);
  api.get.mockImplementation(async (url: string) =>
    url.endsWith('/stock-check') ? { items: [{ drugName: 'Test Cream', matchedDrug: drug(12), stockStatus: 'IN_STOCK', totalNonExpiredStock: 10, prescribedQuantity: 2, dispensedQuantity: 0, remainingQuantity: 2 }] }
      : url === '/drugs/drug-1' ? drug(12)
      : url === '/drugs/drug-1' ? drug(12) : url === '/drugs' ? { data: [drug(12)] } : { data: [] } as any);
  render(<PharmacyInvoiceBuilderFixed prefill={{ patientId: patient.id, prescriptionId: 'prescription-1' }} />);
  await screen.findByText('Tax %');
  expect(taxInput()).toHaveValue(12);
  expect(screen.getByDisplayValue('₹200.00')).toBeInTheDocument();
});

it.each([
  { rates: [5, 5], expected: 5 },
  { rates: [0, 0], expected: 0 },
  { rates: [5, 12], expected: null },
  { rates: [5, null], expected: null },
])('uses a package rate only when all contents agree: $rates', async ({ rates, expected }) => {
  api.get.mockImplementation(async (url: string) => url === '/pharmacy/packages' ? {
    packages: [{
      id: 'package-1', name: 'Test Package', category: 'Test', originalPrice: 200,
      packagePrice: 180, discountPercent: 10,
      items: rates.map((rate, index) => ({ id: `item-${index}`, drugId: `drug-${index}`, quantity: 1, sequence: index, drug: drug(rate) })),
    }],
  } : { data: [] } as any);
  render(<PharmacyInvoiceBuilderFixed />);
  await userEvent.click(screen.getByRole('tab', { name: 'Treatment Packages' }));
  fireEvent.click(await screen.findByText('Test Package'));
  expect(taxInput()).toHaveValue(expected);
  if (expected !== null) {
    expect(screen.getByDisplayValue('₹180.00')).toBeInTheDocument();
    expect(screen.getByText('GST included:').nextElementSibling).toHaveTextContent(`₹${(180 * expected / (100 + expected)).toFixed(2)}`);
  }
});
