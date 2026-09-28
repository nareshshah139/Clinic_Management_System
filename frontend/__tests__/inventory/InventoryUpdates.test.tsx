import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { InventoryUpdates } from '@/components/inventory/InventoryUpdates';
import { apiClient } from '@/lib/api';

const toast = jest.fn();
let mockRole = 'PHARMACIST';
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@/components/layout/dashboard-user-context', () => ({
  useDashboardUser: () => ({ user: { role: mockRole } }),
}));
jest.mock('@/lib/api', () => ({ apiClient: {
  getDrugInventoryCatalog: jest.fn(),
  getDrugInventoryChangeRequests: jest.fn(),
  submitDrugInventoryChanges: jest.fn(),
  approveDrugInventoryChangeRequest: jest.fn(),
  rejectDrugInventoryChangeRequest: jest.fn(),
} }));

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'PHARMACIST';
  (apiClient.getDrugInventoryCatalog as jest.Mock).mockImplementation(async ({ page }) => ({
    data: [{ id: `drug-${page}`, name: `Medicine ${page}`, price: 10,
      totalStock: 20, primaryInventoryItemId: `item-${page}` }],
    pagination: { pages: 2, total: 2 },
  }));
  (apiClient.getDrugInventoryChangeRequests as jest.Mock).mockResolvedValue({ data: [] });
  (apiClient.submitDrugInventoryChanges as jest.Mock).mockResolvedValue({ summary: { submitted: 2 } });
});

it('pages the approval queue without loading the full drug catalog', async () => {
  (apiClient.getDrugInventoryChangeRequests as jest.Mock).mockImplementation(async ({ page }) => ({
    data: [{ id: `request-${page}`, drugId: null, status: 'PENDING', drug: null,
      inventoryItem: { name: `Clinic item ${page}`, batchNumber: 'B1', unit: 'PACKS' },
      stockSnapshot: { scope: 'BATCH' }, proposedStock: 15, currentStock: 20, reason: 'Shelf count', createdAt: new Date().toISOString() }],
    pagination: { pages: 2, total: 21 },
  }));
  render(<InventoryUpdates />);
  await screen.findByText('Clinic item 1');
  expect(screen.getByText('21 pending requests')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Clinic item 2');
  expect(apiClient.getDrugInventoryCatalog).not.toHaveBeenCalled();
});

it('distinguishes a queue failure from no pending edits', async () => {
  (apiClient.getDrugInventoryChangeRequests as jest.Mock).mockRejectedValue(new Error('Queue offline'));
  render(<InventoryUpdates />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Queue offline');
  expect(screen.queryByText('No pending price or stock edits.')).not.toBeInTheDocument();
});

it.each(['approve', 'reject', 'failure'])('announces stock changes only for successful approval: %s', async outcome => {
  mockRole = 'DOCTOR';
  const listener = jest.fn();
  window.addEventListener('inventory-stock-refresh', listener);
  (apiClient.getDrugInventoryChangeRequests as jest.Mock).mockResolvedValue({ data: [{
    id: 'request', drugId: 'drug-1', status: 'PENDING', drug: { name: 'Requested medicine' },
    proposedStock: 15, currentStock: 20, createdAt: new Date().toISOString(),
  }] });
  (apiClient.approveDrugInventoryChangeRequest as jest.Mock).mockImplementation(async () => {
    if (outcome === 'failure') throw new Error('Stale count');
    return {};
  });
  (apiClient.rejectDrugInventoryChangeRequest as jest.Mock).mockResolvedValue({});
  try {
    render(<InventoryUpdates />);
    const action = outcome === 'reject' ? 'Reject' : 'Approve';
    fireEvent.click(await screen.findByRole('button', { name: action }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: action }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(listener).toHaveBeenCalledTimes(outcome === 'approve' ? 1 : 0);
  } finally {
    window.removeEventListener('inventory-stock-refresh', listener);
  }
});
