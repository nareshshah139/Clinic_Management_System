import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { 
  IsString, 
  IsNumber, 
  IsOptional, 
  IsBoolean, 
  IsArray, 
  ValidateNested, 
  Min, 
  Max,
  IsEnum
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

// Enums
export enum PharmacyPackageCategory {
  DERMATOLOGY = 'Dermatology',
  GENERAL = 'General'
}

export enum PharmacyPackageSubcategory {
  ACNE_TREATMENT = 'Acne Treatment',
  ANTI_AGING = 'Anti-aging',
  HAIR_CARE = 'Hair Care',
  PIGMENTATION = 'Pigmentation',
  ECZEMA_PSORIASIS = 'Eczema/Psoriasis',
  FUNGAL_INFECTIONS = 'Fungal Infections',
  WOUND_CARE = 'Wound Care',
  MOISTURIZING = 'Moisturizing',
  SUN_PROTECTION = 'Sun Protection',
  POST_PROCEDURE = 'Post-procedure Care'
}

// Package Item DTO
export class PharmacyPackageItemDto {
  @ApiProperty({ description: 'Drug ID', example: 'drug-123' })
  @IsString()
  drugId: string;

  @ApiProperty({ description: 'Quantity', example: 1, minimum: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ description: 'Dosage instructions', example: 'Apply thin layer' })
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional({ description: 'Frequency', example: 'Twice daily' })
  @IsOptional()
  @IsString()
  frequency?: string;

  @ApiPropertyOptional({ description: 'Duration', example: '4 weeks' })
  @IsOptional()
  @IsString()
  duration?: string;

  @ApiPropertyOptional({ description: 'Special instructions', example: 'Use after cleansing' })
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional({ description: 'Application sequence', example: 1, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sequence?: number;
}

// Create Package DTO
export class CreatePharmacyPackageDto {
  @ApiProperty({ description: 'Package name', example: 'Complete Acne Treatment Kit' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Package description', example: 'Comprehensive 4-week acne treatment regimen' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ 
    description: 'Package category', 
    enum: PharmacyPackageCategory,
    default: PharmacyPackageCategory.DERMATOLOGY 
  })
  @IsOptional()
  @IsEnum(PharmacyPackageCategory)
  category?: PharmacyPackageCategory;

  @ApiPropertyOptional({ 
    description: 'Package subcategory', 
    enum: PharmacyPackageSubcategory,
    example: PharmacyPackageSubcategory.ACNE_TREATMENT 
  })
  @IsOptional()
  @IsEnum(PharmacyPackageSubcategory)
  subcategory?: PharmacyPackageSubcategory;

  @ApiProperty({ description: 'Package price', example: 2500.00, minimum: 0 })
  @IsNumber()
  @Min(0)
  packagePrice: number;

  @ApiPropertyOptional({ description: 'Discount percentage', example: 15, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({ description: 'Treatment duration', example: '4 weeks' })
  @IsOptional()
  @IsString()
  duration?: string;

  @ApiPropertyOptional({ description: 'Usage instructions', example: 'Follow the sequence as prescribed' })
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional({ description: 'Medical indications', example: 'Moderate to severe acne vulgaris' })
  @IsOptional()
  @IsString()
  indications?: string;

  @ApiPropertyOptional({ description: 'Contraindications', example: 'Pregnancy, breastfeeding' })
  @IsOptional()
  @IsString()
  contraindications?: string;

  @ApiPropertyOptional({ description: 'Make package public for all doctors', default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiProperty({ description: 'Package items', type: [PharmacyPackageItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PharmacyPackageItemDto)
  items: PharmacyPackageItemDto[];
}

// Update Package DTO
export class UpdatePharmacyPackageDto extends PartialType(CreatePharmacyPackageDto) {
  @ApiPropertyOptional({ description: 'Active status', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// Query Package DTO
export class QueryPharmacyPackageDto {
  @ApiPropertyOptional({ description: 'Search by name', example: 'acne' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ 
    description: 'Filter by category', 
    enum: PharmacyPackageCategory 
  })
  @IsOptional()
  @IsEnum(PharmacyPackageCategory)
  category?: PharmacyPackageCategory;

  @ApiPropertyOptional({ 
    description: 'Filter by subcategory', 
    enum: PharmacyPackageSubcategory 
  })
  @IsOptional()
  @IsEnum(PharmacyPackageSubcategory)
  subcategory?: PharmacyPackageSubcategory;

  @ApiPropertyOptional({ description: 'Filter by creator (doctor ID)', example: 'doctor-123' })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiPropertyOptional({ description: 'Include only active packages', default: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Include only public packages', example: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: 'Page number', example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Sort by field', example: 'name' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', enum: ['asc', 'desc'], example: 'asc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

// Response DTOs
export class PharmacyPackageItemResponseDto {
  @ApiProperty({ description: 'Item ID', example: 'item-123' })
  id: string;

  @ApiProperty({ description: 'Drug ID', example: 'drug-123' })
  drugId: string;

  @ApiProperty({ description: 'Quantity', example: 1 })
  quantity: number;

  @ApiPropertyOptional({ description: 'Dosage instructions', example: 'Apply thin layer' })
  dosage?: string;

  @ApiPropertyOptional({ description: 'Frequency', example: 'Twice daily' })
  frequency?: string;

  @ApiPropertyOptional({ description: 'Duration', example: '4 weeks' })
  duration?: string;

  @ApiPropertyOptional({ description: 'Special instructions', example: 'Use after cleansing' })
  instructions?: string;

  @ApiProperty({ description: 'Application sequence', example: 1 })
  sequence: number;

  @ApiProperty({ description: 'Drug details' })
  drug: {
    id: string;
    name: string;
    price: number;
    manufacturerName: string;
    packSizeLabel: string;
    category?: string;
    dosageForm?: string;
    strength?: string;
  };
}

export class PharmacyPackageResponseDto {
  @ApiProperty({ description: 'Package ID', example: 'package-123' })
  id: string;

  @ApiProperty({ description: 'Package name', example: 'Complete Acne Treatment Kit' })
  name: string;

  @ApiPropertyOptional({ description: 'Package description' })
  description?: string;

  @ApiProperty({ description: 'Package category', example: 'Dermatology' })
  category: string;

  @ApiPropertyOptional({ description: 'Package subcategory', example: 'Acne Treatment' })
  subcategory?: string;

  @ApiProperty({ description: 'Original price (sum of individual drugs)', example: 3000.00 })
  originalPrice: number;

  @ApiProperty({ description: 'Package price', example: 2500.00 })
  packagePrice: number;

  @ApiProperty({ description: 'Discount percentage', example: 16.67 })
  discountPercent: number;

  @ApiPropertyOptional({ description: 'Treatment duration', example: '4 weeks' })
  duration?: string;

  @ApiPropertyOptional({ description: 'Usage instructions' })
  instructions?: string;

  @ApiPropertyOptional({ description: 'Medical indications' })
  indications?: string;

  @ApiPropertyOptional({ description: 'Contraindications' })
  contraindications?: string;

  @ApiPropertyOptional({ description: 'Creator ID', example: 'doctor-123' })
  createdBy?: string;

  @ApiProperty({ description: 'Active status', example: true })
  isActive: boolean;

  @ApiProperty({ description: 'Public status', example: false })
  isPublic: boolean;

  @ApiProperty({ description: 'Branch ID', example: 'branch-123' })
  branchId: string;

  @ApiProperty({ description: 'Creation date', example: '2024-01-01T00:00:00Z' })
  createdAt: string;

  @ApiProperty({ description: 'Last updated date', example: '2024-01-01T00:00:00Z' })
  updatedAt: string;

  @ApiPropertyOptional({ description: 'Creator details' })
  creator?: {
    id: string;
    firstName: string;
    lastName: string;
    department?: string;
  };

  @ApiProperty({ description: 'Package items', type: [PharmacyPackageItemResponseDto] })
  items: PharmacyPackageItemResponseDto[];
}

export class PharmacyPackageListResponseDto {
  @ApiProperty({ description: 'List of packages', type: [PharmacyPackageResponseDto] })
  packages: PharmacyPackageResponseDto[];

  @ApiProperty({ description: 'Total count', example: 25 })
  total: number;

  @ApiProperty({ description: 'Current page', example: 1 })
  page: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  limit: number;

  @ApiProperty({ description: 'Total pages', example: 2 })
  totalPages: number;
} 