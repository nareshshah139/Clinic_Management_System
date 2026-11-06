import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PurchaseBills } from '@/components/inventory/purchase/PurchaseBills';
import { Toaster } from '@/components/ui/toaster';
import { apiClient } from '@/lib/api';
import type { PurchaseReturnRow, PurchaseReturnsResponse } from '@/components/inventory/purchase/purchase-returns-model';
import type { PurchaseRegisterResponse, PurchaseRegisterRow } from '@/components/inventory/purchase/purchase-register-model';
import type { SetOffOptions } from '@/components/inventory/purchase/set-off-model';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));

const linae = { name: 'Linae Distributors', gstin: '36ABCDE1234F1Z5' };
const ret = (overrides: Partial<PurchaseReturnRow>): PurchaseReturnRow => ({
  id: 'ret-1',
  kind: 'SUPPLIER_RETURN',
  version: 3,
  srNo: 1,
  returnRef: 'RET-1',
  creditNote: null,
  entryAt: '2026-11-02T05:00:00.000Z',
  returnDate: '2026-11-02',
  entryBy: { id: 'asha', name: 'Asha Rao' },
  distributor: linae,
  sourceBillNo: 'LIN-1',
  returnValue: 224,
  credit: null,
  state: 'AWAITED',
  reason: 'NEAR_EXPIRY',
  ...overrides,
});

const ROWS: PurchaseReturnRow[] = [
  ret({}),
  ret({
    id: 'ret-2', srNo: 2, returnRef: 'RET-2', state: 'RECEIVED', returnValue: 112,
    creditNote: { number: 'CN-80', date: '2026-11-04', amount: 100 }, credit: { id: 'credit-2', amount: 100, applied: 0, available: 100 },
  }),
  ret({
    id: 'ret-3', srNo: 3, returnRef: 'RET-3', state: 'ADJUSTED', returnValue: 200, reason: 'BREAKAGE',
    creditNote: { number: 'CN-77', date: '2026-11-05', amount: 200 }, credit: { id: 'credit-3', amount: 200, applied: 120, available: 80 },
  }),
  ret({
    id: 'ret-4', srNo: 4, returnRef: 'RET-4', state: 'USED', returnValue: 56,
    creditNote: { number: 'CN-60', date: '2026-10-30', amount: 56 }, credit: { id: 'credit-4', amount: 56, applied: 56, available: 0 },
  }),
  ret({ id: 'ret-5', srNo: 5, returnRef: 'RET-5', state: 'DRAFT', returnValue: 30, sourceBillNo: null, reason: null }),
  ret({ id: 'cn-6', srNo: 6, kind: 'CREDIT_NOTE', returnRef: 'Rate difference', state: 'CANCELLED', returnValue: 40, sourceBillNo: null, reason: null }),
  ret({ id: 'ret-7', srNo: 7, returnRef: 'RET-7', returnValue: 150, reason: 'EXPIRY' }),
];

const returnsResponse = (overrides: Partial<PurchaseReturnsResponse> = {}): PurchaseReturnsResponse => ({
  rows: ROWS,
  total: 7,
  page: 1,
  limit: 50,
  totals: { held: 180, awaited: { amount: 374, count: 2 }, count: 5, excluded: { drafts: 1, cancelled: 1 } },
  entryByOptions: [{ id: 'asha', name: 'Asha Rao' }],
  distributorOptions: [linae],
  ...overrides,
});

const bill = (overrides: Partial<PurchaseRegisterRow> = {}): PurchaseRegisterRow => ({
  id: 'bill-2', srNo: 1, billNo: 'LIN-2', entryAt: '2026-10-05T05:00:00.000Z', billDate: '2026-10-05', entryBy: null, source: 'MANUAL',
  distributor: linae, amount: 1000, invoiceState: 'POSTED', documents: [],
  payment: { state: 'DUE', paid: 0, credit: 0, outstanding: 1000, scheduled: 0, scheduledOn: null, payable: 1000, partlyPaid: false, dueDate: '2026-11-20', overdueDays: 0 },
  ...overrides,
});

