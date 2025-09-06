import { IsOptional, IsString, IsDateString, IsEnum, IsNumber, IsBoolean, IsArray, ValidateNested, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ReportType {
  REVENUE = 'REVENUE',
  PATIENT = 'PATIENT',
  DOCTOR = 'DOCTOR',
  APPOINTMENT = 'APPOINTMENT',
  INVENTORY = 'INVENTORY',
  PAYMENT = 'PAYMENT',
  FINANCIAL = 'FINANCIAL',
  OPERATIONAL = 'OPERATIONAL'
}

export enum ReportPeriod {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  YEARLY = 'YEARLY',
  CUSTOM = 'CUSTOM'
}

export enum ExportFormat {
  PDF = 'PDF',
  EXCEL = 'EXCEL',
  CSV = 'CSV',
  JSON = 'JSON'
}

export enum PaymentMode {
  CASH = 'CASH',
  CARD = 'CARD',
  UPI = 'UPI',
  BNPL = 'BNPL',
  NET_BANKING = 'NET_BANKING',
  CHEQUE = 'CHEQUE'
}

export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  CONFIRMED = 'CONFIRMED',
  CHECKED_IN = 'CHECKED_IN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW'
}

export enum VisitType {
  OPD = 'OPD',
  TELEMED = 'TELEMED',
  PROCEDURE = 'PROCEDURE'
}

export enum InventoryItemType {
  MEDICINE = 'MEDICINE',
  EQUIPMENT = 'EQUIPMENT',
  SUPPLY = 'SUPPLY',
  CONSUMABLE = 'CONSUMABLE'
}

export enum TransactionType {
  PURCHASE = 'PURCHASE',
  SALE = 'SALE',
  RETURN = 'RETURN',
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER = 'TRANSFER',
  EXPIRED = 'EXPIRED',
  DAMAGED = 'DAMAGED'
}

// Base Report Query DTO
export class BaseReportQueryDto {
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
}

// Revenue Report DTOs
export class RevenueReportQueryDto extends BaseReportQueryDto {
  @ApiPropertyOptional({ description: 'Payment mode filter', enum: PaymentMode, example: 'CASH' })
  @IsOptional()
  @IsEnum(PaymentMode)
  paymentMode?: PaymentMode;

  @ApiPropertyOptional({ description: 'Service type filter', example: 'Consultation' })
  @IsOptional()
  @IsString()
  serviceType?: string;

  @ApiPropertyOptional({ description: 'Include GST breakdown', example: true })
  @IsOptional()
  @IsBoolean()
  includeGstBreakdown?: boolean;

  @ApiPropertyOptional({ description: 'Include payment method breakdown', example: true })
  @IsOptional()
  @IsBoolean()
  includePaymentBreakdown?: boolean;
}

export class RevenueReportResponseDto {
  @ApiProperty({ description: 'Total revenue for the period' })
  totalRevenue: number;

  @ApiProperty({ description: 'Total GST collected' })
  totalGst: number;

  @ApiProperty({ description: 'Net revenue (excluding GST)' })
  netRevenue: number;

  @ApiProperty({ description: 'Total invoices generated' })
  totalInvoices: number;

  @ApiProperty({ description: 'Average invoice value' })
  averageInvoiceValue: number;

  @ApiProperty({ description: 'Payment method breakdown' })
  paymentBreakdown: PaymentBreakdownDto[];

  @ApiProperty({ description: 'Daily revenue breakdown' })
  dailyBreakdown: DailyRevenueDto[];

  @ApiProperty({ description: 'Doctor revenue breakdown' })
  doctorBreakdown: DoctorRevenueDto[];

  @ApiProperty({ description: 'Service category breakdown' })
  serviceBreakdown: ServiceRevenueDto[];

  @ApiProperty({ description: 'Report generation timestamp' })
  generatedAt: Date;

  @ApiProperty({ description: 'Report period' })
  period: string;
}

