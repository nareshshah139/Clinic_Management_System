import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { PurchaseInvoiceWorkbench } from '@/components/pharmacy/PurchaseInvoiceWorkbench';
import { apiClient } from '@/lib/api';

let mockPurchaseAccess = { read: true, create: true, review: true, commit: true, automate: true };
jest.mock('@/hooks/usePurchasePermissions', () => ({ usePurchasePermissions: () => ({ permissions: mockPurchaseAccess, loading: false, error: '' }) }));

jest.mock('@/components/layout/dashboard-user-context', () => ({
  useDashboardUser: () => ({ user: { id: 'user-1', branchId: 'branch-1' } }),
}));

jest.mock('@/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    getPharmacyPurchaseInvoices: jest.fn(),
    getPharmacyPurchaseInvoiceById: jest.fn(),
    getUnlinkedPurchaseDocuments: jest.fn(),
    createPharmacyPurchaseInvoiceDraft: jest.fn(),
    updatePharmacyPurchaseInvoiceDraft: jest.fn(),
    suggestPharmacyPurchaseMasterMatches: jest.fn(),
    confirmPharmacyPurchaseMaster: jest.fn(),
    reviewPharmacyPurchaseInvoice: jest.fn(),
    commitPharmacyPurchaseInvoiceStock: jest.fn(),
    processPharmacyPurchaseInvoice: jest.fn(),
  },
}));

const api = apiClient as jest.Mocked<typeof apiClient>;

const draftInvoice = {
  id: 'pinv-1',
  distributorName: 'Apex Distributors',
  distributorGstin: '36ABCDE1234F1Z5',
  invoiceNumber: 'APX-001',
  invoiceDate: '2026-05-01T00:00:00.000Z',
  goodsReceivedDate: '2026-05-02T00:00:00.000Z',
  billType: 'CASH' as const,
  status: 'DRAFT' as const,
  grossAmount: 100,
  taxableAmount: 100,
  totalGst: 12,
  netPayable: 112,
  unresolvedOcrFlags: 0,
  reconciliationIssues: [],
  items: [
    {
      id: 'line-1',
      lineNumber: 1,
      productName: 'Azithral 500 Tablet',
      manufacturer: 'Alembic',
      packSize: 'Strip of 3',
      hsnCode: '3004',
      batchNumber: 'AZT2401',
      expiryMonth: 12,
      expiryYear: 2027,
      quantityPurchased: 1,
      freeQuantity: 0,
      mrp: 120,
      purchaseRate: 100,
      taxableAmount: 100,
      gstAmount: 12,
      lineTotal: 112,
    },
  ],
};

async function editSelectedInvoice() {
  fireEvent.click(await screen.findByText('More actions'));
  fireEvent.click(screen.getByRole('button', { name: 'Review issues' }));
}

function saveCurrentInvoice() {
  const more = screen.queryByText('More actions');
  if (more && !more.closest('details')?.open) fireEvent.click(more);
  fireEvent.click(screen.getByRole('button', { name: /^(Save Draft|Save corrections|Save & Process)$/ }));
}

