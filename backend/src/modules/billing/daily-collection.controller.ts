import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { DailyCollectionService } from './daily-collection.service';

/**
 * @cc [owner:nareshshah139,label:security] collections-authorized-branch
 * Collection reports MUST use the authenticated branch and MUST reject patients,
 * pharmacists and other roles outside clinic billing access.
 */
@Controller('billing/daily-collection')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTION, UserRole.ACCOUNTANT)
export class DailyCollectionController {
  constructor(private readonly collections: DailyCollectionService) {}

  @Get()
  read(@Query('date') date: string, @Request() req: { user: { branchId: string } }) {
    return this.collections.read(req.user.branchId, date);
  }
}