const purchasesResponse = (overrides: Partial<PurchaseRegisterResponse> = {}): PurchaseRegisterResponse => ({
  rows: [bill()],
  total: 1,
  page: 1,
  limit: 50,
  totals: { amount: 1000, outstanding: 1000, count: 1, excluded: { notPosted: 0, cancelled: 0 } },
  entryByOptions: [],
  distributorOptions: [linae],
  creditHeld: { [linae.gstin]: 180 },
  distributorPosition: null,
  ...overrides,
});

const setOffOptions: SetOffOptions = {
  distributor: { gstin: linae.gstin, name: linae.name },
  available: 100,
  credits: [{ id: 'credit-2', number: 'CN-80', date: '2026-11-04', reference: 'RET-2', available: 100 }],
  bills: [
    { id: 'bill-2', billNo: 'LIN-2', billDate: '2026-10-05', dueDate: '2026-10-20', payable: 60 },
    { id: 'bill-3', billNo: 'LIN-3', billDate: '2026-10-02', dueDate: '2026-11-01', payable: 800 },
    { id: 'bill-4', billNo: 'LIN-4', billDate: '2026-10-10', dueDate: null, payable: 600 },
  ],
};

const get = jest.mocked(apiClient.get);
const post = jest.mocked(apiClient.post);
const returnsCalls = () => get.mock.calls.filter(([url]) => url === '/pharmacy/purchase-returns-register');
const onOpenReturn = jest.fn();
const onNewReturn = jest.fn();
const onTabChange = jest.fn();
const armed = () => act(() => new Promise((resolve) => setTimeout(resolve, 320)));

function renderBills(query = 'tab=returns', { canSettle = true } = {}) {
  return render(
    <>
      <PurchaseBills
        searchParams={new URLSearchParams(query)}
        onParamsChange={jest.fn()}
        onTabChange={onTabChange}
        canSettle={canSettle}
        onOpen={jest.fn()}
        onNew={jest.fn()}
        onOpenReturn={onOpenReturn}
        onNewReturn={onNewReturn}
        onLedger={jest.fn()}
        onSuppliers={jest.fn()}
      />
      <Toaster />
    </>,
  );
}

const table = () => screen.getByRole('table', { name: 'Purchase returns' });
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const rowOf = (ref: string) => within(table()).getByRole('button', { name: new RegExp(`Open (Return|Credit) ${escape(ref)}$`) }).closest('tr')!;
const statusCell = (ref: string) => rowOf(ref).cells[7];
const amountCell = (ref: string) => rowOf(ref).cells[6];

beforeAll(() => {
  jest.useFakeTimers({ now: new Date('2026-11-06T06:00:00.000Z'), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'nextTick', 'queueMicrotask'] });
});
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  jest.clearAllMocks();
  get.mockReset();
  post.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url === '/pharmacy/purchase-returns-register') return returnsResponse();
    if (url === '/inventory/workspace/credits/set-off') return setOffOptions;
    return purchasesResponse();
  });
});

