import { ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { Authenticated, Roles } from '../decorators/roles.decorator';
import { Permissions } from '../decorators/permissions.decorator';
import { RolesGuard } from './roles.guard';

class Routes {
  @Roles(UserRole.RECEPTION) receptionOnly() {}
  @Roles(UserRole.PHARMACIST, UserRole.NURSE) clinicalStaff() {}
}

@Roles(UserRole.ACCOUNTANT)
class AccountantRoutes {
  inherited() {}
  @Roles(UserRole.LAB_TECH) overridden() {}
}

const context = (
  target: any,
  method: string,
  user: unknown,
): ExecutionContext =>
  ({
    getHandler: () => target.prototype[method],
    getClass: () => target,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const allows = (target: any, method: string, user: unknown) =>
    guard.canActivate(context(target, method, user));
  const managers = [UserRole.OWNER, UserRole.ADMIN, UserRole.DOCTOR];
  const others = Object.values(UserRole).filter(
    (role) => !managers.includes(role as any),
  );

  it.each(managers)(
    'lets %s through role lists that do not name it',
    (role) => {
      expect(allows(Routes, 'receptionOnly', { role })).toBe(true);
      expect(allows(Routes, 'clinicalStaff', { role })).toBe(true);
      expect(allows(AccountantRoutes, 'inherited', { role })).toBe(true);
      expect(allows(AccountantRoutes, 'overridden', { role })).toBe(true);
    },
  );

  it.each(others)('admits %s only where it is listed', (role) => {
    expect(allows(Routes, 'receptionOnly', { role })).toBe(
      role === UserRole.RECEPTION,
    );
    expect(allows(Routes, 'clinicalStaff', { role })).toBe(
      role === UserRole.PHARMACIST || role === UserRole.NURSE,
    );
  });

  it('uses the handler list in place of the controller list', () => {
    expect(
      allows(AccountantRoutes, 'inherited', { role: UserRole.ACCOUNTANT }),
    ).toBe(true);
    expect(
      allows(AccountantRoutes, 'overridden', { role: UserRole.ACCOUNTANT }),
    ).toBe(false);
    expect(
      allows(AccountantRoutes, 'overridden', { role: UserRole.LAB_TECH }),
    ).toBe(true);
  });

  it.each([undefined, null, {}, { role: '' }])(
    'denies a restricted route to user %p',
    (user) => {
      expect(allows(Routes, 'receptionOnly', user)).toBe(false);
    },
  );
});

describe('RolesGuard route declarations', () => {
  class DeclaredRoutes {
    unclassified() {}
    @SetMetadata('isPublic', true) publicRoute() {}
    @Authenticated() selfRoute() {}
    @Roles(UserRole.RECEPTION) receptionRoute() {}
    @Permissions('inventory:item:read') inventoryRoute() {}
  }
  const declaredGuard = new RolesGuard(new Reflector());
  const declaredContext = (method: keyof DeclaredRoutes, role?: UserRole) => ({
    getHandler: () => DeclaredRoutes.prototype[method], getClass: () => DeclaredRoutes,
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
  } as any);

  it('denies undeclared routes even to privileged accounts', () => {
    for (const role of Object.values(UserRole)) expect(declaredGuard.canActivate(declaredContext('unclassified', role))).toBe(false);
  });
  it('keeps public and explicitly authenticated routes distinct', () => {
    expect(declaredGuard.canActivate(declaredContext('publicRoute'))).toBe(true);
    expect(declaredGuard.canActivate(declaredContext('selfRoute'))).toBe(false);
    expect(declaredGuard.canActivate(declaredContext('selfRoute', UserRole.PATIENT))).toBe(true);
  });
  it('passes permission declarations to the permission guard only for authenticated users', () => {
    expect(declaredGuard.canActivate(declaredContext('inventoryRoute'))).toBe(false);
    expect(declaredGuard.canActivate(declaredContext('inventoryRoute', UserRole.PHARMACIST))).toBe(true);
  });
  it('enforces declared role rules', () => {
    expect(declaredGuard.canActivate(declaredContext('receptionRoute', UserRole.RECEPTION))).toBe(true);
    expect(declaredGuard.canActivate(declaredContext('receptionRoute', UserRole.LAB_TECH))).toBe(false);
  });

  @Authenticated()
  class SharedRoutes {
    @Roles(UserRole.RECEPTION) restricted() {}
  }
  it('does not let a class-wide authenticated policy override a narrower method role', () => {
    const ctx = { getHandler: () => SharedRoutes.prototype.restricted, getClass: () => SharedRoutes,
      switchToHttp: () => ({ getRequest: () => ({ user: { role: UserRole.LAB_TECH } }) }) } as any;
    expect(declaredGuard.canActivate(ctx)).toBe(false);
  });
});
