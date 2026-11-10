import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { apiClient } from '@/lib/api';
import { DataQualityStrip } from './DataQualityStrip';
import { StockOptimization } from './StockOptimization';
import { shelfLifeText } from './stock-optimization-model';
import { sourceBills } from '../purchase/purchase-returns-model';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
const api = apiClient as unknown as Record<'get' | 'post' | 'patch', jest.Mock>;

const row = (name: string, extra: Record<string, unknown> = {}) => ({
  inventoryId: name, name, batchNumber: `${name.slice(0, 3).toUpperCase()}-1`, expiryDate: '2027-01-31', shelfLifeDays: 82, unit: 'TUBES',
  quantity: 20, ptr: 75, gstRate: 18, value: 1500, idleDays: 300, lastSaleAt: null, receivedAt: '2026-01-14T00:00:00Z',
  source: { lineId: `line-${name}`, invoiceId: 'bill-2', invoiceNumber: 'SLV/2026/02', invoiceDate: '2026-06-13' }, openReturn: null, ...extra,
});
const run = (extra: Record<string, unknown> = {}) => ({
  rules: { nonMovingDays: 90, minimumBatchValue: 1500, returnWindowDays: 365 },
  asOf: '2026-11-10T06:30:00.000Z', scanned: 7, slow: 4,
  returnable: [
    {
      gstin: '27AABCS1234F1Z5', name: 'Shree Laxmi Vitality Pharma', value: 4500, belowMinimum: false, draftable: true, blocker: null, openReturns: [],
      supplier: { id: 'slv', name: 'Shree Laxmi Vitality Pharma' },
      rows: [row('Adapalene Gel 15g'), row('Clobetasol Cream 15g', { quantity: 30, ptr: 100, gstRate: 12, value: 3000, shelfLifeDays: 141, expiryDate: '2027-03-31' })],
    },
    {
      gstin: '27AAACA5678B1ZQ', name: 'Apex Medico Distributors', value: 1200, belowMinimum: true, draftable: false, blocker: 'Below ₹1,500, not worth returning', openReturns: [],
      supplier: { id: 'apx', name: 'Apex Medico Distributors' },
      rows: [row('Ketoconazole Shampoo 100ml', { quantity: 10, ptr: 120, gstRate: 12, value: 1200 })],
    },
  ],
  nonReturnable: [
    { gstin: '27AABCS1234F1Z5', name: 'Shree Laxmi Vitality Pharma', value: 750, belowMinimum: false, rows: [row('Calamine Lotion 100ml', { quantity: 15, ptr: 50, gstRate: 12, value: 750, shelfLifeDays: -10, expiryDate: '2026-10-31', source: null })] },
  ],
  totals: { returnable: 5700, nonReturnable: 750 },
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation(async (url: string) =>
    url.endsWith('/stock/gaps') ? { LOCATION: 2, CATEGORY: 0, HSN: 2, MIN_MAX: 252, UNMAPPED: 3 } : { nonMovingDays: 90, minimumBatchValue: 1500, version: 4 },
  );
});

it('shows the five counts, zero calm, and opens the stock list filtered to the pressed gap', async () => {
  const onOpen = jest.fn();
  render(<DataQualityStrip active="HSN" onOpen={onOpen} />);
  const strip = await screen.findByRole('region', { name: 'Data quality' });
  await waitFor(() => expect(within(strip).getByTestId('gap-MIN_MAX')).toHaveTextContent('252'));
  expect(within(strip).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
    'Missing location: 2 batches, no rack or shelf. Show them',
    'Missing category: 0 batches, no category. Show them',
    'Missing HSN code: 2 batches, GST needs it. Show all stock',
    'Missing min/max: 252 batches, no reorder levels. Show them',
    'Unmapped: 3 batches, not linked to a product. Show them',
  ]);
  expect(within(strip).getByRole('button', { name: /Missing category/ }).className).toContain('text-muted-foreground');
  expect(within(strip).getByRole('button', { name: /Unmapped/ }).className).toContain('bg-red-50');
  expect(within(strip).getByRole('button', { name: /Missing location/ }).className).toContain('bg-amber-50');
  fireEvent.click(within(strip).getByRole('button', { name: /Unmapped/ }));
  fireEvent.click(within(strip).getByRole('button', { name: /Missing HSN code/ }));
  expect(onOpen.mock.calls).toEqual([['UNMAPPED'], ['']]);
});

