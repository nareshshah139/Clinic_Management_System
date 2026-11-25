import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Caller, PortalInternal } from './portal-internal.decorator';
import type { PortalCaller } from './portal-call';
import { patientOf } from './session-caller';
import { PortalMessageDto } from '../portal/records.dto';
import { PortalRecordsService } from '../portal/records.service';
import { SignInService } from '../portal/sign-in.service';

/** The chosen patient's records, read-only, and their thread with the clinic (PP-63 to PP-66). */
@Controller('internal/portal/records')
@PortalInternal()
export class InternalRecordsController {
  constructor(
    private readonly signIn: SignInService,
    private readonly records: PortalRecordsService,
  ) {}

  @Get('home')
  async home(@Caller() caller: PortalCaller) {
    return this.records.home(await patientOf(this.signIn, caller));
  }

  @Get('appointments')
  async appointments(@Caller() caller: PortalCaller) {
    return this.records.appointments(await patientOf(this.signIn, caller));
  }

  @Get('visits')
  async visits(@Caller() caller: PortalCaller) {
    return this.records.visits(await patientOf(this.signIn, caller));
  }

  @Get('check-ins')
  async checkIns(@Caller() caller: PortalCaller) {
    return this.records.checkIns(await patientOf(this.signIn, caller));
  }

  @Get('messages')
  async messages(@Caller() caller: PortalCaller) {
    return this.records.messages(await patientOf(this.signIn, caller));
  }

  @Post('messages')
  @HttpCode(200)
  async write(@Caller() caller: PortalCaller, @Body() body: PortalMessageDto) {
    return this.records.write(await patientOf(this.signIn, caller), body);
  }
}
