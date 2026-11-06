import { StrictMode, useSyncExternalStore } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { id: 'operator', branchId: 'branch', role: 'PHARMACIST' } }) }));

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
      return { asOf: '2026-11-06T06:00:00.000Z', purchases: [{ status: 'OCR_REVIEW_REQUIRED', _count: 3 }], queues: [], recent: [], lowStock: 0, expiring: 0, unlinked: 0 };
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
