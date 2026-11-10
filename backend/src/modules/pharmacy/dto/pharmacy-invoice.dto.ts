import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  PharmacyBillDiscountKind,
  PharmacyInvoiceStatus,
  PharmacyPaymentMethod,
  PharmacyPaymentStatus,
} from '@prisma/client';

export class BillDiscountDto {
  @ApiProperty({
    enum: PharmacyBillDiscountKind,
    description: 'PERCENT of the bill after item discounts, or a rupee AMOUNT',
  })
  @IsEnum(PharmacyBillDiscountKind)
  kind: PharmacyBillDiscountKind;

  @ApiProperty({ example: 10 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value: number;
}

// Enum for invoice item types
export enum PharmacyInvoiceItemType {
  DRUG = 'DRUG',
  PACKAGE = 'PACKAGE',
}

export class PharmacyInvoiceItemDto {
  @IsOptional()
  @IsString()
  inventoryItemId?: string;

  @ApiPropertyOptional({
    description: 'Drug ID (required if itemType is DRUG)',
    example: 'drug-123',
  })
  @IsOptional()
  @IsString()
  drugId?: string;

  @ApiPropertyOptional({
    description: 'Package ID (required if itemType is PACKAGE)',
    example: 'package-123',
  })
  @IsOptional()
  @IsString()
  packageId?: string;

  @ApiPropertyOptional({
    description: 'Item type',
    enum: PharmacyInvoiceItemType,
    default: PharmacyInvoiceItemType.DRUG,
  })
  @IsOptional()
  @IsEnum(PharmacyInvoiceItemType)
  itemType?: PharmacyInvoiceItemType = PharmacyInvoiceItemType.DRUG;

  @ApiProperty({ description: 'Quantity', example: 2 })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const num = parseInt(value, 10);
      return isNaN(num) ? undefined : num;
    }
    return value;
  })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'Unit price', example: 25.5 })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? undefined : num;
    }
    return value;
  })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({
    description: 'Discount percentage',
    example: 5,
    default: 0,
  })
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
  @Max(100)
  discountPercent?: number = 0;

  @ApiPropertyOptional({
    description: 'Tax percentage',
    example: 18,
    default: 0,
  })
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
  @Max(100)
  taxPercent?: number = 0;

  @ApiPropertyOptional({
    description: 'Dosage instructions',
    example: '1 tablet twice a day',
  })
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional({ description: 'Frequency', example: 'BID' })
  @IsOptional()
  @IsString()
  frequency?: string;

  @ApiPropertyOptional({ description: 'Duration', example: '7 days' })
  @IsOptional()
  @IsString()
  duration?: string;

  @ApiPropertyOptional({
    description: 'Additional instructions',
    example: 'Take after meals',
  })
  @IsOptional()
  @IsString()
  instructions?: string;
}

export class CreatePharmacyInvoiceDto {
  @ApiProperty({ description: 'Patient ID', example: 'patient-123' })
  @IsString()
  patientId: string;

  @ApiPropertyOptional({ description: 'Doctor ID', example: 'doctor-123' })
  @IsOptional()
  @IsString()
  doctorId?: string;

  @ApiPropertyOptional({
    description: 'Prescription ID',
    example: 'prescription-123',
  })
  @IsOptional()
  @IsString()
  prescriptionId?: string;

  @ApiProperty({ description: 'Payment method', enum: PharmacyPaymentMethod })
  @IsEnum(PharmacyPaymentMethod)
  paymentMethod: PharmacyPaymentMethod;

  @ApiProperty({ description: 'Billing name', example: 'John Doe' })
  @IsString()
  billingName: string;

  @ApiProperty({ description: 'Billing phone', example: '+919876543210' })
  @IsString()
  billingPhone: string;

  @ApiPropertyOptional({
    description: 'Billing address',
    example: '123 Main St',
  })
  @IsOptional()
  @IsString()
  billingAddress?: string;

  @ApiPropertyOptional({ description: 'Billing city', example: 'Mumbai' })
  @IsOptional()
  @IsString()
  billingCity?: string;

  @ApiPropertyOptional({ description: 'Billing state', example: 'Maharashtra' })
  @IsOptional()
  @IsString()
  billingState?: string;

  @ApiPropertyOptional({ description: 'Billing pincode', example: '400001' })
  @IsOptional()
  @IsString()
  billingPincode?: string;

