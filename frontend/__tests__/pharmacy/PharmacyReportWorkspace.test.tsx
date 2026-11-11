import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PharmacyReportWorkspace } from '@/components/pharmacy/reports/PharmacyReportWorkspace';
import { apiClient } from '@/lib/api';

let mockQuery = '';
const mockRouter = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn() };
jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/pharmacy/reports',
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(mockQuery),
}));
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock('@/components/pharmacy/ComplianceCenter', () => ({ ComplianceCenter: () => <p>GST summary view</p> }));
const api = apiClient as jest.Mocked<typeof apiClient>;

const salesRegister = {
  id: 'sales-register',
  title: 'Sales Register',
  period: { startDate: '2026-10-01', endDate: '2026-10-31', timeZone: 'Asia/Kolkata' },
  headline: { label: 'Total for the period', value: 159656.74 },
  tiles: [],
  notes: ['Drafts are excluded.'],
  search: null,
  sections: [
    {
      id: 'sales-register',
      title: 'Sales Register',
      columns: [
        { key: 'billNo', label: 'Bill No.', kind: 'text', frozen: true },
        { key: 'customer', label: 'Customer', kind: 'text' },
        { key: 'total', label: 'Total', kind: 'money', help: 'Taxable + taxes.' },
      ],
      totals: { billNo: 'Total', customer: null, total: 159656.74 },
      rows: [
        { key: 'a', cells: { billNo: 'PHI-2026-536', customer: 'Meera Shah', total: 159756.74 } },
        { key: 'b', cells: { billNo: 'RET-1 (return)', customer: 'Meera Shah', total: -100 }, tone: 'warning' },
      ],
    },
  ],
};

const collection = (overrides: Record<string, unknown> = {}) => ({
  id: 'daily-collection',
  title: 'Daily Collection',
  period: { startDate: '2026-11-05', endDate: '2026-11-05', timeZone: 'Asia/Kolkata' },
  headline: { label: 'Expected in hand', value: 1640 },
  tiles: [{ label: 'Billed today', value: 1740, kind: 'money' }],
  notes: [],
  search: null,
  canRecordCount: true,
  sections: [
    { id: 'modes', title: 'Reconciliation by payment mode', columns: [], rows: [], totals: null },
    { id: 'billing', title: 'Bills raised today', columns: [{ key: 'line', label: 'Bills raised today', kind: 'text' }, { key: 'amount', label: 'Amount', kind: 'money' }], rows: [{ key: 'b', cells: { line: 'Pharmacy bills (2)', amount: 1500 } }], totals: null },
  ],
  collection: {
    day: '2026-11-05',
    modes: [
      { mode: 'CASH', label: 'Cash', onTodaysBills: 1000, onEarlierBills: 0, counterSales: 240, refunds: 100, expected: 1140, counted: null, difference: null },
      { mode: 'UPI', label: 'UPI', onTodaysBills: 500, onEarlierBills: 0, counterSales: 0, refunds: 0, expected: 500, counted: null, difference: null },
      { mode: 'CARD', label: 'Card', onTodaysBills: 0, onEarlierBills: 0, counterSales: 0, refunds: 0, expected: 0, counted: null, difference: null },
    ],
    billing: { billCount: 2, billed: 1500, counterSaleCount: 1, counterSales: 240, counterSalesOnCredit: 0, collectedOnTodaysBills: 1500, receivedBeforeToday: 0, dueAtDayEnd: 0, paidAboveBill: 0, totalBilled: 1740 },
    refunds: { count: 1, paidOut: 100, storeCredit: 0 },
    outsideBills: { count: 0, amount: 0 },
    expectedTotal: 1640,
    countedTotal: null,
    difference: null,
    status: 'NOT_COUNTED',
    count: null,
    history: [],
    ...overrides,
  },
});

const counted = (sequence: number, cash: number, by = 'Asha Rao') => {
  const count = { id: `c${sequence}`, sequence, counted: { CASH: cash, UPI: 500, CARD: 0 }, note: null, countedBy: { id: 'u', name: by }, countedAt: '2026-11-05T13:00:00.000Z' };
  const difference = cash - 1140;
  return collection({ count, history: [count], countedTotal: cash + 500, difference, status: difference === 0 ? 'BALANCED' : difference < 0 ? 'SHORT' : 'OVER' });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery = '';
});

