import { render, screen, waitFor } from '@testing-library/react';
import { PharmacyWorkspace } from './pharmacy-workspace';
import { apiClient } from '@/lib/api';

let section = 'desk';
let role = 'PHARMACIST';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
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
  PharmacyCounterCockpit: ({ onOpenBilling }: { onOpenBilling?: () => void }) => (
    <section aria-label="Counter cockpit">{onOpenBilling && <button onClick={() => onOpenBilling()}>New bill</button>}</section>
  ),
}));

const get = apiClient.get as jest.Mock;
const asked = () => get.mock.calls.map(([url]) => url);
const figuresAsked = () => asked().filter((url) => url === '/pharmacy/dashboard').length;

beforeEach(() => {
  get.mockReset();
  get.mockImplementation(async (url: string) => (url === '/pharmacy/dashboard' ? { todaySales: 1240, todayInvoices: 6, totalDrugs: 0, lowStockDrugs: 4 } : { id: 'u1' }));
});

it("shows a pharmacist today's sales on the desk", async () => {
  section = 'desk';
  role = 'PHARMACIST';
  render(<PharmacyWorkspace />);
  expect(await screen.findByText('₹1240.00')).toBeInTheDocument();
  expect(figuresAsked()).toBe(1);
});

it('counts low stock on the desk with its definition, not the drug master total', async () => {
  section = 'desk';
  role = 'PHARMACIST';
  render(<PharmacyWorkspace />);
  const lowStock = (await screen.findByText('Low stock')).parentElement as HTMLElement;
  expect(lowStock).toHaveTextContent(/^Low stock4at or below minimum stock$/);
  expect(screen.queryByText('Stock')).toBeNull();
});

const offered = () => ['New sale', 'New bill', 'Invoices', 'Drugs', 'Refresh', 'Pharmacy Counter', 'Inventory Control']
  .filter((name) => screen.queryByRole('button', { name: new RegExp(`^${name}`) }));

it("offers a pharmacist the desk's sale actions", async () => {
  section = 'desk';
  role = 'PHARMACIST';
  render(<PharmacyWorkspace />);
  await screen.findByText('₹1240.00');
  expect(offered()).toEqual(['Invoices', 'Drugs', 'Refresh', 'Pharmacy Counter', 'Inventory Control']);
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
  expect(await screen.findByRole('region', { name: 'Counter cockpit' })).toBeInTheDocument();
  expect([asked().includes('/auth/me'), figuresAsked()]).toEqual([true, 0]);
});

it.each([
  ['PHARMACIST', ['New bill']],
  ['RECEPTION', []],
])('offers %s a walk-in New bill on the counter only when it can sell', async (who, expected) => {
  section = 'counter';
  role = who;
  render(<PharmacyWorkspace />);
  await screen.findByRole('region', { name: 'Counter cockpit' });
  expect(offered()).toEqual(expected);
});
