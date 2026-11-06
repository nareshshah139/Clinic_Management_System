import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  INVOICE_STATES,
  PAYMENT_FILTERS,
  PURCHASE_SOURCES,
  SEARCH_FIELDS,
  SORT_DIRECTIONS,
  SORT_KEYS,
} from '../pharmacy-purchase-register';
import { IsRegisterRange, MAX_REGISTER_RANGE_DAYS } from '../register-utils';
import type {
  InvoiceState,
  PaymentFilter,
  PurchaseRegisterQuery,
  PurchaseSource,
  SearchField,
  SortDirection,
  SortKey,
} from '../pharmacy-purchase-register';

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

export class QueryPurchaseRegisterDto implements PurchaseRegisterQuery {
  @ApiProperty({
    description: 'First bill date, inclusive, in clinic time',
    example: '2026-04-01',
  })
  @Matches(CALENDAR_DAY)
  @IsISO8601({ strict: true })
  from: string;

  @ApiProperty({
    description: `Last bill date, inclusive, in clinic time; on or after from and at most ${MAX_REGISTER_RANGE_DAYS} days after it`,
    example: '2027-03-31',
  })
  @Matches(CALENDAR_DAY)
  @IsISO8601({ strict: true })
  @IsRegisterRange('from')
  to: string;

  @ApiPropertyOptional({ enum: SEARCH_FIELDS })
  @IsOptional()
  @IsIn(SEARCH_FIELDS)
  field?: SearchField;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Exact distributor GSTIN' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  distributorGstin?: string;

  @ApiPropertyOptional({
    enum: PAYMENT_FILTERS,
    description: 'OUTSTANDING matches due, overdue and part-paid bills',
  })
  @IsOptional()
  @IsIn(PAYMENT_FILTERS)
  paymentState?: PaymentFilter;

  @ApiPropertyOptional({ enum: INVOICE_STATES })
  @IsOptional()
  @IsIn(INVOICE_STATES)
  invoiceState?: InvoiceState;

  @ApiPropertyOptional({ enum: PURCHASE_SOURCES })
  @IsOptional()
  @IsIn(PURCHASE_SOURCES)
  source?: PurchaseSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entryById?: string;

  @ApiPropertyOptional({ enum: SORT_KEYS, default: 'entryAt' })
  @IsOptional()
  @IsIn(SORT_KEYS)
  sortBy: SortKey = 'entryAt';

  @ApiPropertyOptional({ enum: SORT_DIRECTIONS, default: 'desc' })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDir: SortDirection = 'desc';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}
