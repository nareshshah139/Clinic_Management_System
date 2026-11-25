import { applyDecorators, createParamDecorator, ExecutionContext, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/auth.controller';
import { PORTAL_CALLER, PortalInternalGuard, PortalInternalRequest } from './portal-internal.guard';

/**
 * @cc [owner:nareshshah139,label:security] one-internal-decorator
 * Every controller under /internal/portal MUST carry PortalInternal(), which hides it from the staff
 * JWT guard and the shared-address throttle and applies PortalInternalGuard instead (PP-83).
 */
export const PortalInternal = () =>
  applyDecorators(Public(), SkipThrottle(), UseGuards(PortalInternalGuard));

export const Caller = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<PortalInternalRequest>()[PORTAL_CALLER],
);
