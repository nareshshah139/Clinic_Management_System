import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import {
  Actor,
  ClinicInvestigationsService,
} from './clinic-investigations.service';
import { ClinicInvestigationNameDto } from './dto/clinic-investigation.dto';

const WRITE_ROLES = [UserRole.DOCTOR, UserRole.ADMIN, UserRole.OWNER];

/**
 * @cc [owner:nareshshah139,label:security] clinic-investigation-route-access
 * Listing MUST be open to OWNER, ADMIN, DOCTOR and NURSE. Creating, renaming and deleting MUST be
 * open to OWNER, ADMIN and DOCTOR and MUST return 403 to every other role, NURSE included. Any
 * other role MUST get 403 on every route, and a request without a user MUST NOT reach the service.
 */
@ApiTags('Clinic investigations')
@Controller('clinic-investigations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ClinicInvestigationsController {
  constructor(private readonly service: ClinicInvestigationsService) {}

  @Get()
  @Roles(...WRITE_ROLES, UserRole.NURSE)
  list(@Request() req: { user: Actor }) {
    return this.service.list(req.user.branchId);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  create(
    @Body() dto: ClinicInvestigationNameDto,
    @Request() req: { user: Actor },
  ) {
    return this.service.create(dto.name, req.user);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  rename(
    @Param('id') id: string,
    @Body() dto: ClinicInvestigationNameDto,
    @Request() req: { user: Actor },
  ) {
    return this.service.rename(id, dto.name, req.user.branchId);
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  remove(@Param('id') id: string, @Request() req: { user: Actor }) {
    return this.service.remove(id, req.user.branchId);
  }
}
