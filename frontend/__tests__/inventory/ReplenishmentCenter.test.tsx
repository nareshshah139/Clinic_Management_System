import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReplenishmentCenter } from '@/components/inventory/ReplenishmentCenter';
import { apiClient } from '@/lib/api';
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
const props = { caps: { approve: true, settings: true, kinds: { TARGET_REVIEW: { read: true, write: true }, PURCHASE_ORDER: { read: true, write: true }, SHORTBOOK: { read: true, write: true }, INWARD_CHALLAN: { read: true, write: true } } }, onOpen: jest.fn(), onCreate: jest.fn(), onReceive: jest.fn() };
const doc = { id: 'proposal', reference: 'TARGET-TEST', version: 3, status: 'DRAFT', createdAt: '2026-09-14', payload: { calculation: { model: 'observed-demand-cover-v2', items: { a: { salesUnits: 6, available: 2 }, b: { salesUnits: 3, available: 1 } } }, lines: [{ id: 'line-a', inventoryId: 'a', name: 'Item A', unit: 'PIECES', beforeMin: 2, beforeMax: 8, minStockLevel: 4, maxStockLevel: 12 }, { id: 'line-b', inventoryId: 'b', name: 'Item B', unit: 'PIECES', beforeMin: 1, beforeMax: 4, minStockLevel: 2, maxStockLevel: 6 }] } };
beforeEach(() => { jest.clearAllMocks(); (apiClient.post as jest.Mock).mockResolvedValue({}); (apiClient.patch as jest.Mock).mockResolvedValue({}); });
it('sends only selected target line IDs with the saved revision and explicit Shortbook sync', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue(doc); render(<ReplenishmentCenter {...props} view="TARGET_REVIEW" documentId="proposal"/>);
  await screen.findByText('Item A'); fireEvent.click(screen.getByRole('checkbox', { name: /Item A/ })); fireEvent.click(screen.getByRole('button', { name: 'Accept selected' }));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/inventory/workspace/replenishment/targets/proposal/review', { version: 3, action: 'ACCEPT', lineIds: ['line-a'], syncShortbook: true }));
});
it('shows a failed list load without an empty or zero-result claim', async () => {
  (apiClient.get as jest.Mock).mockRejectedValue(new Error('Could not load saved orders')); render(<ReplenishmentCenter {...props} view="PURCHASE_ORDER"/>);
  await screen.findByRole('alert'); expect(screen.getByText('Could not load saved orders')).toBeInTheDocument(); expect(screen.queryByText(/No matching records/)).not.toBeInTheDocument(); expect(screen.queryByText(/0 matching records/)).not.toBeInTheDocument();
});
it('loads every list page and can open a request beyond the first 100', async () => {
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => url.includes('page=2') ? { rows: [{ ...doc, id: 'later', reference: 'LATER-REQUEST', payload: { lines: [], source: 'MANUAL' } }] } : { rows: [{ ...doc, id: 'first', reference: 'FIRST-REQUEST', payload: { lines: [], source: 'MANUAL' } }], totalPages: 2 });
  render(<ReplenishmentCenter {...props} view="SHORTBOOK"/>); await screen.findByText('LATER-REQUEST'); fireEvent.click(screen.getByRole('button', { name: /LATER-REQUEST/ })); expect(props.onOpen).toHaveBeenCalledWith('SHORTBOOK', 'later');
});
it('passes authoritative remaining receipt context to Purchases and displays previous receipts', async () => {
  const order = { id: 'po', reference: 'PO-TEST', version: 4, status: 'PART_RECEIVED', payload: { lines: [] } }, context = { ...order, canReceive: true, policy: 'No over-delivery', receipts: [], lines: [{ id: 'p1', name: 'Ordered item', unit: 'PIECES', orderedQuantity: 10, receivedQuantity: 4, remainingQuantity: 6 }] };
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => url.includes('/receipt') ? context : order); render(<ReplenishmentCenter {...props} view="PURCHASE_ORDER" documentId="po"/>);
  await screen.findByText('Ordered item'); expect(screen.getByRole('cell', { name: '4' })).toBeInTheDocument(); expect(screen.getByRole('cell', { name: '6' })).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Receive remaining stock' })); expect(props.onReceive).toHaveBeenCalledWith(context);
});
it('settings preserve approval controls and submit changed bounce inputs', async () => {
  const status = { owner: { firstName: 'Fixture', lastName: 'Owner', isActive: true }, model: 'observed-demand-cover-v2', transport: { message: 'Setup required' }, runs: [], settings: { version: 2, ownerId: 'owner', autoMinMaxEnabled: false, autoPoEnabled: false, auditEnabled: false, lookbackDays: 60, minimumOrders: 1, minCoverDays: 10, maxCoverDays: 60, refreshDays: 7, auditDailyCount: 10, auditAdjustmentMode: 'APPROVAL', approvalValue: 5000, negativeCountNeedsApproval: true, includeBounce: false, includeRefill: true } };
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => url.endsWith('/owners') ? [{ id: 'owner', firstName: 'Fixture', lastName: 'Owner', role: 'ADMIN' }] : status); render(<ReplenishmentCenter {...props} view="settings"/>);
  await screen.findByLabelText('Include unfulfilled bounce quotations'); fireEvent.change(screen.getByLabelText(/Count adjustment policy/), { target: { value: 'THRESHOLD' } }); fireEvent.click(screen.getByLabelText('Include unfulfilled bounce quotations')); fireEvent.change(screen.getByLabelText('Count variance approval threshold (₹)'), { target: { value: '900' } }); fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/inventory/workspace/settings', expect.objectContaining({ includeBounce: true, auditAdjustmentMode: 'THRESHOLD', approvalValue: 900, negativeCountNeedsApproval: true, version: 2 })));
});
