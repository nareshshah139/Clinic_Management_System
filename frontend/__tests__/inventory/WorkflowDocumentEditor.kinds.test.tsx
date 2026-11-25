import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { WorkflowDocumentEditor } from '@/components/inventory/WorkflowDocumentEditor';
import { workflowKinds } from '@/components/inventory/workspace-model';
import { workflowKindSpecs } from '@/components/inventory/workflow-document-kinds';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { id: 'operator', branchId: 'branch' } }) }));

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const DOC_ID = '3f2b8c1e-6a4d-4e0f-9b7a-1c2d3e4f5a6b';
const lines = [
  { id: 'a1b2c3d4-0000-4000-8000-000000000001', inventoryId: 'batch-1', name: 'Paracetamol 500', unit: 'TABLET', quantity: 5, freeQuantity: 0, unitPrice: 2, gstRate: 12, discountPercent: 0, schemeAmount: 0 },
  { id: 'a1b2c3d4-0000-4000-8000-000000000002', inventoryId: 'batch-2', name: 'Cetirizine 10', unit: 'TABLET', quantity: 7, freeQuantity: 0, unitPrice: 3, gstRate: 12, discountPercent: 0, schemeAmount: 0 },
];
const saved = (kind: string, status = 'DRAFT', extra: Record<string, any> = {}) => ({
  id: DOC_ID, kind, status, version: 2, reference: `${kind}-REF`, requestKey: 'request', payload: { date: '2026-11-05', reason: 'Fell off the shelf', lines }, events: [], effects: [], ...extra,
});
const capabilities = (kind: string, write = true) => ({ approve: write, selfApprove: true, kinds: { [kind]: { read: true, write } } });
function serve(doc: any) {
  (apiClient.get as jest.Mock).mockImplementation(async (url: string) => {
    if (url.includes('/by-request/')) throw Object.assign(new Error('Not found'), { status: 404 });
    if (url.includes('/documents/')) return doc;
    if (url.includes('/hold-sources')) return { rows: [], totalPages: 1 };
    return [];
  });
}
function mount(kind: string, props: Record<string, any> = {}) {
  return render(<WorkflowDocumentEditor kind={kind} id={DOC_ID} capabilities={capabilities(kind)} onBack={jest.fn()} onOpen={jest.fn()} onInvoice={jest.fn()} {...props} />);
}
const headers = () => screen.getAllByRole('columnheader').map((cell) => cell.textContent);

beforeEach(() => { jest.clearAllMocks(); sessionStorage.clear(); });
afterEach(cleanup);

describe('kind registry', () => {
  it('describes every workflow kind and keeps commercial in step with its rate column', () => {
    expect(Object.keys(workflowKindSpecs).sort()).toEqual(Object.keys(workflowKinds).sort());
    for (const [kind, spec] of Object.entries(workflowKindSpecs)) {
      expect({ kind, rate: spec.columns.includes('unitPrice') }).toEqual({ kind, rate: spec.commercial });
      expect(spec.outcomeSummary.length).toBeGreaterThan(0);
    }
  });
});

describe('columns follow the kind', () => {
  it.each(['LOSS', 'HOLD', 'GATE_PASS'])('shows %s with a quantity column and no pricing columns', async (kind) => {
    serve(saved(kind));
    mount(kind);
    await screen.findByRole('heading', { name: `${kind}-REF` });
    expect(headers()).toEqual(['Product & batch', 'Quantity', 'Remove']);
    expect(screen.queryByText(/Rate excl\. GST|Discount %|Scheme ₹|GST %/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Taxable/)).not.toBeInTheDocument();
    expect(screen.queryByText(/MRP/)).not.toBeInTheDocument();
  });

  it('shows a sale with rate, discount, scheme, GST and totals', async () => {
    serve(saved('COUNTER_SALE'));
    mount('COUNTER_SALE');
    await screen.findByRole('heading', { name: 'COUNTER_SALE-REF' });
    expect(headers()).toEqual(['Product & batch', 'Quantity', 'Free', 'Rate excl. GST', 'Discount %', 'Scheme ₹', 'GST %', 'Total', 'Remove']);
    expect(screen.getByText(/Taxable/)).toBeInTheDocument();
  });

  it('labels each cell with its column and row in plain words', async () => {
    serve(saved('COUNTER_SALE'));
    mount('COUNTER_SALE');
    expect(await screen.findByRole('spinbutton', { name: 'Quantity, row 2' })).toHaveValue(7);
    expect(screen.getByRole('spinbutton', { name: 'Rate excl. GST, row 1' })).toHaveValue(2);
    expect(screen.getByRole('spinbutton', { name: 'GST %, row 2' })).toHaveValue(12);
    for (const input of screen.getAllByRole('spinbutton')) expect(input.getAttribute('aria-label')).not.toMatch(/[a-z][A-Z]/);
  });
});

