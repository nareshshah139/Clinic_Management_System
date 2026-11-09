import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { InventoryItemPage } from '@/components/inventory/InventoryItemPage';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() } }));
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { id: 'u', branchId: 'clinic', role: 'PHARMACIST' } }) }));

const batch = (id: string, overrides: any = {}) => ({
  id, name: 'Dolo 650', productName: 'Dolo 650 Tablet', batchNumber: id.toUpperCase(), unit: 'STRIPS', currentStock: 0, heldStock: 0, available: 0,
  expiryDate: '2028-05-31T23:59:59.999Z', status: 'ACTIVE', mrp: 30, costPrice: 20, margin: 33.33, gstRate: 12, metadata: {}, drugs: [{ id: 'dolo' }],
  manufacturer: 'Micro Labs', packLabel: '15 tablets', hsnCode: null, barcode: '8901234567890', category: 'Analgesic', storageLocation: null,
  minStockLevel: 5, maxStockLevel: null, requiresPrescription: true, issues: [], updatedAt: '2026-11-01T00:00:00.000Z',
  purchaseDiscountPercent: null, deletable: false, deleteBlockedReason: null, ...overrides,
});
const opened = batch('b1', { currentStock: 7, heldStock: 2, available: 5, purchaseDiscountPercent: 10, deletable: false, deleteBlockedReason: 'Dispose or return remaining stock before deleting a batch', metadata: { landingCostPerStockUnit: 18.5 } });
const sibling = batch('b2', { currentStock: 3, available: 3, mrp: null, deletable: false, deleteBlockedReason: 'Dispose or return remaining stock before deleting a batch' });
const empty = batch('b3', { deletable: true });
const ledgerRow = (id: string, batchId: string, at: string, kind: string, delta: number, batchClosing: number, itemClosing: number, extra: any = {}) => ({
  id, at, batchId, batchNumber: batchId.toUpperCase(), kind, channel: kind === 'SALE' ? 'PHARMACY_BILL' : 'PURCHASE_INVOICE',
  channelLabel: kind === 'SALE' ? 'Pharmacy bill' : 'Purchase invoice', reference: `REF-${id}`, document: null, counterparty: kind === 'SALE' ? 'Walk-in' : 'Sun Distributors',
  actor: { id: 'u', name: 'Asha Rao' }, reason: null, delta, in: delta > 0 ? delta : null, out: delta < 0 ? -delta : null, batchClosing, itemClosing,
  chainBreak: null, owner: null, correctionAllowed: true, ...extra,
});
const payload = {
  item: opened,
  batches: [opened, sibling, empty],
  product: { batchIds: ['b1', 'b2', 'b3'], physical: 10, held: 2, available: 8 },
  itemLedger: {
    closing: 8, currentStock: 10, matches: false,
    batches: [{ batchId: 'b1', closing: 7, currentStock: 7, matches: true }, { batchId: 'b2', closing: 1, currentStock: 3, matches: false }, { batchId: 'b3', closing: 0, currentStock: 0, matches: true }],
    rows: [
      ledgerRow('m1', 'b1', '2026-10-01T05:00:00.000Z', 'PURCHASE', 10, 10, 10),
      ledgerRow('m2', 'b2', '2026-10-02T05:00:00.000Z', 'PURCHASE', 4, 4, 14),
      ledgerRow('m3', 'b1', '2026-10-03T05:00:00.000Z', 'SALE', -3, 7, 11),
      ledgerRow('m4', 'b2', '2026-10-04T05:00:00.000Z', 'SALE', -3, 1, 8, { chainBreak: { expected: 4, recorded: 6 } }),
    ],
  },
  history: [], purchases: [], holds: [], identityBasis: 'One linked product identity, stock unit and exact pack', ledger: { status: 'UNVERIFIED', checkpoint: null },
};
const caps = { itemWrite: true, itemDelete: true, approve: false, kinds: { COUNT: { write: true } } };
const renderPage = (query: Record<string, string> = {}, navigate = jest.fn()) => {
  render(<InventoryItemPage itemId="b1" query={query} navigate={navigate} capabilities={caps} onTask={jest.fn()} onDocument={jest.fn()} onInvoice={jest.fn()} />);
  return navigate;
};
beforeEach(() => { jest.clearAllMocks(); sessionStorage.clear(); (apiClient.get as jest.Mock).mockResolvedValue(payload); });

it('shows the item header with stock across batches and marks missing master data', async () => {
  const navigate = renderPage();
  expect(await screen.findByRole('heading', { name: 'Dolo 650 Tablet' })).toBeInTheDocument();
  const stock = screen.getByRole('button', { name: /^Current stock/ });
  expect(stock).toHaveTextContent('Current stock10 STRIPS2 held · 8 available');
  const details = screen.getByLabelText('Item details');
  const value = (label: string) => within(details).getByText(label).nextElementSibling!.textContent;
  expect([value('Std. MRP'), value('GST %'), value('HSN'), value('GTIN (barcode)'), value('Schedule'), value('Location'), value('Min qty'), value('Max qty'), value('Margin %')])
    .toEqual(['₹30.00', '12%', 'Not set', '8901234567890', 'Rx required', 'Not set', '5 STRIPS', 'Not set', '33.33%']);
  fireEvent.click(screen.getByRole('button', { name: 'Micro Labs' }));
  expect(navigate).toHaveBeenCalledWith({ item: '', itemTab: '', search: '', manufacturer: 'Micro Labs', page: '1' });
  fireEvent.click(stock);
  expect(navigate).toHaveBeenCalledWith({ itemTab: '' });
});