export class PaymentBreakdownDto {
  @ApiProperty({ description: 'Payment mode' })
  mode: PaymentMode;

  @ApiProperty({ description: 'Total amount' })
  amount: number;

  @ApiProperty({ description: 'Percentage of total' })
  percentage: number;

  @ApiProperty({ description: 'Number of transactions' })
  transactionCount: number;
}

export class DailyRevenueDto {
  @ApiProperty({ description: 'Date' })
  date: string;

  @ApiProperty({ description: 'Revenue for the day' })
  revenue: number;

  @ApiProperty({ description: 'Number of invoices' })
  invoiceCount: number;

  @ApiProperty({ description: 'Average invoice value' })
  averageInvoiceValue: number;
}

export class DoctorRevenueDto {
  @ApiProperty({ description: 'Doctor ID' })
  doctorId: string;

  @ApiProperty({ description: 'Doctor name' })
  doctorName: string;

  @ApiProperty({ description: 'Total revenue generated' })
  revenue: number;

  @ApiProperty({ description: 'Number of patients seen' })
  patientCount: number;

  @ApiProperty({ description: 'Average revenue per patient' })
  averageRevenuePerPatient: number;

  @ApiProperty({ description: 'Number of visits' })
  visitCount: number;
}

export class ServiceRevenueDto {
  @ApiProperty({ description: 'Service type' })
  serviceType: string;

  @ApiProperty({ description: 'Total revenue' })
  revenue: number;

  @ApiProperty({ description: 'Number of services provided' })
  serviceCount: number;

  @ApiProperty({ description: 'Average service value' })
  averageServiceValue: number;
}

// Patient Report DTOs
export class PatientReportQueryDto extends BaseReportQueryDto {
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

  @ApiPropertyOptional({ description: 'Include visit history', example: true })
  @IsOptional()
  @IsBoolean()
  includeVisitHistory?: boolean;

  @ApiPropertyOptional({ description: 'Include appointment history', example: true })
  @IsOptional()
  @IsBoolean()
  includeAppointmentHistory?: boolean;
}

export class PatientReportResponseDto {
  @ApiProperty({ description: 'Total patients' })
  totalPatients: number;

  @ApiProperty({ description: 'New patients in period' })
  newPatients: number;

  @ApiProperty({ description: 'Returning patients in period' })
  returningPatients: number;

  @ApiProperty({ description: 'Age group breakdown' })
  ageGroupBreakdown: AgeGroupDto[];

  @ApiProperty({ description: 'Gender breakdown' })
  genderBreakdown: GenderBreakdownDto[];

  @ApiProperty({ description: 'City breakdown' })
  cityBreakdown: CityBreakdownDto[];

  @ApiProperty({ description: 'Patient registration trends' })
  registrationTrends: RegistrationTrendDto[];

  @ApiProperty({ description: 'Top visiting patients' })
  topVisitingPatients: TopVisitingPatientDto[];

  @ApiProperty({ description: 'Report generation timestamp' })
  generatedAt: Date;

  @ApiProperty({ description: 'Report period' })
  period: string;
}

export class AgeGroupDto {
  @ApiProperty({ description: 'Age group range' })
  ageGroup: string;

  @ApiProperty({ description: 'Number of patients' })
  count: number;

  @ApiProperty({ description: 'Percentage of total' })
  percentage: number;
}

export class GenderBreakdownDto {
  @ApiProperty({ description: 'Gender' })
  gender: string;

  @ApiProperty({ description: 'Number of patients' })
  count: number;

  @ApiProperty({ description: 'Percentage of total' })
  percentage: number;
}

export class CityBreakdownDto {
  @ApiProperty({ description: 'City name' })
  city: string;

  @ApiProperty({ description: 'Number of patients' })
  count: number;

  @ApiProperty({ description: 'Percentage of total' })
  percentage: number;
}

export class RegistrationTrendDto {
  @ApiProperty({ description: 'Date' })
  date: string;

