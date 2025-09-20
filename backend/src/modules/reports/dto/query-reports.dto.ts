import { IsOptional, IsString, IsDateString, IsEnum, IsNumber, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ReportPeriod, ExportFormat } from './reports.dto';

// Transform decorator for converting string "true"/"false" to boolean
const TransformBoolean = () => Transform(({ value }) => {
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return value;
});

export class QueryReportsDto {
  @ApiPropertyOptional({ description: 'Start date for the report period', example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for the report period', example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Report period type', enum: ReportPeriod, example: 'MONTHLY' })
  @IsOptional()
  @IsEnum(ReportPeriod)
  period?: ReportPeriod;

  @ApiPropertyOptional({ description: 'Branch ID to filter reports', example: 'branch-123' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Doctor ID to filter reports', example: 'doctor-123' })
  @IsOptional()
  @IsString()
  doctorId?: string;

  @ApiPropertyOptional({ description: 'Patient ID to filter reports', example: 'patient-123' })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Export format', enum: ExportFormat, example: 'PDF' })
  @IsOptional()
  @IsEnum(ExportFormat)
  exportFormat?: ExportFormat;

  @ApiPropertyOptional({ description: 'Include detailed breakdown', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeDetails?: boolean;

  @ApiPropertyOptional({ description: 'Page number for pagination', example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', example: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Sort field', example: 'date' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', example: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ description: 'Search term', example: 'John' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by specific criteria', example: 'active' })
  @IsOptional()
  @IsString()
  filter?: string;
}

export class RevenueQueryDto extends QueryReportsDto {
  @ApiPropertyOptional({ description: 'Payment mode filter', example: 'CASH' })
  @IsOptional()
  @IsString()
  paymentMode?: string;

  @ApiPropertyOptional({ description: 'Service type filter', example: 'Consultation' })
  @IsOptional()
  @IsString()
  serviceType?: string;

  @ApiPropertyOptional({ description: 'Include GST breakdown', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeGstBreakdown?: boolean;

  @ApiPropertyOptional({ description: 'Include payment method breakdown', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includePaymentBreakdown?: boolean;

  @ApiPropertyOptional({ description: 'Minimum revenue amount', example: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional({ description: 'Maximum revenue amount', example: 10000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number;
}

export class PatientQueryDto extends QueryReportsDto {
  @ApiPropertyOptional({ description: 'Age range filter - minimum age', example: 18 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minAge?: number;

  @ApiPropertyOptional({ description: 'Age range filter - maximum age', example: 65 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxAge?: number;

  @ApiPropertyOptional({ description: 'Gender filter', example: 'Male' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ description: 'City filter', example: 'Hyderabad' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'State filter', example: 'Telangana' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Include visit history', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeVisitHistory?: boolean;

  @ApiPropertyOptional({ description: 'Include appointment history', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeAppointmentHistory?: boolean;

  @ApiPropertyOptional({ description: 'Include financial history', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeFinancialHistory?: boolean;
}

export class DoctorQueryDto extends QueryReportsDto {
  @ApiPropertyOptional({ description: 'Department filter', example: 'Dermatology' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ description: 'Role filter', example: 'DOCTOR' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ description: 'Include performance metrics', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includePerformanceMetrics?: boolean;

  @ApiPropertyOptional({ description: 'Include revenue metrics', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeRevenueMetrics?: boolean;

  @ApiPropertyOptional({ description: 'Include patient satisfaction', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includePatientSatisfaction?: boolean;

  @ApiPropertyOptional({ description: 'Minimum completion rate', example: 80 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  minCompletionRate?: number;
}

export class AppointmentQueryDto extends QueryReportsDto {
  @ApiPropertyOptional({ description: 'Appointment status filter', example: 'COMPLETED' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Visit type filter', example: 'OPD' })
  @IsOptional()
  @IsString()
  visitType?: string;

  @ApiPropertyOptional({ description: 'Room ID filter', example: 'room-123' })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiPropertyOptional({ description: 'Include cancellation reasons', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeCancellationReasons?: boolean;

  @ApiPropertyOptional({ description: 'Include wait times', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeWaitTimes?: boolean;

  @ApiPropertyOptional({ description: 'Include peak hours analysis', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includePeakHours?: boolean;

  @ApiPropertyOptional({ description: 'Include room utilization', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeRoomUtilization?: boolean;
}

export class InventoryQueryDto extends QueryReportsDto {
  @ApiPropertyOptional({ description: 'Item type filter', example: 'MEDICINE' })
  @IsOptional()
  @IsString()
  itemType?: string;

  @ApiPropertyOptional({ description: 'Category filter', example: 'Antibiotics' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Manufacturer filter', example: 'Sun Pharma' })
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiPropertyOptional({ description: 'Include low stock items', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeLowStock?: boolean;

  @ApiPropertyOptional({ description: 'Include expired items', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeExpired?: boolean;

  @ApiPropertyOptional({ description: 'Include transaction history', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeTransactionHistory?: boolean;

  @ApiPropertyOptional({ description: 'Include supplier analysis', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeSupplierAnalysis?: boolean;

  @ApiPropertyOptional({ description: 'Minimum stock level', example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minStockLevel?: number;

  @ApiPropertyOptional({ description: 'Maximum stock level', example: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxStockLevel?: number;
}

export class PaymentQueryDto extends QueryReportsDto {
  @ApiPropertyOptional({ description: 'Payment mode filter', example: 'CASH' })
  @IsOptional()
  @IsString()
  paymentMode?: string;

  @ApiPropertyOptional({ description: 'Payment gateway filter', example: 'Razorpay' })
  @IsOptional()
  @IsString()
  gateway?: string;

  @ApiPropertyOptional({ description: 'Include reconciliation data', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeReconciliation?: boolean;

  @ApiPropertyOptional({ description: 'Include refund data', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeRefunds?: boolean;

  @ApiPropertyOptional({ description: 'Include failed payments', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeFailedPayments?: boolean;

  @ApiPropertyOptional({ description: 'Minimum payment amount', example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional({ description: 'Maximum payment amount', example: 10000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number;
}

export class DashboardQueryDto extends QueryReportsDto {
  @ApiPropertyOptional({ description: 'Date for dashboard data', example: '2024-12-01' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ description: 'Include recent activities', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeRecentActivities?: boolean;

  @ApiPropertyOptional({ description: 'Include trends', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeTrends?: boolean;

  @ApiPropertyOptional({ description: 'Include alerts', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeAlerts?: boolean;

  @ApiPropertyOptional({ description: 'Include performance metrics', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includePerformanceMetrics?: boolean;
}

export class ExportQueryDto extends QueryReportsDto {
  @ApiPropertyOptional({ description: 'Report type', example: 'REVENUE' })
  @IsOptional()
  @IsString()
  reportType?: string;

  @ApiPropertyOptional({ description: 'Export format', enum: ExportFormat, example: 'PDF' })
  @IsOptional()
  @IsEnum(ExportFormat)
  exportFormat?: ExportFormat;

  @ApiPropertyOptional({ description: 'Include charts', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeCharts?: boolean;

  @ApiPropertyOptional({ description: 'Include raw data', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeRawData?: boolean;

  @ApiPropertyOptional({ description: 'Include summary', example: true })
  @IsOptional()
  @TransformBoolean()
  @IsBoolean()
  includeSummary?: boolean;

  @ApiPropertyOptional({ description: 'Custom template', example: 'clinic-template' })
  @IsOptional()
  @IsString()
  template?: string;
}
