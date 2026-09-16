import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkspaceStock } from '@/components/inventory/WorkspaceStock';
import { apiClient } from '@/lib/api';
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { id: 'admin', branchId: 'clinic' } }) }));
jest.mock('@/components/inventory/AddInventoryItemDialog', () => ({ AddInventoryItemDialog: () => null }));
const props = { query: {}, navigate: jest.fn(), capabilities: { kinds: { COUNT: { write: true } } }, onTask: jest.fn(), onDocument: jest.fn(), onInvoice: jest.fn() };
const result = { rows: [{ id: 'stock', name: 'Max Rich Yu Cream', batchNumber: 'B1', expiryDate: '2028-05-31T23:59:59.999Z', currentStock: 17, heldStock: 0, available: 17, unit: 'PACKS', packLabel: '100 Gm', costPrice: 10, mrp: 20, status: 'ACTIVE' }], total: 1, page: 1, totalPages: 1, facets: {}, quality: {} };
beforeEach(() => { jest.clearAllMocks(); (apiClient.get as jest.Mock).mockResolvedValue(result); (apiClient.post as jest.Mock).mockResolvedValue({ id: 'count' }); });
it('defaults to all batches, colors depleted history and keeps the existing search when filtering', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({ ...result, rows: [...result.rows, { ...result.rows[0], id: 'old', name: 'Old batch', batchNumber: 'OLD', currentStock: 0, available: 0 }] });
  render(<WorkspaceStock {...props} query={{ search: 'cream' }} />);
  await screen.findByText('Max Rich Yu Cream');
  expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('batchView=ALL'));
  expect(screen.getAllByText('100 Gm')).toHaveLength(2);
  expect(screen.getByText('Old batch').closest('tr')).toHaveClass('bg-muted/60');
  expect(screen.getByText('Max Rich Yu Cream').closest('tr')).toHaveClass('bg-emerald-50/60');
  fireEvent.click(screen.getByRole('button', { name: 'Previous / depleted' }));
  expect(props.navigate).toHaveBeenCalledWith(expect.objectContaining({ batchView: 'EMPTY', page: '1' }));
  expect(props.navigate.mock.calls[0][0]).not.toHaveProperty('search');
});
it('uses the displayed scope for a count and clears selections when scope changes', async () => {
  const { rerender } = render(<WorkspaceStock {...props} query={{ batchView: 'ON_HAND' }} />);
  await screen.findByText('Max Rich Yu Cream');
  fireEvent.click(screen.getByRole('button', { name: 'Count matching batches' }));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/inventory/workspace/counts', expect.objectContaining({ filters: expect.objectContaining({ batchView: 'ON_HAND' }) })));
  fireEvent.click(screen.getByRole('checkbox', { name: /Select Max Rich/ }));
  rerender(<WorkspaceStock {...props} query={{ batchView: 'ON_HAND', page: '2' }} />);
  expect(screen.getByRole('button', { name: 'Count selected batches' })).toBeInTheDocument();
  rerender(<WorkspaceStock {...props} query={{ batchView: 'EMPTY' }} />);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Count selected batches' })).not.toBeInTheDocument());
});
it('preserves explicit low/zero-stock deep links rather than hiding their results', async () => {
  render(<WorkspaceStock {...props} query={{ stock: 'ZERO' }} />);
  await screen.findByText('Max Rich Yu Cream');
  expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('batchView=ALL'));
});
