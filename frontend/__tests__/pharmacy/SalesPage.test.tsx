import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SalesPage from '@/app/dashboard/pharmacy/sales/page';
import { apiClient } from '@/lib/api';
import type { SalesRegisterResponse, SalesRegisterRow } from '@/components/pharmacy/sales/sales-register-model';

let mockQuery = '';
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockQuery),
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn() } }));

const row = (overrides: Partial<SalesRegisterRow>): SalesRegisterRow => ({
  id: 'PHARMACY_BILL:inv-14',
  source: 'PHARMACY_BILL',
  recordId: 'inv-14',
  billNo: 'PHI-2026-014',
  reservedNo: null,
  state: 'FINAL',
  entryAt: '2026-11-05T09:00:00.000Z',
  billDate: '2026-11-05',
  entryBy: { id: 'user-asha', name: 'Asha Rao' },
  patientName: 'Meera Shah',
  mobile: '+91 98765 43210',
  amount: 1234.5,
  paymentModes: ['UPI'],
  due: 0,
  refundDue: 0,
  refunded: 0,
  revisedAt: null,
  linkedBillNos: [],
  ...overrides,
});

const response = (overrides: Partial<SalesRegisterResponse> = {}): SalesRegisterResponse => ({
  rows: [row({})],
  total: 1,
  page: 1,
  limit: 50,
  totals: { amount: 1234.5, count: 1, collected: null, excluded: { drafts: 0, cancelled: 0 } },
  entryByOptions: [
    { id: 'user-asha', name: 'Asha Rao' },
    { id: 'user-ravi', name: 'Ravi Kumar' },
  ],
  clinic: { name: 'Skin Care Clinic', address: '12 MG Road, Pune', gstin: '27ABCDE1234F1Z5' },
  ...overrides,
});

const get = jest.mocked(apiClient.get);
const registerCalls = () => get.mock.calls.filter(([url]) => url === '/pharmacy/sales-register');
const panel = () => within(screen.getByRole('tabpanel'));
const lastRequest = () => registerCalls()[registerCalls().length - 1][1] as Record<string, unknown>;

beforeAll(() => {
  jest.useFakeTimers({ now: new Date('2026-11-06T06:00:00.000Z'), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'nextTick', 'queueMicrotask'] });
});
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  mockQuery = '';
  jest.clearAllMocks();
  document.querySelectorAll('iframe').forEach((frame) => frame.remove());
  get.mockResolvedValue(response());
});

it('asks only for the open tab: this financial year, newest entries first', async () => {
  render(<SalesPage />);
  await screen.findByText('PHI-2026-014');
  expect(registerCalls()).toEqual([
    [
      '/pharmacy/sales-register',
      {
        register: 'sales',
        from: '2026-04-01',
        to: '2027-03-31',
        paymentMode: undefined,
        state: undefined,
        source: undefined,
        entryById: undefined,
        sortBy: 'entryAt',
        sortDir: 'desc',
        page: 1,
        limit: 50,
      },
    ],
  ]);
  expect(screen.getByRole('table', { name: 'Sales' })).toBeInTheDocument();
});

it('sorts text ascending and amounts descending on the first click, and reports the direction', async () => {
  render(<SalesPage />);
  await screen.findByText('PHI-2026-014');
  const billNo = screen.getByRole('columnheader', { name: /Bill No/ });
  expect(billNo).toHaveAttribute('aria-sort', 'none');

  fireEvent.click(within(billNo).getByRole('button', { name: 'Bill No' }));
  await waitFor(() => expect(lastRequest()).toMatchObject({ sortBy: 'billNo', sortDir: 'asc' }));
  expect(billNo).toHaveAttribute('aria-sort', 'ascending');
  fireEvent.click(within(billNo).getByRole('button', { name: 'Bill No' }));
  await waitFor(() => expect(lastRequest()).toMatchObject({ sortBy: 'billNo', sortDir: 'desc' }));

  const amount = screen.getByRole('columnheader', { name: /Bill Amount/ });
  fireEvent.click(within(amount).getByRole('button', { name: 'Bill Amount' }));
  await waitFor(() => expect(lastRequest()).toMatchObject({ sortBy: 'amount', sortDir: 'desc' }));
  expect(amount).toHaveAttribute('aria-sort', 'descending');
  expect(billNo).toHaveAttribute('aria-sort', 'none');
});

