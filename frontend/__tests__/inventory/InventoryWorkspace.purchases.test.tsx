import { StrictMode, useSyncExternalStore } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
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
let mockRole = 'PHARMACIST';
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { id: 'operator', branchId: 'branch', role: mockRole } }) }));

const get = jest.mocked(apiClient.get);
const registerRequests = () =>
  get.mock.calls.filter(([path]) => path === '/pharmacy/purchase-register').map(([, params]) => params as Record<string, unknown>);

const emptyRegister = {
  rows: [],
  total: 0,
  page: 1,
  limit: 50,
  totals: { amount: 0, outstanding: 0, count: 0, excluded: { notPosted: 0, cancelled: 0 } },
  entryByOptions: [],
  distributorOptions: [],
};

function serve(capabilities: Record<string, unknown>, register: () => Promise<unknown> = async () => emptyRegister) {
  get.mockImplementation(async (path: string) => {
    if (path === '/inventory/workspace/capabilities') return { kinds: {}, ...capabilities };
    if (path === '/pharmacy/purchase-register') return register();
    if (path === '/inventory/workspace/overview') {
      return { asOf: '2026-11-06T06:00:00.000Z', purchases: [{ status: 'OCR_REVIEW_REQUIRED', _count: 3 }], pendingPurchase: 2, queues: [], recent: [], lowStock: 0, expiring: 0, unlinked: 0 };
    }
    throw new Error(`Unexpected ${path}`);
  });
}

beforeAll(() => {
  jest.useFakeTimers({ now: new Date('2026-11-06T06:00:00.000Z'), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'nextTick', 'queueMicrotask'] });
});
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'PHARMACIST';
});

const DEEP_LINK = '/dashboard/inventory?area=purchases&view=register&from=2026-03-01&to=2027-03-31&gstin=36ABCDE1234F1Z5';

it.each([1, 2, 3, 4])('keeps the deep-linked period on load %i, under StrictMode', async () => {
  mockUrl.set(DEEP_LINK);
  serve({ ledger: true, creditWrite: true });
  const { unmount } = render(
    <StrictMode>
      <InventoryWorkspace />
    </StrictMode>,
  );
  await screen.findByText('No purchase bills match your search');
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
  expect(new Set(registerRequests().map(({ from, to, distributorGstin }) => `${from}..${to} ${distributorGstin}`))).toEqual(
    new Set(['2026-03-01..2027-03-31 36ABCDE1234F1Z5']),
  );
  expect(new URLSearchParams(window.location.search).get('from')).toBe('2026-03-01');
  unmount();
});

const dueBill = {
  id: 'bill-1', srNo: 1, billNo: 'LIN-101', entryAt: '2026-10-01T05:00:00.000Z', billDate: '2026-10-01', entryBy: null, source: 'MANUAL',
  distributor: { name: 'Linae Distributors', gstin: '36ABCDE1234F1Z5' }, amount: 1000, invoiceState: 'POSTED', documents: [],
  payment: { state: 'DUE', paid: 0, credit: 0, outstanding: 1000, scheduled: 0, scheduledOn: null, payable: 1000, partlyPaid: false, dueDate: null, overdueDays: 0 },
};

it('opens the bills still to post from the Today card', async () => {
  mockUrl.set('/dashboard/inventory?area=today');
  serve({ ledger: true, creditWrite: true });
  render(<InventoryWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: /Purchase invoices to review/ }));
  await waitFor(() => expect(registerRequests()).toHaveLength(1));
  expect(registerRequests()[0]).toMatchObject({ paymentState: 'NOT_POSTED', from: '2026-04-01', to: '2027-03-31' });
  expect(screen.getByLabelText('Payment status')).toHaveValue('NOT_POSTED');
});

it('counts on the Today card the bills the register lists, not every unposted bill ever entered', async () => {
  mockUrl.set('/dashboard/inventory?area=today');
  serve({ ledger: true, creditWrite: true });
  render(<InventoryWorkspace />);
  expect(await screen.findByRole('button', { name: /Purchase invoices to review/ })).toHaveTextContent(/^2Purchase invoices to review/);
});

it.each([
  [true, 1],
  [false, 0],
])('with ledger access %s, lists Payments & dues in the Purchases menu %i time(s)', async (ledger, listed) => {
  mockUrl.set('/dashboard/inventory?area=purchases&view=register');
  serve({ ledger, creditWrite: ledger });
  render(<InventoryWorkspace />);
  await screen.findByRole('tab', { name: 'Purchase' });
  await waitFor(() => expect(screen.getAllByRole('option', { name: 'Suppliers' })).toHaveLength(2));
  expect(screen.queryAllByRole('option', { name: 'Payments & dues' })).toHaveLength(listed * 2);
});

