import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
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
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Permissions } from '../../shared/decorators/permissions.decorator';
import { UserRole } from '@prisma/client';

interface AuthenticatedRequest {
  user: {
    id: string;
    branchId: string;
    role: string;
  };
}

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // Inventory Item Management
  @Post('items')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:item:create')
  createInventoryItem(
    @Body() createItemDto: CreateInventoryItemDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.createInventoryItem(createItemDto, req.user.branchId);
  }

  @Get('items')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:item:read')
  findAllInventoryItems(
    @Query() query: QueryInventoryItemsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.findAllInventoryItems(query, req.user.branchId);
  }

  @Get('items/:id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:item:read')
  findInventoryItemById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.findInventoryItemById(id, req.user.branchId);
  }

  @Patch('items/:id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:item:update')
  updateInventoryItem(
    @Param('id') id: string,
    @Body() updateItemDto: UpdateInventoryItemDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.updateInventoryItem(id, updateItemDto, req.user.branchId);
  }

  @Delete('items/:id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:item:delete')
  deleteInventoryItem(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.deleteInventoryItem(id, req.user.branchId);
  }

  // Stock Transaction Management
  @Post('transactions')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:transaction:create')
  createStockTransaction(
    @Body() createTransactionDto: CreateStockTransactionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.createStockTransaction(
      createTransactionDto,
      req.user.branchId,
      req.user.id,
    );
  }

  @Get('transactions')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:transaction:read')
  findAllStockTransactions(
    @Query() query: QueryStockTransactionsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.findAllStockTransactions(query, req.user.branchId);
  }

  @Get('transactions/:id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:transaction:read')
  findStockTransactionById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.findStockTransactionById(id, req.user.branchId);
  }

  @Patch('transactions/:id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:transaction:update')
  updateStockTransaction(
    @Param('id') id: string,
    @Body() updateTransactionDto: UpdateStockTransactionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.updateStockTransaction(id, updateTransactionDto, req.user.branchId);
  }

  @Delete('transactions/:id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:transaction:delete')
  deleteStockTransaction(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.deleteStockTransaction(id, req.user.branchId);
  }

  // Bulk Operations
  @Post('transactions/bulk')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:transaction:bulk')
  bulkStockUpdate(
    @Body() bulkUpdateDto: BulkStockUpdateDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.bulkStockUpdate(bulkUpdateDto, req.user.branchId, req.user.id);
  }

  @Post('adjustments')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:adjustment:create')
  adjustStock(
    @Body() stockAdjustmentDto: StockAdjustmentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.adjustStock(stockAdjustmentDto, req.user.branchId, req.user.id);
  }

  @Post('transfers')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:transfer:create')
  transferStock(
    @Body() stockTransferDto: StockTransferDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.transferStock(stockTransferDto, req.user.branchId, req.user.id);
  }

  // Purchase Order Management
  @Post('purchase-orders')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:po:create')
  createPurchaseOrder(
    @Body() createOrderDto: CreatePurchaseOrderDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.createPurchaseOrder(createOrderDto, req.user.branchId, req.user.id);
  }

  @Get('purchase-orders')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:po:read')
  findAllPurchaseOrders(
    @Query() query: QueryPurchaseOrdersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.findAllPurchaseOrders(query, req.user.branchId);
  }

  @Get('purchase-orders/:id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:po:read')
  findPurchaseOrderById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.findPurchaseOrderById(id, req.user.branchId);
  }

  @Patch('purchase-orders/:id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:po:update')
  updatePurchaseOrder(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdatePurchaseOrderDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.updatePurchaseOrder(id, updateOrderDto, req.user.branchId);
  }

  @Delete('purchase-orders/:id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:po:delete')
  deletePurchaseOrder(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.deletePurchaseOrder(id, req.user.branchId);
  }

  // Supplier Management
  @Post('suppliers')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:supplier:create')
  createSupplier(
    @Body() createSupplierDto: CreateSupplierDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.createSupplier(createSupplierDto, req.user.branchId);
  }

  @Get('suppliers')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:supplier:read')
  findAllSuppliers(
    @Query() query: QuerySuppliersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.findAllSuppliers(query, req.user.branchId);
  }

  @Get('suppliers/:id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:supplier:read')
  findSupplierById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.findSupplierById(id, req.user.branchId);
  }

  @Patch('suppliers/:id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:supplier:update')
  updateSupplier(
    @Param('id') id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.updateSupplier(id, updateSupplierDto, req.user.branchId);
  }

  @Delete('suppliers/:id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:supplier:delete')
  deleteSupplier(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.deleteSupplier(id, req.user.branchId);
  }

  // Reports and Analytics
  @Get('reports/stock')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:report:stock')
  getStockReport(
    @Query() query: StockReportDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.getStockReport(query, req.user.branchId);
  }

  @Get('statistics')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:statistics:read')
  getInventoryStatistics(
    @Query() query: InventoryStatisticsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.getInventoryStatistics(query, req.user.branchId);
  }

  @Get('alerts/low-stock')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:alerts:lowStock')
  getLowStockAlerts(
    @Query() query: LowStockAlertDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.getLowStockAlerts(query, req.user.branchId);
  }

  @Get('alerts/expiry')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:alerts:expiry')
  getExpiryAlerts(
    @Query() query: ExpiryAlertDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.getExpiryAlerts(query, req.user.branchId);
  }

  @Get('movement')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:movement:read')
  getInventoryMovement(
    @Query() query: InventoryMovementDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.getInventoryMovement(query, req.user.branchId);
  }

  // Search Functions
  @Get('search/barcode')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:search:barcode')
  searchByBarcode(
    @Query() query: BarcodeSearchDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.searchByBarcode(query, req.user.branchId);
  }

  @Get('search/sku')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:search:sku')
  searchBySku(
    @Query() query: SkuSearchDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.searchBySku(query, req.user.branchId);
  }

  // Additional Utility Endpoints
  @Get('categories')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:catalog:categories')
  getCategories(@Request() req: AuthenticatedRequest) {
    return this.inventoryService.getCategories(req.user.branchId);
  }

  @Get('manufacturers')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:catalog:manufacturers')
  getManufacturers(@Request() req: AuthenticatedRequest) {
    return this.inventoryService.getManufacturers(req.user.branchId);
  }

  @Get('suppliers')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:supplier:read')
  getSuppliers(@Request() req: AuthenticatedRequest) {
    return this.inventoryService.getSuppliers(req.user.branchId);
  }

  @Get('storage-locations')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:storage:read')
  getStorageLocations(@Request() req: AuthenticatedRequest) {
    return this.inventoryService.getStorageLocations(req.user.branchId);
  }

  @Get('dashboard')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('inventory:dashboard:read')
  getInventoryDashboard(@Request() req: AuthenticatedRequest) {
    return this.inventoryService.getInventoryDashboard(req.user.branchId);
  }
}
