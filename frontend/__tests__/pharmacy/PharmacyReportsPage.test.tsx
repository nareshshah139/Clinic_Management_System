import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PharmacyReportsPage } from '@/components/pharmacy/PharmacyReportsPage';

let mockRole = 'PHARMACIST';
let mockLoading = false;
let mockSearch = '';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mockSearch) }));
jest.mock('@/components/layout/dashboard-user-context', () => ({
  useDashboardUser: () => ({ user: mockLoading ? null : { id: 'u', role: mockRole }, loading: mockLoading }),
}));
jest.mock('@/components/pharmacy/ComplianceCenter', () => ({ ComplianceCenter: ({ report }: { report: string }) => <div>compliance:{report}</div> }));
jest.mock('@/components/pharmacy/DayWiseSummaryReport', () => ({ DayWiseSummaryReport: () => <div>day wise report</div> }));
jest.mock('@/components/pharmacy/ItemMarginReport', () => ({ ItemMarginReport: () => <div>item margin report</div> }));

beforeEach(() => {
  mockRole = 'PHARMACIST';
  mockLoading = false;
  mockSearch = '';
});

const rail = () => screen.getByRole('navigation', { name: 'Report categories' });

describe('Pharmacy Report page landing', () => {
  it('lists the categories in order down the left and the most used reports on the page', () => {
    render(<PharmacyReportsPage />);

    const categories = within(rail()).getAllByRole('heading').map((heading) => heading.textContent);
    expect(categories).toEqual(['GST Reports', 'Margin Reports', 'Stock Reports', 'Accounting Reports', 'Others']);

    const mostUsed = screen.getByRole('region', { name: 'Most used' });
    expect(within(mostUsed).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/dashboard/pharmacy/reports?report=gst-summary',
      '/dashboard/pharmacy/reports?report=day-wise-summary',
      '/dashboard/pharmacy/reports?report=item-margin',
      '/dashboard/pharmacy/reports?report=monthly-report',
    ]);
  });

  it('says which reports open in Inventory and links to the register there', () => {
    render(<PharmacyReportsPage />);

    const link = within(rail()).getByRole('link', { name: /Purchase Bills/ });
    expect(link).toHaveAttribute('href', '/dashboard/inventory?area=purchases&view=register');
    expect(within(link).getByLabelText('Opens in Inventory')).toBeInTheDocument();
  });

  it('shows an unknown report id as the landing page', () => {
    mockSearch = 'report=nope';
    render(<PharmacyReportsPage />);

    expect(screen.getByRole('region', { name: 'Most used' })).toBeInTheDocument();
  });

  it('narrows the rail and the page to the search, and says when nothing matches', async () => {
    render(<PharmacyReportsPage />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search reports' }), 'margin');
    expect(within(rail()).getAllByRole('link').map((link) => link.textContent)).toEqual(['Item Wise Margin']);
    expect(screen.getByRole('region', { name: 'Search results' })).toHaveTextContent('1 report matches');

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search reports' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search reports' }), 'zzz');
    expect(within(rail()).getByText('No reports match your search.')).toBeInTheDocument();
  });
});

describe('Pharmacy Report page selection', () => {
  it.each([
    ['gst-summary', 'compliance:gst-summary'],
    ['monthly-report', 'compliance:monthly-report'],
    ['day-wise-summary', 'day wise report'],
    ['item-margin', 'item margin report'],
  ])('opens %s in the page and marks it current in the rail', (id, text) => {
    mockSearch = `report=${id}`;
    render(<PharmacyReportsPage />);

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Most used' })).not.toBeInTheDocument();
    const current = within(rail()).getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.getAttribute('href'))).toEqual([`/dashboard/pharmacy/reports?report=${id}`]);
    expect(screen.getByRole('link', { name: /All reports/ })).toHaveAttribute('href', '/dashboard/pharmacy/reports');
  });
});

describe('Pharmacy Report page access', () => {
  it.each(['OWNER', 'ADMIN', 'ACCOUNTANT', 'PHARMACIST', 'DOCTOR'])('lets %s in', (role) => {
    mockRole = role;
    render(<PharmacyReportsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Pharmacy Report' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['RECEPTION', 'NURSE', 'MANAGER'])('tells %s the role cannot open reports and shows none', (role) => {
    mockRole = role;
    mockSearch = 'report=item-margin';
    render(<PharmacyReportsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Your role cannot open pharmacy reports');
    expect(screen.queryByText('item margin report')).not.toBeInTheDocument();
  });
});
