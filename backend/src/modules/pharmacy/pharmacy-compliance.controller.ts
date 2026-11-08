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
  PharmacyDayWiseQueryDto,
  PharmacyExpiryReturnsQueryDto,
  PharmacyGstSummaryQueryDto,
  PharmacyItemMarginQueryDto,
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

  @Get('day-wise-summary')
  @Roles('OWNER' as any, 'ADMIN' as any, 'ACCOUNTANT' as any, 'PHARMACIST' as any, 'DOCTOR' as any)
  @Permissions('pharmacy:compliance:read')
  @ApiOperation({ summary: 'One row per clinic day: bill-number range and GST slab split' })
  @ApiResponse({ status: 200, description: 'Day-wise summary generated' })
  getDayWiseSummary(@Query() query: PharmacyDayWiseQueryDto, @Request() req: any) {
    return this.complianceService.getDayWiseSummary(query, req.user.branchId);
  }

  @Get('item-margin')
  @Roles('OWNER' as any, 'ADMIN' as any, 'ACCOUNTANT' as any, 'PHARMACIST' as any, 'DOCTOR' as any)
  @Permissions('pharmacy:compliance:read')
  @ApiOperation({ summary: 'Sales, cost of goods sold, net GST and profit per item' })
  @ApiResponse({ status: 200, description: 'Item-wise margin generated' })
  getItemMargin(@Query() query: PharmacyItemMarginQueryDto, @Request() req: any) {
    return this.complianceService.getItemMargin(query, req.user.branchId);
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
  @ApiOperation({ summary: 'Retired audit submission; use versioned Counts & audit' })
  @ApiResponse({ status: 410, description: 'No stock changed; canonical count workflow URL returned' })
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
