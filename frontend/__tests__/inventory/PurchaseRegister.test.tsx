import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PurchaseBills } from '@/components/inventory/purchase/PurchaseBills';
import { Toaster } from '@/components/ui/toaster';
import { apiClient } from '@/lib/api';
import type { PurchaseRegisterResponse, PurchaseRegisterRow } from '@/components/inventory/purchase/purchase-register-model';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));

type RowOverrides = Partial<Omit<PurchaseRegisterRow, 'payment'>> & { payment?: Partial<PurchaseRegisterRow['payment']> };
const row = (overrides: RowOverrides): PurchaseRegisterRow => ({
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
  documents: [],
  ...overrides,
  payment: {
    state: 'DUE', paid: 0, credit: 0, outstanding: 1000, scheduled: 0, scheduledOn: null, payable: overrides.payment?.outstanding ?? 1000,
    partlyPaid: false, dueDate: null, overdueDays: 0, ...overrides.payment,
  },
});

const ROWS = [
  row({}),
  row({ id: 'bill-b', srNo: 2, billNo: 'MED-7', distributor: { name: 'Medico Agencies', gstin: '27AAAAA0000A1Z5' }, amount: 300, payment: { state: 'OVERDUE', outstanding: 300, dueDate: '2026-10-31', overdueDays: 6 } }),
  row({ id: 'bill-c', srNo: 3, billNo: 'LIN-102', amount: 300, payment: { state: 'PARTIAL', paid: 100, credit: 50, outstanding: 150, partlyPaid: true } }),
  row({ id: 'bill-g', srNo: 7, billNo: 'LIN-099', amount: 900, payment: { state: 'OVERDUE', paid: 400, outstanding: 500, partlyPaid: true, dueDate: '2026-10-28', overdueDays: 9 } }),
  row({ id: 'bill-d', srNo: 4, billNo: 'LIN-103', amount: 500, payment: { state: 'PAID', paid: 500, outstanding: 0 } }),
  row({ id: 'bill-e', srNo: 5, billNo: 'LIN-104', amount: 700, invoiceState: 'RECONCILIATION_FAILED', payment: { state: 'NOT_POSTED', outstanding: 0 } }),
  row({ id: 'bill-f', srNo: 6, billNo: 'LIN-105', amount: 200, invoiceState: 'CANCELLED', payment: { state: 'CANCELLED', outstanding: 0 } }),
];

const response = (overrides: Partial<PurchaseRegisterResponse> = {}): PurchaseRegisterResponse => ({
  rows: ROWS,
  total: 7,
  page: 1,
  limit: 50,
  totals: { amount: 3000, outstanding: 1950, count: 5, excluded: { notPosted: 1, cancelled: 1 } },
  entryByOptions: [{ id: 'user-asha', name: 'Asha Rao' }],
  distributorOptions: [
    { name: 'Linae Distributors', gstin: '36ABCDE1234F1Z5' },
    { name: 'Medico Agencies', gstin: '27AAAAA0000A1Z5' },
  ],
  ...overrides,
});

const withPayment = (id: string, payment: Partial<PurchaseRegisterRow['payment']>) =>
  response({ rows: ROWS.map((candidate) => (candidate.id === id ? { ...candidate, payment: { ...candidate.payment, ...payment } } : candidate)) });

const get = jest.mocked(apiClient.get);
const post = jest.mocked(apiClient.post);
const registerCalls = () => get.mock.calls.filter(([url]) => url === '/pharmacy/purchase-register');
const lastRequest = () => registerCalls().at(-1)![1] as Record<string, unknown>;
const onParamsChange = jest.fn();
const onOpen = jest.fn();
const onLedger = jest.fn();

function renderRegister(query = '', { canSettle = true, ledger = true } = {}) {
  return render(
    <>
      <PurchaseBills
        searchParams={new URLSearchParams(query)}
        onParamsChange={onParamsChange}
        canSettle={canSettle}
        onOpen={onOpen}
        onNew={jest.fn()}
        onLedger={ledger ? onLedger : null}
        onSuppliers={jest.fn()}
      />
      <Toaster />
    </>,
  );
}

