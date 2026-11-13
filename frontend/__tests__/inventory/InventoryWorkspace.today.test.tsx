import { useSyncExternalStore } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { InventoryWorkspace } from '@/components/inventory/InventoryWorkspace';
import { apiClient } from '@/lib/api';

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
  replace: jest.fn((href: string) => mockUrl.set(href)),
  refresh: jest.fn(),
};

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), getInventoryItemRequestPendingCount: jest.fn() } }));
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
let mockRole = 'OWNER';
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { id: 'operator', branchId: 'branch', role: mockRole } }) }));
jest.mock('@/components/inventory/InventoryUpdates', () => ({ InventoryUpdates: () => <p>Price edits list</p> }));
jest.mock('@/components/inventory/InventoryItemRequests', () => ({ InventoryItemRequests: () => <p>New item requests list</p> }));
jest.mock('@/components/inventory/optimization/DataQualityStrip', () => ({ DataQualityStrip: () => <section aria-label="Data quality">Data quality</section> }));

const get = jest.mocked(apiClient.get);
const pendingCount = apiClient.getInventoryItemRequestPendingCount as jest.Mock;

const overview = (extra: Record<string, unknown> = {}) => ({
  asOf: '2026-11-06T06:00:00.000Z', purchases: [], queues: [], recent: [], lowStock: 0, expiring: 0, unlinked: 0, pendingPurchase: 0, pendingEdits: 1, ...extra,
});
function serve(data: Record<string, unknown> = {}) {
  get.mockImplementation(async (path: string) => {
    if (path === '/inventory/workspace/capabilities') return { kinds: {}, ledger: true, creditWrite: true };
    if (path === '/inventory/workspace/overview') return overview(data);
    throw new Error(`Unexpected ${path}`);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'OWNER';
  pendingCount.mockResolvedValue({ count: 1 });
  mockUrl.set('/dashboard/inventory?area=today');
});

it('names the price/stock row without repeating its count and opens the Price / stock tab', async () => {
  serve();
  render(<InventoryWorkspace />);
  const row = await screen.findByRole('button', { name: /^1\s*Price\/stock edits awaiting approval$/ });
  expect(row).not.toHaveTextContent('(1)');
  await screen.findByRole('button', { name: /New items awaiting approval/ });
  fireEvent.click(row);
  expect(await screen.findByRole('tab', { name: 'Price / stock' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: /New items/ })).toHaveAttribute('aria-selected', 'false');
});

it('opens the New items tab from the New items awaiting approval row, for approvers only', async () => {
  serve();
  const { unmount } = render(<InventoryWorkspace />);
  const row = await screen.findByRole('button', { name: /New items awaiting approval/ });
  expect(row).toHaveTextContent('1');
  expect(row).toHaveAttribute('title', 'Check each requested item before it is added to inventory.');
  fireEvent.click(row);
  expect(await screen.findByRole('tab', { name: /New items/ })).toHaveAttribute('aria-selected', 'true');
  unmount();
  mockRole = 'PHARMACIST';
  mockUrl.set('/dashboard/inventory?area=today');
  render(<InventoryWorkspace />);
  await screen.findByRole('button', { name: /Price\/stock edits awaiting approval/ });
  expect(screen.queryByRole('button', { name: /New items awaiting approval/ })).not.toBeInTheDocument();
});

it('lists zero queues as links in one Nothing waiting line and keeps unknown counts as full rows', async () => {
  serve({ lowStock: 0, expiring: 4, creditNotesAwaited: undefined });
  render(<InventoryWorkspace />);
  const line = (await screen.findByText(/^Nothing waiting:/)).closest('p') as HTMLElement;
  const low = within(line).getByRole('button', { name: 'Low stock' });
  expect(low).toHaveAttribute('title', 'Available quantity is at or below this batch’s saved minimum.');
  expect(screen.queryByRole('button', { name: /^0\s*Low stock/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^4\s*Expiring in the next 3 months/ })).toBeInTheDocument();
  fireEvent.click(low);
  expect(new URLSearchParams(window.location.search).get('stock')).toBe('LOW');
});

it('does not show an unknown count as zero', async () => {
  serve({ lowStock: undefined });
  render(<InventoryWorkspace />);
  const row = await screen.findByRole('button', { name: /^—\s*Low stock/ });
  expect(row).toBeInTheDocument();
  expect(within(screen.getByText(/^Nothing waiting:/)).queryByRole('button', { name: 'Low stock' })).not.toBeInTheDocument();
});

it('does not repeat queue rows as separate check buttons', async () => {
  serve({ lowStock: 3 });
  render(<InventoryWorkspace />);
  await screen.findByRole('button', { name: /Low stock/ });
  for (const name of [/Check low stock/, /Check next 3 months/, /Check overdue supplier balances/]) {
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  }
});

it('hides the Recent activity heading when nothing is recent', async () => {
  serve({ recent: [] });
  const { unmount } = render(<InventoryWorkspace />);
  await screen.findByText(/^Nothing waiting:/);
  expect(screen.queryByRole('heading', { name: 'Recent activity' })).not.toBeInTheDocument();
  unmount();
  serve({ recent: [{ id: 'r1', kind: 'LOSS', reference: 'LOSS-1', status: 'POSTED' }] });
  render(<InventoryWorkspace />);
  expect(await screen.findByRole('heading', { name: 'Recent activity' })).toBeInTheDocument();
});

it('puts the main actions before the Data quality strip on Today', async () => {
  serve();
  render(<InventoryWorkspace />);
  const strip = await screen.findByLabelText('Data quality');
  const scan = screen.getByRole('button', { name: /Scan or enter bill/ });
  expect(scan.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const nothing = screen.getByText(/^Nothing waiting:/);
  expect(nothing.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
