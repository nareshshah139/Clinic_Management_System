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
  IsRegisterRange,
  MAX_REGISTER_RANGE_DAYS,
} from '../../pharmacy/register-utils';
import {
  SEARCH_FIELDS,
  SORT_DIRECTIONS,
  SORT_KEYS,
  STATUS_FILTERS,
  type ClinicBillQuery,
  type SearchField,
  type SortDirection,
  type SortKey,
  type StatusFilter,
} from '../clinic-bill-register';

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

export class QueryClinicBillRegisterDto implements ClinicBillQuery {
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

  @ApiPropertyOptional({ enum: STATUS_FILTERS })
  @IsOptional()
  @IsIn(STATUS_FILTERS)
  status?: StatusFilter;

  @ApiPropertyOptional({ enum: SORT_KEYS, default: 'billedAt' })
  @IsOptional()
  @IsIn(SORT_KEYS)
  sortBy: SortKey = 'billedAt';

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