  @ApiProperty({ description: 'Number of new registrations' })
  registrations: number;
}

export class TopVisitingPatientDto {
  @ApiProperty({ description: 'Patient ID' })
  patientId: string;

  @ApiProperty({ description: 'Patient name' })
  patientName: string;

  @ApiProperty({ description: 'Number of visits' })
  visitCount: number;

  @ApiProperty({ description: 'Last visit date' })
  lastVisitDate: Date;

  @ApiProperty({ description: 'Total revenue generated' })
  totalRevenue: number;
}

// Doctor Report DTOs
export class DoctorReportQueryDto extends BaseReportQueryDto {
  @ApiPropertyOptional({ description: 'Department filter', example: 'Dermatology' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ description: 'Include performance metrics', example: true })
  @IsOptional()
  @IsBoolean()
  includePerformanceMetrics?: boolean;

  @ApiPropertyOptional({ description: 'Include revenue metrics', example: true })
  @IsOptional()
  @IsBoolean()
  includeRevenueMetrics?: boolean;
}

export class DoctorReportResponseDto {
  @ApiProperty({ description: 'Total doctors' })
  totalDoctors: number;

  @ApiProperty({ description: 'Active doctors' })
  activeDoctors: number;

  @ApiProperty({ description: 'Doctor performance metrics' })
  doctorMetrics: DoctorMetricsDto[];

  @ApiProperty({ description: 'Department breakdown' })
  departmentBreakdown: DepartmentBreakdownDto[];

  @ApiProperty({ description: 'Top performing doctors' })
  topPerformers: TopPerformingDoctorDto[];

  @ApiProperty({ description: 'Report generation timestamp' })
  generatedAt: Date;

  @ApiProperty({ description: 'Report period' })
  period: string;
}

export class DoctorMetricsDto {
  @ApiProperty({ description: 'Doctor ID' })
  doctorId: string;

  @ApiProperty({ description: 'Doctor name' })
  doctorName: string;

  @ApiProperty({ description: 'Department' })
  department: string;

  @ApiProperty({ description: 'Total appointments' })
  totalAppointments: number;

  @ApiProperty({ description: 'Completed appointments' })
  completedAppointments: number;

  @ApiProperty({ description: 'Cancelled appointments' })
  cancelledAppointments: number;

  @ApiProperty({ description: 'No-show appointments' })
  noShowAppointments: number;

  @ApiProperty({ description: 'Completion rate percentage' })
  completionRate: number;

  @ApiProperty({ description: 'Average consultation time in minutes' })
  averageConsultationTime: number;

  @ApiProperty({ description: 'Total revenue generated' })
  totalRevenue: number;

  @ApiProperty({ description: 'Average revenue per appointment' })
  averageRevenuePerAppointment: number;

  @ApiProperty({ description: 'Patient satisfaction score' })
  patientSatisfactionScore: number;
}

export class DepartmentBreakdownDto {
  @ApiProperty({ description: 'Department name' })
  department: string;

  @ApiProperty({ description: 'Number of doctors' })
  doctorCount: number;

  @ApiProperty({ description: 'Total appointments' })
  totalAppointments: number;

  @ApiProperty({ description: 'Total revenue' })
  totalRevenue: number;

  @ApiProperty({ description: 'Average revenue per doctor' })
  averageRevenuePerDoctor: number;
}

export class TopPerformingDoctorDto {
  @ApiProperty({ description: 'Doctor ID' })
  doctorId: string;

  @ApiProperty({ description: 'Doctor name' })
  doctorName: string;

  @ApiProperty({ description: 'Department' })
  department: string;

  @ApiProperty({ description: 'Performance score' })
  performanceScore: number;

  @ApiProperty({ description: 'Total revenue' })
  totalRevenue: number;

  @ApiProperty({ description: 'Patient count' })
  patientCount: number;

  @ApiProperty({ description: 'Completion rate' })
  completionRate: number;
}

