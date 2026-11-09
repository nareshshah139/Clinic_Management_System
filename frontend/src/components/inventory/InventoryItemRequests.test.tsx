import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { InventoryItemRequests } from './InventoryItemRequests';
import { InventoryApprovals } from './InventoryApprovals';
import { apiClient } from '@/lib/api';

const toast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { role: 'DOCTOR' } }) }));
jest.mock('./InventoryUpdates', () => ({ InventoryUpdates: () => <p>price edits</p> }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    getInventoryItemRequests: jest.fn(),
    approveInventoryItemRequest: jest.fn(),
    rejectInventoryItemRequest: jest.fn(),
  },
}));

const api = apiClient as unknown as Record<string, jest.Mock>;
const person = { id: 'u1', firstName: 'Rita', lastName: 'Rao' };
const pendingRequest = {
  id: 'r1', status: 'PENDING', itemName: 'Adapalene 0.1% Gel 15g', payload: { manufacturer: 'Galderma' },
  reviewNote: null, inventoryItemId: null, reviewedAt: null, createdAt: '2026-11-06T10:00:00Z',
  requestedBy: person, reviewedBy: null,
  possibleDuplicates: {
    inventory: [{ id: 'i1', name: 'Adapalene 0.1% Gel 15g', manufacturer: 'Galderma', unit: 'TUBES', packSize: 15, packUnit: 'g', batchNumber: 'B-1', currentStock: 7, matchedOn: ['name'] }],
    pendingRequests: [{ id: 'r9', requestedBy: 'Sunil Rao', createdAt: '2026-11-05T10:00:00Z' }],
  },
};

beforeEach(() => jest.clearAllMocks());

it('warns the doctor about an existing item and another pending request', async () => {
  api.getInventoryItemRequests.mockResolvedValue([pendingRequest]);
  render(<InventoryItemRequests />);
  const warning = await screen.findByTestId('duplicate-warning');
  expect(warning).toHaveTextContent('Already in inventory (1 batch)');
  expect(warning).toHaveTextContent('Adapalene 0.1% Gel 15g · Galderma · 15 g pack · batch B-1 · 7 in stock · same name');
  expect(warning).toHaveTextContent('Also requested by Sunil Rao on');
});

it('shows no warning when nothing matches', async () => {
  api.getInventoryItemRequests.mockResolvedValue([{ ...pendingRequest, possibleDuplicates: { inventory: [], pendingRequests: [] } }]);
  render(<InventoryItemRequests />);
  await screen.findByText('Adapalene 0.1% Gel 15g');
  expect(screen.queryByTestId('duplicate-warning')).toBeNull();
});

it('closes the dialog, refreshes and announces when another doctor already reviewed the request', async () => {
  api.getInventoryItemRequests
    .mockResolvedValueOnce([pendingRequest])
    .mockResolvedValue([{ ...pendingRequest, status: 'APPROVED', reviewedBy: { id: 'u2', firstName: 'Shravya', lastName: 'K' }, reviewedAt: '2026-11-06T11:00:00Z' }]);
  api.approveInventoryItemRequest.mockRejectedValue(Object.assign(new Error('HTTP 409'), { status: 409, body: { message: 'This request was already approved' } }));
  render(<InventoryItemRequests />);
  fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
  const confirm = within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve' });
  fireEvent.click(confirm);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await screen.findByRole('alert')).toHaveTextContent('This request was already approved');
  expect(await screen.findByText(/Approved by Shravya K/)).toBeInTheDocument();
  expect(toast).not.toHaveBeenCalled();
});

it('opens approvals on New items when requests are waiting, else on Price / stock', () => {
  api.getInventoryItemRequests.mockResolvedValue([]);
  const { unmount } = render(<InventoryApprovals canReadEdits pendingItems={2} />);
  expect(screen.getByRole('tab', { name: /New items/ })).toHaveAttribute('aria-selected', 'true');
  unmount();
  render(<InventoryApprovals canReadEdits pendingItems={0} />);
  expect(screen.getByRole('tab', { name: 'Price / stock' })).toHaveAttribute('aria-selected', 'true');
});
