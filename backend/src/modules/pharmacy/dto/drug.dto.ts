import { IsString, IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateDrugDto {
  @ApiProperty({ description: 'Drug name', example: 'Paracetamol 500mg Tablet' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Drug price in rupees', example: 25.50 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ description: 'Manufacturer name', example: 'Sun Pharmaceuticals' })
  @IsString()
  manufacturerName: string;

  @ApiPropertyOptional({ description: 'Drug type', example: 'allopathy', default: 'allopathy' })
  @IsOptional()
  @IsString()
  type?: string = 'allopathy';

  @ApiProperty({ description: 'Pack size label', example: 'strip of 10 tablets' })
  @IsString()
  packSizeLabel: string;

  @ApiPropertyOptional({ description: 'Primary composition', example: 'Paracetamol (500mg)' })
  @IsOptional()
  @IsString()
  composition1?: string;

  @ApiPropertyOptional({ description: 'Secondary composition', example: 'Caffeine (65mg)' })
  @IsOptional()
  @IsString()
  composition2?: string;

  @ApiPropertyOptional({ description: 'Barcode', example: '1234567890123' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ description: 'SKU', example: 'PAR-500-TAB-10' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ description: 'Category', example: 'Analgesics' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Dosage form', example: 'Tablet' })
  @IsOptional()
  @IsString()
  dosageForm?: string;

  @ApiPropertyOptional({ description: 'Strength', example: '500mg' })
  @IsOptional()
  @IsString()
  strength?: string;

  @ApiPropertyOptional({ description: 'Storage conditions', example: 'Store in cool, dry place' })
  @IsOptional()
  @IsString()
  storageConditions?: string;

  @ApiPropertyOptional({ description: 'Expiry months', example: 24, default: 24 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(120)
  expiryMonths?: number = 24;

  @ApiPropertyOptional({ description: 'Minimum stock level', example: 10, default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minStockLevel?: number = 10;

  @ApiPropertyOptional({ description: 'Maximum stock level', example: 1000, default: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxStockLevel?: number = 1000;

  @ApiPropertyOptional({ description: 'Is drug discontinued', default: false })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  @IsBoolean()
  isDiscontinued?: boolean = false;

  @ApiPropertyOptional({ description: 'Is drug active', default: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  @IsBoolean()
  isActive?: boolean = true;
}

export class UpdateDrugDto {
  @ApiPropertyOptional({ description: 'Drug name', example: 'Paracetamol 500mg Tablet' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Drug price in rupees', example: 25.50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: 'Manufacturer name', example: 'Sun Pharmaceuticals' })
  @IsOptional()
  @IsString()
  manufacturerName?: string;

  @ApiPropertyOptional({ description: 'Drug type', example: 'allopathy' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Pack size label', example: 'strip of 10 tablets' })
  @IsOptional()
  @IsString()
  packSizeLabel?: string;

  @ApiPropertyOptional({ description: 'Primary composition', example: 'Paracetamol (500mg)' })
  @IsOptional()
  @IsString()
  composition1?: string;

  @ApiPropertyOptional({ description: 'Secondary composition', example: 'Caffeine (65mg)' })
  @IsOptional()
  @IsString()
  composition2?: string;

  @ApiPropertyOptional({ description: 'Barcode', example: '1234567890123' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ description: 'SKU', example: 'PAR-500-TAB-10' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ description: 'Category', example: 'Analgesics' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Dosage form', example: 'Tablet' })
  @IsOptional()
  @IsString()
  dosageForm?: string;

  @ApiPropertyOptional({ description: 'Strength', example: '500mg' })
  @IsOptional()
  @IsString()
  strength?: string;

  @ApiPropertyOptional({ description: 'Storage conditions', example: 'Store in cool, dry place' })
  @IsOptional()
  @IsString()
  storageConditions?: string;

  @ApiPropertyOptional({ description: 'Expiry months', example: 24 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(120)
  expiryMonths?: number;

  @ApiPropertyOptional({ description: 'Minimum stock level', example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minStockLevel?: number;

  @ApiPropertyOptional({ description: 'Maximum stock level', example: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxStockLevel?: number;

  @ApiPropertyOptional({ description: 'Is drug discontinued' })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  @IsBoolean()
  isDiscontinued?: boolean;

  @ApiPropertyOptional({ description: 'Is drug active' })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}

export class QueryDrugDto {
  @ApiPropertyOptional({ description: 'Search term', example: 'paracetamol' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Category filter', example: 'Analgesics' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Manufacturer filter', example: 'Sun Pharmaceuticals' })
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiPropertyOptional({ description: 'Drug type filter', example: 'allopathy' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Dosage form filter', example: 'Tablet' })
  @IsOptional()
  @IsString()
  dosageForm?: string;

  @ApiPropertyOptional({ description: 'Include discontinued drugs', default: false })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  @IsBoolean()
  includeDiscontinued?: boolean = false;

  @ApiPropertyOptional({ description: 'Minimum price filter', example: 10 })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? undefined : num;
    }
    return value;
  })
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum price filter', example: 1000 })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? undefined : num;
    }
    return value;
  })
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'Page number', example: 1, default: 1 })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const num = parseInt(value, 10);
      return isNaN(num) ? undefined : num;
    }
    return value;
  })
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', example: 20, default: 20 })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const num = parseInt(value, 10);
      return isNaN(num) ? undefined : num;
    }
    return value;
  })
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
  @ApiPropertyOptional({ description: 'Sort by field', example: 'name' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'name';

  @ApiPropertyOptional({ description: 'Sort order', example: 'asc', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'asc';
}

export class DrugAutocompleteDto {
  @ApiPropertyOptional({ description: 'Search query', example: 'para' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Search mode', example: 'name', enum: ['name', 'ingredient', 'all'], default: 'all' })
  @IsOptional()
  @IsString()
  mode?: 'name' | 'ingredient' | 'all' = 'all';

  @ApiPropertyOptional({ description: 'Limit results', example: 10, default: 10 })
  @IsOptional()
  limit?: number = 10;
}