// Appointment Report DTOs
export class AppointmentReportQueryDto extends BaseReportQueryDto {
  @ApiPropertyOptional({ description: 'Appointment status filter', enum: AppointmentStatus, example: 'COMPLETED' })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @ApiPropertyOptional({ description: 'Visit type filter', enum: VisitType, example: 'OPD' })
  @IsOptional()
  @IsEnum(VisitType)
  visitType?: VisitType;

  @ApiPropertyOptional({ description: 'Room ID filter', example: 'room-123' })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiPropertyOptional({ description: 'Include cancellation reasons', example: true })
  @IsOptional()
  @IsBoolean()
  includeCancellationReasons?: boolean;

  @ApiPropertyOptional({ description: 'Include wait times', example: true })
  @IsOptional()
  @IsBoolean()
  includeWaitTimes?: boolean;
}

export class AppointmentReportResponseDto {
  @ApiProperty({ description: 'Total appointments' })
  totalAppointments: number;

  @ApiProperty({ description: 'Completed appointments' })
  completedAppointments: number;

  @ApiProperty({ description: 'Cancelled appointments' })
  cancelledAppointments: number;

  @ApiProperty({ description: 'No-show appointments' })
  noShowAppointments: number;

  @ApiProperty({ description: 'Completion rate percentage' })
  completionRate: number;

  @ApiProperty({ description: 'Cancellation rate percentage' })
  cancellationRate: number;

  @ApiProperty({ description: 'No-show rate percentage' })
  noShowRate: number;

  @ApiProperty({ description: 'Status breakdown' })
  statusBreakdown: AppointmentStatusBreakdownDto[];

  @ApiProperty({ description: 'Visit type breakdown' })
  visitTypeBreakdown: VisitTypeBreakdownDto[];

  @ApiProperty({ description: 'Daily appointment trends' })
  dailyTrends: DailyAppointmentTrendDto[];

  @ApiProperty({ description: 'Doctor appointment breakdown' })
  doctorBreakdown: DoctorAppointmentBreakdownDto[];

  @ApiProperty({ description: 'Room utilization' })
  roomUtilization: RoomUtilizationDto[];

  @ApiProperty({ description: 'Average wait time in minutes' })
  averageWaitTime: number;

  @ApiProperty({ description: 'Peak hours analysis' })
  peakHours: PeakHourDto[];

  @ApiPropertyOptional({ description: 'Cancellation reasons', type: () => [CancellationReasonDto] })
  cancellationReasons?: CancellationReasonDto[];

  @ApiProperty({ description: 'Report generation timestamp' })
  generatedAt: Date;

  @ApiProperty({ description: 'Report period' })
  period: string;
}

export class AppointmentStatusBreakdownDto {
  @ApiProperty({ description: 'Appointment status' })
  status: AppointmentStatus;

  @ApiProperty({ description: 'Number of appointments' })
  count: number;

  @ApiProperty({ description: 'Percentage of total' })
  percentage: number;
}

export class VisitTypeBreakdownDto {
  @ApiProperty({ description: 'Visit type' })
  visitType: VisitType;

  @ApiProperty({ description: 'Number of appointments' })
  count: number;

  @ApiProperty({ description: 'Percentage of total' })
  percentage: number;
}

export class DailyAppointmentTrendDto {
  @ApiProperty({ description: 'Date' })
  date: string;

  @ApiProperty({ description: 'Number of appointments' })
  appointmentCount: number;

  @ApiProperty({ description: 'Number of completed appointments' })
  completedCount: number;

  @ApiProperty({ description: 'Number of cancelled appointments' })
  cancelledCount: number;

  @ApiProperty({ description: 'Completion rate' })
  completionRate: number;
}

export class DoctorAppointmentBreakdownDto {
  @ApiProperty({ description: 'Doctor ID' })
  doctorId: string;

  @ApiProperty({ description: 'Doctor name' })
  doctorName: string;

