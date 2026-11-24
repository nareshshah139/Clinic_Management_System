import { Body, Controller, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn } from 'class-validator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CLINIC_STAFF_ROLES } from '../../../shared/decorators/clinic-staff-roles';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { PatientPortalService } from './patient-portal.service';

export class RecordConsentDto {
  @IsIn(['agreed', 'refused'])
  action!: 'agreed' | 'refused';
}

export class SetPortalEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

interface AuthenticatedRequest {
  user: { id: string; branchId: string; role: string };
}

@Controller('patients')
@Roles(...CLINIC_STAFF_ROLES)
@UseGuards(JwtAuthGuard)
export class PatientPortalController {
  constructor(private readonly portal: PatientPortalService) {}

  @Post(':id/whatsapp-consent')
  recordConsent(@Param('id') id: string, @Body() dto: RecordConsentDto, @Request() req: AuthenticatedRequest) {
    return this.portal.recordConsent(id, req.user.branchId, dto.action, req.user.id);
  }

  @Patch(':id/portal')
  setPortalEnabled(@Param('id') id: string, @Body() dto: SetPortalEnabledDto, @Request() req: AuthenticatedRequest) {
    return this.portal.setPortalEnabled(id, req.user.branchId, dto.enabled);
  }
}
