import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportsPage from '@/app/dashboard/reports/page';
import { apiClient } from '@/lib/api';
import { REPORT_EXPORT_TYPE } from '@/lib/reports-model';
import { DashboardUserProvider } from '@/components/layout/dashboard-user-context';
import type { User } from '@/lib/types';

const renderReports = (role = 'OWNER') =>
  render(
    <DashboardUserProvider value={{ user: { id: 'me', role } as unknown as User, loading: false, refresh: jest.fn(), logout: jest.fn() }}>
      <ReportsPage />
    </DashboardUserProvider>,
  );

const toast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@/components/common/QuickGuide', () => ({ QuickGuide: () => null }));

let mockSearch = '';
const mockListeners = new Set<() => void>();
jest.mock('next/navigation', () => {
  const { useSyncExternalStore } = jest.requireActual('react');
  return {
    usePathname: () => '/dashboard/reports',
    useRouter: () => ({
      replace: (href: string) => {
        mockSearch = href.split('?')[1] ?? '';
        mockListeners.forEach((listener) => listener());
      },
    }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore((listener: () => void) => {
      mockListeners.add(listener);
      return () => mockListeners.delete(listener);
    }, () => mockSearch)),
  };
});

jest.mock('@/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    getRevenueReport: jest.fn(),
    getPatientReport: jest.fn(),
    getDoctorReport: jest.fn(),
  },
}));

const api = apiClient as unknown as Record<string, jest.Mock>;
const revenue = { totalRevenue: 1000, totalGst: 0, netRevenue: 1000, totalInvoices: 2, dailyBreakdown: [] };
const noAlerts = { counts: { overdueInvoices: 0, lowStockAlerts: 0, expiryAlerts: 0, pendingPayments: 0, upcomingAppointments: 0 } };

function getMock(routes: Record<string, unknown>) {
  api.get.mockImplementation(async (path: string) => {
    if (!(path in routes)) throw new Error(`unexpected GET ${path}`);
    const value = routes[path];
    if (value instanceof Error) throw value;
    return value;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date('2026-11-11T19:00:00.000Z'), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'nextTick', 'setImmediate', 'queueMicrotask'] });
  mockSearch = '';
  getMock({ '/reports/alerts': noAlerts });
  api.getRevenueReport.mockResolvedValue(revenue);
  api.getPatientReport.mockResolvedValue({ totalPatients: 0, newPatients: 0, returningPatients: 0, averageAge: null, ageGroupBreakdown: [] });
  api.getDoctorReport.mockResolvedValue({ totalDoctors: 0, activeDoctors: 0 });
  api.post.mockResolvedValue({});
});

afterEach(() => jest.useRealTimers());

const panel = () => screen.getByRole('tabpanel');

