import { Controller, Get } from '@nestjs/common';
import type { PortalCaller } from './portal-call';
import { Caller, PortalInternal } from './portal-internal.decorator';

@Controller('internal/portal')
@PortalInternal()
export class PortalInternalController {
  @Get('ping')
  ping(@Caller() caller: PortalCaller) {
    return { ok: true, caller: caller.kind };
  }
}
