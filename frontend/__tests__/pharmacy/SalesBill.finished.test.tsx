import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SalesBillPage from '@/app/dashboard/pharmacy/sales/bill/page';
import { apiClient } from '@/lib/api';

const mockQuery = { current: new URLSearchParams() };
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => mockQuery.current,
}));
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), patch: jest.fn(), post: jest.fn() } }));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn(), useToast: () => ({ toast: jest.fn() }) }));

const api = apiClient as jest.Mocked<typeof apiClient>;
const line = (id: string, name: string, quantity: number, unitPrice: number, discountPercent: number, taxPercent: number, totalAmount: number) => ({
  id, itemType: 'DRUG', quantity, unitPrice, discountPercent, taxPercent, discountAmount: 0, billDiscountAmount: 0, taxAmount: 0, totalAmount,
  drug: { name }, package: null,
});
const paid = { id: 'p1', amount: 327.75, method: 'CASH', status: 'COMPLETED', paymentDate: '2026-11-09T05:00:00.000Z', reference: null };
const sold = {
  id: 'inv-1', invoiceNumber: 'PHI-2026-001', status: 'CONFIRMED', mutationVersion: 4, invoiceDate: '2026-11-09T05:00:00.000Z', revisedAt: null,
  billingName: 'Meera Shah', billingPhone: '9876543210', patient: null, doctor: null,
  subtotal: 330, discountAmount: 45, billDiscountKind: 'AMOUNT', billDiscountValue: 25, billDiscountAmount: 25, taxAmount: 42.75, totalAmount: 327.75,
  items: [line('l1', 'Cream', 2, 50, 10, 12, 92.67), line('l2', 'Tablet', 1, 30, 0, 5, 28.96), line('l3', 'Shampoo', 1, 200, 5, 18, 206.12)],
  payments: [paid],
  revisions: [],
};
const revised = {
  ...sold, mutationVersion: 5, revisedAt: '2026-11-09T06:00:00.000Z', billDiscountKind: 'PERCENT', billDiscountValue: 20, billDiscountAmount: 61.4,
  discountAmount: 84.4, taxAmount: 37.08, totalAmount: 282.68,
  revisions: [{ id: 'r1', reason: 'Senior citizen discount', previousTotal: 327.75, revisedTotal: 282.68, createdAt: '2026-11-09T06:00:00.000Z', revisedBy: { firstName: 'Asha', lastName: 'Synthetic' } }],
};
const refunded = { ...revised, mutationVersion: 6, payments: [paid, { id: 'p2', amount: -45.07, method: 'UPI', status: 'REFUNDED', paymentDate: '2026-11-09T06:05:00.000Z', reference: null }] };
const conflict = (status: number, message: string) => Object.assign(new Error(message), { status, body: { message } });

let current: Record<string, unknown>;
beforeEach(() => {
  jest.clearAllMocks();
  current = sold;
  api.get.mockImplementation(async () => JSON.parse(JSON.stringify(current)));
});
const open = (query: string) => {
  mockQuery.current = new URLSearchParams(query);
  render(<SalesBillPage />);
};

it('edits only the discount of a paid bill, shows the refund due and records the refund once', async () => {
  open('bill=inv-1&edit=discount');
  const dialog = await screen.findByRole('dialog', { name: 'Edit discount on PHI-2026-001' });
  expect(within(dialog).queryByLabelText(/Quantity/)).not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('Discount % for Tablet'), { target: { value: '10' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Percent' }));
  fireEvent.change(within(dialog).getByLabelText('Bill discount'), { target: { value: '20' } });
  expect(within(dialog).getByText('Total after change').nextSibling).toHaveTextContent('₹282.68');
  expect(within(dialog).getByText('Refund due after saving').nextSibling).toHaveTextContent('₹45.07');
  expect(within(dialog).getByRole('button', { name: 'Save discount' })).toBeDisabled();
  expect(within(dialog).getByText('Enter a reason to save.')).toBeInTheDocument();

  api.patch.mockResolvedValueOnce(JSON.parse(JSON.stringify(revised)));
  fireEvent.change(within(dialog).getByLabelText('Reason *'), { target: { value: 'Senior citizen discount' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save discount' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(api.patch).toHaveBeenCalledWith('/pharmacy/invoices/inv-1/discount', {
    expectedVersion: 4,
    billDiscount: { kind: 'PERCENT', value: 20 },
    lines: [
      { id: 'l1', discountPercent: 10 },
      { id: 'l2', discountPercent: 10 },
      { id: 'l3', discountPercent: 5 },
    ],
    reason: 'Senior citizen discount',
  });
  expect(screen.getByText('Refund due ₹45.07', { selector: '[data-slot="badge"], span' })).toBeInTheDocument();
  expect(screen.getByText('Revised 09 Nov 2026', { exact: false })).toBeInTheDocument();
  expect(screen.getByText('Senior citizen discount')).toBeInTheDocument();
  expect(screen.getByText('₹327.75 → ₹282.68')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Record refund ₹45.07' }));
  const refund = await screen.findByRole('dialog', { name: 'Record refund of ₹45.07' });
  current = refunded;
  api.post.mockResolvedValueOnce({ id: 'p2' } as any);
  fireEvent.click(within(refund).getByRole('button', { name: 'Record refund ₹45.07' }));
  await waitFor(() => expect(screen.getByText('Paid', { selector: '[data-slot="badge"]' })).toBeInTheDocument());
  expect(api.post).toHaveBeenCalledWith('/pharmacy/invoices/inv-1/refunds', { requestKey: expect.stringMatching(/^[0-9a-f]{32}$/), amount: 45.07, method: 'CASH' });
  expect(screen.getByText(/^Refund · UPI/)).toBeInTheDocument();
});

it('refuses a discount edit made from an older version with a plain message and a reload', async () => {
  open('bill=inv-1');
  fireEvent.click(await screen.findByRole('button', { name: 'Edit discount' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Bill discount'), { target: { value: '30' } });
  fireEvent.change(within(dialog).getByLabelText('Reason *'), { target: { value: 'Second tab' } });
  api.patch.mockRejectedValueOnce(conflict(409, 'This bill was changed after you opened it. Reload it to see the latest amounts.'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save discount' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('This bill was changed after you opened it. Reload it to see the latest amounts.');
  current = revised;
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reload bill' }));
  await waitFor(() => expect(screen.getByText('Senior citizen discount')).toBeInTheDocument());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('shows the plain reason when the bill has a sales return', async () => {
  open('bill=inv-1&edit=discount');
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Bill discount'), { target: { value: '30' } });
  fireEvent.change(within(dialog).getByLabelText('Reason *'), { target: { value: 'Late discount' } });
  const message = 'This bill has a sales return (SR-1), so its discount can no longer be changed. Correct it through the return.';
  api.patch.mockRejectedValueOnce(conflict(409, message));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save discount' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
  expect(within(dialog).queryByRole('button', { name: 'Reload bill' })).not.toBeInTheDocument();
});
