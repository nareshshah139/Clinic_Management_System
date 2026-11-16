import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PharmacyInvoiceBuilderFixed } from '@/components/pharmacy/PharmacyInvoiceBuilderFixed';
import { PharmacyInvoiceList } from '@/components/pharmacy/PharmacyInvoiceList';
import { apiClient } from '@/lib/api';
import { downloadInvoicePdf } from '@/lib/download-invoice-pdf';

jest.mock('@/lib/api', () => ({ apiClient: {
  get: jest.fn(), getPatients: jest.fn(), getUsers: jest.fn(),
  getPrescription: jest.fn(), post: jest.fn(), patch: jest.fn(),
  getPharmacyInvoicePrintData: jest.fn(), getPharmacyInvoices: jest.fn(),
} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }), toast: jest.fn() }));
jest.mock('@/lib/download-invoice-pdf', () => ({ downloadInvoicePdf: jest.fn().mockResolvedValue(undefined) }));

const api = apiClient as jest.Mocked<typeof apiClient>;
const patient = { id: 'patient-test', name: 'SAMPLE PATIENT', phone: '0000000000' };
const names = [
  'Zitcare Forte Capsule (loose tablets)',
  'Test Medicine 10 mg (SR) (  LOOSE   TABLETS  ) ',
  'Test Medicine 5 mg (enteric coated)',
];
const items = names.map((name, index) => ({
  id: `item-${index}`, drugId: `drug-${index}`, itemType: 'DRUG',
  drug: { id: `drug-${index}`, name, price: 100, gstRate: 5 },
  quantity: 2, unitPrice: 100, discountPercent: 0, taxPercent: 5, totalAmount: 210,
}));
const invoice = {
  id: 'invoice-test', invoiceNumber: 'SAMPLE-CR01', patient, items,
  status: 'CONFIRMED', paymentStatus: 'COMPLETED', paymentMethod: 'CASH',
  createdAt: '2026-09-27T06:00:00Z', subtotal: 600, discountAmount: 0,
  taxAmount: 30, totalAmount: 630,
};

function assertPrintedNames(html: string, expectedAmount = '210.00') {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = doc.querySelector('tbody')!;
  expect(rows.textContent).toContain('Cap. Zitcare Forte');
  expect(rows.textContent).toContain('Test Medicine 10 mg (SR)');
  expect(rows.textContent).toContain('Test Medicine 5 mg (enteric coated)');
  expect(rows.textContent).not.toMatch(/loose\s+tablets/i);
  expect(rows.querySelectorAll('tr')).toHaveLength(3);
  const amounts = [...rows.querySelectorAll('tr')].map(row => row.lastElementChild?.textContent);
  expect(amounts.every(amount => amount?.includes(expectedAmount))).toBe(true);
}

beforeEach(() => {
  jest.clearAllMocks();
  api.getPatients.mockResolvedValue({ data: [patient] } as any);
  api.getUsers.mockResolvedValue({ users: [] } as any);
  api.get.mockImplementation(async (url, params) => url.endsWith('/stock-check')
    ? { items: items.map(item => ({ drugName: item.drug.name, prescribedQuantity: item.quantity, dispensedQuantity: 0, remainingQuantity: item.quantity, matchedDrug: item.drug, stockStatus: 'IN_STOCK', totalNonExpiredStock: 100 })) }
    : url.startsWith('/drugs/') ? items.find(item => url === `/drugs/${item.drugId}`)?.drug
    : url === '/drugs'
    ? { data: items.filter(item => !params?.search || item.drug.name === params.search).map(item => item.drug) }
    : invoice as any);
  api.getPrescription.mockResolvedValue({ id: 'rx-test', patient, items: names.map(drugName => ({ drugName, quantity: 2 })) } as any);
  api.post.mockResolvedValue(invoice as any);
  api.patch.mockResolvedValue(invoice as any);
  api.getPharmacyInvoices.mockResolvedValue({ data: [invoice], pagination: { page: 1, limit: 20, total: 1, pages: 1 } } as any);
});

it.each(['standard', 'legacy'])('cleans draft and saved billing previews with %s print data while retaining catalog identities', async (format) => {
  const printData = format === 'standard' ? {
    invoice, patient, lines: items.map(item => ({ ...item, name: item.drug.name, batchAllocations: [] })),
  } : invoice;
  api.getPharmacyInvoicePrintData.mockResolvedValue(printData as any);
  render(<PharmacyInvoiceBuilderFixed prefill={{ patientId: patient.id, prescriptionId: 'rx-test' }} />);
  await screen.findByText(names[0], { exact: true });
  fireEvent.click(screen.getByRole('button', { name: 'Print Preview' }));
  const frame = await screen.findByTitle('Pharmacy invoice print preview') as HTMLIFrameElement;
  assertPrintedNames(frame.srcdoc, '200.00');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Invoice' }));
  await waitFor(() => expect(frame.srcdoc).toContain('SAMPLE-CR01'));
  assertPrintedNames(frame.srcdoc);
  expect(api.post).toHaveBeenCalledWith('/pharmacy/invoices', expect.objectContaining({
    items: items.map(item => expect.objectContaining({ drugId: item.drugId, quantity: 2, taxPercent: 5, unitPrice: 100 })),
  }));
  expect(items.map(item => item.drug.name)).toEqual(names);
});

it.each(['View Invoice', 'Download Invoice'])('cleans saved-invoice %s output', async (action) => {
  const popup = { document: { open: jest.fn(), write: jest.fn(), close: jest.fn() }, focus: jest.fn(), print: jest.fn() };
  const open = jest.spyOn(window, 'open').mockReturnValue(popup as any);
  try {
    render(<PharmacyInvoiceList />);
    fireEvent.click(await screen.findByTitle(action));
    if (action === 'Download Invoice') {
      await waitFor(() => expect(downloadInvoicePdf).toHaveBeenCalledTimes(1));
      assertPrintedNames((jest.mocked(downloadInvoicePdf).mock.calls[0][0] as Document).documentElement.outerHTML);
      expect(open).not.toHaveBeenCalled();
    } else {
      await waitFor(() => expect(popup.document.write).toHaveBeenCalledTimes(1));
      assertPrintedNames(popup.document.write.mock.calls[0][0]);
    }
    expect(items.map(item => item.drug.name)).toEqual(names);
  } finally {
    open.mockRestore();
  }
});
