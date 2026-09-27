import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddInventoryItemDialog } from '@/components/inventory/AddInventoryItemDialog';
import { WorkspaceStock } from '@/components/inventory/WorkspaceStock';
import { apiClient } from '@/lib/api';
jest.mock('@/lib/api', () => ({ apiClient: { createInventoryItem: jest.fn(), get: jest.fn(), patch: jest.fn() } }));
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { id: 'doctor', branchId: 'clinic' } }) }));
beforeEach(() => { jest.clearAllMocks(); sessionStorage.clear(); });
const defaults = { defaultDuration: 3, defaultDurationUnit: 'WEEKS', defaultFrequency: '1-0-1', defaultTiming: 'AM/PM', defaultInstructions: 'on the rash' };
function fillDefaults() {
  for (const [label, value] of Object.entries({ 'Default duration': '3', 'Default duration unit': 'WEEKS', 'Default frequency': '1-0-1', 'Default when': 'AM/PM', 'Default instructions': 'on the rash' })) {
    fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
  }
}
it('saves optional defaults when adding inventory and resets them after saving', async () => {
  (apiClient.createInventoryItem as jest.Mock).mockResolvedValue({ id: 'item' });
  render(<AddInventoryItemDialog open onOpenChange={jest.fn()} onSuccess={jest.fn()} />);
  fireEvent.change(screen.getByLabelText(/Item Name/), { target: { value: 'Cream' } });
  fireEvent.change(screen.getByLabelText(/Cost Price/), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText(/Selling Price/), { target: { value: '2' } });
  fillDefaults();
  fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));
  await waitFor(() => expect(apiClient.createInventoryItem).toHaveBeenCalledWith(expect.objectContaining(defaults)));
  expect(screen.getByLabelText('Default duration', { exact: true })).toHaveValue(null);
});
it('loads, edits and clears defaults on a legacy consumable linked to a medicine', async () => {
  const item = { id: 'item', type: 'CONSUMABLE', name: 'Cream', metadata: {}, drugs: [{ id: 'cream' }], unit: 'TUBES', currentStock: 10, updatedAt: '2026-09-27', ...defaults };
  (apiClient.get as jest.Mock).mockResolvedValue({ item, batches: [], capabilities: {}, purchases: [], sales: [], ledger: [] });
  (apiClient.patch as jest.Mock).mockResolvedValue({});
  render(<WorkspaceStock query={{}} itemId="item" capabilities={{ itemWrite: true }} navigate={jest.fn()} onTask={jest.fn()} onDocument={jest.fn()} onInvoice={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit product details' }));
  expect(screen.getByLabelText('Default duration', { exact: true })).toHaveValue(3);
  fireEvent.change(screen.getByLabelText('Default duration', { exact: true }), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Default instructions'), { target: { value: 'new instruction' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save product details' }));
  await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/inventory/workspace/stock/item', expect.objectContaining({ defaultDuration: '', defaultInstructions: 'new instruction' })));
});