it('combines search, payment and more filters, counts only applied ones, and keeps them in the URL', async () => {
  render(<SalesPage />);
  await screen.findByText('PHI-2026-014');

  fireEvent.change(panel().getByLabelText('Search by'), { target: { value: 'patient' } });
  fireEvent.change(panel().getByPlaceholderText('Patient name'), { target: { value: 'meera' } });
  fireEvent.change(panel().getByLabelText('Payment'), { target: { value: 'UPI' } });
  fireEvent.click(screen.getByRole('button', { name: 'More filters' }));
  fireEvent.change(panel().getByLabelText('State'), { target: { value: 'FINAL' } });
  fireEvent.change(panel().getByLabelText('Entry by'), { target: { value: 'user-asha' } });

  await waitFor(() =>
    expect(lastRequest()).toMatchObject({ field: 'patient', q: 'meera', paymentMode: 'UPI', state: 'FINAL', entryById: 'user-asha', page: 1 }),
  );
  const more = screen.getByRole('button', { name: 'More filters 2 active' });
  expect(mockReplace).toHaveBeenLastCalledWith('/dashboard/pharmacy/sales?field=patient&q=meera&pay=UPI&state=FINAL&by=user-asha', { scroll: false });

  fireEvent.keyDown(panel().getByLabelText('State'), { key: 'Escape' });
  expect(more).toHaveAttribute('aria-expanded', 'false');
  expect(more).toHaveFocus();
  expect(panel().queryByLabelText('State')).not.toBeInTheDocument();
});

it('reopens a draft bill in Sales, and blocks print and WhatsApp with a reason', async () => {
  get.mockResolvedValue(response({ rows: [row({ id: 'PHARMACY_BILL:d', recordId: 'd', billNo: null, reservedNo: 'PHI-2026-075', state: 'DRAFT', paymentModes: [] })] }));
  render(<SalesPage />);
  const open = await screen.findByRole('link', { name: 'Open draft bill for Meera Shah' });
  expect(open).toHaveTextContent('Draft');
  expect(open).toHaveAttribute('href', '/dashboard/pharmacy/sales/bill?draft=d');
  expect(screen.getByText('PHI-2026-075 not final')).toBeInTheDocument();

  const print = screen.getByRole('button', { name: 'Print draft bill for Meera Shah' });
  expect(print).toHaveAttribute('aria-disabled', 'true');
  expect(print).toHaveAttribute('tabindex', '-1');
  expect(print).toHaveAccessibleDescription('Finish this draft bill first');
  fireEvent.click(print);
  expect(document.querySelector('iframe')).toBeNull();
  expect(screen.getByRole('button', { name: 'Send draft bill for Meera Shah on WhatsApp' })).toHaveAccessibleDescription('Finish this draft bill first');
});

it('names a cancelled draft as one, never by its draft placeholder, and opens it in Sales', async () => {
  get.mockResolvedValue(response({ rows: [row({ id: 'PHARMACY_BILL:c', recordId: 'c', billNo: null, state: 'CANCELLED', paymentModes: [] })] }));
  render(<SalesPage />);
  const open = await screen.findByRole('link', { name: 'Open cancelled draft bill for Meera Shah' });
  expect([open.textContent, open.getAttribute('href'), screen.queryByText(/DRAFT-/)]).toEqual([
    'Cancelled draft',
    '/dashboard/pharmacy/sales/bill?bill=c',
    null,
  ]);
});

it('writes the WhatsApp message with clinic, date, modes and balance due', async () => {
  get.mockResolvedValue(response({ rows: [row({ paymentModes: ['UPI', 'CASH'], due: 200 })] }));
  render(<SalesPage />);
  const link = await screen.findByRole('link', { name: 'Send PHI-2026-014 on WhatsApp' });
  const text = 'Dear Meera Shah, thank you for visiting Skin Care Clinic. Your pharmacy bill PHI-2026-014 dated 05/11/2026 is ₹1,234.50 (UPI, Cash). Balance due ₹200.00.';
  expect(link).toHaveAttribute('href', `https://wa.me/919876543210?text=${encodeURIComponent(text)}`);
  expect(link).toHaveAttribute('target', '_blank');
  expect(screen.getByText('Due ₹200.00')).toBeInTheDocument();
});

it('keeps a disabled WhatsApp action out of the tab order but explains why', async () => {
  get.mockResolvedValue(response({ rows: [row({ billNo: 'PHI-2026-015', mobile: null })] }));
  render(<SalesPage />);
  const button = await screen.findByRole('button', { name: 'Send PHI-2026-015 on WhatsApp' });
  expect(button).toHaveAttribute('aria-disabled', 'true');
  expect(button).toHaveAttribute('tabindex', '-1');
  expect(button).toHaveAccessibleDescription('No mobile number');
  expect(screen.getByText('—', { selector: 'td' })).toBeInTheDocument();
});

