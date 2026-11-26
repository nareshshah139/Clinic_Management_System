import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { apiClient } from '@/lib/api';

const replace = jest.fn();
const router = { replace };
jest.mock('next/navigation', () => ({ useRouter: () => router }));
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), logout: jest.fn() } }));
jest.mock('@/components/layout/sidebar', () => ({ Sidebar: () => null }));
jest.mock('@/components/layout/header', () => ({ Header: () => null }));
jest.mock('@/components/layout/mobile-navigation', () => ({ MobileNavigation: () => null }));
jest.mock('@/components/layout/offline-banner', () => ({ OfflineBanner: () => null }));
jest.mock('@/components/voice/VoiceBar', () => ({ VoiceBar: () => null }));
jest.mock('@/components/voice/VoiceBarProvider', () => ({ VoiceBarProvider: ({ children }: { children: ReactNode }) => children }));
jest.mock('@/components/issue-report/ReportIssueProvider', () => ({ ReportIssueProvider: ({ children }: { children: ReactNode }) => children }));
jest.mock('@/components/auth/SessionExpiredDialog', () => ({ SessionExpiredDialog: () => null }));
jest.mock('@/lib/analytics', () => ({ AnalyticsMount: () => null }));

const get = apiClient.get as jest.Mock;
const asked = () => get.mock.calls.map(([url]) => url);
const apiError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

function Page() {
  const { user, loading } = useDashboardUser();
  if (loading) return <p>loading</p>;
  return <p>{user ? `${user.role} ${user.id} ${user.firstName}` : 'nobody'}</p>;
}

beforeEach(() => {
  get.mockReset();
  replace.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

it('gives pages the full profile after one request', async () => {
  get.mockResolvedValue({ id: 'u1', role: 'DOCTOR', firstName: 'Priya' });

  render(<DashboardLayout><Page /></DashboardLayout>);

  expect(await screen.findByText('DOCTOR u1 Priya')).toBeInTheDocument();
  expect(asked()).toEqual(['/users/me']);
});

it('falls back to the minimal identity when the profile is refused', async () => {
  get.mockImplementation(async (url: string) => {
    if (url === '/users/me') throw apiError(403);
    return { id: 'u2', role: 'LAB_TECH', branchId: 'b1' };
  });

  render(<DashboardLayout><Page /></DashboardLayout>);

  expect(await screen.findByText('LAB_TECH u2')).toBeInTheDocument();
  expect(asked()).toEqual(['/users/me', '/auth/me']);
});

it('sends an expired session to login without asking again', async () => {
  get.mockRejectedValue(apiError(401));

  render(<DashboardLayout><Page /></DashboardLayout>);

  await screen.findByText('nobody');
  expect(replace).toHaveBeenCalledWith('/login');
  expect(asked()).toEqual(['/users/me']);
});
