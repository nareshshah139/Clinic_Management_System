import { applyDecorators, createParamDecorator, ExecutionContext, Header, SetMetadata, UnauthorizedException, UseFilters, UseGuards } from '@nestjs/common';
import { Public } from '../auth/auth.controller';
import { LinkInactive, LinkInactiveFilter } from './link-inactive';
import { PORTAL_CREDENTIAL, PortalCredential, PortalGuard, SESSION_ENDED } from './portal.guard';
import { PRINCIPAL, PortalPrincipal, PortalRequest } from './principal';

export const PORTAL_ROUTE = 'portalRoute';

/**
 * @cc [owner:nareshshah139,label:security] one-portal-decorator
 * Every route under /portal MUST carry Portal(), which marks it public to the staff JWT guard
 * and applies PortalGuard, so no portal route answers without a portal credential (PP-83). Only
 * the two sign-in routes take the phone and code as their credential.
 */
export const Portal = (credential: PortalCredential = 'task-link') =>
  applyDecorators(
    Public(),
    (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
      Reflect.defineMetadata(PORTAL_ROUTE, true, descriptor?.value ?? target);
    },
    SetMetadata(PORTAL_CREDENTIAL, credential),
    UseGuards(PortalGuard),
    UseFilters(LinkInactiveFilter),
    Header('Cache-Control', 'no-store'),
  );

const principalOf = <K extends PortalPrincipal['kind']>(ctx: ExecutionContext, kind: K) => {
  const principal = ctx.switchToHttp().getRequest<PortalRequest>()[PRINCIPAL];
  return principal?.kind === kind ? (principal as Extract<PortalPrincipal, { kind: K }>) : null;
};

/** The task-link principal PortalGuard built for this request. */
export const TaskLink = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const principal = principalOf(ctx, 'task-link');
  if (!principal) throw new LinkInactive();
  return principal;
});

/** The signed-in phone, before or after a profile is chosen. */
export const SignedIn = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const principal = principalOf(ctx, 'portal-identity');
  if (!principal) throw new UnauthorizedException(SESSION_ENDED);
  return principal;
});

/** The chosen patient of a signed-in session. */
export const PortalPatient = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const principal = principalOf(ctx, 'portal-patient');
  if (!principal) throw new UnauthorizedException(SESSION_ENDED);
  return principal;
});
