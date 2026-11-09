import { render, screen, within } from '@testing-library/react';
import { Sidebar } from '@/components/layout/sidebar';

let mockRole = 'PHARMACIST';
let mockPath = '/dashboard';
let mockSearch = '';
jest.mock('next/navigation', () => ({ usePathname: () => mockPath, useSearchParams: () => new URLSearchParams(mockSearch) }));
jest.mock('@/components/layout/dashboard-user-context', () => ({
  useDashboardUser: () => ({ user: { id: 'u', firstName: 'Asha', lastName: 'Rao', role: mockRole }, logout: jest.fn(), loading: false }),
}));

const pharmacyLinks = () => {
  render(<Sidebar />);
  const links = within(screen.getByRole('navigation', { name: 'Main navigation' })).getAllByRole('link');
  return links.map((link) => link.textContent).filter((name) => ['Pharmacy Desk', 'Pharmacy Counter', 'Pharmacy Billing', 'Sales', 'Inventory', 'Pharmacy Report'].includes(name || ''));
};

beforeEach(() => {
  mockPath = '/dashboard';
  mockSearch = '';
});

it.each(['PHARMACIST', 'DOCTOR', 'ADMIN'])('shows %s every Pharmacy entry, with Sales in place of Pharmacy Billing', (role) => {
  mockRole = role;
  expect(pharmacyLinks()).toEqual(['Pharmacy Desk', 'Pharmacy Counter', 'Sales', 'Inventory', 'Pharmacy Report']);
});

it.each([
  ['RECEPTION', ['Pharmacy Desk', 'Pharmacy Counter', 'Inventory']],
  ['MANAGER', ['Inventory']],
  ['NURSE', []],
])('leaves %s with its other Pharmacy entries', (role, expected) => {
  mockRole = role;
  expect(pharmacyLinks()).toEqual(expected);
});

it.each([
  ['OWNER', ['Sales', 'Inventory', 'Pharmacy Report']],
  ['ACCOUNTANT', ['Pharmacy Report']],
])('gives %s the Pharmacy Report entry the old inventory report tasks allowed', (role, expected) => {
  mockRole = role;
  expect(pharmacyLinks()).toEqual(expected);
});

const activeLinks = (path: string, search = '') => {
  mockRole = 'PHARMACIST';
  mockPath = path;
  mockSearch = search;
  render(<Sidebar />);
  return within(screen.getByRole('navigation', { name: 'Main navigation' }))
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'page')
    .map((link) => link.textContent);
};

it('lights up only Pharmacy Report on the report page, not Pharmacy Desk or Sales', () => {
  expect(activeLinks('/dashboard/pharmacy/reports', 'report=item-margin')).toEqual(['Pharmacy Report']);
});

it('keeps Pharmacy Desk active on its own page and does not light up Pharmacy Report', () => {
  expect(activeLinks('/dashboard/pharmacy', 'section=desk')).toEqual(['Pharmacy Desk']);
});