it('prints a counter-sale receipt into a hidden frame with the clinic header and escaped text', async () => {
  get.mockImplementation(async (url: string) => {
    if (url === '/inventory/workspace/documents/cs-7') {
      return {
        kind: 'COUNTER_SALE',
        reference: 'CS-2026-007',
        totalAmount: 4554.64,
        payload: { date: '2026-11-05', customerName: '<b>Yusuf</b>', paymentMode: 'UPI', lines: [{ name: 'Benzac AC gel', batchNumber: 'B12', quantity: 2, unitPrice: 2277.32, total: 4554.64 }] },
      };
    }
    return response({ rows: [row({ id: 'COUNTER_SALE:cs-7', source: 'COUNTER_SALE', recordId: 'cs-7', billNo: 'CS-2026-007' })] });
  });
  render(<SalesPage />);
  expect(await screen.findByText('Counter sale')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Print CS-2026-007' }));

  await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull());
  const html = document.querySelector('iframe')!.srcdoc;
  expect(html).toContain('<div class="clinic-name">Skin Care Clinic</div><div>12 MG Road, Pune</div><div>GSTIN: 27ABCDE1234F1Z5</div>');
  expect(html).toContain('&lt;b&gt;Yusuf&lt;/b&gt;');
  expect(html).toContain('<td style="text-align:right">₹4,554.64</td>');
  expect(html).toContain('<strong>Payment mode:</strong> UPI');
});

it('names an empty period differently from an empty search, and Clear filters returns focus to the search box', async () => {
  get.mockResolvedValue(response({ rows: [], total: 0, totals: { amount: 0, count: 0, collected: null, excluded: { drafts: 0, cancelled: 0 } } }));
  render(<SalesPage />);
  await screen.findByText('No sales in this period');
  expect(screen.getByText('Nothing recorded between 01/04/2026 and 31/03/2027.')).toBeInTheDocument();

  const search = panel().getByPlaceholderText('Bill number');
  fireEvent.change(search, { target: { value: 'PHI-9' } });
  await waitFor(() => expect(lastRequest()).toMatchObject({ field: 'billNo', q: 'PHI-9' }));
  expect(screen.getByText('No sales match your search')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(lastRequest()).not.toHaveProperty('q'));
  expect(search).toHaveValue('');
  expect(search).toHaveFocus();
});

