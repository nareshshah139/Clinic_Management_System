import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ReplenishmentCenter } from '@/components/inventory/ReplenishmentCenter';
import { apiClient } from '@/lib/api';
import { downloadCsv } from '@/components/inventory/workspace-model';
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('@/components/inventory/workspace-model', () => ({ ...jest.requireActual('@/components/inventory/workspace-model'), downloadCsv: jest.fn() }));
const props = { caps: { approve: true, settings: true, kinds: { TARGET_REVIEW: { read: true, write: true }, SHORTBOOK: { read: true, write: true } } }, onOpen: jest.fn(), onCreate: jest.fn(), onReceive: jest.fn() };
const item = { id: 'a', name: 'Target item A', unit: 'PIECES', packSize: 10, packUnit: 'BOX', updatedAt: '2026-09-14T01:00:00.000Z', minStockLevel: 2, maxStockLevel: 8, reorderLevel: 3, available: 1, manualTargets: false, excluded: false };
const data = { version: 7, branchId: 'branch', rows: [item, { ...item, id: 'b', name: 'Target item B', minStockLevel: null }] };
beforeEach(() => { jest.resetAllMocks(); (apiClient.get as jest.Mock).mockResolvedValue(data); (apiClient.post as jest.Mock).mockResolvedValue({}); });
it('restores Today OPEN status and all URL filters, exports only the full matching scope, and navigates filter changes', async () => {
  const row = (id: string) => ({ id, reference: id, status: 'DRAFT', payload: { lines: [{ name: 'Needle item', quantity: 2, unit: 'PIECES' }] } });
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => url.includes('page=2') ? { rows: [row('later')] } : { rows: [row('first')], totalPages: 2 });
  const navigate = jest.fn(), query = { status: 'OPEN', from: '2026-09-01', to: '2026-09-14', search: 'Needle', gstin: '36GST' };
  const mounted = render(<ReplenishmentCenter {...props} view="SHORTBOOK" query={query} navigate={navigate}/>);
  await screen.findByText('later');
  expect(screen.getByLabelText('Status')).toHaveValue('OPEN'); expect(screen.getByLabelText('From')).toHaveValue('2026-09-01');
  expect(screen.getByLabelText('Search item or reference')).toHaveValue('Needle');
  for (const [url] of (apiClient.get as jest.Mock).mock.calls) { expect(url).toContain('status=OPEN'); expect(url).toContain('from=2026-09-01'); expect(url).toContain('to=2026-09-14'); expect(url).toContain('gstin=36GST'); }
  fireEvent.click(screen.getByRole('button', { name: 'Download all matching lines' }));
  expect(downloadCsv).toHaveBeenCalledWith('shortbook.csv', expect.arrayContaining([expect.objectContaining({ reference: 'first' }), expect.objectContaining({ reference: 'later' })]));
  expect((downloadCsv as jest.Mock).mock.calls[0][1]).toHaveLength(2);
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'APPROVED' } }); fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(navigate).toHaveBeenCalledWith({ ...query, status: 'APPROVED', page: '1', document: '', new: '' });
  mounted.rerender(<ReplenishmentCenter {...props} view="SHORTBOOK" query={{ ...query, status: 'DRAFT', search: 'item' }} navigate={navigate}/>);
  await waitFor(() => expect(screen.getByLabelText('Status')).toHaveValue('DRAFT')); expect(screen.getByLabelText('Search item or reference')).toHaveValue('item');
  fireEvent.click(screen.getByRole('button', { name: 'Clear' })); expect(navigate).toHaveBeenLastCalledWith({ status: '', search: '', from: '', to: '', gstin: '', page: '1', document: '', new: '' });
});
it('requires explicit row selection, before/after review and reason, and sends only selected rows with both revisions', async () => {
  (apiClient.post as jest.Mock).mockImplementationOnce(async () => { (apiClient.get as jest.Mock).mockResolvedValue({ ...data, version: 8, rows: [{ ...item, minStockLevel: 4, manualTargets: true, excluded: true }, data.rows[1]] }); return { updated: 1, settingsVersion: 8 }; });
  render(<ReplenishmentCenter {...props} view="targets"/>); await screen.findByLabelText('Minimum for Target item A (PIECES)');
  expect(screen.getByText('Unconfigured / 8 / 3')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Minimum for Target item A (PIECES)'), { target: { value: '4' } });
  fireEvent.change(screen.getByLabelText('Maximum for Target item B (PIECES)'), { target: { value: '9' } });
  fireEvent.click(screen.getByLabelText('Protect manual targets for Target item A')); fireEvent.click(screen.getByLabelText('Exclude Target item A from target proposals'));
  expect(screen.getByRole('button', { name: 'Review selected changes' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Target item A' })); fireEvent.click(screen.getByRole('button', { name: 'Review selected changes' }));
  const review = screen.getByRole('form', { name: 'Review manual target changes' });
  expect(within(review).getByText('Saved min / max / reorder: 2 / 8 / 3')).toBeInTheDocument(); expect(within(review).getByText('New min / max / reorder: 4 / 8 / 3')).toBeInTheDocument();
  expect(within(review).queryByText(/Target item B/)).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Save reviewed targets' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Reason for target changes (required)'), { target: { value: 'Demand reviewed with manager' } }); fireEvent.click(screen.getByRole('button', { name: 'Save reviewed targets' }));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/inventory/workspace/replenishment/manual-targets', { settingsVersion: 7, reason: 'Demand reviewed with manager', items: [{ id: 'a', updatedAt: item.updatedAt, minStockLevel: '4', maxStockLevel: '8', reorderLevel: '3', manualTargets: true, excluded: true }] }));
  await waitFor(() => expect(screen.queryByRole('form', { name: 'Review manual target changes' })).not.toBeInTheDocument());
});
it('reviews multiple selected rows atomically and retains edits on a stale-version rejection', async () => {
  (apiClient.post as jest.Mock).mockRejectedValue(new Error('Replenishment settings changed. Reload before reviewing these changes again.'));
  render(<ReplenishmentCenter {...props} view="targets"/>); await screen.findByLabelText('Minimum for Target item A (PIECES)');
  fireEvent.click(screen.getByRole('button', { name: 'Select all matching items' })); fireEvent.change(screen.getByLabelText('Reorder level for Target item B (PIECES)'), { target: { value: '6' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review selected changes' })); expect(screen.getByText('Review 2 selected items')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Reason for target changes (required)'), { target: { value: 'Monthly review' } }); fireEvent.click(screen.getByRole('button', { name: 'Save reviewed targets' }));
  await screen.findByRole('alert'); expect((apiClient.post as jest.Mock).mock.calls[0][1].items).toHaveLength(2); expect(screen.getByLabelText('Reorder level for Target item B (PIECES)')).toHaveValue(6); expect(screen.getByLabelText('Reason for target changes (required)')).toHaveValue('Monthly review');
});
it('read-only viewers can inspect saved units and history without changing target values', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({ ...data, rows: [{ ...item, history: [{ id: 'h1', actorId: 'manager', at: item.updatedAt, before: item, after: { ...item, reason: 'Saved target review', minStockLevel: 4 } }] }] });
  render(<ReplenishmentCenter {...props} caps={{ ...props.caps, approve: false }} view="targets"/>); await screen.findByText('Target change history (1)');
  expect(screen.getByText('Saved target review')).toBeInTheDocument(); expect(screen.getByLabelText('Minimum for Target item A (PIECES)')).toBeDisabled(); expect(screen.queryByRole('button', { name: 'Review selected changes' })).not.toBeInTheDocument();
});

it('ignores a slow previous URL scope so list and export cannot revert to stale records', async () => {
  let finishOld!: (value: any) => void;
  const old = new Promise(resolve => { finishOld = resolve; });
  const row = (reference: string) => ({ id: reference, reference, status: 'APPROVED', payload: { lines: [{ name: 'Scoped item', quantity: 1, unit: 'PIECES' }] } });
  (apiClient.get as jest.Mock).mockImplementation((url: string) => url.includes('status=DRAFT') ? old : Promise.resolve({ rows: [row('CURRENT-APPROVED')], totalPages: 1 }));
  const mounted = render(<ReplenishmentCenter {...props} view="SHORTBOOK" query={{ status: 'DRAFT' }} navigate={jest.fn()}/>);
  await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
  mounted.rerender(<ReplenishmentCenter {...props} view="SHORTBOOK" query={{ status: 'APPROVED' }} navigate={jest.fn()}/>);
  await screen.findByText('CURRENT-APPROVED');
  await act(async () => { finishOld({ rows: [row('STALE-DRAFT')], totalPages: 1 }); await old; });
  expect(screen.queryByText('STALE-DRAFT')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Download all matching lines' }));
  expect((downloadCsv as jest.Mock).mock.calls[0][1].map((value: any) => value.reference)).toEqual(['CURRENT-APPROVED']);
});