describe('report export', () => {
  it('maps every tab to the singular backend enum', () => {
    expect(REPORT_EXPORT_TYPE).toEqual({
      revenue: 'REVENUE',
      patients: 'PATIENT',
      doctors: 'DOCTOR',
      appointments: 'APPOINTMENT',
      inventory: 'INVENTORY',
      payments: 'PAYMENT',
    });
  });

  it('exports the Patients tab as PATIENT for the applied dates and can pick CSV repeatedly', async () => {
    mockSearch = 'tab=patients&from=2026-04-01&to=2026-04-30';
    const user = userEvent.setup();
    renderReports();
    await screen.findByText('Total Patients');
    for (let i = 0; i < 2; i++) {
      await user.click(within(panel()).getByRole('button', { name: 'Export report' }));
      await user.click(await screen.findByRole('menuitem', { name: 'CSV' }));
    }
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post).toHaveBeenLastCalledWith('/reports/export', {
      reportType: 'PATIENT', exportFormat: 'CSV', parameters: { startDate: '2026-04-01', endDate: '2026-04-30' },
    });
  });

  it('shows a message when the export fails', async () => {
    api.post.mockRejectedValue(new Error('Boom'));
    const user = userEvent.setup();
    renderReports();
    await user.click(within(panel()).getByRole('button', { name: 'Export report' }));
    await user.click(await screen.findByRole('menuitem', { name: 'PDF' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not export the report', description: 'Boom' })));
  });
});

describe('patient average age', () => {
  it('shows the average the server measured from each patient, rounded to a year', async () => {
    mockSearch = 'tab=patients';
    api.getPatientReport.mockResolvedValue({ totalPatients: 20, newPatients: 2, returningPatients: 3, averageAge: 41.9, ageGroupBreakdown: [] });
    renderReports();
    const tile = (await screen.findByText('Avg Age')).parentElement!.parentElement!;
    expect(tile).toHaveTextContent('Avg Age42');
  });

  it('shows a dash, never NaN, when no patient has an age', async () => {
    mockSearch = 'tab=patients';
    renderReports();
    const tile = (await screen.findByText('Avg Age')).parentElement!.parentElement!;
    expect(tile).toHaveTextContent('Avg Age—');
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});

describe('dates', () => {
  it('opens the report and dates named in the address bar', async () => {
    mockSearch = 'tab=payments&from=2026-04-01&to=2026-04-30';
    getMock({ '/reports/alerts': noAlerts, '/reports/payments': { totalPayments: 3, totalAmount: 900, successfulPayments: 3, failedPayments: 0, successRate: 100 } });
    renderReports();

    expect(await screen.findByText('Total Payments')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Payments' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Report for 01 Apr 2026 to 30 Apr 2026')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/reports/payments', expect.objectContaining({ startDate: '2026-04-01', endDate: '2026-04-30' }));
  });

  it('falls back to the last 30 days when the address bar dates are impossible', async () => {
    mockSearch = 'from=2026-11-30&to=2026-11-01';
    renderReports();

    await screen.findByText('Total Revenue');
    expect(api.getRevenueReport).toHaveBeenCalledWith(expect.objectContaining({ startDate: '2026-10-13', endDate: '2026-11-12' }));
  });

  it('applies a period at once and keeps it in the address bar', async () => {
    const user = userEvent.setup();
    renderReports();
    await screen.findByText('Total Revenue');

    await user.selectOptions(within(panel()).getByLabelText('Period'), 'This financial year');

    await waitFor(() => expect(api.getRevenueReport).toHaveBeenLastCalledWith(expect.objectContaining({ startDate: '2026-04-01', endDate: '2026-11-12' })));
    expect(new URLSearchParams(mockSearch).get('from')).toBe('2026-04-01');
    expect(new URLSearchParams(mockSearch).get('to')).toBe('2026-11-12');
    expect(await screen.findByText('Report for 01 Apr 2026 to 12 Nov 2026')).toBeInTheDocument();
  });

  it('refuses a From date after the To date instead of fetching it', async () => {
    const user = userEvent.setup();
    renderReports();
    await screen.findByText('Total Revenue');
    const calls = api.getRevenueReport.mock.calls.length;

    const from = within(panel()).getByLabelText('From');
    await user.clear(from);
    await user.type(from, '20/11/2026');

    expect(screen.getByRole('alert')).toHaveTextContent('The From date is after the To date.');
    expect(within(panel()).getByRole('button', { name: 'Show report' })).toBeDisabled();
    await user.type(from, '{Enter}');
    expect(api.getRevenueReport).toHaveBeenCalledTimes(calls);
  });

  it('fetches typed dates only when Show report is pressed', async () => {
    const user = userEvent.setup();
    renderReports();
    await screen.findByText('Total Revenue');
    const calls = api.getRevenueReport.mock.calls.length;

    const from = within(panel()).getByLabelText('From');
    await user.clear(from);
    await user.type(from, '01/1');
    expect(api.getRevenueReport).toHaveBeenCalledTimes(calls);
    await user.type(from, '1/2026');
    expect(api.getRevenueReport).toHaveBeenCalledTimes(calls);
    await user.click(within(panel()).getByRole('button', { name: 'Show report' }));

    await waitFor(() => expect(api.getRevenueReport).toHaveBeenLastCalledWith(expect.objectContaining({ startDate: '2026-11-01', endDate: '2026-11-12' })));
  });
});

describe('load failures', () => {
  it('shows an error with Retry, not the previous range\'s numbers, when a new range fails', async () => {
    const user = userEvent.setup();
    renderReports();
    expect((await screen.findAllByText(/1,000/)).length).toBeGreaterThan(0);
    api.getRevenueReport.mockRejectedValue(Object.assign(new Error('down'), { status: 500 }));

    await user.selectOptions(within(panel()).getByLabelText('Period'), 'Last financial year');

    expect(await screen.findByText('Could not load this report')).toBeInTheDocument();
    expect(screen.queryByText(/1,000/)).not.toBeInTheDocument();
    api.getRevenueReport.mockResolvedValue(revenue);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect((await screen.findAllByText(/1,000/)).length).toBeGreaterThan(0);
  });

  it('explains a 403', async () => {
    api.getRevenueReport.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    renderReports();
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
  });

  it('says when system alerts cannot load and offers a retry', async () => {
    getMock({ '/reports/alerts': new Error('alerts down') });
    const user = userEvent.setup();
    renderReports();

    expect(await screen.findByText(/System alerts could not be loaded: alerts down/)).toBeInTheDocument();
    getMock({ '/reports/alerts': noAlerts });
    await user.click(screen.getByRole('button', { name: 'Retry alerts' }));
    expect(await screen.findByText('System Alerts')).toBeInTheDocument();
  });

  it('does not reload system alerts when the report tab changes', async () => {
    const user = userEvent.setup();
    renderReports();
    await screen.findByText('Total Revenue');

    await user.click(screen.getByRole('tab', { name: 'Patients' }));
    await screen.findByText('Total Patients');

    expect(api.get.mock.calls.filter(([path]) => path === '/reports/alerts')).toHaveLength(1);
  });
});

describe('scope', () => {
  it.each([
    ['', 'Total Revenue'],
    ['tab=payments', 'Total Payments'],
  ])('says Revenue and Payments count clinic bills, not pharmacy sales (%s)', async (search, heading) => {
    mockSearch = search;
    getMock({ '/reports/alerts': noAlerts, '/reports/payments': { totalPayments: 0, totalAmount: 0, successfulPayments: 0, failedPayments: 0, successRate: 0 } });
    renderReports();
    await screen.findByText(heading);

    expect(panel()).toHaveTextContent('Clinic bills only: consultations and procedures. Pharmacy sales are in Pharmacy Reports, and Daily Collection shows both together.');
    expect(within(panel()).getByRole('link', { name: 'Daily Collection' })).toHaveAttribute('href', '/dashboard/pharmacy/reports?report=daily-collection');
  });
});

describe('charts', () => {
  it('plots takings for every day of the range, naming the best day', async () => {
    mockSearch = 'from=2026-11-01&to=2026-11-05';
    api.getRevenueReport.mockResolvedValue({ ...revenue, dailyBreakdown: [
      { date: '2026-11-02', revenue: 800, invoiceCount: 1 },
      { date: '2026-11-04', revenue: 4300, invoiceCount: 2 },
    ] });
    renderReports();

    expect(await screen.findByRole('img', { name: /Highest was ₹4,300\.00 on 04 Nov 2026/ })).toBeInTheDocument();
    const rows = within(screen.getByRole('table', { name: 'Takings per day' })).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual(['02 Nov 2026₹800.00', '04 Nov 2026₹4,300.00']);
  });

  it('lists age groups youngest first whatever order the server sends', async () => {
    mockSearch = 'tab=patients';
    api.getPatientReport.mockResolvedValue({ totalPatients: 6, newPatients: 0, returningPatients: 0, averageAge: 40, ageGroupBreakdown: [
      { ageGroup: '61+', count: 1, percentage: 16.7 },
      { ageGroup: '0-17', count: 2, percentage: 33.3 },
      { ageGroup: '31-45', count: 3, percentage: 50 },
    ] });
    renderReports();

    const table = await screen.findByRole('table', { name: 'Patients by age group' });
    expect(within(table).getAllByRole('row').slice(1).map((row) => row.textContent)).toEqual(['0-172', '31-453', '61+1']);
  });
});

describe('system alerts drill-down', () => {
  it('opens the items behind a count with a link to the full list', async () => {
    getMock({ '/reports/alerts': {
      counts: { ...noAlerts.counts, lowStockAlerts: 12 },
      lowStockAlerts: [{ itemId: 'c', itemName: 'Cetirizine 10mg', currentStock: 4, reorderLevel: 10 }],
    } });
    const user = userEvent.setup();
    renderReports();

    const count = await screen.findByRole('button', { name: /Low Stock\s*12/ });
    expect(count).toHaveAttribute('aria-expanded', 'false');
    await user.click(count);

    const list = screen.getByRole('region', { name: 'Low Stock' });
    expect(list).toHaveTextContent('Cetirizine 10mg · 4 left, minimum 10');
    expect(list).toHaveTextContent('Showing 1 of 12.');
    expect(within(list).getByRole('link', { name: 'Open low stock in Inventory' })).toHaveAttribute('href', '/dashboard/inventory?area=stock&view=list&stock=LOW');
  });

  it('links an overdue invoice to its patient and the unpaid clinic bills', async () => {
    getMock({ '/reports/alerts': {
      counts: { ...noAlerts.counts, overdueInvoices: 1 },
      overdueInvoices: [{ id: 'i1', invoiceNo: 'INV-7', total: 800, dueDate: '2026-11-02T12:30:00.000Z', patient: { id: 'p1', name: 'Meera Joshi' } }],
    } });
    const user = userEvent.setup();
    renderReports();

    await user.click(await screen.findByRole('button', { name: /Overdue Invoices\s*1/ }));

    expect(screen.getByRole('link', { name: 'INV-7 · Meera Joshi · ₹800.00 · due 02 Nov 2026' })).toHaveAttribute('href', '/dashboard/patients/p1');
    expect(screen.getByRole('link', { name: 'Open overdue clinic bills' })).toHaveAttribute('href', '/dashboard/billing?status=overdue');
  });

  it('shows a manager the overdue bills without links to pages a manager cannot open', async () => {
    getMock({ '/reports/alerts': {
      counts: { ...noAlerts.counts, overdueInvoices: 1 },
      overdueInvoices: [{ id: 'i1', invoiceNo: 'INV-7', total: 800, dueDate: '2026-11-02T12:30:00.000Z', patient: { id: 'p1', name: 'Meera Joshi' } }],
    } });
    const user = userEvent.setup();
    renderReports('MANAGER');

    await user.click(await screen.findByRole('button', { name: /Overdue Invoices\s*1/ }));

    expect(screen.getByText('INV-7 · Meera Joshi · ₹800.00 · due 02 Nov 2026')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open overdue clinic bills' })).not.toBeInTheDocument();
  });

  it('keeps a zero count as plain text', async () => {
    renderReports();
    await screen.findByText('System Alerts');
    expect(screen.queryByRole('button', { name: /Low Stock/ })).not.toBeInTheDocument();
  });
});

describe('inventory severity', () => {
  it('marks out of stock as more serious than low stock', async () => {
    mockSearch = 'tab=inventory';
    getMock({ '/reports/alerts': noAlerts, '/reports/inventory': {
      totalItems: 3, totalValue: 100, lowStockItems: 2, outOfStockItems: 1,
      lowStockAlerts: [
        { itemName: 'Cetirizine', currentStock: 4, reorderLevel: 10 },
        { itemName: 'Doxycycline', currentStock: 0, reorderLevel: 5 },
      ],
    } });
    renderReports();

    const low = (await screen.findByText('Low Stock', { selector: 'p' })).parentElement!.nextElementSibling!;
    const out = screen.getByText('Out of Stock', { selector: 'p' }).parentElement!.nextElementSibling!;
    expect(low).toHaveClass('text-warning-text');
    expect(out).toHaveClass('text-destructive-text');
    expect(screen.getByText('Doxycycline').parentElement!.parentElement).toHaveTextContent('Out of Stock');
    expect(screen.getByText('Cetirizine').parentElement!.parentElement).toHaveTextContent('Low Stock');
  });
});
