import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Request,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Permissions } from '../../shared/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import {
  PHARMACY_REPORT_IDS,
  PharmacyReportId,
  PharmacyReportQueryDto,
  RecordCashCountDto,
} from './dto/pharmacy-reports.dto';
import { PharmacyReportsService } from './pharmacy-reports.service';

const reportId = (value: string): PharmacyReportId => {
  if (!(PHARMACY_REPORT_IDS as readonly string[]).includes(value))
    throw new BadRequestException(`Unknown pharmacy report ${value}`);
  return value as PharmacyReportId;
};

/**
 * @cc [owner:nareshshah139,label:product] pharmacy-report-same-figures
 * Every Pharmacy Report MUST be built once per request from posted documents only, and its Excel,
 * CSV and PDF downloads MUST carry the same sections, columns, rows and totals as the JSON.
 */
@ApiTags('Pharmacy Report')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pharmacy/reports')
export class PharmacyReportsController {
  constructor(private readonly reports: PharmacyReportsService) {}

  @Get(':reportId')
  @Header('Cache-Control', 'private, no-store')
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.PHARMACIST,
    UserRole.DOCTOR,
  )
  @Permissions('pharmacy:compliance:read')
  @ApiOperation({
    summary:
      'One Pharmacy Report for a date range, as JSON or as an Excel, CSV or PDF download',
  })
  @ApiResponse({
    status: 200,
    description:
      'Report sections with totals; with format, the same report as a file',
  })
  @ApiResponse({
    status: 400,
    description: 'Unknown report, invalid filters, or a range over 400 days',
  })
  async report(
    @Param('reportId') id: string,
    @Query() query: PharmacyReportQueryDto,
    @Request() req: any,
  ) {
    const actor = { branchId: req.user.branchId, role: req.user.role, id: req.user.id };
    if (!query.format) return this.reports.report(reportId(id), query, actor);
    const file = await this.reports.file(
      reportId(id),
      query,
      actor,
      query.format,
    );
    return new StreamableFile(file.data, {
      type: file.mimeType,
      disposition: `attachment; filename="${file.fileName}"`,
    });
  }

  @Post('daily-collection/:day/counts')
  @Header('Cache-Control', 'private, no-store')
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.PHARMACIST,
    UserRole.DOCTOR,
  )
  @Permissions('pharmacy:compliance:audit')
  @ApiOperation({
    summary: 'Record what was counted for a clinic day, per payment mode',
  })
  @ApiResponse({
    status: 201,
    description: 'The day’s collection with the new count and its difference',
  })
  @ApiResponse({
    status: 409,
    description: 'Another count was saved after the one this was based on',
  })
  recordCount(
    @Param('day') day: string,
    @Body() dto: RecordCashCountDto,
    @Request() req: any,
  ) {
    return this.reports.recordCount(day, dto, {
      branchId: req.user.branchId,
      id: req.user.id,
      role: req.user.role,
    });
  }
}
