import { render, screen, waitFor } from '@testing-library/react';
import { PharmacyWorkspace } from './pharmacy-workspace';
import { apiClient } from '@/lib/api';

let section = 'desk';
let role = 'PHARMACIST';
const mockPush = jest.fn();
let mockCounter: Record<string, () => void> = {};
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: (key: string) => (key === 'section' ? section : null) }),
}));
jest.mock('@/components/layout/dashboard-user-context', () => ({
  useDashboardUser: () => ({ user: { id: 'u1', role }, loading: false }),
}));
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('@/components/common/QuickGuide', () => ({ QuickGuide: () => null }));
jest.mock('@/components/pharmacy/PackageBrowser', () => ({ PackageBrowser: () => null }));
jest.mock('@/components/pharmacy/PharmacyPackageCreator', () => ({ PharmacyPackageCreator: () => null }));
jest.mock('@/components/pharmacy/PartnerDailySync', () => ({ PartnerDailySync: () => null }));
jest.mock('@/components/pharmacy/PharmacyCounterCockpit', () => ({
  PharmacyCounterCockpit: (props: Record<string, () => void>) => {
    mockCounter = props;
    return <p>Counter</p>;
  },
}));

const get = apiClient.get as jest.Mock;
const asked = () => get.mock.calls.map(([url]) => url);
const figuresAsked = () => asked().filter((url) => url === '/pharmacy/dashboard').length;

beforeEach(() => {
  mockPush.mockReset();
  get.mockReset();
  get.mockImplementation(async (url: string) => (url === '/pharmacy/dashboard' ? { todaySales: 1240, todayInvoices: 6, totalDrugs: 82 } : { id: 'u1' }));
});

it("shows a pharmacist today's sales on the desk", async () => {
  section = 'desk';
  role = 'PHARMACIST';
  render(<PharmacyWorkspace />);
  expect(await screen.findByText('₹1240.00')).toBeInTheDocument();
  expect(figuresAsked()).toBe(1);
});

const offered = () => ['New sale', 'Invoices', 'Drugs', 'Refresh', 'Pharmacy Counter', 'Inventory Control']
  .filter((name) => screen.queryByRole('button', { name: new RegExp(`^${name}`) }));

it("offers a pharmacist the desk's sale actions", async () => {
  section = 'desk';
  role = 'PHARMACIST';
  render(<PharmacyWorkspace />);
  await screen.findByText('₹1240.00');
  expect(offered()).toEqual(['New sale', 'Invoices', 'Drugs', 'Refresh', 'Pharmacy Counter', 'Inventory Control']);
});

it("never asks for the pharmacy's figures for reception, and offers no sale it would be refused", async () => {
  section = 'desk';
  role = 'RECEPTION';
  render(<PharmacyWorkspace />);
  expect(await screen.findByText('Pharmacy Counter')).toBeInTheDocument();
  await waitFor(() => expect(asked()).toContain('/auth/me'));
  expect(figuresAsked()).toBe(0);
  expect(screen.queryByText('Sales')).toBeNull();
  expect(offered()).toEqual(['Pharmacy Counter', 'Inventory Control']);
});

it('loads no desk figures on the counter, for any role', async () => {
  section = 'counter';
  role = 'PHARMACIST';
  render(<PharmacyWorkspace />);
  expect(await screen.findByText('Counter')).toBeInTheDocument();
  expect([asked().includes('/auth/me'), figuresAsked()]).toEqual([true, 0]);
});

it('sends the counter to Daily Collection and to the stock list the Inventory page reads', async () => {
  section = 'counter';
  render(<PharmacyWorkspace />);
  await screen.findByText('Counter');
  expect(screen.getAllByText('Counter')).toHaveLength(1);
  mockCounter.onOpenDailyCollection();
  mockCounter.onOpenInventoryControl();
  expect(mockPush.mock.calls).toEqual([
    ['/dashboard/pharmacy/reports?report=daily-collection'],
    ['/dashboard/inventory?area=stock&view=list'],
  ]);
});

it('offers Daily close only to roles that can open the Daily Collection report', async () => {
  section = 'counter';
  const handlers: Record<string, boolean> = {};
  for (const next of ['OWNER', 'ADMIN', 'MANAGER', 'DOCTOR', 'PHARMACIST', 'ACCOUNTANT', 'RECEPTION', 'NURSE']) {
    role = next;
    const { unmount } = render(<PharmacyWorkspace />);
    await screen.findByText('Counter');
    handlers[next] = typeof mockCounter.onOpenDailyCollection === 'function';
    unmount();
  }
  expect(handlers).toEqual({ OWNER: true, ADMIN: true, MANAGER: true, DOCTOR: true, PHARMACIST: true, ACCOUNTANT: true, RECEPTION: false, NURSE: false });
});
