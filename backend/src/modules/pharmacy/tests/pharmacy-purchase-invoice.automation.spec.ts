import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';

describe('Automatic purchase invoice intake', () => {
  let service: PharmacyPurchaseInvoiceService;
  let prisma: any;
  let stored: any;
  let draft: any;
  const file = { buffer: Buffer.from('synthetic'), size: 9 } as Express.Multer.File;

  beforeEach(() => {
    stored = undefined;
    draft = {
      distributorName: 'Example Supplies', distributorGstin: '36ABCDE1234F1Z5',
      distributorDlNo: 'TEST-DL', invoiceNumber: 'AUTO-001', invoiceDate: '2026-01-01',
      goodsReceivedDate: '2026-01-02', billType: 'CASH', doctorNameOrRegNo: 'Example Clinic',
      source: 'OCR', grossAmount: 1000, taxableAmount: 1000, totalCgst: 60,
      totalSgst: 60, totalIgst: 0, totalGst: 120, netPayable: 1120, ocrFlags: [],
      items: [{
        productName: 'Example Cream', manufacturer: 'Example Pharma', packSize: '20g',
        packUnitType: 'Tube', hsnCode: '3004', batchNumber: 'TEST-B1',
        expiryMonth: 12, expiryYear: 2099, quantityPurchased: 10, freeQuantity: 2,
        mrp: 150, purchaseRate: 100, discountPercent: 0, taxableAmount: 1000,
        cgstPercent: 6, sgstPercent: 6, igstPercent: 0, gstAmount: 120,
        lineTotal: 1120, ocrConfidence: 0.99, ocrFlags: [],
      }],
    };
    prisma = {
      supplier: { findMany: jest.fn(async () => [{ id:'supplier-1', name:'Example Supplies', gstNumber:'36ABCDE1234F1Z5' }]) },
      pharmacyPurchaseInvoiceDocument: { updateMany: jest.fn(async () => ({ count: 1 })) },
      pharmacyPurchaseInvoice: {
        create: jest.fn(async ({ data }: any) => {
          stored = { ...data, id: 'invoice-1', updatedAt: new Date(),
            items: data.items.create.map((item: any) => ({ ...item, id: 'line-1' })) };
          return stored;
        }),
        findFirst: jest.fn(async () => stored),
        update: jest.fn(async ({ data }: any) => { stored = { ...stored, ...data }; return stored; }),
        updateMany: jest.fn(async ({ data }: any) => { stored = { ...stored, ...data }; return { count: 1 }; }),
      },
      drug: {
        findMany: jest.fn(async () => [{
          id: 'drug-1', name: 'Example Cream', manufacturerName: 'Example Pharma', packSizeLabel: '20g',
          composition1: 'Example', category: 'Topical', dosageForm: 'Cream', strength: '1%',
        }]),
        create: jest.fn(), update: jest.fn(),
      },
      inventoryItem: { findMany: jest.fn(async () => []), create: jest.fn(async () => ({ id: 'stock-1' })), update: jest.fn() },
      stockTransaction: { create: jest.fn() },
      $transaction: jest.fn(async (callback: any) => {
        const previous = structuredClone(stored);
        try { return await callback(prisma); } catch (error) { stored = previous; throw error; }
      }),
    };
    service = new PharmacyPurchaseInvoiceService(prisma);
    jest.spyOn(service, 'archiveOriginal').mockResolvedValue({ id: 'document-1', fileName: 'synthetic.jpg', mimeType: 'image/jpeg', sizeBytes: 9, sha256: 'synthetic', createdAt: new Date(), purchaseInvoiceId: null });
    jest.spyOn(service, 'extractDocumentDraft').mockImplementation(async () => ({
      draft, extraction: { provider: 'codex-oauth' },
    } as any));
  });

  const importInvoice = () => (service as any).importFromDocument(file, 'branch-1', 'user-1', '2026-01-02');

  it('preserves fractional quantities and blocks them before stock commit', async () => {
    const normalized = (service as any).normalizeExtractedPurchaseLine({ ...draft.items[0], freeQuantity: 0.004 }, 1);
    expect(normalized.freeQuantity).toBe(0.004);
    draft.items[0] = normalized;
    const result = await importInvoice();
    expect(result.automation.status).toBe('SAVED_FOR_REVIEW');
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('does not require a doctor on a supplier purchase invoice', async () => {
    draft.doctorNameOrRegNo = '';
    const result = await importInvoice();
    expect(result.automation.status).toBe('STOCK_COMMITTED');
  });

  it('does not run OCR or add stock if original-file archiving fails', async () => {
    jest.mocked(service.archiveOriginal).mockRejectedValueOnce(new Error('Synthetic storage failure'));
    await expect(importInvoice()).rejects.toThrow('Synthetic storage failure');
    expect(service.extractDocumentDraft).not.toHaveBeenCalled();
    expect(prisma.pharmacyPurchaseInvoice.create).not.toHaveBeenCalled();
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('saves extracted headers and rows and commits fully validated stock in one operation', async () => {
    const result = await importInvoice();
    expect(result.automation.status).toBe('STOCK_COMMITTED');
    expect(result.invoice.status).toBe('STOCK_COMMITTED');
    expect(prisma.pharmacyPurchaseInvoice.create).toHaveBeenCalledTimes(1);
    expect(prisma.stockTransaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      branchId: 'branch-1', userId: 'user-1', quantity: 12, type: 'PURCHASE',
    }) }));
    expect(prisma.drug.create).not.toHaveBeenCalled();
    expect(prisma.drug.update).not.toHaveBeenCalled();
  });

  it.each([
    ['OCR flag', (value: any) => { value.items[0].ocrFlags = ['unclear_batch']; }],
    ['low confidence', (value: any) => { value.items[0].ocrConfidence = 0.97; }],
    ['missing confidence', (value: any) => { delete value.items[0].ocrConfidence; }],
    ['mismatched totals', (value: any) => { value.netPayable = 1200; }],
    ['mismatched rate and quantity', (value: any) => { value.items[0].quantityPurchased = 100; }],
    ['expired batch', (value: any) => { value.items[0].expiryYear = 2020; }],
    ['fractional stock', (value: any) => { value.items[0].freeQuantity = 0.5; }],

  ])('saves %s for correction without changing stock', async (_label, change) => {
    change(draft);
    const result = await importInvoice();
    expect(result.invoice.id).toBe('invoice-1');
    expect(result.automation.status).toBe('SAVED_FOR_REVIEW');
    expect(result.automation.issues.length).toBeGreaterThan(0);
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('enriches a uniquely matched product from its saved manufacturer and canonical pack', async () => {
    draft.items[0].manufacturer = '';
    draft.items[0].packSize = '20';
    draft.items[0].packUnitType = 'GM';
    const result = await importInvoice();
    expect(result.automation.status).toBe('STOCK_COMMITTED');
    expect(result.invoice.items[0].manufacturer).toBe('Example Pharma');
  });

  it('blocks a valid-looking GSTIN that disagrees with the saved supplier', async () => {
    draft.distributorGstin = '36AACDE1234F1Z5';
    const result = await importInvoice();
    expect(result.automation.status).toBe('SAVED_FOR_REVIEW');
    expect(result.automation.issues.join(' ')).toContain('GSTIN does not match');
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('preserves low OCR confidence after human correction while keeping automatic stock blocked', async () => {
    draft.items[0].ocrConfidence = 0.86;
    draft.items[0].ocrFlags = [];
    const saved = await service.createDraft(draft, 'branch-1', 'user-1');
    expect(saved.status).toBe('DRAFT');
    expect(saved.items[0].ocrConfidence).toBe(0.86);
    const result = await service.processInvoice(saved.id, 'branch-1', 'user-1');
    expect(result.automation.status).toBe('SAVED_FOR_REVIEW');
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('does not guess a missing receipt date', async () => {
    delete draft.goodsReceivedDate;
    const result = await (service as any).importFromDocument(file, 'branch-1', 'user-1');
    expect(result.automation.status).toBe('SAVED_FOR_REVIEW');
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it.each(['missing', 'ambiguous'])('saves an invoice with %s product matches for review', async (kind) => {
    prisma.drug.findMany.mockResolvedValue(kind === 'missing' ? [] : [{ id: 'a' }, { id: 'b' }]);
    const result = await importInvoice();
    expect(result.automation.status).toBe('SAVED_FOR_REVIEW');
    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
  });

  it('returns an existing duplicate without overwriting or committing it', async () => {
    stored = { id: 'existing', ...draft, items: [], status: 'DRAFT' };
    prisma.pharmacyPurchaseInvoice.create.mockRejectedValue({ code: 'P2002' });
    const result = await importInvoice();
    expect(result.automation.status).toBe('DUPLICATE');
    expect(result.invoice.id).toBe('existing');
    expect(prisma.pharmacyPurchaseInvoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { branchId: 'branch-1', distributorGstin: draft.distributorGstin, invoiceNumber: draft.invoiceNumber },
    }));
    expect(prisma.pharmacyPurchaseInvoice.update).not.toHaveBeenCalled();
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('keeps the extracted form available if required identity or expiry is unreadable', async () => {
    draft.distributorGstin = '';
    draft.items[0].expiryMonth = 0;
    const result = await importInvoice();
    expect(result.automation.status).toBe('NOT_SAVED');
    expect(result.invoice).toBeNull();
    expect(result.draft.items).toHaveLength(1);
    expect(prisma.pharmacyPurchaseInvoice.create).not.toHaveBeenCalled();
  });

  it('leaves the saved draft unreviewed when stock writing fails', async () => {
    prisma.stockTransaction.create.mockRejectedValue(new Error('synthetic database failure'));
    const result = await importInvoice();
    expect(result.automation.status).toBe('SAVED_FOR_REVIEW');
    expect(result.invoice.status).toBe('DRAFT');
    expect(result.automation.issues).toContain('Automatic stock processing failed. The invoice is saved; retry processing it.');
  });

  it('reprocessing an already committed invoice does not add stock again', async () => {
    await importInvoice();
    prisma.stockTransaction.create.mockClear();
    const result = await (service as any).processInvoice('invoice-1', 'branch-1', 'user-1');
    expect(result.automation.status).toBe('STOCK_COMMITTED');
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('does not invent an expiry date or round confidence upward during extraction normalization', () => {
    const item = (service as any).normalizeExtractedPurchaseLine({
      ...draft.items[0], expiryMonth: undefined, expiryYear: undefined, ocrConfidence: 0.979,
    }, 1);
    expect(item.expiryMonth).toBe(0);
    expect(item.expiryYear).toBe(0);
    expect(item.ocrFlags).toContain('missing_expiry');
    expect(item.ocrConfidence).toBe(0.979);
  });

  it('flags missing printed amounts and quantities even when fallback arithmetic is possible', async () => {
    delete draft.netPayable;
    delete draft.taxableAmount;
    delete draft.items[0].purchaseRate;
    draft = (service as any).normalizeExtractedPurchaseDraft(draft, []);
    expect(draft.netPayable).toBe(1120);
    expect(draft.items[0].purchaseRate).toBe(100);
    expect(draft.ocrFlags).toEqual(expect.arrayContaining(['missing_netPayable', 'missing_taxableAmount']));
    expect(draft.items[0].ocrFlags).toContain('missing_purchaseRate');
    const result = await importInvoice();
    expect(result.automation.status).toBe('SAVED_FOR_REVIEW');
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();

    const line = (service as any).normalizeExtractedPurchaseLine({ ...draft.items[0], quantityPurchased: undefined, taxableAmount: undefined }, 1);
    expect(line.ocrFlags).toEqual(expect.arrayContaining(['missing_quantityPurchased', 'missing_taxableAmount']));
  });
});
