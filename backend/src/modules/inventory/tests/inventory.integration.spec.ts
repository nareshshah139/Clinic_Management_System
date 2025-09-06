import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InventoryModule } from '../inventory.module';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import {
  InventoryItemType,
  InventoryStatus,
  StockStatus,
  TransactionType,
  UnitType,
} from '../dto/inventory.dto';

describe('InventoryController (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const mockUser = {
    id: 'user-123',
    branchId: 'branch-123',
    role: 'DOCTOR',
  };

  const mockAuthGuard = {
    canActivate: jest.fn(() => true),
  };

  // Mock PrismaService
  const mockPrismaService = {
    onModuleInit: jest.fn(),
    $connect: jest.fn(),
    enableShutdownHooks: jest.fn(),
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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [InventoryModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideGuard(JwtAuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());    prisma = moduleFixture.get<PrismaService>(PrismaService);

    // Mock request user
    app.use((req, res, next) => {
      req.user = mockUser;
      next();
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('/inventory/items (POST)', () => {
    it('should create a new inventory item', async () => {
      const createItemDto = {
        name: 'Paracetamol 500mg',
        description: 'Pain relief medicine',
        type: InventoryItemType.MEDICINE,
        costPrice: 10.5,
        sellingPrice: 15.0,
        unit: UnitType.STRIPS,
        minStockLevel: 10,
        reorderLevel: 5,
        category: 'Pain Relief',
        manufacturer: 'ABC Pharma',
        supplier: 'XYZ Distributors',
        barcode: '123456789',
        sku: 'PAR-500',
        hsnCode: '30049099',
        gstRate: 12,
        requiresPrescription: false,
        isControlled: false,
        storageLocation: 'Store A',
        tags: ['pain', 'fever'],
      };

      const mockItem = {
        id: 'item-123',
        ...createItemDto,
        branchId: 'branch-123',
        currentStock: 0,
        stockStatus: StockStatus.OUT_OF_STOCK,
        status: InventoryStatus.ACTIVE,
        tags: JSON.stringify(createItemDto.tags),
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.inventoryItem.findFirst.mockResolvedValue(null);
      mockPrismaService.inventoryItem.create.mockResolvedValue(mockItem);

      const response = await request(app.getHttpServer())
        .post('/inventory/items')
        .send(createItemDto)
        .expect(201);

      expect(response.body).toMatchObject({
        id: 'item-123',
        name: 'Paracetamol 500mg',
        type: InventoryItemType.MEDICINE,
        costPrice: 10.5,
        sellingPrice: 15.0,
        currentStock: 0,
        stockStatus: StockStatus.OUT_OF_STOCK,
      });
      expect(response.body.tags).toEqual(createItemDto.tags);
    });

    it('should return 409 for duplicate SKU', async () => {
      const createItemDto = {
        name: 'Paracetamol 500mg',
        sku: 'PAR-500',
        type: InventoryItemType.MEDICINE,
        costPrice: 10.5,
        sellingPrice: 15.0,
        unit: UnitType.STRIPS,
      };

      mockPrismaService.inventoryItem.findFirst.mockResolvedValue({ id: 'existing-item' });

      await request(app.getHttpServer())
        .post('/inventory/items')
        .send(createItemDto)
        .expect(409);
    });

    it('should return 400 for invalid data', async () => {
      const createItemDto = {
        name: '', // Invalid empty name
        type: InventoryItemType.MEDICINE,
        costPrice: -10, // Invalid negative price
        sellingPrice: 15.0,
        unit: UnitType.STRIPS,
      };

      await request(app.getHttpServer())
        .post('/inventory/items')
        .send(createItemDto)
        .expect(400);
    });
  });

  describe('/inventory/items (GET)', () => {
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

      mockPrismaService.inventoryItem.findMany.mockResolvedValue(mockItems);
      mockPrismaService.inventoryItem.count.mockResolvedValue(2);

      const response = await request(app.getHttpServer())
        .get('/inventory/items')
        .query({ page: 1, limit: 20 })
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.items).toHaveLength(2);
      expect(response.body.pagination.total).toBe(2);
    });

    it('should filter items by type', async () => {
      const mockItems = [
        {
          id: 'item-1',
          name: 'Paracetamol',
          type: InventoryItemType.MEDICINE,
          currentStock: 50,
          tags: null,
          metadata: null,
        },
      ];

      mockPrismaService.inventoryItem.findMany.mockResolvedValue(mockItems);
      mockPrismaService.inventoryItem.count.mockResolvedValue(1);

      await request(app.getHttpServer())
        .get('/inventory/items')
        .query({ type: InventoryItemType.MEDICINE })
        .expect(200);

      expect(mockPrismaService.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: InventoryItemType.MEDICINE,
          }),
        }),
      );
    });

    it('should search items by name', async () => {
      mockPrismaService.inventoryItem.findMany.mockResolvedValue([]);
      mockPrismaService.inventoryItem.count.mockResolvedValue(0);

      await request(app.getHttpServer())
        .get('/inventory/items')
        .query({ search: 'paracetamol' })
        .expect(200);

      expect(mockPrismaService.inventoryItem.findMany).toHaveBeenCalledWith(
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

  describe('/inventory/items/:id (GET)', () => {
    it('should return inventory item by id', async () => {
      const mockItem = {
        id: 'item-123',
        name: 'Paracetamol',
        type: InventoryItemType.MEDICINE,
        currentStock: 50,
        costPrice: 10.5,
        sellingPrice: 15.0,
        tags: null,
        metadata: null,
      };

      mockPrismaService.inventoryItem.findFirst.mockResolvedValue(mockItem);

      const response = await request(app.getHttpServer())
        .get('/inventory/items/item-123')
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'item-123',
        name: 'Paracetamol',
        type: InventoryItemType.MEDICINE,
        currentStock: 50,
      });
    });

    it('should return 404 for non-existent item', async () => {
      mockPrismaService.inventoryItem.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/inventory/items/non-existent')
        .expect(404);
    });
  });

  describe('/inventory/items/:id (PATCH)', () => {
    it('should update inventory item', async () => {
      const updateDto = {
        name: 'Updated Paracetamol',
        costPrice: 12.0,
        sellingPrice: 18.0,
      };

      const existingItem = {
        id: 'item-123',
        name: 'Paracetamol',
        sku: 'PAR-500',
        barcode: '123456789',
        tags: null,
      };

      const updatedItem = {
        ...existingItem,
        ...updateDto,
      };

      mockPrismaService.inventoryItem.findFirst.mockResolvedValue(existingItem);
      mockPrismaService.inventoryItem.update.mockResolvedValue(updatedItem);

      const response = await request(app.getHttpServer())
        .patch('/inventory/items/item-123')
        .send(updateDto)
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'item-123',
        name: 'Updated Paracetamol',
        costPrice: 12.0,
        sellingPrice: 18.0,
      });
    });
  });

  describe('/inventory/items/:id (DELETE)', () => {
    it('should delete inventory item', async () => {
      const mockItem = { id: 'item-123' };
      mockPrismaService.inventoryItem.findFirst.mockResolvedValue(mockItem);
      mockPrismaService.stockTransaction.count.mockResolvedValue(0);
      mockPrismaService.inventoryItem.delete.mockResolvedValue(mockItem);

      const response = await request(app.getHttpServer())
        .delete('/inventory/items/item-123')
        .expect(200);

      expect(response.body).toEqual({ message: 'Inventory item deleted successfully' });
    });

    it('should return 400 if item has transactions', async () => {
      const mockItem = { id: 'item-123' };
      mockPrismaService.inventoryItem.findFirst.mockResolvedValue(mockItem);
      mockPrismaService.stockTransaction.count.mockResolvedValue(5);

      await request(app.getHttpServer())
        .delete('/inventory/items/item-123')
        .expect(400);
    });
  });

  describe('/inventory/transactions (POST)', () => {
    it('should create stock transaction', async () => {
      const createTransactionDto = {
        itemId: '550e8400-e29b-41d4-a716-446655440000',
        type: TransactionType.PURCHASE,
        quantity: 20,
        unitPrice: 10.5,
        reference: 'PO-001',
        notes: 'Purchase from supplier',
        batchNumber: 'BATCH-001',
        supplier: 'ABC Pharma',
      };

      const mockItem = {
        id: 'item-123',
        costPrice: 10.5,
        currentStock: 50,
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

      mockPrismaService.inventoryItem.findFirst.mockResolvedValue(mockItem);
      mockPrismaService.stockTransaction.create.mockResolvedValue(mockTransaction);
      mockPrismaService.inventoryItem.update.mockResolvedValue({});

      const response = await request(app.getHttpServer())
        .post('/inventory/transactions')
        .send(createTransactionDto)
        .expect(201);

      expect(response.body).toMatchObject({
        id: 'transaction-123',
        itemId: '550e8400-e29b-41d4-a716-446655440000',
        type: TransactionType.PURCHASE,
        quantity: 20,
        totalAmount: 210.0,
      });
    });

    it('should return 404 for non-existent item', async () => {
      const createTransactionDto = {
        itemId: '550e8400-e29b-41d4-a716-446655440001',
        type: TransactionType.PURCHASE,
        quantity: 20,
      };

      mockPrismaService.inventoryItem.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/inventory/transactions')
        .send(createTransactionDto)
        .expect(404);
    });
  });

  describe('/inventory/transactions (GET)', () => {
    it('should return paginated stock transactions', async () => {
      const mockTransactions = [
        {
          id: 'transaction-1',
          type: TransactionType.PURCHASE,
          quantity: 50,
          totalAmount: 525.0,
          createdAt: new Date(),
          item: { id: 'item-1', name: 'Paracetamol' },
          user: { id: 'user-1', name: 'John Doe' },
        },
        {
          id: 'transaction-2',
          type: TransactionType.SALE,
          quantity: 20,
          totalAmount: 300.0,
          createdAt: new Date(),
          item: { id: 'item-2', name: 'Syringe' },
          user: { id: 'user-1', name: 'John Doe' },
        },
      ];

      mockPrismaService.stockTransaction.findMany.mockResolvedValue(mockTransactions);
      mockPrismaService.stockTransaction.count.mockResolvedValue(2);

      const response = await request(app.getHttpServer())
        .get('/inventory/transactions')
        .query({ page: 1, limit: 20 })
        .expect(200);

      expect(response.body).toHaveProperty('transactions');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.transactions).toHaveLength(2);
      expect(response.body.pagination.total).toBe(2);
    });

    it('should filter transactions by type', async () => {
      mockPrismaService.stockTransaction.findMany.mockResolvedValue([]);
      mockPrismaService.stockTransaction.count.mockResolvedValue(0);

      await request(app.getHttpServer())
        .get('/inventory/transactions')
        .query({ type: TransactionType.PURCHASE })
        .expect(200);

      expect(mockPrismaService.stockTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: TransactionType.PURCHASE,
          }),
        }),
      );
    });
  });

  describe('/inventory/adjustments (POST)', () => {
    it('should adjust stock', async () => {
      const adjustmentDto = {
        itemId: '550e8400-e29b-41d4-a716-446655440000',
        adjustmentQuantity: 10,
        reason: 'Stock adjustment',
        notes: 'Found extra stock during audit',
      };

      const mockItem = {
        id: 'item-123',
        costPrice: 10.5,
        currentStock: 50,
      };

      const mockTransaction = {
        id: 'transaction-123',
        itemId: '550e8400-e29b-41d4-a716-446655440000',
        type: TransactionType.ADJUSTMENT,
        quantity: 10,
        reason: 'Stock adjustment',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.inventoryItem.findFirst.mockResolvedValue(mockItem);
      mockPrismaService.stockTransaction.create.mockResolvedValue(mockTransaction);
      mockPrismaService.inventoryItem.update.mockResolvedValue({});

      const response = await request(app.getHttpServer())
        .post('/inventory/adjustments')
        .send(adjustmentDto)
        .expect(201);

      expect(response.body).toMatchObject({
        id: 'transaction-123',
        itemId: '550e8400-e29b-41d4-a716-446655440000',
        type: TransactionType.ADJUSTMENT,
        quantity: 10,
        reason: 'Stock adjustment',
      });
    });
  });

  describe('/inventory/transfers (POST)', () => {
    it('should transfer stock', async () => {
      const transferDto = {
        itemId: '550e8400-e29b-41d4-a716-446655440000',
        quantity: 10,
        fromLocation: 'Store A',
        toLocation: 'Store B',
        notes: 'Transfer between stores',
      };

      const mockItem = {
        id: 'item-123',
        costPrice: 10.5,
        currentStock: 50,
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

      mockPrismaService.inventoryItem.findFirst.mockResolvedValue(mockItem);
      mockPrismaService.stockTransaction.create
        .mockResolvedValueOnce(mockOutboundTransaction)
        .mockResolvedValueOnce(mockInboundTransaction);
      mockPrismaService.inventoryItem.update.mockResolvedValue({});

      const response = await request(app.getHttpServer())
        .post('/inventory/transfers')
        .send(transferDto)
        .expect(201);

      expect(response.body).toHaveProperty('outboundTransaction');
      expect(response.body).toHaveProperty('inboundTransaction');
      expect(response.body.outboundTransaction.location).toBe('Store A');
      expect(response.body.inboundTransaction.location).toBe('Store B');
    });

    it('should return 400 for insufficient stock', async () => {
      const transferDto = {
        itemId: '550e8400-e29b-41d4-a716-446655440000',
        quantity: 100,
        fromLocation: 'Store A',
        toLocation: 'Store B',
      };

      const mockItem = {
        id: 'item-123',
        currentStock: 50,
      };

      mockPrismaService.inventoryItem.findFirst.mockResolvedValue(mockItem);

      await request(app.getHttpServer())
        .post('/inventory/transfers')
        .send(transferDto)
        .expect(400);
    });
  });

  describe('/inventory/purchase-orders (POST)', () => {
    it('should create purchase order', async () => {
      const createOrderDto = {
        supplier: 'ABC Pharma',
        orderDate: '2024-12-25',
        expectedDeliveryDate: '2024-12-30',
        notes: 'Urgent order',
        items: [
          {
            itemId: '550e8400-e29b-41d4-a716-446655440000',
            quantity: 100,
            unitPrice: 10.5,
            discount: 5,
            tax: 12,
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

      mockPrismaService.purchaseOrder.create.mockResolvedValue(mockOrder);

      const response = await request(app.getHttpServer())
        .post('/inventory/purchase-orders')
        .send(createOrderDto)
        .expect(201);

      expect(response.body).toMatchObject({
        id: 'order-123',
        supplier: 'ABC Pharma',
        status: 'PENDING',
        totalAmount: 1050.0,
      });
      expect(response.body.items).toEqual(createOrderDto.items);
    });
  });

  describe('/inventory/suppliers (POST)', () => {
    it('should create supplier', async () => {
      const createSupplierDto = {
        name: 'ABC Pharma',
        contactPerson: 'John Doe',
        email: 'john@abcpharma.com',
        phone: '+91-9876543210',
        address: '123 Pharma Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        gstNumber: '27ABCDE1234F1Z5',
        panNumber: 'ABCDE1234F',
        paymentTerms: 'Net 30',
        notes: 'Reliable supplier',
      };

      const mockSupplier = {
        id: 'supplier-123',
        ...createSupplierDto,
        branchId: 'branch-123',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.supplier.create.mockResolvedValue(mockSupplier);

      const response = await request(app.getHttpServer())
        .post('/inventory/suppliers')
        .send(createSupplierDto)
        .expect(201);

      expect(response.body).toMatchObject({
        id: 'supplier-123',
        name: 'ABC Pharma',
        contactPerson: 'John Doe',
        email: 'john@abcpharma.com',
        phone: '+91-9876543210',
        isActive: true,
      });
    });
  });

  describe('/inventory/reports/stock (GET)', () => {
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

      mockPrismaService.inventoryItem.findMany.mockResolvedValue(mockItems);

      const response = await request(app.getHttpServer())
        .get('/inventory/reports/stock')
        .query({ type: InventoryItemType.MEDICINE })
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('summary');
      expect(response.body.summary.totalItems).toBe(2);
      expect(response.body.summary.totalValue).toBe(550); // (50 * 10.5) + (5 * 5.0)
    });
  });

  describe('/inventory/statistics (GET)', () => {
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
        ],
        locationBreakdown: [
          { storageLocation: 'Store A', _count: { id: 50 }, _sum: { currentStock: 2500 } },
        ],
      };

      mockPrismaService.inventoryItem.count.mockResolvedValue(100);
      mockPrismaService.inventoryItem.aggregate.mockResolvedValue({ _sum: { currentStock: 5000 } });
      mockPrismaService.inventoryItem.groupBy
        .mockResolvedValueOnce(mockStats.typeBreakdown)
        .mockResolvedValueOnce(mockStats.categoryBreakdown)
        .mockResolvedValueOnce(mockStats.locationBreakdown);

      const response = await request(app.getHttpServer())
        .get('/inventory/statistics')
        .query({ startDate: '2024-01-01', endDate: '2024-12-31' })
        .expect(200);

      expect(response.body).toMatchObject({
        totalItems: 100,
        totalValue: 5000,
        typeBreakdown: mockStats.typeBreakdown,
        categoryBreakdown: mockStats.categoryBreakdown,
        locationBreakdown: mockStats.locationBreakdown,
      });
    });
  });

  describe('/inventory/alerts/low-stock (GET)', () => {
    it('should return low stock alerts', async () => {
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

      mockPrismaService.inventoryItem.findMany.mockResolvedValue(mockItems);

      const response = await request(app.getHttpServer())
        .get('/inventory/alerts/low-stock')
        .query({ thresholdPercentage: 20 })
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].name).toBe('Paracetamol');
      expect(response.body[1].name).toBe('Syringe');
    });
  });

  describe('/inventory/alerts/expiry (GET)', () => {
    it('should return expiry alerts', async () => {
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

      mockPrismaService.inventoryItem.findMany.mockResolvedValue(mockItems);

      const response = await request(app.getHttpServer())
        .get('/inventory/alerts/expiry')
        .query({ daysBeforeExpiry: 30 })
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].name).toBe('Paracetamol');
      expect(response.body[1].name).toBe('Antibiotic');
    });
  });

  describe('/inventory/search/barcode (GET)', () => {
    it('should search item by barcode', async () => {
      const mockItem = {
        id: 'item-123',
        name: 'Paracetamol',
        barcode: '123456789',
        tags: null,
        metadata: null,
      };

      mockPrismaService.inventoryItem.findFirst.mockResolvedValue(mockItem);

      const response = await request(app.getHttpServer())
        .get('/inventory/search/barcode')
        .query({ barcode: '123456789' })
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'item-123',
        name: 'Paracetamol',
        barcode: '123456789',
      });
    });

    it('should return 404 for non-existent barcode', async () => {
      mockPrismaService.inventoryItem.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/inventory/search/barcode')
        .query({ barcode: 'non-existent' })
        .expect(404);
    });
  });

  describe('/inventory/search/sku (GET)', () => {
    it('should search item by SKU', async () => {
      const mockItem = {
        id: 'item-123',
        name: 'Paracetamol',
        sku: 'PAR-500',
        tags: null,
        metadata: null,
      };

      mockPrismaService.inventoryItem.findFirst.mockResolvedValue(mockItem);

      const response = await request(app.getHttpServer())
        .get('/inventory/search/sku')
        .query({ sku: 'PAR-500' })
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'item-123',
        name: 'Paracetamol',
        sku: 'PAR-500',
      });
    });
  });

  describe('/inventory/categories (GET)', () => {
    it('should return categories', async () => {
      const mockCategories = ['Pain Relief', 'Antibiotics', 'Vitamins'];

      mockPrismaService.inventoryItem.findMany.mockResolvedValue(
        mockCategories.map(cat => ({ category: cat }))
      );

      const response = await request(app.getHttpServer())
        .get('/inventory/categories')
        .expect(200);

      expect(response.body).toEqual(mockCategories);
    });
  });

  describe('/inventory/manufacturers (GET)', () => {
    it('should return manufacturers', async () => {
      const mockManufacturers = ['ABC Pharma', 'XYZ Labs', 'DEF Medical'];

      mockPrismaService.inventoryItem.findMany.mockResolvedValue(
        mockManufacturers.map(man => ({ manufacturer: man }))
      );

      const response = await request(app.getHttpServer())
        .get('/inventory/manufacturers')
        .expect(200);

      expect(response.body).toEqual(mockManufacturers);
    });
  });

  describe('/inventory/suppliers (GET)', () => {
    it('should return suppliers', async () => {
      const mockSuppliers = [
        { id: 'supplier-1', name: 'ABC Pharma' },
        { id: 'supplier-2', name: 'XYZ Labs' },
      ];

      mockPrismaService.supplier.findMany.mockResolvedValue(mockSuppliers);

      const response = await request(app.getHttpServer())
        .get('/inventory/suppliers')
        .expect(200);

      expect(response.body.suppliers).toEqual(mockSuppliers);
    });
  });

  describe('/inventory/storage-locations (GET)', () => {
    it('should return storage locations', async () => {
      const mockLocations = ['Store A', 'Store B', 'Cold Storage'];

      mockPrismaService.inventoryItem.findMany.mockResolvedValue(
        mockLocations.map(loc => ({ storageLocation: loc }))
      );

      const response = await request(app.getHttpServer())
        .get('/inventory/storage-locations')
        .expect(200);

      expect(response.body).toEqual(mockLocations);
    });
  });

  describe('/inventory/dashboard (GET)', () => {
    it('should return inventory dashboard', async () => {
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

      mockPrismaService.inventoryItem.count.mockResolvedValue(100);
      mockPrismaService.inventoryItem.aggregate.mockResolvedValue({ _sum: { currentStock: 5000 } });
      mockPrismaService.stockTransaction.findMany.mockResolvedValue(mockDashboard.recentTransactions);
      mockPrismaService.stockTransaction.groupBy.mockResolvedValue(mockDashboard.topMovingItems);

      const response = await request(app.getHttpServer())
        .get('/inventory/dashboard')
        .expect(200);

      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('recentTransactions');
      expect(response.body).toHaveProperty('topMovingItems');
      expect(response.body.summary.totalItems).toBe(100);
      expect(response.body.summary.totalValue).toBe(5000);
    });
  });
});
