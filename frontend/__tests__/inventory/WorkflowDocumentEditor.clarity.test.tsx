import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { WorkflowDocumentEditor } from '@/components/inventory/WorkflowDocumentEditor';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { id: 'operator', branchId: 'branch' } }) }));

const payload = { reason: 'Physical verification', date: '2026-10-25', lines: [{ id: 'line', inventoryId: 'batch', name: 'Batch A', unit: 'TABLET', systemStock: 5, physicalStock: 6, quantity: 1 }] };
const savedDocument = (kind = 'COUNT', status = 'DRAFT') => ({ id: 'saved-document', kind, status, version: 2, reference: 'REF-25', requestKey: 'original-request', payload, events: [], effects: [] });
const capabilities = (kind: string, write = true) => ({ approve: write, kinds: { [kind]: { read: true, write } } });
function mount(kind = 'COUNT', props: Record<string, any> = {}) {
  return render(<WorkflowDocumentEditor kind={kind} capabilities={capabilities(kind)} onBack={jest.fn()} onOpen={jest.fn()} onInvoice={jest.fn()} {...props} />);
}
function defaultGet(doc = savedDocument()) {
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => url.includes('/documents/') ? doc : url.includes('/hold-sources') ? { rows: [], totalPages: 1 } : []);
}
function expectWritesBlocked() {
  for (const name of ['Save draft', 'Submit count', 'Post stock loss', 'Start fresh count', 'Cancel document', 'Correct by reversal', 'Reverse posted effects']) {
    const button = screen.queryByRole('button', { name });
    if (button) expect(button).toBeDisabled();
  }
  expect(screen.queryByText(/Draft.*no stock change/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Stock has not changed/i)).not.toBeInTheDocument();
}
beforeEach(() => { jest.clearAllMocks(); sessionStorage.clear(); });
afterEach(cleanup);

it('keeps a failed existing lookup distinct from a new draft and retries the exact ID', async () => {
  let available = false;
  defaultGet();
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => {
    if (url.endsWith('/saved-document')) { if (!available) throw new Error('Lookup unavailable'); return savedDocument(); }
    return [];
  });
  mount('COUNT', { id: 'saved-document' });
  await screen.findByRole('button', { name: 'Retry loading' });
  expectWritesBlocked();
  expect(screen.getByText(/saved-document/)).toBeInTheDocument();
  available = true;
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit count' })).toBeEnabled());
  expect(apiClient.post).not.toHaveBeenCalled();
});

it.each(['COUNT', 'LOSS'])('retains %s identity and uncertainty after a lost transition and remount', async kind => {
  const draft = savedDocument(kind);
  let readable = false;
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => {
    if (url.endsWith('/saved-document')) { if (!readable) throw new Error('Readback unavailable'); return { ...draft, status: 'POSTED' }; }
    return url.includes('/hold-sources') ? { rows: [], totalPages: 1 } : [];
  });
  (apiClient.post as jest.Mock).mockImplementation(async (url: string) => {
    if (url === '/inventory/workspace/documents') return draft;
    throw new Error('Response lost');
  });
  const first = mount(kind, { draftKey: 'lost-operation', initial: { requestKey: 'original-request', payload } });
  fireEvent.click(await screen.findByRole('button', { name: kind === 'COUNT' ? 'Submit count' : 'Post stock loss' }));
  await screen.findByRole('button', { name: 'Check saved status' });
  expectWritesBlocked();
  first.unmount();
  mount(kind, { draftKey: 'lost-operation', initial: { requestKey: 'original-request', payload } });
  await screen.findByRole('button', { name: 'Check saved status' });
  expectWritesBlocked();
  readable = true;
  fireEvent.click(screen.getByRole('button', { name: 'Check saved status' }));
  await screen.findByText(/Saved stock effects|Count applied/i);
  expect((apiClient.post as jest.Mock).mock.calls.filter(([url]) => url.endsWith('/transition'))).toHaveLength(1);
});

