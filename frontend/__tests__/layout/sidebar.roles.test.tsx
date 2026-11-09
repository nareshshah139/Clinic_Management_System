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
  return links.map((link) => link.textContent).filter((name) => ['Pharmacy Desk', 'Pharmacy Counter', 'Pharmacy Billing', 'Sales', 'Inventory'].includes(name || ''));
};

it.each(['PHARMACIST', 'DOCTOR', 'ADMIN'])('shows %s every Pharmacy entry', (role) => {
  mockRole = role;
  expect(pharmacyLinks()).toEqual(['Pharmacy Desk', 'Pharmacy Counter', 'Pharmacy Billing', 'Sales', 'Inventory']);
});

it.each([
  ['RECEPTION', ['Pharmacy Desk', 'Pharmacy Counter', 'Pharmacy Billing', 'Inventory']],
  ['MANAGER', ['Inventory']],
  ['NURSE', []],
])('leaves %s with the Pharmacy entries it already had', (role, expected) => {
  mockRole = role;
  expect(pharmacyLinks()).toEqual(expected);
});
