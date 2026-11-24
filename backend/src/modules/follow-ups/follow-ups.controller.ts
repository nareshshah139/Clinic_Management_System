import { Controller, ForbiddenException, Get, Param, Post, Request, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
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

  /**
   * @cc [owner:nareshshah139,label:security] attachment-serving-headers
   * A patient photo MUST be served only to the Follow-ups roles (doctor, nurse, reception,
   * manager, admin, owner; never pharmacist or accountant) of the patient's branch (any branch
   * when the sender is unknown, as the clinic has one number), as image/jpeg with
   * Cache-Control: private, no-store and X-Content-Type-Options: nosniff (PP-87).
   */
  @Get('attachments/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTION)
  async attachment(@Param('id') id: string, @Request() req: Req, @Res() res: Response) {
    const bytes = await this.followUps.attachment(id, req.branchId ?? req.user.branchId);
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
    res.send(bytes);
  }
}