it('recovers an unknown creation with the exact retained request and never replays its transition', async () => {
  defaultGet(savedDocument('LOSS'));
  let attempts = 0;
  const creation = { kind: 'LOSS', reference: 'LOSS-25', requestKey: 'original-request', supplierId: '', sourceId: '', payload };
  (apiClient.post as jest.Mock).mockImplementation(async (url: string) => {
    expect(url).toBe('/inventory/workspace/documents');
    if (++attempts === 1) throw new Error('Creation response lost');
    return savedDocument('LOSS');
  });
  const first = mount('LOSS', { draftKey: 'lost-create', initial: creation });
  fireEvent.click(await screen.findByRole('button', { name: 'Post stock loss' }));
  await screen.findByRole('button', { name: 'Check saved status' });
  expectWritesBlocked();
  first.unmount();
  mount('LOSS', { draftKey: 'lost-create' });
  fireEvent.click(await screen.findByRole('button', { name: 'Check saved status' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Post stock loss' })).toBeEnabled());
  expect(apiClient.post).toHaveBeenNthCalledWith(1, '/inventory/workspace/documents', creation);
  expect(apiClient.post).toHaveBeenNthCalledWith(2, '/inventory/workspace/documents', creation);
});

it('recovers a legacy saved draft by its original request key without asserting no stock change', async () => {
  const old = savedDocument('LOSS');
  sessionStorage.setItem('inventory-document:branch:operator:LOSS:legacy:', JSON.stringify({ version: old.version, form: { kind: old.kind, reference: old.reference, requestKey: old.requestKey, payload } }));
  defaultGet({ ...old, status: 'POSTED' });
  (apiClient.post as jest.Mock).mockResolvedValue({ ...old, status: 'POSTED' });
  mount('LOSS', { draftKey: 'legacy' });
  fireEvent.click(await screen.findByRole('button', { name: 'Check saved status' }));
  await screen.findByText(/Saved stock effects/i);
  expect(apiClient.post).toHaveBeenCalledWith('/inventory/workspace/documents', expect.objectContaining({ requestKey: 'original-request' }));
  expect((apiClient.post as jest.Mock).mock.calls.some(([url]) => url.endsWith('/transition'))).toBe(false);
});

it.each([
  ['DRAFT', /Submitting can apply the count|may require approval/i],
  ['AWAITING_APPROVAL', /waiting for.*approval.*stock has not changed/i],
  ['APPROVED', /approved.*stock has not changed.*Apply approved count/i],
  ['POSTED', /Count applied|count.*verified/i],
  ['REJECTED', /rejected.*did not change stock/i],
  ['CANCELLED', /cancelled.*did not change stock/i],
  ['REVERSED', /reversal.*compensat|compensat.*reversal/i],
])('explains COUNT %s with a named recovery path', async (status, explanation) => {
  defaultGet(savedDocument('COUNT', status as string));
  mount('COUNT', { id: 'saved-document' });
  expect(await screen.findByText(explanation as RegExp)).toBeInTheDocument();
  expect(screen.getByText(/fresh count.*retains.*clears|retains.*fresh count.*clears/i)).toBeInTheDocument();
  if (status === 'APPROVED') expect(screen.getByRole('button', { name: 'Apply approved count' })).toBeEnabled();
});

it.each(['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'POSTED', 'REJECTED', 'CANCELLED', 'REVERSED'])('gives a readonly COUNT %s an explicit authorized handoff', async status => {
  defaultGet(savedDocument('COUNT', status));
  mount('COUNT', { id: 'saved-document', capabilities: capabilities('COUNT', false) });
  expect(await screen.findByText(/colleague.*stock.count.*permission/i)).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Recovery handoff' })).toHaveValue(expect.stringContaining('saved-document'));
  expect(screen.queryByRole('button', { name: 'Start fresh count' })).not.toBeInTheDocument();
});

it.each([
  ['SUPPLIER_RETURN', 'CHALLAN', /stock.*already.*returned|stock.*sent.*supplier/i],
  ['HOLD', 'RELEASED', /held.*released.*physical|physical.*unchanged.*available/i],
  ['PURCHASE_ORDER', 'PART_RECEIVED', /part.*received.*linked receipt/i],
  ['PURCHASE_ORDER', 'RECEIVED', /received.*linked receipt/i],
  ['SHORTBOOK', 'ORDERED', /purchase order.*stock.*unchanged/i],
  ['QUOTATION', 'CONVERTED', /sale draft.*stock.*unchanged/i],
])('explains generic %s %s without raw status shorthand', async (kind, status, explanation) => {
  defaultGet(savedDocument(kind as string, status as string));
  mount(kind as string, { id: 'saved-document' });
  expect(await screen.findByText(explanation as RegExp)).toBeInTheDocument();
});

it('keeps a failed save locked until its saved record can be checked', async () => {
  const doc = savedDocument();
  let readable = true;
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => {
    if (url.endsWith('/saved-document')) { if (!readable) throw new Error('Readback unavailable'); return doc; }
    return [];
  });
  (apiClient.patch as jest.Mock).mockImplementation(async () => { readable = false; throw new Error('Save response lost'); });
  mount('COUNT', { id: doc.id });
  fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }));
  await screen.findByRole('button', { name: 'Check saved status' });
  expectWritesBlocked();
  readable = true;
  fireEvent.click(screen.getByRole('button', { name: 'Check saved status' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled());
  expect(apiClient.patch).toHaveBeenCalledTimes(1);
});
