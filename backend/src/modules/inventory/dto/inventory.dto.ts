import { IsString, IsNumber, IsOptional, IsEnum, IsArray, ValidateNested, IsDateString, IsBoolean, Min, Max, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

// Enums
export enum InventoryItemType {
  MEDICINE = 'MEDICINE',
  EQUIPMENT = 'EQUIPMENT',
  SUPPLY = 'SUPPLY',
  CONSUMABLE = 'CONSUMABLE',
}

export enum InventoryStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DISCONTINUED = 'DISCONTINUED',
}

export enum StockStatus {
  IN_STOCK = 'IN_STOCK',
  LOW_STOCK = 'LOW_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  EXPIRED = 'EXPIRED',
}

export enum TransactionType {
  PURCHASE = 'PURCHASE',
  SALE = 'SALE',
  RETURN = 'RETURN',
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER = 'TRANSFER',
  EXPIRED = 'EXPIRED',
  DAMAGED = 'DAMAGED',
}

export enum UnitType {
  PIECES = 'PIECES',
  BOXES = 'BOXES',
  BOTTLES = 'BOTTLES',
  STRIPS = 'STRIPS',
  TUBES = 'TUBES',
  VIALS = 'VIALS',
  AMPOULES = 'AMPOULES',
  SYRINGES = 'SYRINGES',
  PACKS = 'PACKS',
  KITS = 'KITS',
}

// Inventory Item DTOs
export class CreateInventoryItemDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  genericName?: string;

  @IsString()
  @IsOptional()
  brandName?: string;

  @IsEnum(InventoryItemType)
  type: InventoryItemType;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  subCategory?: string;

  @IsString()
  @IsOptional()
  manufacturer?: string;

  @IsString()
  @IsOptional()
  supplier?: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsNumber()
  @Min(0)
  costPrice: number;

  @IsNumber()
  @Min(0)
  sellingPrice: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  mrp?: number;

  @IsEnum(UnitType)
  unit: UnitType;

  @IsNumber()
  @Min(0)
  @IsOptional()
  packSize?: number;

  @IsString()
  @IsOptional()
  packUnit?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minStockLevel?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxStockLevel?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  reorderLevel?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  reorderQuantity?: number;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsString()
  @IsOptional()
  hsnCode?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  gstRate?: number;

  @IsBoolean()
  @IsOptional()
  requiresPrescription?: boolean;

  @IsBoolean()
  @IsOptional()
  isControlled?: boolean;

  @IsString()
  @IsOptional()
  storageLocation?: string;

  @IsString()
  @IsOptional()
  storageConditions?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsEnum(InventoryStatus)
  @IsOptional()
  status?: InventoryStatus;
}

export class UpdateInventoryItemDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  genericName?: string;

  @IsString()
  @IsOptional()
  brandName?: string;

  @IsEnum(InventoryItemType)
  @IsOptional()
  type?: InventoryItemType;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  subCategory?: string;

  @IsString()
  @IsOptional()
  manufacturer?: string;

  @IsString()
  @IsOptional()
  supplier?: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  costPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  sellingPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  mrp?: number;

  @IsEnum(UnitType)
  @IsOptional()
  unit?: UnitType;

  @IsNumber()
  @Min(0)
  @IsOptional()
  packSize?: number;

  @IsString()
  @IsOptional()
  packUnit?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minStockLevel?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxStockLevel?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  reorderLevel?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  reorderQuantity?: number;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsString()
  @IsOptional()
  hsnCode?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  gstRate?: number;

  @IsBoolean()
  @IsOptional()
  requiresPrescription?: boolean;

  @IsBoolean()
  @IsOptional()
  isControlled?: boolean;

  @IsString()
  @IsOptional()
  storageLocation?: string;

  @IsString()
  @IsOptional()
  storageConditions?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsEnum(InventoryStatus)
  @IsOptional()
  status?: InventoryStatus;
}

// Stock Transaction DTOs
export class CreateStockTransactionDto {
  @IsString()
  itemId: string;

  @IsEnum(TransactionType)
  type: TransactionType;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  unitPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  totalAmount?: number;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @IsString()
  @IsOptional()
  supplier?: string;

  @IsString()
  @IsOptional()
  customer?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  location?: string;
}

export class UpdateStockTransactionDto {
  @IsEnum(TransactionType)
  @IsOptional()
  type?: TransactionType;

  @IsNumber()
  @Min(0)
  @IsOptional()
  quantity?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  unitPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  totalAmount?: number;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @IsString()
  @IsOptional()
  supplier?: string;

  @IsString()
  @IsOptional()
  customer?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  location?: string;
}

// Bulk Operations DTOs
export class BulkStockUpdateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStockTransactionDto)
  transactions: CreateStockTransactionDto[];
}

export class StockAdjustmentDto {
  @IsString()
  itemId: string;

  @IsNumber()
  adjustmentQuantity: number;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;
}

export class StockTransferDto {
  @IsString()
  itemId: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsString()
  fromLocation: string;

  @IsString()
  toLocation: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;
}

// Purchase Order DTOs
export class CreatePurchaseOrderDto {
  @IsString()
  supplier: string;

  @IsDateString()
  @IsOptional()
  orderDate?: string;

  @IsDateString()
  @IsOptional()
  expectedDeliveryDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];
}

export class PurchaseOrderItemDto {
  @IsString()
  itemId: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  tax?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdatePurchaseOrderDto {
  @IsString()
  @IsOptional()
  supplier?: string;

  @IsDateString()
  @IsOptional()
  orderDate?: string;

  @IsDateString()
  @IsOptional()
  expectedDeliveryDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  @IsOptional()
  items?: PurchaseOrderItemDto[];
}

// Supplier DTOs
export class CreateSupplierDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  contactPerson?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  pincode?: string;

  @IsString()
  @IsOptional()
  gstNumber?: string;

  @IsString()
  @IsOptional()
  panNumber?: string;

  @IsString()
  @IsOptional()
  bankDetails?: string;

  @IsString()
  @IsOptional()
  paymentTerms?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateSupplierDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  contactPerson?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  pincode?: string;

  @IsString()
  @IsOptional()
  gstNumber?: string;

  @IsString()
  @IsOptional()
  panNumber?: string;

  @IsString()
  @IsOptional()
  bankDetails?: string;

  @IsString()
  @IsOptional()
  paymentTerms?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
