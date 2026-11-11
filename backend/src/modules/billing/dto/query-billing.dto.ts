import {
  IsOptional,
  IsString,
  IsDateString,
  IsInt,
  Min,
  Max,
  IsEnum,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMode } from '@prisma/client';
import { InvoiceStatus, PaymentStatus } from './invoice.dto';
import { IsPaymentMode } from './payment-mode';
import { UUID_OR_CUID_REGEX } from './ids';


export class QueryInvoicesDto {
  @IsOptional()
  @Matches(UUID_OR_CUID_REGEX, { message: 'patientId must be a UUID or CUID' })
  patientId?: string;

  @IsOptional()
  @Matches(UUID_OR_CUID_REGEX, { message: 'visitId must be a UUID or CUID' })
  visitId?: string;

  @IsOptional()
  @Matches(UUID_OR_CUID_REGEX, { message: 'appointmentId must be a UUID or CUID' })
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
  @Matches(UUID_OR_CUID_REGEX, { message: 'invoiceId must be a UUID or CUID' })
  invoiceId?: string;

  @IsOptional()
  @Matches(UUID_OR_CUID_REGEX, { message: 'patientId must be a UUID or CUID' })
  patientId?: string;

  @IsOptional()
  @IsPaymentMode()
  method?: PaymentMode;

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
  @IsPaymentMode()
  method?: PaymentMode;

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
  @Matches(UUID_OR_CUID_REGEX, { message: 'doctorId must be a UUID or CUID' })
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