it('lists every batch with prices, totals and the reason a batch cannot be deleted', async () => {
  renderPage();
  const table = (await screen.findByRole('columnheader', { name: 'Total by PTR' })).closest('table')!;
  expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(
    ['Batch no.', 'Qty', 'Expiry', 'MRP', 'PTR', 'Discount %', 'Landing price', 'Margin %', 'Total by MRP', 'Total by PTR', 'GST %', 'Actions']);
  const b1 = within(table).getByRole('rowheader', { name: /B1/ }).closest('tr')!;
  expect(b1).toHaveTextContent('Current / on hand');
  expect(b1).toHaveTextContent('7 STRIPS(2 held)');
  expect(b1).toHaveTextContent('10%');
  expect(b1).toHaveTextContent('₹18.50');
  expect(b1).toHaveTextContent('₹210.00');
  expect(b1).toHaveTextContent('₹140.00');
  const total = within(table).getByRole('rowheader', { name: 'Total' }).closest('tr')!;
  expect(total).toHaveTextContent('10 STRIPS');
  expect(total).toHaveTextContent('₹210.001 without MRP');
  expect(total).toHaveTextContent('₹200.00');
  expect(within(b1).getByRole('button', { name: 'Delete' })).toBeDisabled();
  expect(within(b1).getByRole('button', { name: 'Delete' })).toHaveAccessibleDescription('Dispose or return remaining stock before deleting a batch');
  fireEvent.click(screen.getByLabelText('Hide zero quantity'));
  expect(within(table).queryByRole('rowheader', { name: /B3/ })).toBeNull();
});

it('deletes an empty sibling batch only after confirmation and reloads the item', async () => {
  (apiClient.delete as jest.Mock).mockResolvedValue({});
  renderPage();
  const b3 = (await screen.findByRole('rowheader', { name: /B3/ })).closest('tr')!;
  fireEvent.click(within(b3).getByRole('button', { name: 'Delete' }));
  expect(apiClient.delete).not.toHaveBeenCalled();
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete batch' }));
  await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith('/inventory/items/b3'));
  await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
});

it('opens a sibling after deleting the opened batch', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({ ...payload, item: empty, batches: [opened, empty] });
  (apiClient.delete as jest.Mock).mockResolvedValue({});
  const navigate = renderPage();
  const b3 = (await screen.findByRole('rowheader', { name: /B3/ })).closest('tr')!;
  fireEvent.click(within(b3).getByRole('button', { name: 'Delete' }));
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete batch' }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith({ item: 'b1' }));
});

it('runs the ledger across both batches, flags the out-of-ledger change and filters without recomputing closings', async () => {
  renderPage({ itemTab: 'ledger' });
  expect(await screen.findByText('Ledger closes at 8 STRIPS; stock on hand is 10 STRIPS.')).toBeInTheDocument();
  expect(screen.getByText(/1 entry shows stock that changed without a ledger entry/)).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Batch B2: ledger closes at 1 STRIPS; on hand 3 STRIPS.');
  const rows = () => [...document.querySelectorAll('tr[data-ledger-row]')].map(tr => {
    const cells = [...tr.querySelectorAll('td')].map(td => td.textContent);
    return [cells[3], cells[4], cells[5], cells[6], cells[7], cells[8]];
  });
  expect(rows()).toEqual([
    ['B1', '10', '', '10', '10', 'Sun Distributors'],
    ['B2', '4', '', '4', '14', 'Sun Distributors'],
    ['B1', '', '3', '7', '11', 'Walk-in'],
    ['B2', '', '3', '1', '8', 'Walk-in'],
  ]);
  expect(screen.getByText('Stock was 6 before this entry; the ledger expected 4. 2 units changed without a ledger entry.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'SALE' } });
  expect(rows()).toEqual([['B1', '', '3', '7', '11', 'Walk-in'], ['B2', '', '3', '1', '8', 'Walk-in']]);
  expect(screen.getByText(/Showing 2 of 4 entries/)).toBeInTheDocument();
});

it('keeps the selected tab in the URL with tab semantics', async () => {
  const navigate = renderPage({ itemTab: 'sales' });
  const sales = await screen.findByRole('tab', { name: 'Sales' });
  expect(sales).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Sales');
  expect(document.querySelectorAll('tr[data-ledger-row]')).toHaveLength(2);
  fireEvent.keyDown(sales, { key: 'ArrowRight' });
  expect(navigate).toHaveBeenCalledWith({ itemTab: 'sales-returns' });
});

it('edits the chosen batch and saves it to that batch', async () => {
  (apiClient.patch as jest.Mock).mockResolvedValue({});
  renderPage();
  const b2 = (await screen.findByRole('rowheader', { name: /B2/ })).closest('tr')!;
  fireEvent.click(within(b2).getByRole('button', { name: 'Edit' }));
  expect(screen.getByText('Editing batch B2')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Rack / shelf'), { target: { value: 'R2' } });
  fireEvent.change(screen.getByLabelText('Why are you changing it?'), { target: { value: 'Moved shelf' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save corrected details' }));
  await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/inventory/workspace/stock/b2', expect.objectContaining({ storageLocation: 'R2', reason: 'Moved shelf' })));
});

it('opens the editor on the minimum stock field for a stock alert', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Set stock alert' }));
  expect(screen.getByLabelText('Minimum stock')).toHaveFocus();
});
