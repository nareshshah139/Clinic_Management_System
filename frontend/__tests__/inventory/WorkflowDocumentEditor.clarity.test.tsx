import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => { if (url.includes('/by-request/')) throw Object.assign(new Error('Not found'), { status: 404 }); return url.includes('/documents/') ? doc : url.includes('/hold-sources') ? { rows: [], totalPages: 1 } : []; });
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
    if (url.endsWith('/saved-document')) { if (!readable) throw new Error('Readback unavailable'); return { ...draft, status: 'POSTED', version: 3 }; }
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
  defaultGet({ ...old, status: 'POSTED', version: 3 });
  (apiClient.post as jest.Mock).mockResolvedValue({ ...old, status: 'POSTED', version: 3 });
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
  ['REVERSED', /^A linked reversal compensated/i],
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
  expect(await screen.findByText(/colleague.*stock.count.*permission/i, { selector: 'p' })).toBeInTheDocument();
  expect((screen.getByRole('textbox', { name: 'Recovery handoff' }) as HTMLTextAreaElement).value).toContain('saved-document');
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
  (apiClient.post as jest.Mock).mockResolvedValue({ ...doc, version: 3 });
  mount('COUNT', { id: doc.id });
  fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }));
  await screen.findByRole('button', { name: 'Check saved status' });
  expectWritesBlocked();
  readable = true;
  fireEvent.click(screen.getByRole('button', { name: 'Check saved status' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled());
  expect(apiClient.patch).toHaveBeenCalledTimes(1);
});

it('does not dispatch if durable recovery cannot be saved before a new stock operation', async () => {
  defaultGet(savedDocument('LOSS'));
  mount('LOSS', { draftKey: 'blocked-storage', initial: { requestKey: 'original-request', payload } });
  await screen.findByRole('button', { name: 'Post stock loss' });
  const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
  fireEvent.click(screen.getByRole('button', { name: 'Post stock loss' }));
  await screen.findByText(/No request was sent/);
  expect(apiClient.post).not.toHaveBeenCalled();
  setItem.mockRestore();
});

it('keeps corrupt retained recovery blocked and provides an audit handoff instead of creating a fresh request', async () => {
  sessionStorage.setItem('inventory-document:branch:operator:LOSS:corrupt:', '{broken');
  defaultGet(savedDocument('LOSS'));
  mount('LOSS', { draftKey: 'corrupt' });
  expect(await screen.findByRole('link', { name: 'Open Counts & audit' })).toHaveAttribute('href', '?area=stock&view=COUNT');
  expectWritesBlocked();
  fireEvent.click(screen.getByRole('button', { name: 'Check saved status' }));
  expect(apiClient.post).not.toHaveBeenCalled();
});

it('does not repeat an unresolved creation after losing write permission', async () => {
  sessionStorage.setItem('inventory-document:branch:operator:LOSS:readonly-pending:', JSON.stringify({ schemaVersion: 2, form: { kind: 'LOSS', reference: 'REF', requestKey: 'original-request', payload }, pending: { operation: 'create' } }));
  defaultGet(savedDocument('LOSS'));
  mount('LOSS', { draftKey: 'readonly-pending', capabilities: capabilities('LOSS', false) });
  fireEvent.click(await screen.findByRole('button', { name: 'Check saved status' }));
  await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/inventory/workspace/documents/by-request/original-request'));
  expect((screen.getByRole('textbox', { name: 'Recovery handoff' }) as HTMLTextAreaElement).value).toContain('original-request');
  expect(apiClient.post).not.toHaveBeenCalled();
});

