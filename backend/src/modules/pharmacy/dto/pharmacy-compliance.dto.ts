import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export enum ExpiryReturnWindowDto {
  ONE_MONTH = '1m',
  TWO_MONTHS = '2m',
  THREE_MONTHS = '3m',
  SIX_MONTHS = '6m',
  EXPIRED = 'expired',
}

export class PharmacyGstSummaryQueryDto {
  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  endDate: string;
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export enum PharmacyDayWiseTypeDto {
  SALES = 'SALES',
  PURCHASE = 'PURCHASE',
}

export class PharmacyClinicPeriodQueryDto {
  @ApiProperty({ example: '2026-11-01', description: 'First clinic day (Asia/Kolkata), inclusive' })
  @Matches(CALENDAR_DATE, { message: 'startDate must be YYYY-MM-DD' })
  startDate: string;

  @ApiProperty({ example: '2026-11-30', description: 'Last clinic day (Asia/Kolkata), inclusive' })
  @Matches(CALENDAR_DATE, { message: 'endDate must be YYYY-MM-DD' })
  endDate: string;
}

export class PharmacyDayWiseQueryDto extends PharmacyClinicPeriodQueryDto {
  @ApiPropertyOptional({ enum: PharmacyDayWiseTypeDto, default: PharmacyDayWiseTypeDto.SALES })
  @IsOptional()
  @IsEnum(PharmacyDayWiseTypeDto)
  type: PharmacyDayWiseTypeDto = PharmacyDayWiseTypeDto.SALES;
}

export class PharmacyItemMarginQueryDto extends PharmacyClinicPeriodQueryDto {
  @ApiPropertyOptional({ example: 'adapalene', description: 'Matches item name, category or manufacturer' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class PharmacyMonthlyReportQueryDto {
  @ApiProperty({ example: '2026-04' })
  @IsString()
  month: string;
}

export class PharmacyExpiryReturnsQueryDto {
  @ApiProperty({ enum: ExpiryReturnWindowDto, example: ExpiryReturnWindowDto.THREE_MONTHS })
  @IsEnum(ExpiryReturnWindowDto)
  window: ExpiryReturnWindowDto;
}

export class CreatePharmacyAuditDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  inventoryIds?: string[];

  @ApiPropertyOptional({ example: 'Antibiotics' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Cipla' })
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsOptional()
  @IsDateString()
  expiryFrom?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsDateString()
  expiryTo?: string;

  @ApiPropertyOptional({ example: 'Routine cycle count' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class PharmacyAuditCountDto {
  @ApiPropertyOptional({ example: 'audit-row-1' })
  @IsOptional()
  @IsString()
  auditRowId?: string;

  @ApiProperty({ example: 'inventory-1' })
  @IsString()
  inventoryId: string;

  @ApiProperty({ example: 42 })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  physicalStock: number;
}

export class ApplyPharmacyAuditAdjustmentsDto {
  @ApiProperty({ example: 'Shelf count mismatch verified by pharmacist' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ example: 'Second count completed before posting' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [PharmacyAuditCountDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PharmacyAuditCountDto)
  counts: PharmacyAuditCountDto[];
}
