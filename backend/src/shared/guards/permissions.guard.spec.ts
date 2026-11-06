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
    } as unknown as ExecutionContext);
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

describe('PermissionsGuard manager bypass and failure modes', () => {
  const routes = new PermissionRoutes();
  const run = (tokenUser: unknown, stored: unknown, role: unknown = { permissions: '[]' }) => {
    const lookups: string[] = [];
    const guard = new PermissionsGuard(new Reflector(), {
      user: { findUnique: async () => { lookups.push('user'); return stored; } },
      role: { findFirst: async () => { lookups.push('role'); if (role instanceof Error) throw role; return role; } },
    } as any);
    const result = guard.canActivate({
      getHandler: () => routes.all, getClass: () => PermissionRoutes,
      switchToHttp: () => ({ getRequest: () => ({ user: tokenUser }) }),
    } as unknown as ExecutionContext);
    return result.then((allowed) => ({ allowed, lookups }));
  };

  it('lets an OWNER token through without reading grants', async () => {
    expect(await run({ id: 'o', role: 'OWNER' }, null)).toEqual({ allowed: true, lookups: [] });
  });

  it.each(['ADMIN', 'DOCTOR'])('lets a stored %s through without any grants', async (role) => {
    expect((await run({ id: 'u', role: 'RECEPTION' }, { role, permissions: null })).allowed).toBe(true);
  });

  it('trusts the stored role over a manager role claimed in the token', async () => {
    expect((await run({ id: 'u', role: 'ADMIN' }, { role: 'RECEPTION', permissions: '[]' })).allowed).toBe(false);
  });

  it('accepts the legacy userId claim', async () => {
    expect((await run({ userId: 'u', role: 'RECEPTION' }, { role: 'RECEPTION', permissions: '["first","second"]' })).allowed).toBe(true);
  });

  it.each([
    ['no user', undefined, { role: 'ADMIN' }],
    ['no user id', { role: 'RECEPTION' }, { role: 'ADMIN' }],
    ['no stored user', { id: 'gone', role: 'DOCTOR' }, null],
  ])('denies a request with %s', async (_label, tokenUser, stored) => {
    expect((await run(tokenUser, stored)).allowed).toBe(false);
  });

  it.each([
    ['malformed user grants', '{not json', { permissions: '[]' }, false],
    ['non-array user grants', '{"first":true}', { permissions: '[]' }, false],
    ['non-string entries', '[1, null, "first"]', { permissions: '[]' }, false],
    ['malformed role grants', '["first","second"]', { permissions: 'oops' }, true],
    ['a failing role lookup', '["first","second"]', new Error('db down'), true],
  ])('treats %s as no grant from that source', async (_label, permissions, role, expected) => {
    expect((await run({ id: 'u', role: 'RECEPTION' }, { role: 'RECEPTION', permissions }, role)).allowed).toBe(expected);
  });

  it('still grants from the role when user grants are malformed', async () => {
    expect((await run({ id: 'u', role: 'RECEPTION' }, { role: 'RECEPTION', permissions: '{bad' }, { permissions: '["first","second"]' })).allowed).toBe(true);
  });
});
