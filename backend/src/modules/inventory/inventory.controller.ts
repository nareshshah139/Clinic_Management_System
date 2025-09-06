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
  createInventoryItem(
    @Body() createItemDto: CreateInventoryItemDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.createInventoryItem(createItemDto, req.user.branchId);
  }

  @Get('items')
  findAllInventoryItems(
    @Query() query: QueryInventoryItemsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.findAllInventoryItems(query, req.user.branchId);
  }

  @Get('items/:id')
  findInventoryItemById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.findInventoryItemById(id, req.user.branchId);
  }

  @Patch('items/:id')
  updateInventoryItem(
    @Param('id') id: string,
    @Body() updateItemDto: UpdateInventoryItemDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.updateInventoryItem(id, updateItemDto, req.user.branchId);
  }

  @Delete('items/:id')
  deleteInventoryItem(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.deleteInventoryItem(id, req.user.branchId);
  }

  // Stock Transaction Management
  @Post('transactions')
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
  findAllStockTransactions(
    @Query() query: QueryStockTransactionsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.findAllStockTransactions(query, req.user.branchId);
  }

  @Get('transactions/:id')
  findStockTransactionById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.findStockTransactionById(id, req.user.branchId);
  }

  @Patch('transactions/:id')
  updateStockTransaction(
    @Param('id') id: string,
    @Body() updateTransactionDto: UpdateStockTransactionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.updateStockTransaction(id, updateTransactionDto, req.user.branchId);
  }

  @Delete('transactions/:id')
  deleteStockTransaction(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.deleteStockTransaction(id, req.user.branchId);
  }

  // Bulk Operations
  @Post('transactions/bulk')
  bulkStockUpdate(
    @Body() bulkUpdateDto: BulkStockUpdateDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.bulkStockUpdate(bulkUpdateDto, req.user.branchId, req.user.id);
  }

  @Post('adjustments')
  adjustStock(
    @Body() stockAdjustmentDto: StockAdjustmentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.adjustStock(stockAdjustmentDto, req.user.branchId, req.user.id);
  }

  @Post('transfers')
  transferStock(
    @Body() stockTransferDto: StockTransferDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.transferStock(stockTransferDto, req.user.branchId, req.user.id);
  }

  // Purchase Order Management
  @Post('purchase-orders')
  createPurchaseOrder(
    @Body() createOrderDto: CreatePurchaseOrderDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.createPurchaseOrder(createOrderDto, req.user.branchId, req.user.id);
  }

  @Get('purchase-orders')
  findAllPurchaseOrders(
    @Query() query: QueryPurchaseOrdersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.findAllPurchaseOrders(query, req.user.branchId);
  }

  @Get('purchase-orders/:id')
  findPurchaseOrderById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.findPurchaseOrderById(id, req.user.branchId);
  }

  @Patch('purchase-orders/:id')
  updatePurchaseOrder(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdatePurchaseOrderDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.updatePurchaseOrder(id, updateOrderDto, req.user.branchId);
  }

  @Delete('purchase-orders/:id')
  deletePurchaseOrder(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.deletePurchaseOrder(id, req.user.branchId);
  }

  // Supplier Management
  @Post('suppliers')
  createSupplier(
    @Body() createSupplierDto: CreateSupplierDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.createSupplier(createSupplierDto, req.user.branchId);
  }

  @Get('suppliers')
  findAllSuppliers(
    @Query() query: QuerySuppliersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.findAllSuppliers(query, req.user.branchId);
  }

  @Get('suppliers/:id')
  findSupplierById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.findSupplierById(id, req.user.branchId);
  }

  @Patch('suppliers/:id')
  updateSupplier(
    @Param('id') id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.updateSupplier(id, updateSupplierDto, req.user.branchId);
  }

  @Delete('suppliers/:id')
  deleteSupplier(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.deleteSupplier(id, req.user.branchId);
  }

  // Reports and Analytics
  @Get('reports/stock')
  getStockReport(
    @Query() query: StockReportDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.getStockReport(query, req.user.branchId);
  }

  @Get('statistics')
  getInventoryStatistics(
    @Query() query: InventoryStatisticsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.getInventoryStatistics(query, req.user.branchId);
  }

  @Get('alerts/low-stock')
  getLowStockAlerts(
    @Query() query: LowStockAlertDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.getLowStockAlerts(query, req.user.branchId);
  }

  @Get('alerts/expiry')
  getExpiryAlerts(
    @Query() query: ExpiryAlertDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.getExpiryAlerts(query, req.user.branchId);
  }

  @Get('movement')
  getInventoryMovement(
    @Query() query: InventoryMovementDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.getInventoryMovement(query, req.user.branchId);
  }

  // Search Functions
  @Get('search/barcode')
  searchByBarcode(
    @Query() query: BarcodeSearchDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.searchByBarcode(query, req.user.branchId);
  }

  @Get('search/sku')
  searchBySku(
    @Query() query: SkuSearchDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.searchBySku(query, req.user.branchId);
  }

  // Additional Utility Endpoints
  @Get('categories')
  getCategories(@Request() req: AuthenticatedRequest) {
    return this.inventoryService.getCategories(req.user.branchId);
  }

  @Get('manufacturers')
  getManufacturers(@Request() req: AuthenticatedRequest) {
    return this.inventoryService.getManufacturers(req.user.branchId);
  }

  @Get('suppliers')
  getSuppliers(@Request() req: AuthenticatedRequest) {
    return this.inventoryService.getSuppliers(req.user.branchId);
  }

  @Get('storage-locations')
  getStorageLocations(@Request() req: AuthenticatedRequest) {
    return this.inventoryService.getStorageLocations(req.user.branchId);
  }

  @Get('dashboard')
  getInventoryDashboard(@Request() req: AuthenticatedRequest) {
    return this.inventoryService.getInventoryDashboard(req.user.branchId);
  }
}
