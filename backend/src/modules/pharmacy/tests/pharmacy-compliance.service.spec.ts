import { GoneException } from '@nestjs/common';
import { PharmacyComplianceController } from '../pharmacy-compliance.controller';
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

  it.each(['OWNER', 'ADMIN', 'MANAGER', 'PHARMACIST'])('rejects retired direct audit submission for %s before any database access', async (role) => {
    const accessed: string[] = [];
    const unavailableDb = new Proxy({}, { get(_target, key) { accessed.push(String(key)); throw new Error('Retired audit must not access database'); } });
    const guardedService = new PharmacyComplianceService(unavailableDb as any);
    const controller = new PharmacyComplianceController(guardedService);
    let rejection: any;
    try {
      await controller.applyAuditAdjustments('old-audit', {
        reason: 'Legitimate old-client request',
        counts: [{ inventoryId: 'inventory-1', physicalStock: 8 }],
      }, { user: { id: userId, branchId, role } });
    } catch (error) { rejection = error; }
    expect(rejection).toBeInstanceOf(GoneException);
    expect(rejection.getStatus()).toBe(410);
    expect(rejection.getResponse()).toMatchObject({
      workflowUrl: '/dashboard/inventory?area=stock&view=COUNT',
      message: expect.stringContaining('no stock was changed'),
    });
    expect(accessed).toEqual([]);
  });
});