describe('numeric cells', () => {
  it('keeps a cleared quantity empty while editing and refuses to save it', async () => {
    serve(saved('LOSS'));
    mount('LOSS');
    const quantity = await screen.findByRole('spinbutton', { name: 'Quantity, row 2' });
    fireEvent.change(quantity, { target: { value: '' } });
    expect(screen.getByRole('spinbutton', { name: 'Quantity, row 2' })).toHaveValue(null);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Row 2 (Cetirizine 10): Quantity is required.');
    expect(apiClient.patch).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: /Recovery details/ })).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Quantity, row 2' })).toHaveValue(null);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantity, row 2' }), { target: { value: '4' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    (apiClient.patch as jest.Mock).mockResolvedValue(saved('LOSS', 'DRAFT', { version: 3 }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    const sent = (apiClient.patch as jest.Mock).mock.calls[0][1];
    expect(sent.payload.lines.map((line: any) => line.quantity)).toEqual([5, 4]);
  });

  it('saves a blanked optional cell as zero', async () => {
    serve(saved('COUNTER_SALE'));
    (apiClient.patch as jest.Mock).mockResolvedValue(saved('COUNTER_SALE', 'DRAFT', { version: 3 }));
    mount('COUNTER_SALE');
    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Discount %, row 1' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    expect((apiClient.patch as jest.Mock).mock.calls[0][1].payload.lines[0].discountPercent).toBe(0);
  });

  it('refuses a blank rate on a sale', async () => {
    serve(saved('COUNTER_SALE'));
    mount('COUNTER_SALE');
    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Rate excl. GST, row 1' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post sale' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Row 1 (Paracetamol 500): Rate excl. GST is required.');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(apiClient.patch).not.toHaveBeenCalled();
  });
});

