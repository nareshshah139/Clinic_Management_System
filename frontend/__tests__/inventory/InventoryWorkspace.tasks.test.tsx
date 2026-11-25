import { useSyncExternalStore } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryWorkspace } from '@/components/inventory/InventoryWorkspace';
import { apiClient } from '@/lib/api';
import roleCapabilities from '../fixtures/workspace-capabilities.json';

const mockUrl = {
  search: '',
  listeners: new Set<() => void>(),
  set(href: string) {
    const next = new URL(href, 'http://localhost');
    window.history.replaceState(null, '', `${next.pathname}${next.search}`);
    this.search = next.search.slice(1);
    this.listeners.forEach((listener) => listener());
  },
};
const mockRouter = {
  push: jest.fn((href: string) => mockUrl.set(href)),
  replace: jest.fn((href: string) => { if (href.startsWith('/dashboard/inventory')) mockUrl.set(href); }),
  refresh: jest.fn(),
};

jest.mock('@/lib/api', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), getInventoryItemRequestPendingCount: jest.fn(), getDrugInventoryChangeRequests: jest.fn() },
}));
jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/inventory',
  useRouter: () => mockRouter,
  useSearchParams: () => {
    const search = useSyncExternalStore(
      (listener) => {
        mockUrl.listeners.add(listener);
        return () => mockUrl.listeners.delete(listener);
      },
      () => mockUrl.search,
    );
    return new URLSearchParams(search);
  },
}));
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { id: 'operator', branchId: 'branch', role: 'PHARMACIST' } }) }));
jest.mock('@/components/inventory/optimization/DataQualityStrip', () => ({ DataQualityStrip: () => null }));
jest.mock('@/components/pharmacy/PurchaseLearningCard', () => ({ PurchaseLearningCard: () => null }));
jest.mock('@/components/pharmacy/PurchaseInvoiceWorkbench', () => ({
  PurchaseInvoiceWorkbench: ({ importedDraft }: any) => (
    <section>
      <h3>Scan or enter bill</h3>
      {importedDraft && <p>Imported draft {importedDraft.draft.invoiceNumber}</p>}
    </section>
  ),
}));
jest.mock('@/components/inventory/AlternateInvoiceIntake', () => ({
  AlternateInvoiceIntake: ({ mode, onDraft }: any) => (
    <section>
      <h2>{mode === 'csv' ? 'Import purchase CSV' : 'Invoice attachments from Gmail'}</h2>
      <button onClick={() => onDraft({ draft: { invoiceNumber: 'CSV-9' } })}>Open review draft</button>
    </section>
  ),
}));
jest.mock('@/components/pharmacy/PurchaseLedger', () => ({ PurchaseLedger: ({ initialGstin }: any) => <h2>Purchase Ledger {initialGstin || 'all suppliers'}</h2> }));
jest.mock('@/components/inventory/SupplierCreditPanel', () => ({ SupplierCreditPanel: ({ supplierGstin }: any) => <h2>Supplier credits & vouchers {supplierGstin || 'all suppliers'}</h2> }));
jest.mock('@/components/pharmacy/TradeTermsWorkspace', () => ({ TradeTermsWorkspace: () => <h2>Terms of Trade</h2> }));
jest.mock('@/components/pharmacy/DistributorAnalytics', () => ({ DistributorAnalytics: () => <h2>Distributor analytics</h2> }));
jest.mock('@/components/pharmacy/PharmacyInventoryStarterImport', () => ({ PharmacyInventoryStarterImport: () => <p>Upload opening stock workbook</p> }));
jest.mock('@/components/inventory/WorkspaceStock', () => ({ WorkspaceStock: () => <h2>Stock</h2> }));
jest.mock('@/components/inventory/optimization/StockOptimization', () => ({ StockOptimization: () => <h2>Stock optimization</h2> }));
jest.mock('@/components/inventory/InventoryLedger', () => ({ InventoryLedger: () => <h2>Stock ledger</h2> }));
jest.mock('@/components/inventory/InventoryApprovals', () => ({ InventoryApprovals: () => <h2>Approvals</h2> }));
jest.mock('@/components/inventory/counts/StockCounts', () => ({ StockCounts: () => <h2>Stock counts</h2> }));
jest.mock('@/components/inventory/ReplenishmentCenter', () => ({ ReplenishmentCenter: ({ view }: any) => <h2>Reorder {view}</h2> }));
jest.mock('@/components/inventory/WorkflowDocumentEditor', () => ({ WorkflowDocumentEditor: ({ kind, id }: any) => <h2>Record {kind} {id}</h2> }));

