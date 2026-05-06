import { BadRequestException, ConflictException } from '@nestjs/common';
import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';
import {
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
        packUnitType: 'Tablet',
        hsnCode: '3004',
        batchNumber: 'AZT2401',
        expiryMonth: 12,
        expiryYear: 2027,
        quantityPurchased: 20,
        freeQuantity: 2,
        mrp: 78,
        discountPercent: 10,
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
      $transaction: jest.fn((callback: any) => callback(prisma)),
      pharmacyPurchaseInvoice: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
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

  it('marks OCR drafts as review-required when flags or low confidence exist', async () => {
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
          unresolvedOcrFlags: 2,
        }),
      }),
    );
  });

  it('extracts an OCR draft from an uploaded invoice without writing to the database', async () => {
    const previousApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key';
    const previousFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                draft: {
                  distributorName: 'Apex Distributors',
                  distributorGstin: '36ABCDE1234F1Z5',
                  distributorDlNo: 'TS/HYD/20B/12345',
                  invoiceNumber: 'APX-001',
                  invoiceDate: '01/03/2026',
                  billType: 'cash',
                  doctorNameOrRegNo: 'Dr. Shravya / TS-MC-12345',
                  taxableAmount: 100,
                  totalCgst: 6,
                  totalSgst: 6,
                  totalGst: 12,
                  netPayable: 112,
                  items: [
                    {
                      productName: 'Azithral 500 Tablet',
                      manufacturer: 'Alembic Pharmaceuticals',
                      packSize: 'Strip of 3',
                      packUnitType: 'Tablet',
                      hsnCode: '3004',
                      batchNumber: 'AZT2401',
                      expiry: '12/27',
                      quantityPurchased: 1,
                      freeQuantity: 0,
                      mrp: 120,
                      purchaseRate: 100,
                      taxableAmount: 100,
                      gstPercent: 12,
                      gstAmount: 12,
                      lineTotal: 112,
                      ocrConfidence: 0.86,
                    },
                  ],
                },
              }),
            },
          },
        ],
      }),
    });
    (global as any).fetch = fetchMock;

    try {
      const tinyPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lFh1WQAAAABJRU5ErkJggg==',
        'base64',
      );
      const result = await service.extractDraftFromDocument(
        {
          buffer: tinyPng,
          size: tinyPng.length,
          mimetype: 'image/png',
          originalname: 'apex-invoice.png',
        } as any,
        branchId,
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(prisma.pharmacyPurchaseInvoice.create).not.toHaveBeenCalled();
      expect(result.draft).toMatchObject({
        source: PharmacyPurchaseInvoiceSourceDto.OCR,
        distributorName: 'Apex Distributors',
        invoiceNumber: 'APX-001',
        invoiceDate: '2026-03-01',
      });
      expect(result.draft.items[0]).toMatchObject({
        productName: 'Azithral 500 Tablet',
        expiryMonth: 12,
        expiryYear: 2027,
        cgstPercent: 6,
        sgstPercent: 6,
        ocrConfidence: 0.86,
      });
      expect(result.draft.items[0].ocrFlags).toContain('low_confidence_line');
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousApiKey;
      }
      global.fetch = previousFetch;
    }
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

  it('rejects credit bills without due date', async () => {
    const dto = validDto();
    dto.billType = PharmacyPurchaseBillTypeDto.CREDIT;

    await expect(service.createDraft(dto, branchId, userId)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('converts duplicate distributor invoice keys into conflict errors', async () => {
    prisma.pharmacyPurchaseInvoice.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.createDraft(validDto(), branchId, userId),
    ).rejects.toThrow(ConflictException);
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
          category: 'Uncategorized',
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
    status: 'REVIEWED',
    items: [
      {
        id: 'analytics-line-1',
        lineNumber: 1,
        productName: 'Azithral 500 Tablet',
        manufacturer: 'Alembic Pharmaceuticals',
        packSize: 'Strip of 3',
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

  it('builds distributor analytics from reviewed purchase invoices only', async () => {
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
          status: { in: ['REVIEWED', 'STOCK_COMMITTED'] },
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
