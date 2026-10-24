import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkflowDocumentEditor } from '@/components/inventory/WorkflowDocumentEditor';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { id: 'operator', branchId: 'branch' } }) }));

it.each(['DRAFT', 'CANCELLED'])('starts a fresh count from %s without saving old measurements', async status => {
  jest.clearAllMocks(); sessionStorage.clear();
  const doc = { id: 'old-count', kind: 'COUNT', status, version: 4, reference: 'OLD', payload: { reason: 'Reconcile', date: '2026-10-24', lines: [] }, events: [], effects: [] };
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => url.includes('/documents/') ? doc : []);
  (apiClient.post as jest.Mock).mockResolvedValue({ id: 'new-count', kind: 'COUNT', status: 'DRAFT' });
  const onOpen = jest.fn();
  render(<WorkflowDocumentEditor kind="COUNT" id="old-count" capabilities={{ kinds: { COUNT: { write: true } } }} onBack={jest.fn()} onOpen={onOpen} onInvoice={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Start fresh count' }));
  await waitFor(() => expect(onOpen).toHaveBeenCalledWith('COUNT', 'new-count'));
  expect(apiClient.patch).not.toHaveBeenCalled();
  expect(apiClient.post).toHaveBeenCalledWith('/inventory/workspace/documents/old-count/transition', expect.objectContaining({ version: 4, action: 'RECOUNT' }));
});