const get = jest.mocked(apiClient.get);
const api = apiClient as unknown as Record<string, jest.Mock>;
const emptyRegister = {
  rows: [], total: 0, page: 1, limit: 50,
  totals: { amount: 0, outstanding: 0, count: 0, held: 0, awaited: { amount: 0, count: 0 }, excluded: { notPosted: 0, cancelled: 0, drafts: 0 } },
  entryByOptions: [], distributorOptions: [], creditHeld: {}, onlyDistributor: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  api.getInventoryItemRequestPendingCount.mockResolvedValue({ count: 0 });
  api.getDrugInventoryChangeRequests.mockResolvedValue({ data: [], pagination: { total: 0 } });
  get.mockImplementation(async (path: string) => {
    if (path === '/inventory/workspace/capabilities') return roleCapabilities.PHARMACIST;
    if (path === '/inventory/workspace/overview')
      return { asOf: '2026-11-06T06:00:00.000Z', queues: [], recent: [], lowStock: 0, expiring: 0, unlinked: 0, supplierOverdue: { count: 2, amount: 500 } };
    if (path === '/inventory/workspace/suppliers') return [{ id: 's1', name: 'Linae Distributors', gstNumber: '36ABCDE1234F1Z5', isActive: true }];
    if (path.startsWith('/inventory/workspace/documents')) return { rows: [], total: 0, page: 1, totalPages: 1 };
    return emptyRegister;
  });
});

const url = () => Object.fromEntries(new URLSearchParams(window.location.search));
const selectedTab = (name: string) => screen.findByRole('tab', { name, selected: true });

type Home = { heading?: string; tab?: string; url?: Record<string, string>; href?: string; label?: string };
const OLD_VIEWS: [string, string, Home][] = [
  ['purchases', 'register', { tab: 'Purchase' }],
  ['purchases', 'intake', { heading: 'Scan or enter bill', tab: 'Scan or enter' }],
  ['purchases', 'csv', { heading: 'Import purchase CSV', tab: 'Import CSV', url: { view: 'intake', method: 'csv' } }],
  ['purchases', 'gmail', { heading: 'Invoice attachments from Gmail', tab: 'Gmail', url: { view: 'intake', method: 'gmail' } }],
  ['purchases', 'suppliers', { heading: 'Suppliers' }],
  ['purchases', 'terms', { heading: 'Terms of Trade' }],
  ['purchases', 'ledger', { heading: 'Purchase Ledger all suppliers', tab: 'Payments & dues', url: { view: 'register', tab: 'payments' } }],
  ['purchases', 'credits', { heading: 'Supplier credits & vouchers all suppliers', tab: 'Credits & vouchers', url: { view: 'register', tab: 'credits' } }],
  ['purchases', 'INWARD_CHALLAN', { heading: 'Inward challans' }],
  ['purchases', 'GATE_PASS', { heading: 'Gate passes' }],
  ['purchases', 'analytics', { heading: 'Distributor analytics' }],
  ['purchases', 'SUPPLIER_RETURN', { tab: 'Returns', url: { view: 'register', tab: 'returns', type: 'SUPPLIER_RETURN' } }],
  ['purchases', 'CREDIT_NOTE', { tab: 'Returns', url: { view: 'register', tab: 'returns', type: 'CREDIT_NOTE' } }],
  ['purchases', 'reports', { href: '/dashboard/pharmacy/reports?report=gst-summary', label: 'Pharmacy Report' }],
  ['purchases', 'daywise', { href: '/dashboard/pharmacy/reports?report=day-wise-summary', label: 'Pharmacy Report' }],
  ['purchases', 'margin', { href: '/dashboard/pharmacy/reports?report=item-margin', label: 'Pharmacy Report' }],
  ['stock', 'list', { heading: 'Stock' }],
  ['stock', 'optimize', { heading: 'Stock optimization' }],
  ['stock', 'ledger', { heading: 'Stock ledger' }],
  ['stock', 'approvals', { heading: 'Approvals' }],
  ['stock', 'COUNT', { heading: 'Stock counts' }],
  ['stock', 'LOSS', { heading: 'Loss & breakage' }],
  ['stock', 'HOLD', { heading: 'Blocked stock' }],
  ['stock', 'CORRECTION', { heading: 'Corrections' }],
  ['stock', 'OPENING_STOCK', { heading: 'Opening stock entries' }],
  ['stock', 'opening', { heading: 'Opening stock import' }],
  ['stock', 'SUPPLIER_RETURN', { tab: 'Returns', url: { area: 'purchases', view: 'register', tab: 'returns', type: 'SUPPLIER_RETURN' } }],
  ['sales', 'COUNTER_SALE', { heading: 'Counter sales' }],
  ['sales', 'QUOTATION', { heading: 'Quotations' }],
  ['sales', 'SALES_RETURN', { heading: 'Customer returns' }],
  ['sales', 'history', { href: '/dashboard/pharmacy/sales', label: 'Sales' }],
  ...['SHORTBOOK', 'PURCHASE_ORDER', 'TARGET_REVIEW', 'targets', 'settings', 'monitor'].map((view): [string, string, Home] => ['reorder', view, { heading: `Reorder ${view}` }]),
];

