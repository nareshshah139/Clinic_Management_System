import { Controller, Get, Post, Body, Query, Request, UseGuards, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import {
  RevenueReportQueryDto,
  RevenueReportResponseDto,
  PatientReportQueryDto,
  PatientReportResponseDto,
  DoctorReportQueryDto,
  DoctorReportResponseDto,
  AppointmentReportQueryDto,
  AppointmentReportResponseDto,
  InventoryReportQueryDto,
  InventoryReportResponseDto,
  PaymentReportQueryDto,
  PaymentReportResponseDto,
  DashboardQueryDto,
  DashboardResponseDto,
  ExportReportDto,
  ExportResponseDto
} from './dto/reports.dto';
import {
  QueryReportsDto,
  RevenueQueryDto,
  PatientQueryDto,
  DoctorQueryDto,
  AppointmentQueryDto,
  InventoryQueryDto,
  PaymentQueryDto,
  DashboardQueryDto as DashboardQuery,
  ExportQueryDto
} from './dto/query-reports.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    branchId: string;
    role: string;
  };
}

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('revenue')
  @ApiOperation({ summary: 'Generate revenue report' })
  @ApiResponse({ status: 200, description: 'Revenue report generated successfully', type: RevenueReportResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async generateRevenueReport(
    @Query() query: RevenueQueryDto,
    @Request() req: AuthenticatedRequest
  ): Promise<RevenueReportResponseDto> {
    return this.reportsService.generateRevenueReport(query, req.user.branchId);
  }

  @Get('patients')
  @ApiOperation({ summary: 'Generate patient demographics report' })
  @ApiResponse({ status: 200, description: 'Patient report generated successfully', type: PatientReportResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async generatePatientReport(
    @Query() query: PatientQueryDto,
    @Request() req: AuthenticatedRequest
  ): Promise<PatientReportResponseDto> {
    return this.reportsService.generatePatientReport(query, req.user.branchId);
  }

  @Get('doctors')
  @ApiOperation({ summary: 'Generate doctor performance report' })
  @ApiResponse({ status: 200, description: 'Doctor report generated successfully', type: DoctorReportResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async generateDoctorReport(
    @Query() query: DoctorQueryDto,
    @Request() req: AuthenticatedRequest
  ): Promise<DoctorReportResponseDto> {
    return this.reportsService.generateDoctorReport(query, req.user.branchId);
  }

  @Get('appointments')
  @ApiOperation({ summary: 'Generate appointment analytics report' })
  @ApiResponse({ status: 200, description: 'Appointment report generated successfully', type: AppointmentReportResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async generateAppointmentReport(
    @Query() query: AppointmentQueryDto,
    @Request() req: AuthenticatedRequest
  ): Promise<AppointmentReportResponseDto> {
    return this.reportsService.generateAppointmentReport(query, req.user.branchId);
  }

  @Get('inventory')
  @ApiOperation({ summary: 'Generate inventory management report' })
  @ApiResponse({ status: 200, description: 'Inventory report generated successfully', type: InventoryReportResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async generateInventoryReport(
    @Query() query: InventoryQueryDto,
    @Request() req: AuthenticatedRequest
  ): Promise<InventoryReportResponseDto> {
    return this.reportsService.generateInventoryReport(query, req.user.branchId);
  }

  @Get('payments')
  @ApiOperation({ summary: 'Generate payment reconciliation report' })
  @ApiResponse({ status: 200, description: 'Payment report generated successfully', type: PaymentReportResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async generatePaymentReport(
    @Query() query: PaymentQueryDto,
    @Request() req: AuthenticatedRequest
  ): Promise<PaymentReportResponseDto> {
    return this.reportsService.generatePaymentReport(query, req.user.branchId);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Generate comprehensive dashboard' })
  @ApiResponse({ status: 200, description: 'Dashboard generated successfully', type: DashboardResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async generateDashboard(
    @Query() query: DashboardQuery,
    @Request() req: AuthenticatedRequest
  ): Promise<DashboardResponseDto> {
    return this.reportsService.generateDashboard(query, req.user.branchId);
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export report to various formats' })
  @ApiResponse({ status: 200, description: 'Report exported successfully', type: ExportResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async exportReport(
    @Body() exportDto: ExportReportDto,
    @Request() req: AuthenticatedRequest
  ): Promise<ExportResponseDto> {
    return this.reportsService.exportReport(exportDto, req.user.branchId);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get reports summary and available report types' })
  @ApiResponse({ status: 200, description: 'Reports summary retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getReportsSummary(@Request() req: AuthenticatedRequest): Promise<any> {
    return {
      availableReports: [
        {
          type: 'REVENUE',
          name: 'Revenue Report',
          description: 'Comprehensive financial analysis including revenue, GST, and payment breakdowns',
          endpoint: '/reports/revenue',
          parameters: ['startDate', 'endDate', 'period', 'doctorId', 'paymentMode', 'serviceType']
        },
        {
          type: 'PATIENT',
          name: 'Patient Demographics',
          description: 'Patient statistics, demographics, and registration trends',
          endpoint: '/reports/patients',
          parameters: ['startDate', 'endDate', 'period', 'minAge', 'maxAge', 'gender', 'city']
        },
        {
          type: 'DOCTOR',
          name: 'Doctor Performance',
          description: 'Doctor performance metrics, department analysis, and top performers',
          endpoint: '/reports/doctors',
          parameters: ['startDate', 'endDate', 'period', 'department', 'includePerformanceMetrics']
        },
        {
          type: 'APPOINTMENT',
          name: 'Appointment Analytics',
          description: 'Appointment trends, completion rates, and room utilization',
          endpoint: '/reports/appointments',
          parameters: ['startDate', 'endDate', 'period', 'doctorId', 'status', 'visitType', 'roomId']
        },
        {
          type: 'INVENTORY',
          name: 'Inventory Management',
          description: 'Stock analysis, low stock alerts, and transaction summaries',
          endpoint: '/reports/inventory',
          parameters: ['startDate', 'endDate', 'period', 'itemType', 'category', 'manufacturer']
        },
        {
          type: 'PAYMENT',
          name: 'Payment Reconciliation',
          description: 'Payment analysis, reconciliation, and refund summaries',
          endpoint: '/reports/payments',
          parameters: ['startDate', 'endDate', 'period', 'paymentMode', 'gateway', 'includeReconciliation']
        }
      ],
      exportFormats: ['PDF', 'EXCEL', 'CSV', 'JSON'],
      supportedPeriods: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM'],
      generatedAt: new Date()
    };
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get overall system statistics' })
  @ApiResponse({ status: 200, description: 'System statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSystemStatistics(@Request() req: AuthenticatedRequest): Promise<any> {
    return this.reportsService.getSystemStatistics(req.user.branchId);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get system alerts and notifications' })
  @ApiResponse({ status: 200, description: 'System alerts retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSystemAlerts(@Request() req: AuthenticatedRequest): Promise<any> {
    return this.reportsService.getSystemAlerts(req.user.branchId);
  }
}