it('renders a structured held-stock rejection with batch and source navigation after confirmed readback', async () => {
  defaultGet();
  (apiClient.patch as jest.Mock).mockResolvedValue(savedDocument());
  (apiClient.post as jest.Mock).mockRejectedValue(Object.assign(new Error('Physical count is below held stock'), { status: 400, body: { code: 'INVENTORY_HELD_STOCK', stockEffect: 'NONE', recovery: { action: 'REVIEW_BATCH', inventoryId: 'batch', sourceId: 'source-return', sourceKind: 'SALES_RETURN', documents: [{ id: 'loss', kind: 'LOSS', reference: 'Loss record' }] } } }));
  const onOpen = jest.fn();
  mount('COUNT', { id: 'saved-document', onOpen });
  fireEvent.click(await screen.findByRole('button', { name: 'Submit count' }));
  expect(await screen.findByText(/This rejected attempt made no stock change/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Inspect batch balance and holds' })).toHaveAttribute('href', '?area=stock&view=list&item=batch');
  fireEvent.click(screen.getByRole('button', { name: 'Open blocking source hold' }));
  expect(onOpen).toHaveBeenCalledWith('SALES_RETURN', 'source-return');
  fireEvent.click(screen.getByRole('button', { name: 'Open Loss record' }));
  expect(onOpen).toHaveBeenCalledWith('LOSS', 'loss');
});

it('opens conversion and reversal destinations recorded in the saved history', async () => {
  const converted = { ...savedDocument('QUOTATION', 'CONVERTED'), events: [{ id: 'event', createdAt: '2026-10-25', detail: { destinationId: 'destination-sale' } }] };
  defaultGet(converted);
  const onOpen = jest.fn();
  const view = mount('QUOTATION', { id: converted.id, onOpen });
  fireEvent.click(await screen.findByRole('button', { name: 'Open linked sale draft' }));
  expect(onOpen).toHaveBeenCalledWith('COUNTER_SALE', 'destination-sale');
  view.unmount();
  sessionStorage.clear();
  defaultGet({ ...savedDocument('LOSS', 'REVERSED'), events: [{ id: 'event', createdAt: '2026-10-25', detail: { correctionId: 'correction' } }] });
  mount('LOSS', { id: 'saved-document', onOpen });
  fireEvent.click(await screen.findByRole('button', { name: 'Open linked correction' }));
  expect(onOpen).toHaveBeenCalledWith('CORRECTION', 'correction');
});

it('retries loading an initial invoice source without creating a blank inventory document', async () => {
  let sourceAvailable = false;
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => {
    if (url === '/pharmacy/purchase-invoices/invoice-source') {
      if (!sourceAvailable) throw new Error('Source invoice unavailable');
      return { id: 'invoice-source', distributorName: 'Supplier', distributorGstin: 'GST', invoiceNumber: 'BILL-25', items: [] };
    }
    return [];
  });
  mount('CREDIT_NOTE', { draftKey: 'source-retry', initial: { purchaseInvoiceId: 'invoice-source' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Retry loading' }));
  expect(apiClient.post).not.toHaveBeenCalled();
  sourceAvailable = true;
  fireEvent.click(await screen.findByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Post supplier credit' })).toBeEnabled());
  expect((apiClient.get as jest.Mock).mock.calls.filter(([url]) => url === '/pharmacy/purchase-invoices/invoice-source').length).toBeGreaterThanOrEqual(2);
  expect(apiClient.post).not.toHaveBeenCalled();
});

it('does not unlock on an unchanged read while a stock transition may still commit, then fences it explicitly', async () => {
  let server = savedDocument('LOSS');
  let pendingVersion: number | undefined;
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => url.includes('/documents/') ? server : url.includes('/hold-sources') ? { rows: [], totalPages: 1 } : []);
  (apiClient.patch as jest.Mock).mockImplementation(async () => { server = { ...server, version: 3 }; return server; });
  (apiClient.post as jest.Mock).mockImplementation(async (url: string, body: any) => {
    if (url.endsWith('/transition')) { pendingVersion = body.version; throw new Error('Connection lost before commit'); }
    if (url.endsWith('/resolve')) { expect(body).toEqual({ version: 3 }); server = { ...server, version: 4 }; return server; }
    throw new Error('Unexpected mutation');
  });
  mount('LOSS', { id: 'saved-document' });
  fireEvent.click(await screen.findByRole('button', { name: 'Post stock loss' }));
  await screen.findByRole('button', { name: 'Check saved status' });
  expectWritesBlocked();
  expect(pendingVersion).toBe(3);
  fireEvent.click(screen.getByRole('button', { name: 'Check saved status' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Post stock loss' })).toBeEnabled());
  expect(apiClient.post).toHaveBeenCalledWith('/inventory/workspace/documents/saved-document/resolve', { version: 3 });
  expect(server.version).not.toBe(pendingVersion);
  expect((apiClient.post as jest.Mock).mock.calls.filter(([url]) => url.endsWith('/transition'))).toHaveLength(1);
});

it('keeps readonly unchanged revisions unresolved and shares the expected revision for an authorized fence', async () => {
  defaultGet(savedDocument());
  mount('COUNT', { id: 'saved-document', recoveryVersion: 2, recoveryOperation: 'transition', capabilities: capabilities('COUNT', false) });
  fireEvent.click(await screen.findByRole('button', { name: 'Check saved status' }));
  await screen.findByText(/interrupted request may still finish/i);
  expectWritesBlocked();
  expect((screen.getByRole('textbox', { name: 'Recovery handoff' }) as HTMLTextAreaElement).value).toContain('recoverOperation=transition&recoverVersion=2');
  expect(apiClient.post).not.toHaveBeenCalled();
});

it('finds the exact saved outcome from a request-key handoff without write permission', async () => {
  const doc = { ...savedDocument('LOSS', 'POSTED'), version: 3 };
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => url.includes('/by-request/original-request') ? doc : url.includes('/hold-sources') ? { rows: [], totalPages: 1 } : []);
  mount('LOSS', { recoveryRequestKey: 'original-request', capabilities: capabilities('LOSS', false) });
  expect(await screen.findByText(/Saved stock effects record the units removed for loss/i)).toBeInTheDocument();
  expect(apiClient.get).toHaveBeenCalledWith('/inventory/workspace/documents/by-request/original-request');
  expect(apiClient.post).not.toHaveBeenCalled();
});

it('does not infer no stock or create a new record when a colleague request lookup is missing', async () => {
  defaultGet(savedDocument('LOSS'));
  mount('LOSS', { recoveryRequestKey: 'missing-request' });
  fireEvent.click(await screen.findByRole('button', { name: 'Check saved status' }));
  await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/inventory/workspace/documents/by-request/missing-request'));
  expectWritesBlocked();
  expect(screen.getByRole('link', { name: 'Open Counts & audit' })).toBeInTheDocument();
  expect(apiClient.post).not.toHaveBeenCalled();
});

it.each([['CORRECTION', 'POSTED'], ['HOLD', 'RELEASED']])('does not offer an unsupported reversal for %s %s', async (kind, status) => {
  defaultGet(savedDocument(kind, status));
  mount(kind, { id: 'saved-document' });
  expect(await screen.findByRole('link', { name: 'Open Counts & audit' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Correct by reversal' })).not.toBeInTheDocument();
  expect(screen.queryByText(/ask a manager.*Correct by reversal/i)).not.toBeInTheDocument();
});

it.each(['CREDIT_NOTE', 'GATE_PASS'])('explains a %s reversal without claiming stock compensation', async kind => {
  defaultGet(savedDocument(kind, 'REVERSED'));
  mount(kind, { id: 'saved-document' });
  expect(await screen.findByText('Neither the original document nor its reversal changed physical stock.')).toBeInTheDocument();
  expect(screen.queryByText(/stock effects show the quantities compensated/i)).not.toBeInTheDocument();
});

it('does not apply a late record response to a different route', async () => {
  let finishOld: (doc: any) => void = () => {};
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => {
    if (url.endsWith('/old')) return new Promise(resolve => { finishOld = resolve; });
    if (url.endsWith('/new')) return { ...savedDocument(), id: 'new', reference: 'NEW RECORD' };
    return [];
  });
  const props = { kind: 'COUNT', capabilities: capabilities('COUNT'), onBack: jest.fn(), onOpen: jest.fn(), onInvoice: jest.fn() };
  const view = render(<WorkflowDocumentEditor {...props} id="old" />);
  view.rerender(<WorkflowDocumentEditor {...props} id="new" />);
  await screen.findByRole('heading', { name: 'NEW RECORD' });
  finishOld({ ...savedDocument(), id: 'old', reference: 'OLD RECORD' });
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'OLD RECORD' })).not.toBeInTheDocument());
  expect(screen.getByRole('heading', { name: 'NEW RECORD' })).toBeInTheDocument();
  expect(JSON.parse(sessionStorage.getItem('inventory-document:branch:operator:COUNT:new:')!).documentId).toBe('new');
});

it('retains rejected unsaved observations when the saved draft revision is unchanged', async () => {
  defaultGet();
  (apiClient.patch as jest.Mock).mockRejectedValue(Object.assign(new Error('Correct the draft details'), { status: 400 }));
  mount('COUNT', { id: 'saved-document' });
  fireEvent.change(await screen.findByRole('spinbutton', { name: 'Physical count 1' }), { target: { value: '7' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await screen.findByText(/Your attempted edits remain in the form and have not been saved/);
  expect(screen.getByRole('spinbutton', { name: 'Physical count 1' })).toHaveValue(7);
  expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
});

it.each(['PART_RECEIVED', 'RECEIVED'])('explains supported SHORTBOOK %s through its linked purchase order', async status => {
  defaultGet({ ...savedDocument('SHORTBOOK', status), events: [{ id: 'conversion', createdAt: '2026-10-25', detail: { destinationId: 'linked-order' } }] });
  const onOpen = jest.fn();
  mount('SHORTBOOK', { id: 'saved-document', onOpen });
  expect(await screen.findByText(/Demand on this shortbook.*linked purchase order.*receipts/i)).toBeInTheDocument();
  expect(screen.queryByText('Status needs review')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open linked purchase order' }));
  expect(onOpen).toHaveBeenCalledWith('PURCHASE_ORDER', 'linked-order');
  expect(screen.queryByRole('link', { name: 'Review linked receipts' })).not.toBeInTheDocument();
});

it.each([['SHORTBOOK', 'Create purchase order', 'CREATE_PO', 'PURCHASE_ORDER'], ['QUOTATION', 'Create sale draft', 'CONVERT_SALE', 'COUNTER_SALE']])('converts an approved %s using its supported action', async (kind, label, action, nextKind) => {
  defaultGet(savedDocument(kind, 'APPROVED'));
  (apiClient.post as jest.Mock).mockResolvedValue({ id: 'converted', kind: nextKind, status: 'DRAFT' });
  const onOpen = jest.fn();
  mount(kind, { id: 'saved-document', onOpen });
  fireEvent.click(await screen.findByRole('button', { name: label }));
  await waitFor(() => expect(onOpen).toHaveBeenCalledWith(nextKind, 'converted'));
  expect(apiClient.post).toHaveBeenCalledWith('/inventory/workspace/documents/saved-document/transition', expect.objectContaining({ action }));
});

it.each(['SHORTBOOK', 'PURCHASE_ORDER'])('explains retained receipts when a %s remainder was cancelled', async kind => {
  defaultGet({ ...savedDocument(kind, 'CANCELLED'), payload: { ...payload, cancelledRemaining: { reason: 'No more goods needed' } } });
  mount(kind, { id: 'saved-document' });
  expect(await screen.findByText('The remaining order or demand was cancelled. Any earlier receipts and their stock effects are retained.')).toBeInTheDocument();
  expect(screen.queryByText('This document was cancelled and did not change stock.')).not.toBeInTheDocument();
  if (kind === 'PURCHASE_ORDER') expect(screen.getByRole('link', { name: 'Review linked receipts' })).toHaveAttribute('href', '?area=purchases&view=INWARD_CHALLAN&sourceId=saved-document');
  else expect(screen.getByRole('link', { name: 'Find the linked purchase order' })).toBeInTheDocument();
});

it('prominently explains the actual recorded rejection reason', async () => {
  defaultGet({ ...savedDocument('COUNT', 'REJECTED'), events: [{ id: 'reject', action: 'REJECT', toStatus: 'REJECTED', createdAt: '2026-10-25', detail: { reason: 'Recount both shelves before approval' } }] });
  mount('COUNT', { id: 'saved-document' });
  expect(await screen.findByText(/This proposal was rejected.*Reason: Recount both shelves before approval/)).toBeInTheDocument();
});

it('explains partially reviewed reorder targets and opens the actual review surface', async () => {
  defaultGet(savedDocument('TARGET_REVIEW', 'PART_REVIEWED'));
  mount('TARGET_REVIEW', { id: 'saved-document' });
  expect(await screen.findByText(/Accepted lines changed reorder targets; remaining lines still need review/)).toBeInTheDocument();
  expect(screen.getByText('Reviewing reorder targets does not change physical stock.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open Reorder target review' })).toHaveAttribute('href', '?area=reorder&view=TARGET_REVIEW');
});

it('explains legacy sent orders without claiming delivery or stock receipt', async () => {
  defaultGet(savedDocument('PURCHASE_ORDER', 'SENT'));
  mount('PURCHASE_ORDER', { id: 'saved-document' });
  expect(await screen.findByText('This order is recorded as sent. Verify the saved delivery evidence with the supplier.')).toBeInTheDocument();
  expect(screen.getByText('Sending an order does not add stock. Only posted receipts record goods actually received.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Review linked receipts' })).toBeInTheDocument();
});

it.each([false, true])('keeps malformed retained line objects in recovery instead of crashing (pending envelope %s)', async pending => {
  const form = { kind: 'LOSS', reference: 'REF', requestKey: 'original-request', payload: { ...payload, lines: [null] } };
  sessionStorage.setItem('inventory-document:branch:operator:LOSS:bad-lines:', JSON.stringify({ schemaVersion: 2, form: pending ? { ...form, payload } : form, ...(pending ? { pending: { operation: 'create', creation: form } } : {}) }));
  defaultGet(savedDocument('LOSS'));
  mount('LOSS', { draftKey: 'bad-lines' });
  expect(await screen.findByRole('link', { name: 'Open Counts & audit' })).toBeInTheDocument();
  expectWritesBlocked();
  fireEvent.click(screen.getByRole('button', { name: 'Check saved status' }));
  expect(apiClient.post).not.toHaveBeenCalled();
});