it.each(OLD_VIEWS)('opens the old link area=%s&view=%s on its home', async (area, view, home) => {
  mockUrl.set(`/dashboard/inventory?area=${area}&view=${view}`);
  render(<InventoryWorkspace />);
  if (home.href) {
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(home.href, { scroll: false }));
    expect(await screen.findByRole('link', { name: home.label })).toHaveAttribute('href', home.href);
    return;
  }
  if (home.heading) expect(await screen.findByRole('heading', { name: home.heading })).toBeInTheDocument();
  if (home.tab) expect(await selectedTab(home.tab)).toBeInTheDocument();
  expect(url()).toEqual({ area, view, ...home.url });
});

it('keeps Gmail sign-in parameters when an old Gmail link moves to Bill intake', async () => {
  mockUrl.set('/dashboard/inventory?area=purchases&view=gmail&code=c-1&state=s-1');
  render(<InventoryWorkspace />);
  expect(await screen.findByRole('heading', { name: 'Invoice attachments from Gmail' })).toBeInTheDocument();
  expect(url()).toEqual({ area: 'purchases', view: 'intake', method: 'gmail', code: 'c-1', state: 's-1' });
});

it('opens a supplier return or credit note record where it is, without sending it to the Returns list', async () => {
  mockUrl.set('/dashboard/inventory?area=purchases&view=SUPPLIER_RETURN&document=ret-1');
  render(<InventoryWorkspace />);
  expect(await screen.findByRole('heading', { name: 'Record SUPPLIER_RETURN ret-1' })).toBeInTheDocument();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

it('lists every Stock task as a named button grouped by purpose, with no hidden menu', async () => {
  mockUrl.set('/dashboard/inventory?area=stock&view=list');
  render(<InventoryWorkspace />);
  await screen.findByRole('heading', { name: 'Stock' });
  const nav = screen.getByRole('navigation', { name: 'Stock tasks' });
  const group = (name: string) => within(within(nav).getByRole('group', { name })).getAllByRole('button').map((button) => button.textContent);
  expect(group('Find & review')).toEqual(['Stock list', 'Stock ledger', 'Stock optimization']);
  expect(group('Count & approve')).toEqual(['Stock counts', 'Approve corrections']);
  expect(group('Adjust')).toEqual(['Loss & breakage', 'Blocked stock', 'Corrections']);
  expect(group('Opening stock')).toEqual(['Manual opening stock', 'Opening stock import']);
  expect(within(nav).getByRole('button', { name: 'Stock list' })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});

it('opens a task from the list with the keyboard, and Escape closes the phone list back to its control', async () => {
  const user = userEvent.setup();
  mockUrl.set('/dashboard/inventory?area=stock&view=list');
  render(<InventoryWorkspace />);
  await screen.findByRole('heading', { name: 'Stock' });
  const toggle = screen.getByRole('button', { name: 'Task: Stock list' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');

  toggle.focus();
  await user.keyboard('{Enter}');
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await user.tab();
  expect(screen.getByRole('button', { name: 'Stock list' })).toHaveFocus();
  await user.tab();
  await user.tab();
  await user.tab();
  expect(screen.getByRole('button', { name: 'Stock counts' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(toggle).toHaveFocus();

  await user.keyboard(' ');
  await user.tab();
  await user.tab();
  await user.keyboard('{Enter}');
  expect(url()).toEqual({ area: 'stock', view: 'ledger' });
  expect(await screen.findByRole('heading', { name: 'Stock ledger' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Task: Stock ledger' })).toHaveAttribute('aria-expanded', 'false');
});

it('offers Scan, CSV and Gmail as the three methods of one Bill intake task', async () => {
  mockUrl.set('/dashboard/inventory?area=purchases&view=register');
  render(<InventoryWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: 'Bill intake' }));
  const methods = await screen.findByRole('tablist', { name: 'Bill intake method' });
  expect(within(methods).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Scan or enter', 'Import CSV', 'Gmail']);
  expect(await selectedTab('Scan or enter')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Scan or enter bill' })).toBeInTheDocument();
  expect(within(screen.getByRole('navigation', { name: 'Purchases tasks' })).queryByRole('button', { name: /Import CSV|Gmail/ })).not.toBeInTheDocument();

  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Import CSV' }));
  expect(await screen.findByRole('heading', { name: 'Import purchase CSV' })).toBeInTheDocument();
  expect(url()).toEqual({ area: 'purchases', view: 'intake', method: 'csv' });
  fireEvent.click(screen.getByRole('button', { name: 'Open review draft' }));
  expect(await screen.findByText('Imported draft CSV-9')).toBeInTheDocument();
  expect(url()).toEqual({ area: 'purchases', view: 'intake' });

  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Gmail' }));
  expect(await screen.findByRole('heading', { name: 'Invoice attachments from Gmail' })).toBeInTheDocument();
  expect(url()).toEqual({ area: 'purchases', view: 'intake', method: 'gmail' });
});

it('reaches Payments & dues and Credits & vouchers as tabs of Purchase bills, keeping the supplier filter', async () => {
  mockUrl.set('/dashboard/inventory?area=purchases&view=register&gstin=36ABCDE1234F1Z5');
  render(<InventoryWorkspace />);
  fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Payments & dues' }));
  expect(await screen.findByRole('heading', { name: 'Purchase Ledger 36ABCDE1234F1Z5' })).toBeInTheDocument();
  expect(url()).toEqual({ area: 'purchases', view: 'register', tab: 'payments', gstin: '36ABCDE1234F1Z5' });
  expect(screen.getByRole('button', { name: 'Purchase bills' })).toHaveAttribute('aria-current', 'page');

  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Credits & vouchers' }));
  expect(await screen.findByRole('heading', { name: 'Supplier credits & vouchers 36ABCDE1234F1Z5' })).toBeInTheDocument();
  expect(url()).toEqual({ area: 'purchases', view: 'register', tab: 'credits', gstin: '36ABCDE1234F1Z5' });
  expect(within(screen.getByRole('navigation', { name: 'Purchases tasks' })).queryByRole('button', { name: /Payments|Credits/ })).not.toBeInTheDocument();
});

it('opens a supplier account and the overdue bills card on the Payments & dues tab', async () => {
  mockUrl.set('/dashboard/inventory?area=purchases&view=suppliers');
  const view = render(<InventoryWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: 'Account & dues' }));
  expect(await screen.findByRole('heading', { name: 'Purchase Ledger 36ABCDE1234F1Z5' })).toBeInTheDocument();
  expect(url()).toEqual({ area: 'purchases', view: 'register', tab: 'payments', gstin: '36ABCDE1234F1Z5' });
  view.unmount();

  mockUrl.set('/dashboard/inventory?area=today');
  render(<InventoryWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: /Overdue supplier bills/ }));
  expect(await selectedTab('Payments & dues')).toBeInTheDocument();
  expect(url()).toEqual({ area: 'purchases', view: 'register', tab: 'payments' });
});
