import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PurchaseRegister } from '@/components/inventory/purchase/PurchaseRegister';
import { Toaster } from '@/components/ui/toaster';
import { apiClient } from '@/lib/api';
import type { PurchaseRegisterResponse, PurchaseRegisterRow } from '@/components/inventory/purchase/purchase-register-model';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));

const row = (overrides: Partial<PurchaseRegisterRow> & { payment?: Partial<PurchaseRegisterRow['payment']> }): PurchaseRegisterRow => ({
  id: 'bill-a',
  srNo: 1,
  billNo: 'LIN-101',
  entryAt: '2026-10-01T05:00:00.000Z',
  billDate: '2026-10-01',
  entryBy: { id: 'user-asha', name: 'Asha Rao' },
  source: 'MANUAL',
  distributor: { name: 'Linae Distributors', gstin: '36ABCDE1234F1Z5' },
  amount: 1000,
  invoiceState: 'POSTED',
  ...overrides,
  payment: { state: 'DUE', paid: 0, credit: 0, outstanding: 1000, dueDate: null, overdueDays: 0, ...overrides.payment },
});

const ROWS = [
  row({}),
  row({ id: 'bill-b', srNo: 2, billNo: 'MED-7', distributor: { name: 'Medico Agencies', gstin: '27AAAAA0000A1Z5' }, amount: 300, payment: { state: 'OVERDUE', outstanding: 300, dueDate: '2026-10-31', overdueDays: 6 } }),
  row({ id: 'bill-c', srNo: 3, billNo: 'LIN-102', amount: 300, payment: { state: 'PARTIAL', paid: 100, credit: 50, outstanding: 150 } }),
  row({ id: 'bill-d', srNo: 4, billNo: 'LIN-103', amount: 500, payment: { state: 'PAID', paid: 500, outstanding: 0 } }),
  row({ id: 'bill-e', srNo: 5, billNo: 'LIN-104', amount: 700, invoiceState: 'REVIEW', payment: { state: 'NOT_POSTED', outstanding: 0 } }),
  row({ id: 'bill-f', srNo: 6, billNo: 'LIN-105', amount: 200, invoiceState: 'CANCELLED', payment: { state: 'CANCELLED', outstanding: 0 } }),
];

const response = (overrides: Partial<PurchaseRegisterResponse> = {}): PurchaseRegisterResponse => ({
  rows: ROWS,
  total: 6,
  page: 1,
  limit: 50,
  totals: { amount: 3000, outstanding: 1450, count: 5, excluded: { cancelled: 1 } },
  entryByOptions: [{ id: 'user-asha', name: 'Asha Rao' }],
  distributorOptions: [
    { name: 'Linae Distributors', gstin: '36ABCDE1234F1Z5' },
    { name: 'Medico Agencies', gstin: '27AAAAA0000A1Z5' },
  ],
  canSettle: true,
  ...overrides,
});

const get = jest.mocked(apiClient.get);
const post = jest.mocked(apiClient.post);
const registerCalls = () => get.mock.calls.filter(([url]) => url === '/pharmacy/purchase-register');
const lastRequest = () => registerCalls().at(-1)![1] as Record<string, unknown>;
const onParamsChange = jest.fn();
const onOpen = jest.fn();

function renderRegister(query = '') {
  return render(
    <>
      <PurchaseRegister
        searchParams={new URLSearchParams(query)}
        onParamsChange={onParamsChange}
        onOpen={onOpen}
        onNew={jest.fn()}
        onLedger={jest.fn()}
        onSuppliers={jest.fn()}
      />
      <Toaster />
    </>,
  );
}

const markPaidButtons = () => screen.queryAllByRole('button', { name: /^Mark bill .* paid$/ }).map((button) => button.getAttribute('aria-label'));

beforeAll(() => {
  jest.useFakeTimers({ now: new Date('2026-11-06T06:00:00.000Z'), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'nextTick', 'queueMicrotask'] });
});
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  get.mockResolvedValue(response());
});

it('asks for this financial year, newest entries first, and totals bills and outstanding', async () => {
  renderRegister();
  await screen.findByText('MED-7');
  const table = screen.getByRole('table', { name: 'Purchase bills' });
  expect(registerCalls()).toEqual([
    [
      '/pharmacy/purchase-register',
      {
        from: '2026-04-01',
        to: '2027-03-31',
        paymentState: undefined,
        distributorGstin: undefined,
        invoiceState: undefined,
        source: undefined,
        entryById: undefined,
        sortBy: 'entryAt',
        sortDir: 'desc',
        page: 1,
        limit: 50,
      },
    ],
  ]);
  expect(within(table).getAllByRole('columnheader').map((head) => head.textContent?.trim())).toEqual([
    'Sr No', 'Bill No', 'Entry Date', 'Bill Date', 'Entry By', 'Distributor', 'Bill Amount', 'Payment', 'Settle',
  ]);
  expect(screen.getByText('Bills ₹3,000.00 · Outstanding ₹1,450.00 · 5 bills')).toBeInTheDocument();
  expect(screen.getByText('1 cancelled not included')).toBeInTheDocument();
});

