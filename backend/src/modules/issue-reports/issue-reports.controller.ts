import { Body, Controller, Get, HttpCode, Post, Request, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { CLINIC_STAFF_ROLES } from '../../shared/decorators/clinic-staff-roles';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { MAX_SCREENSHOT_BYTES, MAX_SCREENSHOTS, parseIssueReport } from './issue-report';
import { IssueReportsService } from './issue-reports.service';

interface AuthenticatedRequest {
  branchId?: string;
  user: { id: string; role: string; branchId: string };
}

@ApiTags('Issue Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('issue-reports')
export class IssueReportsController {
  constructor(private readonly issueReports: IssueReportsService) {}

  @Get('status')
  @Roles(...CLINIC_STAFF_ROLES)
  status() {
    return { enabled: this.issueReports.isEnabled() };
  }

  @Post()
  @HttpCode(201)
  @Roles(...CLINIC_STAFF_ROLES)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('screenshots', MAX_SCREENSHOTS, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SCREENSHOT_BYTES, files: MAX_SCREENSHOTS },
    }),
  )
  create(
    @Body() fields: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Request() req: AuthenticatedRequest,
  ) {
    const report = parseIssueReport(fields, files ?? []);
    return this.issueReports.submit(report, {
      id: req.user.id,
      role: req.user.role,
      branchId: req.branchId ?? req.user.branchId,
    });
  }
}
