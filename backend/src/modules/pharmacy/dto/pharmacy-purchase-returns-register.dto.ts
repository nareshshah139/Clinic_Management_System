import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  RETURN_KINDS,
  RETURN_REASONS,
  RETURN_SEARCH_FIELDS,
  RETURN_SORT_KEYS,
  RETURN_STATES,
} from '../pharmacy-purchase-returns-register';
import type {
  PurchaseReturnsQuery,
  ReturnCreditState,
  ReturnKind,
  ReturnReason,
  ReturnSearchField,
  ReturnSortKey,
} from '../pharmacy-purchase-returns-register';
import { SORT_DIRECTIONS, type SortDirection } from '../pharmacy-purchase-register';
import { IsRegisterRange, MAX_REGISTER_RANGE_DAYS } from '../register-utils';

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

export class QueryPurchaseReturnsDto implements PurchaseReturnsQuery {
  @ApiProperty({ description: 'First return date, inclusive, in clinic time', example: '2026-04-01' })
  @Matches(CALENDAR_DAY)
  @IsISO8601({ strict: true })
  from: string;

  @ApiProperty({
    description: `Last return date, inclusive; on or after from and at most ${MAX_REGISTER_RANGE_DAYS} days after it`,
    example: '2027-03-31',
  })
  @Matches(CALENDAR_DAY)
  @IsISO8601({ strict: true })
  @IsRegisterRange('from')
  to: string;

  @ApiPropertyOptional({ enum: RETURN_SEARCH_FIELDS })
  @IsOptional()
  @IsIn(RETURN_SEARCH_FIELDS)
  field?: ReturnSearchField;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: RETURN_STATES })
  @IsOptional()
  @IsIn(RETURN_STATES)
  state?: ReturnCreditState;

  @ApiPropertyOptional({ description: 'Exact distributor GSTIN' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  distributorGstin?: string;

  @ApiPropertyOptional({ enum: RETURN_KINDS })
  @IsOptional()
  @IsIn(RETURN_KINDS)
  kind?: ReturnKind;

  @ApiPropertyOptional({ enum: RETURN_REASONS })
  @IsOptional()
  @IsIn(RETURN_REASONS)
  reason?: ReturnReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entryById?: string;

  @ApiPropertyOptional({ enum: RETURN_SORT_KEYS, default: 'entryAt' })
  @IsOptional()
  @IsIn(RETURN_SORT_KEYS)
  sortBy: ReturnSortKey = 'entryAt';

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

  @ApiPropertyOptional({
    enum: ['xlsx'],
    description: 'xlsx downloads every filtered return and credit note in the requested order instead of one page',
  })
  @IsOptional()
  @IsIn(['xlsx'])
  format?: 'xlsx';
}