it('lists returns for this financial year with the credit note columns, states and what the totals leave out', async () => {
  renderBills();
  await screen.findByText('RET-7', { exact: false });
  expect(returnsCalls()[0]).toEqual([
    '/pharmacy/purchase-returns-register',
    {
      from: '2026-04-01', to: '2027-03-31', state: undefined, distributorGstin: undefined, kind: undefined, reason: undefined,
      entryById: undefined, sortBy: 'entryAt', sortDir: 'desc', page: 1, limit: 50,
    },
  ]);
  expect(within(table()).getAllByRole('columnheader').map((head) => head.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
    'Sr No', 'Credit Note No.', 'Entry Date', 'Credit Note Date', 'Entry By', 'Distributor', 'Amount', 'Status',
  ]);
  expect(screen.getByRole('tab', { name: 'Returns', selected: true })).toBeInTheDocument();
  expect(['RET-1', 'RET-2', 'RET-3', 'RET-4', 'RET-5', 'Rate difference'].map((ref) => statusCell(ref).textContent)).toEqual([
    'Credit note awaitedRecord CN',
    'Received₹100.00 availableSet off',
    'Adjusted₹80.00 leftSet off',
    'Fully used',
    'Draft',
    'Cancelled',
  ]);
  expect(rowOf('RET-1').cells[1]).toHaveTextContent('—No credit note yetOpen Return RET-1');
  expect(rowOf('RET-2').cells[1]).toHaveTextContent('CN-80Open Return RET-2');
  expect(rowOf('RET-2').cells[3]).toHaveTextContent('04 Nov');
  expect(rowOf('RET-3').cells[5]).toHaveTextContent('Linae DistributorsBill LIN-1 · Breakage');
  expect(amountCell('RET-1')).toHaveTextContent('₹224.00return value');
  expect(amountCell('RET-2')).toHaveTextContent('₹100.00Return ₹112.00');
  expect(amountCell('RET-3')).toHaveTextContent(/^₹200\.00$/);
  expect(screen.getByText(/^Credit held/).textContent).toBe('Credit held ₹180.00 · Awaited ₹374.00 (2 returns) · 5 returns');
  expect(screen.getByText('1 draft and 1 cancelled not included. Awaited is our return value until the credit note arrives')).toBeInTheDocument();
});

it('opens the return document and starts a new return from the Returns tab', async () => {
  renderBills();
  fireEvent.click(await screen.findByRole('button', { name: /Open Return RET-2/ }));
  fireEvent.click(rowOf('Rate difference').cells[4]);
  fireEvent.click(screen.getByRole('button', { name: 'New return' }));
  expect(onOpenReturn.mock.calls).toEqual([['SUPPLIER_RETURN', 'ret-2'], ['CREDIT_NOTE', 'cn-6']]);
  expect(onNewReturn).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'New purchase' })).not.toBeInTheDocument();
});

it('switches tabs through the tab change handler with only the tab in the URL', async () => {
  renderBills('');
  await screen.findByText('LIN-2');
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Returns' }));
  expect(onTabChange.mock.calls.map(([params]) => params.toString())).toEqual(['tab=returns']);
});

it('records a credit note with today and the return value as defaults, warns when the amount differs, and moves on to the next awaited return', async () => {
  let reloads = 0;
  get.mockImplementation(async (url: string) => {
    if (url !== '/pharmacy/purchase-returns-register') return purchasesResponse();
    reloads += 1;
    return reloads === 1
      ? returnsResponse()
      : returnsResponse({ rows: ROWS.map((row) => (row.id === 'ret-1' ? { ...row, state: 'RECEIVED', creditNote: { number: 'CN-91', date: '2026-11-05', amount: 210 }, credit: { id: 'credit-1', amount: 210, applied: 0, available: 210 } } : row)) });
  });
  post.mockResolvedValue({ credit: { id: 'credit-1', number: 'CN-91', date: '2026-11-05', amount: 210, applied: 0, available: 210 } });
  renderBills();
  fireEvent.click(await screen.findByRole('button', { name: 'Record credit note for return RET-1' }));
  const dialog = screen.getByRole('dialog', { name: 'Record credit note from Linae Distributors' });
  expect(dialog).toHaveAccessibleDescription('For return RET-1 against bill LIN-1 · return value ₹224.00');
  const number = within(dialog).getByLabelText('Credit note no.');
  expect(number).toHaveFocus();
  expect(within(dialog).getByLabelText('Credit note date')).toHaveValue('06/11/2026');
  const amount = within(dialog).getByLabelText('Amount (₹)');
  expect(amount).toHaveValue('224');
  expect(within(dialog).queryByText(/than the return value/)).not.toBeInTheDocument();

  fireEvent.change(amount, { target: { value: '210' } });
  expect(within(dialog).getByText('Less than the return value ₹224.00 by ₹14.00. Enter the amount printed on the distributor’s credit note.')).toBeInTheDocument();
  fireEvent.change(number, { target: { value: ' cn-91 ' } });
  fireEvent.change(within(dialog).getByLabelText('Credit note date'), { target: { value: '05/11/2026' } });
  await armed();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record credit note' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const [[url, body, options]] = post.mock.calls as [string, Record<string, unknown>, { idempotencyKey: string }][];
  expect(url).toBe('/inventory/workspace/documents/ret-1/credit-note');
  expect(body).toEqual({ requestKey: options.idempotencyKey, version: 3, number: 'CN-91', date: '2026-11-05', amount: 210 });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Record credit note for return RET-7' })).toHaveFocus());
  expect(statusCell('RET-1')).toHaveTextContent('Received₹210.00 available');
});