it('opens Purchases on the bills register', async () => {
  mockUrl.set('/dashboard/inventory?area=today');
  serve({ ledger: true, creditWrite: true });
  render(<InventoryWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: 'Purchases' }));
  expect(await screen.findByRole('tab', { name: 'Purchase' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('button', { name: 'Purchase bills' })).toHaveAttribute('aria-current', 'page');
  await waitFor(() => expect(registerRequests()).toHaveLength(1));
});

it('tells reception without register access so, instead of showing Forbidden resource', async () => {
  mockRole = 'RECEPTION';
  mockUrl.set('/dashboard/inventory?area=purchases');
  serve({ ledger: false, creditWrite: false }, async () => {
    throw Object.assign(new Error('Forbidden resource'), { status: 403, body: { message: 'Forbidden resource' } });
  });
  render(<InventoryWorkspace />);
  expect(await screen.findByText('You don’t have access to purchase bills.')).toBeInTheDocument();
  expect(screen.queryByText(/Forbidden resource/)).not.toBeInTheDocument();
});

it.each([
  ['PHARMACIST', true, ['Mark bill LIN-101 paid']],
  ['RECEPTION', true, []],
  ['PHARMACIST', false, []],
])('offers Mark paid to %s with ledger write %s only when the ledger would accept it', async (role, creditWrite, buttons) => {
  mockRole = role;
  mockUrl.set('/dashboard/inventory?area=purchases&view=register');
  serve({ ledger: true, creditWrite }, async () => ({ ...emptyRegister, rows: [dueBill], total: 1 }));
  render(<InventoryWorkspace />);
  await screen.findByText('LIN-101');
  expect(screen.queryAllByRole('button', { name: /^Mark bill/ }).map((button) => button.getAttribute('aria-label'))).toEqual(buttons);
});

const returnBase = {
  kind: 'SUPPLIER_RETURN', version: 2, entryAt: '2026-11-02T05:00:00.000Z', returnDate: '2026-11-02', entryBy: null,
  distributor: { name: 'Linae Distributors', gstin: '36ABCDE1234F1Z5' }, sourceBillNo: 'LIN-1', returnValue: 224, reason: 'EXPIRY',
};
const returnsPage = {
  rows: [
    { ...returnBase, id: 'ret-1', srNo: 1, returnRef: 'RET-1', creditNote: null, credit: null, state: 'AWAITED' },
    {
      ...returnBase, id: 'ret-2', srNo: 2, returnRef: 'RET-2', state: 'RECEIVED',
      creditNote: { number: 'CN-9', date: '2026-11-04', amount: 224 }, credit: { id: 'credit-2', amount: 224, applied: 0, available: 224 },
    },
  ],
  total: 2, page: 1, limit: 50,
  totals: { held: 224, awaited: { amount: 224, count: 1 }, count: 2, excluded: { drafts: 0, cancelled: 0 } },
  entryByOptions: [], distributorOptions: [],
};

it.each(['PHARMACIST', 'DOCTOR', 'ADMIN'])('lets %s open the Returns tab with Record credit note and Set off offered', async (role) => {
  mockRole = role;
  mockUrl.set('/dashboard/inventory?area=purchases&view=register&tab=returns');
  get.mockImplementation(async (path: string) => {
    if (path === '/inventory/workspace/capabilities') return { kinds: {}, ledger: true, creditWrite: true };
    if (path === '/pharmacy/purchase-returns-register') return returnsPage;
    if (path === '/pharmacy/purchase-register') return { ...emptyRegister, creditHeld: {}, distributorPosition: null };
    throw new Error(`Unexpected ${path}`);
  });
  render(<InventoryWorkspace />);
  expect(await screen.findByRole('button', { name: 'Record credit note for return RET-1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Set off credit note CN-9 against bills' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Returns' })).toHaveAttribute('aria-selected', 'true');
});

it('opens the supplier returns in progress from Today on the Returns tab', async () => {
  mockUrl.set('/dashboard/inventory?area=today');
  serve({ ledger: true, creditWrite: true });
  get.mockImplementation(async (path: string) => {
    if (path === '/inventory/workspace/capabilities') return { kinds: {}, ledger: true, creditWrite: true };
    if (path === '/inventory/workspace/overview')
      return { asOf: '2026-11-06T06:00:00.000Z', purchases: [], queues: [{ kind: 'SUPPLIER_RETURN', _count: 2 }], recent: [], lowStock: 0, expiring: 0, unlinked: 0 };
    if (path === '/pharmacy/purchase-returns-register') return returnsPage;
    return { ...emptyRegister, creditHeld: {}, distributorPosition: null };
  });
  render(<InventoryWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: /Supplier returns in progress/ }));
  expect(await screen.findByRole('button', { name: 'Record credit note for return RET-1' })).toBeInTheDocument();
  expect(new URLSearchParams(window.location.search).get('tab')).toBe('returns');
});
