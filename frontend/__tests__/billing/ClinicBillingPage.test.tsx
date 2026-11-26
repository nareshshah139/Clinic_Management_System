import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BillingPage from '@/app/dashboard/billing/page';
import type { ClinicBillActions, ClinicBillRegister, ClinicBillRow, ClinicReceipt } from '@/components/billing/clinic-bill-model';

let mockQuery = '';
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockQuery),
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => '/dashboard/billing',
}));

const OWNER: ClinicBillActions = { collect: true, void: true, refund: true };
const RECEPTION: ClinicBillActions = { collect: true, void: false, refund: false };

const row = (overrides: Partial<ClinicBillRow>): ClinicBillRow => ({
  id: 'cb1',
  billNo: 'INV-20261125-001',
  billedAt: '2026-11-25T04:30:00.000Z',
  patient: { id: 'p1', name: 'Meera Shah', phone: '9000000001' },
  doctor: { id: 'd1', name: 'Priya Menon' },
  kind: 'CONSULTATION',
  amount: 500,
  paid: 500,
  due: 0,
  refunded: 0,
  status: 'PAID',
  voidReason: null,
  ...overrides,
});

const peel = row({ id: 'cb2', billNo: 'INV-20261125-002', patient: { id: 'p2', name: 'Ravi Kumar', phone: '9000000002' }, kind: 'PROCEDURE', amount: 2500, paid: 1000, due: 1500, status: 'PARTIALLY_PAID' });
const unpaid = row({ id: 'cb3', billNo: 'INV-20261125-003', doctor: null, kind: null, amount: 300, paid: 0, due: 300, status: 'PENDING' });

const page = (rows: ClinicBillRow[], actions = OWNER, totals?: ClinicBillRegister['totals']): ClinicBillRegister => ({
  rows,
  total: rows.length,
  page: 1,
  limit: 50,
  totals: totals ?? {
    count: rows.length,
    billed: rows.reduce((sum, r) => sum + r.amount, 0),
    collected: rows.reduce((sum, r) => sum + r.paid, 0),
    outstanding: rows.reduce((sum, r) => sum + r.due, 0),
    voided: 0,
  },
  actions,
});

const receiptOf = (bill: ClinicBillRow): ClinicReceipt => ({
  bill,
  clinic: { name: 'Lakshmi Family Clinic', address: '12 MG Road, Hyderabad' },
  notes: null,
  items: [{ id: 'i1', name: 'Procedure: Chemical peel', qty: 1, unitPrice: bill.amount, discount: 0, gstRate: 0, total: bill.amount }],
  payments: bill.paid ? [{ id: 'pay1', amount: bill.paid, mode: 'CASH', reference: null, paidAt: '2026-11-25T05:00:00.000Z', refundable: bill.paid }] : [],
});

type Call = { method: string; path: string; params: URLSearchParams; body: unknown };
type Reply = { status?: number; body: unknown };
let calls: Call[] = [];
let server: (call: Call) => Reply;

const json = ({ status = 200, body }: Reply) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const registerRequests = () => calls.filter((c) => c.method === 'GET' && c.path === '/api/billing/register');
const writes = () => calls.filter((c) => c.method !== 'GET').map(({ method, path, params, body }) => [method, `${path}${params.toString() ? `?${params}` : ''}`, body]);
const table = () => within(screen.getByRole('table', { name: 'Clinic bills' }));
const rowOf = (billNo: string) => table().getByRole('button', { name: `Open bill ${billNo}` }).closest('tr') as HTMLElement;

beforeAll(() => {
  jest.useFakeTimers({ now: new Date('2026-11-25T06:00:00.000Z'), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'nextTick', 'queueMicrotask'] });
});
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  mockQuery = '';
  calls = [];
  jest.clearAllMocks();
  global.fetch = jest.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://clinic.test');
    const call = { method: (init.method ?? 'GET').toUpperCase(), path: url.pathname, params: url.searchParams, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    return json(server(call));
  }) as unknown as typeof fetch;
});

