import { fireEvent, render, screen, within } from '@testing-library/react';
import { WorkspaceStock } from './WorkspaceStock';
import { apiClient } from '@/lib/api';

let role = 'PHARMACIST';
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { role } }) }));
jest.mock('./AddInventoryItemDialog', () => ({ AddInventoryItemDialog: ({ open, onSuccess }: { open: boolean; onSuccess: () => void }) => open ? <button onClick={onSuccess}>Finish adding</button> : null }));
jest.mock('./InventoryItemPage', () => ({ InventoryItemPage: () => null }));
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), submitDrugInventoryChanges: jest.fn() } }));

const api = apiClient as unknown as Record<string, jest.Mock>;
const batch = (over: Record<string, unknown>) => ({
  id: 'i1', name: 'Cap. Omega 3', productName: 'Cap. Omega 3', batchNumber: 'CR11-12', unit: 'STRIPS', currentStock: 11, heldStock: 0,
  available: 11, sellingPrice: 73, costPrice: 30, mrp: 80, expiryDate: '2027-12-31T00:00:00Z', status: 'ACTIVE',
  storageLocation: 'Rack L-1', strengthMissing: true, updatedAt: '2026-11-10T00:00:00Z', ...over,
});
const rows = [
  batch({}),
  batch({ id: 'i2', name: 'Uprise D3 60000 Cap', productName: 'Cap. Uprise D3 60000', recordedName: 'Uprise D3 60000 Cap', batchNumber: 'CR11-13', currentStock: 5, available: 5, sellingPrice: 76, storageLocation: 'Rack M-1' }),
];
const renderStock = (capabilities: Record<string, boolean> = {}) => render(<WorkspaceStock query={{ missing: 'Strength missing' }} navigate={jest.fn()} capabilities={capabilities} onTask={jest.fn()} onDocument={jest.fn()} onInvoice={jest.fn()} />);
const row = async (product: string) => (await screen.findByRole('button', { name: product })).closest('tr') as HTMLElement;

beforeEach(() => {
  jest.clearAllMocks();
  role = 'PHARMACIST';
  api.get.mockResolvedValue({ rows, total: 2, page: 1, totalPages: 1 });
});

it('keeps the recorded name, the missing strength and the location beside each batch', async () => {
  renderStock();
  const uprise = await row('Cap. Uprise D3 60000');
  expect(within(uprise).getByText('Recorded as Uprise D3 60000 Cap')).toBeInTheDocument();
  expect(within(uprise).getByText('Strength missing')).toBeInTheDocument();
  expect(within(uprise).getByText('Rack M-1')).toBeInTheDocument();
});

it('opens the price editor for the batch whose Edit price was pressed', async () => {
  renderStock();
  fireEvent.click(within(await row('Cap. Uprise D3 60000')).getByRole('button', { name: 'Edit price' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByRole('heading', { name: 'Edit price' })).toBeInTheDocument();
  expect(dialog).toHaveTextContent('Cap. Uprise D3 60000 · Batch CR11-13');
  expect(dialog).toHaveTextContent('Current selling price: ₹76.00');
});

it('opens the stock editor for the batch whose Edit stock was pressed', async () => {
  role = 'DOCTOR';
  renderStock();
  fireEvent.click(within(await row('Cap. Omega 3')).getByRole('button', { name: 'Edit stock' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByRole('heading', { name: 'Edit stock' })).toBeInTheDocument();
  expect(dialog).toHaveTextContent('Cap. Omega 3 · Batch CR11-12');
  expect(dialog).toHaveTextContent('Current stock on shelf: 11 STRIPS');
});

it('offers no row edits to a role that cannot submit them', async () => {
  role = 'RECEPTIONIST';
  renderStock();
  await row('Cap. Omega 3');
  expect(screen.queryByRole('columnheader', { name: 'Edit' })).toBeNull();
  expect(screen.getByRole('columnheader', { name: 'Location' })).toBeInTheDocument();
});

it('names the add button for what it does', async () => {
  renderStock({ itemCreate: true });
  await row('Cap. Omega 3');
  expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add batch' })).toBeNull();
});

it('says a directly added item has no stock yet', async () => {
  renderStock({ itemCreate: true });
  await row('Cap. Omega 3');
  fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
  fireEvent.click(screen.getByRole('button', { name: 'Finish adding' }));
  expect(await screen.findByText('Item added with no stock. Add its stock from a purchase bill or opening stock.')).toBeInTheDocument();
});

it('shows availability in the product cell for phones', async () => {
  api.get.mockResolvedValue({ rows: [batch({ id: 'i3', name: 'Clobetasol Cream 15g', productName: 'Clobetasol Cream 15g', unit: 'TUBES', available: 20, currentStock: 20, storageLocation: '' })], total: 1, page: 1, totalPages: 1 });
  renderStock();
  const line = within(await row('Clobetasol Cream 15g')).getByText(/20 TUBES available/);
  expect(line).toHaveAttribute('aria-hidden', 'true');
  expect(line).toHaveClass('md:hidden');
  expect(line).toHaveTextContent(/^20 TUBES available · .+ · Not assigned$/);
});