const table = () => screen.getByRole('table', { name: 'Purchase bills' });
const markPaidButtons = () => screen.queryAllByRole('button', { name: /^Mark bill .* paid$/ }).map((button) => button.getAttribute('aria-label'));
const paymentCell = (billNo: string) => screen.getByRole('button', { name: `Open bill ${billNo}` }).closest('tr')!.cells[7];
const armed = () => act(() => new Promise((resolve) => setTimeout(resolve, 320)));
const recorded = (id: string, outstandingAfter = 0) => ({ id, updatedAt: '2026-11-06T06:00:01.000Z', allocations: [{ purchaseInvoiceId: 'bill-a', outstandingAfter }] });

beforeAll(() => {
  jest.useFakeTimers({ now: new Date('2026-11-06T06:00:00.000Z'), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'nextTick', 'queueMicrotask'] });
});
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  jest.clearAllMocks();
  get.mockReset();
  post.mockReset();
  window.localStorage.clear();
  get.mockResolvedValue(response());
});

it('asks for this financial year, newest entries first, and totals posted bills with what is left out', async () => {
  renderRegister();
  await screen.findByText('MED-7');
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
  expect(within(table()).getAllByRole('columnheader').map((head) => head.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
    'Sr No', 'Bill No', 'Entry Date', 'Bill Date', 'Entry By', 'Distributor', 'Bill Amount', 'Payment (by amount outstanding)',
  ]);
  expect(screen.getByRole('tablist', { name: 'Purchase registers' })).toHaveTextContent('Purchase');
  expect(screen.queryByRole('heading', { name: 'Purchase bills' })).not.toBeInTheDocument();
  expect(screen.getByText(/^Bills ₹3,000\.00/).textContent).toBe('Bills ₹3,000.00 · Outstanding ₹1,950.00 · 5 bills');
  expect(screen.getByText('1 not posted and 1 cancelled not included')).toBeInTheDocument();
  expect(screen.getByText('1–7 of 7 rows')).toBeInTheDocument();
});

it('says 1 row, not 1 rows, for a single bill', async () => {
  get.mockResolvedValue(response({ rows: [ROWS[0]], total: 1 }));
  renderRegister();
  expect(await screen.findByText('1–1 of 1 row')).toBeInTheDocument();
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
  fireEvent.click(within(paymentHead).getByRole('button', { name: 'Payment (by amount outstanding)' }));
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
  fireEvent.change(screen.getByLabelText('Bill status'), { target: { value: 'IN_REVIEW' } });

  await waitFor(() =>
    expect(lastRequest()).toMatchObject({
      field: 'distributor',
      q: 'linae',
      paymentState: 'OUTSTANDING',
      distributorGstin: '36ABCDE1234F1Z5',
      invoiceState: 'IN_REVIEW',
      page: 1,
    }),
  );
  expect(screen.getByRole('button', { name: 'More filters 2 active' })).toBeInTheDocument();
  expect(onParamsChange.mock.calls.at(-1)![0].toString()).toBe('field=distributor&q=linae&pay=OUTSTANDING&gstin=36ABCDE1234F1Z5&state=IN_REVIEW');
});

it('reads filters from the URL, including a supplier opened from Suppliers', async () => {
  renderRegister('gstin=27AAAAA0000A1Z5&pay=PAID&state=OCR_REVIEW');
  await screen.findByText('MED-7');
  expect(lastRequest()).toMatchObject({ distributorGstin: '27AAAAA0000A1Z5', paymentState: 'PAID', invoiceState: 'OCR_REVIEW' });
  expect(screen.getByRole('button', { name: 'More filters 2 active' })).toBeInTheDocument();
});

