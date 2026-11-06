import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { PharmacyReportsService } from './pharmacy-reports.service';

@Controller('reports/pharmacy')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.DOCTOR)
export class PharmacyReportsController {
  constructor(private readonly reports: PharmacyReportsService) {}

  /**
   * @cc [owner:nareshshah139,label:security] pharmacy-report-access
   * Pharmacy reports require an authenticated owner, admin or doctor and always use their branch.
   */
  @Get()
  get(@Request() req: { user: { branchId: string } }, @Query('start') start: string, @Query('end') end: string) {
    return this.reports.getReport(req.user.branchId, start, end);
  }
}
