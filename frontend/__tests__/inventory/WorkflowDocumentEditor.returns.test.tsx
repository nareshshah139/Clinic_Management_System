import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { WorkflowDocumentEditor } from '@/components/inventory/WorkflowDocumentEditor';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { id: 'operator', branchId: 'branch' } }) }));

const get = jest.mocked(apiClient.get);
const post = jest.mocked(apiClient.post);
const supplier = { id: 'supplier', name: 'Linae Distributors', gstNumber: '36ABCDE1234F1Z5' };
const lines = [{ id: 'line', inventoryId: 'batch', name: 'Synthetic Cream', unit: 'TUBES', quantity: 2, unitPrice: 112 }];
const challan = (status = 'CHALLAN', version = 4) => ({
  id: 'ret-1', kind: 'SUPPLIER_RETURN', status, version, reference: 'RET-1', requestKey: 'request', supplierId: 'supplier', supplierGstin: supplier.gstNumber,
  totalAmount: 224, payload: { date: '2026-11-02', returnReason: 'NEAR_EXPIRY', reason: 'Short-dated batch', lines }, events: [], effects: [],
});
const capabilities = (creditWrite: boolean) => ({ approve: false, creditWrite, kinds: { SUPPLIER_RETURN: { read: true, write: true }, CREDIT_NOTE: { read: true, write: true } } });
const armed = () => act(() => new Promise((resolve) => setTimeout(resolve, 320)));

function serve(doc: () => unknown) {
  get.mockImplementation(async (url: string) => {
    if (url.includes('/by-request/')) throw Object.assign(new Error('Not found'), { status: 404 });
    if (url.includes('/documents/')) return doc();
    if (url.includes('/suppliers')) return [supplier];
    return [];
  });
}

beforeAll(() => {
  jest.useFakeTimers({ now: new Date('2026-11-06T06:00:00.000Z'), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'nextTick', 'queueMicrotask'] });
});
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
});
afterEach(cleanup);

it('records the credit note on the return document itself and shows the return as posted', async () => {
  let current = challan();
  serve(() => current);
  post.mockImplementation(async () => {
    current = { ...challan('POSTED', 6) };
    return { credit: { id: 'credit-1', number: 'CN-91', date: '2026-11-05', amount: 224, applied: 0, available: 224 } };
  });
  render(<WorkflowDocumentEditor kind="SUPPLIER_RETURN" id="ret-1" capabilities={capabilities(true)} onBack={jest.fn()} onOpen={jest.fn()} onInvoice={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Record credit note' }));
  const dialog = screen.getByRole('dialog', { name: 'Record credit note from Linae Distributors' });
  expect(dialog).toHaveAccessibleDescription('For return RET-1 · return value ₹224.00');
  fireEvent.change(within(dialog).getByLabelText('Credit note no.'), { target: { value: 'cn-91' } });
  fireEvent.change(within(dialog).getByLabelText('Credit note date'), { target: { value: '05/11/2026' } });
  await armed();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record credit note' }));
  expect(await screen.findByText('Credit note CN-91 recorded: ₹224.00. Set it off against bills from Purchase bills › Returns.')).toBeInTheDocument();
  expect(post.mock.calls[0].slice(0, 2)).toEqual([
    '/inventory/workspace/documents/ret-1/credit-note',
    { requestKey: (post.mock.calls[0][2] as { idempotencyKey: string }).idempotencyKey, version: 4, number: 'CN-91', date: '2026-11-05', amount: 224 },
  ]);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Record credit note' })).not.toBeInTheDocument());
});

it('offers no Record credit note to someone who cannot write to the supplier ledger', async () => {
  serve(() => challan());
  render(<WorkflowDocumentEditor kind="SUPPLIER_RETURN" id="ret-1" capabilities={capabilities(false)} onBack={jest.fn()} onOpen={jest.fn()} onInvoice={jest.fn()} />);
  await screen.findByRole('button', { name: 'Cancel document' });
  expect(screen.queryByRole('button', { name: 'Record credit note' })).not.toBeInTheDocument();
});

it('saves the return reason as returnReason and calls the free text a note', async () => {
  serve(() => challan('DRAFT', 2));
  post.mockResolvedValue(challan('DRAFT', 2));
  render(
    <WorkflowDocumentEditor
      kind="SUPPLIER_RETURN"
      draftKey="new-return"
      initial={{ requestKey: 'new-return', supplierId: 'supplier', payload: { date: '2026-11-02', lines } }}
      capabilities={capabilities(true)}
      onBack={jest.fn()}
      onOpen={jest.fn()}
      onInvoice={jest.fn()}
    />,
  );
  fireEvent.change(await screen.findByLabelText('Reason for return'), { target: { value: 'BREAKAGE' } });
  fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'Two tubes crushed in transit' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(post).toHaveBeenCalled());
  expect((post.mock.calls[0][1] as { payload: Record<string, unknown> }).payload).toMatchObject({ returnReason: 'BREAKAGE', reason: 'Two tubes crushed in transit' });
});

it('takes the credit note number and date on a standalone supplier credit', async () => {
  serve(() => ({ id: 'cn-1', kind: 'CREDIT_NOTE', status: 'DRAFT', version: 1, reference: 'Rate difference', requestKey: 'cn', payload: { date: '2026-11-03', lines }, events: [], effects: [] }));
  post.mockResolvedValue({ id: 'cn-1', kind: 'CREDIT_NOTE', status: 'DRAFT', version: 1, reference: 'Rate difference', requestKey: 'cn', payload: { date: '2026-11-03', lines }, events: [], effects: [] });
  render(
    <WorkflowDocumentEditor
      kind="CREDIT_NOTE"
      draftKey="new-credit"
      initial={{ requestKey: 'new-credit', supplierId: 'supplier', payload: { date: '2026-11-03', lines } }}
      capabilities={capabilities(true)}
      onBack={jest.fn()}
      onOpen={jest.fn()}
      onInvoice={jest.fn()}
    />,
  );
  fireEvent.change(await screen.findByLabelText('Credit note no.'), { target: { value: 'CN-SC-1' } });
  fireEvent.change(screen.getByLabelText('Credit note date'), { target: { value: '2026-11-04' } });
  expect(screen.getByLabelText('Credit note date')).toHaveAttribute('max', '2026-11-06');
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(post).toHaveBeenCalled());
  expect((post.mock.calls[0][1] as { payload: Record<string, unknown> }).payload).toMatchObject({ creditNoteNumber: 'CN-SC-1', creditNoteDate: '2026-11-04' });
});
