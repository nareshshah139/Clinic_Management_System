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
  awaitedSince: null,
  ...overrides,
});

const ROWS: PurchaseReturnRow[] = [
  ret({ awaitedSince: '2026-10-14' }),
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
  onlyDistributor: linae.gstin,
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
const rowOf = (ref: string) => within(table()).getByRole('button', { name: new RegExp(`^Open (draft )?(return|credit) ${escape(ref)}$`, 'i') }).closest('tr')!;
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
    'Credit note awaited · 23d, for 23 days since the challan',
    'Received₹100.00 leftSet off',
    'Adjusted₹80.00 leftSet off',
    'Fully used',
    'Draft',
    'Cancelled',
  ]);
  expect(within(statusCell('Rate difference')).getByText('Cancelled')).not.toHaveClass('line-through');
  expect(within(amountCell('Rate difference')).getByText('₹40.00')).toHaveClass('line-through');
  expect(rowOf('RET-1').cells[1]).toHaveTextContent(/^Record credit noteOpen Return RET-1· against bill LIN-1$/);
  expect(rowOf('RET-5').cells[1]).toHaveTextContent(/^Open draft return RET-5RET-5$/);
  expect(rowOf('RET-2').cells[1]).toHaveTextContent(/^CN-80Open Return RET-2· against bill LIN-1$/);
  expect(rowOf('RET-2').cells[3]).toHaveTextContent('04 Nov');
  expect(rowOf('RET-3').cells[5]).toHaveTextContent(/^Linae DistributorsBreakage$/);
  expect(within(rowOf('RET-3').cells[5]).getByText('Linae Distributors')).toHaveAttribute('title', 'Linae Distributors · GSTIN 36ABCDE1234F1Z5');
  expect(within(rowOf('RET-3').cells[1]).getByText('LIN-1')).not.toHaveClass('truncate');
  expect(amountCell('RET-1')).toHaveTextContent('₹224.00return value');
  expect(amountCell('RET-2')).toHaveTextContent('₹100.00Return ₹112.00');
  expect(amountCell('RET-3')).toHaveTextContent(/^₹200\.00$/);
  expect(screen.getByText(/^Credit held/).textContent).toBe('Credit held (all dates) ₹180.00 · Awaited ₹374.00 (2 returns)');
  expect(screen.getByText(/^Held/).textContent).toBe('Held ₹180.00 · Awaited ₹374.00');
  expect(screen.getByText('1 draft and 1 cancelled not included. Credit held and Awaited cover all dates; Awaited counts our return value until the note arrives.')).toHaveClass('sr-only');
  expect(screen.getByRole('button', { name: 'About these totals' })).toBeInTheDocument();
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

it('switches tabs keeping the distributor and period, and nothing else', async () => {
  renderBills(`gstin=${linae.gstin}&from=2026-10-01&to=2026-10-31&pay=DUE`);
  await screen.findByText('LIN-2');
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Returns' }));
  expect(onTabChange.mock.calls.map(([params]) => params.toString())).toEqual([`gstin=${linae.gstin}&from=2026-10-01&to=2026-10-31&tab=returns`]);
});