  @ApiProperty({ description: 'Total appointments' })
  totalAppointments: number;

  @ApiProperty({ description: 'Completed appointments' })
  completedAppointments: number;

  @ApiProperty({ description: 'Cancelled appointments' })
  cancelledAppointments: number;

  @ApiProperty({ description: 'Completion rate' })
  completionRate: number;

  @ApiProperty({ description: 'Average consultation time' })
  averageConsultationTime: number;
}

export class RoomUtilizationDto {
  @ApiProperty({ description: 'Room ID' })
  roomId: string;

  @ApiProperty({ description: 'Room name' })
  roomName: string;

  @ApiProperty({ description: 'Total appointments' })
  totalAppointments: number;

  @ApiProperty({ description: 'Utilization percentage' })
  utilizationPercentage: number;

  @ApiProperty({ description: 'Average appointments per day' })
  averageAppointmentsPerDay: number;
}

export class PeakHourDto {
  @ApiProperty({ description: 'Hour of day' })
  hour: number;

  @ApiProperty({ description: 'Number of appointments' })
  appointmentCount: number;

  @ApiProperty({ description: 'Percentage of daily appointments' })
  percentage: number;
}

// Inventory Report DTOs
export class InventoryReportQueryDto extends BaseReportQueryDto {
  @ApiPropertyOptional({ description: 'Item type filter', enum: InventoryItemType, example: 'MEDICINE' })
  @IsOptional()
  @IsEnum(InventoryItemType)
  itemType?: InventoryItemType;

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
  @IsBoolean()
  includeLowStock?: boolean;

  @ApiPropertyOptional({ description: 'Include expired items', example: true })
  @IsOptional()
  @IsBoolean()
  includeExpired?: boolean;

  @ApiPropertyOptional({ description: 'Include transaction history', example: true })
  @IsOptional()
  @IsBoolean()
  includeTransactionHistory?: boolean;
}

export class InventoryReportResponseDto {
  @ApiProperty({ description: 'Total inventory items' })
  totalItems: number;

  @ApiProperty({ description: 'Total inventory value' })
  totalValue: number;

  @ApiProperty({ description: 'Low stock items count' })
  lowStockItems: number;

  @ApiProperty({ description: 'Expired items count' })
  expiredItems: number;

  @ApiProperty({ description: 'Out of stock items count' })
  outOfStockItems: number;

  @ApiProperty({ description: 'Item type breakdown' })
  itemTypeBreakdown: ItemTypeBreakdownDto[];

  @ApiProperty({ description: 'Category breakdown' })
  categoryBreakdown: CategoryBreakdownDto[];

  @ApiProperty({ description: 'Manufacturer breakdown' })
  manufacturerBreakdown: ManufacturerBreakdownDto[];

  @ApiProperty({ description: 'Low stock alerts' })
  lowStockAlerts: LowStockAlertDto[];

  @ApiProperty({ description: 'Expiry alerts' })
  expiryAlerts: ExpiryAlertDto[];

  @ApiProperty({ description: 'Top selling items' })
  topSellingItems: TopSellingItemDto[];

  @ApiProperty({ description: 'Transaction summary', type: () => TransactionSummaryDto })
  transactionSummary: TransactionSummaryDto;

  @ApiPropertyOptional({ description: 'Supplier breakdown', type: () => [SupplierBreakdownDto] })
  supplierBreakdown?: SupplierBreakdownDto[];

  @ApiProperty({ description: 'Report generation timestamp' })
  generatedAt: Date;

  @ApiProperty({ description: 'Report period' })
  period: string;
}

export class ItemTypeBreakdownDto {
  @ApiProperty({ description: 'Item type' })
  itemType: InventoryItemType;

  @ApiProperty({ description: 'Number of items' })
  count: number;

  @ApiProperty({ description: 'Total value' })
  totalValue: number;

