import { BadRequestException, ConflictException } from '@nestjs/common';
import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreatePharmacyPurchaseInvoiceItemDto,
  PharmacyPurchaseBillTypeDto,
  PharmacyPurchaseInvoiceSourceDto,
  PharmacyPurchaseMasterActionDto,
} from '../dto/pharmacy-purchase-invoice.dto';

describe('PharmacyPurchaseInvoiceService', () => {
  let service: PharmacyPurchaseInvoiceService;
  let prisma: any;

  const branchId = 'branch-1';
  const userId = 'user-1';

  const validDto = (): any => ({
    distributorName: 'Linae Distributors',
    distributorGstin: '36ABCDE1234F1Z5',
    distributorDlNo: 'TS/HYD/20B/12345',
    invoiceNumber: 'LD-001',
    invoiceDate: '2026-03-01',
    goodsReceivedDate: '2026-03-02',
    billType: PharmacyPurchaseBillTypeDto.CASH,
    doctorNameOrRegNo: 'Dr. Shravya / TS-MC-12345',
    source: PharmacyPurchaseInvoiceSourceDto.MANUAL,
    grossAmount: 1200,
    tradeDiscount: 100,
    taxableAmount: 1100,
    totalCgst: 66,
    totalSgst: 66,
    totalIgst: 0,
    totalGst: 132,
    rounding: 0,
    netPayable: 1232,
    items: [
      {
        productName: 'Azithral 500 Tablet',
        manufacturer: 'Alembic Pharmaceuticals',
        packSize: 'Strip of 3',
        packUnitType: 'Strip',
        hsnCode: '3004',
        batchNumber: 'AZT2401',
        expiryMonth: 12,
        expiryYear: 2027,
        quantityPurchased: 20,
        freeQuantity: 2,
        mrp: 78,
        discountPercent: 0,
        purchaseRate: 55,
        taxableAmount: 1100,
        cgstPercent: 6,
        sgstPercent: 6,
        igstPercent: 0,
        gstAmount: 132,
        lineTotal: 1232,
      },
    ],
  });

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{id:'drug-1'},{id:'drug-2'}]),
      auditLog: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn((callback: any) => callback(prisma)),
      pharmacyPurchaseInvoice: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      pharmacyPurchaseInvoiceItem: { update: jest.fn().mockResolvedValue({}) },
      drug: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      inventoryItem: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      stockTransaction: {
        create: jest.fn(),
      },
    };
    service = new PharmacyPurchaseInvoiceService(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it.each([null, 'receipt-1'])('restores persisted receipt quantities without repeating a stock commit (receipt %s)', async (workflowReceiptId) => {
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue({ id:'posted-1', status:'STOCK_COMMITTED', workflowReceiptId, items:[{ inventoryItemId:'batch-1', productName:'Cream', batchNumber:'A', quantityPurchased:6, freeQuantity:3, packSize:'30ML', ocrFlags:[] }] });
    const invoice = await service.findOne('posted-1', branchId);
    expect(invoice.committedItems).toEqual([expect.objectContaining({inventoryItemId:'batch-1',purchasedQuantity:6,freeQuantity:3,quantityCommitted:workflowReceiptId ? 0 : 9})]);
    expect(prisma.pharmacyPurchaseInvoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:'posted-1',branchId}}));
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('stores a clean purchase invoice as a draft without stock mutation', async () => {
    const dto = validDto();
    prisma.pharmacyPurchaseInvoice.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: 'purchase-1',
        ...data,
        items: data.items.create.map((item: any) => ({
          id: `item-${item.lineNumber}`,
          ...item,
        })),
      }),
    );

    const result = await service.createDraft(dto, branchId, userId);

    expect(prisma.pharmacyPurchaseInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId,
          createdBy: userId,
          status: 'DRAFT',
          unresolvedOcrFlags: 0,
          reconciliationIssues: undefined,
        }),
      }),
    );
    expect(result.status).toBe('DRAFT');
    expect(result.items).toHaveLength(1);
  });

  it('saves incomplete descriptions as review issues and preserves header OCR flags', async () => {
    const dto = validDto();
    dto.distributorDlNo = '';
    dto.doctorNameOrRegNo = '';
    dto.items[0].manufacturer = '';
    dto.ocrFlags = ['check_supplier'];
    prisma.pharmacyPurchaseInvoice.create.mockImplementation(({ data }: any) => ({ id: 'purchase-1', ...data, items: [] }));
    const saved = await service.createDraft(dto, branchId, userId);
    expect(saved.ocrFlags).toEqual(['check_supplier']);
    expect(saved.status).toBe('OCR_REVIEW_REQUIRED');
    expect(saved.reconciliationIssues).toEqual(expect.arrayContaining([
      'distributorDlNo is required before review',
    ]));
    expect(saved.reconciliationIssues.join(' ')).not.toContain('manufacturer');
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue(saved);
    await expect(service.markReviewed(saved.id, {}, branchId)).rejects.toThrow();
  });

  it.each(['', undefined, null])('saves and reviews an invoice with manufacturer %p', async (manufacturer) => {
    const dto = validDto();
    dto.items[0].manufacturer = manufacturer;
    expect(await validate(plainToInstance(CreatePharmacyPurchaseInvoiceItemDto, dto.items[0]))).toEqual([]);
    prisma.pharmacyPurchaseInvoice.create.mockImplementation(({ data }: any) => ({
      id: 'purchase-1', ...data, items: data.items.create,
    }));
    const saved = await service.createDraft(dto, branchId, userId);
    expect(saved).toMatchObject({ status: 'DRAFT', unresolvedOcrFlags: 0, reconciliationIssues: [], items: [{ manufacturer: '' }] });
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue(saved);
    prisma.pharmacyPurchaseInvoice.update.mockImplementation(({ data }: any) => ({ ...saved, ...data }));
    prisma.drug.findMany.mockResolvedValue([completeDrug()]);
    expect((await service.markReviewed(saved.id, {}, branchId)).status).toBe('REVIEWED');
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('allows review of a legacy draft blocked only by missing manufacturer without rewriting its lines', async () => {
    const dto = validDto();
    const legacy = { ...dto, id: 'purchase-1', invoiceDate: new Date(dto.invoiceDate),
      goodsReceivedDate: new Date(dto.goodsReceivedDate), status: 'OCR_REVIEW_REQUIRED', unresolvedOcrFlags: 1,
      reconciliationIssues: JSON.stringify(['AUTO: Line 1: manufacturer is required before review', 'AUTO: Line 1: missing_manufacturer']),
      items: [{ ...dto.items[0], manufacturer: '', ocrFlags: JSON.stringify(['missing_manufacturer']) }],
    };
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue(legacy);
    prisma.pharmacyPurchaseInvoice.update.mockImplementation(({ data }: any) => ({ ...legacy, ...data }));
    prisma.drug.findMany.mockResolvedValue([completeDrug()]);
    const result = await service.markReviewed(legacy.id, {}, branchId);
    expect(result).toMatchObject({ status: 'REVIEWED', unresolvedOcrFlags: 0, reconciliationIssues: [], items: [{ manufacturer: '', ocrFlags: [] }] });
    expect(prisma.pharmacyPurchaseInvoice.update.mock.calls[0][0].data.items).toBeUndefined();
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('keeps unrelated legacy OCR and reconciliation issues blocking review', async () => {
    const dto = validDto();
    const legacy = { ...dto, id: 'purchase-1', status: 'OCR_REVIEW_REQUIRED', unresolvedOcrFlags: 2,
      reconciliationIssues: JSON.stringify(['AUTO: Line 1: manufacturer is required before review', 'Header GST mismatch']),
      items: [{ ...dto.items[0], manufacturer: '', ocrFlags: JSON.stringify(['missing_manufacturer', 'independent_read_disagrees_batchNumber']) }],
    };
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue(legacy);
    const displayed = (service as any).formatPurchaseInvoice(legacy);
    expect(displayed.unresolvedOcrFlags).toBe(1);
    expect(displayed.items[0].ocrFlags).toEqual(['independent_read_disagrees_batchNumber']);
    await expect(service.markReviewed(legacy.id, {}, branchId)).rejects.toThrow('Resolve OCR flags');
    legacy.unresolvedOcrFlags = 1;
    legacy.items[0].ocrFlags = JSON.stringify(['missing_manufacturer']);
    await expect(service.markReviewed(legacy.id, {}, branchId)).rejects.toThrow('Header GST mismatch');
    expect(prisma.pharmacyPurchaseInvoice.update).not.toHaveBeenCalled();
  });

  it('replaces draft lines atomically and clears corrected review issues', async () => {
    prisma.pharmacyPurchaseInvoice.updateMany.mockResolvedValue({ count: 1 });
    prisma.pharmacyPurchaseInvoice.update.mockImplementation(({ data }: any) => ({ id: 'purchase-1', ...data, items: data.items.create }));
    const saved = await service.updateDraft('purchase-1', validDto(), branchId);
    expect(saved.status).toBe('DRAFT');
    expect(saved.reconciliationIssues).toEqual([]);
    expect(prisma.pharmacyPurchaseInvoice.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'purchase-1', branchId, status: { in: ['DRAFT', 'OCR_REVIEW_REQUIRED', 'RECONCILIATION_FAILED'] } },
    }));
    expect(prisma.pharmacyPurchaseInvoice.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      reconciliationIssues: null, dueDate: null, items: { deleteMany: {}, create: expect.any(Array) },
    }) }));
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('refuses to overwrite reviewed, committed, or another branch invoices', async () => {
    prisma.pharmacyPurchaseInvoice.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.updateDraft('purchase-1', validDto(), branchId)).rejects.toThrow(ConflictException);
    expect(prisma.pharmacyPurchaseInvoice.update).not.toHaveBeenCalled();
  });

  it('marks OCR drafts as review-required while explicit flags remain', async () => {
    const dto = validDto();
    dto.source = PharmacyPurchaseInvoiceSourceDto.OCR;
    dto.ocrFlags = ['low_confidence_distributorGstin'];
    dto.items[0].ocrConfidence = 0.72;

    prisma.pharmacyPurchaseInvoice.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'purchase-1', ...data, items: [] }),
    );

    await service.createDraft(dto, branchId, userId);

    expect(prisma.pharmacyPurchaseInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'OCR_REVIEW_REQUIRED',
          unresolvedOcrFlags: 1,
        }),
      }),
    );
  });

  it('flags reconciliation mismatches before review', async () => {
    const dto = validDto();
    dto.netPayable = 1300;

    prisma.pharmacyPurchaseInvoice.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'purchase-1', ...data, items: [] }),
    );

    const result = await service.createDraft(dto, branchId, userId);

    expect(result.status).toBe('RECONCILIATION_FAILED');
    expect(result.reconciliationIssues.join(' ')).toContain('net payable');
  });

  it.each([
    [0.04, 'DRAFT'], [-0.04, 'DRAFT'], [1, 'DRAFT'], [-1, 'DRAFT'],
    [1.01, 'RECONCILIATION_FAILED'], [-1.01, 'RECONCILIATION_FAILED'],
  ])('reconciles a %s rupee difference with the UI tolerance without changing the reported amount', async (difference, status) => {
    const dto = validDto();
    dto.netPayable += Number(difference);
    prisma.pharmacyPurchaseInvoice.create.mockImplementation(({ data }: any) => ({
      id: 'purchase-1', ...data,
      items: data.items.create.map((item: any) => ({ id: `item-${item.lineNumber}`, ...item })),
    }));

    const saved = await service.createDraft(dto, branchId, userId);

    expect(saved.status).toBe(status);
    expect(Number(saved.netPayable)).toBe(dto.netPayable);
    if (status === 'DRAFT') expect(saved.reconciliationIssues).toEqual([]);
    else expect(saved.reconciliationIssues.join(' ')).toContain('net payable');
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('saves credit bills without due date for correction and blocks review', async () => {
    const dto = validDto();
    dto.billType = PharmacyPurchaseBillTypeDto.CREDIT;
    prisma.pharmacyPurchaseInvoice.create.mockImplementation(({ data }: any) => ({ id: 'purchase-1', ...data, items: [] }));
    const saved = await service.createDraft(dto, branchId, userId);
    expect(saved.reconciliationIssues).toContain('Due date is required for credit purchase bills before review');
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue(saved);
    await expect(service.markReviewed(saved.id, {}, branchId)).rejects.toThrow(BadRequestException);
  });

  it('converts duplicate distributor invoice keys into conflict errors', async () => {
    prisma.pharmacyPurchaseInvoice.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.createDraft(validDto(), branchId, userId),
    ).rejects.toThrow(ConflictException);
  });

  it.each([
    [['branchId', 'distributorGstin', 'invoiceNumber'], 'PURCHASE_DUPLICATE_INVOICE', { branchId, distributorGstin: '36ABCDE1234F1Z5', invoiceNumber: 'LD-001' }],
    [['branchId', 'workflowReceiptId'], 'PURCHASE_RECEIPT_ALREADY_LINKED', { branchId, workflowReceiptId: 'receipt-1' }],
  ])('identifies the actual unique constraint without guessing the conflicting purchase (%s)', async (target, code, where) => {
    prisma.pharmacyPurchaseInvoice.create.mockRejectedValue({ code: 'P2002', meta: { target } });
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue({ id: 'existing-1', invoiceNumber: 'LD-001', distributorName: 'Linae Distributors', status: 'REVIEWED', workflowReceiptId: null });
    const error = await service.createDraft({ ...validDto(), workflowReceiptId: 'receipt-1' }, branchId, userId, true).catch(e => e);
    expect(error.getResponse()).toMatchObject({ code, existingInvoiceId: 'existing-1', existingInvoice: { id: 'existing-1', invoiceNumber: 'LD-001', distributorName: 'Linae Distributors', status: 'REVIEWED' } });
    expect(prisma.pharmacyPurchaseInvoice.findFirst).toHaveBeenCalledWith({ where, select: { id: true, invoiceNumber: true, distributorName: true, status: true, workflowReceiptId: true } });
  });

  it('does not disclose duplicate invoice identity without read capability', async () => {
    prisma.pharmacyPurchaseInvoice.create.mockRejectedValue({ code: 'P2002', meta: { target: ['branchId', 'distributorGstin', 'invoiceNumber'] } });
    const error = await service.createDraft(validDto(), branchId, userId, false).catch(e => e);
    expect(error.getResponse()).toMatchObject({ code: 'PURCHASE_DUPLICATE_INVOICE' });
    expect(error.getResponse()).not.toHaveProperty('existingInvoiceId');
    expect(prisma.pharmacyPurchaseInvoice.findFirst).not.toHaveBeenCalled();
  });

  it.each(['create', 'update'])('returns the linked PDF owner and status when %s is blocked, without reassigning it', async operation => {
    const existing = { id: 'existing-1', invoiceNumber: 'A003906', distributorName: 'Saved supplier', status: 'DRAFT', workflowReceiptId: null };
    prisma.pharmacyPurchaseInvoiceDocument = { updateMany: jest.fn().mockResolvedValue({ count: 0 }), findFirst: jest.fn().mockResolvedValue({ purchaseInvoiceId: existing.id }) };
    prisma.pharmacyPurchaseInvoice.create.mockResolvedValue({ id: 'attempt-1', items: [] });
    prisma.pharmacyPurchaseInvoice.updateMany.mockResolvedValue({ count: 1 });
    if (operation === 'update') prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValueOnce({ id: 'attempt-1', status: 'DRAFT', items: [] });
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue(existing);
    const dto = { ...validDto(), sourceDocumentId: 'original-1' };
    const error = await (operation === 'create' ? service.createDraft(dto, branchId, userId, true) : service.updateDraft('attempt-1', dto, branchId, userId, true)).catch(e => e);
    expect(error.getResponse()).toMatchObject({ code: 'PURCHASE_SOURCE_ALREADY_LINKED', message: expect.stringContaining('already attached'), existingInvoiceId: existing.id, existingInvoice: existing });
    expect(prisma.pharmacyPurchaseInvoiceDocument.findFirst).toHaveBeenCalledWith({ where: { id: 'original-1', branchId }, select: { purchaseInvoiceId: true } });
    expect(prisma.pharmacyPurchaseInvoice.findFirst).toHaveBeenLastCalledWith({ where: { id: existing.id, branchId }, select: { id: true, invoiceNumber: true, distributorName: true, status: true, workflowReceiptId: true } });
    expect(prisma.pharmacyPurchaseInvoiceDocument.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.pharmacyPurchaseInvoiceDocument.updateMany).toHaveBeenCalledWith({ where: { id: 'original-1', branchId, OR: [{ purchaseInvoiceId: null }, { purchaseInvoiceId: 'attempt-1' }] }, data: { purchaseInvoiceId: 'attempt-1' } });
    expect(prisma.pharmacyPurchaseInvoice.update).not.toHaveBeenCalled();
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it.each(['denied', 'missing-document', 'different-branch'])('does not expose PDF owner details for %s', async scenario => {
    prisma.pharmacyPurchaseInvoiceDocument = { updateMany: jest.fn().mockResolvedValue({ count: 0 }), findFirst: jest.fn().mockResolvedValue(scenario === 'missing-document' ? null : { purchaseInvoiceId: 'other-1' }) };
    prisma.pharmacyPurchaseInvoice.create.mockResolvedValue({ id: 'attempt-1', items: [] });
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue(null);
    const error = await service.createDraft({ ...validDto(), sourceDocumentId: 'original-1' }, branchId, userId, scenario !== 'denied').catch(e => e);
    expect(error.getResponse()).toMatchObject({ code: 'PURCHASE_SOURCE_UNAVAILABLE' });
    expect(error.getResponse()).not.toHaveProperty('existingInvoice');
    expect(error.getResponse()).not.toHaveProperty('existingInvoiceId');
    if (scenario === 'denied') {
      expect(prisma.pharmacyPurchaseInvoiceDocument.findFirst).not.toHaveBeenCalled();
      expect(prisma.pharmacyPurchaseInvoice.findFirst).not.toHaveBeenCalled();
    }
  });

  it('does not guess a purchase for an unknown unique constraint', async () => {
    prisma.pharmacyPurchaseInvoice.create.mockRejectedValue({ code: 'P2002', meta: { target: ['id'] } });
    const error = await service.createDraft(validDto(), branchId, userId, true).catch(e => e);
    expect(error.getResponse()).toMatchObject({ code: 'PURCHASE_CONFLICT' });
    expect(error.getResponse()).not.toHaveProperty('existingInvoiceId');
    expect(prisma.pharmacyPurchaseInvoice.findFirst).not.toHaveBeenCalled();
  });

  it('rejects review of a different observed revision before validation or effects', async () => {
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue({ id: 'purchase-1', status: 'DRAFT', updatedAt: new Date('2026-10-01T01:00:00Z'), items: [] });
    const error = await service.markReviewed('purchase-1', { expectedUpdatedAt: '2026-10-01T00:00:00Z' }, branchId, userId).catch(e => e);
    expect(error.getResponse()).toMatchObject({ code: 'PURCHASE_STALE_REVISION' });
    expect(prisma.pharmacyPurchaseInvoice.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('requires clear OCR and reconciliation state before review', async () => {
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue({
      id: 'purchase-1',
      branchId,
      invoiceDate: new Date('2026-03-01'),
      goodsReceivedDate: new Date('2026-03-02'),
      unresolvedOcrFlags: 1,
      reconciliationIssues: null,
      status: 'OCR_REVIEW_REQUIRED',
      items: [],
    });

    await expect(
      service.markReviewed('purchase-1', {}, branchId),
    ).rejects.toThrow(BadRequestException);
  });

  it('marks clean purchase invoices reviewed only after goods are received', async () => {
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue({
      id: 'purchase-1',
      branchId,
      invoiceDate: new Date('2026-03-01'),
      goodsReceivedDate: null,
      unresolvedOcrFlags: 0,
      reconciliationIssues: null,
      status: 'DRAFT',
      items: [],
    });
    prisma.pharmacyPurchaseInvoice.update.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: 'purchase-1',
        branchId,
        invoiceDate: new Date('2026-03-01'),
        unresolvedOcrFlags: 0,
        reconciliationIssues: null,
        status: data.status,
        goodsReceivedDate: data.goodsReceivedDate,
        items: [],
      }),
    );

    const result = await service.markReviewed(
      'purchase-1',
      { goodsReceivedDate: '2026-03-02' },
      branchId,
    );

    expect(result.status).toBe('REVIEWED');
    expect(prisma.pharmacyPurchaseInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REVIEWED',
          goodsReceivedDate: new Date('2026-03-02'),
        }),
      }),
    );
  });

  const reviewedInvoice = (overrides: any = {}) => ({
    id: 'purchase-1',
    branchId,
    distributorName: 'Linae Distributors',
    distributorGstin: '36ABCDE1234F1Z5',
    invoiceNumber: 'LD-001',
    invoiceDate: new Date('2026-03-01'),
    goodsReceivedDate: new Date('2026-03-02'),
    unresolvedOcrFlags: 0,
    reconciliationIssues: null,
    status: 'REVIEWED',
    stockCommittedAt: null,
    items: [
      {
        id: 'line-1',
        lineNumber: 1,
        ...validDto().items[0],
        ocrFlags: null,
      },
    ],
    ...overrides,
  });

  const completeDrug = (overrides: any = {}) => ({
    id: 'drug-1',
    name: 'Azithral 500 Tablet',
    price: 78,
    manufacturerName: 'Alembic Pharmaceuticals',
    packSizeLabel: 'Strip of 3',
    composition1: 'Azithromycin',
    category: 'Antibiotic',
    dosageForm: 'Tablet',
    strength: '500mg',
    minStockLevel: 5,
    maxStockLevel: 500,
    ...overrides,
  });

  it.each([
    ['missing', []],
    ['ambiguous', [completeDrug(), completeDrug({ id: 'drug-2' })]],
    ['incomplete', [completeDrug({ composition1: '' })]],
  ])('keeps the draft editable when catalogue resolution is %s', async (reason, drugs) => {
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue(reviewedInvoice({ status: 'DRAFT' }));
    prisma.drug.findMany.mockResolvedValue(drugs);
    await expect(service.markReviewed('purchase-1', {}, branchId, userId)).rejects.toMatchObject({
      response: { code: 'PURCHASE_CATALOG_REVIEW_REQUIRED', reason, lineNumber: 1 },
    });
    expect(prisma.pharmacyPurchaseInvoice.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('reviews a corrected catalogue match without adding stock', async () => {
    const invoice = reviewedInvoice({ status: 'DRAFT' });
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue(invoice);
    prisma.drug.findMany.mockResolvedValue([completeDrug()]);
    prisma.pharmacyPurchaseInvoice.update.mockImplementation(({ data }: any) => ({ ...invoice, ...data }));
    expect((await service.markReviewed(invoice.id, {}, branchId, userId)).status).toBe('REVIEWED');
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('reopens only the expected reviewed revision and audits the transition without changing lines or stock', async () => {
    const updatedAt = new Date('2026-10-15T08:00:00.000Z');
    const invoice = reviewedInvoice({ updatedAt });
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValueOnce(invoice)
      .mockResolvedValueOnce({ ...invoice, status: 'DRAFT', updatedAt: new Date('2026-10-15T08:01:00.000Z') });
    prisma.pharmacyPurchaseInvoice.updateMany.mockResolvedValue({ count: 1 });
    const result = await (service as any).reopenReview(invoice.id, { expectedUpdatedAt: updatedAt.toISOString() }, branchId, userId);
    expect(result.status).toBe('DRAFT');
    expect(result.items).toEqual(expect.arrayContaining([expect.objectContaining({ productName: invoice.items[0].productName })]));
    expect(prisma.pharmacyPurchaseInvoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: invoice.id, branchId } }));
    expect(prisma.pharmacyPurchaseInvoice.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: invoice.id, branchId, status: 'REVIEWED', stockCommittedAt: null, updatedAt },
      data: { status: 'DRAFT', updatedAt: expect.any(Date) },
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'REVIEW_REOPENED' }) }));
    expect(prisma.pharmacyPurchaseInvoiceItem.update).not.toHaveBeenCalled();
    expect(prisma.drug.update).not.toHaveBeenCalled();
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'STOCK_COMMITTED' },
    { stockCommittedAt: new Date() },
    { status: 'CANCELLED' },
    { status: 'DRAFT' },
  ])('refuses reopening an ineligible invoice %p', async (override) => {
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue(reviewedInvoice(override));
    await expect((service as any).reopenReview('purchase-1', { expectedUpdatedAt: '2026-10-15T08:00:00.000Z' }, branchId, userId)).rejects.toThrow(ConflictException);
    expect(prisma.pharmacyPurchaseInvoice.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a stale revision or a concurrent stock claim without writing an audit', async () => {
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue(reviewedInvoice());
    prisma.pharmacyPurchaseInvoice.updateMany.mockResolvedValue({ count: 0 });
    await expect((service as any).reopenReview('purchase-1', { expectedUpdatedAt: '2026-10-15T08:00:00.000Z' }, branchId, userId)).rejects.toThrow(ConflictException);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('does not reopen invoices outside the selected branch', async () => {
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue(null);
    await expect((service as any).reopenReview('purchase-1', { expectedUpdatedAt: '2026-10-15T08:00:00.000Z' }, branchId, userId)).rejects.toThrow('Purchase invoice not found');
    expect(prisma.pharmacyPurchaseInvoice.updateMany).not.toHaveBeenCalled();
  });

  it.each(['Moisturex Hydra Gel Cream', 'Cream', '50 ml'])('CR-15: unrelated names and pack/form-only lines do not suggest Abzorb (%s)', async (productName) => {
    prisma.drug.findMany.mockResolvedValue([completeDrug({ name: 'Abzorb 1% Cream', manufacturerName: 'Sun Pharma', packSizeLabel: '50 ml', dosageForm: 'Cream', strength: '1%', price: 429 })]);
    const result = await service.suggestMasterMatches([{ ...validDto().items[0], productName, manufacturer: 'Sun Pharma', packSize: '50 ml', mrp: 429 }], branchId);
    expect(result.matches[0]).toMatchObject({ candidates: [], recommendedAction: 'CREATE_NEW', matchLabel: 'Not in inventory' });
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('CR-15: rejects Moisturex to Abzorb confirmation before any catalogue or stock writes', async () => {
    prisma.drug.findFirst.mockResolvedValue(completeDrug({ name: 'Abzorb 1% Cream', packSizeLabel: 'tube of 15 gm Cream', type: 'allopathy', dosageForm: 'Cream', strength: '1%' }));
    prisma.drug.update.mockResolvedValue(completeDrug({ name: 'Abzorb 1% Cream' }));
    await expect(service.confirmMasterRecord({ action: PharmacyPurchaseMasterActionDto.MATCH_EXISTING, drugId: 'drug-1', item: { ...validDto().items[0], productName: 'Moisturex Hydra Gel Cream', packSize: '50 ml' } }, branchId)).rejects.toMatchObject({ response: { code: 'PURCHASE_PRODUCT_MISMATCH', message: 'These look like different products. Confirm anyway?', mismatches: expect.arrayContaining(['Product names differ', 'Pack sizes or types differ']) } });
    expect(prisma.drug.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ productKind: 'COSMETIC' }, {}, 'Product kinds differ'],
    [{ packSize: '50 ml' }, { packSizeLabel: '50 gm' }, 'Pack sizes or types differ'],
  ])('CR-15: guards kind and pack mismatches even with identical names', async (lineChanges, drugChanges, reason) => {
    prisma.drug.findFirst.mockResolvedValue(completeDrug({ type: 'allopathy', ...drugChanges }));
    await expect(service.confirmMasterRecord({ action: PharmacyPurchaseMasterActionDto.MATCH_EXISTING, drugId: 'drug-1', item: { ...validDto().items[0], ...lineChanges } as any }, branchId)).rejects.toMatchObject({ response: { mismatches: expect.arrayContaining([reason]) } });
    expect(prisma.drug.update).not.toHaveBeenCalled();
  });

  it('CR-15: audits original identity and explicit override without changing stock', async () => {
    const drug = completeDrug({ name: 'Abzorb 1% Cream', packSizeLabel: '15 gm', type: 'allopathy' });
    prisma.drug.findFirst.mockResolvedValue(drug);
    prisma.drug.update.mockResolvedValue(drug);
    const item = { ...validDto().items[0], productName: 'Moisturex Hydra Gel Cream', productKind: 'COSMETIC' as const, packSize: '50 ml' };
    const result = await service.confirmMasterRecord({ action: PharmacyPurchaseMasterActionDto.MATCH_EXISTING, drugId: drug.id, item, mismatchAcknowledged: true }, branchId, userId);
    expect(result.linePatch.productName).toBe(drug.name);
    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ entity: 'PurchaseProductMatch', userId, action: 'MATCH_CONFIRMED' });
    expect(JSON.parse(audit.oldValues)).toEqual({ branchId, item });
    expect(JSON.parse(audit.newValues)).toMatchObject({ mismatchAcknowledged: true, nameEvidence: false, mismatches: ['Product names differ', 'Product kinds differ', 'Pack sizes or types differ'] });
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('CR-15: same normalized name is labelled Same product without a price or manufacturer boost', async () => {
    prisma.drug.findMany.mockResolvedValue([completeDrug({ manufacturerName: '' })]);
    const result = await service.suggestMasterMatches([{ ...validDto().items[0], manufacturer: '' }], branchId);
    expect(result.matches[0].matchLabel).toBe('Same product');
  });

  it('suggests nearest drug-master matches for OCR purchase lines', async () => {
    prisma.drug.findMany.mockResolvedValue([
      completeDrug({
        id: 'drug-1',
        name: 'Azithral 500mg Tablet',
        manufacturerName: 'Alembic Pharmaceuticals',
        packSizeLabel: 'Strip of 3',
      }),
      completeDrug({
        id: 'drug-2',
        name: 'Cetirizine 10mg Tablet',
        manufacturerName: 'Other Labs',
        packSizeLabel: 'Strip of 10',
      }),
    ]);

    const result = await service.suggestMasterMatches(
      [validDto().items[0]],
      branchId,
    );

    expect(prisma.drug.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branchId,
          isActive: true,
          isDiscontinued: false,
        }),
      }),
    );
    expect(result.matches[0]).toMatchObject({
      lineIndex: 0,
      recommendedAction: 'MATCH_EXISTING',
      candidates: [
        expect.objectContaining({
          drug: expect.objectContaining({ id: 'drug-1' }),
          confidence: expect.stringMatching(/HIGH|MEDIUM/),
        }),
      ],
    });
  });

  it('matches 20 OCR rows independently, excludes conflicting packs/strengths/forms and performs no writes', async () => {
    prisma.drug.findMany.mockResolvedValue([
      completeDrug({id:'five',name:'Folitrax 5mg Tablet',strength:'5mg',packSizeLabel:'10 Tablets'}),
      completeDrug({id:'different-strength',name:'Folitrax 10mg Tablet',strength:'10mg',packSizeLabel:'10 Tablets'}),
      completeDrug({id:'different-pack',name:'Folitrax 5mg Tablet',strength:'5mg',packSizeLabel:'5 Tablets'}),
      completeDrug({id:'different-form',name:'Folitrax 5mg Injection',dosageForm:'Injection',strength:'5mg',packSizeLabel:'10 Tablets'}),
    ]);
    const items=Array.from({length:20},(_,i)=>({...validDto().items[0],productName:'Folitrax 5mg Tab (DPC)',manufacturer:'',packSize:i%2?'5 Tablets':'10 Tablets',batchNumber:`B${i}`}));
    const before=JSON.stringify(items);
    const result=await service.suggestMasterMatches(items,branchId);
    expect(result.matches.map(m=>m.lineIndex)).toEqual(Array.from({length:20},(_,i)=>i));
    expect(result.matches.map(m=>m.candidates.map(c=>c.drug.id))).toEqual(Array.from({length:20},(_,i)=>[i%2?'different-pack':'five']));
    expect(result.matches[0].candidates[0].reasons).toContain('Search omitted supplier annotation (DPC); verify the original line');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.drug.findMany).toHaveBeenCalledTimes(21);
    expect(JSON.stringify(items)).toBe(before);
    for(const entity of [prisma.drug,prisma.inventoryItem,prisma.pharmacyPurchaseInvoice,prisma.stockTransaction]) {
      for(const method of ['create','update','updateMany']) if(entity[method]) expect(entity[method]).not.toHaveBeenCalled();
    }
  });

  it('requests review of a weak candidate instead of recommending a new duplicate', async () => {
    prisma.drug.findMany.mockResolvedValue([completeDrug({name:'Tyrodin Cream',strength:'',dosageForm:'Cream',packSizeLabel:'20g'})]);
    const result=await service.suggestMasterMatches([{...validDto().items[0],productName:'Tyrodni Cream',manufacturer:'',packSize:''}],branchId);
    expect(result.matches[0].recommendedAction).toBe('REVIEW_MATCHES');
    expect(result.matches[0].candidates[0].confidence).toBe('LOW');
    expect(prisma.drug.create).not.toHaveBeenCalled();
  });

  it('reports exact incomplete catalogue fields before review without changing stock', async () => {
    prisma.drug.findMany.mockResolvedValue([completeDrug({ id: 'cosglo', name: 'Cosglo New Cream', packSizeLabel: '30 Gm', composition1: null, category: null, dosageForm: null, strength: null })]);
    const item = { ...validDto().items[0], productName: 'Cosglo New Cream', packSize: '30 Gm' };
    const result = await service.suggestMasterMatches([item], branchId);
    expect(result.matches[0].catalogueResolution).toEqual({ state: 'incomplete', product: expect.objectContaining({ id: 'cosglo', name: 'Cosglo New Cream', packSizeLabel: '30 Gm' }), missingFields: ['composition1', 'category', 'dosageForm', 'strength'] });
    await expect((service as any).resolvePurchaseLineDrug(prisma, { ...item, lineNumber: 1 }, branchId)).rejects.toMatchObject({ response: { code: 'PURCHASE_CATALOG_REVIEW_REQUIRED', reason: 'incomplete', missingFields: ['composition1', 'category', 'dosageForm', 'strength'] } });
    expect(prisma.drug.update).not.toHaveBeenCalled();
    expect(prisma.pharmacyPurchaseInvoice.update).not.toHaveBeenCalled();
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('does not treat a complete fuzzy suggestion as exact readiness', async () => {
    prisma.drug.findMany.mockImplementation(({ where }: any) => where.name?.equals ? Promise.resolve([]) : Promise.resolve([completeDrug({ name: 'Tyrodin Cream', dosageForm: 'Cream', packSizeLabel: '20g' })]));
    const result = await service.suggestMasterMatches([{ ...validDto().items[0], productName: 'Tyrodni Cream', manufacturer: '', packSize: '' }], branchId);
    expect(result.matches[0].candidates).toHaveLength(1);
    expect(result.matches[0].catalogueResolution).toEqual({ state: 'missing' });
  });

  it.each([{ isActive: false, branchId }, { isActive: true, branchId: 'other-branch' }])('excludes inactive or other-branch exact records (%p)', async scope => {
    const product = completeDrug({ ...scope, isDiscontinued: false });
    prisma.drug.findMany.mockImplementation(({ where }: any) => Promise.resolve(where.branchId === product.branchId && where.isActive === product.isActive && where.isDiscontinued === product.isDiscontinued ? [product] : []));
    const result = await service.suggestMasterMatches(validDto().items, branchId);
    expect(result.matches[0].catalogueResolution).toEqual({ state: 'missing' });
    expect(prisma.drug.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ branchId: 'branch-1', isActive: true, isDiscontinued: false, name: { equals: 'Azithral 500 Tablet', mode: 'insensitive' } }) }));
  });

  it('keeps duplicate exact products ambiguous independently of ranked suggestions', async () => {
    prisma.drug.findMany.mockImplementation(({ where }: any) => Promise.resolve(where.name?.equals ? [completeDrug(), completeDrug({ id: 'duplicate' })] : [completeDrug()]));
    const result = await service.suggestMasterMatches(validDto().items, branchId);
    expect(result.matches[0].candidates).toHaveLength(1);
    expect(result.matches[0].catalogueResolution).toEqual({ state: 'ambiguous' });
    await expect((service as any).resolvePurchaseLineDrug(prisma, validDto().items[0], branchId)).rejects.toMatchObject({ response: { reason: 'ambiguous' }, status: 409 });
  });

  it.each(['cosmetic', 'consumable'])('uses existing %s requirements and carries the exact product even outside suggestions', async type => {
    const product = completeDrug({ type, composition1: null, dosageForm: null, strength: null, category: 'Skin care' });
    prisma.drug.findMany.mockImplementation(({ where }: any) => Promise.resolve(where.name?.equals ? [product] : []));
    const result = await service.suggestMasterMatches(validDto().items, branchId);
    expect(result.matches[0].candidates).toEqual([]);
    expect(result.matches[0].catalogueResolution).toEqual({ state: 'ready', product: expect.objectContaining({ id: 'drug-1', category: 'Skin care', composition1: null }) });
    expect(await (service as any).resolvePurchaseLineDrug(prisma, validDto().items[0], branchId)).toEqual(product);
  });

  it('updates an existing drug master only after a confirmed OCR match', async () => {
    const item = {
      ...validDto().items[0],
      productName: 'Azithral 500 Tablet',
      manufacturer: 'Alembic',
      mrp: 120,
    };
    prisma.drug.findFirst.mockResolvedValue(
      completeDrug({
        id: 'drug-1',
        name: 'Azithral 500mg Tablet',
        price: 78,
        manufacturerName: 'Alembic Pharmaceuticals',
      }),
    );
    prisma.drug.update.mockResolvedValue(
      completeDrug({
        id: 'drug-1',
        name: 'Azithral 500mg Tablet',
        price: 120,
        manufacturerName: 'Alembic Pharmaceuticals',
      }),
    );

    const result = await service.confirmMasterRecord(
      {
        action: PharmacyPurchaseMasterActionDto.MATCH_EXISTING,
        drugId: 'drug-1',
        mismatchAcknowledged: true,
        item,
      },
      branchId,
    );

    expect(prisma.drug.update).toHaveBeenCalledWith({
      where: { id: 'drug-1' },
      data: { price: 120 },
    });
    expect(prisma.drug.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      action: PharmacyPurchaseMasterActionDto.MATCH_EXISTING,
      drug: expect.objectContaining({ id: 'drug-1', price: 120 }),
      linePatch: expect.objectContaining({
        productName: 'Azithral 500mg Tablet',
        manufacturer: 'Alembic Pharmaceuticals',
        packSize: 'Strip of 3',
        mrp: 120,
      }),
    });
  });

  it('creates a new drug master only after an explicit OCR create confirmation', async () => {
    const item = {
      ...validDto().items[0],
      productName: 'Newcold Syrup 60ml',
      manufacturer: 'New Labs',
      packSize: 'Bottle of 60ml',
      packUnitType: 'Bottle',
      mrp: 95,
    };
    prisma.drug.findFirst.mockResolvedValue(null);
    prisma.drug.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'drug-new', ...data }),
    );

    const result = await service.confirmMasterRecord(
      {
        action: PharmacyPurchaseMasterActionDto.CREATE_NEW,
        item,
        catalog: { productKind: 'MEDICINE', composition1: 'Test ingredient', category: 'Test category', dosageForm: 'Syrup', strength: '1mg/ml', requiresPrescription: true },
      },
      branchId,
    );

    expect(prisma.drug.update).not.toHaveBeenCalled();
    expect(prisma.drug.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId,
          name: 'Newcold Syrup 60ml',
          manufacturerName: 'New Labs',
          price: 95,
          packSizeLabel: 'Bottle of 60ml',
          category: 'Test category',
          isActive: true,
          isDiscontinued: false,
        }),
      }),
    );
    expect(result).toMatchObject({
      action: PharmacyPurchaseMasterActionDto.CREATE_NEW,
      drug: expect.objectContaining({ id: 'drug-new', name: 'Newcold Syrup 60ml' }),
    });
    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('rejects malformed drug-master confirmation payloads without mutation', async () => {
    await expect(
      service.confirmMasterRecord(
        {
          action: PharmacyPurchaseMasterActionDto.MATCH_EXISTING,
          drugId: 'drug-1',
        } as any,
        branchId,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.drug.update).not.toHaveBeenCalled();
    expect(prisma.drug.create).not.toHaveBeenCalled();
  });

  it('rejects stock commit unless the purchase invoice is reviewed', async () => {
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue(
      reviewedInvoice({ status: 'DRAFT' }),
    );

    await expect(
      service.commitStock('purchase-1', branchId, userId),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.pharmacyPurchaseInvoice.updateMany).not.toHaveBeenCalled();
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('blocks stock commit when product master is missing', async () => {
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValueOnce(
      reviewedInvoice(),
    );
    prisma.pharmacyPurchaseInvoice.updateMany.mockResolvedValue({ count: 1 });
    prisma.drug.findMany.mockResolvedValue([]);

    await expect(
      service.commitStock('purchase-1', branchId, userId),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('CR-15: processing Moisturex creates its own stock without updating Abzorb', async () => {
    const invoice = reviewedInvoice();
    Object.assign(invoice.items[0], { productName: 'Moisturex Hydra Gel Cream', packSize: '50 ml', packUnitType: 'Tube', manufacturer: 'Sun Pharma' });
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValueOnce(invoice).mockResolvedValueOnce({ ...invoice, status: 'STOCK_COMMITTED' });
    prisma.pharmacyPurchaseInvoice.updateMany.mockResolvedValue({ count: 1 });
    prisma.drug.findMany.mockImplementation(async ({ where }: any) => {
      expect(where.name.equals).toBe('Moisturex Hydra Gel Cream');
      return [completeDrug({ id: 'moisturex', name: 'Moisturex Hydra Gel Cream', packSizeLabel: '50 ml', type: 'cosmetic', category: 'Cosmetic' })];
    });
    prisma.inventoryItem.findMany.mockImplementation(async ({ where }: any) => { expect(where.drugs.some.id).toBe('moisturex'); return []; });
    prisma.inventoryItem.create.mockResolvedValue({ id: 'moisturex-stock' });
    await service.commitStock('purchase-1', branchId, userId);
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    expect(prisma.stockTransaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ itemId: 'moisturex-stock' }) }));
  });

  it('commits reviewed purchase stock into an existing batch exactly once', async () => {
    const invoice = reviewedInvoice();
    const committedAt = new Date('2026-03-02T10:00:00.000Z');
    prisma.pharmacyPurchaseInvoice.findFirst
      .mockResolvedValueOnce(invoice)
      .mockResolvedValueOnce({
        ...invoice,
        status: 'STOCK_COMMITTED',
        stockCommittedAt: committedAt,
        stockCommittedBy: userId,
      });
    prisma.pharmacyPurchaseInvoice.updateMany.mockResolvedValue({ count: 1 });
    prisma.drug.findMany.mockResolvedValue([completeDrug()]);
    prisma.inventoryItem.findMany.mockResolvedValue([
      {
        id: 'inventory-1',
        currentStock: 10,
        unit: 'STRIPS',
        minStockLevel: 5,
        reorderLevel: null,
        expiryDate: new Date(2027, 11, 31, 23, 59, 59, 999),
        mrp: 78,
        status: 'ACTIVE',
      },
    ]);
    prisma.inventoryItem.update.mockResolvedValue({ id: 'inventory-1' });
    prisma.stockTransaction.create.mockResolvedValue({});

    const result = await service.commitStock('purchase-1', branchId, userId);

    expect(result.status).toBe('STOCK_COMMITTED');
    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
    expect(prisma.inventoryItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inventory-1' },
        data: expect.objectContaining({
          currentStock: { increment: 22 },
          stockStatus: 'IN_STOCK',
        }),
      }),
    );
    expect(prisma.stockTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId,
          userId,
          itemId: 'inventory-1',
          type: 'PURCHASE',
          quantity: 22,
          unitPrice: 50,
          totalAmount: 1100,
          batchNumber: 'AZT2401',
          supplier: 'Linae Distributors',
        }),
      }),
    );
    expect(
      prisma.stockTransaction.create.mock.calls[0][0].data.notes,
    ).toContain('purchased 20, free 2');
  });

  it('creates a new inventory batch when no matching active batch exists', async () => {
    const invoice = reviewedInvoice();
    prisma.pharmacyPurchaseInvoice.findFirst
      .mockResolvedValueOnce(invoice)
      .mockResolvedValueOnce({ ...invoice, status: 'STOCK_COMMITTED' });
    prisma.pharmacyPurchaseInvoice.updateMany.mockResolvedValue({ count: 1 });
    prisma.drug.findMany.mockResolvedValue([completeDrug()]);
    prisma.inventoryItem.findMany.mockResolvedValue([]);
    prisma.inventoryItem.create.mockResolvedValue({ id: 'inventory-new' });
    prisma.stockTransaction.create.mockResolvedValue({});

    const result = await service.commitStock('purchase-1', branchId, userId);

    expect(result.committedItems).toEqual([
      expect.objectContaining({
        drugId: 'drug-1',
        inventoryItemId: 'inventory-new',
        quantityCommitted: 22,
      }),
    ]);
    expect(prisma.inventoryItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId,
          name: 'Azithral 500 Tablet',
          type: 'MEDICINE',
          category: 'Antibiotic',
          currentStock: 22,
          unit: 'STRIPS',
          stockStatus: 'IN_STOCK',
          drugs: { connect: { id: 'drug-1' } },
        }),
      }),
    );
  });

  it.each([
    ['Pack', '30ML', 'PACKS'],
    ['Tube', '30ML', 'TUBES'],
    ['Vial', '10ML', 'VIALS'],
    ['Ampoule', '2ML', 'AMPOULES'],
    ['Syringe', '1ML', 'SYRINGES'],
    ['Box', '50GM', 'BOXES'],
    ['Kit', '30ML', 'KITS'],
    ['Bottle', '50GM', 'BOTTLES'],
    ['Strip', "10'S", 'STRIPS'],
    ['Piece', '30ML', 'PIECES'],
    ['Tablet', 'Strip of 10', 'PIECES'],
  ])('posts the declared %s unit for %s without reinterpreting content size', async (packUnitType, packSize, unit) => {
    const invoice = reviewedInvoice();
    Object.assign(invoice.items[0], { packUnitType, packSize, quantityPurchased: 6, freeQuantity: 3 });
    prisma.pharmacyPurchaseInvoice.findFirst
      .mockResolvedValueOnce(invoice)
      .mockResolvedValueOnce({ ...invoice, status: 'STOCK_COMMITTED' });
    prisma.pharmacyPurchaseInvoice.updateMany.mockResolvedValue({ count: 1 });
    prisma.drug.findMany.mockResolvedValue([{ ...completeDrug(), packSizeLabel: packSize }]);
    prisma.inventoryItem.findMany.mockResolvedValue([]);
    prisma.inventoryItem.create.mockResolvedValue({ id: 'inventory-new' });

    await service.commitStock('purchase-1', branchId, userId);

    expect(prisma.inventoryItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ unit, packUnit: packUnitType, currentStock: 9 }),
    }));
    expect(prisma.stockTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ quantity: 9 }),
    }));
  });

  it('rejects a historical batch with a different declared unit instead of relabelling or adding stock', async () => {
    const invoice = reviewedInvoice();
    Object.assign(invoice.items[0], { packUnitType: 'Pack', packSize: '30ML' });
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue(invoice);
    prisma.pharmacyPurchaseInvoice.updateMany.mockResolvedValue({ count: 1 });
    prisma.drug.findMany.mockResolvedValue([{ ...completeDrug(), packSizeLabel: '30ML' }]);
    prisma.inventoryItem.findMany.mockResolvedValue([{
      id: 'legacy-batch', currentStock: 9, unit: 'BOTTLES', status: 'ACTIVE',
      expiryDate: new Date(2027, 11, 31, 23, 59, 59, 999), mrp: 78,
    }]);

    await expect(service.commitStock('purchase-1', branchId, userId)).rejects.toThrow('saved batch stock unit differs');
    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('returns an already committed purchase invoice without mutating stock again', async () => {
    prisma.pharmacyPurchaseInvoice.findFirst.mockResolvedValue(
      reviewedInvoice({
        status: 'STOCK_COMMITTED',
        stockCommittedAt: new Date('2026-03-02T10:00:00.000Z'),
      }),
    );

    const result = await service.commitStock('purchase-1', branchId, userId);

    expect(result.status).toBe('STOCK_COMMITTED');
    expect(prisma.pharmacyPurchaseInvoice.updateMany).not.toHaveBeenCalled();
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  const analyticsInvoice = (overrides: any = {}) => ({
    id: 'purchase-analytics-1',
    branchId,
    distributorName: 'Linae Distributors',
    distributorGstin: '36ABCDE1234F1Z5',
    invoiceNumber: 'LD-AN-001',
    invoiceDate: new Date('2026-03-01T09:00:00.000Z'),
    status: 'STOCK_COMMITTED',
    items: [
      {
        id: 'analytics-line-1',
        lineNumber: 1,
        productName: 'Azithral 500 Tablet',
        manufacturer: 'Alembic Pharmaceuticals',
        packSize: 'Strip of 3',
        packUnitType: 'Strip',
        inventoryItemId: 'inventory-analytics',
        hsnCode: '3004',
        quantityPurchased: 20,
        freeQuantity: 2,
        discountPercent: 10,
        specialDiscountPercent: 2,
        purchaseRate: 55,
        taxableAmount: 1100,
        gstAmount: 132,
        lineTotal: 1232,
      },
    ],
    ...overrides,
  });

  it('builds distributor analytics from posted purchase invoices only', async () => {
    prisma.inventoryItem.findMany.mockResolvedValue([{ id: 'inventory-analytics', drugs: [{ id: 'master-analytics' }] }]);
    prisma.pharmacyPurchaseInvoice.findMany.mockResolvedValue([
      analyticsInvoice(),
      analyticsInvoice({
        id: 'purchase-analytics-2',
        invoiceNumber: 'LD-AN-002',
        invoiceDate: new Date('2026-03-10T09:00:00.000Z'),
        status: 'STOCK_COMMITTED',
        items: [
          {
            id: 'analytics-line-2',
            lineNumber: 1,
            productName: 'Azithral 500 Tablet',
            manufacturer: 'Alembic Pharmaceuticals',
            packSize: 'Strip of 3',
        packUnitType: 'Strip',
        inventoryItemId: 'inventory-analytics',
            hsnCode: '3004',
            quantityPurchased: 10,
            freeQuantity: 0,
            discountPercent: 4,
            specialDiscountPercent: 0,
            purchaseRate: 60,
            taxableAmount: 600,
            gstAmount: 72,
            lineTotal: 672,
          },
        ],
      }),
    ]);

    const result = await service.getDistributorAnalytics(
      {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        productName: 'Azithral',
        minDiscountDropPercent: 5,
      },
      branchId,
    );

    expect(prisma.pharmacyPurchaseInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branchId,
          status: 'STOCK_COMMITTED',
          invoiceDate: {
            gte: new Date('2026-03-01'),
            lte: new Date('2026-03-31T23:59:59.999Z'),
          },
          items: {
            some: {
              productName: {
                contains: 'Azithral',
                mode: 'insensitive',
              },
            },
          },
        }),
      }),
    );
    expect(result.totals).toMatchObject({
      invoiceCount: 2,
      lineCount: 2,
      taxableAmount: 1700,
      gstAmount: 204,
      lineTotal: 1904,
      purchasedQuantity: 30,
      freeQuantity: 2,
      totalQuantity: 32,
      freeQuantityRatioPercent: 6.25,
      effectiveUnitCost: 53.13,
    });
    expect(result.distributors[0]).toMatchObject({
      distributorName: 'Linae Distributors',
      distributorGstin: '36ABCDE1234F1Z5',
      invoiceCount: 2,
      lineTotal: 1904,
    });
    expect(result.products[0]).toMatchObject({
      productName: 'Azithral 500 Tablet',
      distributorGstin: '36ABCDE1234F1Z5',
      latestPurchaseRate: 60,
      latestDiscountPercent: 4,
    });
    expect(result.discountDropAlerts).toEqual([
      expect.objectContaining({
        productName: 'Azithral 500 Tablet',
        previousDiscountPercent: 12,
        latestDiscountPercent: 4,
        dropPercent: 8,
      }),
    ]);
  });

  it('keeps the complete filtered ranking and separates product masters and declared pack units', async () => {
    const base = analyticsInvoice();
    const line = base.items[0];
    const invoices = [
      base,
      analyticsInvoice({ id: 'purchase-second-unit', invoiceNumber: 'UNIT-2', items: [{ ...line, id: 'line-unit', packUnitType: 'Tablet', discountPercent: 0, specialDiscountPercent: 0 }] }),
      analyticsInvoice({ id: 'purchase-other-master', invoiceNumber: 'MASTER-2', items: [{ ...line, id: 'line-master', discountPercent: 0 }] }),
      analyticsInvoice({ id: 'reviewed-unposted', status: 'REVIEWED', items: [{ ...line, id: 'line-unposted', taxableAmount: 999999 }] }),
      analyticsInvoice({ id: 'other-product', items: [{ ...line, id: 'line-unrelated', productName: 'Unrelated cream', taxableAmount: 999999 }] }),
    ];
    prisma.pharmacyPurchaseInvoice.findMany.mockResolvedValue(invoices);
    prisma.inventoryItem.findMany.mockResolvedValue([{ id: 'inventory-analytics', drugs: [{ id: 'master-fallback' }] }]);
    prisma.auditLog.findMany.mockResolvedValue(invoices.flatMap(invoice => invoice.items.map((item: any) => ({ entityId: invoice.id, newValues: JSON.stringify({ branchId, lineId: item.id, drugId: invoice.id === 'purchase-other-master' ? 'master-other' : 'master-one' }) }))));
    const result = await service.getDistributorAnalytics({ productName: 'Azithral', hsnCode: '3004', distributorGstin: '36ABCDE1234F1Z5', limit: 1 }, branchId);
    expect(result.products).toHaveLength(3);
    expect(result.totals).toMatchObject({ invoiceCount: 3, lineCount: 3, taxableAmount: 3300, effectiveUnitCost: null, compatibleUnitBasis: false });
    expect(result.products.reduce((sum, row) => sum + row.lineTotal, 0)).toBe(result.totals.lineTotal);
    expect(result.distributors.reduce((sum, row) => sum + row.lineTotal, 0)).toBe(result.totals.lineTotal);
    expect(result.distributors[0].effectiveUnitCost).toBeNull();
    expect(result.discountDropAlerts).toEqual([]);
    expect(result.products.map(row => [row.productIdentityKey, row.packUnitType])).toEqual(expect.arrayContaining([
      ['master:master-one', 'Strip'], ['master:master-one', 'Tablet'], ['master:master-other', 'Strip'],
    ]));
    expect(result.filters.includedStatuses).toEqual(['STOCK_COMMITTED']);
    expect(prisma.pharmacyPurchaseInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ branchId, status: 'STOCK_COMMITTED', distributorGstin: '36ABCDE1234F1Z5', items: { some: { productName: { contains: 'Azithral', mode: 'insensitive' }, hsnCode: '3004' } } }) }));
  });

  it('keeps historical purchases without verifiable master identity visible but their comparable cost unknown', async () => {
    const invoice = analyticsInvoice();
    invoice.items[0].inventoryItemId = null;
    prisma.pharmacyPurchaseInvoice.findMany.mockResolvedValue([invoice]);
    const result = await service.getDistributorAnalytics({}, branchId);
    expect(result.totals.lineCount).toBe(1);
    expect(result.products[0]).toMatchObject({ productIdentityKnown: false, effectiveUnitCost: null });
    expect(result.discountDropAlerts).toEqual([]);
  });

  it('rejects distributor analytics with an inverted date range', async () => {
    await expect(
      service.getDistributorAnalytics(
        { startDate: '2026-04-01', endDate: '2026-03-01' },
        branchId,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.pharmacyPurchaseInvoice.findMany).not.toHaveBeenCalled();
  });
});
