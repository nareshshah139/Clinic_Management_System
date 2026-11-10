import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemMarginReport } from '@/components/pharmacy/ItemMarginReport';
import { apiClient } from '@/lib/api';

let mockSearch = '';
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/dashboard/pharmacy/reports',
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn() } }));

const get = apiClient.get as jest.Mock;

const row = (name: string, overrides: Record<string, unknown> = {}) => ({
  key: name, name, category: 'Acne', unitLabel: '15 g', manufacturer: 'Galderma', stock: 10, mrp: 118, itemId: `id-${name}`,
  tags: ['Retinoid'], itemType: 'MEDICINE', saleQuantity: 2, averageSalePrice: 112, salesAmount: 224, purchase: 190.4, netGst: 3.6,
  profit: 30, profitPercent: 15, knownTaxableSales: 200, unknownCost: { lineCount: 0, quantity: 0, salesAmount: 0 }, ...overrides,
});

const report = (rows = [row('Adapalene Gel')], overrides: Record<string, unknown> = {}) => ({
  period: { startDate: '2026-11-01', endDate: '2026-11-30', timeZone: 'Asia/Kolkata' },
  search: null,
  options: { tags: ['Acne', 'Retinoid'], categories: ['Acne', 'Sun Care'], manufacturers: ['Derma Co', 'Galderma'], itemTypes: ['MEDICINE', 'SUPPLY'] },
  rows,
  totals: { salesAmount: 224, purchase: 190.4, netGst: 3.6, profit: 30, profitPercent: 15, itemCount: rows.length, unknownCost: { lineCount: 0, itemCount: 0, salesAmount: 0 } },
  ...overrides,
});

const lastQuery = () => get.mock.calls[get.mock.calls.length - 1][1];

beforeEach(() => {
  mockSearch = 'from=2026-11-01&to=2026-11-30';
  replace.mockReset();
  get.mockReset();
  get.mockResolvedValue(report());
});

describe('ItemMarginReport controls', () => {
  it('shows Type, Tags, the search-field selector and More Filters, with net sales as the default', async () => {
    render(<ItemMarginReport />);
    await screen.findByRole('table', { name: 'Item-wise margin' });

    expect(screen.getByLabelText('Type')).toHaveValue('NET');
    expect(within(screen.getByLabelText('Type')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Net sales', 'Sales only', 'Returns only']);
    expect(within(screen.getByLabelText('Tags')).getAllByRole('option').map((o) => o.textContent)).toEqual(['All tags', 'Acne', 'Retinoid']);
    expect(within(screen.getByLabelText('Search in')).getAllByRole('option').map((o) => o.textContent)).toEqual(['All fields', 'Item name', 'Category', 'Manufacturer']);
    expect(screen.getByRole('button', { name: 'More Filters' })).toBeInTheDocument();
    expect(lastQuery()).toMatchObject({ startDate: '2026-11-01', endDate: '2026-11-30', type: 'NET', searchField: 'ALL', costStatus: 'ALL' });
  });

  it('puts the chosen filters in the URL when Go is pressed', async () => {
    render(<ItemMarginReport />);
    await screen.findByRole('table', { name: 'Item-wise margin' });

    await userEvent.selectOptions(screen.getByLabelText('Type'), 'RETURNS');
    await userEvent.selectOptions(screen.getByLabelText('Tags'), 'Retinoid');
    await userEvent.selectOptions(screen.getByLabelText('Search in'), 'MANUFACTURER');
    await userEvent.type(screen.getByLabelText('Search'), 'galderma');
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));

    expect(replace).toHaveBeenCalledTimes(1);
    const url = new URL(replace.mock.calls[0][0], 'http://x');
    expect(url.pathname).toBe('/dashboard/pharmacy/reports');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      from: '2026-11-01', to: '2026-11-30', type: 'RETURNS', tag: 'Retinoid', field: 'MANUFACTURER', q: 'galderma',
    });
  });

  it('reads the filters back from the URL and sends them to the API', async () => {
    mockSearch = 'from=2026-11-01&to=2026-11-30&type=SALES&tag=Acne&field=NAME&q=gel&category=Acne&cost=LOSS';
    render(<ItemMarginReport />);
    await screen.findByRole('table', { name: 'Item-wise margin' });

    expect(lastQuery()).toEqual({
      startDate: '2026-11-01', endDate: '2026-11-30', type: 'SALES', searchField: 'NAME', costStatus: 'LOSS', search: 'gel', tag: 'Acne', category: 'Acne',
    });
    expect(screen.getByLabelText('Type')).toHaveValue('SALES');
    expect(screen.getByLabelText('Search')).toHaveValue('gel');
  });
});