it('exports the credit note register with the filters on screen', async () => {
  const open = jest.spyOn(window, 'open').mockReturnValue(null);
  renderBills(`tab=returns&state=AWAITED&gstin=${linae.gstin}`);
  await screen.findByText('RET-7', { exact: false });
  fireEvent.keyDown(screen.getByRole('button', { name: 'More' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Export to Excel' }));
  expect(open).toHaveBeenCalledWith(
    `/api/pharmacy/purchase-returns-register?format=xlsx&from=2026-04-01&to=2027-03-31&state=AWAITED&distributorGstin=${linae.gstin}&sortBy=entryAt&sortDir=desc&page=1&limit=50`,
    '_blank',
  );
  open.mockRestore();
});

it('records a credit note typed from the note, with the return value one tap away, says when the amount is less, then focuses Set off and offers it in the toast', async () => {
  let reloads = 0;
  get.mockImplementation(async (url: string) => {
    if (url === '/inventory/workspace/credits/set-off') return setOffOptions;
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
  expect(dialog).toHaveAccessibleDescription('For return RET-1 against bill LIN-1');
  const number = within(dialog).getByLabelText('Credit note no.');
  expect(number).toHaveFocus();
  const amount = within(dialog).getByLabelText('Amount (₹)');
  expect([(within(dialog).getByLabelText('Credit note date') as HTMLInputElement).value, (amount as HTMLInputElement).value]).toEqual(['', '']);
  expect(amount).toHaveAccessibleDescription('Return value ₹224.00 Same as return value');
  await armed();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record credit note' }));
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter the credit note number from the distributor’s note.');
  fireEvent.change(number, { target: { value: 'CN-91' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record credit note' }));
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter the date printed on the credit note, as dd/mm/yyyy.');
  expect(within(dialog).getByLabelText('Credit note date')).toHaveFocus();
  fireEvent.change(within(dialog).getByLabelText('Credit note date'), { target: { value: '05/11/2026' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record credit note' }));
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter the amount printed on the credit note.');
  expect(amount).toHaveFocus();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Same as return value' }));
  expect([(amount as HTMLInputElement).value, document.activeElement]).toEqual(['224', amount]);
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();

  fireEvent.change(amount, { target: { value: '210' } });
  expect(within(dialog).getByText('₹14.00 less than your return value. Fine if the distributor’s note says so.')).toBeInTheDocument();
  fireEvent.change(number, { target: { value: ' cn-91 ' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record credit note' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const [[url, body, options]] = post.mock.calls as [string, Record<string, unknown>, { idempotencyKey: string }][];
  expect(url).toBe('/inventory/workspace/documents/ret-1/credit-note');
  expect(body).toEqual({ requestKey: options.idempotencyKey, version: 3, number: 'CN-91', date: '2026-11-05', amount: 210 });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Set off credit note CN-91 against bills' })).toHaveFocus());
  expect(statusCell('RET-1')).toHaveTextContent('Received₹210.00 leftSet off');
  fireEvent.click(await screen.findByRole('button', { name: 'Set off ₹210.00 now' }));
  expect(await screen.findByRole('dialog', { name: 'Set off credit from Linae Distributors' })).toBeInTheDocument();
  expect(get.mock.calls.filter(([url]) => url === '/inventory/workspace/credits/set-off').map(([, params]) => params)).toEqual([{ creditId: 'credit-1' }]);
});

it('asks once more before recording a credit note for more than the return value, and refuses one dated before the return', async () => {
  post.mockResolvedValue({ credit: { id: 'credit-1', number: 'CN-92', date: '2026-11-05', amount: 240, applied: 0, available: 240 } });
  renderBills();
  fireEvent.click(await screen.findByRole('button', { name: 'Record credit note for return RET-1' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Credit note no.'), { target: { value: 'CN-92' } });
  fireEvent.change(within(dialog).getByLabelText('Credit note date'), { target: { value: '01/11/2026' } });
  fireEvent.change(within(dialog).getByLabelText('Amount (₹)'), { target: { value: '224' } });
  await armed();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record credit note' }));
  expect(within(dialog).getByRole('alert')).toHaveTextContent('The credit note date cannot be before the return date, 02/11/2026.');
  expect(within(dialog).getByLabelText('Credit note date')).toHaveFocus();

  fireEvent.change(within(dialog).getByLabelText('Credit note date'), { target: { value: '05/11/2026' } });
  fireEvent.change(within(dialog).getByLabelText('Amount (₹)'), { target: { value: '240' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record credit note' }));
  expect(within(dialog).getByRole('alert')).toHaveTextContent('₹16.00 more than your return value of ₹224.00. Check the amount on the distributor’s note.');
  expect(post).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record ₹240.00 anyway' }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  expect((post.mock.calls[0][1] as Record<string, unknown>).amount).toBe(240);
});

it('corrects a recorded credit note with a reason, and keeps the amount once part of it is set off', async () => {
  post.mockResolvedValue({ credit: { id: 'credit-2', number: 'CN-81', date: '2026-11-04', amount: 100, applied: 0, available: 100 } });
  renderBills();
  fireEvent.click(await screen.findByRole('button', { name: 'Correct credit note CN-80' }));
  const dialog = screen.getByRole('dialog', { name: 'Correct credit note CN-80' });
  expect([
    (within(dialog).getByLabelText('Credit note no.') as HTMLInputElement).value,
    (within(dialog).getByLabelText('Credit note date') as HTMLInputElement).value,
    (within(dialog).getByLabelText('Amount (₹)') as HTMLInputElement).value,
  ]).toEqual(['CN-80', '04/11/2026', '100']);
  fireEvent.change(within(dialog).getByLabelText('Credit note no.'), { target: { value: 'CN-81' } });
  await armed();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save correction' }));
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Say why the credit note is being corrected, for the record.');
  expect(within(dialog).getByLabelText('Why correct it?')).toHaveFocus();
  fireEvent.change(within(dialog).getByLabelText('Why correct it?'), { target: { value: 'Misread the note' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save correction' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const [[url, body, options]] = post.mock.calls as [string, Record<string, unknown>, { idempotencyKey: string }][];
  expect([url, body]).toEqual([
    '/inventory/workspace/documents/ret-2/credit-note',
    { requestKey: options.idempotencyKey, version: 3, number: 'CN-81', date: '2026-11-04', amount: 100, correct: true, reason: 'Misread the note' },
  ]);

  fireEvent.click(screen.getByRole('button', { name: 'Correct credit note CN-77' }));
  const locked = screen.getByRole('dialog', { name: 'Correct credit note CN-77' });
  expect(within(locked).getByLabelText('Amount (₹)')).toHaveAttribute('readonly');
  expect(locked).toHaveTextContent('₹120.00 of this credit is already set off against bills, so its amount stays ₹200.00.');
});

it('keeps the dialog open on a duplicate credit note number and marks the number field', async () => {
  post.mockRejectedValue(Object.assign(new Error('dup'), { status: 409, body: { code: 'CREDIT_NOTE_DUPLICATE', message: 'Credit note CN-77 is already recorded for this distributor on return RET-3.' } }));
  renderBills();
  fireEvent.click(await screen.findByRole('button', { name: 'Record credit note for return RET-1' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Credit note no.'), { target: { value: 'CN-77' } });
  fireEvent.change(within(dialog).getByLabelText('Credit note date'), { target: { value: '05/11/2026' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Same as return value' }));
  await armed();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record credit note' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Credit note CN-77 is already recorded for this distributor on return RET-3.');
  expect(within(dialog).getByLabelText('Credit note no.')).toHaveAttribute('aria-invalid', 'true');
  expect(within(dialog).getByLabelText('Credit note no.')).toHaveFocus();
  expect(within(dialog).getByLabelText('Amount (₹)')).not.toHaveAttribute('aria-invalid');
});

it('closes and refetches when the return changed elsewhere, keeping what was typed in the message', async () => {
  post.mockRejectedValue(Object.assign(new Error('stale'), { status: 409, body: { message: 'This return changed. Reload to see its latest status.' } }));
  renderBills();
  fireEvent.click(await screen.findByRole('button', { name: 'Record credit note for return RET-1' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Credit note no.'), { target: { value: 'cn-1' } });
  fireEvent.change(within(dialog).getByLabelText('Credit note date'), { target: { value: '05/11/2026' } });
  fireEvent.change(within(dialog).getByLabelText('Amount (₹)'), { target: { value: '220' } });
  await armed();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record credit note' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(await screen.findByText('This return changed')).toBeInTheDocument();
  expect(
    screen.getByText('The list now shows its latest status. Your entry was not saved: credit note CN-1, 05/11/2026, ₹220.00.'),
  ).toBeInTheDocument();
  expect(returnsCalls()).toHaveLength(2);
});

it('sets a credit off oldest due first, shows what is left as amounts change, and sends only the bills with an amount', async () => {
  post.mockResolvedValue({ setOffId: 'so-1', allocations: [], bills: [{ id: 'bill-2', billNo: 'LIN-2', payableAfter: 0 }, { id: 'bill-3', billNo: 'LIN-3', payableAfter: 770 }], credits: [] });
  renderBills();
  fireEvent.click(await screen.findByRole('button', { name: 'Set off credit note CN-80 against bills' }));
  const dialog = screen.getByRole('dialog', { name: 'Set off credit from Linae Distributors' });
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  const first = await within(dialog).findByLabelText('Set off against bill LIN-2, up to ₹60.00');
  expect(get.mock.calls.find(([url]) => url === '/inventory/workspace/credits/set-off')![1]).toEqual({ creditId: 'credit-2' });
  expect(dialog).toHaveAccessibleDescription('₹100.00 available from credit note CN-80. Filled from the oldest due date.');
  expect(first).toHaveFocus();
  expect(within(dialog).getAllByRole('columnheader').map((head) => head.textContent)).toEqual(['Bill', 'Due date', 'To pay', 'Set off ₹']);
  expect(within(dialog).getAllByRole('rowheader').map((head) => head.textContent)).toEqual([
    'LIN-2Due 20 Oct, overdue', 'LIN-3Due 01 Nov, overdue', 'LIN-4Due —',
  ]);
  expect(within(within(dialog).getAllByRole('row')[1]).getAllByText('20 Oct')[0].closest('span')).toHaveClass('text-destructive-text');
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
  expect(await screen.findByText('Set off ₹70.00 against bills LIN-2, LIN-3.', { selector: 'div' })).toBeInTheDocument();
  expect(screen.getByText('Undo is in the Status column for 30 seconds.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();

  post.mockResolvedValue({ id: 'so-1', reversed: ['a-1', 'a-2'] });
  fireEvent.click(await screen.findByRole('button', { name: 'Undo set-off of credit note CN-80' }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(post.mock.calls[1].slice(0, 2)).toEqual(['/inventory/workspace/credits/set-off/so-1/reverse', { reason: 'Undone from purchase list' }]);
  expect(await screen.findByText('Set-off undone', { selector: 'div' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Undo set-off of credit note CN-80' })).not.toBeInTheDocument();
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

it('shows the distributor position on the Purchase tab across all bills, on its own request: due less credit held is net payable, or in your favour', async () => {
  let position = { gstin: linae.gstin, name: linae.name, outstanding: 4400, creditHeld: 180, net: 4220 };
  get.mockImplementation(async (url: string) =>
    url === '/inventory/workspace/credits/set-off' ? setOffOptions : url === '/pharmacy/purchase-register/position' ? position : purchasesResponse(),
  );
  const { unmount } = renderBills(`gstin=${linae.gstin}`);
  const strip = await screen.findByRole('region', { name: 'Linae Distributors position across all bills' });
  expect(strip).toHaveTextContent('Linae Distributors · across all bills, not just this periodDue₹4,400.00− Credit held₹180.00= Net payable₹4,220.00');
  expect(get.mock.calls.filter(([url]) => url === '/pharmacy/purchase-register/position')).toEqual([
    ['/pharmacy/purchase-register/position', { distributorGstin: linae.gstin }],
  ]);
  fireEvent.click(within(strip).getByRole('button', { name: 'Set off all ₹180.00' }));
  await screen.findByLabelText(/bill LIN-2,/);
  expect(get.mock.calls.find(([url]) => url === '/inventory/workspace/credits/set-off')![1]).toEqual({ distributorGstin: linae.gstin });
  unmount();

  position = { gstin: linae.gstin, name: linae.name, outstanding: 0, creditHeld: 180, net: -180 };
  renderBills('');
  const favour = await screen.findByRole('region', { name: 'Linae Distributors position across all bills' });
  expect(favour).toHaveTextContent('In your favour₹180.00');
  expect(within(favour).queryByRole('button')).not.toBeInTheDocument();
});

it('offers held credit from Mark paid and opens the set-off for that bill only, with its row marked and focused', async () => {
  renderBills('');
  fireEvent.click(await screen.findByRole('button', { name: 'Mark bill LIN-2 paid' }));
  const pay = screen.getByRole('dialog', { name: 'Settle bill LIN-2 · ₹1,000.00' });
  expect(pay).toHaveAccessibleDescription('Linae Distributors');
  expect(pay).toHaveTextContent('₹180.00 credit from Linae Distributors is available.');
  expect(within(pay).getByLabelText('Mode')).toHaveFocus();
  fireEvent.click(within(pay).getByRole('button', { name: 'Set off ₹180.00 instead' }));
  const dialog = await screen.findByRole('dialog', { name: 'Set off credit from Linae Distributors' });
  const input = await within(dialog).findByLabelText(/bill LIN-2,/);
  expect(['LIN-2', 'LIN-3', 'LIN-4'].map((no) => (within(dialog).getByLabelText(new RegExp(`bill ${no},`)) as HTMLInputElement).value)).toEqual(['60', '', '']);
  expect(input).toHaveFocus();
  expect(dialog).toHaveAccessibleDescription('₹100.00 available from credit note CN-80. Filled against the bill you were paying.');
  expect(input.closest('tr')!.querySelector('th')).toHaveTextContent('LIN-2Bill you were payingDue 20 Oct, overdue');
});

it('sets the credit off from Mark paid in one step when the credit held covers the bill, then offers Undo on the bill and in the toast', async () => {
  let settled = false;
  get.mockImplementation(async (url: string) => {
    if (url === '/pharmacy/purchase-register/position') return { gstin: linae.gstin, name: linae.name, outstanding: settled ? 0 : 1000, creditHeld: settled ? 200 : 1200, net: settled ? -200 : -200 };
    return purchasesResponse({
      creditHeld: { [linae.gstin]: settled ? 200 : 1200 },
      rows: [settled ? bill({ payment: { ...bill().payment, state: 'PAID', credit: 1000, outstanding: 0, payable: 0 } }) : bill()],
    });
  });
  post.mockImplementation(async () => {
    settled = true;
    return { setOffId: 'so-9', allocations: [], bills: [{ id: 'bill-2', billNo: 'LIN-2', payableAfter: 0 }], credits: [] };
  });
  renderBills('');
  fireEvent.click(await screen.findByRole('button', { name: 'Mark bill LIN-2 paid' }));
  const pay = screen.getByRole('dialog', { name: 'Settle bill LIN-2 · ₹1,000.00' });
  expect(pay).toHaveTextContent('₹1,200.00 credit from Linae Distributors covers this bill. Set it off, or record a payment below.');
  const setOff = within(pay).getByRole('button', { name: 'Set off ₹1,000.00 credit' });
  expect(setOff).toHaveFocus();
  await armed();
  fireEvent.click(setOff);

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const [[url, body, options]] = post.mock.calls as [string, Record<string, unknown>, { idempotencyKey: string }][];
  expect([url, body]).toEqual([
    '/inventory/workspace/credits/set-off',
    { requestKey: options.idempotencyKey, distributorGstin: linae.gstin, allocations: [{ purchaseInvoiceId: 'bill-2', amount: 1000 }] },
  ]);
  expect(get.mock.calls.filter(([url]) => url === '/inventory/workspace/credits/set-off')).toEqual([]);
  expect(await screen.findByRole('button', { name: 'Undo credit set-off for bill LIN-2' })).toBeInTheDocument();
  expect(screen.getByText('Set off ₹1,000.00 of credit against bill LIN-2.', { selector: 'div' })).toBeInTheDocument();
  expect(screen.getByText('Undo is in the Payment column for 30 seconds.')).toBeInTheDocument();

  post.mockResolvedValue({ id: 'so-9', reversed: ['a-1'] });
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(post.mock.calls[1]?.slice(0, 2)).toEqual(['/inventory/workspace/credits/set-off/so-9/reverse', { reason: 'Undone from purchase list' }]));
});

it('lists returns as cards on a phone: distributor and amount, then the credit note and return, then the status and its action', async () => {
  const matchMedia = jest.mocked(window.matchMedia);
  const desktop = matchMedia.getMockImplementation();
  matchMedia.mockImplementation((query: string) => ({ ...desktop!(query), matches: query === '(max-width: 639px)' }));
  try {
    renderBills();
    const list = await screen.findByRole('list', { name: 'Purchase returns' });
    expect(screen.queryByRole('table', { name: 'Purchase returns' })).not.toBeInTheDocument();
    const cards = within(list).getAllByRole('listitem');
    expect(cards.slice(0, 3).map((card) => [...card.firstElementChild!.children].map((line) => line.textContent))).toEqual([
      ['Linae Distributors₹224.00', 'Record credit noteOpen Return RET-1· against bill LIN-1return value', 'Credit note awaited · 23d, for 23 days since the challan'],
      ['Linae Distributors₹100.00', 'CN-80Open Return RET-2· against bill LIN-1Return ₹112.00', 'Received₹100.00 leftSet off'],
      ['Linae Distributors₹200.00', 'CN-77Open Return RET-3· against bill LIN-1', 'Adjusted₹80.00 leftSet off'],
    ]);
    expect(within(cards[1]).getByRole('button', { name: 'Correct credit note CN-80' })).toBeInTheDocument();
    fireEvent.click(within(cards[1]).getByRole('button', { name: 'Set off credit note CN-80 against bills' }));
    expect(await screen.findByRole('dialog', { name: 'Set off credit from Linae Distributors' })).toBeInTheDocument();
    expect(onOpenReturn).not.toHaveBeenCalled();
    fireEvent.click(within(cards[0]).getByText('Linae Distributors'));
    expect(onOpenReturn.mock.calls).toEqual([['SUPPLIER_RETURN', 'ret-1']]);
  } finally {
    matchMedia.mockImplementation(desktop!);
  }
});

it('shows a distributor’s position on the Returns tab and sets off all of its held credit, with Undo on each credit it used', async () => {
  const position = { gstin: linae.gstin, name: linae.name, outstanding: 1460, creditHeld: 180, net: 1280 };
  get.mockImplementation(async (url: string) => {
    if (url === '/pharmacy/purchase-returns-register') return returnsResponse();
    if (url === '/pharmacy/purchase-register/position') return position;
    if (url === '/inventory/workspace/credits/set-off')
      return { ...setOffOptions, available: 180, credits: [...setOffOptions.credits, { id: 'credit-3', number: 'CN-77', date: '2026-11-05', reference: 'RET-3', available: 80 }] };
    return purchasesResponse();
  });
  post.mockResolvedValue({
    setOffId: 'so-all',
    allocations: [
      { id: 'a-1', creditId: 'credit-2', creditNoteNumber: 'CN-80', purchaseInvoiceId: 'bill-2', amount: 60 },
      { id: 'a-2', creditId: 'credit-2', creditNoteNumber: 'CN-80', purchaseInvoiceId: 'bill-3', amount: 40 },
      { id: 'a-3', creditId: 'credit-3', creditNoteNumber: 'CN-77', purchaseInvoiceId: 'bill-3', amount: 80 },
    ],
    bills: [{ id: 'bill-2', billNo: 'LIN-2', payableAfter: 0 }, { id: 'bill-3', billNo: 'LIN-3', payableAfter: 680 }],
    credits: [],
  });
  renderBills(`tab=returns&gstin=${linae.gstin}`);
  const strip = await screen.findByRole('region', { name: 'Linae Distributors position across all bills' });
  expect(strip).toHaveTextContent('Due₹1,460.00− Credit held₹180.00= Net payable₹1,280.00');
  fireEvent.click(within(strip).getByRole('button', { name: 'Set off all ₹180.00' }));
  const dialog = await screen.findByRole('dialog', { name: 'Set off credit from Linae Distributors' });
  await within(dialog).findByLabelText(/bill LIN-2,/);
  expect(dialog).toHaveAccessibleDescription('₹180.00 available from 2 credit notes. Filled from the oldest due date.');
  expect(get.mock.calls.filter(([url]) => url === '/inventory/workspace/credits/set-off').map(([, params]) => params)).toEqual([{ distributorGstin: linae.gstin }]);
  await armed();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Set off ₹180.00' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(post.mock.calls[0][1]).toMatchObject({ distributorGstin: linae.gstin, allocations: [{ purchaseInvoiceId: 'bill-2', amount: 60 }, { purchaseInvoiceId: 'bill-3', amount: 120 }] });
  expect(await screen.findByRole('button', { name: 'Undo set-off of credit note CN-80' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Undo set-off of credit note CN-77' })).toBeInTheDocument();
  expect(get.mock.calls.filter(([url]) => url === '/pharmacy/purchase-register/position')).toHaveLength(2);

  post.mockResolvedValue({ id: 'so-all', reversed: ['a-1', 'a-2', 'a-3'] });
  fireEvent.click(screen.getByRole('button', { name: 'Undo set-off of credit note CN-77' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: /^Undo set-off of credit note/ })).not.toBeInTheDocument());
  expect(post.mock.calls.map(([url]) => url)).toEqual(['/inventory/workspace/credits/set-off', '/inventory/workspace/credits/set-off/so-all/reverse']);
});

it('says no credit notes are awaited when the Awaited filter finds none', async () => {
  get.mockResolvedValue(returnsResponse({ rows: [], total: 0 }));
  renderBills('tab=returns&state=AWAITED');
  expect(await screen.findByText('No credit notes awaited')).toBeInTheDocument();
  expect(screen.getByText('Every return dated between 01/04/2026 and 31/03/2027 has its credit note recorded.')).toBeInTheDocument();
});

it('asks for the number on a credit set off before numbers were kept, keeping its amount, and offers no set-off until it has one', async () => {
  const legacy = ret({
    id: 'old', returnRef: 'OLD-RET', state: 'ADJUSTED', returnValue: 75.5, sourceBillNo: null, reason: null, returnDate: '2026-06-01',
    credit: { id: 'legacy-credit', amount: 75.5, applied: 20, available: 55.5 },
  });
  get.mockImplementation(async (url: string) => (url === '/pharmacy/purchase-returns-register' ? returnsResponse({ rows: [legacy], total: 1 }) : purchasesResponse()));
  renderBills();
  const record = await screen.findByRole('button', { name: 'Record credit note for return OLD-RET' });
  expect(statusCell('OLD-RET')).toHaveTextContent(/^Adjusted₹55.50 left$/);
  fireEvent.click(record);
  const dialog = screen.getByRole('dialog', { name: 'Record credit note from Linae Distributors' });
  expect(within(dialog).getByLabelText('Amount (₹)')).toHaveValue('75.5');
  expect(within(dialog).getByLabelText('Amount (₹)')).toHaveAttribute('readonly');
  expect(dialog).toHaveTextContent('₹20.00 of this credit is already set off against bills, so its amount stays ₹75.50.');
  expect(within(dialog).queryByRole('button', { name: 'Same as return value' })).not.toBeInTheDocument();
});

it('closes Mark paid and refreshes the bill when its balance changed before the one-step set-off', async () => {
  get.mockImplementation(async (url: string) => {
    if (url === '/pharmacy/purchase-register/position') return { gstin: linae.gstin, name: linae.name, outstanding: 1000, creditHeld: 1200, net: -200 };
    return purchasesResponse({ creditHeld: { [linae.gstin]: 1200 } });
  });
  post.mockRejectedValue(Object.assign(new Error('changed'), { status: 409, body: { code: 'BALANCE_CHANGED', message: 'The balance of bill LIN-2 changed: ₹400.00 is left to pay.' } }));
  renderBills('');
  fireEvent.click(await screen.findByRole('button', { name: 'Mark bill LIN-2 paid' }));
  await armed();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Set off ₹1,000.00 credit' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(await screen.findByText('The balance of bill LIN-2 changed: ₹400.00 is left to pay. The list now shows the latest amounts.')).toBeInTheDocument();
});