it('lists clinic bills with their totals, and the Outstanding filter asks the server for outstanding bills only', async () => {
  server = () => ({ body: page([row({}), peel, unpaid]) });
  render(<BillingPage />);

  expect(await screen.findByRole('heading', { level: 1, name: 'Clinic billing' })).toBeInTheDocument();
  await waitFor(() => expect(rowOf(peel.billNo)).toBeTruthy());
  const cells = (billNo: string) => Array.from(rowOf(billNo).querySelectorAll('td')).slice(0, 9).map((td) => td.textContent);
  expect(cells(peel.billNo)).toEqual(['25 Nov, 10:00 am', 'INV-20261125-002', 'Ravi Kumar', 'Priya Menon', 'Procedure', '₹2,500', '₹1,000', '₹1,500', 'Part paid']);
  expect(cells(unpaid.billNo)).toEqual(['25 Nov, 10:00 am', 'INV-20261125-003', 'Meera Shah', '—', '—', '₹300', '₹0', '₹300', 'Unpaid']);
  expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Billed ₹3,300 · Collected ₹1,500 · Outstanding ₹1,800');
  expect(Object.fromEntries(registerRequests()[0].params)).toEqual({ from: '2026-04-01', to: '2027-03-31', sortBy: 'billedAt', sortDir: 'desc', page: '1', limit: '50' });

  server = () => ({ body: page([peel, unpaid]) });
  fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'outstanding' } });
  await waitFor(() => expect(registerRequests()).toHaveLength(2));
  expect(Object.fromEntries(registerRequests()[1].params)).toEqual({ from: '2026-04-01', to: '2027-03-31', status: 'outstanding', sortBy: 'billedAt', sortDir: 'desc', page: '1', limit: '50' });
  await waitFor(() => expect(table().queryByRole('button', { name: 'Open bill INV-20261125-001' })).toBeNull());
  expect(mockReplace).toHaveBeenLastCalledWith('/dashboard/billing?status=outstanding', { scroll: false });
});

