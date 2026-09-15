import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PurchaseDocumentActions } from '@/components/inventory/PurchaseDocumentActions';
import { apiClient } from '@/lib/api';
import { SupplierCreditPanel } from '@/components/inventory/SupplierCreditPanel';
jest.mock('@/components/inventory/SupplierCreditPanel', () => ({ SupplierCreditPanel: jest.fn(() => null) }));

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), patch: jest.fn() } }));
const get = jest.mocked(apiClient.get), patch = jest.mocked(apiClient.patch);
const invoice = { id: 'bill-1', status: 'STOCK_COMMITTED', invoiceNumber: 'SB-26-43742' };
const source = { id: 'file-1', fileName: 'original-invoice.pdf', sizeBytes: 8000, createdAt: '2026-09-01T12:00:00Z' };
const detail = () => ({ invoice: { ...invoice, documents: [source] }, version: 4, metadata: {},
  permissions: { edit: true, attach: true, metadata: true, return: true },
  related: [{ id: 'receipt-1', kind: 'INWARD_CHALLAN', reference: 'RC-1', status: 'POSTED' }],
  events: [{ id: 'event-1', action: 'STOCK_COMMITTED', actor: 'Reception reviewer', at: '2026-09-02T12:00:00Z', after: { stockEffect: 0 } }] });

beforeEach(() => { jest.clearAllMocks(); get.mockResolvedValue(detail()); patch.mockResolvedValue({ version: 5 }); });

it('routes a posted correction to its linked return while keeping retained originals and exports visible', async () => {
  const onReturn = jest.fn(), onEdit = jest.fn();
  render(<PurchaseDocumentActions invoice={invoice} onReturn={onReturn} onEdit={onEdit} />);
  await screen.findByRole('button', { name: 'Correct posted purchase' });
  fireEvent.click(screen.getByRole('button', { name: 'Correct posted purchase' }));
  expect(screen.getByText(/Create a linked supplier return with a reason/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Start linked return' }));
  expect(onReturn).toHaveBeenCalledWith('bill-1'); expect(onEdit).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: source.fileName })).toHaveAttribute('href', '/api/pharmacy/purchase-invoices/documents/file-1');
  for (const name of ['PDF', 'Excel', 'Purchase CSV', 'Print QR', 'Logs', 'Add supporting original']) expect(screen.getByRole('button', { name })).toBeEnabled();
});

it('saves metadata with the current action version and explains that historic totals stay unchanged', async () => {
  render(<PurchaseDocumentActions invoice={invoice} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Set location & discount' }));
  fireEvent.change(screen.getByLabelText('Shelf / location'), { target: { value: 'Shelf A-3' } });
  fireEvent.change(screen.getByLabelText('Suggested future sale discount (%)'), { target: { value: '7.5' } });
  fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Shelf transfer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save location & discount' }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/inventory/workspace/purchases/bill-1/metadata', { version: 4, location: 'Shelf A-3', futureSaleDiscountPercent: 7.5, reason: 'Shelf transfer' }));
  expect(await screen.findByText(/Purchase totals and historical discounts are unchanged/)).toBeInTheDocument();
});

it('shows actual actor/time logs and opens the exact linked receipt', async () => {
  const onDocument = jest.fn(); render(<PurchaseDocumentActions invoice={invoice} onDocument={onDocument} />);
  fireEvent.click(await screen.findByRole('button', { name: /RC-1/ }));
  expect(onDocument).toHaveBeenCalledWith('INWARD_CHALLAN', 'receipt-1');
  fireEvent.click(screen.getByRole('button', { name: 'Logs' }));
  expect(screen.getByText('Reception reviewer')).toBeInTheDocument();
  expect(screen.getByText('stock committed')).toBeInTheDocument();
});

it('keeps read-only users out of mutations and shows failures with a retry action', async () => {
  get.mockResolvedValue({ ...detail(), permissions: { edit: false, attach: false, metadata: false, return: false } });
  const view = render(<PurchaseDocumentActions invoice={invoice} />);
  await screen.findByRole('link', { name: source.fileName });
  expect(screen.queryByRole('button', { name: 'Return to supplier' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add supporting original' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Set location & discount' })).not.toBeInTheDocument();
  view.unmount(); get.mockRejectedValue(new Error('Purchase invoice not found'));
  render(<PurchaseDocumentActions invoice={{ ...invoice, id: 'other-branch' }} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Purchase invoice not found');
  expect(screen.getByRole('button', { name: 'Reload actions' })).toBeEnabled();
});

it('reports a malformed response without crashing the purchase editor', async () => {
  get.mockResolvedValue({});
  render(<PurchaseDocumentActions invoice={invoice} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Purchase actions could not be loaded');
  expect(screen.getByRole('button', { name: 'Reload actions' })).toBeEnabled();
});


it('keeps linked credit draft identity stable for a bill and distinct across source bills', async () => {
  const first = render(<PurchaseDocumentActions invoice={invoice} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Correct posted purchase' }));
  const firstUrl = screen.getByRole('link', { name: 'Record linked supplier credit' }).getAttribute('href');
  expect(firstUrl).toContain('new=purchase-bill-1-credit&purchaseInvoiceId=bill-1');
  first.unmount();
  get.mockResolvedValue({ ...detail(), invoice: { ...detail().invoice, id: 'bill-2' } });
  render(<PurchaseDocumentActions invoice={{ ...invoice, id: 'bill-2' }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Correct posted purchase' }));
  expect(screen.getByRole('link', { name: 'Record linked supplier credit' })).toHaveAttribute('href', '/dashboard/inventory?area=purchases&view=CREDIT_NOTE&new=purchase-bill-2-credit&purchaseInvoiceId=bill-2');
});

it.each([true, false])('opens eligible credits for this posted supplier bill with allocation permission %s', async (mayAllocate) => {
  get.mockResolvedValue({ ...detail(), invoice: { ...detail().invoice, distributorGstin: '36AAICV6142K1ZY' }, permissions: { ...detail().permissions, ledgerRead: true, mayAllocate } });
  const onRefresh = jest.fn();
  render(<PurchaseDocumentActions invoice={invoice} onRefresh={onRefresh} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Eligible supplier credits' }));
  expect(screen.getByRole('button', { name: 'Eligible supplier credits' })).toHaveAttribute('aria-expanded', 'true');
  expect(jest.mocked(SupplierCreditPanel).mock.calls.at(-1)?.[0]).toMatchObject({ purchaseInvoiceId: 'bill-1', supplierGstin: '36AAICV6142K1ZY', canWrite: mayAllocate });
});

it('hides supplier credit access without ledger-read permission or before posting', async () => {
  get.mockResolvedValue({ ...detail(), permissions: { ...detail().permissions, ledgerRead: false, mayAllocate: false } });
  const first = render(<PurchaseDocumentActions invoice={invoice} />);
  await screen.findByRole('link', { name: source.fileName });
  expect(screen.queryByRole('button', { name: 'Eligible supplier credits' })).not.toBeInTheDocument();
  first.unmount();
  get.mockResolvedValue({ ...detail(), invoice: { ...detail().invoice, status: 'DRAFT' }, permissions: { ...detail().permissions, ledgerRead: true, mayAllocate: true } });
  render(<PurchaseDocumentActions invoice={{ ...invoice, status: 'DRAFT' }} />);
  await screen.findByRole('link', { name: source.fileName });
  expect(screen.queryByRole('button', { name: 'Eligible supplier credits' })).not.toBeInTheDocument();
  expect(SupplierCreditPanel).not.toHaveBeenCalled();
});
