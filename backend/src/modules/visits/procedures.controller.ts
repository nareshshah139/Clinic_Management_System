import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Put, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CLINIC_STAFF_ROLES } from '../../shared/decorators/clinic-staff-roles';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CreateProcedureDto, UpdateProcedureAccessDto, UpdateProcedureDto } from './dto/procedure.dto';
import { PROCEDURE_LEAD_ROLES, ProcedureAccessService, isRecordedProcedure } from './procedure-access';
import { VisitsService } from './visits.service';

interface AuthenticatedRequest {
  branchId?: string;
  user: { id: string; branchId: string; role: string };
}

const branchOf = (req: AuthenticatedRequest) => req.branchId ?? req.user.branchId;

/**
 * Procedure records are visits, saved here rather than through /visits so the clinic's procedure
 * access setting can widen who records them without widening who edits a visit.
 */
@ApiTags('Procedures')
@Controller('procedures')
@Roles(...CLINIC_STAFF_ROLES)
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProceduresController {
  constructor(
    private readonly access: ProcedureAccessService,
    private readonly visits: VisitsService,
  ) {}

  @Get('access')
  @Roles(...PROCEDURE_LEAD_ROLES)
  getAccess(@Request() req: AuthenticatedRequest) {
    return this.access.get(branchOf(req));
  }

  @Put('access')
  @Roles(...PROCEDURE_LEAD_ROLES)
  updateAccess(@Body() dto: UpdateProcedureAccessDto, @Request() req: AuthenticatedRequest) {
    return this.access.update(branchOf(req), req.user.id, dto.recordRoles);
  }

  @Get('access/me')
  myAccess(@Request() req: AuthenticatedRequest) {
    return this.access.forRole(branchOf(req), req.user.role);
  }

  @Post()
  async create(@Body() dto: CreateProcedureDto, @Request() req: AuthenticatedRequest) {
    const branchId = branchOf(req);
    await this.access.assertCanRecord(branchId, req.user.role);
    return this.visits.create({ ...dto, complaints: [] }, branchId, req.user.id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProcedureDto, @Request() req: AuthenticatedRequest) {
    const branchId = branchOf(req);
    await this.access.assertCanRecord(branchId, req.user.role);
    const visit = await this.visits.findOne(id, branchId);
    if (!isRecordedProcedure(visit.plan?.dermatology?.procedures?.[0])) throw new NotFoundException('Procedure not found');
    return this.visits.update(id, dto, branchId, req.user.id);
  }
}