  @ApiProperty({ description: 'Percentage of total value' })
  percentage: number;
}

export class CategoryBreakdownDto {
  @ApiProperty({ description: 'Category name' })
  category: string;

  @ApiProperty({ description: 'Number of items' })
  count: number;

  @ApiProperty({ description: 'Total value' })
  totalValue: number;

  @ApiProperty({ description: 'Percentage of total value' })
  percentage: number;
}

export class ManufacturerBreakdownDto {
  @ApiProperty({ description: 'Manufacturer name' })
  manufacturer: string;

  @ApiProperty({ description: 'Number of items' })
  count: number;

  @ApiProperty({ description: 'Total value' })
  totalValue: number;

  @ApiProperty({ description: 'Percentage of total value' })
  percentage: number;
}

export class LowStockAlertDto {
  @ApiProperty({ description: 'Item ID' })
  itemId: string;

  @ApiProperty({ description: 'Item name' })
  itemName: string;

  @ApiProperty({ description: 'Current stock' })
  currentStock: number;

  @ApiProperty({ description: 'Reorder level' })
  reorderLevel: number;

  @ApiProperty({ description: 'Days until stockout' })
  daysUntilStockout: number;
}

export class ExpiryAlertDto {
  @ApiProperty({ description: 'Item ID' })
  itemId: string;

  @ApiProperty({ description: 'Item name' })
  itemName: string;

  @ApiProperty({ description: 'Expiry date' })
  expiryDate: Date;

  @ApiProperty({ description: 'Days until expiry' })
  daysUntilExpiry: number;

  @ApiProperty({ description: 'Current stock' })
  currentStock: number;
}

export class TopSellingItemDto {
  @ApiProperty({ description: 'Item ID' })
  itemId: string;

  @ApiProperty({ description: 'Item name' })
  itemName: string;

  @ApiProperty({ description: 'Quantity sold' })
  quantitySold: number;

  @ApiProperty({ description: 'Total revenue' })
  totalRevenue: number;

  @ApiProperty({ description: 'Average selling price' })
  averageSellingPrice: number;
}

export class TransactionSummaryDto {
  @ApiProperty({ description: 'Total transactions' })
  totalTransactions: number;

  @ApiProperty({ description: 'Purchase transactions' })
  purchaseTransactions: number;

  @ApiProperty({ description: 'Sale transactions' })
  saleTransactions: number;

  @ApiProperty({ description: 'Return transactions' })
  returnTransactions: number;

  @ApiProperty({ description: 'Adjustment transactions' })
  adjustmentTransactions: number;

  @ApiProperty({ description: 'Total purchase value' })
  totalPurchaseValue: number;

  @ApiProperty({ description: 'Total sale value' })
  totalSaleValue: number;

  @ApiProperty({ description: 'Profit margin percentage' })
  profitMargin: number;
}

// Payment Report DTOs
export class PaymentReportQueryDto extends BaseReportQueryDto {
  @ApiPropertyOptional({ description: 'Payment mode filter', enum: PaymentMode, example: 'CASH' })
  @IsOptional()
  @IsEnum(PaymentMode)
  paymentMode?: PaymentMode;

  @ApiPropertyOptional({ description: 'Payment gateway filter', example: 'Razorpay' })
  @IsOptional()
  @IsString()
  gateway?: string;

  @ApiPropertyOptional({ description: 'Include reconciliation data', example: true })
  @IsOptional()
  @IsBoolean()
  includeReconciliation?: boolean;

  @ApiPropertyOptional({ description: 'Include refund data', example: true })
  @IsOptional()
  @IsBoolean()
  includeRefunds?: boolean;
}

export class PaymentReportResponseDto {
  @ApiProperty({ description: 'Total payments received' })
  totalPayments: number;

  @ApiProperty({ description: 'Total payment amount' })
  totalAmount: number;

  @ApiProperty({ description: 'Successful payments' })
  successfulPayments: number;

