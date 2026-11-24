import { Controller, ForbiddenException, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CLINIC_STAFF_ROLES } from '../../shared/decorators/clinic-staff-roles';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { FollowUpsService } from './follow-ups.service';

type Req = { user: { id: string; branchId: string; role?: UserRole }; branchId?: string };

@ApiTags('Follow-ups')
@Controller('follow-ups')
@Roles(...CLINIC_STAFF_ROLES)
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  /**
   * @cc [owner:nareshshah139,label:security] owner-only-plan-import
   * Only an OWNER MAY import instruments and plans from the reviewed data files (PP-24). The role
   * gate lets ADMIN and DOCTOR through every role list, so the handler checks the role itself.
   */
  @Post('import')
  @Roles(UserRole.OWNER)
  importData(@Request() req: Req) {
    if (req.user.role !== UserRole.OWNER) throw new ForbiddenException('Only the owner can import follow-up plans');
    return this.followUps.importData(req.user.id);
  }

  @Get('plans')
  listPlans() {
    return this.followUps.listPlans();
  }

  @Get('patients/:patientId/tracks')
  activeTracks(@Param('patientId') patientId: string, @Request() req: Req) {
    return this.followUps.activeTracks(patientId, req.branchId ?? req.user.branchId);
  }

  @Post('tracks/:id/stop')
  @Roles(UserRole.DOCTOR, UserRole.ADMIN, UserRole.OWNER)
  stopTrack(@Param('id') id: string, @Request() req: Req) {
    return this.followUps.stopTrack(id, req.branchId ?? req.user.branchId, req.user.id);
  }
}
