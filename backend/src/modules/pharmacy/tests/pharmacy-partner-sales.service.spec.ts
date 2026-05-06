import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PharmacyPartnerSalesService } from '../pharmacy-partner-sales.service';

describe('PharmacyPartnerSalesService', () => {
  let service: PharmacyPartnerSalesService;
  let prisma: any;
  let tx: any;

  const branchId = 'branch-1';
  const adminUser = {
    id: 'admin-1',
    branchId,
    role: 'PHARMACIST',
    firstName: 'Pharma',
    lastName: 'Admin',
  };
  const partnerUser = {
    id: 'partner-user-1',
    branchId,
    role: 'PATIENT',
    metadata: JSON.stringify({ partnerOrganizationId: 'org-1' }),
  };
  const partnerOrganization = {
    id: 'org-1',
    branchId,
    name: 'HealthPlus Partner',
    cutoffHour: 22,
    isActive: true,
  };

  beforeEach(() => {
    tx = {
      partnerDailySale: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      partnerDailySaleItem: {
        update: jest.fn(),
      },
      inventoryItem: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      stockTransaction: {
        create: jest.fn(),
      },
    };

    prisma = {
      partnerOrganization: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      partnerDailySale: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((callback: (transactionClient: any) => unknown) =>
        callback(tx),
      ),
    };

    service = new PharmacyPartnerSalesService(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('submits a partner-scoped daily sale from metadata organization', async () => {
    prisma.partnerOrganization.findFirst.mockResolvedValue(partnerOrganization);
    prisma.partnerDailySale.findFirst.mockResolvedValue(null);
    prisma.partnerDailySale.create.mockImplementation((args: any) =>
      Promise.resolve({
        id: 'sale-1',
        ...args.data,
        items: args.data.items.create,
        partnerOrganization,
        submittedBy: null,
      }),
    );

    const result = await service.create(
      {
        partnerOrganizationId: 'org-1',
        partnerOrganizationName: 'Ignored Name',
        date: '2099-01-02',
        source: 'MANUAL',
        items: [
          {
            medicineName: 'Azithral 500',
            batchNumber: 'AZT-001',
            quantitySold: 2,
            mrp: 100,
            discountGiven: 10,
            paymentMode: 'UPI' as any,
          },
        ],
      },
      partnerUser,
    );

    expect(prisma.partnerDailySale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId,
          partnerOrganizationId: 'org-1',
          partnerOrganizationName: 'HealthPlus Partner',
          submittedById: 'partner-user-1',
          totalQuantity: 2,
          grossAmount: 200,
          totalDiscount: 10,
          netAmount: 190,
        }),
      }),
    );
    expect(result.partnerOrganizationId).toBe('org-1');
  });

  it('blocks partner users from submitting for another organization', async () => {
    await expect(
      service.create(
        {
          partnerOrganizationId: 'org-2',
          date: '2099-01-02',
          source: 'MANUAL',
          items: [
            {
              medicineName: 'Azithral 500',
              batchNumber: 'AZT-001',
              quantitySold: 1,
              mrp: 100,
              paymentMode: 'CASH' as any,
            },
          ],
        },
        partnerUser,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('commits available stock and flags excess quantity without negative stock', async () => {
    const sale = {
      id: 'sale-1',
      branchId,
      partnerOrganizationId: 'org-1',
      partnerOrganizationName: 'HealthPlus Partner',
      source: 'MANUAL',
      status: 'SUBMITTED',
      lateEntry: false,
      discrepancyFlags: null,
      stockCommittedAt: null,
      items: [
        {
          id: 'sale-item-1',
          medicineName: 'Azithral 500',
          batchNumber: 'AZT-001',
          quantitySold: 7,
          mrp: 100,
          discountGiven: 0,
        },
      ],
    };
    const inventoryBatch = {
      id: 'inventory-1',
      branchId,
      name: 'Azithral 500',
      batchNumber: 'AZT-001',
      currentStock: 5,
      expiryDate: new Date('2099-06-01T00:00:00.000Z'),
      drugs: [{ id: 'drug-1', name: 'Azithral 500' }],
    };

    tx.partnerDailySale.findFirst.mockResolvedValue(sale);
    tx.partnerDailySale.updateMany.mockResolvedValue({ count: 1 });
    tx.inventoryItem.findMany
      .mockResolvedValueOnce([inventoryBatch])
      .mockResolvedValueOnce([]);
    tx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    tx.inventoryItem.findUnique.mockResolvedValue({
      currentStock: 0,
      minStockLevel: 10,
      reorderLevel: null,
      expiryDate: inventoryBatch.expiryDate,
    });
    tx.inventoryItem.update.mockResolvedValue({});
    tx.stockTransaction.create.mockResolvedValue({});
    tx.partnerDailySaleItem.update.mockResolvedValue({});
    tx.partnerDailySale.update.mockResolvedValue({
      ...sale,
      status: 'PARTIAL_STOCK_COMMITTED',
      hasDiscrepancy: true,
      discrepancyFlags: JSON.stringify(['INSUFFICIENT_STOCK']),
      stockCommittedAt: new Date(),
      items: [
        {
          ...sale.items[0],
          committedQuantity: 5,
          matchedInventoryItemId: 'inventory-1',
          matchedDrugId: 'drug-1',
          discrepancyFlag: 'INSUFFICIENT_STOCK',
        },
      ],
    });

    const result = await service.commitStock('sale-1', adminUser);

    expect(tx.inventoryItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'inventory-1',
          branchId,
          currentStock: { gte: 5 },
        }),
        data: { currentStock: { decrement: 5 } },
      }),
    );
    expect(tx.stockTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId,
          itemId: 'inventory-1',
          type: 'SALE',
          quantity: 5,
          reference: 'PARTNER-SALE-sale-1',
          customer: 'HealthPlus Partner',
          batchNumber: 'AZT-001',
        }),
      }),
    );
    expect(tx.partnerDailySaleItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sale-item-1' },
        data: expect.objectContaining({
          committedQuantity: 5,
          matchedInventoryItemId: 'inventory-1',
          matchedDrugId: 'drug-1',
          discrepancyFlag: 'INSUFFICIENT_STOCK',
        }),
      }),
    );
    expect(result.status).toBe('PARTIAL_STOCK_COMMITTED');
    expect(result.discrepancyFlags).toEqual(['INSUFFICIENT_STOCK']);
  });

  it('does not create stock transactions when inventory changes during commit', async () => {
    const sale = {
      id: 'sale-1',
      branchId,
      partnerOrganizationId: 'org-1',
      partnerOrganizationName: 'HealthPlus Partner',
      source: 'MANUAL',
      status: 'SUBMITTED',
      lateEntry: false,
      discrepancyFlags: null,
      stockCommittedAt: null,
      items: [
        {
          id: 'sale-item-1',
          medicineName: 'Azithral 500',
          batchNumber: 'AZT-001',
          quantitySold: 2,
          mrp: 100,
          discountGiven: 0,
        },
      ],
    };

    tx.partnerDailySale.findFirst.mockResolvedValue(sale);
    tx.partnerDailySale.updateMany.mockResolvedValue({ count: 1 });
    tx.inventoryItem.findMany
      .mockResolvedValueOnce([
        {
          id: 'inventory-1',
          name: 'Azithral 500',
          batchNumber: 'AZT-001',
          currentStock: 2,
          expiryDate: null,
          drugs: [],
        },
      ])
      .mockResolvedValueOnce([]);
    tx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.commitStock('sale-1', adminUser)).rejects.toThrow(
      ConflictException,
    );
    expect(tx.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('scopes partner list access to metadata organization', async () => {
    prisma.partnerDailySale.findMany.mockResolvedValue([]);
    prisma.partnerDailySale.count.mockResolvedValue(0);

    await service.findAll({ org: 'org-2', page: 1, limit: 20 }, partnerUser);

    expect(prisma.partnerDailySale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branchId,
          partnerOrganizationId: 'org-1',
        }),
      }),
    );
  });
});