  @ApiProperty({ description: 'Failed payments' })
  failedPayments: number;

  @ApiProperty({ description: 'Pending payments' })
  pendingPayments: number;

  @ApiProperty({ description: 'Success rate percentage' })
  successRate: number;

  @ApiProperty({ description: 'Payment mode breakdown' })
  paymentModeBreakdown: PaymentModeBreakdownDto[];

  @ApiProperty({ description: 'Gateway breakdown' })
  gatewayBreakdown: GatewayBreakdownDto[];

  @ApiProperty({ description: 'Daily payment trends' })
  dailyTrends: DailyPaymentTrendDto[];

  @ApiProperty({ description: 'Reconciliation summary' })
  reconciliationSummary: ReconciliationSummaryDto;

  @ApiProperty({ description: 'Refund summary' })
  refundSummary: RefundSummaryDto;

  @ApiProperty({ description: 'Report generation timestamp' })
  generatedAt: Date;

  @ApiProperty({ description: 'Report period' })
  period: string;
}

export class PaymentModeBreakdownDto {
  @ApiProperty({ description: 'Payment mode' })
  mode: PaymentMode;

  @ApiProperty({ description: 'Number of transactions' })
  transactionCount: number;

  @ApiProperty({ description: 'Total amount' })
  totalAmount: number;

  @ApiProperty({ description: 'Percentage of total' })
  percentage: number;

  @ApiProperty({ description: 'Success rate' })
  successRate: number;
}

export class GatewayBreakdownDto {
  @ApiProperty({ description: 'Payment gateway' })
  gateway: string;

  @ApiProperty({ description: 'Number of transactions' })
  transactionCount: number;

  @ApiProperty({ description: 'Total amount' })
  totalAmount: number;

  @ApiProperty({ description: 'Success rate' })
  successRate: number;

  @ApiProperty({ description: 'Average transaction amount' })
  averageTransactionAmount: number;
}

export class DailyPaymentTrendDto {
  @ApiProperty({ description: 'Date' })
  date: string;

  @ApiProperty({ description: 'Number of payments' })
  paymentCount: number;

  @ApiProperty({ description: 'Total amount' })
  totalAmount: number;

  @ApiProperty({ description: 'Successful payments' })
  successfulPayments: number;

  @ApiProperty({ description: 'Failed payments' })
  failedPayments: number;
}

export class ReconciliationSummaryDto {
  @ApiProperty({ description: 'Total transactions to reconcile' })
  totalTransactions: number;

  @ApiProperty({ description: 'Reconciled transactions' })
  reconciledTransactions: number;

  @ApiProperty({ description: 'Pending reconciliation' })
  pendingReconciliation: number;

  @ApiProperty({ description: 'Reconciliation rate percentage' })
  reconciliationRate: number;

  @ApiProperty({ description: 'Discrepancy amount' })
  discrepancyAmount: number;
}

export class RefundSummaryDto {
  @ApiProperty({ description: 'Total refunds processed' })
  totalRefunds: number;

  @ApiProperty({ description: 'Total refund amount' })
  totalRefundAmount: number;

  @ApiProperty({ description: 'Refund rate percentage' })
  refundRate: number;

  @ApiProperty({ description: 'Average refund amount' })
  averageRefundAmount: number;

  @ApiProperty({ description: 'Refund reasons breakdown' })
  refundReasons: RefundReasonDto[];
}

export class RefundReasonDto {
  @ApiProperty({ description: 'Refund reason' })
  reason: string;

  @ApiProperty({ description: 'Number of refunds' })
  count: number;

  @ApiProperty({ description: 'Total amount' })
  amount: number;

  @ApiProperty({ description: 'Percentage of total refunds' })
  percentage: number;
}