it('opens a bill from its number or its row', async () => {
  renderRegister();
  fireEvent.click(await screen.findByRole('button', { name: 'Open bill MED-7' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open bill LIN-101' }).closest('tr')!.cells[3]);
  expect(onOpen.mock.calls).toEqual([['bill-b'], ['bill-a']]);
});

it('sorts by Sr No, amount and outstanding, and reports the direction', async () => {
  renderRegister();
  await screen.findByText('MED-7');
  const srNo = screen.getByRole('columnheader', { name: /Sr No/ });
  fireEvent.click(within(srNo).getByRole('button'));
  await waitFor(() => expect(lastRequest()).toMatchObject({ sortBy: 'srNo', sortDir: 'asc' }));
  expect(srNo).toHaveAttribute('aria-sort', 'ascending');
  fireEvent.click(within(srNo).getByRole('button'));
  await waitFor(() => expect(lastRequest()).toMatchObject({ sortBy: 'srNo', sortDir: 'desc' }));

  const amount = screen.getByRole('columnheader', { name: /Bill Amount/ });
  fireEvent.click(within(amount).getByRole('button'));
  await waitFor(() => expect(lastRequest()).toMatchObject({ sortBy: 'amount', sortDir: 'desc' }));

  const paymentHead = screen.getByRole('columnheader', { name: /Payment/ });
  fireEvent.click(within(paymentHead).getByRole('button'));
  await waitFor(() => expect(lastRequest()).toMatchObject({ sortBy: 'outstanding', sortDir: 'desc' }));
  expect(paymentHead).toHaveAttribute('aria-sort', 'descending');
  expect(srNo).toHaveAttribute('aria-sort', 'none');
});

it('combines distributor search, payment status and more filters, and keeps them in the URL', async () => {
  renderRegister();
  await screen.findByText('MED-7');
  fireEvent.change(screen.getByLabelText('Search by'), { target: { value: 'distributor' } });
  fireEvent.change(screen.getByPlaceholderText('Distributor name or GSTIN'), { target: { value: 'linae' } });
  fireEvent.change(screen.getByLabelText('Payment status'), { target: { value: 'OUTSTANDING' } });
  fireEvent.click(screen.getByRole('button', { name: 'More filters' }));
  fireEvent.change(screen.getByLabelText('Distributor'), { target: { value: '36ABCDE1234F1Z5' } });
  fireEvent.change(screen.getByLabelText('Bill status'), { target: { value: 'POSTED' } });

  await waitFor(() =>
    expect(lastRequest()).toMatchObject({
      field: 'distributor',
      q: 'linae',
      paymentState: 'OUTSTANDING',
      distributorGstin: '36ABCDE1234F1Z5',
      invoiceState: 'POSTED',
      page: 1,
    }),
  );
  expect(screen.getByRole('button', { name: 'More filters 2 active' })).toBeInTheDocument();
  expect(onParamsChange.mock.calls.at(-1)![0].toString()).toBe('field=distributor&q=linae&pay=OUTSTANDING&gstin=36ABCDE1234F1Z5&state=POSTED');
});

it('reads filters from the URL, including a supplier opened from Suppliers', async () => {
  renderRegister('gstin=27AAAAA0000A1Z5&pay=PAID');
  await screen.findByText('MED-7');
  expect(lastRequest()).toMatchObject({ distributorGstin: '27AAAAA0000A1Z5', paymentState: 'PAID' });
  expect(screen.getByRole('button', { name: 'More filters 1 active' })).toBeInTheDocument();
});

it('shows a badge for every payment state and offers Mark paid only on bills that are owed', async () => {
  renderRegister();
  await screen.findByText('MED-7');
  const table = screen.getByRole('table', { name: 'Purchase bills' });
  const payments = within(table).getAllByRole('row').slice(1).map((tr) => tr.cells[7].textContent);
  expect(payments).toEqual([
    'Due',
    'Overdue · 6d',
    '₹150.00 duepart paid',
    'Paid',
    'Not posted. In review. Post stock before paying',
    'Cancelled',
  ]);
  expect(markPaidButtons()).toEqual(['Mark bill LIN-101 paid', 'Mark bill MED-7 paid', 'Mark bill LIN-102 paid']);
});

it('hides Mark paid from someone who cannot record supplier payments', async () => {
  get.mockResolvedValue(response({ canSettle: false }));
  renderRegister();
  await screen.findByText('Overdue · 6d');
  expect(markPaidButtons()).toEqual([]);
  expect(screen.queryByRole('columnheader', { name: 'Settle' })).not.toBeInTheDocument();
});

it('records the outstanding amount once across a retry, then undoes it from the toast', async () => {
  window.localStorage.setItem('purchase-register.settle-mode', 'UPI');
  post
    .mockRejectedValueOnce(new Error('Network request failed'))
    .mockResolvedValueOnce({ id: 'payment-1', updatedAt: '2026-11-06T06:00:01.000Z' })
    .mockResolvedValueOnce({ original: { id: 'payment-1' } });
  renderRegister();
  fireEvent.click(await screen.findByRole('button', { name: 'Mark bill LIN-102 paid' }));

  const dialog = screen.getByRole('dialog', { name: 'Pay ₹150.00 to Linae Distributors' });
  expect(dialog).toHaveTextContent('For bill LIN-102 · ₹150.00 already settled');
  expect(within(dialog).getByLabelText('Mode')).toHaveValue('UPI');
  expect(within(dialog).getByLabelText('Date')).toHaveValue('06/11/2026');
  const record = within(dialog).getByRole('button', { name: 'Record payment ₹150.00' });
  expect(record).toHaveFocus();
  fireEvent.change(within(dialog).getByLabelText(/Cheque \/ UTR no\./), { target: { value: ' UTR 5521 ' } });

  fireEvent.click(record);
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Network request failed');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment ₹150.00' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  const [first, retry] = post.mock.calls;
  expect(retry).toEqual(first);
  expect(first).toEqual([
    '/pharmacy/purchase-ledger/payments',
    {
      requestKey: expect.stringMatching(/^[0-9a-f]{32}$/),
      distributorGstin: '36ABCDE1234F1Z5',
      distributorName: 'Linae Distributors',
      paymentDate: '2026-11-06',
      mode: 'UPI',
      amount: 150,
      referenceNo: 'UTR 5521',
      allocations: [{ purchaseInvoiceId: 'bill-c', amount: 150 }],
    },
    { idempotencyKey: (first[1] as { requestKey: string }).requestKey },
  ]);
  expect(await screen.findByText('Payment recorded')).toBeInTheDocument();
  expect(screen.getByText('₹150.00 to Linae Distributors for bill LIN-102.')).toBeInTheDocument();
  expect(registerCalls()).toHaveLength(2);

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(await screen.findByText('Payment undone')).toBeInTheDocument();
  expect(post.mock.calls[2]).toEqual([
    '/pharmacy/purchase-ledger/payments/payment-1/reverse',
    { requestKey: expect.stringMatching(/^[0-9a-f]{32}$/), expectedUpdatedAt: '2026-11-06T06:00:01.000Z', reason: 'Undone from purchase list' },
    { idempotencyKey: (post.mock.calls[2][1] as { requestKey: string }).requestKey },
  ]);
  await waitFor(() => expect(registerCalls()).toHaveLength(3));
});

it('remembers the last payment mode for the next bill', async () => {
  post.mockResolvedValue({ id: 'payment-2', updatedAt: '2026-11-06T06:00:01.000Z' });
  renderRegister();
  fireEvent.click(await screen.findByRole('button', { name: 'Mark bill LIN-101 paid' }));
  expect(screen.getByLabelText('Mode')).toHaveValue('NEFT');
  fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'CHEQUE' } });
  fireEvent.click(screen.getByRole('button', { name: 'Record payment ₹1,000.00' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Mark bill MED-7 paid' }));
  expect(screen.getByLabelText('Mode')).toHaveValue('CHEQUE');
});

it('flattens server validation messages inside the popover and refuses a future date', async () => {
  post.mockRejectedValueOnce({ body: { message: ['amount must not be less than 0.01', 'paymentDate must be a valid ISO 8601 date string'] } });
  renderRegister();
  fireEvent.click(await screen.findByRole('button', { name: 'Mark bill MED-7 paid' }));
  const dialog = screen.getByRole('dialog', { name: 'Pay ₹300.00 to Medico Agencies' });
  fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '07/11/2026' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment ₹300.00' }));
  expect(within(dialog).getByRole('alert')).toHaveTextContent('The payment date cannot be after today, 06/11/2026.');
  expect(post.mock.calls).toEqual([]);

  fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '05/11/2026' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment ₹300.00' }));
  expect(await within(dialog).findByText('amount must not be less than 0.01. paymentDate must be a valid ISO 8601 date string')).toBeInTheDocument();
  expect((post.mock.calls[0][1] as { paymentDate: string }).paymentDate).toBe('2026-11-05');
});

it('closes on Escape and returns focus to Mark paid', async () => {
  renderRegister();
  const trigger = await screen.findByRole('button', { name: 'Mark bill LIN-101 paid' });
  trigger.focus();
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});

it('keeps the last page visible when a reload fails and recovers on Retry', async () => {
  get.mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValue(response({ rows: [], total: 0 }));
  renderRegister();
  await screen.findByText('MED-7');
  fireEvent.change(screen.getByLabelText('Payment status'), { target: { value: 'PAID' } });
  expect(await screen.findByText('Could not load purchase bills. Connection interrupted')).toBeInTheDocument();
  expect(screen.getByText('Total not available')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('No purchase bills match your search')).toBeInTheDocument();
});
