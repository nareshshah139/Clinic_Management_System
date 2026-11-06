import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

class Routes {
  @Roles(UserRole.RECEPTION) receptionOnly() {}
  @Roles(UserRole.PHARMACIST, UserRole.NURSE) clinicalStaff() {}
  @Roles() emptyList() {}
  open() {}
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

  it('admits any authenticated user when no role list applies', () => {
    expect(allows(Routes, 'open', { role: UserRole.PATIENT })).toBe(true);
    expect(allows(Routes, 'emptyList', { role: UserRole.PATIENT })).toBe(true);
  });

  it.each([undefined, null, {}, { role: '' }])(
    'denies a restricted route to user %p',
    (user) => {
      expect(allows(Routes, 'receptionOnly', user)).toBe(false);
    },
  );
});
