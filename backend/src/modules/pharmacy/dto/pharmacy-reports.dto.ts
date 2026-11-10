import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsRegisterRange } from '../register-utils';
import { REPORT_FORMATS } from '../pharmacy-report-table';
import {
  MARGIN_COST_STATUSES,
  MARGIN_ITEM_TYPES,
  MARGIN_SEARCH_FIELDS,
  MARGIN_TYPES,
} from '../pharmacy-item-margin';

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const PHARMACY_REPORT_IDS = [
  'daily-collection',
  'purchase-register',
  'purchase-bills',
  'sales-register',
  'sales-bills',
  'day-wise-summary',
  'gstr-1',
  'gstr-3b',
  'gstr-2a',
  'gstr-2b',
  'hsn-wise',
  'composition',
  'item-margin',
  'expiring-stock',
  'doctor-wise-sales',
] as const;
export type PharmacyReportId = (typeof PHARMACY_REPORT_IDS)[number];

export class PharmacyReportQueryDto {
  @ApiProperty({
    example: '2026-11-01',
    description:
      'First clinic day (Asia/Kolkata), inclusive. Daily collection reads only this day.',
  })
  @Matches(CALENDAR_DATE, { message: 'from must be YYYY-MM-DD' })
  from!: string;

  @ApiPropertyOptional({
    example: '2026-11-30',
    description: 'Last clinic day, inclusive; defaults to from',
  })
  @IsOptional()
  @Matches(CALENDAR_DATE, { message: 'to must be YYYY-MM-DD' })
  @IsRegisterRange('from')
  to?: string;

  @ApiPropertyOptional({ enum: ['SALES', 'PURCHASE', 'RETURNS', 'ALL'] })
  @IsOptional()
  @IsIn(['SALES', 'PURCHASE', 'RETURNS', 'ALL'])
  type?: 'SALES' | 'PURCHASE' | 'RETURNS' | 'ALL';

  @ApiPropertyOptional({ enum: ['ALL', 'WITH_GST', 'WITHOUT_GST'] })
  @IsOptional()
  @IsIn(['ALL', 'WITH_GST', 'WITHOUT_GST'])
  gst?: 'ALL' | 'WITH_GST' | 'WITHOUT_GST';

  @ApiPropertyOptional({
    description:
      'Customer, bill number or mobile (sales); distributor, bill number or GSTIN (purchases); item (margin)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trimmed)
  q?: string;

  @ApiPropertyOptional({
    description: 'Composition rate in percent',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  rate?: number;

  @ApiPropertyOptional({ enum: ['expired', '1m', '2m', '3m', '6m'] })
  @IsOptional()
  @IsIn(['expired', '1m', '2m', '3m', '6m'])
  window?: 'expired' | '1m' | '2m' | '3m' | '6m';

  @ApiPropertyOptional({ enum: MARGIN_TYPES, description: 'Item margin: net sales, sales only, or returns only' })
  @IsOptional()
  @IsIn(MARGIN_TYPES)
  marginType?: (typeof MARGIN_TYPES)[number];

  @ApiPropertyOptional({ enum: MARGIN_SEARCH_FIELDS, description: 'Item margin: which field `q` matches' })
  @IsOptional()
  @IsIn(MARGIN_SEARCH_FIELDS)
  field?: (typeof MARGIN_SEARCH_FIELDS)[number];

  @ApiPropertyOptional({ description: 'Item margin: item tag' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trimmed)
  tag?: string;

  @ApiPropertyOptional({ description: 'Item margin: item category' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trimmed)
  category?: string;

  @ApiPropertyOptional({ description: 'Item margin: manufacturer' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trimmed)
  manufacturer?: string;

  @ApiPropertyOptional({ enum: MARGIN_ITEM_TYPES })
  @IsOptional()
  @IsIn(MARGIN_ITEM_TYPES)
  itemType?: (typeof MARGIN_ITEM_TYPES)[number];

  @ApiPropertyOptional({ enum: MARGIN_COST_STATUSES, description: 'Item margin: all, missing cost, or loss-making rows' })
  @IsOptional()
  @IsIn(MARGIN_COST_STATUSES)
  cost?: (typeof MARGIN_COST_STATUSES)[number];

  @ApiPropertyOptional({ enum: REPORT_FORMATS })
  @IsOptional()
  @IsIn(REPORT_FORMATS as unknown as string[])
  format?: (typeof REPORT_FORMATS)[number];
}

export class RecordCashCountDto {
  @ApiProperty({
    example: { CASH: 18250, UPI: 9420.5, CARD: 3100 },
    description: 'Amount counted per payment mode, in rupees',
  })
  @IsObject()
  counted!: Record<string, unknown>;

  @ApiPropertyOptional({ example: '₹50 note found torn; kept aside' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trimmed)
  note?: string;

  @ApiProperty({
    example: 0,
    description:
      'Sequence of the count this one replaces, 0 for the first count of the day',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  basedOnSequence!: number;
}
