import { BadRequestException } from '@nestjs/common';
import { PharmacyComplianceService } from '../pharmacy-compliance.service';
import { ExpiryReturnWindowDto } from '../dto/pharmacy-compliance.dto';

describe('PharmacyComplianceService', () => {
  let service: PharmacyComplianceService;
  let prisma: any;

  const branchId = 'branch-1';
  const userId = 'user-1';

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((callback: any) => callback(prisma)),
      pharmacyPurchaseInvoice: {
        findMany: jest.fn(),
      },
      pharmacyInvoice: {
        findMany: jest.fn(),
      },
      inventoryItem: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      stockTransaction: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      stockAdjustment: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      inventoryAudit: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new PharmacyComplianceService(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('summarizes input GST, output GST, net payable, and slabs', async () => {
    prisma.pharmacyPurchaseInvoice.findMany.mockResolvedValue([
      {
        id: 'purchase-1',
        totalGst: 132,
        items: [
          {
            taxableAmount: 1000,
            cgstPercent: 6,
            sgstPercent: 6,
            igstPercent: 0,
            gstAmount: 120,
            lineTotal: 1120,
          },
          {
            taxableAmount: 100,
            cgstPercent: 6,
            sgstPercent: 6,
            igstPercent: 0,
            gstAmount: 12,
            lineTotal: 112,
          },
        ],
      },
    ]);
    prisma.pharmacyInvoice.findMany.mockResolvedValue([
      {
        id: 'sale-1',
        taxAmount: 180,
        totalAmount: 1180,
        items: [
          {
            taxPercent: 18,
            taxAmount: 180,
            totalAmount: 1180,
          },
        ],
      },
    ]);

    const result = await service.getGstSummary(
      { startDate: '2026-04-01', endDate: '2026-04-30' },
      branchId,
    );

    expect(result.purchaseInputGst).toBe(132);
    expect(result.salesOutputGst).toBe(180);
    expect(result.netPayable).toBe(48);
    expect(result.purchases.slabs).toEqual([
      expect.objectContaining({
        slabPercent: 12,
        taxableAmount: 1100,
        totalGst: 132,
      }),
    ]);
    expect(result.sales.slabs).toEqual([
      expect.objectContaining({
        slabPercent: 18,
        taxableAmount: 1000,
        totalGst: 180,
      }),
    ]);
  });

  it('returns expiry batches with quarantine action for expired stock', async () => {
    const expiredDate = new Date('2026-01-15T00:00:00.000Z');
    prisma.inventoryItem.findMany.mockResolvedValue([
      {
        id: 'inventory-1',
        name: 'Azithral',
        batchNumber: 'AZT1',
        manufacturer: 'Alembic',
        supplier: 'Apex',
        expiryDate: expiredDate,
        currentStock: 5,
        costPrice: 40,
        mrp: 60,
      },
    ]);

    const result = await service.getExpiryReturns(
      ExpiryReturnWindowDto.EXPIRED,
      branchId,
    );

    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branchId,
          currentStock: { gt: 0 },
        }),
      }),
    );
    expect(result.totals.valueAtCost).toBe(200);
    expect(result.batches[0]).toMatchObject({
      inventoryId: 'inventory-1',
      suggestedAction: 'QUARANTINE_EXPIRED_STOCK',
      valueAtMrp: 300,
    });
  });

  it('creates a parseable audit session using InventoryAudit rows', async () => {
    prisma.inventoryItem.findMany.mockResolvedValue([
      {
        id: 'inventory-1',
        name: 'Azithral',
        batchNumber: 'AZT1',
        expiryDate: new Date('2027-12-01'),
        currentStock: 10,
      },
    ]);
    prisma.inventoryAudit.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: 'audit-row-1',
        ...data,
        item: {
          id: data.itemId,
          name: 'Azithral',
          batchNumber: 'AZT1',
          expiryDate: new Date('2027-12-01'),
        },
      }),
    );

    const result = await service.createAuditBatch(
      { inventoryIds: ['inventory-1'], notes: 'Cycle count' },
      branchId,
      userId,
    );

    expect(result.auditId).toMatch(/^audit-/);
    expect(result.status).toContain(`AUDIT_SESSION:${result.auditId}:PENDING`);
    expect(prisma.inventoryAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId,
          auditorId: userId,
          status: expect.stringMatching(/^AUDIT_SESSION:audit-.*:PENDING$/),
          notes: expect.stringContaining('"auditId"'),
        }),
      }),
    );
  });

  it('applies audit corrections with stock adjustment and transaction references', async () => {
    const item = {
      id: 'inventory-1',
      name: 'Azithral',
      currentStock: 10,
      costPrice: 50,
      batchNumber: 'AZT1',
      expiryDate: new Date('2027-12-01'),
      supplier: 'Apex',
      storageLocation: 'A1',
      minStockLevel: 5,
      reorderLevel: 5,
    };
    prisma.inventoryAudit.findMany.mockResolvedValue([
      {
        id: 'audit-row-1',
        branchId,
        itemId: item.id,
        physicalStock: 10,
        systemStock: 10,
        variance: 0,
        status: 'AUDIT_SESSION:audit-1:PENDING',
        item,
      },
    ]);
    prisma.inventoryItem.findMany.mockResolvedValue([item]);
    prisma.stockAdjustment.create.mockResolvedValue({ id: 'adjustment-1' });
    prisma.stockTransaction.create.mockResolvedValue({
      id: 'transaction-1',
      reference: 'AUDIT-audit-1',
    });
    prisma.inventoryItem.update.mockResolvedValue({ ...item, currentStock: 8 });
    prisma.inventoryAudit.update.mockResolvedValue({
      id: 'audit-row-1',
      physicalStock: 8,
      systemStock: 10,
      variance: -2,
    });

    const result = await service.applyAuditAdjustments(
      'audit-1',
      {
        reason: 'Verified physical count shortage',
        counts: [{ inventoryId: item.id, physicalStock: 8 }],
      },
      branchId,
      userId,
      'PHARMACIST',
    );

    expect(prisma.stockAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'PHYSICAL_COUNT',
          quantity: -2,
          reason: 'Verified physical count shortage',
        }),
      }),
    );
    expect(prisma.stockTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'ADJUSTMENT',
          quantity: 2,
          reference: 'AUDIT-audit-1',
        }),
      }),
    );
    expect(result.adjustments[0]).toMatchObject({
      userId,
      reason: 'Verified physical count shortage',
      beforeCount: 10,
      afterCount: 8,
      approvalRequired: true,
      stockAdjustmentId: 'adjustment-1',
      stockTransactionId: 'transaction-1',
      transactionReference: 'AUDIT-audit-1',
    });
  });

  it('rejects blank audit adjustment reasons', async () => {
    await expect(
      service.applyAuditAdjustments(
        'audit-1',
        {
          reason: ' ',
          counts: [{ inventoryId: 'inventory-1', physicalStock: 1 }],
        },
        branchId,
        userId,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
