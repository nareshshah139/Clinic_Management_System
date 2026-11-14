import { render, screen } from '@testing-library/react';
import { DashboardLayout } from './dashboard-layout';
import { useDashboardUser } from './dashboard-user-context';
import { apiClient } from '@/lib/api';

const mockRouter = { replace: jest.fn(), push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('./sidebar', () => ({ Sidebar: () => null }));
jest.mock('./header', () => ({ Header: () => null }));
jest.mock('@/lib/analytics', () => ({ AnalyticsMount: () => null }));
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), logout: jest.fn() } }));

const get = apiClient.get as jest.Mock;

function Who() {
  const { user, loading } = useDashboardUser();
  return <p>{loading ? 'loading' : `${user?.role} ${user?.firstName || 'no name'}`}</p>;
}

beforeEach(() => get.mockReset());

it('asks for the full profile of a clinic staff member', async () => {
  get.mockImplementation(async (url: string) => (url === '/auth/me' ? { id: 'u1', role: 'RECEPTION' } : { id: 'u1', firstName: 'Sunita', role: 'RECEPTION' }));
  render(<DashboardLayout><Who /></DashboardLayout>);

  expect(await screen.findByText('RECEPTION Sunita')).toBeInTheDocument();
  expect(get.mock.calls.map((call) => call[0])).toEqual(['/auth/me', '/users/u1']);
});

it('never asks for the profile a lab technician would be refused', async () => {
  get.mockResolvedValue({ id: 'u2', role: 'LAB_TECH' });
  render(<DashboardLayout><Who /></DashboardLayout>);

  expect(await screen.findByText('LAB_TECH no name')).toBeInTheDocument();
  expect(get.mock.calls.map((call) => call[0])).toEqual(['/auth/me']);
});