// Dashboard DTOs
export class DashboardQueryDto {
  @ApiPropertyOptional({ description: 'Branch ID to filter dashboard', example: 'branch-123' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Date for dashboard data', example: '2024-12-01' })
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class DashboardResponseDto {
  @ApiProperty({ description: 'Today\'s appointments' })
  todayAppointments: number;

  @ApiProperty({ description: 'Today\'s completed appointments' })
  todayCompleted: number;

  @ApiProperty({ description: 'Today\'s revenue' })
  todayRevenue: number;

  @ApiProperty({ description: 'Total patients today' })
  todayPatients: number;

  @ApiProperty({ description: 'Active doctors today' })
  todayActiveDoctors: number;

  @ApiProperty({ description: 'Low stock alerts' })
  lowStockAlerts: number;

  @ApiProperty({ description: 'Pending payments' })
  pendingPayments: number;

  @ApiProperty({ description: 'Recent appointments' })
  recentAppointments: RecentAppointmentDto[];

  @ApiProperty({ description: 'Revenue trends' })
  revenueTrends: RevenueTrendDto[];

  @ApiProperty({ description: 'Top performing doctors' })
  topDoctors: TopDoctorDto[];

  @ApiProperty({ description: 'Dashboard generation timestamp' })
  generatedAt: Date;
}

export class RecentAppointmentDto {
  @ApiProperty({ description: 'Appointment ID' })
  appointmentId: string;

  @ApiProperty({ description: 'Patient name' })
  patientName: string;

  @ApiProperty({ description: 'Doctor name' })
  doctorName: string;

  @ApiProperty({ description: 'Appointment time' })
  appointmentTime: Date;

  @ApiProperty({ description: 'Status' })
  status: AppointmentStatus;

  @ApiProperty({ description: 'Visit type' })
  visitType: VisitType;
}

export class RevenueTrendDto {
  @ApiProperty({ description: 'Date' })
  date: string;

  @ApiProperty({ description: 'Revenue amount' })
  revenue: number;

  @ApiProperty({ description: 'Number of invoices' })
  invoiceCount: number;
}

export class TopDoctorDto {
  @ApiProperty({ description: 'Doctor ID' })
  doctorId: string;

  @ApiProperty({ description: 'Doctor name' })
  doctorName: string;

  @ApiProperty({ description: 'Revenue generated' })
  revenue: number;

  @ApiProperty({ description: 'Patient count' })
  patientCount: number;
}

// Export DTOs
export class ExportReportDto {
  @ApiProperty({ description: 'Report type', enum: ReportType })
  reportType: ReportType;

  @ApiProperty({ description: 'Export format', enum: ExportFormat })
  exportFormat: ExportFormat;

  @ApiProperty({ description: 'Report parameters' })
  @ValidateNested()
  @Type(() => BaseReportQueryDto)
  parameters: BaseReportQueryDto;

  @ApiProperty({ description: 'Include charts', example: true })
  @IsOptional()
  @IsBoolean()
  includeCharts?: boolean;

  @ApiProperty({ description: 'Include raw data', example: true })
  @IsOptional()
  @IsBoolean()
  includeRawData?: boolean;
}

export class ExportResponseDto {
  @ApiProperty({ description: 'Export file URL' })
  fileUrl: string;

  @ApiProperty({ description: 'File name' })
  fileName: string;

  @ApiProperty({ description: 'File size in bytes' })
  fileSize: number;

  @ApiProperty({ description: 'Export format' })
  format: ExportFormat;

  @ApiProperty({ description: 'Export timestamp' })
  exportedAt: Date;

  @ApiProperty({ description: 'Download expires at' })
  expiresAt: Date;
}

export class SupplierBreakdownDto {
  @ApiProperty({ description: 'Supplier name' })
  supplier: string;

  @ApiProperty({ description: 'Number of items' })
  count: number;

  @ApiProperty({ description: 'Total inventory value for supplier' })
  totalValue: number;
}

export class CancellationReasonDto {
  @ApiProperty({ description: 'Cancellation reason' })
  reason: string;

  @ApiProperty({ description: 'Count' })
  count: number;
}
