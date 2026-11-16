import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StockEditDialog } from '@/components/inventory/StockEditDialog';
import { apiClient } from '@/lib/api';
jest.mock('@/lib/api', () => ({ apiClient: { submitDrugInventoryChanges: jest.fn() } }));
const item = { id: 'clinic-batch', name: 'Clinic medicine', batchNumber: 'B1', unit: 'PACKS', currentStock: 10, heldStock: 2, sellingPrice: 20, updatedAt: '2026-01-01T00:00:00.000Z' };
const props = { item, onClose: jest.fn(), onSubmitted: jest.fn() };
beforeEach(() => { jest.clearAllMocks(); (apiClient.submitDrugInventoryChanges as jest.Mock).mockResolvedValue({}); });
it.each(['stock', 'price'] as const)('submits the selected batch %s with its revision and reason', async field => {
  render(<StockEditDialog {...props} field={field} />);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '25' } });
  expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Invoice 123 / shelf count B1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
  await waitFor(() => expect(props.onSubmitted).toHaveBeenCalled());
  expect(apiClient.submitDrugInventoryChanges).toHaveBeenCalledWith([{
    scope: 'BATCH', inventoryItemId: item.id, expectedUpdatedAt: item.updatedAt,
    [field === 'price' ? 'proposedPrice' : 'proposedStock']: 25, reason: 'Invoice 123 / shelf count B1',
  }]);
});
it.each(['', '-1', '1.5', '1', '10'])('blocks invalid or unchanged counts: %s', value => {
  render(<StockEditDialog {...props} field="stock" />);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value } });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Shelf count B1' } });
  expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeDisabled();
});
it('keeps inputs after failure so the user can retry', async () => {
  (apiClient.submitDrugInventoryChanges as jest.Mock).mockRejectedValue(new Error('Connection lost'));
  render(<StockEditDialog {...props} field="stock" />);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '8' } });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Shelf count B1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
  expect(screen.getByRole('spinbutton')).toHaveValue(8);
  expect(screen.getByRole('textbox')).toHaveValue('Shelf count B1');
  expect(props.onSubmitted).not.toHaveBeenCalled();
});
