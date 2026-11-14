import { fireEvent, render, screen, within } from '@testing-library/react';
import { Sidebar } from '@/components/layout/sidebar';

let mockRole = 'PHARMACIST';
let mockPath = '/dashboard';
let mockQuery = '';
const mockPrefetch = jest.fn();
jest.mock('next/navigation', () => ({ usePathname: () => mockPath, useSearchParams: () => new URLSearchParams(mockQuery), useRouter: () => ({ prefetch: mockPrefetch }) }));
jest.mock('@/components/layout/dashboard-user-context', () => ({
  useDashboardUser: () => ({ user: { id: 'u', firstName: 'Asha', lastName: 'Rao', role: mockRole }, logout: jest.fn(), loading: false }),
}));

const pharmacyLinks = () => {
  render(<Sidebar />);
  const links = within(screen.getByRole('navigation', { name: 'Main navigation' })).getAllByRole('link');
  return links.map((link) => link.textContent).filter((name) => ['Pharmacy Desk', 'Pharmacy Counter', 'Pharmacy Billing', 'Sales', 'Inventory', 'Daily Collection', 'Pharmacy Report'].includes(name || ''));
};

it.each(['PHARMACIST', 'DOCTOR', 'ADMIN'])('shows %s every Pharmacy entry, with Sales in place of Pharmacy Billing and Pharmacy Report last', (role) => {
  mockRole = role;
  expect(pharmacyLinks()).toEqual(['Pharmacy Desk', 'Pharmacy Counter', 'Sales', 'Inventory', 'Daily Collection', 'Pharmacy Report']);
});

it('puts Pharmacy Report in the Pharmacy group, apart from the clinical Reports under Admin (decided 05/11/2026)', () => {
  mockRole = 'ADMIN';
  render(<Sidebar />);
  const nav = screen.getByRole('navigation', { name: 'Main navigation' });
  const texts = Array.from(nav.querySelectorAll('p, a')).map((el) => el.textContent);
  expect(texts.indexOf('Pharmacy Report')).toBeGreaterThan(texts.indexOf('Pharmacy'));
  expect(texts.indexOf('Pharmacy Report')).toBeLessThan(texts.indexOf('Admin'));
  expect(within(nav).getByRole('link', { name: 'Pharmacy Report' })).toHaveAttribute('href', '/dashboard/pharmacy/reports');
  expect(within(nav).getByRole('link', { name: 'Reports' })).toHaveAttribute('href', '/dashboard/reports');
});

it.each([
  ['RECEPTION', ['Pharmacy Desk', 'Pharmacy Counter', 'Inventory']],
  ['MANAGER', ['Inventory', 'Daily Collection', 'Pharmacy Report']],
  ['ACCOUNTANT', ['Daily Collection', 'Pharmacy Report']],
  ['NURSE', []],
])('leaves %s with its other Pharmacy entries', (role, expected) => {
  mockRole = role;
  expect(pharmacyLinks()).toEqual(expected);
});

describe('Daily Collection in the main menu', () => {
  afterEach(() => {
    mockPath = '/dashboard';
    mockQuery = '';
  });

  it.each([
    ['OWNER', true], ['ADMIN', true], ['MANAGER', true], ['DOCTOR', true], ['PHARMACIST', true], ['ACCOUNTANT', true],
    ['RECEPTION', false], ['NURSE', false],
  ])('is offered to %s: %s, exactly the roles that can open the report', (role, shown) => {
    mockRole = role as string;
    render(<Sidebar />);
    const link = within(screen.getByRole('navigation', { name: 'Main navigation' })).queryByRole('link', { name: 'Daily Collection' });
    expect(link?.getAttribute('href') ?? null).toBe(shown ? '/dashboard/pharmacy/reports?report=daily-collection' : null);
  });

  it('sits in the Pharmacy group beside Pharmacy Report, not under Overview', () => {
    mockRole = 'ADMIN';
    render(<Sidebar />);
    const texts = Array.from(screen.getByRole('navigation', { name: 'Main navigation' }).querySelectorAll('p, a')).map((el) => el.textContent);
    expect(texts.slice(0, 2)).toEqual(['Overview', 'Dashboard']);
    expect(texts.indexOf('Daily Collection')).toBeGreaterThan(texts.indexOf('Pharmacy'));
    expect(texts.indexOf('Daily Collection')).toBe(texts.indexOf('Pharmacy Report') - 1);
  });

  it('marks Daily Collection, not Pharmacy Report, as the current page on the daily collection report only', () => {
    mockRole = 'DOCTOR';
    mockPath = '/dashboard/pharmacy/reports';
    mockQuery = 'report=daily-collection&from=2026-11-11';
    const { unmount } = render(<Sidebar />);
    const current = () => within(screen.getByRole('navigation', { name: 'Main navigation' })).getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent);
    expect(current()).toEqual(['Daily Collection']);
    unmount();
    mockQuery = 'report=gstr-1';
    render(<Sidebar />);
    expect(current()).toEqual(['Pharmacy Report']);
  });
});

it.each([
  ['OWNER', ['Dashboard', 'Patients', 'Appointments', 'Visits', 'Procedures', 'Rooms', 'Sales', 'Inventory', 'Daily Collection', 'Pharmacy Report', 'Reports', 'Users', 'Fee list']],
  ['MANAGER', ['Dashboard', 'Patients', 'Appointments', 'Visits', 'Procedures', 'Inventory', 'Daily Collection', 'Pharmacy Report', 'Reports', 'Users']],
  ['NURSE', ['Dashboard', 'Patients', 'Appointments', 'Visits', 'Rooms']],
  ['RECEPTION', ['Dashboard', 'Patients', 'Appointments', 'Rooms', 'Pharmacy Desk', 'Pharmacy Counter', 'Inventory']],
  ['ACCOUNTANT', ['Dashboard', 'Daily Collection', 'Pharmacy Report']],
])('gives %s only pages its grants open, so no page refuses it on load', (role, expected) => {
  mockRole = role as string;
  render(<Sidebar />);
  expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getAllByRole('link').map((a) => a.textContent)).toEqual(expected);
});

it('carries the Linaé name instead of a generic product name, and no developer page', () => {
  mockRole = 'OWNER';
  mockPath = '/dashboard';
  mockQuery = '';
  render(<Sidebar />);
  expect(screen.getByRole('img', { name: 'Linaé' })).toHaveAttribute('src', expect.stringContaining('linae-name.png'));
  expect(screen.queryByText(/ClinicMS|Test Transcribe/)).not.toBeInTheDocument();
});

it('fetches a menu route only when the pointer or keyboard reaches its link, not on page load', () => {
  mockRole = 'RECEPTION';
  mockPrefetch.mockClear();
  render(<Sidebar />);
  const nav = screen.getByRole('navigation', { name: 'Main navigation' });
  expect(mockPrefetch.mock.calls).toEqual([]);
  fireEvent.mouseEnter(within(nav).getByRole('link', { name: 'Patients' }));
  fireEvent.focus(within(nav).getByRole('link', { name: 'Appointments' }));
  expect(mockPrefetch.mock.calls).toEqual([['/dashboard/patients'], ['/dashboard/appointments']]);
});