it('opens the overdue alert link on the Overdue filter at any bill date, and says when nothing is overdue', async () => {
  mockQuery = 'status=overdue';
  server = () => ({ body: page([]) });
  render(<BillingPage />);

  expect(await screen.findByText('No overdue clinic bills')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('Overdue');
  expect(screen.getByText('Any bill date')).toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Period' })).toBeNull();
  expect(registerRequests()[0].params.get('status')).toBe('overdue');
});

it('collects a part payment with the mode the desk picked, and the row shows what is still due', async () => {
  let current = peel;
  server = ({ method, path }) => {
    if (method === 'POST' && path === '/api/billing/payments') {
      current = { ...peel, paid: 1200, due: 1300 };
      return { status: 201, body: { id: 'pay2' } };
    }
    if (path === '/api/billing/invoices/cb2/receipt') return { body: receiptOf(current) };
    return { body: page([current]) };
  };
  render(<BillingPage />);

  fireEvent.click(await screen.findByRole('button', { name: 'Collect payment on bill INV-20261125-002 for Ravi Kumar' }));
  const dialog = await screen.findByRole('dialog', { name: /Bill INV-20261125-002/ });
  const amount = await within(dialog).findByRole('textbox', { name: 'Amount received' });
  expect(amount).toHaveValue('1500');
  fireEvent.change(amount, { target: { value: '200' } });
  fireEvent.click(within(dialog).getByRole('radio', { name: 'UPI' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record ₹200 payment' }));

  await waitFor(() => expect(writes()).toEqual([['POST', '/api/billing/payments', { invoiceId: 'cb2', amount: 200, method: 'UPI' }]]));
  await waitFor(() => expect(within(dialog).getByRole('textbox', { name: 'Amount received' })).toHaveValue('1300'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(Array.from(rowOf(peel.billNo).querySelectorAll('td')).map((td) => td.textContent).slice(6, 8)).toEqual(['₹1,200', '₹1,300']));
});

it('offers Refund only on payments with money left to refund, and defaults to what is left', async () => {
  const split = row({ id: 'cb4', billNo: 'INV-20261125-004', amount: 1500, paid: 800, due: 700, refunded: 700, status: 'PARTIALLY_PAID' });
  const paidAt = '2026-11-25T05:00:00.000Z';
  const receipt: ClinicReceipt = {
    ...receiptOf(split),
    payments: [
      { id: 'cash', amount: 500, mode: 'CASH', reference: null, paidAt, refundable: 0 },
      { id: 'upi', amount: 500, mode: 'UPI', reference: null, paidAt, refundable: 300 },
      { id: 'card', amount: 500, mode: 'CARD', reference: null, paidAt, refundable: 500 },
      { id: 'cash-back', amount: -500, mode: 'CASH', reference: 'REFUND: Wrong bill', paidAt, refundable: 0 },
      { id: 'upi-back', amount: -200, mode: 'UPI', reference: 'REFUND: Goodwill', paidAt, refundable: 0 },
    ],
  };
  server = ({ method, path }) => {
    if (method === 'POST' && path === '/api/billing/refunds') return { status: 201, body: { id: 'upi-back-2' } };
    if (path === '/api/billing/invoices/cb4/receipt') return { body: receipt };
    return { body: page([split]) };
  };
  render(<BillingPage />);

  fireEvent.click(await screen.findByRole('button', { name: `Open bill ${split.billNo}` }));
  const dialog = await screen.findByRole('dialog', { name: /Bill INV-20261125-004/ });
  const payments = within(await within(dialog).findByRole('region', { name: 'Payments' })).getAllByRole('listitem');
  const refundOn = (item: HTMLElement) => within(item).queryByRole('button', { name: 'Refund' });
  expect(payments.map((item) => [item.textContent?.split(' · ')[0], Boolean(refundOn(item))])).toEqual([
    ['₹500 Cash', false],
    ['₹500 UPI', true],
    ['₹500 Card', true],
    ['Refund ₹500 Cash', false],
    ['Refund ₹200 UPI', false],
  ]);

  fireEvent.click(refundOn(payments[1])!);
  const form = within(dialog).getByRole('group', { name: 'Refund ₹500 UPI' });
  expect(within(form).getByRole('textbox', { name: 'Refund amount' })).toHaveValue('300');
  fireEvent.change(within(form).getByRole('textbox', { name: 'Reason' }), { target: { value: 'Goodwill' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Refund ₹300' }));
  await waitFor(() => expect(writes()).toEqual([['POST', '/api/billing/refunds', { paymentId: 'upi', amount: 300, notes: 'Goodwill' }]]));
});

it('shows the refusal and the bill as it is now when another desk refunded the payment first', async () => {
  const paid = row({ id: 'cb5', billNo: 'INV-20261125-005', amount: 1000, paid: 1000, due: 0, status: 'PAID' });
  const paidAt = '2026-11-25T05:00:00.000Z';
  const cash = { id: 'cash', amount: 500, mode: 'CASH', reference: null, paidAt };
  const upi = { id: 'upi', amount: 500, mode: 'UPI', reference: null, paidAt, refundable: 500 };
  let current: ClinicReceipt = { ...receiptOf(paid), payments: [{ ...cash, refundable: 500 }, upi] };
  const refunded: ClinicReceipt = {
    ...receiptOf({ ...paid, paid: 500, due: 500, refunded: 500, status: 'PARTIALLY_PAID' }),
    payments: [{ ...cash, refundable: 0 }, upi, { id: 'cash-back', amount: -500, mode: 'CASH', reference: 'REFUND: Paid twice', paidAt, refundable: 0 }],
  };
  const refusal = 'This ₹500 payment is already refunded in full, so ₹500 cannot be refunded.';
  server = ({ method, path }) => {
    if (method === 'POST' && path === '/api/billing/refunds') return { status: 400, body: { message: refusal } };
    if (path === '/api/billing/invoices/cb5/receipt') return { body: current };
    return { body: page([paid]) };
  };
  render(<BillingPage />);

  fireEvent.click(await screen.findByRole('button', { name: `Open bill ${paid.billNo}` }));
  const dialog = await screen.findByRole('dialog', { name: /Bill INV-20261125-005/ });
  const payments = within(await within(dialog).findByRole('region', { name: 'Payments' })).getAllByRole('listitem');
  fireEvent.click(within(payments[0]).getByRole('button', { name: 'Refund' }));
  const form = within(dialog).getByRole('group', { name: 'Refund ₹500 Cash' });
  fireEvent.change(within(form).getByRole('textbox', { name: 'Reason' }), { target: { value: 'Paid twice' } });
  current = refunded;
  fireEvent.click(within(form).getByRole('button', { name: 'Refund ₹500' }));

  expect(await within(dialog).findByText(/^Refund ₹500 Cash/)).toBeInTheDocument();
  const alert = within(within(dialog).getByRole('group', { name: 'Refund ₹500 Cash' })).getByRole('alert');
  expect(alert).toHaveTextContent(refusal);
  expect(alert).toHaveTextContent(/Nothing was refunded\.$/);
  expect(within(dialog).getByText('Paid').nextElementSibling).toHaveTextContent('₹500');
});

it('voids a bill only after the user gives a reason and confirms', async () => {
  let voided = false;
  server = ({ method }) => {
    if (method === 'DELETE') {
      voided = true;
      return { body: { id: 'cb3', status: 'CANCELLED' } };
    }
    return { body: page([peel, voided ? { ...unpaid, due: 0, status: 'CANCELLED', voidReason: 'Booked twice' } : unpaid]) };
  };
  render(<BillingPage />);

  expect(await screen.findByRole('button', { name: `Void bill ${peel.billNo} for Ravi Kumar` })).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(screen.getByRole('button', { name: `Void bill ${unpaid.billNo} for Meera Shah` }));
  let ask = await screen.findByRole('alertdialog', { name: `Void bill ${unpaid.billNo}?` });
  expect(within(ask).getByRole('button', { name: 'Void bill' })).toBeDisabled();
  fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(writes()).toEqual([]);

  fireEvent.click(screen.getByRole('button', { name: `Void bill ${unpaid.billNo} for Meera Shah` }));
  ask = await screen.findByRole('alertdialog', { name: `Void bill ${unpaid.billNo}?` });
  fireEvent.change(within(ask).getByRole('textbox', { name: 'Reason for voiding' }), { target: { value: 'Booked twice' } });
  fireEvent.click(within(ask).getByRole('button', { name: 'Void bill' }));

  await waitFor(() => expect(writes()).toEqual([['DELETE', '/api/billing/invoices/cb3?reason=Booked+twice', undefined]]));
  await waitFor(() => expect(within(rowOf(unpaid.billNo)).getByText('Void')).toBeInTheDocument());
});

it('offers the front desk Collect and receipts but no Void, and tells a refused role it has no access', async () => {
  server = () => ({ body: page([peel, unpaid], RECEPTION) });
  const { unmount } = render(<BillingPage />);
  await screen.findByRole('button', { name: `Collect payment on bill ${peel.billNo} for Ravi Kumar` });
  expect(screen.getByRole('button', { name: `Print receipt for bill ${peel.billNo} for Ravi Kumar` })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Void bill/ })).toBeNull();
  unmount();

  server = () => ({ status: 403, body: { message: 'Forbidden resource' } });
  render(<BillingPage />);
  expect(await screen.findByText('You don’t have access to clinic bills.')).toBeInTheDocument();
  expect(screen.queryByRole('table')).toBeNull();
});
