import { SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { Authenticated, Roles } from '../decorators/roles.decorator';
import { Permissions } from '../decorators/permissions.decorator';
import { RolesGuard } from './roles.guard';

class Routes {
  unclassified() {}
  @SetMetadata('isPublic', true) publicRoute() {}
  @Authenticated() selfRoute() {}
  @Roles(UserRole.RECEPTION) receptionRoute() {}
  @Permissions('inventory:item:read') inventoryRoute() {}
}
const guard = new RolesGuard(new Reflector());
const context = (method: keyof Routes, role?: UserRole) => ({
  getHandler: () => Routes.prototype[method], getClass: () => Routes,
  switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
} as any);

it('denies undeclared routes even to privileged accounts', () => {
  for (const role of Object.values(UserRole)) expect(guard.canActivate(context('unclassified', role))).toBe(false);
});
it('keeps public and explicitly authenticated routes distinct', () => {
  expect(guard.canActivate(context('publicRoute'))).toBe(true);
  expect(guard.canActivate(context('selfRoute'))).toBe(false);
  expect(guard.canActivate(context('selfRoute', UserRole.PATIENT))).toBe(true);
});
it('passes permission declarations to the permission guard only for authenticated users', () => {
  expect(guard.canActivate(context('inventoryRoute'))).toBe(false);
  expect(guard.canActivate(context('inventoryRoute', UserRole.PHARMACIST))).toBe(true);
});
it('enforces declared role rules', () => {
  expect(guard.canActivate(context('receptionRoute', UserRole.RECEPTION))).toBe(true);
  expect(guard.canActivate(context('receptionRoute', UserRole.LAB_TECH))).toBe(false);
});

@Authenticated()
class SharedRoutes {
  @Roles(UserRole.RECEPTION) restricted() {}
}
it('does not let a class-wide authenticated policy override a narrower method role', () => {
  const ctx = { getHandler: () => SharedRoutes.prototype.restricted, getClass: () => SharedRoutes,
    switchToHttp: () => ({ getRequest: () => ({ user: { role: UserRole.LAB_TECH } }) }) } as any;
  expect(guard.canActivate(ctx)).toBe(false);
});