it('lists returnable and non-returnable groups with literal values and flags the group below the minimum', async () => {
  api.post.mockResolvedValue(run());
  render(<StockOptimization canWrite ran onRan={jest.fn()} onDocument={jest.fn()} onReturns={jest.fn()} />);
  const status = await screen.findByText(/Checked 7 batches on the shelf/);
  expect(status.textContent).toContain('4 batches not sold for 90 days.');
  expect(status.textContent).toContain('Returnable ₹5,700.00 · non-returnable ₹750.00, at PTR excluding GST.');
  const slv = screen.getByRole('region', { name: 'Shree Laxmi Vitality Pharma returnable' });
  expect(slv).toHaveTextContent('GSTIN 27AABCS1234F1Z5 · 2 batches · ₹4,500.00 at PTR, excluding GST');
  const rows = within(within(slv).getByRole('table')).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));
  expect(rows).toEqual([
    ['Adapalene Gel 15gBatch ADA-1 · exp 31/01/2027', '2 months (82 days)', '20', '₹75.00', '18%', '₹1,500.00', 'Bill SLV/2026/02 · 13/06/2026Never sold · in stock 300 days'],
    ['Clobetasol Cream 15gBatch CLO-1 · exp 31/03/2027', '4 months (141 days)', '30', '₹100.00', '12%', '₹3,000.00', 'Bill SLV/2026/02 · 13/06/2026Never sold · in stock 300 days'],
  ]);
  expect(within(slv).getByRole('button', { name: 'Create return draft' })).toBeEnabled();
  const apx = screen.getByRole('region', { name: 'Apex Medico Distributors returnable' });
  expect(apx).toHaveTextContent('Below ₹1,500, not worth returning');
  expect(within(apx).queryByRole('button')).toBeNull();
  const kept = screen.getByRole('region', { name: 'Shree Laxmi Vitality Pharma non-returnable' });
  expect(kept).toHaveTextContent('Expired 10 days ago');
  expect(within(kept).queryByRole('button')).toBeNull();
});

it('creates one draft for a double press, then shows the draft and a link to Purchase returns', async () => {
  const drafted = run({
    returnable: [{ ...run().returnable[0], draftable: false, blocker: 'Every batch is already on a return draft', openReturns: [{ id: 'doc-1', reference: 'RET-SO-20261110-AABCS', status: 'DRAFT' }] }],
  });
  api.post.mockImplementation(async (url: string) => (url.endsWith('/return-drafts') ? { id: 'doc-1', reference: 'RET-SO-20261110-AABCS' } : run()));
  const onDocument = jest.fn();
  const onReturns = jest.fn();
  render(<StockOptimization canWrite ran onRan={jest.fn()} onDocument={onDocument} onReturns={onReturns} />);
  const button = await screen.findByRole('button', { name: 'Create return draft' });
  api.post.mockImplementation(async (url: string) => (url.endsWith('/return-drafts') ? { id: 'doc-1', reference: 'RET-SO-20261110-AABCS' } : drafted));
  await act(async () => {
    fireEvent.click(button);
    fireEvent.click(button);
  });
  const drafts = api.post.mock.calls.filter(([url]) => url.endsWith('/return-drafts'));
  expect(drafts).toHaveLength(1);
  expect(drafts[0][1]).toEqual({ distributorGstin: '27AABCS1234F1Z5', requestKey: expect.stringMatching(/^[0-9a-f]{32}$/) });
  const notice = await screen.findByText(/Return draft RET-SO-20261110-AABCS created with batch, PTR and GST filled in/);
  fireEvent.click(within(notice).getByRole('button', { name: 'See it in Purchase bills › Returns' }));
  expect(onReturns).toHaveBeenCalledTimes(1);
  const slv = screen.getByRole('region', { name: 'Shree Laxmi Vitality Pharma returnable' });
  fireEvent.click(within(slv).getByRole('button', { name: 'Open RET-SO-20261110-AABCS (Draft)' }));
  expect(onDocument.mock.calls).toEqual([['SUPPLIER_RETURN', 'doc-1']]);
  expect(within(slv).queryByRole('button', { name: 'Create return draft' })).toBeNull();
});

it('saves 60 non-moving days with the loaded version and runs again', async () => {
  api.post.mockResolvedValue(run());
  api.patch.mockResolvedValue({ nonMovingDays: 60, minimumBatchValue: 1500, version: 5 });
  render(<StockOptimization canWrite ran onRan={jest.fn()} onDocument={jest.fn()} onReturns={jest.fn()} />);
  const days = await screen.findByLabelText('Non-moving days');
  await waitFor(() => expect(days).toHaveValue('90'));
  fireEvent.change(days, { target: { value: '60' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));
  expect(await screen.findByText('Saved: 60 non-moving days, minimum ₹1,500.00.')).toBeInTheDocument();
  expect(api.patch.mock.calls).toEqual([['/inventory/workspace/optimization/rules', { nonMovingDays: '60', minimumBatchValue: '1500', version: 4 }]]);
  await waitFor(() => expect(api.post.mock.calls.filter(([url]) => url.endsWith('/run'))).toHaveLength(2));
});

it('keeps the rules read-only for someone who cannot raise returns', async () => {
  render(<StockOptimization canWrite={false} ran={false} onRan={jest.fn()} onDocument={jest.fn()} onReturns={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Non-moving days')).toHaveValue('90'));
  expect(screen.getByLabelText('Non-moving days')).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Save rules' })).toBeNull();
  expect(api.post).not.toHaveBeenCalled();
});

it('reads shelf life as days when short and months beyond two months', () => {
  expect([shelfLifeText(null), shelfLifeText(-1), shelfLifeText(0), shelfLifeText(51), shelfLifeText(294)]).toEqual([
    'Expiry not recorded', 'Expired 1 day ago', 'Expires today', '51 days', '9 months (294 days)',
  ]);
});

it('names the first source bill of a multi-bill return and counts the rest', () => {
  expect([sourceBills('SLV/2026/112, SLV/2026/087'), sourceBills('NVJ/2026/019')]).toEqual([
    { count: 2, shown: 'SLV/2026/112 +1' },
    { count: 1, shown: 'NVJ/2026/019' },
  ]);
});
