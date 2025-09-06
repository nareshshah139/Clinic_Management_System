import { Test, TestingModule } from '@nestjs/testing';
import { InventoryController } from '../inventory.controller';
import { InventoryService } from '../inventory.service';
import { InventoryItemType, TransactionType, UnitType } from '../dto/inventory.dto';

describe('InventoryController', () => {
  let controller: InventoryController;
  let service: InventoryService;

  const mockInventoryService = {
    createInventoryItem: jest.fn(),
    findAllInventoryItems: jest.fn(),
    findInventoryItemById: jest.fn(),
    updateInventoryItem: jest.fn(),
    deleteInventoryItem: jest.fn(),
    createStockTransaction: jest.fn(),
    findAllStockTransactions: jest.fn(),
    findStockTransactionById: jest.fn(),
    updateStockTransaction: jest.fn(),
    deleteStockTransaction: jest.fn(),
    bulkStockUpdate: jest.fn(),
    adjustStock: jest.fn(),
    transferStock: jest.fn(),
    createPurchaseOrder: jest.fn(),
    findAllPurchaseOrders: jest.fn(),
    findPurchaseOrderById: jest.fn(),
    updatePurchaseOrder: jest.fn(),
    deletePurchaseOrder: jest.fn(),
    createSupplier: jest.fn(),
    findAllSuppliers: jest.fn(),
    findSupplierById: jest.fn(),
    updateSupplier: jest.fn(),
    deleteSupplier: jest.fn(),
    getStockReport: jest.fn(),
    getInventoryStatistics: jest.fn(),
    getLowStockAlerts: jest.fn(),
    getExpiryAlerts: jest.fn(),
    getInventoryMovement: jest.fn(),
    searchByBarcode: jest.fn(),
    searchBySku: jest.fn(),
    getCategories: jest.fn(),
    getManufacturers: jest.fn(),
    getSuppliers: jest.fn(),
    getStorageLocations: jest.fn(),
    getInventoryDashboard: jest.fn(),
  };

  const mockUser = {
    id: 'user-123',
    branchId: 'branch-123',
    role: 'DOCTOR',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        {
          provide: InventoryService,
          useValue: mockInventoryService,
        },
      ],
    }).compile();

    controller = module.get<InventoryController>(InventoryController);
    service = module.get<InventoryService>(InventoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createInventoryItem', () => {
    it('should create an inventory item', async () => {
      const createItemDto = {
        name: 'Paracetamol 500mg',
        type: InventoryItemType.MEDICINE,
        costPrice: 10.5,
        sellingPrice: 15.0,
        unit: UnitType.STRIPS,
      };

      const mockItem = {
        id: 'item-123',
        ...createItemDto,
        branchId: 'branch-123',
        currentStock: 0,
      };

      mockInventoryService.createInventoryItem.mockResolvedValue(mockItem);

      const result = await controller.createInventoryItem(createItemDto, { user: mockUser });

      expect(result).toEqual(mockItem);
      expect(mockInventoryService.createInventoryItem).toHaveBeenCalledWith(
        createItemDto,
        'branch-123',
      );
    });
  });

  describe('findAllInventoryItems', () => {
    it('should return paginated inventory items', async () => {
      const query = { page: 1, limit: 20 };
      const mockResult = {
        items: [
          {
            id: 'item-1',
            name: 'Paracetamol',
            type: InventoryItemType.MEDICINE,
            currentStock: 50,
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      mockInventoryService.findAllInventoryItems.mockResolvedValue(mockResult);

      const result = await controller.findAllInventoryItems(query, { user: mockUser });

      expect(result).toEqual(mockResult);
      expect(mockInventoryService.findAllInventoryItems).toHaveBeenCalledWith(
        query,
        'branch-123',
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
      };

      mockInventoryService.findInventoryItemById.mockResolvedValue(mockItem);

      const result = await controller.findInventoryItemById('item-123', { user: mockUser });

      expect(result).toEqual(mockItem);
      expect(mockInventoryService.findInventoryItemById).toHaveBeenCalledWith(
        'item-123',
        'branch-123',
      );
    });
  });

  describe('updateInventoryItem', () => {
    it('should update inventory item', async () => {
      const updateDto = {
        name: 'Updated Paracetamol',
        costPrice: 12.0,
      };

      const mockUpdatedItem = {
        id: 'item-123',
        name: 'Updated Paracetamol',
        costPrice: 12.0,
      };

      mockInventoryService.updateInventoryItem.mockResolvedValue(mockUpdatedItem);

      const result = await controller.updateInventoryItem('item-123', updateDto, { user: mockUser });

      expect(result).toEqual(mockUpdatedItem);
      expect(mockInventoryService.updateInventoryItem).toHaveBeenCalledWith(
        'item-123',
        updateDto,
        'branch-123',
      );
    });
  });

  describe('deleteInventoryItem', () => {
    it('should delete inventory item', async () => {
      const mockResult = { message: 'Inventory item deleted successfully' };

      mockInventoryService.deleteInventoryItem.mockResolvedValue(mockResult);

      const result = await controller.deleteInventoryItem('item-123', { user: mockUser });

      expect(result).toEqual(mockResult);
      expect(mockInventoryService.deleteInventoryItem).toHaveBeenCalledWith(
        'item-123',
        'branch-123',
      );
    });
  });

  describe('createStockTransaction', () => {
    it('should create stock transaction', async () => {
      const createTransactionDto = {
        itemId: 'item-123',
        type: TransactionType.PURCHASE,
        quantity: 20,
        unitPrice: 10.5,
      };

      const mockTransaction = {
        id: 'transaction-123',
        ...createTransactionDto,
        totalAmount: 210.0,
      };

      mockInventoryService.createStockTransaction.mockResolvedValue(mockTransaction);

      const result = await controller.createStockTransaction(createTransactionDto, { user: mockUser });

      expect(result).toEqual(mockTransaction);
      expect(mockInventoryService.createStockTransaction).toHaveBeenCalledWith(
        createTransactionDto,
        'branch-123',
        'user-123',
      );
    });
  });

  describe('findAllStockTransactions', () => {
    it('should return paginated stock transactions', async () => {
      const query = { page: 1, limit: 20 };
      const mockResult = {
        transactions: [
          {
            id: 'transaction-1',
            type: TransactionType.PURCHASE,
            quantity: 50,
            totalAmount: 525.0,
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      mockInventoryService.findAllStockTransactions.mockResolvedValue(mockResult);

      const result = await controller.findAllStockTransactions(query, { user: mockUser });

      expect(result).toEqual(mockResult);
      expect(mockInventoryService.findAllStockTransactions).toHaveBeenCalledWith(
        query,
        'branch-123',
      );
    });
  });

  describe('findStockTransactionById', () => {
    it('should return stock transaction by id', async () => {
      const mockTransaction = {
        id: 'transaction-123',
        type: TransactionType.PURCHASE,
        quantity: 20,
        totalAmount: 210.0,
      };

      mockInventoryService.findStockTransactionById.mockResolvedValue(mockTransaction);

      const result = await controller.findStockTransactionById('transaction-123', { user: mockUser });

      expect(result).toEqual(mockTransaction);
      expect(mockInventoryService.findStockTransactionById).toHaveBeenCalledWith(
        'transaction-123',
        'branch-123',
      );
    });
  });

  describe('updateStockTransaction', () => {
    it('should update stock transaction', async () => {
      const updateDto = {
        quantity: 25,
        unitPrice: 11.0,
      };

      const mockUpdatedTransaction = {
        id: 'transaction-123',
        quantity: 25,
        unitPrice: 11.0,
        totalAmount: 275.0,
      };

      mockInventoryService.updateStockTransaction.mockResolvedValue(mockUpdatedTransaction);

      const result = await controller.updateStockTransaction('transaction-123', updateDto, { user: mockUser });

      expect(result).toEqual(mockUpdatedTransaction);
      expect(mockInventoryService.updateStockTransaction).toHaveBeenCalledWith(
        'transaction-123',
        updateDto,
        'branch-123',
      );
    });
  });

  describe('deleteStockTransaction', () => {
    it('should delete stock transaction', async () => {
      const mockResult = { message: 'Stock transaction deleted successfully' };

      mockInventoryService.deleteStockTransaction.mockResolvedValue(mockResult);

      const result = await controller.deleteStockTransaction('transaction-123', { user: mockUser });

      expect(result).toEqual(mockResult);
      expect(mockInventoryService.deleteStockTransaction).toHaveBeenCalledWith(
        'transaction-123',
        'branch-123',
      );
    });
  });

  describe('bulkStockUpdate', () => {
    it('should perform bulk stock update', async () => {
      const bulkUpdateDto = {
        transactions: [
          {
            itemId: 'item-1',
            type: TransactionType.PURCHASE,
            quantity: 50,
            unitPrice: 10.5,
          },
          {
            itemId: 'item-2',
            type: TransactionType.SALE,
            quantity: 20,
            unitPrice: 15.0,
          },
        ],
      };

      const mockResult = {
        total: 2,
        successful: 2,
        failed: 0,
        results: [
          { success: true, data: { id: 'transaction-1' } },
          { success: true, data: { id: 'transaction-2' } },
        ],
      };

      mockInventoryService.bulkStockUpdate.mockResolvedValue(mockResult);

      const result = await controller.bulkStockUpdate(bulkUpdateDto, { user: mockUser });

      expect(result).toEqual(mockResult);
      expect(mockInventoryService.bulkStockUpdate).toHaveBeenCalledWith(
        bulkUpdateDto,
        'branch-123',
        'user-123',
      );
    });
  });

  describe('adjustStock', () => {
    it('should adjust stock', async () => {
      const adjustmentDto = {
        itemId: 'item-123',
        adjustmentQuantity: 10,
        reason: 'Stock adjustment',
      };

      const mockTransaction = {
        id: 'transaction-123',
        type: TransactionType.ADJUSTMENT,
        quantity: 10,
        reason: 'Stock adjustment',
      };

      mockInventoryService.adjustStock.mockResolvedValue(mockTransaction);

      const result = await controller.adjustStock(adjustmentDto, { user: mockUser });

      expect(result).toEqual(mockTransaction);
      expect(mockInventoryService.adjustStock).toHaveBeenCalledWith(
        adjustmentDto,
        'branch-123',
        'user-123',
      );
    });
  });

  describe('transferStock', () => {
    it('should transfer stock', async () => {
      const transferDto = {
        itemId: 'item-123',
        quantity: 10,
        fromLocation: 'Store A',
        toLocation: 'Store B',
      };

      const mockResult = {
        outboundTransaction: {
          id: 'outbound-123',
          type: TransactionType.TRANSFER,
          location: 'Store A',
        },
        inboundTransaction: {
          id: 'inbound-123',
          type: TransactionType.TRANSFER,
          location: 'Store B',
        },
      };

      mockInventoryService.transferStock.mockResolvedValue(mockResult);

      const result = await controller.transferStock(transferDto, { user: mockUser });

      expect(result).toEqual(mockResult);
      expect(mockInventoryService.transferStock).toHaveBeenCalledWith(
        transferDto,
        'branch-123',
        'user-123',
      );
    });
  });

  describe('createPurchaseOrder', () => {
    it('should create purchase order', async () => {
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
        supplier: 'ABC Pharma',
        status: 'PENDING',
        totalAmount: 1050.0,
      };

      mockInventoryService.createPurchaseOrder.mockResolvedValue(mockOrder);

      const result = await controller.createPurchaseOrder(createOrderDto, { user: mockUser });

      expect(result).toEqual(mockOrder);
      expect(mockInventoryService.createPurchaseOrder).toHaveBeenCalledWith(
        createOrderDto,
        'branch-123',
        'user-123',
      );
    });
  });

  describe('findAllPurchaseOrders', () => {
    it('should return paginated purchase orders', async () => {
      const query = { page: 1, limit: 20 };
      const mockResult = {
        orders: [
          {
            id: 'order-1',
            supplier: 'ABC Pharma',
            status: 'PENDING',
            totalAmount: 1050.0,
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      mockInventoryService.findAllPurchaseOrders.mockResolvedValue(mockResult);

      const result = await controller.findAllPurchaseOrders(query, { user: mockUser });

      expect(result).toEqual(mockResult);
      expect(mockInventoryService.findAllPurchaseOrders).toHaveBeenCalledWith(
        query,
        'branch-123',
      );
    });
  });

  describe('findPurchaseOrderById', () => {
    it('should return purchase order by id', async () => {
      const mockOrder = {
        id: 'order-123',
        supplier: 'ABC Pharma',
        status: 'PENDING',
        totalAmount: 1050.0,
      };

      mockInventoryService.findPurchaseOrderById.mockResolvedValue(mockOrder);

      const result = await controller.findPurchaseOrderById('order-123', { user: mockUser });

      expect(result).toEqual(mockOrder);
      expect(mockInventoryService.findPurchaseOrderById).toHaveBeenCalledWith(
        'order-123',
        'branch-123',
      );
    });
  });

  describe('updatePurchaseOrder', () => {
    it('should update purchase order', async () => {
      const updateDto = {
        status: 'DELIVERED',
        notes: 'Order delivered successfully',
      };

      const mockUpdatedOrder = {
        id: 'order-123',
        status: 'DELIVERED',
        notes: 'Order delivered successfully',
      };

      mockInventoryService.updatePurchaseOrder.mockResolvedValue(mockUpdatedOrder);

      const result = await controller.updatePurchaseOrder('order-123', updateDto, { user: mockUser });

      expect(result).toEqual(mockUpdatedOrder);
      expect(mockInventoryService.updatePurchaseOrder).toHaveBeenCalledWith(
        'order-123',
        updateDto,
        'branch-123',
      );
    });
  });

  describe('deletePurchaseOrder', () => {
    it('should delete purchase order', async () => {
      const mockResult = { message: 'Purchase order deleted successfully' };

      mockInventoryService.deletePurchaseOrder.mockResolvedValue(mockResult);

      const result = await controller.deletePurchaseOrder('order-123', { user: mockUser });

      expect(result).toEqual(mockResult);
      expect(mockInventoryService.deletePurchaseOrder).toHaveBeenCalledWith(
        'order-123',
        'branch-123',
      );
    });
  });

  describe('createSupplier', () => {
    it('should create supplier', async () => {
      const createSupplierDto = {
        name: 'ABC Pharma',
        contactPerson: 'John Doe',
        email: 'john@abcpharma.com',
        phone: '+91-9876543210',
      };

      const mockSupplier = {
        id: 'supplier-123',
        ...createSupplierDto,
        isActive: true,
      };

      mockInventoryService.createSupplier.mockResolvedValue(mockSupplier);

      const result = await controller.createSupplier(createSupplierDto, { user: mockUser });

      expect(result).toEqual(mockSupplier);
      expect(mockInventoryService.createSupplier).toHaveBeenCalledWith(
        createSupplierDto,
        'branch-123',
      );
    });
  });

  describe('findAllSuppliers', () => {
    it('should return paginated suppliers', async () => {
      const query = { page: 1, limit: 20 };
      const mockResult = {
        suppliers: [
          {
            id: 'supplier-1',
            name: 'ABC Pharma',
            contactPerson: 'John Doe',
            isActive: true,
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      mockInventoryService.findAllSuppliers.mockResolvedValue(mockResult);

      const result = await controller.findAllSuppliers(query, { user: mockUser });

      expect(result).toEqual(mockResult);
      expect(mockInventoryService.findAllSuppliers).toHaveBeenCalledWith(
        query,
        'branch-123',
      );
    });
  });

  describe('findSupplierById', () => {
    it('should return supplier by id', async () => {
      const mockSupplier = {
        id: 'supplier-123',
        name: 'ABC Pharma',
        contactPerson: 'John Doe',
        isActive: true,
      };

      mockInventoryService.findSupplierById.mockResolvedValue(mockSupplier);

      const result = await controller.findSupplierById('supplier-123', { user: mockUser });

      expect(result).toEqual(mockSupplier);
      expect(mockInventoryService.findSupplierById).toHaveBeenCalledWith(
        'supplier-123',
        'branch-123',
      );
    });
  });

  describe('updateSupplier', () => {
    it('should update supplier', async () => {
      const updateDto = {
        contactPerson: 'Jane Doe',
        email: 'jane@abcpharma.com',
      };

      const mockUpdatedSupplier = {
        id: 'supplier-123',
        name: 'ABC Pharma',
        contactPerson: 'Jane Doe',
        email: 'jane@abcpharma.com',
      };

      mockInventoryService.updateSupplier.mockResolvedValue(mockUpdatedSupplier);

      const result = await controller.updateSupplier('supplier-123', updateDto, { user: mockUser });

      expect(result).toEqual(mockUpdatedSupplier);
      expect(mockInventoryService.updateSupplier).toHaveBeenCalledWith(
        'supplier-123',
        updateDto,
        'branch-123',
      );
    });
  });

  describe('deleteSupplier', () => {
    it('should delete supplier', async () => {
      const mockResult = { message: 'Supplier deleted successfully' };

      mockInventoryService.deleteSupplier.mockResolvedValue(mockResult);

      const result = await controller.deleteSupplier('supplier-123', { user: mockUser });

      expect(result).toEqual(mockResult);
      expect(mockInventoryService.deleteSupplier).toHaveBeenCalledWith(
        'supplier-123',
        'branch-123',
      );
    });
  });

  describe('getStockReport', () => {
    it('should return stock report', async () => {
      const query = { type: InventoryItemType.MEDICINE };
      const mockReport = {
        items: [
          {
            id: 'item-1',
            name: 'Paracetamol',
            currentStock: 50,
            costPrice: 10.5,
          },
        ],
        summary: {
          totalItems: 1,
          totalValue: 525.0,
          lowStockItems: 0,
          expiredItems: 0,
        },
      };

      mockInventoryService.getStockReport.mockResolvedValue(mockReport);

      const result = await controller.getStockReport(query, { user: mockUser });

      expect(result).toEqual(mockReport);
      expect(mockInventoryService.getStockReport).toHaveBeenCalledWith(
        query,
        'branch-123',
      );
    });
  });

  describe('getInventoryStatistics', () => {
    it('should return inventory statistics', async () => {
      const query = { startDate: '2024-01-01', endDate: '2024-12-31' };
      const mockStats = {
        totalItems: 100,
        totalValue: 5000,
        lowStockCount: 15,
        expiredCount: 5,
        typeBreakdown: [
          { type: InventoryItemType.MEDICINE, _count: { id: 60 } },
          { type: InventoryItemType.EQUIPMENT, _count: { id: 40 } },
        ],
      };

      mockInventoryService.getInventoryStatistics.mockResolvedValue(mockStats);

      const result = await controller.getInventoryStatistics(query, { user: mockUser });

      expect(result).toEqual(mockStats);
      expect(mockInventoryService.getInventoryStatistics).toHaveBeenCalledWith(
        query,
        'branch-123',
      );
    });
  });

  describe('getLowStockAlerts', () => {
    it('should return low stock alerts', async () => {
      const query = { thresholdPercentage: 20 };
      const mockAlerts = [
        {
          id: 'item-1',
          name: 'Paracetamol',
          currentStock: 5,
          reorderLevel: 10,
        },
      ];

      mockInventoryService.getLowStockAlerts.mockResolvedValue(mockAlerts);

      const result = await controller.getLowStockAlerts(query, { user: mockUser });

      expect(result).toEqual(mockAlerts);
      expect(mockInventoryService.getLowStockAlerts).toHaveBeenCalledWith(
        query,
        'branch-123',
      );
    });
  });

  describe('getExpiryAlerts', () => {
    it('should return expiry alerts', async () => {
      const query = { daysBeforeExpiry: 30 };
      const mockAlerts = [
        {
          id: 'item-1',
          name: 'Paracetamol',
          expiryDate: new Date('2024-12-31'),
        },
      ];

      mockInventoryService.getExpiryAlerts.mockResolvedValue(mockAlerts);

      const result = await controller.getExpiryAlerts(query, { user: mockUser });

      expect(result).toEqual(mockAlerts);
      expect(mockInventoryService.getExpiryAlerts).toHaveBeenCalledWith(
        query,
        'branch-123',
      );
    });
  });

  describe('getInventoryMovement', () => {
    it('should return inventory movement', async () => {
      const query = { itemId: 'item-123', dateFrom: '2024-01-01' };
      const mockMovement = [
        {
          id: 'transaction-1',
          type: TransactionType.PURCHASE,
          quantity: 50,
          createdAt: new Date(),
        },
      ];

      mockInventoryService.getInventoryMovement.mockResolvedValue(mockMovement);

      const result = await controller.getInventoryMovement(query, { user: mockUser });

      expect(result).toEqual(mockMovement);
      expect(mockInventoryService.getInventoryMovement).toHaveBeenCalledWith(
        query,
        'branch-123',
      );
    });
  });

  describe('searchByBarcode', () => {
    it('should search item by barcode', async () => {
      const query = { barcode: '123456789' };
      const mockItem = {
        id: 'item-123',
        name: 'Paracetamol',
        barcode: '123456789',
      };

      mockInventoryService.searchByBarcode.mockResolvedValue(mockItem);

      const result = await controller.searchByBarcode(query, { user: mockUser });

      expect(result).toEqual(mockItem);
      expect(mockInventoryService.searchByBarcode).toHaveBeenCalledWith(
        query,
        'branch-123',
      );
    });
  });

  describe('searchBySku', () => {
    it('should search item by SKU', async () => {
      const query = { sku: 'PAR-500' };
      const mockItem = {
        id: 'item-123',
        name: 'Paracetamol',
        sku: 'PAR-500',
      };

      mockInventoryService.searchBySku.mockResolvedValue(mockItem);

      const result = await controller.searchBySku(query, { user: mockUser });

      expect(result).toEqual(mockItem);
      expect(mockInventoryService.searchBySku).toHaveBeenCalledWith(
        query,
        'branch-123',
      );
    });
  });

  describe('getCategories', () => {
    it('should return categories', async () => {
      const mockCategories = ['Pain Relief', 'Antibiotics', 'Vitamins'];

      mockInventoryService.getCategories.mockResolvedValue(mockCategories);

      const result = await controller.getCategories({ user: mockUser });

      expect(result).toEqual(mockCategories);
      expect(mockInventoryService.getCategories).toHaveBeenCalledWith('branch-123');
    });
  });

  describe('getManufacturers', () => {
    it('should return manufacturers', async () => {
      const mockManufacturers = ['ABC Pharma', 'XYZ Labs', 'DEF Medical'];

      mockInventoryService.getManufacturers.mockResolvedValue(mockManufacturers);

      const result = await controller.getManufacturers({ user: mockUser });

      expect(result).toEqual(mockManufacturers);
      expect(mockInventoryService.getManufacturers).toHaveBeenCalledWith('branch-123');
    });
  });

  describe('getSuppliers', () => {
    it('should return suppliers', async () => {
      const mockSuppliers = [
        { id: 'supplier-1', name: 'ABC Pharma' },
        { id: 'supplier-2', name: 'XYZ Labs' },
      ];

      mockInventoryService.getSuppliers.mockResolvedValue(mockSuppliers);

      const result = await controller.getSuppliers({ user: mockUser });

      expect(result).toEqual(mockSuppliers);
      expect(mockInventoryService.getSuppliers).toHaveBeenCalledWith('branch-123');
    });
  });

  describe('getStorageLocations', () => {
    it('should return storage locations', async () => {
      const mockLocations = ['Store A', 'Store B', 'Cold Storage'];

      mockInventoryService.getStorageLocations.mockResolvedValue(mockLocations);

      const result = await controller.getStorageLocations({ user: mockUser });

      expect(result).toEqual(mockLocations);
      expect(mockInventoryService.getStorageLocations).toHaveBeenCalledWith('branch-123');
    });
  });

  describe('getInventoryDashboard', () => {
    it('should return inventory dashboard', async () => {
      const mockDashboard = {
        summary: {
          totalItems: 100,
          totalValue: 5000,
          lowStockCount: 15,
          expiredCount: 5,
        },
        recentTransactions: [
          {
            id: 'transaction-1',
            type: TransactionType.PURCHASE,
            quantity: 50,
          },
        ],
        topMovingItems: [
          { itemId: 'item-1', _sum: { quantity: 100 } },
        ],
      };

      mockInventoryService.getInventoryDashboard.mockResolvedValue(mockDashboard);

      const result = await controller.getInventoryDashboard({ user: mockUser });

      expect(result).toEqual(mockDashboard);
      expect(mockInventoryService.getInventoryDashboard).toHaveBeenCalledWith('branch-123');
    });
  });
});