it('opens Returns from the URL with an Against bill column and links that come back to this tab', async () => {
  mockQuery = 'tab=returns';
  get.mockResolvedValue(
    response({ rows: [row({ id: 'SALES_RETURN:r', source: 'SALES_RETURN', recordId: 'r', billNo: 'SR-1', linkedBillNos: ['PHI-2026-007', 'PHI-2026-009'], paymentModes: ['CASH'] })] }),
  );
  render(<SalesPage />);
  expect(await screen.findByText('PHI-2026-009')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Returns' })).toHaveAttribute('aria-selected', 'true');
  expect(registerCalls()).toHaveLength(1);
  expect(lastRequest()).toMatchObject({ register: 'returns', from: '2026-04-01', to: '2027-03-31' });
  expect(screen.getByRole('table', { name: 'Sales returns' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Against bill' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Refund' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open SR-1' })).toHaveAttribute(
    'href',
    '/dashboard/inventory?area=sales&view=SALES_RETURN&document=r&return=%2Fdashboard%2Fpharmacy%2Fsales%3Ftab%3Dreturns',
  );

  fireEvent.click(screen.getByRole('button', { name: /New return/ }));
  expect(mockPush.mock.calls[0][0]).toMatch(
    /^\/dashboard\/inventory\?area=sales&view=SALES_RETURN&new=[0-9a-f]{32}&return=%2Fdashboard%2Fpharmacy%2Fsales%3Ftab%3Dreturns$/,
  );

  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Sales' }));
  expect(mockPush).toHaveBeenLastCalledWith('/dashboard/pharmacy/sales', { scroll: false });
});

it('starts a new sale as a bill inside Sales', async () => {
  get.mockResolvedValue(response());
  render(<SalesPage />);
  fireEvent.click(await screen.findByRole('button', { name: /New sale/ }));
  expect(mockPush).toHaveBeenCalledWith('/dashboard/pharmacy/sales/bill');
});

it('pins the total of every matching final bill and what it leaves out', async () => {
  get.mockResolvedValue(response({ total: 136, totals: { amount: 47891, count: 132, collected: null, excluded: { drafts: 3, cancelled: 1 } } }));
  render(<SalesPage />);
  expect(await screen.findByText('Total Amount ₹47,891.00 · 132 bills')).toBeInTheDocument();
  expect(screen.getByText('3 drafts and 1 cancelled not included')).toBeInTheDocument();
  expect(screen.getByText('1–50 of 136 rows')).toBeInTheDocument();
});

it('shows what was collected by the chosen payment mode', async () => {
  mockQuery = 'pay=UPI';
  get.mockResolvedValue(response({ total: 21, totals: { amount: 47891, count: 20, collected: 12000, excluded: { drafts: 0, cancelled: 0 } } }));
  render(<SalesPage />);
  expect(await screen.findByText('Collected by UPI ₹12,000.00 · 20 bills')).toBeInTheDocument();
  expect(screen.queryByText(/Total Amount/)).not.toBeInTheDocument();
});

it('pages with aria-disabled controls and clamps a page past the end', async () => {
  mockQuery = 'page=9';
  get.mockImplementation(async (_url: string, params?: Record<string, unknown>) =>
    params?.page === 9 ? response({ rows: [], total: 60, page: 9 }) : response({ total: 60, page: Number(params?.page) }),
  );
  render(<SalesPage />);
  await waitFor(() => expect(lastRequest()).toMatchObject({ page: 2 }));
  expect(await screen.findByText('51–60 of 60 rows')).toBeInTheDocument();

  const next = screen.getByRole('button', { name: 'Next page' });
  expect(next).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(next);
  expect(lastRequest()).toMatchObject({ page: 2 });

  fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
  await waitFor(() => expect(lastRequest()).toMatchObject({ page: 1 }));
});

it('replaces a stale total with a plain error and a retry when the range is rejected', async () => {
  render(<SalesPage />);
  expect(await screen.findByText('Total Amount ₹1,234.50 · 1 bill')).toBeInTheDocument();
  get.mockRejectedValueOnce(Object.assign(new Error('Choose a date range of at most 400 days'), { body: { message: ['Choose a date range of at most 400 days'] } }));

  fireEvent.click(screen.getByRole('button', { name: 'Bill Amount' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load sales. Choose a date range of at most 400 days');
  expect(screen.queryByText(/Total Amount/)).not.toBeInTheDocument();
  expect(screen.getByText('Total not available')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Total Amount ₹1,234.50 · 1 bill')).toBeInTheDocument();
});

it('commits a typed dd/mm/yyyy date on Enter and refuses a From after To without touching the other date', async () => {
  render(<SalesPage />);
  await screen.findByText('PHI-2026-014');
  fireEvent.click(screen.getByRole('button', { name: 'Change dates, 01/04/2026 to 31/03/2027' }));

  const from = panel().getByLabelText('From');
  fireEvent.change(from, { target: { value: '05/11/2026' } });
  fireEvent.keyDown(from, { key: 'Enter' });
  await waitFor(() => expect(lastRequest()).toMatchObject({ from: '2026-11-05', to: '2027-03-31' }));

  const to = panel().getByLabelText('To');
  fireEvent.change(to, { target: { value: '01/11/2026' } });
  fireEvent.blur(to);
  expect(screen.getByRole('alert')).toHaveTextContent('The From date is after the To date.');
  fireEvent.change(to, { target: { value: '01/11/0202' } });
  fireEvent.blur(to);
  expect(screen.getByRole('alert')).toHaveTextContent('Enter the To date as dd/mm/yyyy, year 2000 or later.');
  expect(lastRequest()).toMatchObject({ from: '2026-11-05', to: '2027-03-31' });
});

it('with FY 2025-26 open, typing From then To never requests a range longer than 400 days', async () => {
  mockQuery = 'from=2025-04-01&to=2026-03-31';
  render(<SalesPage />);
  await screen.findByText('PHI-2026-014');
  fireEvent.click(screen.getByRole('button', { name: 'Change dates, 01/04/2025 to 31/03/2026' }));
  const calls = registerCalls().length;

  const from = panel().getByLabelText('From');
  fireEvent.change(from, { target: { value: '01/05/2026' } });
  fireEvent.blur(from);
  expect(screen.getByRole('alert')).toHaveTextContent('The From date is after the To date.');
  expect(registerCalls()).toHaveLength(calls);

  const to = panel().getByLabelText('To');
  fireEvent.change(to, { target: { value: '31/05/2026' } });
  fireEvent.blur(to);
  await waitFor(() => expect(lastRequest()).toMatchObject({ from: '2026-05-01', to: '2026-05-31' }));
  expect(registerCalls().slice(calls).map(([, params]) => [(params as { from: string }).from, (params as { to: string }).to])).toEqual([['2026-05-01', '2026-05-31']]);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('refuses a typed range of 426 days with an inline message and no request', async () => {
  mockQuery = 'from=2025-04-01&to=2026-03-31';
  render(<SalesPage />);
  await screen.findByText('PHI-2026-014');
  fireEvent.click(screen.getByRole('button', { name: 'Change dates, 01/04/2025 to 31/03/2026' }));
  const calls = registerCalls().length;
  const to = panel().getByLabelText('To');
  fireEvent.change(to, { target: { value: '31/05/2026' } });
  fireEvent.blur(to);
  expect(screen.getByRole('alert')).toHaveTextContent('Pick at most 400 days at a time.');
  expect(registerCalls()).toHaveLength(calls);
});

it('returns tab drops CREDIT from the URL and calls a credit refund Store credit', async () => {
  mockQuery = 'tab=returns&pay=CREDIT';
  get.mockResolvedValue(
    response({ rows: [row({ id: 'SALES_RETURN:r', source: 'SALES_RETURN', recordId: 'r', billNo: 'SR-1', paymentModes: ['CREDIT'] })] }),
  );
  render(<SalesPage />);
  expect(await screen.findByText('Store credit')).toBeInTheDocument();
  expect(lastRequest().paymentMode).toBeUndefined();
  expect(panel().queryByText('Due (unpaid)')).not.toBeInTheDocument();
  expect(panel().queryByText('Credit')).not.toBeInTheDocument();
});

it('resets the filters when the sidebar link is clicked again and the URL loses its parameters', async () => {
  mockQuery = 'q=abc&pay=UPI';
  const view = render(<SalesPage />);
  await screen.findByText('PHI-2026-014');
  expect(lastRequest()).toMatchObject({ q: 'abc', paymentMode: 'UPI' });
  expect(panel().getByPlaceholderText('Bill number')).toHaveValue('abc');

  mockQuery = '';
  view.rerender(<SalesPage />);
  await waitFor(() => expect(lastRequest().paymentMode).toBeUndefined());
  expect(lastRequest()).not.toHaveProperty('q');
  expect(panel().getByPlaceholderText('Bill number')).toHaveValue('');
});

it('dims the footer total while a new page of results is loading so old totals never pair with a new label', async () => {
  render(<SalesPage />);
  const total = await screen.findByText('Total Amount ₹1,234.50 · 1 bill');
  const status = total.closest('[role="status"]')!;
  expect(status).toHaveAttribute('aria-busy', 'false');
  let finish: (value: SalesRegisterResponse) => void = () => undefined;
  get.mockReturnValueOnce(new Promise<SalesRegisterResponse>((resolve) => { finish = resolve; }));

  fireEvent.click(screen.getByRole('button', { name: 'Bill Amount' }));
  await waitFor(() => expect(status).toHaveAttribute('aria-busy', 'true'));
  expect(status).toHaveClass('opacity-50');

  finish(response({ totals: { amount: 99, count: 3, collected: null, excluded: { drafts: 0, cancelled: 0 } } }));
  expect(await screen.findByText('Total Amount ₹99.00 · 3 bills')).toBeInTheDocument();
  expect(status).toHaveAttribute('aria-busy', 'false');
});

it('opens a finished bill in Sales, marks revised bills and their refund, and offers Edit discount there', async () => {
  get.mockResolvedValue(
    response({
      rows: [
        row({ amount: 282.68, paymentModes: ['CASH'], refundDue: 45.07, revisedAt: '2026-11-05T10:00:00.000Z' }),
        row({ id: 'PHARMACY_BILL:inv-15', recordId: 'inv-15', billNo: 'PHI-2026-015', paymentModes: ['CASH'], refunded: 12.5, revisedAt: '2026-11-05T11:00:00.000Z' }),
        row({ id: 'PHARMACY_BILL:d', recordId: 'd', billNo: null, state: 'DRAFT', paymentModes: [] }),
      ],
    }),
  );
  render(<SalesPage />);
  const open = await screen.findByRole('link', { name: 'Open PHI-2026-014' });
  expect(open).toHaveAttribute('href', '/dashboard/pharmacy/sales/bill?bill=inv-14');
  const first = open.closest('tr') as HTMLElement;
  expect([
    within(first).getByText('Revised'),
    within(first).getByText('Refund due ₹45.07'),
    screen.getByText('Refunded ₹12.50'),
  ].every(Boolean)).toBe(true);
  fireEvent.click(within(first).getByRole('button', { name: 'Edit discount on PHI-2026-014' }));
  expect(mockPush).toHaveBeenLastCalledWith('/dashboard/pharmacy/sales/bill?bill=inv-14&edit=discount');
  expect(screen.getByRole('button', { name: 'Edit discount on draft bill for Meera Shah' })).toHaveAttribute('aria-disabled', 'true');
});