it('keeps the dialog open on a duplicate credit note number and marks the number field', async () => {
  post.mockRejectedValue(Object.assign(new Error('dup'), { status: 409, body: { code: 'CREDIT_NOTE_DUPLICATE', message: 'Credit note CN-77 is already recorded for this distributor on return RET-3.' } }));
  renderBills();
  fireEvent.click(await screen.findByRole('button', { name: 'Record credit note for return RET-1' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Credit note no.'), { target: { value: 'CN-77' } });
  await armed();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record credit note' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Credit note CN-77 is already recorded for this distributor on return RET-3.');
  expect(within(dialog).getByLabelText('Credit note no.')).toHaveAttribute('aria-invalid', 'true');
  expect(within(dialog).getByLabelText('Amount (₹)')).not.toHaveAttribute('aria-invalid');
});

it('closes and refetches when the return changed elsewhere', async () => {
  post.mockRejectedValue(Object.assign(new Error('stale'), { status: 409, body: { message: 'This return changed. Reload to see its latest status.' } }));
  renderBills();
  fireEvent.click(await screen.findByRole('button', { name: 'Record credit note for return RET-1' }));
  fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Credit note no.'), { target: { value: 'CN-1' } });
  await armed();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record credit note' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(await screen.findByText('This return changed')).toBeInTheDocument();
  expect(returnsCalls()).toHaveLength(2);
});

it('sets a credit off oldest due first, shows what is left as amounts change, and sends only the bills with an amount', async () => {
  post.mockResolvedValue({ allocations: [], bills: [{ id: 'bill-2', billNo: 'LIN-2', payableAfter: 0 }, { id: 'bill-3', billNo: 'LIN-3', payableAfter: 770 }], credits: [] });
  renderBills();
  fireEvent.click(await screen.findByRole('button', { name: 'Set off credit note CN-80 against bills' }));
  const dialog = screen.getByRole('dialog', { name: 'Set off credit from Linae Distributors' });
  const first = await within(dialog).findByLabelText('Set off against bill LIN-2, up to ₹60.00');
  expect(get.mock.calls.find(([url]) => url === '/inventory/workspace/credits/set-off')![1]).toEqual({ creditId: 'credit-2' });
  expect(dialog).toHaveAccessibleDescription('₹100.00 available on credit note CN-80. Bills due first are filled first.');
  expect(first).toHaveFocus();
  expect(['LIN-2', 'LIN-3', 'LIN-4'].map((no) => (within(dialog).getByLabelText(new RegExp(`bill ${no},`)) as HTMLInputElement).value)).toEqual(['60', '40', '']);
  expect(within(dialog).getByRole('status')).toHaveTextContent('₹0.00 credit left after this');

  fireEvent.change(within(dialog).getByLabelText(/bill LIN-3,/), { target: { value: '10' } });
  expect(within(dialog).getByRole('status')).toHaveTextContent('₹30.00 credit left after this');
  fireEvent.change(within(dialog).getByLabelText(/bill LIN-4,/), { target: { value: '50' } });
  expect(within(dialog).getByRole('status')).toHaveTextContent('₹20.00 more than the credit available');
  await armed();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Set off ₹120.00' }));
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Only ₹100.00 credit is available.');
  expect(post).not.toHaveBeenCalled();

  fireEvent.change(within(dialog).getByLabelText(/bill LIN-4,/), { target: { value: '' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Set off ₹70.00' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const [[url, body, options]] = post.mock.calls as [string, Record<string, unknown>, { idempotencyKey: string }][];
  expect([url, body]).toEqual([
    '/inventory/workspace/credits/set-off',
    { requestKey: options.idempotencyKey, creditId: 'credit-2', allocations: [{ purchaseInvoiceId: 'bill-2', amount: 60 }, { purchaseInvoiceId: 'bill-3', amount: 10 }] },
  ]);
  expect(await screen.findByText('Set off ₹70.00 against LIN-2, LIN-3.', { selector: 'div' })).toBeInTheDocument();
});

it('hides credit note and set-off actions from someone who cannot write to the supplier ledger', async () => {
  renderBills('tab=returns', { canSettle: false });
  await screen.findByText('RET-7', { exact: false });
  expect(screen.queryByRole('button', { name: /^Record credit note/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Set off/ })).not.toBeInTheDocument();
});

it('says when no returns fall in the period and offers a new return', async () => {
  get.mockResolvedValue(returnsResponse({ rows: [], total: 0, totals: { held: 0, awaited: { amount: 0, count: 0 }, count: 0, excluded: { drafts: 0, cancelled: 0 } } }));
  renderBills();
  expect(await screen.findByText('No purchase returns in this period')).toBeInTheDocument();
  fireEvent.click(within(table()).getByRole('button', { name: /New return/ }));
  expect(onNewReturn).toHaveBeenCalledTimes(1);
});

it('explains missing access instead of a broken table', async () => {
  get.mockRejectedValue(Object.assign(new Error('Forbidden resource'), { status: 403 }));
  renderBills();
  expect(await screen.findByText('You don’t have access to purchase returns.')).toBeInTheDocument();
  expect(screen.queryByRole('table', { name: 'Purchase returns' })).not.toBeInTheDocument();
});

it('shows the distributor position on the Purchase tab: due less credit held is net payable, or in your favour', async () => {
  get.mockImplementation(async (url: string) =>
    url === '/inventory/workspace/credits/set-off'
      ? setOffOptions
      : purchasesResponse({ distributorPosition: { gstin: linae.gstin, name: linae.name, outstanding: 4400, creditHeld: 180, net: 4220 } }),
  );
  const { unmount } = renderBills(`gstin=${linae.gstin}`);
  const strip = await screen.findByRole('region', { name: 'Linae Distributors position' });
  expect(strip).toHaveTextContent('Linae Distributors· all posted bills:Due ₹4,400.00−minusCredit held ₹180.00=equalsNet payable ₹4,220.00');
  fireEvent.click(within(strip).getByRole('button', { name: 'Set off credit' }));
  await screen.findByLabelText(/bill LIN-2,/);
  expect(get.mock.calls.find(([url]) => url === '/inventory/workspace/credits/set-off')![1]).toEqual({ distributorGstin: linae.gstin });
  unmount();

  get.mockResolvedValue(purchasesResponse({ distributorPosition: { gstin: linae.gstin, name: linae.name, outstanding: 0, creditHeld: 180, net: -180 } }));
  renderBills(`gstin=${linae.gstin}`);
  const favour = await screen.findByRole('region', { name: 'Linae Distributors position' });
  expect(favour).toHaveTextContent('₹180.00 in your favour');
  expect(within(favour).queryByRole('button')).not.toBeInTheDocument();
});

it('offers held credit from Mark paid and opens the set-off for that bill only', async () => {
  renderBills('');
  fireEvent.click(await screen.findByRole('button', { name: 'Mark bill LIN-2 paid' }));
  const pay = screen.getByRole('dialog', { name: 'Pay ₹1,000.00 to Linae Distributors' });
  expect(pay).toHaveTextContent('₹180.00 credit from Linae Distributors is available.');
  fireEvent.click(within(pay).getByRole('button', { name: 'Set off credit instead' }));
  const dialog = await screen.findByRole('dialog', { name: 'Set off credit from Linae Distributors' });
  await within(dialog).findByLabelText(/bill LIN-2,/);
  expect(['LIN-2', 'LIN-3', 'LIN-4'].map((no) => (within(dialog).getByLabelText(new RegExp(`bill ${no},`)) as HTMLInputElement).value)).toEqual(['60', '', '']);
});
