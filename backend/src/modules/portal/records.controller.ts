import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Portal, PortalPatient } from './portal.decorator';
import type { PortalPatientPrincipal } from './principal';
import { PortalMessageDto } from './records.dto';
import { PortalRecordsService } from './records.service';

/** The chosen patient's records, read-only, and their thread with the clinic (PP-63 to PP-66). */
@ApiTags('Portal')
@Controller('portal/records')
export class PortalRecordsController {
  constructor(private readonly records: PortalRecordsService) {}

  @Get('home')
  @Portal('session-patient')
  home(@PortalPatient() p: PortalPatientPrincipal) {
    return this.records.home(p);
  }

  @Get('appointments')
  @Portal('session-patient')
  appointments(@PortalPatient() p: PortalPatientPrincipal) {
    return this.records.appointments(p);
  }

  @Get('visits')
  @Portal('session-patient')
  visits(@PortalPatient() p: PortalPatientPrincipal) {
    return this.records.visits(p);
  }

  @Get('check-ins')
  @Portal('session-patient')
  checkIns(@PortalPatient() p: PortalPatientPrincipal) {
    return this.records.checkIns(p);
  }

  @Get('messages')
  @Portal('session-patient')
  messages(@PortalPatient() p: PortalPatientPrincipal) {
    return this.records.messages(p);
  }

  @Post('messages')
  @HttpCode(200)
  @Portal('session-patient')
  write(@PortalPatient() p: PortalPatientPrincipal, @Body() body: PortalMessageDto) {
    return this.records.write(p, body);
  }
}