// jsdom applies no CSS, so the phone cards and the desk table are both present; scope to the table.
const desk = () => within(screen.getByRole('table', { name: 'Pharmacy reconciliation by payment mode' }));

describe('Pharmacy Report', () => {
  it('opens on the common reports with the categories down the side', () => {
    render(<PharmacyReportWorkspace />);
    expect(screen.getByRole('heading', { level: 1, name: 'Pharmacy Report' })).toBeInTheDocument();
    const common = within(screen.getByRole('region', { name: 'Common reports' }));
    expect(common.getAllByRole('link').map((l) => l.querySelector('span')!.textContent)).toEqual([
      'Sales Register', 'Day wise Summary', 'GSTR-1', 'GSTR-3B', 'Item Wise Margin Report', 'Daily Collection',
    ]);
    const rail = within(screen.getByRole('navigation', { name: 'Pharmacy reports' }));
    expect(rail.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['GST Reports', 'Margin Reports', 'Stock Reports', 'Accounting Reports', 'Others']);
    expect(rail.getByRole('link', { name: 'Daily Collection' })).toHaveAttribute('href', '/dashboard/pharmacy/reports?report=daily-collection');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('narrows the list to the GST returns when searching "GSTR"', async () => {
    render(<PharmacyReportWorkspace />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search reports' }), 'GSTR');
    const rail = within(screen.getByRole('navigation', { name: 'Pharmacy reports' }));
    expect(rail.getAllByRole('link').map((l) => l.textContent)).toEqual(['GSTR-1', 'GSTR-3B', 'GSTR-2A', 'GSTR-2B']);
    expect(rail.getAllByRole('heading').map((h) => h.textContent)).toEqual(['GST Reports']);
  });

  it('runs a report from the address bar and shows totals under the header, the headline, and every download', async () => {
    mockQuery = 'report=sales-register&from=2026-10-01&to=2026-10-31&q=Meera';
    api.get.mockResolvedValue(salesRegister as any);
    render(<PharmacyReportWorkspace />);
    expect(api.get).toHaveBeenCalledWith('/pharmacy/reports/sales-register', { from: '2026-10-01', to: '2026-10-31', type: 'SALES', q: 'Meera' });
    const table = await screen.findByRole('table', { name: 'Sales Register' });
    expect(within(screen.getByTestId('report-totals-row')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Total', '', '1,59,656.74']);
    expect(screen.getByTestId('report-headline')).toHaveTextContent('₹1,59,656.74');
    const rows = within(table).getAllByRole('row').slice(2);
    expect(rows[1]).toHaveAttribute('data-tone', 'warning');
    expect(within(rows[1]).getAllByRole('cell')[2]).toHaveClass('text-destructive');
    expect(screen.getByRole('link', { name: 'Daily Collection' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Sales Register' })).toHaveAttribute('aria-current', 'page');

    await userEvent.click(screen.getByRole('button', { name: /Download/ }));
    const links = await screen.findAllByRole('menuitem');
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Excel (.xlsx)', '/api/pharmacy/reports/sales-register?from=2026-10-01&to=2026-10-31&type=SALES&q=Meera&format=xlsx'],
      ['CSV', '/api/pharmacy/reports/sales-register?from=2026-10-01&to=2026-10-31&type=SALES&q=Meera&format=csv'],
      ['PDF', '/api/pharmacy/reports/sales-register?from=2026-10-01&to=2026-10-31&type=SALES&q=Meera&format=pdf'],
    ]);
  });

  it('applies new filters only on Go, through the address bar', async () => {
    mockQuery = 'report=sales-register&from=2026-10-01&to=2026-10-31';
    api.get.mockResolvedValue(salesRegister as any);
    render(<PharmacyReportWorkspace />);
    await screen.findByRole('table', { name: 'Sales Register' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'RETURNS');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search this report' }), 'Ravi');
    expect(mockRouter.replace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard/pharmacy/reports?report=sales-register&from=2026-10-01&to=2026-10-31&type=RETURNS&q=Ravi', { scroll: false });
  });

  it('sorts a column from its heading without touching the totals', async () => {
    mockQuery = 'report=sales-register';
    api.get.mockResolvedValue(salesRegister as any);
    render(<PharmacyReportWorkspace />);
    const table = await screen.findByRole('table', { name: 'Sales Register' });
    const firstCells = () => within(table).getAllByRole('row').slice(2).map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(firstCells()).toEqual(['PHI-2026-536', 'RET-1 (return)']);
    await userEvent.click(within(table).getByRole('button', { name: /^Total/ }));
    await userEvent.click(within(table).getByRole('button', { name: /^Total/ }));
    expect(firstCells()).toEqual(['RET-1 (return)', 'PHI-2026-536']);
    expect(within(screen.getByTestId('report-totals-row')).getAllByRole('cell')[2]).toHaveTextContent('1,59,656.74');
  });

  it('says so when the server refuses the role', async () => {
    mockQuery = 'report=gstr-3b';
    api.get.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    render(<PharmacyReportWorkspace />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Your role cannot open pharmacy reports');
  });

  it('tells the user when a report link is not one it knows', () => {
    mockQuery = 'report=nonsense';
    render(<PharmacyReportWorkspace />);
    expect(screen.getByRole('alert')).toHaveTextContent('That report is not available');
  });
});

describe('Daily Collection', () => {
  beforeEach(() => {
    mockQuery = 'report=daily-collection&from=2026-11-05';
  });

  it('asks for a count, previews the difference as it is typed, and saves it against the count shown', async () => {
    api.get.mockResolvedValue(collection() as any);
    api.post.mockResolvedValue(counted(1, 1100) as any);
    render(<PharmacyReportWorkspace />);
    expect(await screen.findByTestId('collection-status')).toHaveAttribute('data-status', 'NOT_COUNTED');
    expect(screen.getByTestId('expected-total')).toHaveTextContent('1,640.00');
    const save = screen.getByRole('button', { name: 'Save count' });
    expect(save).toBeDisabled();

    await userEvent.type(desk().getByRole('textbox', { name: 'Cash counted' }), '1,100');
    await userEvent.type(desk().getByRole('textbox', { name: 'UPI counted' }), '500');
    expect(screen.getByTestId('difference-CASH')).toHaveTextContent('-40.00');
    expect(screen.getByTestId('difference-total')).toHaveTextContent('-40.00');
    await userEvent.click(save);

    expect(api.post).toHaveBeenCalledWith('/pharmacy/reports/daily-collection/2026-11-05/counts', { counted: { CASH: 1100, UPI: 500 }, basedOnSequence: 0 });
    expect(await screen.findByText(/Count saved\. Pharmacy short by ₹40\.00/)).toBeInTheDocument();
    expect(screen.getByTestId('collection-status')).toHaveAttribute('data-status', 'SHORT');
    expect(screen.getByTestId('count-history')).toHaveTextContent('Counted by Asha Rao');
    expect(screen.getByRole('button', { name: 'Save recount' })).toBeDisabled();
  });

  it('refuses unreadable amounts before sending anything', async () => {
    api.get.mockResolvedValue(collection() as any);
    render(<PharmacyReportWorkspace />);
    await userEvent.type((await screen.findByTestId('collection-status'), desk().getByRole('textbox', { name: 'Cash counted' })), '11OO');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter amounts as numbers');
    expect(screen.getByRole('button', { name: 'Save count' })).toBeDisabled();
  });

  it('on a clash with someone else’s count, shows theirs and keeps what this person typed for a recount', async () => {
    api.get.mockResolvedValueOnce(collection() as any).mockResolvedValueOnce(counted(1, 1140, 'Ravi Kumar') as any);
    api.post.mockRejectedValueOnce(Object.assign(new Error('Conflict'), { status: 409 }));
    render(<PharmacyReportWorkspace />);
    await userEvent.type((await screen.findByTestId('collection-status'), desk().getByRole('textbox', { name: 'Cash counted' })), '1100');
    await userEvent.click(screen.getByRole('button', { name: 'Save count' }));

    expect(await screen.findByText(/Someone else saved a count/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('count-history')).toHaveTextContent('Counted by Ravi Kumar'));
    expect(desk().getByRole('textbox', { name: 'Cash counted' })).toHaveValue('1100');
    api.post.mockResolvedValueOnce(counted(2, 1100) as any);
    await userEvent.click(screen.getByRole('button', { name: 'Save recount' }));
    expect(api.post).toHaveBeenLastCalledWith('/pharmacy/reports/daily-collection/2026-11-05/counts', { counted: { CASH: 1100 }, basedOnSequence: 1 });
  });

  it('shows the count read-only to a role that cannot record one', async () => {
    api.get.mockResolvedValue({ ...counted(1, 1140), canRecordCount: false } as any);
    render(<PharmacyReportWorkspace />);
    expect(await screen.findByTestId('collection-status')).toHaveAttribute('data-status', 'BALANCED');
    expect(screen.queryByRole('textbox', { name: /counted/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument();
  });

  it('puts the whole day and the clinic’s consultations and procedures above the pharmacy count', async () => {
    const money = (key: string, label: string) => ({ key, label, kind: 'money' });
    const whole = {
      id: 'whole-day', title: 'Whole day by payment mode',
      columns: [{ key: 'mode', label: 'Payment mode', kind: 'text' }, money('clinic', 'Clinic'), money('pharmacy', 'Pharmacy'), money('total', 'Total')],
      rows: [{ key: 'CASH', cells: { mode: 'Cash', clinic: 500, pharmacy: 1140, total: 1640 } }, { key: 'UPI', cells: { mode: 'UPI', clinic: 300, pharmacy: 500, total: 800 } }],
      totals: { mode: 'Total', clinic: 800, pharmacy: 1640, total: 2440 },
    };
    const clinicBills = {
      id: 'clinic-bills', title: 'Clinic bills',
      columns: [{ key: 'number', label: 'Bill No.', kind: 'text' }, money('amount', 'Amount'), money('due', 'Due')],
      rows: [{ key: 'b1', cells: { number: 'INV-20261105-001', amount: 800, due: 500 } }],
      totals: { number: 'Total', amount: 800, due: 500 },
    };
    const report = collection();
    api.get.mockResolvedValue({
      ...report,
      headline: { label: 'Whole day', value: 2440 },
      clinic: { day: '2026-11-05', modes: [], billCount: 2, billed: 1300, collectedOnTodaysBills: 800, dueAtDayEnd: 500, received: 800, refunds: 0, net: 800 },
      wholeDay: { modes: [], clinic: 800, pharmacy: 1640, total: 2440 },
      sections: [whole, clinicBills, ...report.sections],
    } as any);
    render(<PharmacyReportWorkspace />);
    await screen.findByTestId('collection-status');
    const blocks = ['Whole day', 'Clinic: consultations and procedures', 'Pharmacy'];
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent).filter((t) => blocks.includes(t ?? ''))).toEqual(blocks);
    expect(screen.getByRole('heading', { name: 'Pharmacy' }).compareDocumentPosition(screen.getByTestId('collection-status')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const wholeTable = within(screen.getByRole('table', { name: 'Whole day by payment mode' }));
    expect(wholeTable.getByRole('row', { name: /^Cash/ })).toHaveTextContent('Cash500.001,140.001,640.00');
    expect(within(screen.getByRole('region', { name: 'Clinic: consultations and procedures' })).getByRole('table', { name: 'Clinic bills' })).toHaveTextContent('INV-20261105-001');
    expect(screen.getByRole('region', { name: 'Whole day' })).toHaveTextContent('Whole day₹2,440.00');
    expect(screen.getByRole('region', { name: 'Clinic: consultations and procedures' })).toHaveTextContent('Clinic still due₹500.00');
  });

  it('steps a day at a time and never past today', async () => {
    api.get.mockResolvedValue(collection() as any);
    render(<PharmacyReportWorkspace />);
    await screen.findByTestId('collection-status');
    await userEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard/pharmacy/reports?report=daily-collection&from=2026-11-04&to=2026-11-04', { scroll: false });
  });
});
