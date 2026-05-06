import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export enum PharmacyPurchaseBillTypeDto {
  CASH = 'CASH',
  CREDIT = 'CREDIT',
}

export enum PharmacyPurchaseInvoiceSourceDto {
  MANUAL = 'MANUAL',
  OCR = 'OCR',
}

export enum PharmacyPurchaseMasterActionDto {
  MATCH_EXISTING = 'MATCH_EXISTING',
  CREATE_NEW = 'CREATE_NEW',
}

const toNumber = ({ value }: { value: unknown }) => {
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
};

const toOptionalNumber = ({ value }: { value: unknown }) => {
  if (value === '' || value === null || value === undefined) return undefined;
  return toNumber({ value });
};

export class CreatePharmacyPurchaseInvoiceItemDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  serialNumber?: number;

  @ApiProperty({ example: 'Azithral 500 Tablet' })
  @IsString()
  productName: string;

  @ApiProperty({ example: 'Alembic Pharmaceuticals' })
  @IsString()
  manufacturer: string;

  @ApiProperty({ example: 'Strip of 3' })
  @IsString()
  packSize: string;

  @ApiProperty({ example: 'Tablet' })
  @IsString()
  packUnitType: string;

  @ApiProperty({ example: '3004' })
  @IsString()
  hsnCode: string;

  @ApiProperty({ example: 'AZT2401' })
  @IsString()
  batchNumber: string;

  @ApiProperty({ example: 12 })
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(12)
  expiryMonth: number;

  @ApiProperty({ example: 2027 })
  @Transform(toNumber)
  @IsInt()
  @Min(2020)
  @Max(2100)
  expiryYear: number;

  @ApiProperty({ example: 20 })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  quantityPurchased: number;

  @ApiPropertyOptional({ example: 2, default: 0 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  @Min(0)
  freeQuantity?: number = 0;

  @ApiProperty({ example: 78 })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  mrp: number;

  @ApiPropertyOptional({ example: 72 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  @Min(0)
  oldMrp?: number;

  @ApiProperty({ example: 10 })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent: number;

  @ApiPropertyOptional({ example: 2, default: 0 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  @Min(0)
  @Max(100)
  specialDiscountPercent?: number = 0;

  @ApiProperty({ example: 52.5 })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  purchaseRate: number;

  @ApiProperty({ example: 1050 })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  taxableAmount: number;

  @ApiPropertyOptional({ example: 6, default: 0 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  @Min(0)
  @Max(100)
  cgstPercent?: number = 0;

  @ApiPropertyOptional({ example: 6, default: 0 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  @Min(0)
  @Max(100)
  sgstPercent?: number = 0;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  @Min(0)
  @Max(100)
  igstPercent?: number = 0;

  @ApiProperty({ example: 126 })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  gstAmount: number;

  @ApiProperty({ example: 1176 })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  lineTotal: number;

  @ApiPropertyOptional({ example: 0.94 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  @Min(0)
  @Max(1)
  ocrConfidence?: number;

  @ApiPropertyOptional({
    type: [String],
    example: ['low_confidence_batchNumber'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ocrFlags?: string[];
}

export class CreatePharmacyPurchaseInvoiceDto {
  @ApiProperty({ example: 'Linae Distributors' })
  @IsString()
  distributorName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  distributorAddress?: string;

  @ApiProperty({ example: '36ABCDE1234F1Z5' })
  @IsString()
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/)
  distributorGstin: string;

  @ApiProperty({ example: 'TS/HYD/20B/12345' })
  @IsString()
  distributorDlNo: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  distributorFoodLicense?: string;

  @ApiProperty({ example: 'LD-2026-0001' })
  @IsString()
  invoiceNumber: string;

  @ApiProperty({ example: '2026-03-01' })
  @IsDateString()
  invoiceDate: string;

  @ApiPropertyOptional({ example: '2026-03-02' })
  @IsOptional()
  @IsDateString()
  goodsReceivedDate?: string;

  @ApiProperty({ enum: PharmacyPurchaseBillTypeDto })
  @IsEnum(PharmacyPurchaseBillTypeDto)
  billType: PharmacyPurchaseBillTypeDto;

  @ApiPropertyOptional({ example: '2026-04-15' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eWayBillNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  casesTransport?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lrNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salesmanName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salesmanContact?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buyerCode?: string;

  @ApiProperty({ example: 'Dr. Shravya / TS-MC-12345' })
  @IsString()
  doctorNameOrRegNo: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  urcCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  handwrittenNotes?: string;

  @ApiPropertyOptional({
    enum: PharmacyPurchaseInvoiceSourceDto,
    default: PharmacyPurchaseInvoiceSourceDto.MANUAL,
  })
  @IsOptional()
  @IsEnum(PharmacyPurchaseInvoiceSourceDto)
  source?: PharmacyPurchaseInvoiceSourceDto =
    PharmacyPurchaseInvoiceSourceDto.MANUAL;

  @ApiProperty({ example: 1200 })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  grossAmount: number;

  @ApiPropertyOptional({ example: 100, default: 0 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  @Min(0)
  tradeDiscount?: number = 0;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  specialDiscount?: number = 0;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  cashDiscount?: number = 0;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  damageAdjustment?: number = 0;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  visibilityAmount?: number = 0;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  creditDebitAdjustment?: number = 0;

  @ApiProperty({ example: 1100 })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  taxableAmount: number;

  @ApiPropertyOptional({ example: 66, default: 0 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  @Min(0)
  totalCgst?: number = 0;

  @ApiPropertyOptional({ example: 66, default: 0 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  @Min(0)
  totalSgst?: number = 0;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  @Min(0)
  totalIgst?: number = 0;

  @ApiProperty({ example: 132 })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  totalGst: number;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  @Min(0)
  tcsAmount?: number = 0;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  rounding?: number = 0;

  @ApiProperty({ example: 1232 })
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  netPayable: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ocrFlags?: string[];

  @ApiProperty({ type: [CreatePharmacyPurchaseInvoiceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePharmacyPurchaseInvoiceItemDto)
  items: CreatePharmacyPurchaseInvoiceItemDto[];
}

export class QueryPharmacyPurchaseInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  distributorGstin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ default: 'invoiceDate' })
  @IsOptional()
  @IsIn([
    'invoiceDate',
    'createdAt',
    'updatedAt',
    'netPayable',
    'invoiceNumber',
    'status',
  ])
  sortBy?: string = 'invoiceDate';

  @ApiPropertyOptional({ default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class QueryPharmacyPurchaseAnalyticsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  distributorGstin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hsnCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  @Min(0)
  @Max(100)
  minDiscountDropPercent?: number = 5;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}

export class ReviewPharmacyPurchaseInvoiceDto {
  @ApiPropertyOptional({ example: '2026-03-02' })
  @IsOptional()
  @IsDateString()
  goodsReceivedDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  handwrittenNotes?: string;
}

export class SuggestPharmacyPurchaseMasterMatchesDto {
  @ApiProperty({ type: [CreatePharmacyPurchaseInvoiceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePharmacyPurchaseInvoiceItemDto)
  items: CreatePharmacyPurchaseInvoiceItemDto[];
}

export class ConfirmPharmacyPurchaseMasterDto {
  @ApiProperty({ enum: PharmacyPurchaseMasterActionDto })
  @IsEnum(PharmacyPurchaseMasterActionDto)
  action: PharmacyPurchaseMasterActionDto;

  @ApiPropertyOptional({ example: 'drug-123' })
  @IsOptional()
  @IsString()
  drugId?: string;

  @ApiProperty({ type: CreatePharmacyPurchaseInvoiceItemDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreatePharmacyPurchaseInvoiceItemDto)
  item: CreatePharmacyPurchaseInvoiceItemDto;
}
