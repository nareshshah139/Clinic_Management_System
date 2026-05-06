import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Permissions } from '../../shared/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { PharmacyComplianceService } from './pharmacy-compliance.service';
import {
  ApplyPharmacyAuditAdjustmentsDto,
  CreatePharmacyAuditDto,
  PharmacyExpiryReturnsQueryDto,
  PharmacyGstSummaryQueryDto,
  PharmacyMonthlyReportQueryDto,
} from './dto/pharmacy-compliance.dto';

@ApiTags('Pharmacy Compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pharmacy/compliance')
export class PharmacyComplianceController {
  constructor(private readonly complianceService: PharmacyComplianceService) {}

  @Get('gst-summary')
  @Roles('OWNER' as any, 'ADMIN' as any, 'ACCOUNTANT' as any, 'PHARMACIST' as any)
  @Permissions('pharmacy:compliance:read')
  @ApiOperation({ summary: 'Get pharmacy GST input/output summary' })
  @ApiResponse({ status: 200, description: 'GST summary generated' })
  getGstSummary(
    @Query() query: PharmacyGstSummaryQueryDto,
    @Request() req: any,
  ) {
    return this.complianceService.getGstSummary(query, req.user.branchId);
  }

  @Get('monthly-report')
  @Roles('OWNER' as any, 'ADMIN' as any, 'ACCOUNTANT' as any, 'PHARMACIST' as any)
  @Permissions('pharmacy:compliance:read')
  @ApiOperation({ summary: 'Get monthly pharmacy compliance and P&L report' })
  @ApiResponse({ status: 200, description: 'Monthly report generated' })
  getMonthlyReport(
    @Query() query: PharmacyMonthlyReportQueryDto,
    @Request() req: any,
  ) {
    return this.complianceService.getMonthlyReport(query, req.user.branchId);
  }

  @Get('expiry-returns')
  @Roles('OWNER' as any, 'ADMIN' as any, 'PHARMACIST' as any)
  @Permissions('pharmacy:compliance:read')
  @ApiOperation({ summary: 'Get batches due for return or quarantine' })
  @ApiResponse({ status: 200, description: 'Expiry return list generated' })
  getExpiryReturns(
    @Query() query: PharmacyExpiryReturnsQueryDto,
    @Request() req: any,
  ) {
    return this.complianceService.getExpiryReturns(
      query.window,
      req.user.branchId,
    );
  }

  @Post('audits')
  @Roles('OWNER' as any, 'ADMIN' as any, 'PHARMACIST' as any, 'MANAGER' as any)
  @Permissions('pharmacy:compliance:audit')
  @ApiOperation({ summary: 'Create an inventory audit count batch' })
  @ApiResponse({ status: 201, description: 'Audit batch created' })
  createAuditBatch(@Body() dto: CreatePharmacyAuditDto, @Request() req: any) {
    return this.complianceService.createAuditBatch(
      dto,
      req.user.branchId,
      req.user.id,
    );
  }

  @Post('audits/:auditId/adjustments')
  @Roles('OWNER' as any, 'ADMIN' as any, 'PHARMACIST' as any, 'MANAGER' as any)
  @Permissions('pharmacy:compliance:audit')
  @ApiOperation({ summary: 'Apply post-audit stock corrections' })
  @ApiResponse({ status: 201, description: 'Audit adjustments applied' })
  applyAuditAdjustments(
    @Param('auditId') auditId: string,
    @Body() dto: ApplyPharmacyAuditAdjustmentsDto,
    @Request() req: any,
  ) {
    return this.complianceService.applyAuditAdjustments(
      auditId,
      dto,
      req.user.branchId,
      req.user.id,
      req.user.role,
    );
  }
}
