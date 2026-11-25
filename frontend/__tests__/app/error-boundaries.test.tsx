import { fireEvent, render, screen } from '@testing-library/react';
import RootError from '@/app/error';
import GlobalError from '@/app/global-error';
import NotFound from '@/app/not-found';
import DashboardError from '@/app/dashboard/error';

const openReport = jest.fn();
jest.mock('@/components/issue-report/ReportIssueProvider', () => ({
  useReportIssue: () => ({ enabled: true, openReport }),
}));

const crash = Object.assign(new Error('Cannot read properties of undefined (reading "map")'), { digest: '2417885391' });

describe('error and not-found screens', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('offers a way back to the dashboard from a missing page', () => {
    render(<NotFound />);

    expect(screen.getByRole('heading', { name: "We can't find that page" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute('href', '/dashboard');
  });

  it('lets staff retry or leave when a page outside the dashboard crashes, without the raw error', () => {
    const reset = jest.fn();
    render(<RootError error={crash} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByText('Reference: 2417885391')).toBeInTheDocument();
    expect(screen.queryByText(/Cannot read properties/)).not.toBeInTheDocument();
  });

  it('gives a crashed dashboard page a way back to the dashboard as well as retry and report', () => {
    render(<DashboardError error={crash} reset={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Report this problem' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute('href', '/dashboard');
  });

  it('renders a whole page with a way out when the app shell itself fails', () => {
    const { renderToStaticMarkup } = jest.requireActual<typeof import('react-dom/server')>('react-dom/server.node');
    const html = renderToStaticMarkup(<GlobalError error={crash} reset={jest.fn()} />);

    expect(html).toMatch(/^<html lang="en"/);
    expect(html).toContain('Try again');
    expect(html).toMatch(/<a[^>]*href="\/dashboard"[^>]*>Go to dashboard<\/a>/);
    expect(html).not.toContain('Cannot read properties');
  });
});
