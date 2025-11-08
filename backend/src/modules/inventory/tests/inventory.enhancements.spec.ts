import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from '../inventory.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ConflictException } from '@nestjs/common';
import {
  InventoryItemType,
  InventoryStatus,
  StockStatus,
  UnitType,
} from '../dto/inventory.dto';

/**
 * Enhanced tests for inventory drug addition verification
 * Based on INVENTORY_ALIGNMENT_VERIFICATION.md checklist
 */
describe('InventoryService - Enhanced Drug Addition Tests', () => {
  let service: InventoryService;
  let prisma: PrismaService;

  const mockPrisma = {
    inventoryItem: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    stockTransaction: {
      findMany: jest.fn(),
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
    jest.restoreAllMocks();
  });

  describe('Create inventory item with all required fields', () => {
    it('should create inventory item with only required fields', async () => {
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
        unit: UnitType.STRIPS,
        currentStock: 0,
        stockStatus: StockStatus.OUT_OF_STOCK,
        status: InventoryStatus.ACTIVE,
      });
    });
  });

  describe('Create inventory item with optional fields', () => {
    it('should create inventory item with all optional fields', async () => {
      const createItemDto = {
        name: 'Amoxicillin 500mg',
        description: 'Antibiotic medication',
        genericName: 'Amoxicillin',
        brandName: 'Amoxil',
        type: InventoryItemType.MEDICINE,
        category: 'Antibiotics',
        subCategory: 'Penicillin',
        manufacturer: 'GSK Pharma',
        supplier: 'MedSupply Co.',
        barcode: '9876543210123',
        sku: 'AMX-500',
        costPrice: 25.0,
        sellingPrice: 35.0,
        mrp: 40.0,
        unit: UnitType.STRIPS,
        packSize: 10,
        packUnit: 'capsules',
        minStockLevel: 20,
        maxStockLevel: 500,
        reorderLevel: 30,
        reorderQuantity: 100,
        expiryDate: '2025-12-31',
        batchNumber: 'BATCH2024001',
        hsnCode: '30049099',
        gstRate: 12,
        requiresPrescription: true,
        isControlled: false,
        storageLocation: 'Shelf B-15',
        storageConditions: 'Store in cool, dry place',
        tags: ['antibiotic', 'prescription'],
        status: InventoryStatus.ACTIVE,
      };

      const mockItem = {
        id: 'item-456',
        ...createItemDto,
        branchId: 'branch-123',
        currentStock: 0,
        stockStatus: StockStatus.OUT_OF_STOCK,
        expiryDate: new Date('2025-12-31'),
        tags: JSON.stringify(createItemDto.tags),
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.inventoryItem.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryItem.create.mockResolvedValue(mockItem);

      const result = await service.createInventoryItem(createItemDto, 'branch-123');

      expect(result).toMatchObject({
        id: 'item-456',
        name: 'Amoxicillin 500mg',
        description: 'Antibiotic medication',
        genericName: 'Amoxicillin',
        brandName: 'Amoxil',
        type: InventoryItemType.MEDICINE,
        category: 'Antibiotics',
        manufacturer: 'GSK Pharma',
        supplier: 'MedSupply Co.',
        barcode: '9876543210123',
        sku: 'AMX-500',
        costPrice: 25.0,
        sellingPrice: 35.0,
        mrp: 40.0,
        requiresPrescription: true,
        isControlled: false,
        storageLocation: 'Shelf B-15',
      });

      expect(mockPrisma.inventoryItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          expiryDate: expect.any(Date),
          tags: JSON.stringify(['antibiotic', 'prescription']),
        }),
      });
    });
  });

  describe('Validate SKU uniqueness per branch', () => {
    it('should throw ConflictException for duplicate SKU in same branch', async () => {
      const createItemDto = {
        name: 'Paracetamol 500mg',
        sku: 'PAR-500',
        type: InventoryItemType.MEDICINE,
        costPrice: 10.5,
        sellingPrice: 15.0,
        unit: UnitType.STRIPS,
      };

      mockPrisma.inventoryItem.findFirst.mockResolvedValue({ id: 'existing-item', sku: 'PAR-500' });

      await expect(service.createInventoryItem(createItemDto, 'branch-123'))
        .rejects.toThrow(ConflictException);

      expect(mockPrisma.inventoryItem.findFirst).toHaveBeenCalledWith({
        where: { sku: 'PAR-500', branchId: 'branch-123' },
      });
    });

    it('should allow same SKU in different branches', async () => {
      const createItemDto = {
        name: 'Paracetamol 500mg',
        sku: 'PAR-500',
        type: InventoryItemType.MEDICINE,
        costPrice: 10.5,
        sellingPrice: 15.0,
        unit: UnitType.STRIPS,
      };

      const mockItem = {
        id: 'item-789',
        ...createItemDto,
        branchId: 'branch-456', // Different branch
        currentStock: 0,
        stockStatus: StockStatus.OUT_OF_STOCK,
        status: InventoryStatus.ACTIVE,
        tags: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.inventoryItem.findFirst.mockResolvedValue(null); // No conflict in branch-456
      mockPrisma.inventoryItem.create.mockResolvedValue(mockItem);

      const result = await service.createInventoryItem(createItemDto, 'branch-456');

      expect(result).toMatchObject({
        id: 'item-789',
        sku: 'PAR-500',
        branchId: 'branch-456',
      });
    });
  });

  describe('Validate barcode uniqueness per branch', () => {
    beforeEach(() => {
      jest.resetAllMocks();
    });

    it('should throw ConflictException for duplicate barcode in same branch', async () => {
      const createItemDto = {
        name: 'Ibuprofen 400mg',
        sku: 'IBU-400', // Provide SKU so we have 2 findFirst calls
        barcode: '1234567890123',
        type: InventoryItemType.MEDICINE,
        costPrice: 15.0,
        sellingPrice: 20.0,
        unit: UnitType.STRIPS,
      };

      mockPrisma.inventoryItem.findFirst
        .mockResolvedValueOnce(null) // SKU check passes
        .mockResolvedValueOnce({ id: 'existing-item', barcode: '1234567890123' }); // Barcode check fails

      await expect(service.createInventoryItem(createItemDto, 'branch-123'))
        .rejects.toThrow(ConflictException);

      expect(mockPrisma.inventoryItem.findFirst).toHaveBeenCalledTimes(2);
    });

    it('should allow same barcode in different branches', async () => {
      const createItemDto = {
        name: 'Ibuprofen 400mg Different Branch',
        sku: 'IBU-400-B', // Provide SKU so we have 2 findFirst calls
        barcode: '9999999999999',
        type: InventoryItemType.MEDICINE,
        costPrice: 15.0,
        sellingPrice: 20.0,
        unit: UnitType.STRIPS,
      };

      const mockItem = {
        id: 'item-999',
        ...createItemDto,
        branchId: 'branch-789',
        currentStock: 0,
        stockStatus: StockStatus.OUT_OF_STOCK,
        status: InventoryStatus.ACTIVE,
        tags: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock both checks to return null (no conflicts in this branch)
      mockPrisma.inventoryItem.findFirst
        .mockResolvedValueOnce(null) // No SKU conflict in this branch
        .mockResolvedValueOnce(null); // No barcode conflict in this branch
      mockPrisma.inventoryItem.create.mockResolvedValue(mockItem);

      const result = await service.createInventoryItem(createItemDto, 'branch-789');

      expect(result.barcode).toBe('9999999999999');
      expect(result.branchId).toBe('branch-789');
      expect(mockPrisma.inventoryItem.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  describe('Validate enum values', () => {
    it('should accept valid InventoryItemType enum', async () => {
      const types = [
        InventoryItemType.MEDICINE,
        InventoryItemType.EQUIPMENT,
        InventoryItemType.SUPPLY,
        InventoryItemType.CONSUMABLE,
      ];

      for (const type of types) {
        const createItemDto = {
          name: `Test Item - ${type}`,
          type,
          costPrice: 10.0,
          sellingPrice: 15.0,
          unit: UnitType.PIECES,
        };

        const mockItem = {
          id: `item-${type}`,
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
        expect(result.type).toBe(type);
      }
    });

    it('should accept valid UnitType enum', async () => {
      const units = [
        UnitType.PIECES,
        UnitType.BOXES,
        UnitType.BOTTLES,
        UnitType.STRIPS,
        UnitType.TUBES,
        UnitType.VIALS,
        UnitType.AMPOULES,
        UnitType.SYRINGES,
        UnitType.PACKS,
        UnitType.KITS,
      ];

      for (const unit of units) {
        const createItemDto = {
          name: `Test Item - ${unit}`,
          type: InventoryItemType.MEDICINE,
          costPrice: 10.0,
          sellingPrice: 15.0,
          unit,
        };

        const mockItem = {
          id: `item-${unit}`,
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
        expect(result.unit).toBe(unit);
      }
    });

    it('should accept valid InventoryStatus enum', async () => {
      const statuses = [
        InventoryStatus.ACTIVE,
        InventoryStatus.INACTIVE,
        InventoryStatus.DISCONTINUED,
      ];

      for (const status of statuses) {
        const createItemDto = {
          name: `Test Item - ${status}`,
          type: InventoryItemType.MEDICINE,
          costPrice: 10.0,
          sellingPrice: 15.0,
          unit: UnitType.PIECES,
          status,
        };

        const mockItem = {
          id: `item-${status}`,
          ...createItemDto,
          branchId: 'branch-123',
          currentStock: 0,
          stockStatus: StockStatus.OUT_OF_STOCK,
          tags: null,
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrisma.inventoryItem.findFirst.mockResolvedValue(null);
        mockPrisma.inventoryItem.create.mockResolvedValue(mockItem);

        const result = await service.createInventoryItem(createItemDto, 'branch-123');
        expect(result.status).toBe(status);
      }
    });
  });

  describe('Test expiryDate conversion', () => {
    beforeEach(() => {
      jest.resetAllMocks();
    });

    it('should convert expiryDate string to Date object on create', async () => {
      const createItemDto = {
        name: 'Medicine with expiry',
        type: InventoryItemType.MEDICINE,
        costPrice: 10.0,
        sellingPrice: 15.0,
        unit: UnitType.STRIPS,
        expiryDate: '2025-06-30',
      };

      const mockItem = {
        id: 'item-expiry',
        ...createItemDto,
        branchId: 'branch-123',
        currentStock: 0,
        stockStatus: StockStatus.OUT_OF_STOCK,
        status: InventoryStatus.ACTIVE,
        expiryDate: new Date('2025-06-30'),
        tags: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.inventoryItem.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryItem.create.mockResolvedValue(mockItem);

      await service.createInventoryItem(createItemDto, 'branch-123');

      expect(mockPrisma.inventoryItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          expiryDate: expect.any(Date),
        }),
      });

      const callArgs = mockPrisma.inventoryItem.create.mock.calls[0][0];
      expect(callArgs.data.expiryDate).toBeInstanceOf(Date);
      expect(callArgs.data.expiryDate.toISOString()).toContain('2025-06-30');
    });

    it('should convert expiryDate string to Date object on update', async () => {
      const existingItem = {
        id: 'item-123',
        name: 'Medicine',
        sku: null,
        barcode: null,
        expiryDate: new Date('2024-12-31'),
        tags: null,
      };

      const updateDto = {
        expiryDate: '2026-12-31',
      };

      const updatedItem = {
        ...existingItem,
        expiryDate: new Date('2026-12-31'),
      };

      mockPrisma.inventoryItem.findFirst.mockResolvedValue(existingItem);
      mockPrisma.inventoryItem.update.mockResolvedValue(updatedItem);

      await service.updateInventoryItem('item-123', updateDto, 'branch-123');

      expect(mockPrisma.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'item-123' },
        data: expect.objectContaining({
          expiryDate: expect.any(Date),
        }),
      });

      const callArgs = mockPrisma.inventoryItem.update.mock.calls[0][0];
      expect(callArgs.data.expiryDate).toBeInstanceOf(Date);
      expect(callArgs.data.expiryDate.toISOString()).toContain('2026-12-31');
    });

    it('should handle undefined expiryDate', async () => {
      const createItemDto = {
        name: 'Medicine without expiry',
        type: InventoryItemType.MEDICINE,
        costPrice: 10.0,
        sellingPrice: 15.0,
        unit: UnitType.STRIPS,
      };

      const mockItem = {
        id: 'item-no-expiry',
        ...createItemDto,
        branchId: 'branch-123',
        currentStock: 0,
        stockStatus: StockStatus.OUT_OF_STOCK,
        status: InventoryStatus.ACTIVE,
        expiryDate: null,
        tags: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.inventoryItem.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryItem.create.mockResolvedValue(mockItem);

      const result = await service.createInventoryItem(createItemDto, 'branch-123');

      expect(result.expiryDate).toBeNull();
    });
  });

  describe('Test tags array serialization', () => {
    beforeEach(() => {
      jest.resetAllMocks();
    });

    it('should serialize tags array to JSON string on create', async () => {
      const createItemDto = {
        name: 'Medicine with tags',
        type: InventoryItemType.MEDICINE,
        costPrice: 10.0,
        sellingPrice: 15.0,
        unit: UnitType.STRIPS,
        tags: ['antibiotic', 'prescription', 'refrigerate'],
      };

      const mockItem = {
        id: 'item-tags',
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

      mockPrisma.inventoryItem.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryItem.create.mockResolvedValue(mockItem);

      const result = await service.createInventoryItem(createItemDto, 'branch-123');

      expect(mockPrisma.inventoryItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tags: JSON.stringify(['antibiotic', 'prescription', 'refrigerate']),
        }),
      });

      // Result should have parsed tags array
      expect(Array.isArray(result.tags)).toBe(true);
      expect(result.tags).toEqual(['antibiotic', 'prescription', 'refrigerate']);
    });

    it('should deserialize tags JSON string to array in result', async () => {
      const mockItem = {
        id: 'item-123',
        name: 'Medicine',
        branchId: 'branch-123',
        tags: JSON.stringify(['pain-relief', 'over-the-counter']),
        metadata: null,
      };

      mockPrisma.inventoryItem.findFirst.mockResolvedValue(mockItem);

      const result = await service.findInventoryItemById('item-123', 'branch-123');

      expect(Array.isArray(result.tags)).toBe(true);
      expect(result.tags).toEqual(['pain-relief', 'over-the-counter']);
    });

    it('should handle empty tags array', async () => {
      const createItemDto = {
        name: 'Medicine no tags',
        type: InventoryItemType.MEDICINE,
        costPrice: 10.0,
        sellingPrice: 15.0,
        unit: UnitType.STRIPS,
        tags: [],
      };

      const mockItem = {
        id: 'item-empty-tags',
        ...createItemDto,
        branchId: 'branch-123',
        currentStock: 0,
        stockStatus: StockStatus.OUT_OF_STOCK,
        status: InventoryStatus.ACTIVE,
        tags: JSON.stringify([]),
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.inventoryItem.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryItem.create.mockResolvedValue(mockItem);

      const result = await service.createInventoryItem(createItemDto, 'branch-123');

      expect(Array.isArray(result.tags)).toBe(true);
      expect(result.tags).toEqual([]);
    });

    it('should handle null tags', async () => {
      const mockItem = {
        id: 'item-null-tags',
        name: 'Medicine',
        tags: null,
        metadata: null,
      };

      mockPrisma.inventoryItem.findFirst.mockResolvedValue(mockItem);

      const result = await service.findInventoryItemById('item-null-tags', 'branch-123');

      expect(Array.isArray(result.tags)).toBe(true);
      expect(result.tags).toEqual([]);
    });
  });

  describe('Test user relation in responses', () => {
    it('should include user with firstName and lastName in stock transactions', async () => {
      const mockTransactions = [
        {
          id: 'transaction-1',
          itemId: 'item-1',
          branchId: 'branch-123',
          item: {
            id: 'item-1',
            name: 'Paracetamol',
            type: InventoryItemType.MEDICINE,
            tags: null,
            metadata: null,
          },
          user: {
            id: 'user-1',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
          },
        },
      ];

      mockPrisma.stockTransaction.findMany.mockResolvedValue(mockTransactions);

      // Verify the user relation structure
      expect(mockTransactions[0].user).toHaveProperty('firstName');
      expect(mockTransactions[0].user).toHaveProperty('lastName');
      expect(mockTransactions[0].user).not.toHaveProperty('name');
      expect(mockTransactions[0].user.firstName).toBe('John');
      expect(mockTransactions[0].user.lastName).toBe('Doe');
    });
  });
});