it('exports from the register endpoint with every filter on screen', async () => {
  const open = jest.spyOn(window, 'open').mockReturnValue(null);
  renderRegister('field=distributor&q=linae&from=2026-06-01&to=2026-09-30&pay=OVERDUE&gstin=36ABCDE1234F1Z5&state=IN_REVIEW&source=OCR&by=user-asha&sort=amount&dir=asc');
  await screen.findByText('MED-7');
  fireEvent.keyDown(screen.getByRole('button', { name: 'More' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Export to Excel' }));
  expect(open).toHaveBeenCalledWith(
    '/api/pharmacy/purchase-register?format=xlsx&from=2026-06-01&to=2026-09-30&field=distributor&q=linae&paymentState=OVERDUE&distributorGstin=36ABCDE1234F1Z5&invoiceState=IN_REVIEW&source=OCR&entryById=user-asha&sortBy=amount&sortDir=asc&page=1&limit=50',
    '_blank',
  );
  open.mockRestore();
});

it('links Outstanding to Payments & dues for the filtered supplier, and hides it without ledger access', async () => {
  const { unmount } = renderRegister('gstin=36ABCDE1234F1Z5');
  fireEvent.click(await screen.findByRole('button', { name: 'Outstanding ₹1,950.00, open Payments & dues' }));
  expect(onLedger.mock.calls).toEqual([['36ABCDE1234F1Z5']]);
  unmount();

  renderRegister('', { ledger: false });
  await screen.findByText('MED-7');
  expect(screen.getByText(/^Bills ₹3,000\.00/).textContent).toBe('Bills ₹3,000.00 · Outstanding ₹1,950.00 · 5 bills');
  fireEvent.keyDown(screen.getByRole('button', { name: 'More' }), { key: 'Enter' });
  expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent?.trim())).toEqual(['Export to Excel', 'Suppliers']);
});

it('ranks lateness first in the badge, keeps part payments readable, and offers Mark paid only on bills that are owed', async () => {
  renderRegister();
  await screen.findByText('MED-7');
  const payments = within(table()).getAllByRole('row').slice(1).map((tr) => tr.cells[7].textContent);
  expect(payments).toEqual([
    'DueMark paid',
    'Overdue · 6d6 daysMark paid',
    '₹150.00 due₹150.00 paidMark paid',
    'Overdue · 9d9 days₹400.00 paidMark paid',
    'Paid',
    'Not posted. Reconciliation failed. Post stock before paying',
    'Cancelled',
  ]);
  expect(markPaidButtons()).toEqual(['Mark bill LIN-101 paid', 'Mark bill MED-7 paid', 'Mark bill LIN-102 paid', 'Mark bill LIN-099 paid']);
});

it('hides Mark paid from someone who cannot record supplier payments', async () => {
  renderRegister('', { canSettle: false });
  await screen.findByText('MED-7');
  expect(markPaidButtons()).toEqual([]);
  expect(paymentCell('MED-7')).toHaveTextContent('Overdue · 6d');
});

it('opens on the payment mode with the bill described, and Enter pressed twice from Mark paid cannot record', async () => {
  window.localStorage.setItem('purchase-register.settle-mode', 'UPI');
  post.mockResolvedValue(recorded('payment-1'));
  renderRegister();
  fireEvent.click(await screen.findByRole('button', { name: 'Mark bill LIN-102 paid' }));
  const dialog = screen.getByRole('dialog', { name: 'Pay ₹150.00 to Linae Distributors' });
  expect(dialog).toHaveAccessibleDescription('For bill LIN-102 · ₹150.00 already settled');
  const mode = within(dialog).getByLabelText('Mode');
  expect(mode).toHaveFocus();
  expect(mode).toHaveValue('UPI');

  fireEvent.keyDown(mode, { key: 'Enter' });
  expect(post.mock.calls).toEqual([]);
  expect(screen.getByRole('dialog')).toBeInTheDocument();

  await armed();
  fireEvent.keyDown(mode, { key: 'Enter' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(post.mock.calls.map(([url, body]) => [url, (body as { amount: number }).amount])).toEqual([['/pharmacy/purchase-ledger/payments', 150]]);
});

it('records the outstanding amount once across a retry, moves focus to the next Mark paid, and undoes inline with the refetched state', async () => {
  get.mockResolvedValueOnce(response()).mockResolvedValueOnce(withPayment('bill-a', { state: 'PAID', paid: 1000, outstanding: 0 })).mockResolvedValue(response());
  post
    .mockRejectedValueOnce(new Error('Network request failed'))
    .mockResolvedValueOnce(recorded('payment-1'))
    .mockResolvedValueOnce({ original: { id: 'payment-1' } });
  renderRegister();
  fireEvent.click(await screen.findByRole('button', { name: 'Mark bill LIN-101 paid' }));
  const dialog = screen.getByRole('dialog', { name: 'Pay ₹1,000.00 to Linae Distributors' });
  expect(within(dialog).getByLabelText('Mode')).toHaveValue('NEFT');
  expect(within(dialog).getByLabelText('Date')).toHaveValue('06/11/2026');
  fireEvent.change(within(dialog).getByLabelText(/Cheque \/ UTR no\./), { target: { value: ' UTR 5521 ' } });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment ₹1,000.00' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Network request failed');
  expect(within(dialog).getByLabelText('Date')).not.toHaveAttribute('aria-invalid');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment ₹1,000.00' }));

  await waitFor(() => expect(screen.getByRole('button', { name: 'Mark bill MED-7 paid' })).toHaveFocus());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const [first, retry] = post.mock.calls;
  expect(retry).toEqual(first);
  expect(first).toEqual([
    '/pharmacy/purchase-ledger/payments',
    {
      requestKey: expect.stringMatching(/^[0-9a-f]{32}$/),
      distributorGstin: '36ABCDE1234F1Z5',
      distributorName: 'Linae Distributors',
      paymentDate: '2026-11-06',
      mode: 'NEFT',
      amount: 1000,
      referenceNo: 'UTR 5521',
      allocations: [{ purchaseInvoiceId: 'bill-a', amount: 1000 }],
    },
    { idempotencyKey: (first[1] as { requestKey: string }).requestKey },
  ]);
  expect(paymentCell('LIN-101')).toHaveTextContent('PaidUndo');
  expect(screen.queryByText('Payment recorded')).not.toBeInTheDocument();
  expect(screen.getByText('Recorded ₹1,000.00 for bill LIN-101.')).toBeInTheDocument();
  expect(window.localStorage.getItem('purchase-register.settle-mode')).toBe('NEFT');

  fireEvent.click(within(paymentCell('LIN-101')).getByRole('button', { name: 'Undo payment for bill LIN-101' }));
  expect(await screen.findByText('Payment undone')).toBeInTheDocument();
  expect(screen.getByText('Bill LIN-101: Due ₹1,000.00.')).toBeInTheDocument();
  expect(post.mock.calls[2]).toEqual([
    '/pharmacy/purchase-ledger/payments/payment-1/reverse',
    { requestKey: expect.stringMatching(/^[0-9a-f]{32}$/), expectedUpdatedAt: '2026-11-06T06:00:01.000Z', reason: 'Undone from purchase list' },
    { idempotencyKey: (post.mock.calls[2][1] as { requestKey: string }).requestKey },
  ]);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Mark bill LIN-101 paid' })).toHaveFocus());
  expect(registerCalls()).toHaveLength(3);
});

it('keeps an inline Undo on each of two bills settled one after the other', async () => {
  get
    .mockResolvedValueOnce(response())
    .mockResolvedValueOnce(withPayment('bill-a', { state: 'PAID', paid: 1000, outstanding: 0 }))
    .mockResolvedValue(
      response({
        rows: ROWS.map((candidate) =>
          ['bill-a', 'bill-b'].includes(candidate.id) ? { ...candidate, payment: { ...candidate.payment, state: 'PAID' as const, outstanding: 0 } } : candidate,
        ),
      }),
    );
  post.mockResolvedValueOnce(recorded('payment-1')).mockResolvedValueOnce({ ...recorded('payment-2'), allocations: [{ purchaseInvoiceId: 'bill-b', outstandingAfter: 0 }] });
  renderRegister();
  fireEvent.click(await screen.findByRole('button', { name: 'Mark bill LIN-101 paid' }));
  fireEvent.click(screen.getByRole('button', { name: 'Record payment ₹1,000.00' }));
  const next = await screen.findByRole('button', { name: 'Mark bill MED-7 paid' });
  await waitFor(() => expect(next).toHaveFocus());
  fireEvent.click(next);
  fireEvent.click(screen.getByRole('button', { name: 'Record payment ₹300.00' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Mark bill LIN-102 paid' })).toHaveFocus());
  expect(screen.getAllByRole('button', { name: /^Undo payment for bill/ }).map((button) => button.getAttribute('aria-label'))).toEqual([
    'Undo payment for bill LIN-101',
    'Undo payment for bill MED-7',
  ]);
});

it('warns when a payment leaves part of the bill unpaid', async () => {
  get.mockResolvedValueOnce(response()).mockResolvedValue(withPayment('bill-a', { state: 'PARTIAL', paid: 1000, outstanding: 200, partlyPaid: true }));
  post.mockResolvedValueOnce(recorded('payment-1', 200));
  renderRegister();
  fireEvent.click(await screen.findByRole('button', { name: 'Mark bill LIN-101 paid' }));
  fireEvent.click(screen.getByRole('button', { name: 'Record payment ₹1,000.00' }));
  expect(await screen.findByText('Recorded ₹1,000.00; ₹200.00 still due')).toBeInTheDocument();
  await waitFor(() => expect(paymentCell('LIN-101')).toHaveTextContent('₹200.00 due₹1,000.00 paidUndoMark paid'));
  expect(registerCalls()).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Mark bill MED-7 paid' })).toHaveFocus();
  expect(within(paymentCell('LIN-101')).getByRole('button', { name: 'Undo payment for bill LIN-101' })).toHaveClass('whitespace-nowrap!');
});

it('keeps focus on the bill when an under-paid bill is the only row, and undoes after its Mark paid is offered again', async () => {
  const only = (payment: Partial<PurchaseRegisterRow['payment']>) => response({ rows: [row({ payment })], total: 1 });
  get.mockResolvedValueOnce(only({})).mockResolvedValue(only({ state: 'PARTIAL', paid: 800, outstanding: 200, partlyPaid: true }));
  post.mockResolvedValueOnce(recorded('payment-1', 200));
  renderRegister();
  fireEvent.click(await screen.findByRole('button', { name: 'Mark bill LIN-101 paid' }));
  fireEvent.click(screen.getByRole('button', { name: 'Record payment ₹1,000.00' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open bill LIN-101' })).toHaveFocus());
  expect(document.activeElement).not.toBe(document.body);
  expect(paymentCell('LIN-101')).toHaveTextContent('₹200.00 due₹800.00 paidUndoMark paid');
});

it('forgets an Undo the server says was already reversed, and shows the latest balance', async () => {
  get
    .mockResolvedValueOnce(response())
    .mockResolvedValueOnce(withPayment('bill-a', { state: 'PAID', paid: 1000, outstanding: 0 }))
    .mockResolvedValue(response());
  post.mockResolvedValueOnce(recorded('payment-1')).mockRejectedValueOnce({ status: 409, body: { message: 'This payment was already reversed' } });
  renderRegister();
  fireEvent.click(await screen.findByRole('button', { name: 'Mark bill LIN-101 paid' }));
  fireEvent.click(screen.getByRole('button', { name: 'Record payment ₹1,000.00' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Undo payment for bill LIN-101' }));
  expect(await screen.findByText('This payment was already undone')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Undo payment for bill LIN-101' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  expect(paymentCell('LIN-101')).toHaveTextContent('DueMark paid');
  expect(registerCalls()).toHaveLength(3);
  expect(post).toHaveBeenCalledTimes(2);
});

it('offers Undo in a toast when the paid bill drops out of the filtered list', async () => {
  get.mockResolvedValueOnce(response()).mockResolvedValue(response({ rows: ROWS.filter((candidate) => candidate.id !== 'bill-a') }));
  post.mockResolvedValueOnce(recorded('payment-1')).mockResolvedValueOnce({});
  renderRegister('pay=OUTSTANDING');
  fireEvent.click(await screen.findByRole('button', { name: 'Mark bill LIN-101 paid' }));
  fireEvent.click(screen.getByRole('button', { name: 'Record payment ₹1,000.00' }));
  expect(await screen.findByText('₹1,000.00 to Linae Distributors for bill LIN-101.')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Mark bill MED-7 paid' })).toHaveFocus());
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect((post.mock.calls[1] as unknown[])[0]).toBe('/pharmacy/purchase-ledger/payments/payment-1/reverse'));
});

it.each([
  [{ status: 409, body: { message: 'This payment request key was used for different details. Reload the recorded payment.' } }, 'This payment was already recorded'],
  [{ status: 400, body: { message: 'Allocation exceeds outstanding balance for invoice LIN-101' } }, 'This bill’s balance changed'],
])('closes, refetches and explains a stale balance (%#)', async (failure, title) => {
  get.mockResolvedValueOnce(response()).mockResolvedValue(withPayment('bill-a', { state: 'PARTIAL', paid: 600, outstanding: 400, partlyPaid: true }));
  post.mockRejectedValueOnce(failure);
  renderRegister();
  fireEvent.click(await screen.findByRole('button', { name: 'Mark bill LIN-101 paid' }));
  fireEvent.click(screen.getByRole('button', { name: 'Record payment ₹1,000.00' }));
  const toast = (await screen.findByText(title)).closest('li')!;
  expect(toast).toHaveClass('bg-yellow-50');
  expect(toast).not.toHaveClass('bg-destructive');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => expect(paymentCell('LIN-101')).toHaveTextContent('₹400.00 due₹600.00 paidMark paid'));
  expect(registerCalls()).toHaveLength(2);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Mark bill LIN-101 paid' })).toHaveFocus());
});

it('refuses a payment date after today or before the bill date on the Date field, and flattens other server messages', async () => {
  post.mockRejectedValueOnce({ status: 400, body: { message: ['referenceNo must be shorter than or equal to 80 characters', 'mode must be one of CASH, UPI'] } });
  renderRegister();
  fireEvent.click(await screen.findByRole('button', { name: 'Mark bill MED-7 paid' }));
  const dialog = screen.getByRole('dialog', { name: 'Pay ₹300.00 to Medico Agencies' });
  const date = within(dialog).getByLabelText('Date');
  const record = within(dialog).getByRole('button', { name: 'Record payment ₹300.00' });

  fireEvent.change(date, { target: { value: '07/11/2026' } });
  fireEvent.click(record);
  expect(date).toHaveAttribute('aria-invalid', 'true');
  expect(date).toHaveAccessibleDescription('The payment date cannot be after today, 06/11/2026.');

  fireEvent.change(date, { target: { value: '30/09/2026' } });
  fireEvent.click(record);
  expect(date).toHaveAccessibleDescription('The payment date cannot be before the bill date, 01/10/2026.');
  expect(post.mock.calls).toEqual([]);

  fireEvent.change(date, { target: { value: '05/11/2026' } });
  fireEvent.click(record);
  expect(await within(dialog).findByText('referenceNo must be shorter than or equal to 80 characters. mode must be one of CASH, UPI')).toBeInTheDocument();
  expect(date).not.toHaveAttribute('aria-invalid');
  expect((post.mock.calls[0][1] as { paymentDate: string }).paymentDate).toBe('2026-11-05');
});

it('remembers the last payment mode for the next bill', async () => {
  post.mockResolvedValue(recorded('payment-2'));
  renderRegister();
  fireEvent.click(await screen.findByRole('button', { name: 'Mark bill LIN-101 paid' }));
  fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'CHEQUE' } });
  fireEvent.click(screen.getByRole('button', { name: 'Record payment ₹1,000.00' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(await screen.findByRole('button', { name: 'Mark bill MED-7 paid' }));
  expect(screen.getByLabelText('Mode')).toHaveValue('CHEQUE');
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

it('tells someone without register access so, instead of a Forbidden error', async () => {
  get.mockRejectedValue(Object.assign(new Error('Forbidden resource'), { status: 403, body: { message: 'Forbidden resource' } }));
  renderRegister();
  expect(await screen.findByText('You don’t have access to purchase bills.')).toBeInTheDocument();
  expect(screen.queryByText(/Forbidden resource/)).not.toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Scan or enter a bill' })).toBeInTheDocument();
});

describe('payments dated in the future', () => {
  const scheduled = (payment: Partial<PurchaseRegisterRow['payment']>) =>
    response({ rows: [row({ payment: { outstanding: 1000, scheduled: 400, scheduledOn: '2099-01-15', payable: 600, ...payment } })], total: 1 });

  it('keeps the Due badge, says what is scheduled, and offers Mark paid for what can be paid now', async () => {
    get.mockResolvedValue(scheduled({}));
    renderRegister();
    await screen.findByText('LIN-101');
    expect(paymentCell('LIN-101')).toHaveTextContent('Due₹400.00 scheduled 15/01/2099Mark paid');
    fireEvent.click(screen.getByRole('button', { name: 'Mark bill LIN-101 paid' }));
    const dialog = screen.getByRole('dialog', { name: 'Pay ₹600.00 to Linae Distributors' });
    await armed();
    post.mockResolvedValueOnce(recorded('payment-1'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment ₹600.00' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toMatchObject({ amount: 600, allocations: [{ purchaseInvoiceId: 'bill-a', amount: 600 }] });
  });

  it('shows a neutral Scheduled badge and no Mark paid when the payments already cover the balance', async () => {
    get.mockResolvedValue(scheduled({ outstanding: 400, scheduled: 400, payable: 0 }));
    renderRegister();
    await screen.findByText('LIN-101');
    expect(markPaidButtons()).toEqual([]);
    expect(paymentCell('LIN-101')).toHaveTextContent('Scheduled 15/01/2099Payment scheduled for 15/01/2099');
    expect(within(paymentCell('LIN-101')).getByText('Payment scheduled for 15/01/2099')).toHaveClass('sr-only');
  });

  it('drops the year for a payment scheduled in this financial year and says an overdue bill was due earlier', async () => {
    get.mockResolvedValue(
      scheduled({ state: 'OVERDUE', outstanding: 400, scheduled: 400, scheduledOn: '2026-11-20', payable: 0, dueDate: '2026-10-28', overdueDays: 9 }),
    );
    renderRegister();
    await screen.findByText('LIN-101');
    expect(markPaidButtons()).toEqual([]);
    expect(paymentCell('LIN-101')).toHaveTextContent('Scheduled 20/11Payment scheduled for 20/11/2026was due 28/10');
  });
});

describe('original bill documents', () => {
  const pdf = (id: string, fileName: string) => ({ id, fileName, mimeType: 'application/pdf' });
  const withDocuments = (documents: ReturnType<typeof pdf>[]) => response({ rows: [row({ documents })], total: 1 });

  it('links one document in a new tab without opening the bill', async () => {
    get.mockResolvedValue(withDocuments([pdf('doc-1', 'lin-101.pdf')]));
    renderRegister();
    const link = await screen.findByRole('link', { name: 'Open original bill LIN-101' });
    expect(link).toHaveAttribute('href', '/api/pharmacy/purchase-invoices/documents/doc-1');
    expect(link).toHaveAttribute('target', '_blank');
    fireEvent.click(link);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('lists every document in a menu when a bill has several', async () => {
    get.mockResolvedValue(withDocuments([pdf('doc-1', 'page-1.pdf'), pdf('doc-2', 'page-2.pdf')]));
    renderRegister();
    const trigger = await screen.findByRole('button', { name: 'Open original bill LIN-101' });
    expect(trigger).toHaveTextContent('2');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => [item.textContent, item.getAttribute('href')])).toEqual([
      ['page-1.pdf', '/api/pharmacy/purchase-invoices/documents/doc-1'],
      ['page-2.pdf', '/api/pharmacy/purchase-invoices/documents/doc-2'],
    ]);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('shows no attachment control when the bill has no stored original', async () => {
    renderRegister();
    await screen.findByText('MED-7');
    expect(screen.queryByRole('link', { name: /Open original bill/ })).not.toBeInTheDocument();
  });
});
