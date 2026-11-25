import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PharmacyInvoiceBuilderFixed } from '@/components/pharmacy/PharmacyInvoiceBuilderFixed';
import { FinishedBillView } from '@/components/pharmacy/sales/FinishedBillView';
import { apiClient } from '@/lib/api';
import twoSlabBill from '../fixtures/two-slab-pharmacy-bill.json';

const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ toast: (...args: unknown[]) => mockToast(...args), useToast: () => ({ toast: mockToast }) }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    getPatients: jest.fn(),
    getUsers: jest.fn(),
    getPatient: jest.fn(),
    getPrescription: jest.fn(),
    getPharmacyInvoicePrintData: jest.fn(),
    getPharmacyInvoiceById: jest.fn(),
  },
}));

const api = apiClient as jest.Mocked<typeof apiClient>;
const GST_TABLE = /<table><caption>GST summary<\/caption>.*?<\/table>/;
const TWO_SLAB_GST_TABLE =
  '<table><caption>GST summary</caption><thead><tr><th style="text-align:right">GST %</th><th style="text-align:right">Taxable</th><th style="text-align:right">CGST</th><th style="text-align:right">SGST</th><th style="text-align:right">Total tax</th></tr></thead><tbody><tr><td style="text-align:right">5%</td><td style="text-align:right">₹200.00</td><td style="text-align:right">₹5.00</td><td style="text-align:right">₹5.00</td><td style="text-align:right">₹10.00</td></tr><tr><td style="text-align:right">12%</td><td style="text-align:right">₹250.00</td><td style="text-align:right">₹15.00</td><td style="text-align:right">₹15.00</td><td style="text-align:right">₹30.00</td></tr></tbody></table>';

const finishedBill = {
  id: 'inv-14', invoiceNumber: 'PHI-2026-014', status: 'CONFIRMED', mutationVersion: 1, invoiceDate: '2026-11-05T09:00:00.000Z', revisedAt: null,
  billingName: 'Meera Shah', billingPhone: '9876543210', patient: null, doctor: null,
  subtotal: 450, discountAmount: 0, billDiscountKind: null, billDiscountValue: 0, billDiscountAmount: 0, taxAmount: 40, totalAmount: 490,
  items: [], payments: [], revisions: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  document.querySelectorAll('iframe').forEach((frame) => frame.remove());
});

it('prints the same GST table from the bill builder as a reprint from the finished bill', async () => {
  sessionStorage.setItem(
    'pharmacy-checkout-attempt-v1',
    JSON.stringify({
      requestKey: 'checkout-key',
      confirmed: false,
      payload: {
        patientId: 'patient-1', doctorId: '', prescriptionId: '', paymentMethod: 'CASH', billingName: 'Meera Shah', billingPhone: '9876543210',
        billingAddress: '', billingCity: '', billingState: '', billingPincode: '', notes: '', items: [],
      },
      previewItems: [],
    }),
  );
  api.get.mockResolvedValue({ data: [] });
  api.getPatients.mockResolvedValue({ data: [] } as never);
  api.getUsers.mockResolvedValue({ users: [] } as never);
  api.post.mockResolvedValue({ id: 'inv-14', invoiceNumber: 'PHI-2026-014', status: 'CONFIRMED' });
  api.getPharmacyInvoicePrintData.mockResolvedValue(twoSlabBill);
  const builder = render(<PharmacyInvoiceBuilderFixed />);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry pending checkout' }));
  const preview = await screen.findByTitle('Pharmacy invoice print preview', {}, { timeout: 5000 });
  const builderHtml = preview.getAttribute('srcdoc') ?? '';
  expect(builderHtml).toContain('<td style="text-align:left">30042019</td><td style="text-align:left">AZ-501 (exp 31 Aug 2027)</td>');
  builder.unmount();

  api.get.mockImplementation(async (url: string) => (url === '/pharmacy/invoices/inv-14/print-data' ? twoSlabBill : finishedBill));
  render(<FinishedBillView id="inv-14" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Print' }));
  await waitFor(() => expect(document.querySelector('iframe[data-print-frame]')).not.toBeNull());
  const reprintHtml = document.querySelector<HTMLIFrameElement>('iframe[data-print-frame]')!.srcdoc;

  expect([builderHtml.match(GST_TABLE)?.[0], reprintHtml.match(GST_TABLE)?.[0]]).toEqual([TWO_SLAB_GST_TABLE, TWO_SLAB_GST_TABLE]);
});

it('collects part of a due bill from the finished bill and shows what is still due', async () => {
  let current: Record<string, unknown> = finishedBill;
  api.get.mockImplementation(async () => current);
  render(<FinishedBillView id="inv-14" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Collect payment' }));
  const amount = await screen.findByLabelText('Amount');
  expect(amount).toHaveValue(490);
  fireEvent.change(amount, { target: { value: '200' } });
  fireEvent.change(screen.getByLabelText('Paid by'), { target: { value: 'CARD' } });
  api.post.mockResolvedValueOnce({ id: 'pay-1' });
  current = { ...finishedBill, payments: [{ id: 'pay-1', amount: 200, method: 'CARD', status: 'COMPLETED', paymentDate: '2026-11-05T10:00:00.000Z', reference: null }] };
  fireEvent.click(screen.getByRole('button', { name: 'Collect ₹200.00' }));

  expect(await screen.findByText('Due ₹290.00', { selector: '[data-slot="badge"]' })).toBeInTheDocument();
  expect(api.post.mock.calls).toEqual([['/pharmacy/invoices/inv-14/payments', { requestKey: expect.stringMatching(/^[0-9a-f]{32}$/), amount: 200, method: 'CARD' }]]);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
