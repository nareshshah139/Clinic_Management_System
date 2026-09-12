import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
    getPharmacyPurchaseInvoices: jest.fn(),
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

describe('PurchaseInvoiceWorkbench', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPurchaseAccess = { read: true, create: true, review: true, commit: true, automate: true };
    api.get.mockResolvedValue([]);
    sessionStorage.clear();
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [] });
    api.getUnlinkedPurchaseDocuments.mockResolvedValue([]);
    window.confirm = jest.fn(() => true);
    (global as any).fetch = jest.fn();
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
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
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

  it('lets staff attach a previously unlinked upload while correcting a saved draft', async () => {
    const document = { id: 'old-upload', fileName: 'earlier.jpg', mimeType: 'image/jpeg', sizeBytes: 3000 };
    api.getUnlinkedPurchaseDocuments.mockResolvedValue([document]);
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [draftInvoice] });
    api.updatePharmacyPurchaseInvoiceDraft.mockResolvedValue({ ...draftInvoice, documents: [document] });
    render(<PurchaseInvoiceWorkbench />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit saved draft' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use for this draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(api.updatePharmacyPurchaseInvoiceDraft).toHaveBeenCalledWith('pinv-1', expect.objectContaining({ sourceDocumentId: 'old-upload' })));
  });

  it('blocks invalid purchase drafts before calling the API', async () => {
    render(<PurchaseInvoiceWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

    expect(await screen.findByText('Fix Required')).toBeInTheDocument();
    expect(screen.getByText('Distributor name is required')).toBeInTheDocument();
    expect(api.createPharmacyPurchaseInvoiceDraft).not.toHaveBeenCalled();
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
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
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
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
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
    fireEvent.click(await screen.findByRole('button', { name: 'Edit saved draft' }));
    fireEvent.change(screen.getByLabelText('Manufacturer'), { target: { value: 'Corrected manufacturer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & Process' }));
    await waitFor(() => expect(api.processPharmacyPurchaseInvoice).toHaveBeenCalledWith('pinv-1'));
    expect(api.updatePharmacyPurchaseInvoiceDraft).toHaveBeenCalledWith('pinv-1', expect.objectContaining({
      netPayable: 120, items: [expect.objectContaining({ ocrConfidence: 0.979 })],
    }));
  });

  it('saves current corrections before manually marking a draft reviewed', async () => {
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data:[draftInvoice] });
    api.updatePharmacyPurchaseInvoiceDraft.mockResolvedValue(draftInvoice);
    api.reviewPharmacyPurchaseInvoice.mockResolvedValue({...draftInvoice,status:'REVIEWED'});
    render(<PurchaseInvoiceWorkbench />);
    fireEvent.click(await screen.findByRole('button',{name:'Edit saved draft'}));
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
    fireEvent.click(await screen.findByRole('button', { name: 'Edit saved draft' }));
    fireEvent.change(screen.getByLabelText('Rate'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Reported Net payable'), { target: { value: '115' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
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
    fireEvent.click(await screen.findByRole('button', { name: 'Process Saved Invoice' }));
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
    fireEvent.click(await screen.findByRole('button', { name: 'Edit saved draft' }));
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
    fireEvent.change(screen.getByLabelText('Manufacturer'), {
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
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(api.createPharmacyPurchaseInvoiceDraft).toHaveBeenCalledTimes(1));
    await screen.findByText(/saved as DRAFT/i);
    fireEvent.change(screen.getByLabelText('Manufacturer'), { target: { value: 'Corrected manufacturer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(api.updatePharmacyPurchaseInvoiceDraft).toHaveBeenCalledWith(
      'pinv-1', expect.objectContaining({ items: [expect.objectContaining({ manufacturer: 'Corrected manufacturer' })] }),
    ));
    expect(api.createPharmacyPurchaseInvoiceDraft).toHaveBeenCalledTimes(1);
  });

  it('reopens a saved draft with header flags and retains edits after a failed update', async () => {
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [{ ...draftInvoice, ocrFlags: ['check_supplier'] }] });
    api.updatePharmacyPurchaseInvoiceDraft.mockRejectedValueOnce(new Error('Connection interrupted'));
    render(<PurchaseInvoiceWorkbench />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit saved draft' }));
    expect(screen.getByLabelText('Invoice OCR Flags')).toHaveValue('check_supplier');
    fireEvent.change(screen.getByLabelText('Manufacturer'), { target: { value: 'Corrected manufacturer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await screen.findByText('Connection interrupted');
    expect(screen.getByLabelText('Manufacturer')).toHaveValue('Corrected manufacturer');
    expect(api.createPharmacyPurchaseInvoiceDraft).not.toHaveBeenCalled();
    api.updatePharmacyPurchaseInvoiceDraft.mockResolvedValueOnce(draftInvoice);
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await screen.findByText(/saved as DRAFT/i);
    expect(api.updatePharmacyPurchaseInvoiceDraft).toHaveBeenCalledTimes(2);
  });

  it('recovers unfinished OCR edits after remount without claiming a server save', async () => {
    const view = render(<PurchaseInvoiceWorkbench />);
    fireEvent.change(screen.getByLabelText('Distributor'), { target: { value: 'Unsaved supplier' } });
    view.unmount();
    render(<PurchaseInvoiceWorkbench />);
    expect(await screen.findByDisplayValue('Unsaved supplier')).toBeInTheDocument();
    expect(screen.getByText(/Restored your unfinished purchase draft/)).toBeInTheDocument();
    expect(api.createPharmacyPurchaseInvoiceDraft).not.toHaveBeenCalled();
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

    expect(await screen.findByText('Reconciliation Issues')).toBeInTheDocument();
    expect(screen.getByText('Line GST sum does not match header GST')).toBeInTheDocument();
    const reviewButton = screen.getByRole('button', { name: 'Mark Reviewed' });
    expect(reviewButton).toBeDisabled();
  });
});
