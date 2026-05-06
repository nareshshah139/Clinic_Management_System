import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { PaymentMode } from '@prisma/client';

export class PartnerDailySaleItemDto {
  @ApiProperty({ example: 'Azithral 500' })
  @IsString()
  medicineName: string;

  @ApiProperty({ example: 'AZT-0426' })
  @IsString()
  batchNumber: string;

  @ApiProperty({ example: 3 })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  quantitySold: number;

  @ApiProperty({ example: 120 })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  mrp: number;

  @ApiPropertyOptional({ example: 10, default: 0 })
  @IsOptional()
  @Transform(({ value }) => Number(value ?? 0))
  @IsNumber()
  @Min(0)
  discountGiven?: number = 0;

  @ApiProperty({ enum: PaymentMode, example: PaymentMode.UPI })
  @IsIn(Object.values(PaymentMode))
  paymentMode: PaymentMode;
}

export class CreatePartnerDailySaleDto {
  @ApiPropertyOptional({ example: 'partner-org-1' })
  @IsOptional()
  @IsString()
  partnerOrganizationId?: string;

  @ApiPropertyOptional({ example: 'HealthPlus Partner Pharmacy' })
  @IsOptional()
  @IsString()
  partnerOrganizationName?: string;

  @ApiPropertyOptional({ example: 'partner-user-1' })
  @IsOptional()
  @IsString()
  partnerUserId?: string;

  @ApiPropertyOptional({ example: 'Anita Partner' })
  @IsOptional()
  @IsString()
  partnerUserName?: string;

  @ApiProperty({ example: '2026-05-06' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ enum: ['MANUAL', 'CSV'], default: 'MANUAL' })
  @IsOptional()
  @IsIn(['MANUAL', 'CSV'])
  source?: 'MANUAL' | 'CSV' = 'MANUAL';

  @ApiProperty({ type: [PartnerDailySaleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PartnerDailySaleItemDto)
  items: PartnerDailySaleItemDto[];
}

export class QueryPartnerDailySalesDto {
  @ApiPropertyOptional({ example: '2026-05-06' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ example: 'partner-org-1' })
  @IsOptional()
  @IsString()
  partnerOrganizationId?: string;

  @ApiPropertyOptional({ description: 'Alias for partnerOrganizationId' })
  @IsOptional()
  @IsString()
  org?: string;

  @ApiPropertyOptional({
    enum: [
      'SUBMITTED',
      'STOCK_COMMITTED',
      'PARTIAL_STOCK_COMMITTED',
      'RECONCILIATION_REQUIRED',
      'CANCELLED',
    ],
  })
  @IsOptional()
  @IsIn([
    'SUBMITTED',
    'STOCK_COMMITTED',
    'PARTIAL_STOCK_COMMITTED',
    'RECONCILIATION_REQUIRED',
    'CANCELLED',
  ])
  status?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class QueryPartnerMissingSalesDto {
  @ApiPropertyOptional({ example: '2026-05-06' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ default: 22, minimum: 0, maximum: 23 })
  @IsOptional()
  @Transform(({ value }) => Number(value ?? 22))
  @IsInt()
  @Min(0)
  @Max(23)
  cutoffHour?: number = 22;
}
