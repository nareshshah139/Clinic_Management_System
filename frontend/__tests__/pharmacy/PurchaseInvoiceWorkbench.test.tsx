import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PurchaseInvoiceWorkbench } from '@/components/pharmacy/PurchaseInvoiceWorkbench';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  apiClient: {
    getPharmacyPurchaseInvoices: jest.fn(),
    createPharmacyPurchaseInvoiceDraft: jest.fn(),
    suggestPharmacyPurchaseMasterMatches: jest.fn(),
    confirmPharmacyPurchaseMaster: jest.fn(),
    reviewPharmacyPurchaseInvoice: jest.fn(),
    commitPharmacyPurchaseInvoiceStock: jest.fn(),
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
    api.getPharmacyPurchaseInvoices.mockResolvedValue({ data: [] });
    window.confirm = jest.fn(() => true);
    (global as any).fetch = jest.fn();
  });

  it('blocks invalid purchase drafts before calling the API', async () => {
    render(<PurchaseInvoiceWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

    expect(await screen.findByText('Fix Required')).toBeInTheDocument();
    expect(screen.getByText('Distributor name is required')).toBeInTheDocument();
    expect(api.createPharmacyPurchaseInvoiceDraft).not.toHaveBeenCalled();
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
    fireEvent.change(screen.getByLabelText('Doctor / Reg. No.'), {
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
