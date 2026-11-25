import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InventoryWorkspace } from '@/components/inventory/InventoryWorkspace';
import { apiClient } from '@/lib/api';

let mockQuery = '';
const mockRouter = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn() };
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), getInventoryItemRequestPendingCount: jest.fn(), getDrugInventoryChangeRequests: jest.fn() } }));
jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard/inventory', useRouter: () => mockRouter, useSearchParams: () => new URLSearchParams(mockQuery) }));
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { id: 'owner', branchId: 'branch', role: 'OWNER' } }) }));
jest.mock('@/components/inventory/optimization/DataQualityStrip', () => ({ DataQualityStrip: () => null }));
jest.mock('@/components/inventory/WorkspaceStock', () => ({ WorkspaceStock: ({ onBack }: any) => <button onClick={onBack}>Back to stock list</button> }));
jest.mock('@/components/inventory/InventoryLedger', () => ({ InventoryLedger: () => <p>Stock ledger</p> }));
jest.mock('@/components/inventory/WorkflowDocumentEditor', () => ({ WorkflowDocumentEditor: ({ onBack }: any) => <button onClick={onBack}>Back from document</button> }));
jest.mock('@/components/inventory/InventoryUpdates', () => ({ InventoryUpdates: () => <p>Price and stock edit queue</p> }));
jest.mock('@/components/inventory/InventoryItemRequests', () => ({ InventoryItemRequests: () => <p>New item request queue</p> }));

const api = apiClient as unknown as Record<string, jest.Mock>;
const lastPush = () => mockRouter.push.mock.calls.at(-1)?.[0];
const lastPushParams = () => Object.fromEntries(new URL(lastPush(), 'http://clinic.test').searchParams);
const documents = (reference?: string) => ({ rows: reference ? [{ id: reference, kind: 'LOSS', reference, createdAt: '2026-11-20', status: 'POSTED', totalAmount: 10, payload: { lines: [] } }] : [], total: reference ? 1 : 0, page: 1, totalPages: 1 });

beforeEach(() => {
  jest.clearAllMocks();
  api.getInventoryItemRequestPendingCount.mockResolvedValue({ count: 0 });
  api.getDrugInventoryChangeRequests.mockResolvedValue({ data: [], pagination: { total: 0 } });
});

it('keeps an open supplier form and its typed name through Refresh inventory while the list refetches', async () => {
  mockQuery = 'area=purchases&view=suppliers';
  let supplierReads = 0;
  api.get.mockImplementation(async (path: string) => {
    if (path.includes('capabilities')) return { supplierWrite: true, kinds: {} };
    return ++supplierReads === 1 ? [] : [{ id: 's1', name: 'Fresh Pharma', gstNumber: '', isActive: true }];
  });
  render(<InventoryWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add supplier' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Supplier name' }), { target: { value: 'Medline' } });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh inventory' }));
  expect(await screen.findByText('Fresh Pharma')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Supplier name' })).toHaveValue('Medline');
});

it('refetches a document register on Refresh inventory', async () => {
  mockQuery = 'area=stock&view=LOSS';
  let reads = 0;
  api.get.mockImplementation(async (path: string) => path.includes('capabilities') ? { kinds: { LOSS: { read: true, write: true } } } : documents(++reads === 1 ? 'LOSS-1' : 'LOSS-2'));
  render(<InventoryWorkspace />);
  await screen.findByText('LOSS-1');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh inventory' }));
  expect(await screen.findByText('LOSS-2')).toBeInTheDocument();
});

it('keeps the chosen approvals tab through Refresh inventory and counts every pending approval', async () => {
  mockQuery = 'area=stock&view=approvals';
  api.get.mockResolvedValue({ kinds: {} });
  api.getInventoryItemRequestPendingCount.mockResolvedValue({ count: 2 });
  api.getDrugInventoryChangeRequests.mockResolvedValue({ data: [], pagination: { total: 3 } });
  render(<InventoryWorkspace />);
  expect(await screen.findByRole('button', { name: 'Approve corrections (5)' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('tab', { name: /New items/ })).toHaveAttribute('aria-selected', 'true'));
  fireEvent.click(screen.getByRole('tab', { name: /Price \/ stock/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh inventory' }));
  await waitFor(() => expect(api.getDrugInventoryChangeRequests).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('tab', { name: /Price \/ stock/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('Price and stock edit queue')).toBeInTheDocument();
  expect(screen.getByLabelText('3 pending')).toBeInTheDocument();
});

it('enters another task without the stock list filters', async () => {
  mockQuery = 'area=stock&view=list&search=x&expiryMonths=3';
  api.get.mockImplementation(async (path: string) => path.includes('capabilities') ? { kinds: { LOSS: { read: true, write: true } } } : documents());
  const view = render(<InventoryWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: 'Stock ledger' }));
  expect(lastPush()).toBe('/dashboard/inventory?area=stock&view=ledger');
  fireEvent.click(screen.getByRole('button', { name: 'Loss & breakage' }));
  expect(lastPush()).toBe('/dashboard/inventory?area=stock&view=LOSS');
  mockQuery = lastPush().split('?')[1];
  view.rerender(<InventoryWorkspace />);
  expect(await screen.findByText('No loss & breakage match these filters.')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Reference' })).toHaveValue('');
  const reads = api.get.mock.calls.map(([path]) => path).filter((path: string) => path.includes('documents'));
  expect(reads).toEqual(['/inventory/workspace/documents?kind=LOSS&page=1']);
});

it('leaves an item without carrying its tab into the stock list', async () => {
  mockQuery = 'area=stock&view=list&search=x&item=batch-1&itemTab=ledger';
  api.get.mockResolvedValue({ kinds: {} });
  render(<InventoryWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: 'Back to stock list' }));
  expect(lastPush()).toBe('/dashboard/inventory?area=stock&view=list&search=x');
});

it('opens a record from a filtered register and Back returns to exactly that register', async () => {
  mockQuery = 'area=stock&view=LOSS&search=x&status=POSTED';
  api.get.mockImplementation(async (path: string) => path.includes('capabilities') ? { kinds: { LOSS: { read: true, write: true } } } : documents('LOSS-7'));
  const view = render(<InventoryWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: /LOSS-7/ }));
  expect(lastPushParams()).toEqual({ area: 'stock', view: 'LOSS', document: 'LOSS-7', return: 'area=stock&view=LOSS&search=x&status=POSTED' });
  mockQuery = lastPush().split('?')[1];
  view.rerender(<InventoryWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: 'Back from document' }));
  expect(lastPush()).toBe('/dashboard/inventory?area=stock&view=LOSS&search=x&status=POSTED');
});