describe('PurchaseInvoiceWorkbench', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPurchaseAccess = { read: true, create: true, review: true, commit: true, automate: true };
    api.get.mockResolvedValue([]);
    sessionStorage.clear();
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [] });
    api.getPharmacyPurchaseInvoiceById.mockReset().mockResolvedValue(draftInvoice);
    api.getUnlinkedPurchaseDocuments.mockResolvedValue([]);
    api.processPharmacyPurchaseInvoice.mockReset().mockImplementation(async () => ({
      invoice: await api.updatePharmacyPurchaseInvoiceDraft.mock.results.at(-1)?.value || draftInvoice,
      automation: { status: 'SAVED_FOR_REVIEW', issues: ['Line 1: OCR confidence must be at least 98% for automatic stock intake; review this line manually.'] },
    }));
    window.confirm = jest.fn(() => true);
    (global as any).fetch = jest.fn();
  });

  it('saves a new cosmetic through the invoice page with blank clinical fields', async () => {
    mockPurchaseAccess = { ...mockPurchaseAccess, catalogDetails: true } as typeof mockPurchaseAccess;
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [draftInvoice] });
    api.suggestPharmacyPurchaseMasterMatches.mockResolvedValue({ matches: [{ lineIndex: 0, ocr: {}, candidates: [], recommendedAction: 'CREATE_NEW' }] });
    api.confirmPharmacyPurchaseMaster.mockResolvedValue({ action: 'CREATE_NEW', drug: { id: 'cosmetic', name: 'Example cosmetic', productKind: 'COSMETIC', requiresPrescription: false, catalogIssues: [] }, linePatch: {} });
    render(<PurchaseInvoiceWorkbench />); await editSelectedInvoice();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Matches' }));
    fireEvent.change(await screen.findByLabelText('Product kind'), { target: { value: 'COSMETIC' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new product' }));
    await waitFor(() => expect(api.confirmPharmacyPurchaseMaster).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE_NEW', catalog: { productKind: 'COSMETIC', category: 'Cosmetic', composition1: '', dosageForm: '', strength: '', requiresPrescription: false } })));
    expect(await screen.findByText('COSMETIC')).toBeInTheDocument();
    expect(api.commitPharmacyPurchaseInvoiceStock).not.toHaveBeenCalled();
  });

  it.each([true, false])('enforces saved product edit capability (%s) on the invoice screen', async editProduct => {
    mockPurchaseAccess = { ...mockPurchaseAccess, catalogDetails: true, editProduct } as typeof mockPurchaseAccess;
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [draftInvoice] });
    const drug = { id: 'legacy', name: 'Example cosmetic', type: 'allopathy', category: 'Uncategorized', dosageForm: 'Tablet', strength: 'Review strength', catalogIssues: ['category', 'strength'] };
    api.suggestPharmacyPurchaseMasterMatches.mockResolvedValue({ matches: [{ lineIndex: 0, ocr: {}, candidates: [{ drug, score: 99, confidence: 'HIGH' }], recommendedAction: 'MATCH_EXISTING' }] });
    api.patch.mockResolvedValue({ ...drug, productKind: 'COSMETIC', type: 'cosmetic', category: 'Cosmetic', composition1: null, dosageForm: null, strength: null, requiresPrescription: false, catalogIssues: [] });
    render(<PurchaseInvoiceWorkbench />); await editSelectedInvoice();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Matches' }));
    await screen.findByText('Check or correct saved product details');
    if (!editProduct) {
      expect(screen.queryByRole('button', { name: 'Save product details' })).not.toBeInTheDocument();
      expect(screen.getByText(/Staff with product-edit permission/)).toBeInTheDocument();
      return;
    }
    const form = screen.getByRole('region', { name: 'Edit saved product details' });
    fireEvent.change(within(form).getByLabelText('Product kind'), { target: { value: 'COSMETIC' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save product details' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/pharmacy/purchase-invoices/master-records/legacy', expect.objectContaining({ productKind: 'COSMETIC', dosageForm: '', strength: '', requiresPrescription: false })));
    expect(screen.getByRole('button', { name: 'Save & Process' })).toBeEnabled();
    expect(api.commitPharmacyPurchaseInvoiceStock).not.toHaveBeenCalled();
  });

  it('keeps Save & Process as the action when product records still block intake', async () => {
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [draftInvoice] });
    api.updatePharmacyPurchaseInvoiceDraft.mockResolvedValue(draftInvoice);
    api.processPharmacyPurchaseInvoice.mockResolvedValue({ invoice: { ...draftInvoice, status: 'RECONCILIATION_FAILED' }, automation: { status: 'SAVED_FOR_REVIEW', issues: ['Line 1: product master is missing or inactive.'] } });
    render(<PurchaseInvoiceWorkbench />); await editSelectedInvoice();
    fireEvent.click(screen.getByRole('button', { name: 'Save & Process' }));
    await waitFor(() => expect(api.processPharmacyPurchaseInvoice).toHaveBeenCalled());
    expect(await screen.findByText(/saved for correction/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save & Process' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Mark Reviewed' })).not.toBeInTheDocument();
  });

  it('saves a verified supplier in the checklist without changing stock and restores Save & Process', async () => {
    mockPurchaseAccess = { ...mockPurchaseAccess, saveSupplier: true } as typeof mockPurchaseAccess;
    const invoice = { ...draftInvoice, status: 'RECONCILIATION_FAILED',
      reconciliationIssues: ['AUTO: Automatic intake requires one active saved supplier with matching name and GSTIN. Select a saved supplier or review manually.'] };
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [invoice] });
    api.post.mockResolvedValue({ id: 'supplier-1', name: invoice.distributorName, gstNumber: invoice.distributorGstin });
    render(<PurchaseInvoiceWorkbench />);
    await editSelectedInvoice();
    const checklist = screen.getByRole('region', { name: 'Check before adding stock' });
    expect(within(checklist).getByLabelText('Distributor')).toHaveValue(invoice.distributorName);
    expect(screen.getByRole('button', { name: 'Mark Reviewed' })).toBeEnabled();
    await waitFor(() => expect(within(checklist).getByRole('checkbox', { name: /I checked the supplier/ })).toBeEnabled());
    fireEvent.click(within(checklist).getByRole('checkbox', { name: /I checked the supplier/ }));
    fireEvent.click(within(checklist).getByRole('button', { name: 'Save verified supplier' }));
    await screen.findByText(/Supplier saved. Stock has not changed/);
    expect(api.post).toHaveBeenCalledWith('/pharmacy/purchase-invoices/suppliers', {
      name: invoice.distributorName, gstNumber: invoice.distributorGstin, verified: true,
    });
    expect(screen.getByRole('button', { name: 'Save & Process' })).toBeEnabled();
    expect(api.updatePharmacyPurchaseInvoiceDraft).not.toHaveBeenCalled();
    expect(api.processPharmacyPurchaseInvoice).not.toHaveBeenCalled();
    expect(api.commitPharmacyPurchaseInvoiceStock).not.toHaveBeenCalled();
  });

  it('disables stock actions for create-only staff and does not fetch forbidden lists', async () => {
    mockPurchaseAccess = { read: false, create: true, review: false, commit: false, automate: false };
    render(<PurchaseInvoiceWorkbench />);
    fireEvent.change(screen.getByLabelText('Upload invoice PDF or image'), { target: { files: [new File(['test'], 'invoice.jpg', {type:'image/jpeg'})] } });
    expect(screen.getByRole('button', {name:'Import & Add Stock'})).toBeDisabled();
    expect(screen.getByRole('button', {name:'Extract Draft'})).toBeEnabled();
    expect(api.getPharmacyPurchaseInvoices).not.toHaveBeenCalled();
    expect(api.getUnlinkedPurchaseDocuments).not.toHaveBeenCalled();
    await act(async () => {});
  });

  it('keeps read-only invoice users from editing or saving', async () => {
    mockPurchaseAccess = { read: true, create: false, review: false, commit: false, automate: false };
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [draftInvoice] });
    render(<PurchaseInvoiceWorkbench />);
    expect(screen.getByRole('button', { name:'Save Draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name:'Import & Add Stock' })).toBeDisabled();
    expect(screen.getByLabelText('Distributor')).toBeDisabled();
    await act(async () => {});
  });

  it('links the archived original when a preview is saved, and shows the download on the saved invoice', async () => {
    const document = { id: 'document-1', fileName: 'original.pdf', mimeType: 'application/pdf', sizeBytes: 1024 };
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ draft: { ...draftInvoice, invoiceDate: '2026-05-01', goodsReceivedDate: '2026-05-02' }, sourceDocument: document }) });
    api.createPharmacyPurchaseInvoiceDraft.mockResolvedValue({ ...draftInvoice, documents: [document] });
    render(<PurchaseInvoiceWorkbench />);
    fireEvent.change(screen.getByLabelText('Upload invoice PDF or image'), { target: { files: [new File(['synthetic'], 'original.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Extract Draft' }));
    const link = await screen.findByRole('link', { name: /Download original: original.pdf/ });
    expect(link).toHaveAttribute('href', '/api/pharmacy/purchase-invoices/documents/document-1');
    saveCurrentInvoice();
    await waitFor(() => expect(api.createPharmacyPurchaseInvoiceDraft).toHaveBeenCalledWith(expect.objectContaining({ sourceDocumentId: 'document-1' })));
    expect(await screen.findByText('Original documents')).toBeInTheDocument();
  });

  it('retains a saved original after OCR failure and recovers its link on remount', async () => {
    const document = { id: 'failed-ocr-document', fileName: 'unreadable.jpg', mimeType: 'image/jpeg', sizeBytes: 3000 };
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503, json: async () => ({ message: 'Extraction unavailable', sourceDocument: document }) });
    const first = render(<PurchaseInvoiceWorkbench />);
    fireEvent.change(screen.getByLabelText('Upload invoice PDF or image'), { target: { files: [new File(['synthetic'], 'unreadable.jpg', { type: 'image/jpeg' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Import & Add Stock' }));
    expect(await screen.findByText('Original file saved. Enter the invoice details manually or retry the upload.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download original: unreadable.jpg/ })).toBeInTheDocument();
    expect(api.createPharmacyPurchaseInvoiceDraft).not.toHaveBeenCalled();
    first.unmount();
    render(<PurchaseInvoiceWorkbench />);
    expect(await screen.findByRole('link', { name: /Download original: unreadable.jpg/ })).toHaveAttribute('href', '/api/pharmacy/purchase-invoices/documents/failed-ocr-document');
  });

  it('renders and saves all 20 OCR batch rows, including repeated products and a correction on the last row', async () => {
    const items = Array.from({ length: 20 }, (_, index) => ({
      ...draftInvoice.items[0], id: `line-${index + 1}`, lineNumber: index + 1, serialNumber: index + 1,
      productName: `Sample Cream ${index % 16 + 1}`, batchNumber: `BATCH-${index + 1}`,
      cgstPercent: 6, sgstPercent: 6,
    }));
    const invoice = { ...draftInvoice, invoiceDate: '2026-05-01', goodsReceivedDate: '2026-05-02',
      grossAmount: 2000, taxableAmount: 2000, totalCgst: 120, totalSgst: 120, totalGst: 240, netPayable: 2240, items };
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ draft: invoice }) });
    api.createPharmacyPurchaseInvoiceDraft.mockResolvedValue(invoice);
    const { container } = render(<PurchaseInvoiceWorkbench />);
    const saveButton = screen.getByRole('button', { name: 'Save Draft' });
    const extractButton = screen.getByRole('button', { name: 'Extract Draft' });
    fireEvent.change(screen.getByLabelText('Upload invoice PDF or image'), {
      target: { files: [new File(['synthetic'], 'twenty-items.pdf', { type: 'application/pdf' })] },
    });
    await act(async () => { fireEvent.click(extractButton); });
    expect(container.querySelectorAll('section[id$="-review"]')).toHaveLength(20);
    // Select the batch inputs directly; scanning every label is slow in JSDOM.
    const batchInputs = container.querySelectorAll<HTMLInputElement>('input[id$="-batch"]');
    expect(batchInputs).toHaveLength(20);
    batchInputs.forEach(input => expect(input).toBeVisible());
    expect(batchInputs[0]).toHaveAccessibleName('Batch');
    expect(batchInputs[0]).toHaveValue('BATCH-1');
    expect(batchInputs[19]).toHaveAccessibleName('Batch');
    expect(batchInputs[19]).toHaveValue('BATCH-20');
    fireEvent.change(batchInputs[19], { target: { value: 'CORRECTED-20' } });
    fireEvent.click(saveButton);
    await waitFor(() => expect(api.createPharmacyPurchaseInvoiceDraft).toHaveBeenCalled());
    const saved = api.createPharmacyPurchaseInvoiceDraft.mock.calls[0][0];
    expect(saved.items).toHaveLength(20);
    expect(saved.items.map(row => row.productName)).toEqual(items.map(row => row.productName));
    expect(saved.items[0].batchNumber).toBe('BATCH-1');
    expect(saved.items[19].batchNumber).toBe('CORRECTED-20');
    expect(saved.netPayable).toBe(2240);
  });

  it('lets staff attach a previously unlinked upload while correcting a saved draft', async () => {
    const document = { id: 'old-upload', fileName: 'earlier.jpg', mimeType: 'image/jpeg', sizeBytes: 3000 };
    api.getUnlinkedPurchaseDocuments.mockResolvedValue([document]);
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [draftInvoice] });
    api.updatePharmacyPurchaseInvoiceDraft.mockResolvedValue({ ...draftInvoice, documents: [document] });
    render(<PurchaseInvoiceWorkbench />);
    await editSelectedInvoice();
    fireEvent.click(screen.getByText(/Saved uploads \(/));
    fireEvent.click(await screen.findByRole('button', { name: 'Use for this draft' }));
    saveCurrentInvoice();
    await waitFor(() => expect(api.updatePharmacyPurchaseInvoiceDraft).toHaveBeenCalledWith('pinv-1', expect.objectContaining({ sourceDocumentId: 'old-upload' })));
  });

  it('starts a new invoice without keeping the previous selection or committing stock', async () => {
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [draftInvoice] });
    render(<PurchaseInvoiceWorkbench />);
    await screen.findByRole('heading', { name: 'Finish invoice review' });
    fireEvent.click(screen.getByRole('button', { name: 'New invoice' }));
    expect(screen.queryByRole('heading', { name: 'Finish invoice review' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeEnabled();
    expect(screen.getByLabelText('Invoice No.')).toHaveValue('');
    expect(api.commitPharmacyPurchaseInvoiceStock).not.toHaveBeenCalled();
  });

  it('shows a replacement extraction as a new unsaved draft instead of hiding it behind the old selection', async () => {
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [draftInvoice] });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ draft: { ...draftInvoice, invoiceNumber: 'REPLACEMENT-002' } }) });
    render(<PurchaseInvoiceWorkbench />);
    await editSelectedInvoice();
    fireEvent.click(screen.getByText('Replace invoice file'));
    fireEvent.change(screen.getByLabelText('Upload invoice PDF or image'), { target: { files: [new File(['synthetic'], 'replacement.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Extract Draft' }));
    expect(await screen.findByDisplayValue('REPLACEMENT-002')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Finish invoice review' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeEnabled();
    expect(api.updatePharmacyPurchaseInvoiceDraft).not.toHaveBeenCalled();
  });

  it('blocks invalid purchase drafts before calling the API', async () => {
    render(<PurchaseInvoiceWorkbench />);

    saveCurrentInvoice();

    expect(await screen.findByText('Fix Required')).toBeInTheDocument();
    expect(screen.getByText('Distributor name is required')).toBeInTheDocument();
    expect(api.createPharmacyPurchaseInvoiceDraft).not.toHaveBeenCalled();
  });

  it('provides a correction-to-commit path for an approval bill blocked by OCR and low confidence', async () => {
    const flags = ['Bill type is uncertain: invoice states APPROVAL BILLS but does not explicitly identify CASH or CREDIT.', 'independent_read_disagrees_distributorGstin'];
    const flagged = { ...draftInvoice, status: 'OCR_REVIEW_REQUIRED', unresolvedOcrFlags: 4,
      ocrFlags: flags, reconciliationIssues: [
        ...flags.map(flag => `OCR: ${flag}`), ...flags.map(flag => `AUTO: OCR: ${flag}`),
        'AUTO: Line 1: manufacturer is required before review', 'AUTO: Line 1: missing_manufacturer',
        'AUTO: Line 1: packUnitType is required before review',
        'AUTO: Line 1: OCR confidence must be at least 98% for automatic stock intake; review this line manually.',
      ], items: [{ ...draftInvoice.items[0], manufacturer: '', packUnitType: '', ocrConfidence: 0.95,
        ocrFlags: ['missing_manufacturer', 'missing_packUnitType'] }] };
    const clean = { ...draftInvoice, items: [{ ...draftInvoice.items[0], manufacturer: '', packUnitType: 'Strip', ocrConfidence: 0.95, ocrFlags: [] }] };
    let persisted: any = flagged;
    api.getPharmacyPurchaseInvoices.mockImplementation(async () => ({ data: [persisted] }));
    api.updatePharmacyPurchaseInvoiceDraft.mockImplementation(async () => { persisted = clean; return persisted; });
    api.processPharmacyPurchaseInvoice.mockImplementation(async () => {
      persisted = { ...clean, status: 'RECONCILIATION_FAILED', reconciliationIssues: ['AUTO: Line 1: OCR confidence must be at least 98% for automatic stock intake; review this line manually.'] };
      return { invoice: persisted, automation: { status: 'SAVED_FOR_REVIEW', issues: persisted.reconciliationIssues } };
    });
    api.reviewPharmacyPurchaseInvoice.mockImplementation(async () => { persisted = { ...clean, status: 'REVIEWED' }; return persisted; });
    api.commitPharmacyPurchaseInvoiceStock.mockImplementation(async () => { persisted = { ...clean, status: 'STOCK_COMMITTED' }; return persisted; });
    render(<PurchaseInvoiceWorkbench />);
    expect(await screen.findByRole('heading', { name: 'Finish invoice review' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review issues' }));
    expect(screen.queryByRole('button', { name: 'Mark Reviewed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Commit Stock' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm bill type checked' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm supplier GSTIN checked' }));
    expect(screen.getByLabelText('Manufacturer (optional)')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Stock unit'), { target: { value: 'Strip' } });
    expect(screen.queryByRole('button', { name: 'Confirm line 1 manufacturer checked' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm line 1 stock unit checked' }));
    expect(screen.queryByRole('button', { name: 'Save corrections' })).not.toBeInTheDocument();
    expect(screen.queryByText('More actions')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save & Process' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark Reviewed' })).toBeEnabled());
    expect(api.updatePharmacyPurchaseInvoiceDraft).toHaveBeenCalledWith('pinv-1', expect.objectContaining({
      ocrFlags: [], items: [expect.objectContaining({ manufacturer: '', packUnitType: 'Strip', ocrFlags: [], ocrConfidence: 0.95 })],
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Invoice OCR' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resume invoice' }));
    expect(screen.getByRole('button', { name: 'Mark Reviewed' })).toBeEnabled();
    expect(api.updatePharmacyPurchaseInvoiceDraft).toHaveBeenCalledTimes(1);
    expect(api.reviewPharmacyPurchaseInvoice).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mark Reviewed' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Commit Stock' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Back to Invoice OCR' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resume invoice' }));
    expect(screen.getByRole('button', { name: 'Commit Stock' })).toBeEnabled();
    expect(api.commitPharmacyPurchaseInvoiceStock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Commit Stock' }));
    await waitFor(() => expect(api.commitPharmacyPurchaseInvoiceStock).toHaveBeenCalledWith('pinv-1'));
    expect(api.processPharmacyPurchaseInvoice).toHaveBeenCalledTimes(1);
  });

  it('imports and adds stock in one request, displaying the persisted result without an extra save or confirmation', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({
      draft: { ...draftInvoice, invoiceDate: '2026-05-01' },
      invoice: { ...draftInvoice, status: 'STOCK_COMMITTED' },
      automation: { status: 'STOCK_COMMITTED', issues: [] },
    }) });
    render(<PurchaseInvoiceWorkbench />);
    const file = new File(['synthetic'], 'invoice.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Upload invoice PDF or image'), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('Received on'), { target: { value: '2026-05-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import & Add Stock' }));
    expect(await screen.findByText(/APX-001 saved and stock added automatically/)).toBeInTheDocument();
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/pharmacy/purchase-invoices/ocr/import');
    expect(options.body.get('file')).toBe(file);
    expect(options.body.get('goodsReceivedDate')).toBe('2026-05-02');
    expect(api.createPharmacyPurchaseInvoiceDraft).not.toHaveBeenCalled();
    expect(api.commitPharmacyPurchaseInvoiceStock).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument();
  });

  it('retains a saved exception and updates that same invoice after correction', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({
      draft: draftInvoice,
      invoice: { ...draftInvoice, status: 'OCR_REVIEW_REQUIRED', ocrFlags: ['check_supplier'] },
      automation: { status: 'SAVED_FOR_REVIEW', issues: ['Check supplier details.'] },
    }) });
    api.updatePharmacyPurchaseInvoiceDraft.mockResolvedValue(draftInvoice);
    render(<PurchaseInvoiceWorkbench />);
    fireEvent.change(screen.getByLabelText('Upload invoice PDF or image'), {
      target: { files: [new File(['synthetic'], 'invoice.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import & Add Stock' }));
    expect(await screen.findByText(/saved for correction/)).toBeInTheDocument();
    expect(screen.getByText('Check supplier details.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh Matches' })).toBeInTheDocument();
    saveCurrentInvoice();
    await waitFor(() => expect(api.updatePharmacyPurchaseInvoiceDraft).toHaveBeenCalledWith('pinv-1', expect.any(Object)));
    expect(api.createPharmacyPurchaseInvoiceDraft).not.toHaveBeenCalled();
  });

  it('keeps unsaved OCR fields editable and clearly reports failure to save', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({
      draft: { ...draftInvoice, distributorGstin: '' }, invoice: null,
      automation: { status: 'NOT_SAVED', issues: ['Distributor GSTIN is unreadable.'] },
    }) });
    render(<PurchaseInvoiceWorkbench />);
    fireEvent.change(screen.getByLabelText('Upload invoice PDF or image'), {
      target: { files: [new File(['synthetic'], 'invoice.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import & Add Stock' }));
    expect(await screen.findByText(/Invoice was not saved/)).toBeInTheDocument();
    expect(screen.getByLabelText('Distributor')).toHaveValue('Apex Distributors');
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeEnabled();
    expect(screen.queryByText(/saved and stock added/)).not.toBeInTheDocument();
  });

  it('saves corrections and then processes in one action without erasing reported totals', async () => {
    const flagged = { ...draftInvoice, netPayable: 120, status: 'RECONCILIATION_FAILED',
      reconciliationIssues: ['Printed total does not reconcile'], items: [{ ...draftInvoice.items[0], cgstPercent: 6, sgstPercent: 6, ocrConfidence: 0.979 }] };
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [flagged] });
    api.updatePharmacyPurchaseInvoiceDraft.mockResolvedValue(flagged);
    api.processPharmacyPurchaseInvoice.mockResolvedValue({ invoice: flagged,
      automation: { status: 'SAVED_FOR_REVIEW', issues: ['Printed total does not reconcile'] } });
    render(<PurchaseInvoiceWorkbench />);
    await editSelectedInvoice();
    expect(screen.getAllByRole('button', { name: 'Save & Process' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Save & Process' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save corrections' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Manufacturer (optional)'), { target: { value: 'Corrected manufacturer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & Process' }));
    await waitFor(() => expect(api.processPharmacyPurchaseInvoice).toHaveBeenCalledWith('pinv-1'));
    expect(api.updatePharmacyPurchaseInvoiceDraft).toHaveBeenCalledWith('pinv-1', expect.objectContaining({
      netPayable: 120, items: [expect.objectContaining({ ocrConfidence: 0.979 })],
    }));
    expect(screen.queryByRole('button', { name: 'Mark Reviewed' })).not.toBeInTheDocument();
  });

  it('keeps a single save-only action for staff without automatic stock permissions', async () => {
    mockPurchaseAccess = { read: true, create: true, review: false, commit: false, automate: false };
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [draftInvoice] });
    api.updatePharmacyPurchaseInvoiceDraft.mockResolvedValue(draftInvoice);
    render(<PurchaseInvoiceWorkbench />);
    await editSelectedInvoice();
    expect(screen.getAllByRole('button', { name: 'Save corrections' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Save & Process' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save corrections' }));
    await waitFor(() => expect(api.updatePharmacyPurchaseInvoiceDraft).toHaveBeenCalledTimes(1));
    expect(api.processPharmacyPurchaseInvoice).not.toHaveBeenCalled();
  });

  it('saves once before processing even when the button is clicked rapidly', async () => {
    let finishSave!: (invoice: typeof draftInvoice) => void;
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [draftInvoice] });
    api.updatePharmacyPurchaseInvoiceDraft.mockReturnValue(new Promise(resolve => { finishSave = resolve; }));
    api.processPharmacyPurchaseInvoice.mockResolvedValue({ invoice: { ...draftInvoice, status: 'STOCK_COMMITTED' },
      automation: { status: 'STOCK_COMMITTED', issues: [] } });
    render(<PurchaseInvoiceWorkbench />);
    await editSelectedInvoice();
    const save = screen.getByRole('button', { name: 'Save & Process' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(api.updatePharmacyPurchaseInvoiceDraft).toHaveBeenCalledTimes(1);
    expect(api.processPharmacyPurchaseInvoice).not.toHaveBeenCalled();
    expect(save).toBeDisabled();
    expect(save).toHaveTextContent('Saving…');
    await act(async () => finishSave(draftInvoice));
    await screen.findByText(/stock added automatically/);
    expect(api.processPharmacyPurchaseInvoice).toHaveBeenCalledTimes(1);
    expect(api.updatePharmacyPurchaseInvoiceDraft.mock.invocationCallOrder[0]).toBeLessThan(api.processPharmacyPurchaseInvoice.mock.invocationCallOrder[0]);
  });

  it('returns to Save & Process when fields change after an automatic review exception', async () => {
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [draftInvoice] });
    api.updatePharmacyPurchaseInvoiceDraft.mockResolvedValue(draftInvoice);
    render(<PurchaseInvoiceWorkbench />);
    await editSelectedInvoice();
    fireEvent.click(screen.getByRole('button', { name: 'Save & Process' }));
    expect(await screen.findByRole('button', { name: 'Mark Reviewed' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Batch'), { target: { value: 'NEW-BATCH' } });
    expect(screen.queryByRole('button', { name: 'Mark Reviewed' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save & Process' })).toBeEnabled();
  });

  it('saves current corrections before manually marking a draft reviewed', async () => {
    mockPurchaseAccess = { read: true, create: true, review: true, commit: false, automate: false };
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data:[draftInvoice] });
    api.updatePharmacyPurchaseInvoiceDraft.mockResolvedValue(draftInvoice);
    api.reviewPharmacyPurchaseInvoice.mockResolvedValue({...draftInvoice,status:'REVIEWED'});
    render(<PurchaseInvoiceWorkbench />);
    await editSelectedInvoice();
    fireEvent.change(screen.getByLabelText('Batch'),{target:{value:'CORRECTED-BATCH'}});
    fireEvent.click(screen.getByRole('button',{name:'Mark Reviewed'}));
    await waitFor(()=>expect(api.reviewPharmacyPurchaseInvoice).toHaveBeenCalled());
    expect(api.updatePharmacyPurchaseInvoiceDraft).toHaveBeenCalledWith('pinv-1',expect.objectContaining({items:[expect.objectContaining({batchNumber:'CORRECTED-BATCH'})]}));
    expect(api.updatePharmacyPurchaseInvoiceDraft.mock.invocationCallOrder[0]).toBeLessThan(api.reviewPharmacyPurchaseInvoice.mock.invocationCallOrder[0]);
  });

  it('keeps printed totals when a rate and a reported total are corrected together', async () => {
    const flagged = { ...draftInvoice, items: [{ ...draftInvoice.items[0], cgstPercent: 6, sgstPercent: 6 }] };
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [flagged] });
    api.updatePharmacyPurchaseInvoiceDraft.mockResolvedValue(flagged);
    render(<PurchaseInvoiceWorkbench />);
    await editSelectedInvoice();
    fireEvent.change(screen.getByLabelText('Rate'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Reported Net payable'), { target: { value: '115' } });
    saveCurrentInvoice();
    await waitFor(() => expect(api.updatePharmacyPurchaseInvoiceDraft).toHaveBeenCalled());
    expect(api.updatePharmacyPurchaseInvoiceDraft).toHaveBeenCalledWith('pinv-1', expect.objectContaining({
      netPayable: 115, taxableAmount: 100,
      items: [expect.objectContaining({ purchaseRate: 90, taxableAmount: 100, lineTotal: 112 })],
    }));
  });

  it('processes a saved invoice directly and does not show committed stock as editable', async () => {
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [draftInvoice] });
    api.processPharmacyPurchaseInvoice.mockResolvedValue({
      invoice: { ...draftInvoice, status: 'STOCK_COMMITTED' },
      automation: { status: 'STOCK_COMMITTED', issues: [] },
    });
    render(<PurchaseInvoiceWorkbench />);
    fireEvent.click(await screen.findByText('More actions'));
    fireEvent.click(screen.getByRole('button', { name: 'Process Saved Invoice' }));
    expect(await screen.findByText(/stock added automatically/)).toBeInTheDocument();
    expect(api.processPharmacyPurchaseInvoice).toHaveBeenCalledWith('pinv-1');
    expect(screen.queryByRole('button', { name: 'Process Saved Invoice' })).not.toBeInTheDocument();
  });

  it('lets staff correct a reported total before saving and processing, and rejects clearing it', async () => {
    const flagged = { ...draftInvoice, netPayable: 120, status: 'RECONCILIATION_FAILED',
      items: [{ ...draftInvoice.items[0], cgstPercent: 6, sgstPercent: 6 }] };
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [flagged] });
    api.updatePharmacyPurchaseInvoiceDraft.mockResolvedValue({ ...flagged, netPayable: 112 });
    api.processPharmacyPurchaseInvoice.mockResolvedValue({ invoice: { ...flagged, netPayable: 112, status: 'STOCK_COMMITTED' },
      automation: { status: 'STOCK_COMMITTED', issues: [] } });
    render(<PurchaseInvoiceWorkbench />);
    await editSelectedInvoice();
    fireEvent.change(screen.getByLabelText('Reported Net payable'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & Process' }));
    expect(api.updatePharmacyPurchaseInvoiceDraft).not.toHaveBeenCalled();
    expect(api.processPharmacyPurchaseInvoice).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save & Process' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Reported Net payable'), { target: { value: '112' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & Process' }));
    await waitFor(() => expect(api.processPharmacyPurchaseInvoice).toHaveBeenCalledWith('pinv-1'));
    expect(api.updatePharmacyPurchaseInvoiceDraft).toHaveBeenCalledWith('pinv-1', expect.objectContaining({ netPayable: 112 }));
    expect(await screen.findByText(/stock added automatically/)).toBeInTheDocument();
  });

  it('submits a valid draft with calculated line and header totals', async () => {
    api.createPharmacyPurchaseInvoiceDraft.mockResolvedValue(draftInvoice);

    render(<PurchaseInvoiceWorkbench />);

    fireEvent.change(screen.getByLabelText('Distributor'), {
      target: { value: 'Apex Distributors' },
    });
    fireEvent.change(screen.getByLabelText('GSTIN'), {
      target: { value: '36ABCDE1234F1Z5' },
    });
    fireEvent.change(screen.getByLabelText('DL No.'), {
      target: { value: 'TS/HYD/20B/12345' },
    });
    fireEvent.change(screen.getByLabelText('Invoice No.'), {
      target: { value: 'APX-001' },
    });
    fireEvent.change(screen.getByLabelText('Doctor / Reg. No. (optional)'), {
      target: { value: 'Dr. Shravya / TS-MC-12345' },
    });
    fireEvent.change(screen.getByLabelText('Product'), {
      target: { value: 'Azithral 500 Tablet' },
    });
    fireEvent.change(screen.getByLabelText('Manufacturer (optional)'), {
      target: { value: 'Alembic' },
    });
    fireEvent.change(screen.getByLabelText('Pack Size'), {
      target: { value: 'Strip of 3' },
    });
    fireEvent.change(screen.getByLabelText('HSN'), { target: { value: '3004' } });
    fireEvent.change(screen.getByLabelText('Batch'), {
      target: { value: 'AZT2401' },
    });

    fireEvent.change(screen.getByLabelText('Rate'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('MRP'), { target: { value: '120' } });
    saveCurrentInvoice();

    await waitFor(() => expect(api.createPharmacyPurchaseInvoiceDraft).toHaveBeenCalledTimes(1));
    expect(api.createPharmacyPurchaseInvoiceDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        distributorName: 'Apex Distributors',
        distributorGstin: '36ABCDE1234F1Z5',
        invoiceNumber: 'APX-001',
        grossAmount: 100,
        taxableAmount: 100,
        totalCgst: 6,
        totalSgst: 6,
        totalGst: 12,
        netPayable: 112,
        items: [
          expect.objectContaining({
            productName: 'Azithral 500 Tablet',
            quantityPurchased: 1,
            purchaseRate: 100,
            taxableAmount: 100,
            gstAmount: 12,
            lineTotal: 112,
          }),
        ],
      }),
    );
    expect(await screen.findByText(/saved as DRAFT/i)).toBeInTheDocument();
  });

  it('prefills purchase intake from invoice OCR before saving the reviewed draft', async () => {
    api.createPharmacyPurchaseInvoiceDraft.mockResolvedValue({
      ...draftInvoice,
      status: 'OCR_REVIEW_REQUIRED',
      unresolvedOcrFlags: 1,
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        draft: {
          distributorName: 'Apex Distributors',
          distributorGstin: '36ABCDE1234F1Z5',
          distributorDlNo: 'TS/HYD/20B/12345',
          invoiceNumber: 'APX-001',
          invoiceDate: '2026-05-01',
          goodsReceivedDate: '2026-05-02',
          billType: 'CASH',
          doctorNameOrRegNo: 'Dr. Shravya / TS-MC-12345',
          source: 'OCR',
          items: [
            {
              productName: 'Azithral 500 Tablet',
              manufacturer: 'Alembic',
              packSize: 'Strip of 3',
              packUnitType: 'Tablet',
              hsnCode: '3004',
              batchNumber: 'AZT2401',
              expiryMonth: 12,
              expiryYear: 2027,
              quantityPurchased: 1,
              freeQuantity: 0,
              mrp: 120,
              purchaseRate: 100,
              discountPercent: 0,
              specialDiscountPercent: 0,
              cgstPercent: 6,
              sgstPercent: 6,
              igstPercent: 0,
              ocrConfidence: 0.86,
              ocrFlags: ['low_confidence_line'],
            },
          ],
        },
        extraction: {
          fileName: 'apex-invoice.pdf',
          pageCount: 1,
          includedPageCount: 1,
          flags: [],
        },
        masterMatches: {
          matches: [
            {
              lineIndex: 0,
              ocr: {
                productName: 'Azithral 500 Tablet',
                manufacturer: 'Alembic',
                packSize: 'Strip of 3',
                mrp: 120,
                purchaseRate: 100,
                batchNumber: 'AZT2401',
              },
              recommendedAction: 'MATCH_EXISTING',
              candidates: [
                {
                  drug: {
                    id: 'drug-1',
                    name: 'Azithral 500mg Tablet',
                    price: 125,
                    manufacturerName: 'Alembic Pharmaceuticals',
                    packSizeLabel: 'Strip of 3',
                    composition1: 'Azithromycin',
                    category: 'Antibiotic',
                    dosageForm: 'Tablet',
                    strength: '500mg',
                  },
                  score: 92,
                  confidence: 'HIGH',
                  reasons: ['name exact/near match', 'pack size match'],
                },
              ],
            },
          ],
        },
      }),
    });
    api.confirmPharmacyPurchaseMaster.mockResolvedValue({
      action: 'MATCH_EXISTING',
      drug: {
        id: 'drug-1',
        name: 'Azithral 500mg Tablet',
        price: 120,
        manufacturerName: 'Alembic Pharmaceuticals',
        packSizeLabel: 'Strip of 3',
        composition1: 'Azithromycin',
        category: 'Antibiotic',
        dosageForm: 'Tablet',
        strength: '500mg',
      },
      linePatch: {
        productName: 'Azithral 500mg Tablet',
        manufacturer: 'Alembic Pharmaceuticals',
        packSize: 'Strip of 3',
        mrp: 120,
        purchaseRate: 100,
      },
      message: 'Matched Azithral 500 Tablet to Azithral 500mg Tablet',
    });

    render(<PurchaseInvoiceWorkbench />);

    const file = new File(['pdf'], 'apex-invoice.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(screen.getByLabelText('Upload invoice PDF or image'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Extract Draft' }));

    expect(await screen.findByDisplayValue('Apex Distributors')).toBeInTheDocument();
    expect(screen.getByDisplayValue('APX-001')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Azithral 500 Tablet')).toBeInTheDocument();
    expect(screen.getByText('DB Master Candidate')).toBeInTheDocument();
    expect(screen.getByText('Azithral 500mg Tablet')).toBeInTheDocument();
    expect(screen.getByText(/Extracted 1 line item/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Match' }));

    await waitFor(() =>
      expect(api.confirmPharmacyPurchaseMaster).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MATCH_EXISTING',
          drugId: 'drug-1',
          item: expect.objectContaining({
            productName: 'Azithral 500 Tablet',
            manufacturer: 'Alembic',
            mrp: 120,
          }),
        }),
      ),
    );
    expect(await screen.findByDisplayValue('Azithral 500mg Tablet')).toBeInTheDocument();

    saveCurrentInvoice();

    await waitFor(() =>
      expect(api.createPharmacyPurchaseInvoiceDraft).toHaveBeenCalledTimes(1),
    );
    expect(api.createPharmacyPurchaseInvoiceDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'OCR',
        distributorName: 'Apex Distributors',
        invoiceNumber: 'APX-001',
        items: [
          expect.objectContaining({
            productName: 'Azithral 500mg Tablet',
            ocrConfidence: 0.86,
            ocrFlags: ['low_confidence_line'],
          }),
        ],
      }),
    );
  });

  it('saves OCR with missing descriptive fields and updates the same draft on a second save', async () => {
    api.createPharmacyPurchaseInvoiceDraft.mockResolvedValue(draftInvoice);
    api.updatePharmacyPurchaseInvoiceDraft.mockResolvedValue(draftInvoice);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ draft: {
        ...draftInvoice, invoiceDate: '2026-05-01', goodsReceivedDate: '2026-05-02',
        source: 'OCR', doctorNameOrRegNo: '', distributorDlNo: '',
        items: [{ ...draftInvoice.items[0], manufacturer: '', hsnCode: '', packUnitType: 'Tablet' }],
      }, extraction: { flags: ['check_supplier'] } }),
    });
    render(<PurchaseInvoiceWorkbench />);
    fireEvent.change(screen.getByLabelText('Upload invoice PDF or image'), {
      target: { files: [new File(['image'], 'invoice.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Extract Draft' }));
    await screen.findByDisplayValue('APX-001');
    saveCurrentInvoice();
    await waitFor(() => expect(api.createPharmacyPurchaseInvoiceDraft).toHaveBeenCalledTimes(1));
    await screen.findByText(/saved as DRAFT/i);
    fireEvent.change(screen.getByLabelText('Manufacturer (optional)'), { target: { value: 'Corrected manufacturer' } });
    saveCurrentInvoice();
    await waitFor(() => expect(api.updatePharmacyPurchaseInvoiceDraft).toHaveBeenCalledWith(
      'pinv-1', expect.objectContaining({ items: [expect.objectContaining({ manufacturer: 'Corrected manufacturer' })] }),
    ));
    expect(api.createPharmacyPurchaseInvoiceDraft).toHaveBeenCalledTimes(1);
  });

  it('reopens a saved draft with header flags and retains edits after a failed update', async () => {
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [{ ...draftInvoice, ocrFlags: ['check_supplier'] }] });
    api.updatePharmacyPurchaseInvoiceDraft.mockRejectedValueOnce(new Error('Connection interrupted'));
    render(<PurchaseInvoiceWorkbench />);
    await editSelectedInvoice();
    expect(screen.getByLabelText('Invoice OCR Flags')).toHaveValue('check_supplier');
    fireEvent.change(screen.getByLabelText('Manufacturer (optional)'), { target: { value: 'Corrected manufacturer' } });
    saveCurrentInvoice();
    await screen.findByText('Connection interrupted');
    expect(api.processPharmacyPurchaseInvoice).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Manufacturer (optional)')).toHaveValue('Corrected manufacturer');
    expect(api.createPharmacyPurchaseInvoiceDraft).not.toHaveBeenCalled();
    api.updatePharmacyPurchaseInvoiceDraft.mockResolvedValueOnce(draftInvoice);
    saveCurrentInvoice();
    await screen.findByText(/Automatic intake needs a human review/i);
    expect(api.updatePharmacyPurchaseInvoiceDraft).toHaveBeenCalledTimes(2);
  });

  it('recovers unfinished OCR edits after remount without hiding them behind another recent invoice', async () => {
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [draftInvoice] });
    const view = render(<PurchaseInvoiceWorkbench />);
    fireEvent.change(screen.getByLabelText('Distributor'), { target: { value: 'Unsaved supplier' } });
    view.unmount();
    render(<PurchaseInvoiceWorkbench />);
    expect(await screen.findByDisplayValue('Unsaved supplier')).toBeVisible();
    await waitFor(() => expect(api.getPharmacyPurchaseInvoices).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: 'Finish invoice review' })).not.toBeInTheDocument();
    expect(screen.getByText(/Restored your unfinished purchase draft/)).toBeInTheDocument();
    expect(api.createPharmacyPurchaseInvoiceDraft).not.toHaveBeenCalled();
  });

  it('returns to Invoice OCR and resumes the same corrections without saving or processing', async () => {
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [draftInvoice] });
    render(<PurchaseInvoiceWorkbench />);
    await editSelectedInvoice();
    fireEvent.change(screen.getByLabelText('Batch'), { target: { value: 'UNSAVED-CORRECTION' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back to Invoice OCR' }));
    expect(screen.getByRole('heading', { name: 'Invoice OCR' })).toBeVisible();
    expect(screen.getByLabelText('Upload invoice PDF or image')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Finish invoice review' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume invoice' }));
    expect(screen.getByLabelText('Batch')).toHaveValue('UNSAVED-CORRECTION');
    expect(screen.getByRole('button', { name: 'Save & Process' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Invoice OCR' }));
    fireEvent.click(screen.getByRole('button', { name: /APX-001.*Apex Distributors/ }));
    expect(screen.getByLabelText('Batch')).toHaveValue('UNSAVED-CORRECTION');
    expect(screen.queryByRole('button', { name: 'Resume invoice' })).not.toBeInTheDocument();
    expect(api.updatePharmacyPurchaseInvoiceDraft).not.toHaveBeenCalled();
    expect(api.processPharmacyPurchaseInvoice).not.toHaveBeenCalled();
  });

  it('keeps all product fields and confirmation controls visible in one review checklist', async () => {
    const invoice = { ...draftInvoice, status: 'OCR_REVIEW_REQUIRED', unresolvedOcrFlags: 2,
      ocrFlags: ['uncertain_bill_type'], items: [draftInvoice.items[0], { ...draftInvoice.items[0], id: 'line-2',
        lineNumber: 2, packUnitType: '', ocrFlags: ['missing_packUnitType'] }] };
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [invoice] });
    render(<PurchaseInvoiceWorkbench />);
    await editSelectedInvoice();
    const checklist = screen.getByRole('region', { name: 'Check before adding stock' });
    expect(within(checklist).getByRole('button', { name: 'Confirm bill type checked' })).toBeVisible();
    expect(within(checklist).getByRole('button', { name: 'Confirm line 2 stock unit checked' })).toBeVisible();
    for (const product of screen.getAllByLabelText('Product')) expect(product).toBeVisible();
    expect(screen.getByRole('status', { name: 'Stock status' })).toHaveTextContent('Stock not added');
  });

  it('restores manual review after reopening an invoice held only by supplier matching and OCR confidence', async () => {
    const invoice = { ...draftInvoice, status: 'RECONCILIATION_FAILED', ocrFlags: [], reconciliationIssues: [
      'AUTO: Automatic intake requires one active saved supplier with matching name and GSTIN. Select a saved supplier or review manually.',
      'AUTO: Line 1: OCR confidence must be at least 98% for automatic stock intake; review this line manually.',
    ] };
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [invoice] });
    const view = render(<PurchaseInvoiceWorkbench />);
    await editSelectedInvoice();
    view.unmount();
    render(<PurchaseInvoiceWorkbench />);
    expect(await screen.findByRole('button', { name: 'Mark Reviewed' })).toBeEnabled();
    expect(screen.getByRole('status', { name: 'Stock status' })).toHaveTextContent('Stock not added');
    expect(api.processPharmacyPurchaseInvoice).not.toHaveBeenCalled();
  });

  it.each(['lost', 'empty'])('checks saved stock status after a %s processing response instead of reporting stock was not added', async failure => {
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [draftInvoice] });
    api.updatePharmacyPurchaseInvoiceDraft.mockResolvedValue(draftInvoice);
    if (failure === 'lost') api.processPharmacyPurchaseInvoice.mockRejectedValueOnce(new Error('Connection interrupted'));
    else api.processPharmacyPurchaseInvoice.mockResolvedValueOnce({});
    api.getPharmacyPurchaseInvoiceById.mockResolvedValue({ ...draftInvoice, status: 'STOCK_COMMITTED',
      stockCommittedAt: '2026-09-13T12:00:00Z', stockCommitReference: 'STOCK-APX-001' });
    render(<PurchaseInvoiceWorkbench />);
    await editSelectedInvoice();
    fireEvent.click(screen.getByRole('button', { name: 'Save & Process' }));
    await waitFor(() => expect(api.getPharmacyPurchaseInvoiceById).toHaveBeenCalledWith('pinv-1'));
    expect(await screen.findByRole('status', { name: 'Stock status' })).toHaveTextContent('Stock added');
    expect(screen.getByRole('status', { name: 'Stock status' })).toHaveTextContent('STOCK-APX-001');
    expect(api.commitPharmacyPurchaseInvoiceStock).not.toHaveBeenCalled();
  });

  it('does not claim stock is uncommitted when both processing and the status check fail', async () => {
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [draftInvoice] });
    api.updatePharmacyPurchaseInvoiceDraft.mockResolvedValue(draftInvoice);
    api.processPharmacyPurchaseInvoice.mockRejectedValueOnce(new Error('Connection interrupted'));
    api.getPharmacyPurchaseInvoiceById.mockRejectedValueOnce(new Error('Offline'));
    render(<PurchaseInvoiceWorkbench />);
    await editSelectedInvoice();
    fireEvent.click(screen.getByRole('button', { name: 'Save & Process' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Stock status' })).toHaveTextContent('Stock status unknown'));
    expect(screen.getByRole('status', { name: 'Stock status' })).not.toHaveTextContent('Stock not added');
    expect(screen.getByRole('button', { name: 'Refresh stock status' })).toBeEnabled();
    api.getPharmacyPurchaseInvoiceById.mockResolvedValueOnce({ ...draftInvoice, status: 'STOCK_COMMITTED', stockCommitReference: 'RETRY-STATUS' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh stock status' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Stock status' })).toHaveTextContent('Stock added'));
    expect(api.processPharmacyPurchaseInvoice).toHaveBeenCalledTimes(1);
    expect(api.commitPharmacyPurchaseInvoiceStock).not.toHaveBeenCalled();
  });

  it('recovers the manual-review action when a lost response left a saved review exception', async () => {
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [draftInvoice] });
    api.updatePharmacyPurchaseInvoiceDraft.mockResolvedValue(draftInvoice);
    api.processPharmacyPurchaseInvoice.mockRejectedValueOnce(new Error('Response lost'));
    api.getPharmacyPurchaseInvoiceById.mockResolvedValue({ ...draftInvoice, status: 'RECONCILIATION_FAILED',
      reconciliationIssues: ['AUTO: Line 1: OCR confidence must be at least 98% for automatic stock intake; review this line manually.'] });
    render(<PurchaseInvoiceWorkbench />);
    await editSelectedInvoice();
    fireEvent.click(screen.getByRole('button', { name: 'Save & Process' }));
    expect(await screen.findByRole('button', { name: 'Mark Reviewed' })).toBeEnabled();
    expect(screen.getByRole('status', { name: 'Stock status' })).toHaveTextContent('Stock not added');
    expect(api.processPharmacyPurchaseInvoice).toHaveBeenCalledTimes(1);
  });

  it('keeps unknown automatic exceptions blocked instead of treating them as manual-review-only checks', async () => {
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [{ ...draftInvoice, status: 'RECONCILIATION_FAILED',
      reconciliationIssues: ['AUTO: Line GST sum does not match header GST'] }] });
    render(<PurchaseInvoiceWorkbench />);
    await editSelectedInvoice();
    expect(screen.queryByRole('button', { name: 'Mark Reviewed' })).not.toBeInTheDocument();
    const checklist = screen.getByRole('region', { name: 'Check before adding stock' });
    within(checklist).getAllByText(/This check cannot be dismissed/).forEach(message => expect(message).toBeVisible());
    expect(within(checklist).getByRole('link', { name: 'Go to invoice totals' })).toHaveAttribute('href', '#purchase-totals');
  });

  it('confirms a successful commit from the server when the commit response is lost', async () => {
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [{ ...draftInvoice, status: 'REVIEWED' }] });
    api.commitPharmacyPurchaseInvoiceStock.mockRejectedValueOnce(new Error('Response lost'));
    api.getPharmacyPurchaseInvoiceById.mockResolvedValue({ ...draftInvoice, status: 'STOCK_COMMITTED', stockCommitReference: 'RECOVERED-COMMIT' });
    render(<PurchaseInvoiceWorkbench />);
    fireEvent.click(await screen.findByRole('button', { name: 'Commit Stock' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Stock status' })).toHaveTextContent('RECOVERED-COMMIT'));
    expect(api.commitPharmacyPurchaseInvoiceStock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Commit Stock' })).not.toBeInTheDocument();
  });

  it('reviews a clean draft and commits reviewed stock explicitly', async () => {
    const reviewedInvoice = {
      ...draftInvoice,
      status: 'REVIEWED',
    };
    const committedInvoice = {
      ...draftInvoice,
      status: 'STOCK_COMMITTED',
      stockCommitReference: 'PINV-APX-001-inv1',
      committedItems: [
        {
          lineNumber: 1,
          productName: 'Azithral 500 Tablet',
          inventoryItemId: 'inv-item-1',
          quantityCommitted: 1,
          batchNumber: 'AZT2401',
          expiryDate: '2027-12-31T23:59:59.999Z',
        },
      ],
    };
    api.getPharmacyPurchaseInvoices
      .mockResolvedValueOnce({ data: [draftInvoice] })
      .mockResolvedValueOnce({ data: [reviewedInvoice] })
      .mockResolvedValueOnce({ data: [committedInvoice] });
    api.reviewPharmacyPurchaseInvoice.mockResolvedValue({
      ...draftInvoice,
      status: 'REVIEWED',
    });
    api.commitPharmacyPurchaseInvoiceStock.mockResolvedValue(committedInvoice);

    render(<PurchaseInvoiceWorkbench />);

    expect((await screen.findAllByText('APX-001')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Mark Reviewed' }));

    await waitFor(() =>
      expect(api.reviewPharmacyPurchaseInvoice).toHaveBeenCalledWith('pinv-1', {
        goodsReceivedDate: expect.any(String),
        handwrittenNotes: undefined,
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Commit Stock' }));

    await waitFor(() =>
      expect(api.commitPharmacyPurchaseInvoiceStock).toHaveBeenCalledWith('pinv-1'),
    );
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('APX-001'));
    expect(await screen.findByText(/Stock committed for APX-001/i)).toBeInTheDocument();
  });

  it('shows backend reconciliation problems and keeps review disabled', async () => {
    api.getPharmacyPurchaseInvoices.mockResolvedValue({
      data: [
        {
          ...draftInvoice,
          status: 'RECONCILIATION_FAILED',
          reconciliationIssues: ['Line GST sum does not match header GST'],
        },
      ],
    });

    render(<PurchaseInvoiceWorkbench />);

    expect(await screen.findByRole('region', { name: 'Check before adding stock' })).toBeInTheDocument();
    expect(await screen.findByText('Line GST sum does not match header GST')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark Reviewed' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review issues' })).toBeEnabled();
  });
});
