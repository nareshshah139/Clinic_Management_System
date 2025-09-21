import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { 
  CreateInvoiceDto, 
  UpdateInvoiceDto, 
  PaymentDto, 
  RefundDto, 
  BulkPaymentDto,
} from './dto/invoice.dto';
import { 
  QueryInvoicesDto, 
  QueryPaymentsDto, 
  PaymentSummaryDto, 
  RevenueReportDto,
  OutstandingInvoicesDto,
} from './dto/query-billing.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Permissions } from '../../shared/decorators/permissions.decorator';
import { UserRole } from '@prisma/client';

interface AuthenticatedRequest {
  user: {
    id: string;
    branchId: string;
    role: string;
  };
}

@ApiTags('Billing')
@Controller('billing')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // Invoice endpoints
  @Post('invoices')
  @Roles(UserRole.ADMIN, UserRole.RECEPTION)
  @Permissions('billing:invoice:create')
  async createInvoice(
    @Body() createInvoiceDto: CreateInvoiceDto,
    @Request() req: AuthenticatedRequest,
  ) {
    try {
      console.log('🔥 Invoice creation request received:', {
        patientId: createInvoiceDto.patientId,
        items: createInvoiceDto.items,
        branchId: req.user.branchId,
        userId: req.user.id
      });
      
      const result = await this.billingService.createInvoice(createInvoiceDto, req.user.branchId);
      console.log('✅ Invoice created successfully:', result.id);
      return result;
    } catch (error) {
      console.error('❌ Invoice creation failed:', error);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }

  @Get('invoices')
  @Roles(UserRole.ADMIN, UserRole.RECEPTION, UserRole.DOCTOR)
  @Permissions('billing:invoice:read')
  findAllInvoices(
    @Query() query: QueryInvoicesDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.billingService.findAllInvoices(query, req.user.branchId);
  }

  @Get('invoices/outstanding')
  @Roles(UserRole.ADMIN, UserRole.RECEPTION)
  @Permissions('billing:invoice:read')
  getOutstandingInvoices(
    @Query() query: OutstandingInvoicesDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.billingService.getOutstandingInvoices(query, req.user.branchId);
  }

  @Get('invoices/:id')
  @Roles(UserRole.ADMIN, UserRole.RECEPTION, UserRole.DOCTOR)
  @Permissions('billing:invoice:read')
  findInvoiceById(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.billingService.findInvoiceById(id, req.user.branchId);
  }

  @Patch('invoices/:id')
  @Roles(UserRole.ADMIN)
  @Permissions('billing:invoice:update')
  updateInvoice(
    @Param('id') id: string,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.billingService.updateInvoice(id, updateInvoiceDto, req.user.branchId);
  }

  @Delete('invoices/:id')
  @Roles(UserRole.ADMIN)
  @Permissions('billing:invoice:delete')
  cancelInvoice(
    @Param('id') id: string,
    @Query('reason') reason?: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.billingService.cancelInvoice(id, req.user.branchId, reason);
  }

  // Payment endpoints
  @Post('payments')
  @Roles(UserRole.ADMIN, UserRole.RECEPTION)
  @Permissions('billing:payment:process')
  processPayment(
    @Body() paymentDto: PaymentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.billingService.processPayment(paymentDto, req.user.branchId);
  }

  @Post('payments/bulk')
  @Roles(UserRole.ADMIN)
  @Permissions('billing:payment:bulk')
  processBulkPayment(
    @Body() bulkPaymentDto: BulkPaymentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.billingService.processBulkPayment(bulkPaymentDto, req.user.branchId);
  }

  @Post('payments/:id/confirm')
  @Roles(UserRole.ADMIN, UserRole.RECEPTION)
  @Permissions('billing:payment:confirm')
  confirmPayment(
    @Param('id') id: string,
    @Body() gatewayResponse: Record<string, any>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.billingService.confirmPayment(id, req.user.branchId, gatewayResponse);
  }

  @Get('payments')
  @Roles(UserRole.ADMIN, UserRole.RECEPTION)
  @Permissions('billing:payment:read')
  findAllPayments(
    @Query() query: QueryPaymentsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.billingService.findAllPayments(query, req.user.branchId);
  }

  @Get('payments/summary')
  @Roles(UserRole.ADMIN)
  @Permissions('billing:payment:summary')
  getPaymentSummary(
    @Query() query: PaymentSummaryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.billingService.getPaymentSummary(query, req.user.branchId);
  }

  // Refund endpoints
  @Post('refunds')
  @Roles(UserRole.ADMIN)
  @Permissions('billing:refund:create')
  processRefund(
    @Body() refundDto: RefundDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.billingService.processRefund(refundDto, req.user.branchId);
  }

  // Report endpoints
  @Get('reports/revenue')
  @Roles(UserRole.ADMIN)
  @Permissions('billing:revenue:read')
  getRevenueReport(
    @Query() query: RevenueReportDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.billingService.getRevenueReport(query, req.user.branchId);
  }

  // Statistics endpoint
  @Get('statistics')
  @Roles(UserRole.ADMIN)
  @Permissions('billing:statistics:read')
  getStatistics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.billingService.getPaymentSummary(
      { startDate, endDate },
      req.user.branchId,
    );
  }

  // Utility: generate sample invoices for existing patients
  @Post('invoices/generate-samples')
  @Roles(UserRole.ADMIN)
  @Permissions('billing:invoice:generateSamples')
  generateSamples(
    @Body() body: { maxPatients?: number; perPatient?: number },
    @Request() req: AuthenticatedRequest,
  ) {
    return this.billingService.generateSampleInvoices(body || {}, req.user.branchId);
  }
}
