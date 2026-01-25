import {
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  IsInt,
  Min,
  Max,
  IsEnum,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceStatus, PaymentMethod, PaymentStatus } from './invoice.dto';

// Allow either UUID (v1-5) or CUID (e.g., cxxxxxxxxxxxxxxxxxxxxxxx) for patient identifiers
const UUID_OR_CUID_REGEX = /(^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$)|(^c[0-9a-z]{24}$)/i;

export class QueryInvoicesDto {
  @IsOptional()
  @Matches(UUID_OR_CUID_REGEX, { message: 'patientId must be a UUID or CUID' })
  patientId?: string;

  @IsOptional()
  @IsUUID()
  visitId?: string;

  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  search?: string; // Search in invoice number, patient name, notes

  @IsOptional()
  @IsString()
  category?: string; // Filter by service category

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

export class QueryPaymentsDto {
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @IsOptional()
  @Matches(UUID_OR_CUID_REGEX, { message: 'patientId must be a UUID or CUID' })
  patientId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  search?: string; // Search in transaction ID, reference, notes

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

export class PaymentSummaryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @Matches(UUID_OR_CUID_REGEX, { message: 'patientId must be a UUID or CUID' })
  patientId?: string;
}

export class RevenueReportDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  groupBy?: 'day' | 'week' | 'month' | 'year' = 'day';

  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class OutstandingInvoicesDto {
  @IsOptional()
  @Matches(UUID_OR_CUID_REGEX, { message: 'patientId must be a UUID or CUID' })
  patientId?: string;

  @IsOptional()
  @IsDateString()
  overdueAfter?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