describe('irreversible actions', () => {
  const transition = () => (apiClient.post as jest.Mock).mock.calls.filter(([url]) => url.endsWith('/transition'));

  it('asks before posting a loss, names the effect, and posts nothing when declined', async () => {
    serve(saved('LOSS'));
    mount('LOSS');
    fireEvent.click(await screen.findByRole('button', { name: 'Post stock loss' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Post this loss?')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Stock for 2 items drops by 12 units.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(apiClient.patch).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('posts the saved loss only after the pharmacist confirms', async () => {
    serve(saved('LOSS'));
    (apiClient.patch as jest.Mock).mockResolvedValue(saved('LOSS', 'DRAFT', { version: 3 }));
    (apiClient.post as jest.Mock).mockImplementation(async () => {
      serve(saved('LOSS', 'POSTED', { version: 4 }));
      return {};
    });
    mount('LOSS');
    fireEvent.click(await screen.findByRole('button', { name: 'Post stock loss' }));
    expect(apiClient.post).not.toHaveBeenCalled();
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Post stock loss' }));
    await waitFor(() => expect(transition()).toHaveLength(1));
    expect(transition()[0]).toEqual([`/inventory/workspace/documents/${DOC_ID}/transition`, { version: 3, action: 'POST', reason: 'Fell off the shelf' }]);
    expect(apiClient.patch).toHaveBeenCalledWith(`/inventory/workspace/documents/${DOC_ID}`, expect.objectContaining({ version: 2 }));
  });

  it('asks before posting a sale', async () => {
    serve(saved('COUNTER_SALE'));
    mount('COUNTER_SALE');
    fireEvent.click(await screen.findByRole('button', { name: 'Post sale' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Post this sale?');
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('asks before cancelling and cancels only after confirmation', async () => {
    serve(saved('LOSS'));
    (apiClient.post as jest.Mock).mockImplementation(async () => {
      serve(saved('LOSS', 'CANCELLED', { version: 3 }));
      return {};
    });
    mount('LOSS');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel document' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Cancel this document?');
    expect(apiClient.post).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, cancel it' }));
    await waitFor(() => expect(transition()).toHaveLength(1));
    expect(transition()[0][1]).toMatchObject({ version: 2, action: 'CANCEL' });
  });

  it('asks before rejecting a proposal and rejects only after confirmation', async () => {
    serve(saved('LOSS', 'AWAITING_APPROVAL', { createdBy: 'someone-else' }));
    (apiClient.post as jest.Mock).mockImplementation(async () => {
      serve(saved('LOSS', 'REJECTED', { version: 3 }));
      return {};
    });
    mount('LOSS');
    fireEvent.click(await screen.findByRole('button', { name: 'Reject proposal' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Reject this proposal?');
    expect(apiClient.post).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, reject it' }));
    await waitFor(() => expect(transition()).toHaveLength(1));
    expect(transition()[0][1]).toMatchObject({ version: 2, action: 'REJECT' });
  });

  it('does not ask before saving a draft', async () => {
    serve(saved('LOSS'));
    (apiClient.patch as jest.Mock).mockResolvedValue(saved('LOSS', 'DRAFT', { version: 3 }));
    mount('LOSS');
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('document header and ids', () => {
  it('puts the heading and a one-line outcome first, ahead of the status details', async () => {
    serve(saved('LOSS'));
    mount('LOSS');
    const heading = await screen.findByRole('heading', { name: 'LOSS-REF' });
    expect(screen.queryByRole('region', { name: 'Document outcome' })).not.toBeInTheDocument();
    const summary = screen.getByText('Posting removes these units from available stock as lost or broken.');
    expect(heading.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const details = screen.getByText('What this means for stock and what to do next').closest('details')!;
    expect(summary.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /Recovery details/ })).not.toBeInTheDocument();
  });

  it.each([
    ['a draft', saved('LOSS'), true],
    ['a posted loss with history', saved('LOSS', 'POSTED', { events: [{ id: '9d1e7c2a-1111-4222-8333-444455556666', createdAt: '2026-11-05', actorId: '7b8c9d0e-1111-4222-8333-444455556666', action: 'POST', toStatus: 'POSTED', version: 3 }], effects: [{ id: 'e1', lineId: lines[0].id, quantityDelta: -5, heldDelta: 0 }] }), true],
    ['a record the reader cannot edit', saved('LOSS', 'POSTED'), false],
  ])('shows no raw id for %s', async (_label, doc, write) => {
    serve(doc);
    mount('LOSS', { capabilities: capabilities('LOSS', write) });
    await screen.findByRole('heading', { name: 'LOSS-REF' });
    const handoff = screen.queryByRole('textbox', { name: /Recovery details/ });
    const outside = (node: Element) => !handoff || !handoff.contains(node);
    const visibleText = Array.from(document.body.querySelectorAll('*')).filter((node) => outside(node) && node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE').flatMap((node) => Array.from(node.childNodes).filter((child) => child.nodeType === Node.TEXT_NODE).map((child) => child.textContent || ''));
    expect(visibleText.filter((text) => UUID.test(text))).toEqual([]);
    const attributes = Array.from(document.body.querySelectorAll('[aria-label],[placeholder],[title]')).flatMap((node) => [node.getAttribute('aria-label'), node.getAttribute('placeholder'), node.getAttribute('title')]);
    expect(attributes.filter((text) => text && UUID.test(text))).toEqual([]);
    for (const control of screen.getAllByRole('textbox')) if (control !== handoff) expect((control as HTMLInputElement).value).not.toMatch(UUID);
    if (!write) expect(handoff).toHaveAttribute('readonly');
  });
});
