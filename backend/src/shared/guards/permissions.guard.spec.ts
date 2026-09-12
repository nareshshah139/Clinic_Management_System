import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permissions } from '../decorators/permissions.decorator';
import { PermissionsGuard } from './permissions.guard';

class PermissionRoutes {
  @Permissions('first', 'second') all() {}
  @Permissions(['first', 'alternative'], 'second') alternatives() {}
  @Permissions([]) emptyAlternatives() {}
}

describe('PermissionsGuard requirement groups', () => {
  const routes = new PermissionRoutes();
  const check = (method: keyof PermissionRoutes, userPermissions: string[], rolePermissions: string[] = []) => {
    const guard = new PermissionsGuard(new Reflector(), {
      user: { findUnique: async () => ({ role: 'RECEPTION', permissions: JSON.stringify(userPermissions) }) },
      role: { findFirst: async () => ({ permissions: JSON.stringify(rolePermissions) }) },
    } as any);
    return guard.canActivate({
      getHandler: () => routes[method], getClass: () => PermissionRoutes,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'test-user', role: 'RECEPTION' } }) }),
    } as ExecutionContext);
  };

  it('keeps every existing string permission required', async () => {
    expect(await check('all', ['first'])).toBe(false);
    expect(await check('all', ['second'])).toBe(false);
    expect(await check('all', ['first', 'second'])).toBe(true);
  });
  it('accepts an explicit alternative without relaxing other requirements', async () => {
    expect(await check('alternatives', ['alternative'])).toBe(false);
    expect(await check('alternatives', ['second'])).toBe(false);
    expect(await check('alternatives', ['alternative', 'second'])).toBe(true);
    expect(await check('alternatives', ['first', 'second'])).toBe(true);
  });
  it('combines role and user grants while requiring every group', async () => {
    expect(await check('alternatives', ['alternative'], ['second'])).toBe(true);
  });
  it('fails closed on an empty alternative group or ungranted wildcard', async () => {
    expect(await check('emptyAlternatives', ['*'])).toBe(false);
    expect(await check('all', ['*'])).toBe(false);
  });
});
