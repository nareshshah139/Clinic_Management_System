import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { Permissions } from '../decorators/permissions.decorator';
import { Roles } from '../decorators/roles.decorator';
import { ROLE_PERMISSIONS } from '../access/role-permissions';
import { PermissionsGuard } from './permissions.guard';
import { RolesGuard } from './roles.guard';

class PermissionRoutes {
  @Permissions('first', 'second') all() {}
  @Permissions(['first', 'alternative'], 'second') alternatives() {}
  @Permissions([]) emptyAlternatives() {}
  @Permissions('pharmacy:invoice:read') invoiceRead() {}
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.ACCOUNTANT) @Permissions('pharmacy:purchase-ledger:write') ledgerWrite() {}
  @Permissions('inventory:item:read') inventoryRead() {}
  @Permissions('pharmacy:drug:inventory-change:approve') nestedApproval() {}
}

describe('PermissionsGuard requirement groups', () => {
  const routes = new PermissionRoutes();
  const context = (method: keyof PermissionRoutes, role: string) => ({
    getHandler: () => routes[method], getClass: () => PermissionRoutes,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 'test-user', role } }) }),
  }) as ExecutionContext;
  const checkAs = (role: string, method: keyof PermissionRoutes, userPermissions: readonly string[], rolePermissions: readonly string[] = [], revoked: readonly string[] = []) =>
    new PermissionsGuard(new Reflector(), {
      user: { findUnique: async () => ({ role, permissions: JSON.stringify(userPermissions), revokedPermissions: JSON.stringify(revoked) }) },
      role: { findFirst: async () => ({ permissions: JSON.stringify(rolePermissions) }) },
    } as any).canActivate(context(method, role));
  const check = (method: keyof PermissionRoutes, userPermissions: string[], rolePermissions: string[] = [], revoked: string[] = []) =>
    checkAs('RECEPTION', method, userPermissions, rolePermissions, revoked);

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
  it('refuses a role grant the user has had revoked and keeps the unrevoked ones', async () => {
    expect(await check('inventoryRead', [], ['inventory:item:read', 'first'], ['inventory:item:read'])).toBe(false);
    expect(await check('inventoryRead', [], ['inventory:item:read', 'first'], ['first'])).toBe(true);
    expect(await check('inventoryRead', ['inventory:item:read'], [], ['inventory:item:read'])).toBe(false);
  });
  it('refuses a revoked permission that a broader held grant still covers', async () => {
    expect(await checkAs('MANAGER', 'inventoryRead', [], ['inventory:*'], ['inventory:item:read'])).toBe(false);
    expect(await checkAs('MANAGER', 'inventoryRead', [], ['inventory:*'], ['inventory:item:delete'])).toBe(true);
    expect(await checkAs('MANAGER', 'inventoryRead', ['inventory:item:read'], [], ['inventory:*'])).toBe(true);
  });
  it('keeps the pharmacist role-fixed grants when they are revoked', async () => {
    expect(await checkAs('PHARMACIST', 'invoiceRead', [], ['pharmacy:*'], ['pharmacy:*'])).toBe(true);
  });
  it('fails closed on an empty alternative group or ungranted wildcard', async () => {
    expect(await check('emptyAlternatives', ['*'])).toBe(false);
    expect(await check('all', ['*'])).toBe(false);
  });

  it('lets a pharmacist reach pharmacy routes with no stored permissions, and nobody else', async () => {
    expect(await checkAs('PHARMACIST', 'invoiceRead', [])).toBe(true);
    expect(await checkAs('PHARMACIST', 'ledgerWrite', [])).toBe(true);
    expect(await checkAs('RECEPTION', 'invoiceRead', [])).toBe(false);
    expect(await checkAs('MANAGER', 'invoiceRead', [])).toBe(false);
    expect(await checkAs('PHARMACIST', 'all', [])).toBe(false);
  });
  it('expands a stored wildcard only at a segment boundary', async () => {
    expect(await checkAs('RECEPTION', 'invoiceRead', ['pharmacy:invoice:*'])).toBe(true);
    expect(await checkAs('RECEPTION', 'invoiceRead', ['pharmacy:inv*'])).toBe(false);
    expect(await checkAs('RECEPTION', 'invoiceRead', [], ['pharmacy:*'])).toBe(true);
    expect(await checkAs('RECEPTION', 'ledgerWrite', ['pharmacy:invoice:*'])).toBe(false);
  });
  it('keeps the real reception seed out of pharmacy invoices and supplier payments', async () => {
    expect(await checkAs('RECEPTION', 'invoiceRead', ROLE_PERMISSIONS.RECEPTION)).toBe(false);
    expect(await checkAs('RECEPTION', 'ledgerWrite', ROLE_PERMISSIONS.RECEPTION)).toBe(false);
  });
  it.each(['DOCTOR', 'ADMIN', 'PHARMACIST'])('lets %s record a supplier payment through both guards', async (role) => {
    expect(new RolesGuard(new Reflector()).canActivate(context('ledgerWrite', role))).toBe(true);
    expect(await checkAs(role, 'ledgerWrite', ROLE_PERMISSIONS[role as UserRole])).toBe(true);
  });
  it('keeps supplier payments closed to reception at the role guard', () => {
    expect(new RolesGuard(new Reflector()).canActivate(context('ledgerWrite', 'RECEPTION'))).toBe(false);
  });
  it('matches a seeded scoped wildcard by scope, not by a look-alike scope name', async () => {
    expect(await check('inventoryRead', [], ['inventory:item:*'])).toBe(true);
    expect(await check('inventoryRead', ['inventory:items:*'])).toBe(false);
    expect(await check('inventoryRead', ['inventory:*'])).toBe(true);
    expect(await check('nestedApproval', ['pharmacy:drug:*'])).toBe(true);
    expect(await check('nestedApproval', ['pharmacy:drug:inventory-change:read'])).toBe(false);
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
