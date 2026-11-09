import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { OpeningImportApprovals } from './OpeningImportApprovals';
import { apiClient } from '@/lib/api';

const toast = jest.fn();
let role = 'DOCTOR';
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { role } }) }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    getPendingInventoryImports: jest.fn(),
    getReviewedInventoryImports: jest.fn(),
    approveInventoryImport: jest.fn(),
    rejectInventoryImport: jest.fn(),
  },
}));

const api = apiClient as unknown as Record<string, jest.Mock>;
const riya = { id: 'u1', firstName: 'Riya', lastName: 'Desk' };
const praneeta = { id: 'u2', firstName: 'Praneeta', lastName: 'Rao' };
const pendingImport = {
  importId: 'imp-1',
  fileName: 'opening-stock.xlsx',
  createdAt: '2026-11-09T10:00:00Z',
  rowCount: 3,
  approval: { status: 'PENDING', requestedBy: riya, reviewedBy: null, reviewedAt: null, note: null },
  rows: [
    { sourceRow: 2, name: 'Adapalene gel', batchNumber: 'AG-1', currentStock: 5, batch: 'NEW' },
    { sourceRow: 3, name: 'Cetirizine 10mg', batchNumber: 'CT-9', currentStock: 40, batch: 'EXISTING', existingStock: 40 },
    { sourceRow: 4, error: 'Product name is required' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  role = 'DOCTOR';
  api.getReviewedInventoryImports.mockResolvedValue([]);
});

it('shows the doctor every row with its effect on stock before approving', async () => {
  api.getPendingInventoryImports.mockResolvedValue([pendingImport]);
  render(<OpeningImportApprovals />);
  const table = await screen.findByRole('table', { name: 'Rows in opening-stock.xlsx' });
  expect(within(table).getAllByRole('row').slice(1).map(r => Array.from(r.querySelectorAll('td')).map(c => c.textContent))).toEqual([
    ['2', 'Adapalene gel', 'AG-1', '5', 'New batch', ''],
    ['3', 'Cetirizine 10mg', 'CT-9', '40', 'Existing batch (40 in stock)', ''],
    ['4', '—', '—', '—', 'Not importable', 'Product name is required'],
  ]);
  expect(screen.getByText(/Requested by Riya Desk/)).toHaveTextContent('3 rows');
});

it('approves the file and reports what changed', async () => {
  api.getPendingInventoryImports.mockResolvedValueOnce([pendingImport]).mockResolvedValue([]);
  api.approveInventoryImport.mockResolvedValue({ created: 1, updated: 1, skipped: 1 });
  render(<OpeningImportApprovals />);
  fireEvent.click(await screen.findByRole('button', { name: 'Approve import' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(api.approveInventoryImport.mock.calls).toEqual([['imp-1']]);
  expect(toast.mock.calls).toEqual([[{ variant: 'destructive', title: 'Opening stock approved', description: '1 created, 1 updated, 1 need attention.' }]]);
  expect(await screen.findByText('No opening stock imports are waiting.')).toBeInTheDocument();
});

it('needs a reason to reject and sends the trimmed note', async () => {
  api.getPendingInventoryImports.mockResolvedValue([pendingImport]);
  api.rejectInventoryImport.mockResolvedValue({});
  render(<OpeningImportApprovals />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reject import' }));
  const dialog = await screen.findByRole('dialog');
  const reject = within(dialog).getByRole('button', { name: 'Reject' });
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '   ' } });
  expect(reject).toBeDisabled();
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: ' Counts are from last year ' } });
  fireEvent.click(reject);
  await waitFor(() => expect(api.rejectInventoryImport.mock.calls).toEqual([['imp-1', 'Counts are from last year']]));
});

it('announces a 409 when another doctor reviewed the file first', async () => {
  api.getPendingInventoryImports.mockResolvedValue([pendingImport]);
  api.approveInventoryImport.mockRejectedValue(Object.assign(new Error('HTTP 409'), { status: 409, body: { message: 'This import was already approved' } }));
  render(<OpeningImportApprovals />);
  fireEvent.click(await screen.findByRole('button', { name: 'Approve import' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This import was already approved. The list below is up to date.');
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('shows staff their own files and the rejection note without review buttons', async () => {
  role = 'RECEPTION';
  api.getPendingInventoryImports.mockResolvedValue([pendingImport]);
  api.getReviewedInventoryImports.mockResolvedValue([{
    importId: 'imp-0', fileName: 'march.xlsx', createdAt: '2026-11-08T10:00:00Z', rowCount: 1,
    approval: { status: 'REJECTED', requestedBy: riya, reviewedBy: praneeta, reviewedAt: '2026-11-08T11:00:00Z', note: 'Counts are from last year' },
  }]);
  render(<OpeningImportApprovals />);
  expect(await screen.findByRole('heading', { name: 'My opening stock imports' })).toBeInTheDocument();
  expect(await screen.findByText(/Rejected by Praneeta Rao/)).toHaveTextContent('Note: Counts are from last year');
  expect(screen.queryByRole('button', { name: 'Approve import' })).toBeNull();
});
