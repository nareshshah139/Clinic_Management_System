import React from 'react';
import { act, render } from '@testing-library/react';
import { Header } from './header';

const getSystemAlerts = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
// Stable references: the alerts effect depends on `user`, so a fresh object per render would re-run it forever.
const dashboardUser = { user: { id: 'u1', role: 'RECEPTIONIST' }, loading: false, refresh: jest.fn() };
const toastApi = { toast: jest.fn() };
jest.mock('./dashboard-user-context', () => ({ useDashboardUser: () => dashboardUser }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => toastApi }));
jest.mock('./global-search', () => ({ GlobalSearch: () => null }));
jest.mock('./colour-theme-setting', () => ({ ColourThemeSetting: () => null }));
jest.mock('@/components/issue-report/ReportIssueButton', () => ({ ReportIssueButton: () => null }));
jest.mock('@/lib/api', () => ({
  apiClient: { getSystemAlerts: (...args: unknown[]) => getSystemAlerts(...args) },
}));

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

const tick = async (ms: number) => {
  act(() => { jest.advanceTimersByTime(ms); });
  await act(async () => { await Promise.resolve(); });
};

describe('Header alerts polling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    getSystemAlerts.mockReset().mockResolvedValue({});
    setVisibility('visible');
  });
  afterEach(() => {
    jest.useRealTimers();
    setVisibility('visible');
  });

  it('polls every minute while the tab is visible', async () => {
    render(<Header />);
    await tick(0);
    expect(getSystemAlerts).toHaveBeenCalledTimes(1);
    await tick(60_000);
    expect(getSystemAlerts).toHaveBeenCalledTimes(2);
  });

  it('does not poll while the tab is hidden', async () => {
    render(<Header />);
    await tick(0);
    setVisibility('hidden');
    await tick(180_000);
    expect(getSystemAlerts).toHaveBeenCalledTimes(1);
  });

  it('refreshes once when the tab becomes visible again', async () => {
    render(<Header />);
    await tick(0);
    setVisibility('hidden');
    await tick(180_000);
    setVisibility('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(getSystemAlerts).toHaveBeenCalledTimes(2);
  });
});