describe('More Filters', () => {
  it('counts the active filters in its button and offers the period options', async () => {
    mockSearch = 'from=2026-11-01&to=2026-11-30&category=Acne&cost=MISSING_COST&tag=Acne';
    render(<ItemMarginReport />);
    await screen.findByRole('table', { name: 'Item-wise margin' });

    const button = screen.getByRole('button', { name: 'More Filters (2)' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByLabelText('Manufacturer')).getAllByRole('option').map((o) => o.textContent)).toEqual(['All manufacturers', 'Derma Co', 'Galderma']);
    expect(within(screen.getByLabelText('Item type')).getAllByRole('option').map((o) => o.textContent)).toEqual(['All types', 'Medicine', 'Supply']);
    expect(screen.getByLabelText('Cost status')).toHaveValue('MISSING_COST');
  });

  it('clears every filter and goes back to the plain report', async () => {
    mockSearch = 'from=2026-11-01&to=2026-11-30&category=Acne&type=SALES&q=gel';
    render(<ItemMarginReport />);
    await screen.findByRole('table', { name: 'Item-wise margin' });

    await userEvent.click(screen.getByRole('button', { name: 'More Filters (1)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(Object.fromEntries(new URL(replace.mock.calls[0][0], 'http://x').searchParams)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });
});

describe('results', () => {
  it('links each item back to this report with its filters', async () => {
    mockSearch = 'from=2026-11-01&to=2026-11-30&report=item-margin&type=SALES';
    render(<ItemMarginReport />);

    const link = await screen.findByRole('link', { name: 'Adapalene Gel' });
    const target = new URL(link.getAttribute('href')!, 'http://x');
    expect(target.searchParams.get('item')).toBe('id-Adapalene Gel');
    expect(target.searchParams.get('return')).toBe('/dashboard/pharmacy/reports?from=2026-11-01&to=2026-11-30&report=item-margin&type=SALES');
  });

  it('names the active filters when nothing matches', async () => {
    mockSearch = 'from=2026-11-01&to=2026-11-30&type=RETURNS&category=Itch';
    get.mockResolvedValue(report([]));
    render(<ItemMarginReport />);

    expect(await screen.findByText('No items match these filters')).toBeInTheDocument();
    expect(screen.getByText(/matches type Returns only, category Itch/)).toBeInTheDocument();
  });

  it('carries the active filters into every download format', async () => {
    mockSearch = 'report=item-margin&from=2026-11-01&to=2026-11-30&type=RETURNS&tag=Retinoid&cost=LOSS&q=gel&field=NAME';
    render(<ItemMarginReport />);
    await screen.findByRole('table', { name: 'Item-wise margin' });

    await userEvent.click(screen.getByRole('button', { name: /Download/ }));

    const links = await screen.findAllByRole('menuitem');
    expect(links.map(link => [link.textContent, link.getAttribute('href')])).toEqual(['xlsx', 'csv', 'pdf'].map(format => [
      expect.any(String),
      `/api/pharmacy/reports/item-margin?marginType=RETURNS&field=NAME&tag=Retinoid&cost=LOSS&from=2026-11-01&to=2026-11-30&q=gel&format=${format}`,
    ]));
  });

  it('shows tiles that add up the visible rows', async () => {
    get.mockResolvedValue(report([row('A', { salesAmount: 100 }), row('B', { salesAmount: 50 })], { totals: { salesAmount: 150, purchase: 0, netGst: 0, profit: 0, profitPercent: 0, itemCount: 2, unknownCost: { lineCount: 0, itemCount: 0, salesAmount: 0 } } }));
    render(<ItemMarginReport />);
    await screen.findByRole('table', { name: 'Item-wise margin' });

    expect(screen.getByText('Total Sale Amount').closest('div')).toHaveTextContent('₹150.00');
  });
});