  @ApiPropertyOptional({ description: 'Invoice notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Invoice items', type: [PharmacyInvoiceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PharmacyInvoiceItemDto)
  items: PharmacyInvoiceItemDto[];

  @ApiPropertyOptional({
    type: BillDiscountDto,
    nullable: true,
    description: 'Discount on the whole bill, split across lines before tax',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => BillDiscountDto)
  billDiscount?: BillDiscountDto | null;
}

export class CheckoutPharmacyInvoiceDto extends CreatePharmacyInvoiceDto {
  @ApiProperty({
    description:
      'Stable checkout attempt key. Reuse after an uncertain response.',
  })
  @IsString()
  @Length(1, 128)
  requestKey: string;

  @ApiPropertyOptional({
    description:
      'Saved draft to finish as this bill. Its number is kept and its lines are replaced by this payload.',
  })
  @IsOptional()
  @IsString()
  draftId?: string;

  @ApiPropertyOptional({
    description: 'Version of the draft the payload was edited from.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  draftVersion?: number;
}

export class UpdatePharmacyInvoiceDto {
  @ApiProperty({
    description:
      'Version of the draft the edit was made from. A different current version is refused.',
  })
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiPropertyOptional({ description: 'Patient ID', example: 'patient-123' })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Doctor ID', example: 'doctor-123' })
  @IsOptional()
  @IsString()
  doctorId?: string;

  @ApiPropertyOptional({
    description: 'Prescription ID',
    example: 'prescription-123',
  })
  @IsOptional()
  @IsString()
  prescriptionId?: string;

  @ApiPropertyOptional({
    description: 'Payment method',
    enum: PharmacyPaymentMethod,
  })
  @IsOptional()
  @IsEnum(PharmacyPaymentMethod)
  paymentMethod?: PharmacyPaymentMethod;

  @ApiPropertyOptional({
    description: 'Payment status',
    enum: PharmacyPaymentStatus,
  })
  @IsOptional()
  @IsEnum(PharmacyPaymentStatus)
  paymentStatus?: PharmacyPaymentStatus;

  @ApiPropertyOptional({
    description: 'Invoice status',
    enum: PharmacyInvoiceStatus,
  })
  @IsOptional()
  @IsEnum(PharmacyInvoiceStatus)
  status?: PharmacyInvoiceStatus;

  @ApiPropertyOptional({ description: 'Billing name', example: 'John Doe' })
  @IsOptional()
  @IsString()
  billingName?: string;

  @ApiPropertyOptional({
    description: 'Billing phone',
    example: '+919876543210',
  })
  @IsOptional()
  @IsString()
  billingPhone?: string;

  @ApiPropertyOptional({
    description: 'Billing address',
    example: '123 Main St',
  })
  @IsOptional()
  @IsString()
  billingAddress?: string;

  @ApiPropertyOptional({ description: 'Billing city', example: 'Mumbai' })
  @IsOptional()
  @IsString()
  billingCity?: string;

  @ApiPropertyOptional({ description: 'Billing state', example: 'Maharashtra' })
  @IsOptional()
  @IsString()
  billingState?: string;

  @ApiPropertyOptional({ description: 'Billing pincode', example: '400001' })
  @IsOptional()
  @IsString()
  billingPincode?: string;

  @ApiPropertyOptional({ description: 'Invoice notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    type: BillDiscountDto,
    nullable: true,
    description: 'Discount on the whole bill; null removes it, omitted keeps it',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => BillDiscountDto)
  billDiscount?: BillDiscountDto | null;

  @ApiPropertyOptional({
    description: 'Invoice items',
    type: [PharmacyInvoiceItemDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PharmacyInvoiceItemDto)
  items?: PharmacyInvoiceItemDto[];
}

export class DiscardPharmacyInvoiceQueryDto {
  @ApiPropertyOptional({
    description:
      'Version of the draft being discarded. A different current version is refused.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version?: number;
}

export class UpdatePharmacyInvoiceStatusDto {
  @ApiProperty({ description: 'Invoice status', enum: PharmacyInvoiceStatus })
  @IsEnum(PharmacyInvoiceStatus)
  status: PharmacyInvoiceStatus;
}

export class QueryPharmacyInvoiceDto {
  @ApiPropertyOptional({
    description: 'Patient ID filter',
    example: 'patient-123',
  })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional({
    description: 'Doctor ID filter',
    example: 'doctor-123',
  })
  @IsOptional()
  @IsString()
  doctorId?: string;

  @ApiPropertyOptional({
    description: 'Invoice status filter',
    enum: PharmacyInvoiceStatus,
  })
  @IsOptional()
  @IsEnum(PharmacyInvoiceStatus)
  status?: PharmacyInvoiceStatus;

  @ApiPropertyOptional({
    description: 'Payment status filter',
    enum: PharmacyPaymentStatus,
  })
  @IsOptional()
  @IsEnum(PharmacyPaymentStatus)
  paymentStatus?: PharmacyPaymentStatus;

  @ApiPropertyOptional({
    description: 'Payment method filter',
    enum: PharmacyPaymentMethod,
  })
  @IsOptional()
  @IsEnum(PharmacyPaymentMethod)
  paymentMethod?: PharmacyPaymentMethod;

  @ApiPropertyOptional({
    description: 'Search term (invoice number, patient name)',
    example: 'INV-001',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Start date filter (ISO string)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date filter (ISO string)',
    example: '2024-12-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Minimum amount filter', example: 100 })
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
  minAmount?: number;

  @ApiPropertyOptional({ description: 'Maximum amount filter', example: 10000 })
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
  maxAmount?: number;

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

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 20,
    default: 20,
  })
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

  @ApiPropertyOptional({ description: 'Sort by field', example: 'invoiceDate' })
  @IsOptional()
  @IsIn([
    'invoiceDate',
    'createdAt',
    'updatedAt',
    'totalAmount',
    'invoiceNumber',
    'status',
    'paymentStatus',
  ])
  sortBy?: string = 'invoiceDate';

  @ApiPropertyOptional({
    description: 'Sort order',
    example: 'desc',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class PharmacyPaymentDto {
  @ApiProperty({
    description:
      'Stable payment attempt key. Reuse after an uncertain response.',
  })
  @IsString()
  @Length(1, 128)
  requestKey: string;

  @ApiProperty({ description: 'Payment amount', example: 500.0 })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? undefined : num;
    }
    return value;
  })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ description: 'Payment method', enum: PharmacyPaymentMethod })
  @IsEnum(PharmacyPaymentMethod)
  method: PharmacyPaymentMethod;

  @ApiPropertyOptional({
    description: 'Payment reference',
    example: 'TXN123456789',
  })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ description: 'Payment gateway', example: 'Razorpay' })
  @IsOptional()
  @IsString()
  gateway?: string;
}

export class LineDiscountDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty({ example: 5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent: number;
}

export class ReviseBillDiscountDto {
  @ApiProperty({ description: 'Version of the bill the change was made from' })
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiPropertyOptional({ type: BillDiscountDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => BillDiscountDto)
  billDiscount?: BillDiscountDto | null;

  @ApiProperty({ type: [LineDiscountDto], description: 'New discount % per bill line' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineDiscountDto)
  lines: LineDiscountDto[];

  @ApiProperty({ description: 'Why the discount changed' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'Enter a reason for changing the discount' })
  @MaxLength(500)
  reason: string;
}

export class RefundPharmacyBillDto {
  @ApiProperty({ description: 'Stable refund attempt key. Reuse after an uncertain response.' })
  @IsString()
  @Length(1, 128)
  requestKey: string;

  @ApiProperty({ description: 'Refund amount: the refund due shown to the user', example: 50 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiProperty({ enum: PharmacyPaymentMethod })
  @IsEnum(PharmacyPaymentMethod)
  method: PharmacyPaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}

export class QueryPharmacyInvoicePrintDto {
  @ApiPropertyOptional({
    description: 'Print format',
    enum: ['A5', 'THERMAL_80MM'],
    default: 'A5',
  })
  @IsOptional()
  @IsIn(['A5', 'THERMAL_80MM'])
  format?: 'A5' | 'THERMAL_80MM' = 'A5';

  @ApiPropertyOptional({
    description: 'Copy type',
    enum: ['ORIGINAL', 'DUPLICATE'],
    default: 'ORIGINAL',
  })
  @IsOptional()
  @IsIn(['ORIGINAL', 'DUPLICATE'])
  copyType?: 'ORIGINAL' | 'DUPLICATE' = 'ORIGINAL';
}

export class PharmacyInvoiceStatsDto {
  @ApiPropertyOptional({
    description: 'Start date for stats',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for stats',
    example: '2024-12-31',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Group by period',
    example: 'month',
    enum: ['day', 'week', 'month', 'year'],
  })
  @IsOptional()
  @IsString()
  groupBy?: 'day' | 'week' | 'month' | 'year' = 'month';
}
