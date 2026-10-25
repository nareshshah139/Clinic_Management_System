import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkflowDocumentEditor } from '@/components/inventory/WorkflowDocumentEditor';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { id: 'operator', branchId: 'branch' } }) }));

const statuses = ['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'POSTED', 'REJECTED', 'CANCELLED', 'REVERSED'];
function setup(status: string, write: boolean) {
  const doc = { id: 'old-count', kind: 'COUNT', status, version: 4, reference: 'OLD', payload: { reason: 'Physical verification', date: '2026-10-25', lines: [] }, events: [], effects: [] };
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => url.includes('/documents/') ? doc : []);
  (apiClient.post as jest.Mock).mockResolvedValue({ id: 'fresh-count', kind: 'COUNT', status: 'DRAFT' });
  const onOpen = jest.fn();
  render(<WorkflowDocumentEditor kind="COUNT" id="old-count" capabilities={{ kinds: { COUNT: { write } } }} onBack={jest.fn()} onOpen={onOpen} onInvoice={jest.fn()} />);
  return onOpen;
}

beforeEach(() => { jest.clearAllMocks(); sessionStorage.clear(); });
afterEach(cleanup);

/**
 * @cc [owner:nareshshah139,label:verification] count-ui-recovery-witness
 * Every supported saved COUNT status MUST expose a fresh-count command for a permitted writer,
 * send the retained source version, and open the returned draft without resaving old observations.
 */
async function assertRecovery(status: string) {
  const onOpen=setup(status,true);
  fireEvent.click(await screen.findByRole('button',{name:'Start fresh count'}));
  await waitFor(()=>expect(onOpen).toHaveBeenCalledWith('COUNT','fresh-count'));
  expect(apiClient.post).toHaveBeenCalledWith('/inventory/workspace/documents/old-count/transition',expect.objectContaining({version:4,action:'RECOUNT'}));
  expect(apiClient.patch).not.toHaveBeenCalled();
}
it.each(statuses)('exposes a usable fresh-count action from %s', assertRecovery);

it.each(statuses)('does not offer unauthorized recovery from %s', async status => {
  setup(status,false);
  await screen.findByRole('heading',{name:'OLD'});
  expect(screen.queryByRole('button',{name:'Start fresh count'})).not.toBeInTheDocument();
  expect(apiClient.post).not.toHaveBeenCalled();
});
