import {
  IsOptional,
  IsString,
  IsDateString,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsBoolean,
  Matches,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PrescriptionStatus, PrescriptionLanguage, RefillStatus } from './prescription.dto';

// Accept either UUID (v1-5) or CUID (e.g., cxxxxxxxxxxxxxxxxxxxxxxx) for patient identifiers
const UUID_OR_CUID_REGEX = /(^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$)|(^c[0-9a-z]{24}$)/i;

/**
 * @cc [owner:nareshshah139,label:product] literal-lifecycle-filters
 * Query strings "false" and "true" MUST become their boolean values for expiry
 * and refill filters; other strings MUST fail boolean validation.
 */
export class QueryPrescriptionsDto {
  @IsOptional()
  @Matches(UUID_OR_CUID_REGEX, { message: 'patientId must be a UUID or CUID' })
  patientId?: string;

  @IsOptional()
  @Matches(UUID_OR_CUID_REGEX, { message: 'identifier must be a UUID or CUID' })
  visitId?: string;

  @IsOptional()
  @Matches(UUID_OR_CUID_REGEX, { message: 'identifier must be a UUID or CUID' })
  doctorId?: string;

  @IsOptional()
  @IsEnum(PrescriptionStatus)
  status?: PrescriptionStatus;

  @IsOptional()
  @IsEnum(PrescriptionLanguage)
  language?: PrescriptionLanguage;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  search?: string; // Search in drug names, diagnosis, notes

  @IsOptional()
  @IsString()
  drugName?: string; // Filter by specific drug

  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  isExpired?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  hasRefills?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class QueryRefillsDto {
  @IsOptional()
  @Matches(UUID_OR_CUID_REGEX, { message: 'identifier must be a UUID or CUID' })
  prescriptionId?: string;

  @IsOptional()
  @Matches(UUID_OR_CUID_REGEX, { message: 'patientId must be a UUID or CUID' })
  patientId?: string;

  @IsOptional()
  @IsEnum(RefillStatus)
  status?: RefillStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  search?: string; // Search in reason, notes

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class PrescriptionHistoryDto {
  @IsOptional()
  @Matches(UUID_OR_CUID_REGEX, { message: 'patientId must be a UUID or CUID' })
  patientId?: string;

  @IsOptional()
  @Matches(UUID_OR_CUID_REGEX, { message: 'identifier must be a UUID or CUID' })
  doctorId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  drugName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class DrugSearchDto {
  @IsString()
  query: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  isGeneric?: boolean;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

export class PrescriptionStatisticsDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Matches(UUID_OR_CUID_REGEX, { message: 'identifier must be a UUID or CUID' })
  doctorId?: string;

  @IsOptional()
  @IsString()
  drugName?: string;

  @IsOptional()
  @IsString()
  groupBy?: 'day' | 'week' | 'month' | 'year' = 'day';
}

export class ExpiringPrescriptionsDto {
  @IsOptional()
  @IsDateString()
  expireBefore?: string;

  @IsOptional()
  @Matches(UUID_OR_CUID_REGEX, { message: 'patientId must be a UUID or CUID' })
  patientId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class PrescriptionTemplateQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  specialty?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
