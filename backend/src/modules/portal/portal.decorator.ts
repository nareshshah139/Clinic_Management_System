import { applyDecorators, createParamDecorator, ExecutionContext, Header, UseFilters, UseGuards } from '@nestjs/common';
import { Public } from '../auth/auth.controller';
import { LinkInactive, LinkInactiveFilter } from './link-inactive';
import { PortalGuard } from './portal.guard';
import { PRINCIPAL, PortalRequest } from './principal';

export const PORTAL_ROUTE = 'portalRoute';

/**
 * @cc [owner:nareshshah139,label:security] one-portal-decorator
 * Every route under /portal MUST carry Portal(), which marks it public to the staff JWT guard
 * and applies PortalGuard, so no portal route answers without a portal credential (PP-83).
 */
export const Portal = () =>
  applyDecorators(
    Public(),
    (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
      Reflect.defineMetadata(PORTAL_ROUTE, true, descriptor?.value ?? target);
    },
    UseGuards(PortalGuard),
    UseFilters(LinkInactiveFilter),
    Header('Cache-Control', 'no-store'),
  );

/** The principal PortalGuard built for this request. */
export const TaskLink = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const principal = ctx.switchToHttp().getRequest<PortalRequest>()[PRINCIPAL];
  if (!principal) throw new LinkInactive();
  return principal;
});
