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
  expect(screen.getByText('Max Rich Yu Cream').closest('tr')).toHaveClass('bg-emerald-50');
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
it('defaults an applied search to best match and explains typo suggestions without replacing the query', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({...result,rows:[{...result.rows[0],searchMatch:{kind:'fuzzy',corrections:['maxrcih → maxrich']}}]});
  render(<WorkspaceStock {...props} query={{search:'maxrcih'}}/>);
  await screen.findByText('Similar spelling: maxrcih → maxrich');
  expect(screen.getByDisplayValue('maxrcih')).toBeInTheDocument();
  expect(screen.getByRole('combobox',{name:'Sort'})).toHaveValue('relevance');
  fireEvent.change(screen.getByRole('combobox',{name:'Sort'}),{target:{value:'name'}});
  expect(props.navigate).toHaveBeenCalledWith({sortBy:'name',page:'1',item:''});
});

it('shows an unverified ledger and submits confirmed identity recovery with its revision', async () => {
  const item = { ...result.rows[0], metadata: {}, updatedAt: '2026-10-24T00:00:00.000Z', drugs: [{ id: 'correct', name: 'Verified cream' }, { id: 'wrong', name: 'Other cream' }] };
  (apiClient.get as jest.Mock).mockResolvedValue({ item, batches: [item], movements: [], history: [], purchases: [], holds: [], ledger: { status: 'UNVERIFIED', checkpoint: null } });
  render(<WorkspaceStock {...props} itemId={item.id} />);
  await screen.findByText('Resolve this batch’s product identity');
  fireEvent.change(screen.getByLabelText('Verified product'), { target: { value: 'correct' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Checked the physical pack' } });
  fireEvent.click(screen.getByLabelText(/I verified the physical product/));
  fireEvent.click(screen.getByRole('button', { name: 'Resolve product identity' }));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/inventory/workspace/stocktake/resolve-identity', {
    itemId: item.id, productId: 'correct', updatedAt: item.updatedAt, reason: 'Checked the physical pack', confirmed: true,
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Ledger' }));
  expect(screen.getByText(/Ledger unverified: record a physical stock count/)).toBeInTheDocument();
});


it.each([
  [{status:'UNVERIFIED',checkpoint:null}, 'No verified physical count', 'Count this batch'],
  [{status:'UNVERIFIED',checkpoint:{quantity:17},expectedStock:null,difference:null,missingHistory:true}, 'Movement history is incomplete', 'Count this batch'],
  [{status:'DISCREPANCY',checkpoint:{quantity:17},expectedStock:19,difference:-2}, 'Recorded stock is 2 PACKS below the ledger balance of 19 PACKS', 'Count this batch'],
  [{status:'RECONCILED',checkpoint:{quantity:17},expectedStock:17,difference:0}, 'Recorded stock agrees with the ledger balance of 17 PACKS', 'Count this batch'],
])('explains ledger evidence %p without claiming the view changed stock', async (ledger, explanation, action) => {
  const item = {...result.rows[0],metadata:{},drugs:[]};
  (apiClient.get as jest.Mock).mockResolvedValue({item,batches:[item],movements:[],history:[],purchases:[],holds:[],ledger});
  render(<WorkspaceStock {...props} itemId={item.id}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Ledger'}));
  expect(screen.getByText(new RegExp(explanation))).toBeInTheDocument();
  expect(screen.getByText(/Viewing this ledger does not change stock/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:action})).toBeEnabled();
});

it('provides a batch reference and authorized colleague handoff for read-only reconciliation and ambiguous identity', async () => {
  const item = {...result.rows[0],metadata:{},drugs:[{id:'a',name:'Product A'},{id:'b',name:'Product B'}]};
  (apiClient.get as jest.Mock).mockResolvedValue({item,batches:[item],movements:[],history:[],purchases:[],holds:[],ledger:{status:'UNVERIFIED',checkpoint:null}});
  render(<WorkspaceStock {...props} capabilities={{kinds:{COUNT:{write:false}}}} itemId={item.id}/>);
  expect(await screen.findByText(/This batch is linked to more than one product/)).toBeInTheDocument();
  expect(screen.getByText(/Ask a colleague with Counts & audit write access/)).toBeInTheDocument();
  expect(screen.getByLabelText('Batch recovery reference')).toHaveValue(expect.stringContaining('item=stock'));
  expect(screen.queryByRole('button',{name:'Count this batch'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Ledger'}));
  expect(screen.getByText(/Use the batch recovery reference above/)).toBeInTheDocument();
});
