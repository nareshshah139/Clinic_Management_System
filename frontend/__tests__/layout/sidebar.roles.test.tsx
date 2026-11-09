import { render, screen, within } from '@testing-library/react';
import { Sidebar } from '@/components/layout/sidebar';

let mockRole = 'PHARMACIST';
jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useSearchParams: () => new URLSearchParams() }));
jest.mock('@/components/layout/dashboard-user-context', () => ({
  useDashboardUser: () => ({ user: { id: 'u', firstName: 'Asha', lastName: 'Rao', role: mockRole }, logout: jest.fn(), loading: false }),
}));

const pharmacyLinks = () => {
  render(<Sidebar />);
  const links = within(screen.getByRole('navigation', { name: 'Main navigation' })).getAllByRole('link');
  return links.map((link) => link.textContent).filter((name) => ['Pharmacy Desk', 'Pharmacy Counter', 'Pharmacy Billing', 'Sales', 'Inventory', 'Pharmacy Report'].includes(name || ''));
};

it.each(['PHARMACIST', 'DOCTOR', 'ADMIN'])('shows %s every Pharmacy entry, with Sales in place of Pharmacy Billing and Pharmacy Report last', (role) => {
  mockRole = role;
  expect(pharmacyLinks()).toEqual(['Pharmacy Desk', 'Pharmacy Counter', 'Sales', 'Inventory', 'Pharmacy Report']);
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
  ['MANAGER', ['Inventory', 'Pharmacy Report']],
  ['ACCOUNTANT', ['Pharmacy Report']],
  ['NURSE', []],
])('leaves %s with its other Pharmacy entries', (role, expected) => {
  mockRole = role;
  expect(pharmacyLinks()).toEqual(expected);
});
