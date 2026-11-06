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
  PAYMENT_MODES,
  SALE_SOURCES,
  SALE_STATES,
  SALES_REGISTERS,
  SEARCH_FIELDS,
  SORT_DIRECTIONS,
  SORT_KEYS,
} from '../pharmacy-sales-register';
import { IsRegisterRange, MAX_REGISTER_RANGE_DAYS } from '../register-utils';
import type {
  PaymentMode,
  SaleSource,
  SaleState,
  SalesRegisterKind,
  SalesRegisterQuery,
  SearchField,
  SortDirection,
  SortKey,
} from '../pharmacy-sales-register';

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

export class QuerySalesRegisterDto implements SalesRegisterQuery {
  @ApiProperty({ enum: SALES_REGISTERS })
  @IsIn(SALES_REGISTERS)
  register: SalesRegisterKind;

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

  @ApiPropertyOptional({ enum: PAYMENT_MODES })
  @IsOptional()
  @IsIn(PAYMENT_MODES)
  paymentMode?: PaymentMode;

  @ApiPropertyOptional({ enum: SALE_STATES })
  @IsOptional()
  @IsIn(SALE_STATES)
  state?: SaleState;

  @ApiPropertyOptional({ enum: SALE_SOURCES })
  @IsOptional()
  @IsIn(SALE_SOURCES)
  source?: SaleSource;

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
