import { BadRequestException, ConflictException } from '@nestjs/common';
import { DrugInventoryChangeRequestStatus, UserRole } from '@prisma/client';
import { DrugService } from '../drug.service';

describe('DrugService inventory change approvals', () => {
  let service: DrugService;
  let prisma: any;

  const branchId = 'branch-1';
  const pharmacistId = 'pharmacist-1';
  const doctorId = 'doctor-1';

  const inventoryItem = {
    id: 'inventory-1',
    currentStock: 10,
    costPrice: 50,
    stockStatus: 'IN_STOCK',
    reorderLevel: 5,
    minStockLevel: 3,
    expiryDate: null,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((input: any) => {
        if (Array.isArray(input)) {
          return Promise.all(input);
        }
        return input(prisma);
      }),
      drug: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      inventoryItem: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      stockTransaction: {
        create: jest.fn(),
      },
      drugInventoryChangeRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    };
    service = new DrugService(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('blocks direct pharmacist edits to drug prices', async () => {
    prisma.drug.findFirst.mockResolvedValue({
      id: 'drug-1',
      name: 'Azithral 500 Tablet',
      price: 78,
      composition1: 'Azithromycin',
      category: 'Antibiotic',
      dosageForm: 'Tablet',
      strength: '500mg',
      isActive: true,
      isDiscontinued: false,
    });

    await expect(
      service.update(
        'drug-1',
        { price: 82 },
        branchId,
        UserRole.PHARMACIST,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.drug.update).not.toHaveBeenCalled();
  });

  it('creates pending requests for changed prices and stock', async () => {
    prisma.drug.findMany.mockResolvedValue([
      {
        id: 'drug-1',
        name: 'Azithral 500 Tablet',
        price: 78,
        inventoryItems: [inventoryItem],
      },
      {
        id: 'drug-2',
        name: 'Deriva CMS Gel',
        price: 275,
        inventoryItems: [{ ...inventoryItem, id: 'inventory-2', currentStock: 4 }],
      },
    ]);
    prisma.drugInventoryChangeRequest.findMany.mockResolvedValue([]);
    prisma.drugInventoryChangeRequest.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: `request-${data.drugId}`,
        status: DrugInventoryChangeRequestStatus.PENDING,
        ...data,
      }),
    );

    const result = await service.createInventoryChangeRequests(
      {
        changes: [
          {
            drugId: 'drug-1',
            inventoryItemId: 'inventory-1',
            proposedPrice: 82,
            proposedStock: 12,
            reason: 'New MRP and shelf count',
          },
          { drugId: 'drug-2', proposedStock: 6, reason: 'Shelf count' },
        ],
      },
      branchId,
      pharmacistId,
    );

    expect(result.summary.submitted).toBe(2);
    expect(prisma.drugInventoryChangeRequest.create).toHaveBeenCalledTimes(2);
    expect(prisma.drugInventoryChangeRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId,
          drugId: 'drug-1',
          inventoryItemId: 'inventory-1',
          requestedById: pharmacistId,
          currentPrice: 78,
          proposedPrice: 82,
          currentStock: 10,
          proposedStock: 12,
          reason: 'New MRP and shelf count',
        }),
      }),
    );
  });

  it('rejects a proposal batch when a drug already has a pending request', async () => {
    prisma.drug.findMany.mockResolvedValue([
      {
        id: 'drug-1',
        name: 'Azithral 500 Tablet',
        price: 78,
        inventoryItems: [inventoryItem],
      },
    ]);
    prisma.drugInventoryChangeRequest.findMany.mockResolvedValue([
      {
        id: 'request-1',
        drug: { name: 'Azithral 500 Tablet' },
      },
    ]);

    await expect(
      service.createInventoryChangeRequests(
        { changes: [{ drugId: 'drug-1', proposedPrice: 82 }] },
        branchId,
        pharmacistId,
      ),
    ).rejects.toThrow(ConflictException);

    expect(prisma.drugInventoryChangeRequest.create).not.toHaveBeenCalled();
  });

  it('approves a pending request and commits price plus stock', async () => {
    prisma.drugInventoryChangeRequest.findFirst.mockResolvedValue({
      id: 'request-1',
      branchId,
      drugId: 'drug-1',
      inventoryItemId: 'inventory-1',
      status: DrugInventoryChangeRequestStatus.PENDING,
      currentPrice: 78,
      proposedPrice: 82,
      currentStock: 10,
      proposedStock: 14,
      drug: { id: 'drug-1', name: 'Azithral 500 Tablet', price: 78 },
      inventoryItem,
    });
    prisma.inventoryItem.findMany.mockResolvedValue([inventoryItem]);
    prisma.drug.update.mockResolvedValue({ id: 'drug-1', price: 82 });
    prisma.inventoryItem.update.mockResolvedValue({
      ...inventoryItem,
      currentStock: 14,
    });
    prisma.stockTransaction.create.mockResolvedValue({ id: 'txn-1' });
    prisma.drugInventoryChangeRequest.update.mockResolvedValue({
      id: 'request-1',
      status: DrugInventoryChangeRequestStatus.APPROVED,
      reviewedById: doctorId,
      proposedPrice: 82,
      proposedStock: 14,
    });

    const result = await service.approveInventoryChangeRequest(
      'request-1',
      { reviewNote: 'Checked invoice and shelf count' },
      branchId,
      doctorId,
    );

    expect(prisma.drug.update).toHaveBeenCalledWith({
      where: { id: 'drug-1' },
      data: { price: 82 },
    });
    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'inventory-1' },
      data: expect.objectContaining({
        currentStock: 14,
        stockStatus: 'IN_STOCK',
      }),
    });
    expect(prisma.stockTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        itemId: 'inventory-1',
        branchId,
        userId: doctorId,
        type: 'ADJUSTMENT',
        quantity: 4,
        reason: 'Doctor-approved inventory update',
      }),
    });
    expect(result.status).toBe(DrugInventoryChangeRequestStatus.APPROVED);
  });

  it('rejects a pending request without changing price or stock', async () => {
    prisma.drugInventoryChangeRequest.findFirst.mockResolvedValue({
      id: 'request-1',
      branchId,
      drugId: 'drug-1',
      status: DrugInventoryChangeRequestStatus.PENDING,
      currentPrice: 78,
      proposedPrice: 82,
      currentStock: 10,
      proposedStock: 14,
    });
    prisma.drugInventoryChangeRequest.update.mockResolvedValue({
      id: 'request-1',
      status: DrugInventoryChangeRequestStatus.REJECTED,
      reviewedById: doctorId,
    });

    const result = await service.rejectInventoryChangeRequest(
      'request-1',
      { reviewNote: 'Hold for next invoice' },
      branchId,
      doctorId,
    );

    expect(prisma.drug.update).not.toHaveBeenCalled();
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    expect(prisma.drugInventoryChangeRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'request-1' },
        data: expect.objectContaining({
          status: DrugInventoryChangeRequestStatus.REJECTED,
          reviewedById: doctorId,
          reviewNote: 'Hold for next invoice',
        }),
      }),
    );
    expect(result.status).toBe(DrugInventoryChangeRequestStatus.REJECTED);
  });
});
