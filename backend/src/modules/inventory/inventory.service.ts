import { writeStockMovement, movementDelta, money } from './inventory-stock';
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
  CreateStockTransactionDto,
  UpdateStockTransactionDto,
  BulkStockUpdateDto,
  StockAdjustmentDto,
  StockTransferDto,
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  CreateSupplierDto,
  UpdateSupplierDto,
  InventoryItemType,
  InventoryStatus,
  StockStatus,
  TransactionType,
} from './dto/inventory.dto';
import {
  QueryInventoryItemsDto,
  QueryStockTransactionsDto,
  QueryPurchaseOrdersDto,
  QuerySuppliersDto,
  StockReportDto,
  InventoryStatisticsDto,
  LowStockAlertDto,
  ExpiryAlertDto,
  InventoryMovementDto,
  BarcodeSearchDto,
  SkuSearchDto,
  InventoryAuditDto,
} from './dto/query-inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // Inventory Item Management
  async createInventoryItem(createItemDto: CreateInventoryItemDto, branchId: string) {
    // Check if item with same SKU or barcode already exists
    if (createItemDto.sku) {
      const existingSku = await this.prisma.inventoryItem.findFirst({
        where: { sku: createItemDto.sku, branchId },
      });
      if (existingSku) {
        throw new ConflictException('Item with this SKU already exists');
      }
    }

    if (createItemDto.barcode) {
      const existingBarcode = await this.prisma.inventoryItem.findFirst({
        where: { barcode: createItemDto.barcode, branchId },
      });
      if (existingBarcode) {
        throw new ConflictException('Item with this barcode already exists');
      }
    }

    const item = await this.prisma.inventoryItem.create({
      data: {
        ...createItemDto,
        branchId,
        currentStock: 0,
        stockStatus: StockStatus.OUT_OF_STOCK,
        status: createItemDto.status || InventoryStatus.ACTIVE,
        // Ensure DateTime field receives a JS Date
        expiryDate: createItemDto.expiryDate ? new Date(createItemDto.expiryDate) : undefined,
        tags: createItemDto.tags ? JSON.stringify(createItemDto.tags) : null,
        metadata: null,
      },
    });

    return this.formatInventoryItem(item);
  }

  async findAllInventoryItems(query: QueryInventoryItemsDto, branchId: string) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
      type,
      category,
      subCategory,
      manufacturer,
      supplier,
      status,
      stockStatus,
      requiresPrescription,
      isControlled,
      storageLocation,
      barcode,
      sku,
      minCostPrice,
      maxCostPrice,
      minSellingPrice,
      maxSellingPrice,
      expiryBefore,
      expiryAfter,
      minStockLevel,
      maxStockLevel,
      tags,
    } = query;

    const where: any = { branchId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { genericName: { contains: search, mode: 'insensitive' } },
        { brandName: { contains: search, mode: 'insensitive' } },
        { manufacturer: { contains: search, mode: 'insensitive' } },
        { supplier: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (type) where.type = type;
    if (category) where.category = category;
    if (subCategory) where.subCategory = subCategory;
    if (manufacturer) where.manufacturer = manufacturer;
    if (supplier) where.supplier = supplier;
    if (status) where.status = status;
    if (stockStatus) where.stockStatus = stockStatus;
    if (requiresPrescription !== undefined) where.requiresPrescription = requiresPrescription;
    if (isControlled !== undefined) where.isControlled = isControlled;
    if (storageLocation) where.storageLocation = storageLocation;
    if (barcode) where.barcode = barcode;
    if (sku) where.sku = sku;

    if (minCostPrice !== undefined || maxCostPrice !== undefined) {
      where.costPrice = {};
      if (minCostPrice !== undefined) where.costPrice.gte = minCostPrice;
      if (maxCostPrice !== undefined) where.costPrice.lte = maxCostPrice;
    }

    if (minSellingPrice !== undefined || maxSellingPrice !== undefined) {
      where.sellingPrice = {};
      if (minSellingPrice !== undefined) where.sellingPrice.gte = minSellingPrice;
      if (maxSellingPrice !== undefined) where.sellingPrice.lte = maxSellingPrice;
    }

    if (expiryBefore || expiryAfter) {
      where.expiryDate = {};
      if (expiryBefore) where.expiryDate.lte = new Date(expiryBefore);
      if (expiryAfter) where.expiryDate.gte = new Date(expiryAfter);
    }

    if (minStockLevel !== undefined || maxStockLevel !== undefined) {
      where.currentStock = {};
      if (minStockLevel !== undefined) where.currentStock.gte = minStockLevel;
      if (maxStockLevel !== undefined) where.currentStock.lte = maxStockLevel;
    }

    if (tags) {
      where.tags = { contains: tags, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);

    return {
      items: items.map(item => this.formatInventoryItem(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findInventoryItemById(id: string, branchId: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, branchId },
    });

    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }

    return this.formatInventoryItem(item);
  }


  async updateInventoryItem(id: string, updateItemDto: UpdateInventoryItemDto, branchId: string) {
    const existingItem = await this.prisma.inventoryItem.findFirst({
      where: { id, branchId },
    });

    if (!existingItem) {
      throw new NotFoundException('Inventory item not found');
    }

    const supplied = updateItemDto as any;
    for (const field of ['currentStock','heldStock','costPrice','unit','packSize','packUnit']) {
      if (supplied[field] !== undefined && supplied[field] !== (existingItem as any)[field]) throw new BadRequestException('Posted stock quantity, unit basis and purchase cost require a linked stock or purchase correction');
    }

    // Check for SKU conflicts
    if (updateItemDto.sku && updateItemDto.sku !== existingItem.sku) {
      const existingSku = await this.prisma.inventoryItem.findFirst({
        where: { sku: updateItemDto.sku, branchId, id: { not: id } },
      });
      if (existingSku) {
        throw new ConflictException('Item with this SKU already exists');
      }
    }

    // Check for barcode conflicts
    if (updateItemDto.barcode && updateItemDto.barcode !== existingItem.barcode) {
      const existingBarcode = await this.prisma.inventoryItem.findFirst({
        where: { barcode: updateItemDto.barcode, branchId, id: { not: id } },
      });
      if (existingBarcode) {
        throw new ConflictException('Item with this barcode already exists');
      }
    }

    const updatedItem = await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        ...updateItemDto,
        // Ensure DateTime field receives a JS Date
        expiryDate: updateItemDto.expiryDate ? new Date(updateItemDto.expiryDate) : undefined,
        tags: updateItemDto.tags ? JSON.stringify(updateItemDto.tags) : existingItem.tags,
      },
    });

    return this.formatInventoryItem(updatedItem);
  }

  async deleteInventoryItem(id: string, branchId: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, branchId },
    });

    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }

    if (item.currentStock || item.heldStock) throw new BadRequestException('Dispose or return remaining stock before deleting a batch');
    if (await this.prisma.inventoryWorkflowEffect.count({where:{branchId,inventoryId:id}})) throw new BadRequestException('This batch has workflow history and must be archived instead');
    // Check if item has stock transactions
    const transactionCount = await this.prisma.stockTransaction.count({
      where: { itemId: id },
    });

    if (transactionCount > 0) {
      throw new BadRequestException('Cannot delete item with existing stock transactions');
    }

    await this.prisma.inventoryItem.delete({
      where: { id },
    });

    return { message: 'Inventory item deleted successfully' };
  }

  // Stock Transaction Management
  /**
   * @cc [owner:nareshshah139,label:product;target] inventory-movement-atomic
   * The movement record and its inventory balance update MUST commit atomically; if either fails,
   * neither change may persist.
   * Acceptance: INV-32.3. Validation and open gaps:
   * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
   */
  async createStockTransaction(createTransactionDto: CreateStockTransactionDto, branchId: string, userId: string) {
    if (!Number.isSafeInteger(createTransactionDto.quantity) || createTransactionDto.quantity <= 0) {
      throw new BadRequestException('Quantity must be a positive whole number');
    }
    const sign = ['PURCHASE', 'RETURN'].includes(createTransactionDto.type) ? 1
      : ['SALE', 'EXPIRED', 'DAMAGED'].includes(createTransactionDto.type) ? -1 : 0;
    if (!sign) throw new BadRequestException('Use the adjustment or transfer workflow for this movement');
    return this.prisma.$transaction(async (tx: any) => this.formatStockTransaction(await writeStockMovement(tx, {
      branchId, userId, itemId: createTransactionDto.itemId, type: createTransactionDto.type,
      delta: sign * createTransactionDto.quantity, unitPrice: createTransactionDto.unitPrice,
      reference: createTransactionDto.reference, reason: createTransactionDto.reason, notes: createTransactionDto.notes,
    })), { isolationLevel: 'Serializable' });
  }


  async findAllStockTransactions(query: QueryStockTransactionsDto, branchId: string) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      itemId,
      type,
      reference,
      supplier,
      customer,
      batchNumber,
      location,
      dateFrom,
      dateTo,
      minQuantity,
      maxQuantity,
      minAmount,
      maxAmount,
    } = query;

    const where: any = { branchId };

    if (itemId) where.itemId = itemId;
    if (type) where.type = type;
    if (reference) where.reference = { contains: reference, mode: 'insensitive' };
    if (supplier) where.supplier = { contains: supplier, mode: 'insensitive' };
    if (customer) where.customer = { contains: customer, mode: 'insensitive' };
    if (batchNumber) where.batchNumber = batchNumber;
    if (location) where.location = location;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    if (minQuantity !== undefined || maxQuantity !== undefined) {
      where.quantity = {};
      if (minQuantity !== undefined) where.quantity.gte = minQuantity;
      if (maxQuantity !== undefined) where.quantity.lte = maxQuantity;
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      where.totalAmount = {};
      if (minAmount !== undefined) where.totalAmount.gte = minAmount;
      if (maxAmount !== undefined) where.totalAmount.lte = maxAmount;
    }

    const [transactions, total] = await Promise.all([
      this.prisma.stockTransaction.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          item: true,
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.stockTransaction.count({ where }),
    ]);

    return {
      transactions: transactions.map(transaction => this.formatStockTransaction(transaction)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findStockTransactionById(id: string, branchId: string) {
    const transaction = await this.prisma.stockTransaction.findFirst({
      where: { id, branchId },
      include: {
        item: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException('Stock transaction not found');
    }

    return this.formatStockTransaction(transaction);
  }

  /**
   * @cc [owner:nareshshah139,label:product;target] inventory-posted-movement-immutable
   * A posted stock movement MUST NOT have its quantity, direction or price rewritten in place;
   * corrections require linked reversal and replacement entries.
   * Acceptance: INV-27.5. Validation and open gaps:
   * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
   */
  async updateStockTransaction(id: string, updateTransactionDto: UpdateStockTransactionDto, branchId: string) {
    const existing = await this.prisma.stockTransaction.findFirst({ where: { id, branchId } });
    if (!existing) throw new NotFoundException('Stock transaction not found');
    throw new BadRequestException('Posted movements are immutable. Create a linked correction from the batch ledger.');
  }

  /**
   * @cc [owner:nareshshah139,label:product;target] inventory-movement-history-retained
   * Deleting a posted movement MUST NOT erase its audit history; an authorized correction must
   * retain the original and a linked reversal with the correct signed effect.
   * Acceptance: INV-32.5. Validation and open gaps:
   * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
   */
  async deleteStockTransaction(id: string, branchId: string) {
    const existing = await this.prisma.stockTransaction.findFirst({ where: { id, branchId } });
    if (!existing) throw new NotFoundException('Stock transaction not found');
    throw new BadRequestException('Posted movements cannot be deleted. Create a linked reversal from the batch ledger.');
  }

  // Bulk Operations
  async bulkStockUpdate(bulkUpdateDto: BulkStockUpdateDto, branchId: string, userId: string) {
    const results = [];

    for (const transactionDto of bulkUpdateDto.transactions) {
      try {
        const result = await this.createStockTransaction(transactionDto, branchId, userId);
        results.push({ success: true, data: result });
      } catch (error) {
        results.push({ success: false, error: error.message, data: transactionDto });
      }
    }

    return {
      total: bulkUpdateDto.transactions.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }


  async adjustStock(stockAdjustmentDto: StockAdjustmentDto, branchId: string, userId: string) {
    if (!stockAdjustmentDto.reason?.trim()) throw new BadRequestException('An adjustment reason is required');
    return this.prisma.$transaction(async (tx: any) => this.formatStockTransaction(await writeStockMovement(tx, {
      branchId, userId, itemId: stockAdjustmentDto.itemId, delta: stockAdjustmentDto.adjustmentQuantity,
      type: 'ADJUSTMENT', reason: stockAdjustmentDto.reason?.trim(), notes: stockAdjustmentDto.notes,
    })), { isolationLevel: 'Serializable' });
  }

  async transferStock(stockTransferDto: StockTransferDto, branchId: string, userId: string) {
    if (!stockTransferDto.fromLocation?.trim() || !stockTransferDto.toLocation?.trim() || stockTransferDto.fromLocation === stockTransferDto.toLocation) throw new BadRequestException('Choose distinct source and destination locations');
    return this.prisma.$transaction(async (tx:any)=>{
      const item = await tx.inventoryItem.findFirst({where:{id:stockTransferDto.itemId,branchId}});
      if (!item) throw new NotFoundException('Inventory item not found');
      if (item.storageLocation !== stockTransferDto.fromLocation) throw new ConflictException('The batch location changed. Refresh before transferring');
      if (stockTransferDto.quantity !== item.currentStock) throw new BadRequestException('A location transfer moves the complete batch; split batches require distinct inventory records');
      const reference = `TRANSFER-${Date.now()}-${item.id}`;
      const outboundTransaction = await writeStockMovement(tx,{branchId,userId,itemId:item.id,delta:-stockTransferDto.quantity,type:'TRANSFER',reference,reason:'Stock transfer - outbound',location:stockTransferDto.fromLocation,metadata:{fromLocation:stockTransferDto.fromLocation,toLocation:stockTransferDto.toLocation}});
      const inboundTransaction = await writeStockMovement(tx,{branchId,userId,itemId:item.id,delta:stockTransferDto.quantity,type:'TRANSFER',reference,reason:'Stock transfer - inbound',location:stockTransferDto.toLocation,metadata:{fromLocation:stockTransferDto.fromLocation,toLocation:stockTransferDto.toLocation}});
      await tx.inventoryItem.update({where:{id:item.id,branchId},data:{storageLocation:stockTransferDto.toLocation}});
      return {outboundTransaction:this.formatStockTransaction(outboundTransaction),inboundTransaction:this.formatStockTransaction(inboundTransaction)};
    },{isolationLevel:'Serializable'});
  }

  // Purchase Order Management

  async createPurchaseOrder(createOrderDto: CreatePurchaseOrderDto, branchId: string, userId: string) {
    const order = await this.prisma.purchaseOrder.create({
      data: {
        ...createOrderDto,
        branchId,
        userId,
        status: 'PENDING',
        orderDate: createOrderDto.orderDate ? new Date(createOrderDto.orderDate) : new Date(),
        expectedDeliveryDate: createOrderDto.expectedDeliveryDate ? new Date(createOrderDto.expectedDeliveryDate) : null,
        items: JSON.stringify(createOrderDto.items),
        totalAmount: createOrderDto.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0),
      },
    });

    return this.formatPurchaseOrder(order);
  }

  async findAllPurchaseOrders(query: QueryPurchaseOrdersDto, branchId: string) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      supplier,
      status,
      orderDateFrom,
      orderDateTo,
      deliveryDateFrom,
      deliveryDateTo,
      minAmount,
      maxAmount,
    } = query;

    const where: any = { branchId };

    if (supplier) where.supplier = { contains: supplier, mode: 'insensitive' };
    if (status) where.status = status;

    if (orderDateFrom || orderDateTo) {
      where.orderDate = {};
      if (orderDateFrom) where.orderDate.gte = new Date(orderDateFrom);
      if (orderDateTo) where.orderDate.lte = new Date(orderDateTo);
    }

    if (deliveryDateFrom || deliveryDateTo) {
      where.expectedDeliveryDate = {};
      if (deliveryDateFrom) where.expectedDeliveryDate.gte = new Date(deliveryDateFrom);
      if (deliveryDateTo) where.expectedDeliveryDate.lte = new Date(deliveryDateTo);
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      where.totalAmount = {};
      if (minAmount !== undefined) where.totalAmount.gte = minAmount;
      if (maxAmount !== undefined) where.totalAmount.lte = maxAmount;
    }

    const [orders, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return {
      orders: orders.map(order => this.formatPurchaseOrder(order)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findPurchaseOrderById(id: string, branchId: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, branchId },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Purchase order not found');
    }

    return this.formatPurchaseOrder(order);
  }

  async updatePurchaseOrder(id: string, updateOrderDto: UpdatePurchaseOrderDto, branchId: string) {
    const existingOrder = await this.prisma.purchaseOrder.findFirst({
      where: { id, branchId },
    });

    if (!existingOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    const updateData: any = { ...updateOrderDto };

    if (updateOrderDto.items) {
      updateData.items = JSON.stringify(updateOrderDto.items);
      updateData.totalAmount = updateOrderDto.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    }

    if (updateOrderDto.orderDate) {
      updateData.orderDate = new Date(updateOrderDto.orderDate);
    }

    if (updateOrderDto.expectedDeliveryDate) {
      updateData.expectedDeliveryDate = new Date(updateOrderDto.expectedDeliveryDate);
    }

    const updatedOrder = await this.prisma.purchaseOrder.update({
      where: { id },
      data: updateData,
    });

    return this.formatPurchaseOrder(updatedOrder);
  }

  async deletePurchaseOrder(id: string, branchId: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, branchId },
    });

    if (!order) {
      throw new NotFoundException('Purchase order not found');
    }

    await this.prisma.purchaseOrder.delete({
      where: { id },
    });

    return { message: 'Purchase order deleted successfully' };
  }

  // Supplier Management
  async createSupplier(createSupplierDto: CreateSupplierDto, branchId: string) {
    const supplier = await this.prisma.supplier.create({
      data: {
        ...createSupplierDto,
        branchId,
        isActive: createSupplierDto.isActive !== undefined ? createSupplierDto.isActive : true,
      },
    });

    return this.formatSupplier(supplier);
  }

  async findAllSuppliers(query: QuerySuppliersDto, branchId: string) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
      city,
      state,
      isActive,
      gstNumber,
    } = query;

    const where: any = { branchId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { contactPerson: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (city) where.city = city;
    if (state) where.state = state;
    if (isActive !== undefined) where.isActive = isActive;
    if (gstNumber) where.gstNumber = gstNumber;

    const [suppliers, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return {
      suppliers: suppliers.map(supplier => this.formatSupplier(supplier)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findSupplierById(id: string, branchId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, branchId },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    return this.formatSupplier(supplier);
  }

  async updateSupplier(id: string, updateSupplierDto: UpdateSupplierDto, branchId: string) {
    const existingSupplier = await this.prisma.supplier.findFirst({
      where: { id, branchId },
    });

    if (!existingSupplier) {
      throw new NotFoundException('Supplier not found');
    }

    const updatedSupplier = await this.prisma.supplier.update({
      where: { id },
      data: updateSupplierDto,
    });

    return this.formatSupplier(updatedSupplier);
  }

  async deleteSupplier(id: string, branchId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, branchId },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    // Check if supplier has purchase orders
    const orderCount = await this.prisma.purchaseOrder.count({
      where: { supplier: supplier.name },
    });

    if (orderCount > 0) {
      throw new BadRequestException('Cannot delete supplier with existing purchase orders');
    }

    await this.prisma.supplier.delete({
      where: { id },
    });

    return { message: 'Supplier deleted successfully' };
  }

  // Reports and Analytics

  async getStockReport(query: StockReportDto, branchId: string) {
    const where: any = { branchId };

    if (query.type) where.type = query.type;
    if (query.category) where.category = query.category;
    if (query.stockStatus) where.stockStatus = query.stockStatus;
    if (query.storageLocation) where.storageLocation = query.storageLocation;

    if (query.expiryBefore || query.expiryAfter) {
      where.expiryDate = {};
      if (query.expiryBefore) where.expiryDate.lte = new Date(query.expiryBefore);
      if (query.expiryAfter) where.expiryDate.gte = new Date(query.expiryAfter);
    }

    if (query.minStockLevel !== undefined || query.maxStockLevel !== undefined) {
      where.currentStock = {};
      if (query.minStockLevel !== undefined) where.currentStock.gte = query.minStockLevel;
      if (query.maxStockLevel !== undefined) where.currentStock.lte = query.maxStockLevel;
    }

    if (!query.includeZeroStock) {
      where.currentStock = { gt: 0 };
    }

    if (!query.includeExpired) {
      where.OR = [
        { expiryDate: null },
        { expiryDate: { gt: new Date() } },
      ];
    }

    const items = await this.prisma.inventoryItem.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    const totalValue = items.reduce((sum, item) => sum + (item.currentStock * item.costPrice), 0);
    const totalItems = items.length;
    const lowStockItems = items.filter(item => 
      item.reorderLevel && item.currentStock <= item.reorderLevel
    ).length;
    const expiredItems = items.filter(item => 
      item.expiryDate && item.expiryDate < new Date()
    ).length;

    return {
      items: items.map(item => this.formatInventoryItem(item)),
      summary: {
        totalItems,
        totalValue,
        lowStockItems,
        expiredItems,
        averageStockValue: totalItems > 0 ? totalValue / totalItems : 0,
      },
    };
  }

  /**
   * @cc [owner:nareshshah139,label:product;target] inventory-statistics-money
   * totalValue MUST be a monetary inventory valuation with a declared basis, not the sum of stock
   * quantities; 10 units costing 25 each have cost value 250.
   * Acceptance: INV-07.3. Validation and open gaps:
   * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
   */
  async getInventoryStatistics(query: InventoryStatisticsDto, branchId: string) {
    const where: any = { branchId };
    if (query.type) where.type = query.type;
    if (query.category) where.category = query.category;
    if (query.storageLocation) where.storageLocation = query.storageLocation;
    const items = await this.prisma.inventoryItem.findMany({ where });
    const breakdown = (key: string) => Object.entries(items.reduce((groups: Record<string, any>, item: any) => {
      const value = item[key] || 'Unassigned';
      const row = groups[value] ||= { [key]: value, _count: { id: 0 }, _sum: { currentStock: 0 } };
      row._count.id++; row._sum.currentStock += item.currentStock; return groups;
    }, {})).map(([, value]) => value);
    return { totalItems: items.length,
      totalValue: money(items.reduce((sum, item) => sum + item.currentStock * item.costPrice, 0)),
      valuationBasis: 'Cost per stock unit; excludes tax',
      lowStockCount: items.filter(item => item.currentStock <= (item.reorderLevel ?? item.minStockLevel ?? -1)).length,
      expiredCount: items.filter(item => item.expiryDate && item.expiryDate < new Date()).length,
      typeBreakdown: breakdown('type'), categoryBreakdown: breakdown('category'), locationBreakdown: breakdown('storageLocation') };

  }

  async getLowStockAlerts(query: LowStockAlertDto, branchId: string) {
    const where: any = { branchId };

    if (query.type) where.type = query.type;
    if (query.category) where.category = query.category;
    if (query.storageLocation) where.storageLocation = query.storageLocation;

    const items = await this.prisma.inventoryItem.findMany({
      where: {
        ...where,
        OR: [
          { reorderLevel: { lte: 10 } },
          { 
            AND: [
              { reorderLevel: null },
              { currentStock: { lte: query.thresholdPercentage || 20 } },
            ],
          },
        ],
      },
      orderBy: { currentStock: 'asc' },
    });

    return items.map(item => this.formatInventoryItem(item));
  }

  async getExpiryAlerts(query: ExpiryAlertDto, branchId: string) {
    const where: any = { branchId };

    if (query.type) where.type = query.type;
    if (query.category) where.category = query.category;
    if (query.storageLocation) where.storageLocation = query.storageLocation;

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + (query.daysBeforeExpiry || 30));

    const items = await this.prisma.inventoryItem.findMany({
      where: {
        ...where,
        expiryDate: {
          lte: expiryDate,
          gte: new Date(),
        },
      },
      orderBy: { expiryDate: 'asc' },
    });

    return items.map(item => this.formatInventoryItem(item));
  }

  async getInventoryMovement(query: InventoryMovementDto, branchId: string) {
    const where: any = { branchId };

    if (query.itemId) where.itemId = query.itemId;
    if (query.transactionType) where.type = query.transactionType;

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    const transactions = await this.prisma.stockTransaction.findMany({
      where,
      include: {
        item: {
          select: { id: true, name: true, type: true, category: true, storageLocation: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return transactions.map(transaction => this.formatStockTransaction(transaction));
  }

  // Search Functions
  async searchByBarcode(query: BarcodeSearchDto, branchId: string) {
    const where: any = { branchId, barcode: query.barcode };

    if (!query.includeInactive) {
      where.status = InventoryStatus.ACTIVE;
    }

    const item = await this.prisma.inventoryItem.findFirst({ where });

    if (!item) {
      throw new NotFoundException('Item not found with this barcode');
    }

    return this.formatInventoryItem(item);
  }

  async searchBySku(query: SkuSearchDto, branchId: string) {
    const where: any = { branchId, sku: query.sku };

    if (!query.includeInactive) {
      where.status = InventoryStatus.ACTIVE;
    }

    const item = await this.prisma.inventoryItem.findFirst({ where });

    if (!item) {
      throw new NotFoundException('Item not found with this SKU');
    }

    return this.formatInventoryItem(item);
  }

  // Helper Methods
  /**
   * @cc [owner:nareshshah139,label:product;target] inventory-outbound-no-clamping
   * An outbound quantity greater than available stock MUST fail without a movement or balance
   * change; clamping a negative result to zero is not a valid stock update.
   * Acceptance: INV-32.4. Validation and open gaps:
   * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
   */
  private async updateItemStock(itemId: string, transactionType: TransactionType, quantity: number) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: itemId },
    });

    if (!item) throw new NotFoundException('Inventory item not found');

    let newStock = item.currentStock;

    switch (transactionType) {
      case TransactionType.PURCHASE:
      case TransactionType.RETURN:
        newStock += quantity;
        break;
      case TransactionType.SALE:
      case TransactionType.EXPIRED:
      case TransactionType.DAMAGED:
        newStock -= quantity;
        break;
      case TransactionType.ADJUSTMENT:
        // This is handled separately in adjustStock method
        break;
      case TransactionType.TRANSFER:
        // This is handled separately in transferStock method
        break;
    }

    if (newStock < 0) throw new BadRequestException('Insufficient stock');

    // Determine stock status
    let stockStatus = StockStatus.IN_STOCK;
    if (newStock <= 0) {
      stockStatus = StockStatus.OUT_OF_STOCK;
    } else if (item.reorderLevel && newStock <= item.reorderLevel) {
      stockStatus = StockStatus.LOW_STOCK;
    }

    // Check for expiry
    if (item.expiryDate && item.expiryDate < new Date()) {
      stockStatus = StockStatus.EXPIRED;
    }

    await this.prisma.inventoryItem.update({
      where: { id: itemId },
      data: {
        currentStock: newStock,
        stockStatus,
      },
    });
  }

  private reverseTransactionType(type: TransactionType): TransactionType {
    switch (type) {
      case TransactionType.PURCHASE:
        return TransactionType.SALE;
      case TransactionType.SALE:
        return TransactionType.PURCHASE;
      case TransactionType.RETURN:
        return TransactionType.SALE;
      default:
        return TransactionType.ADJUSTMENT;
    }
  }

  private formatInventoryItem(item: any) {
    let tags = [];
    let metadata = null;

    // Safely parse tags
    if (item.tags) {
      try {
        tags = JSON.parse(item.tags);
      } catch (error) {
        // If parsing fails, treat as comma-separated string
        if (typeof item.tags === 'string') {
          tags = item.tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0);
        }
      }
    }

    // Safely parse metadata
    if (item.metadata) {
      try {
        metadata = JSON.parse(item.metadata);
      } catch (error) {
        // If parsing fails, keep as string
        metadata = item.metadata;
      }
    }

    return {
      ...item,
      tags,
      metadata,
    };
  }

  private formatStockTransaction(transaction: any) {
    return {
      ...transaction,
      delta: movementDelta(transaction),
      item: transaction.item ? this.formatInventoryItem(transaction.item) : null,
    };
  }

  private formatPurchaseOrder(order: any) {
    return {
      ...order,
      items: order.items ? JSON.parse(order.items) : [],
    };
  }

  private formatSupplier(supplier: any) {
    return supplier;
  }
  // Additional Utility Methods
  async getCategories(branchId: string) {
    const categories = await this.prisma.inventoryItem.findMany({
      where: { branchId },
      select: { category: true },
      distinct: ['category'],
    });

    return categories.map(cat => cat.category).filter(Boolean);
  }

  async getManufacturers(branchId: string) {
    const manufacturers = await this.prisma.inventoryItem.findMany({
      where: { branchId },
      select: { manufacturer: true },
      distinct: ['manufacturer'],
    });

    return manufacturers.map(man => man.manufacturer).filter(Boolean);
  }

  async getSuppliers(branchId: string) {
    const suppliers = await this.prisma.supplier.findMany({
      where: { branchId, isActive: true },
      select: { id: true, name: true, contactPerson: true, phone: true },
    });

    return suppliers;
  }

  async getStorageLocations(branchId: string) {
    const locations = await this.prisma.inventoryItem.findMany({
      where: { branchId },
      select: { storageLocation: true },
      distinct: ['storageLocation'],
    });

    return locations.map(loc => loc.storageLocation).filter(Boolean);
  }

  async getInventoryDashboard(branchId: string) {
    const [
      totalItems,
      totalValue,
      lowStockCount,
      expiredCount,
      recentTransactions,
      topMovingItems,
    ] = await Promise.all([
      this.prisma.inventoryItem.count({ where: { branchId } }),
      this.prisma.inventoryItem.aggregate({
        where: { branchId },
        _sum: { currentStock: true },
      }),
      this.prisma.inventoryItem.count({
        where: {
          branchId,
          currentStock: { lte: 10 },
        },
      }),
      this.prisma.inventoryItem.count({
        where: {
          branchId,
          expiryDate: { lt: new Date() },
        },
      }),
      this.prisma.stockTransaction.findMany({
        where: { branchId },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          item: { select: { id: true, name: true } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.stockTransaction.groupBy({
        by: ['itemId'],
        where: { branchId },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
    ]);

    return {
      summary: {
        totalItems,
        totalValue: totalValue._sum.currentStock || 0,
        lowStockCount,
        expiredCount,
      },
      recentTransactions: recentTransactions.map(t => this.formatStockTransaction(t)),
      topMovingItems,
    };
  }
}
