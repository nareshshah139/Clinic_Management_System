import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from '../inventory.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import {
  InventoryItemType,
  InventoryStatus,
  StockStatus,
  TransactionType,
  UnitType,
} from '../dto/inventory.dto';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: PrismaService;

  const mockPrisma = {
    inventoryItem: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    stockTransaction: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    purchaseOrder: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    supplier: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createInventoryItem', () => {
    it('should create an inventory item successfully', async () => {
      const createItemDto = {
        name: 'Paracetamol 500mg',
        description: 'Pain relief medicine',
        type: InventoryItemType.MEDICINE,
        costPrice: 10.5,
        sellingPrice: 15.0,
        unit: UnitType.STRIPS,
        minStockLevel: 10,
        reorderLevel: 5,
      };

      const mockItem = {
        id: 'item-123',
        ...createItemDto,
        branchId: 'branch-123',
        currentStock: 0,
        stockStatus: StockStatus.OUT_OF_STOCK,
        status: InventoryStatus.ACTIVE,
        tags: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.inventoryItem.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryItem.create.mockResolvedValue(mockItem);

      const result = await service.createInventoryItem(createItemDto, 'branch-123');

      expect(result).toMatchObject({
        id: 'item-123',
        name: 'Paracetamol 500mg',
        type: InventoryItemType.MEDICINE,
        costPrice: 10.5,
        sellingPrice: 15.0,
        currentStock: 0,
        stockStatus: StockStatus.OUT_OF_STOCK,
      });
      expect(mockPrisma.inventoryItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ...createItemDto,
          branchId: 'branch-123',
          currentStock: 0,
          stockStatus: StockStatus.OUT_OF_STOCK,
          status: InventoryStatus.ACTIVE,
        }),
      });
    });

    it('should throw ConflictException if SKU already exists', async () => {
      const createItemDto = {
        name: 'Paracetamol 500mg',
        sku: 'PAR-500',
        type: InventoryItemType.MEDICINE,
        costPrice: 10.5,
        sellingPrice: 15.0,
        unit: UnitType.STRIPS,
      };

      mockPrisma.inventoryItem.findFirst.mockResolvedValue({ id: 'existing-item' });

      await expect(service.createInventoryItem(createItemDto, 'branch-123'))
        .rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if barcode already exists', async () => {
      const createItemDto = {
        name: 'Paracetamol 500mg',
        barcode: '123456789',
        type: InventoryItemType.MEDICINE,
        costPrice: 10.5,
        sellingPrice: 15.0,
        unit: UnitType.STRIPS,
      };

      mockPrisma.inventoryItem.findFirst
        .mockResolvedValueOnce(null) // SKU check passes
        .mockResolvedValueOnce({ id: 'existing-item' }); // Barcode check fails
      mockPrisma.inventoryItem.create.mockRejectedValue(new ConflictException('Item with this barcode already exists'));

      await expect(service.createInventoryItem(createItemDto, 'branch-123'))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('findAllInventoryItems', () => {
    it('should return paginated inventory items', async () => {
      const mockItems = [
        {
          id: 'item-1',
          name: 'Paracetamol',
          type: InventoryItemType.MEDICINE,
          currentStock: 50,
          costPrice: 10.5,
          sellingPrice: 15.0,
          tags: null,
          metadata: null,
        },
        {
          id: 'item-2',
          name: 'Syringe',
          type: InventoryItemType.EQUIPMENT,
          currentStock: 100,
          costPrice: 5.0,
          sellingPrice: 8.0,
          tags: null,
          metadata: null,
        },
      ];

      mockPrisma.inventoryItem.findMany.mockResolvedValue(mockItems);
      mockPrisma.inventoryItem.count.mockResolvedValue(2);

      const result = await service.findAllInventoryItems({}, 'branch-123');

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('pagination');
      expect(result.items).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });

    it('should filter items by type', async () => {
      const query = { type: InventoryItemType.MEDICINE };
      mockPrisma.inventoryItem.findMany.mockResolvedValue([]);
      mockPrisma.inventoryItem.count.mockResolvedValue(0);

      await service.findAllInventoryItems(query, 'branch-123');

      expect(mockPrisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: InventoryItemType.MEDICINE,
          }),
        }),
      );
    });

    it('should search items by name', async () => {
      const query = { search: 'paracetamol' };
      mockPrisma.inventoryItem.findMany.mockResolvedValue([]);
      mockPrisma.inventoryItem.count.mockResolvedValue(0);

      await service.findAllInventoryItems(query, 'branch-123');

      expect(mockPrisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                name: expect.objectContaining({
                  contains: 'paracetamol',
                  mode: 'insensitive',
                }),
              }),
            ]),
          }),
        }),
      );
    });
  });

  describe('findInventoryItemById', () => {
    it('should return inventory item by id', async () => {
      const mockItem = {
        id: 'item-123',
        name: 'Paracetamol',
        type: InventoryItemType.MEDICINE,
        currentStock: 50,
        tags: null,
        metadata: null,
      };

      mockPrisma.inventoryItem.findFirst.mockReset();
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(mockItem);

      const result = await service.findInventoryItemById('item-123', 'branch-123');

      expect(result).toMatchObject({
        id: 'item-123',
        name: 'Paracetamol',
        type: InventoryItemType.MEDICINE,
        currentStock: 50,
      });
    });

    it('should throw NotFoundException if item not found', async () => {
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(null);

      await expect(service.findInventoryItemById('non-existent', 'branch-123'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('updateInventoryItem', () => {
    it('should update inventory item successfully', async () => {
      const existingItem = {
        id: 'item-123',
        name: 'Paracetamol',
        sku: 'PAR-500',
        barcode: '123456789',
        tags: null,
      };

      const updateDto = {
        name: 'Updated Paracetamol',
        costPrice: 12.0,
      };

      const updatedItem = {
        ...existingItem,
        ...updateDto,
      };

      mockPrisma.inventoryItem.findFirst.mockResolvedValue(existingItem);
      mockPrisma.inventoryItem.update.mockResolvedValue(updatedItem);

      const result = await service.updateInventoryItem('item-123', updateDto, 'branch-123');

      expect(result).toMatchObject({
        id: 'item-123',
        name: 'Updated Paracetamol',
        costPrice: 12.0,
      });
    });

    it('should throw NotFoundException if item not found', async () => {
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(null);

      await expect(service.updateInventoryItem('non-existent', {}, 'branch-123'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteInventoryItem', () => {
    it('should delete inventory item successfully', async () => {
      const mockItem = { id: 'item-123' };
      mockPrisma.inventoryItem.findFirst.mockReset();
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(mockItem);
      mockPrisma.stockTransaction.count.mockResolvedValue(0);
      mockPrisma.inventoryItem.delete.mockResolvedValue(mockItem);

      const result = await service.deleteInventoryItem('item-123', 'branch-123');

      expect(result).toEqual({ message: 'Inventory item deleted successfully' });
    });

    it('should throw NotFoundException if item not found', async () => {
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(null);

      await expect(service.deleteInventoryItem('non-existent', 'branch-123'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if item has transactions', async () => {
      const mockItem = { id: 'item-123' };
      mockPrisma.inventoryItem.findFirst.mockReset();
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(mockItem);
      mockPrisma.stockTransaction.count.mockResolvedValue(5);

      await expect(service.deleteInventoryItem('item-123', 'branch-123'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('createStockTransaction', () => {
    it('should create stock transaction successfully', async () => {
      const mockItem = {
        id: 'item-123',
        costPrice: 10.5,
        currentStock: 50,
      };

      const createTransactionDto = {
        itemId: 'item-123',
        type: TransactionType.PURCHASE,
        quantity: 20,
        unitPrice: 10.5,
      };

      const mockTransaction = {
        id: 'transaction-123',
        ...createTransactionDto,
        branchId: 'branch-123',
        userId: 'user-123',
        totalAmount: 210.0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.inventoryItem.findFirst.mockReset();
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(mockItem);
      mockPrisma.stockTransaction.create.mockResolvedValue(mockTransaction);
      mockPrisma.inventoryItem.update.mockResolvedValue({});

      const result = await service.createStockTransaction(createTransactionDto, 'branch-123', 'user-123');

      expect(result).toMatchObject({
        id: 'transaction-123',
        itemId: 'item-123',
        type: TransactionType.PURCHASE,
        quantity: 20,
        totalAmount: 210.0,
      });
    });

    it('should throw NotFoundException if item not found', async () => {
      const createTransactionDto = {
        itemId: 'non-existent',
        type: TransactionType.PURCHASE,
        quantity: 20,
      };

      mockPrisma.inventoryItem.findFirst.mockResolvedValue(null);

      await expect(service.createStockTransaction(createTransactionDto, 'branch-123', 'user-123'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('adjustStock', () => {
    it('should adjust stock successfully', async () => {
      const mockItem = {
        id: 'item-123',
        costPrice: 10.5,
        currentStock: 50,
      };

      const adjustmentDto = {
        itemId: 'item-123',
        adjustmentQuantity: 10,
        reason: 'Stock adjustment',
      };

      const mockTransaction = {
        id: 'transaction-123',
        itemId: 'item-123',
        type: TransactionType.ADJUSTMENT,
        quantity: 10,
        reason: 'Stock adjustment',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.inventoryItem.findFirst.mockReset();
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(mockItem);
      mockPrisma.stockTransaction.create.mockResolvedValue(mockTransaction);
      mockPrisma.inventoryItem.update.mockResolvedValue({});

      const result = await service.adjustStock(adjustmentDto, 'branch-123', 'user-123');

      expect(result).toMatchObject({
        id: 'transaction-123',
        itemId: 'item-123',
        type: TransactionType.ADJUSTMENT,
        quantity: 10,
        reason: 'Stock adjustment',
      });
    });
  });

  describe('transferStock', () => {
    it('should transfer stock successfully', async () => {
      const mockItem = {
        id: 'item-123',
        costPrice: 10.5,
        currentStock: 50,
      };

      const transferDto = {
        itemId: 'item-123',
        quantity: 10,
        fromLocation: 'Store A',
        toLocation: 'Store B',
      };

      const mockOutboundTransaction = {
        id: 'outbound-123',
        type: TransactionType.TRANSFER,
        quantity: 10,
        location: 'Store A',
      };

      const mockInboundTransaction = {
        id: 'inbound-123',
        type: TransactionType.TRANSFER,
        quantity: 10,
        location: 'Store B',
      };

      mockPrisma.inventoryItem.findFirst.mockReset();
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(mockItem);
      mockPrisma.stockTransaction.create
        .mockResolvedValueOnce(mockOutboundTransaction)
        .mockResolvedValueOnce(mockInboundTransaction);
      mockPrisma.inventoryItem.update.mockResolvedValue({});

      const result = await service.transferStock(transferDto, 'branch-123', 'user-123');

      expect(result).toHaveProperty('outboundTransaction');
      expect(result).toHaveProperty('inboundTransaction');
      expect(result.outboundTransaction.location).toBe('Store A');
      expect(result.inboundTransaction.location).toBe('Store B');
    });

    it('should throw BadRequestException if insufficient stock', async () => {
      const mockItem = {
        id: 'item-123',
        currentStock: 5,
      };

      const transferDto = {
        itemId: 'item-123',
        quantity: 10,
        fromLocation: 'Store A',
        toLocation: 'Store B',
      };

      mockPrisma.inventoryItem.findFirst.mockReset();
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(mockItem);

      await expect(service.transferStock(transferDto, 'branch-123', 'user-123'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('createPurchaseOrder', () => {
    it('should create purchase order successfully', async () => {
      const createOrderDto = {
        supplier: 'ABC Pharma',
        items: [
          {
            itemId: 'item-123',
            quantity: 100,
            unitPrice: 10.5,
          },
        ],
      };

      const mockOrder = {
        id: 'order-123',
        ...createOrderDto,
        branchId: 'branch-123',
        userId: 'user-123',
        status: 'PENDING',
        totalAmount: 1050.0,
        items: JSON.stringify(createOrderDto.items),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.purchaseOrder.create.mockResolvedValue(mockOrder);

      const result = await service.createPurchaseOrder(createOrderDto, 'branch-123', 'user-123');

      expect(result).toMatchObject({
        id: 'order-123',
        supplier: 'ABC Pharma',
        status: 'PENDING',
        totalAmount: 1050.0,
      });
    });
  });

  describe('createSupplier', () => {
    it('should create supplier successfully', async () => {
      const createSupplierDto = {
        name: 'ABC Pharma',
        contactPerson: 'John Doe',
        email: 'john@abcpharma.com',
        phone: '+91-9876543210',
      };

      const mockSupplier = {
        id: 'supplier-123',
        ...createSupplierDto,
        branchId: 'branch-123',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.supplier.create.mockResolvedValue(mockSupplier);

      const result = await service.createSupplier(createSupplierDto, 'branch-123');

      expect(result).toMatchObject({
        id: 'supplier-123',
        name: 'ABC Pharma',
        contactPerson: 'John Doe',
        email: 'john@abcpharma.com',
        phone: '+91-9876543210',
        isActive: true,
      });
    });
  });

  describe('getStockReport', () => {
    it('should return stock report', async () => {
      const mockItems = [
        {
          id: 'item-1',
          name: 'Paracetamol',
          currentStock: 50,
          costPrice: 10.5,
          reorderLevel: 10,
          expiryDate: new Date('2025-12-31'),
          tags: null,
          metadata: null,
        },
        {
          id: 'item-2',
          name: 'Syringe',
          currentStock: 5,
          costPrice: 5.0,
          reorderLevel: 10,
          expiryDate: null,
          tags: null,
          metadata: null,
        },
      ];

      mockPrisma.inventoryItem.findMany.mockResolvedValue(mockItems);

      const result = await service.getStockReport({}, 'branch-123');

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('summary');
      expect(result.summary.totalItems).toBe(2);
      expect(result.summary.totalValue).toBe(550); // (50 * 10.5) + (5 * 5.0)
      expect(result.summary.lowStockItems).toBe(1); // Only syringe is low stock
    });
  });

  describe('getInventoryStatistics', () => {
    it('should return inventory statistics', async () => {
      const mockStats = {
        totalItems: 100,
        totalValue: 5000,
        lowStockCount: 15,
        expiredCount: 5,
        typeBreakdown: [
          { type: InventoryItemType.MEDICINE, _count: { id: 60 }, _sum: { currentStock: 3000 } },
          { type: InventoryItemType.EQUIPMENT, _count: { id: 40 }, _sum: { currentStock: 2000 } },
        ],
        categoryBreakdown: [
          { category: 'Pain Relief', _count: { id: 30 }, _sum: { currentStock: 1500 } },
          { category: 'Antibiotics', _count: { id: 20 }, _sum: { currentStock: 1000 } },
        ],
        locationBreakdown: [
          { storageLocation: 'Store A', _count: { id: 50 }, _sum: { currentStock: 2500 } },
          { storageLocation: 'Store B', _count: { id: 50 }, _sum: { currentStock: 2500 } },
        ],
      };

      mockPrisma.inventoryItem.count.mockResolvedValue(100);
      mockPrisma.inventoryItem.aggregate.mockResolvedValue({ _sum: { currentStock: 5000 } });
      mockPrisma.inventoryItem.groupBy
        .mockResolvedValueOnce(mockStats.typeBreakdown)
        .mockResolvedValueOnce(mockStats.categoryBreakdown)
        .mockResolvedValueOnce(mockStats.locationBreakdown);

      const result = await service.getInventoryStatistics({}, 'branch-123');

      expect(result).toMatchObject({
        totalItems: 100,
        totalValue: 5000,
        typeBreakdown: mockStats.typeBreakdown,
        categoryBreakdown: mockStats.categoryBreakdown,
        locationBreakdown: mockStats.locationBreakdown,
      });
    });
  });

  describe('getLowStockAlerts', () => {
    it('should return low stock items', async () => {
      const mockItems = [
        {
          id: 'item-1',
          name: 'Paracetamol',
          currentStock: 5,
          reorderLevel: 10,
          tags: null,
          metadata: null,
        },
        {
          id: 'item-2',
          name: 'Syringe',
          currentStock: 2,
          reorderLevel: 15,
          tags: null,
          metadata: null,
        },
      ];

      mockPrisma.inventoryItem.findMany.mockResolvedValue(mockItems);

      const result = await service.getLowStockAlerts({}, 'branch-123');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Paracetamol');
      expect(result[1].name).toBe('Syringe');
    });
  });

  describe('getExpiryAlerts', () => {
    it('should return items expiring soon', async () => {
      const mockItems = [
        {
          id: 'item-1',
          name: 'Paracetamol',
          expiryDate: new Date('2024-12-31'),
          tags: null,
          metadata: null,
        },
        {
          id: 'item-2',
          name: 'Antibiotic',
          expiryDate: new Date('2024-12-25'),
          tags: null,
          metadata: null,
        },
      ];

      mockPrisma.inventoryItem.findMany.mockResolvedValue(mockItems);

      const result = await service.getExpiryAlerts({}, 'branch-123');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Paracetamol');
      expect(result[1].name).toBe('Antibiotic');
    });
  });

  describe('searchByBarcode', () => {
    it('should find item by barcode', async () => {
      const mockItem = {
        id: 'item-123',
        name: 'Paracetamol',
        barcode: '123456789',
        tags: null,
        metadata: null,
      };

      mockPrisma.inventoryItem.findFirst.mockReset();
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(mockItem);

      const result = await service.searchByBarcode({ barcode: '123456789' }, 'branch-123');

      expect(result).toMatchObject({
        id: 'item-123',
        name: 'Paracetamol',
        barcode: '123456789',
      });
    });

    it('should throw NotFoundException if barcode not found', async () => {
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(null);

      await expect(service.searchByBarcode({ barcode: 'non-existent' }, 'branch-123'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('searchBySku', () => {
    it('should find item by SKU', async () => {
      const mockItem = {
        id: 'item-123',
        name: 'Paracetamol',
        sku: 'PAR-500',
        tags: null,
        metadata: null,
      };

      mockPrisma.inventoryItem.findFirst.mockReset();
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(mockItem);

      const result = await service.searchBySku({ sku: 'PAR-500' }, 'branch-123');

      expect(result).toMatchObject({
        id: 'item-123',
        name: 'Paracetamol',
        sku: 'PAR-500',
      });
    });

    it('should throw NotFoundException if SKU not found', async () => {
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(null);

      await expect(service.searchBySku({ sku: 'non-existent' }, 'branch-123'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('getInventoryDashboard', () => {
    it('should return inventory dashboard data', async () => {
      const mockDashboard = {
        totalItems: 100,
        totalValue: 5000,
        lowStockCount: 15,
        expiredCount: 5,
        recentTransactions: [
          {
            id: 'transaction-1',
            type: TransactionType.PURCHASE,
            quantity: 50,
            createdAt: new Date(),
            item: { id: 'item-1', name: 'Paracetamol' },
          },
        ],
        topMovingItems: [
          { itemId: 'item-1', _sum: { quantity: 100 } },
          { itemId: 'item-2', _sum: { quantity: 80 } },
        ],
      };

      mockPrisma.inventoryItem.count.mockResolvedValue(100);
      mockPrisma.inventoryItem.aggregate.mockResolvedValue({ _sum: { currentStock: 5000 } });
      mockPrisma.stockTransaction.findMany.mockResolvedValue(mockDashboard.recentTransactions);
      mockPrisma.stockTransaction.groupBy.mockResolvedValue(mockDashboard.topMovingItems);

      const result = await service.getInventoryDashboard('branch-123');

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('recentTransactions');
      expect(result).toHaveProperty('topMovingItems');
      expect(result.summary.totalItems).toBe(100);
      expect(result.summary.totalValue).toBe(5000);
    });
  });
});
