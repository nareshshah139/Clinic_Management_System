import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InventoryUpdates } from '@/components/inventory/InventoryUpdates';
import { apiClient } from '@/lib/api';

const toast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@/components/layout/dashboard-user-context', () => ({
  useDashboardUser: () => ({ user: { role: 'PHARMACIST' } }),
}));
jest.mock('@/lib/api', () => ({ apiClient: {
  getDrugInventoryCatalog: jest.fn(),
  getDrugInventoryChangeRequests: jest.fn(),
  submitDrugInventoryChanges: jest.fn(),
} }));

beforeEach(() => {
  jest.clearAllMocks();
  (apiClient.getDrugInventoryCatalog as jest.Mock).mockImplementation(async ({ page }) => ({
    data: [{ id: `drug-${page}`, name: `Medicine ${page}`, price: 10,
      totalStock: 20, primaryInventoryItemId: `item-${page}` }],
    pagination: { pages: 2, total: 2 },
  }));
  (apiClient.getDrugInventoryChangeRequests as jest.Mock).mockResolvedValue({ data: [] });
  (apiClient.submitDrugInventoryChanges as jest.Mock).mockResolvedValue({ summary: { submitted: 2 } });
});

it('submits edits from both catalog pages together', async () => {
  render(<InventoryUpdates />);
  await screen.findByText('Medicine 1');
  fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Medicine 2');
  fireEvent.change(screen.getAllByRole('spinbutton')[1], { target: { value: '25' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit/ }));
  await waitFor(() => expect(apiClient.submitDrugInventoryChanges).toHaveBeenCalledWith([
    expect.objectContaining({ drugId: 'drug-1', proposedPrice: 12 }),
    expect.objectContaining({ drugId: 'drug-2', proposedStock: 25 }),
  ]));
});

it('does not silently submit only price when the edited stock is invalid', async () => {
  render(<InventoryUpdates />);
  await screen.findByText('Medicine 1');
  fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '12' } });
  fireEvent.change(screen.getAllByRole('spinbutton')[1], { target: { value: '-1' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit/ }));
  expect(apiClient.submitDrugInventoryChanges).not.toHaveBeenCalled();
});

it('keeps edits available for retry when submission fails', async () => {
  (apiClient.submitDrugInventoryChanges as jest.Mock).mockRejectedValue(new Error('Unavailable'));
  render(<InventoryUpdates />);
  await screen.findByText('Medicine 1');
  fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit/ }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Submission failed' })));
  expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(12);
  expect(screen.getByRole('button', { name: /Submit 1/ })).toBeEnabled();
});
