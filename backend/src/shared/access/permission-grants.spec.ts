import { fixedGrants, heldPermissions, permissionDeltas, permissionGranted, tickedPermissions, userGrants } from './permission-grants';

describe('permissionGranted', () => {
  it.each([
    [['pharmacy:invoice:read'], 'pharmacy:invoice:read', true],
    [['pharmacy:invoice:read'], 'pharmacy:invoice:readx', false],
    [['pharmacy:invoice:read'], 'pharmacy:invoice:read:all', false],
    [['pharmacy:invoice:read'], 'pharmacy:invoice', false],
    [['pharmacy:invoice'], 'pharmacy:invoice:read', false],
    [['pharmacy:invoice:*'], 'pharmacy:invoice:payment:add', true],
    [['pharmacy:invoice:*'], 'pharmacy:invoice:read', true],
    [['pharmacy:invoice:*'], 'pharmacy:invoice', true],
    [['pharmacy:invoice:*'], 'pharmacy:invoices:read', false],
    [['pharmacy:invoice:*'], 'pharmacy:drug:read', false],
    [['pharmacy:inv*'], 'pharmacy:invoice:read', false],
    [['pharmacy:inv*'], 'pharmacy:inv*', true],
    [['pharmacy:*'], 'pharmacy', true],
    [['pharmacy:*'], 'pharmacy:purchase-ledger:write', true],
    [['pharmacy:*'], 'pharmacyx:read', false],
    [['pharmacy:*'], 'inventory:item:read', false],
    [['pharmacy:*'], '*', false],
    [['*'], 'billing:invoice:read', true],
    [['*:read'], 'pharmacy:read', false],
    [['pharmacy:*:read'], 'pharmacy:invoice:read', false],
    [['pharmacy:*:*'], 'pharmacy:invoice:read', false],
    [['pharmacy:**'], 'pharmacy:invoice', false],
    [[':*'], ':invoice', false],
    [[':*'], 'pharmacy', false],
    [['PHARMACY:*'], 'pharmacy:invoice:read', false],
    [[], 'pharmacy:invoice:read', false],
    [['billing:invoice:read', 'inventory:item:*'], 'inventory:item:update', true],
  ])('grants %j for %s: %s', (grants, required, expected) => {
    expect(permissionGranted(grants, required)).toBe(expected);
  });
});

describe('userGrants for the role-fixed rules', () => {
  it.each([
    ['PHARMACIST', [], 'pharmacy:invoice:read', true],
    ['PHARMACIST', [], 'inventory:item:delete', true],
    ['PHARMACIST', [], 'billing:invoice:read', false],
    ['PHARMACIST', ['billing:invoice:read'], 'billing:invoice:read', true],
    ['DOCTOR', ['visits:*'], 'billing:invoice:read', true],
    ['ADMIN', [], 'users:delete', true],
    ['OWNER', [], 'users:delete', true],
    ['RECEPTION', ['*', 'inventory:item:read'], 'inventory:item:read', true],
    ['RECEPTION', ['*', 'inventory:item:read'], 'billing:invoice:read', false],
    ['MANAGER', ['pharmacy:*'], 'pharmacy:drug:read', true],
    ['MANAGER', ['pharmacy:*'], 'inventory:item:read', false],
    [undefined, ['inventory:item:read'], 'inventory:item:read', true],
    [undefined, ['inventory:item:read'], 'inventory:item:update', false],
  ])('%s with %j may use %s: %s', (role, stored, required, expected) => {
    expect(userGrants({ role, permissions: stored, revokedPermissions: null }, null).has(required)).toBe(expected);
  });
});

describe('stored permission lists', () => {
  it.each([
    ['["pharmacy:invoice:read",1,"inventory:*"]', ['pharmacy:invoice:read', 'inventory:*']],
    [['pharmacy:drug:read', null], ['pharmacy:drug:read']],
    ['not json', []],
    ['{"pharmacy":true}', []],
    [null, []],
  ])('reads %j as %j', (raw, expected) => {
    expect(heldPermissions(raw, { permissions: null, revokedPermissions: null })).toEqual(expected);
  });
});

const json = (list: string[] | null) => (list === null ? null : JSON.stringify(list));

describe('heldPermissions', () => {
  it.each([
    [['a', 'b'], null, null, ['a', 'b']],
    [['a', 'b'], ['c'], null, ['a', 'b', 'c']],
    [['a', 'b'], null, ['a'], ['b']],
    [['a', 'b'], ['b', 'c'], ['b'], ['a', 'c']],
    [['a', 'b'], [], ['a', 'b'], []],
    [null, ['c'], ['x'], ['c']],
    [['inventory:*'], null, ['inventory:item:read'], ['inventory:*']],
    [['inventory:item:read'], null, ['inventory:*'], ['inventory:item:read']],
  ])('role %j, saved %j, revoked %j holds %j', (role, saved, revoked, expected) => {
    expect(heldPermissions(json(role), { permissions: json(saved), revokedPermissions: json(revoked) })).toEqual(expected);
  });

  it('lets a revocation win over the same grant in the saved list', () => {
    expect(heldPermissions('["a"]', { permissions: '["a","b"]', revokedPermissions: '["a"]' })).toEqual(['b']);
  });

  it('reads malformed JSON in any column as empty', () => {
    expect(heldPermissions('not json', { permissions: '["b"]', revokedPermissions: '{"a":1}' })).toEqual(['b']);
    expect(heldPermissions('["a","b"]', { permissions: '[', revokedPermissions: 'nope' })).toEqual(['a', 'b']);
  });
});

describe('userGrants with revocations', () => {
  const may = (role: string, rolePermissions: string[], saved: string[] | null, revoked: string[], required: string) =>
    userGrants({ role, permissions: json(saved), revokedPermissions: json(revoked) }, json(rolePermissions)).has(required);

  it.each(['OWNER', 'ADMIN', 'DOCTOR'])('gives %s every permission whatever is revoked', (role) => {
    expect(may(role, ['a'], null, ['a', '*', 'users:delete'], 'users:delete')).toBe(true);
  });

  it('keeps the pharmacist implied grants when they are revoked', () => {
    const revoked = ['pharmacy:*', 'inventory:*', 'pharmacy:invoice:read', 'billing:invoice:read'];
    expect(may('PHARMACIST', ['billing:invoice:read', 'pharmacy:*'], null, revoked, 'pharmacy:invoice:read')).toBe(true);
    expect(may('PHARMACIST', ['billing:invoice:read', 'pharmacy:*'], null, revoked, 'inventory:item:read')).toBe(true);
    expect(may('PHARMACIST', ['billing:invoice:read', 'pharmacy:*'], null, revoked, 'billing:invoice:read')).toBe(false);
  });

  it('removes a revoked role grant from a receptionist and keeps the rest', () => {
    const role = ['inventory:storage:read', 'appointments:read'];
    expect(may('RECEPTION', role, null, ['inventory:storage:read'], 'inventory:storage:read')).toBe(false);
    expect(may('RECEPTION', role, null, ['inventory:storage:read'], 'appointments:read')).toBe(true);
  });

  it('refuses a revoked permission that a held wildcard still covers, and nothing else under it', () => {
    expect(may('MANAGER', ['inventory:*'], null, ['inventory:item:delete'], 'inventory:item:delete')).toBe(false);
    expect(may('MANAGER', ['inventory:*'], null, ['inventory:item:delete'], 'inventory:item:read')).toBe(true);
    expect(may('MANAGER', ['inventory:*'], ['inventory:item:delete'], ['inventory:item:delete'], 'inventory:item:delete')).toBe(false);
  });

  it('treats a revoked wildcard as removing that grant only, not the specific grants beside it', () => {
    expect(may('MANAGER', ['inventory:*'], ['inventory:item:read'], ['inventory:*'], 'inventory:item:read')).toBe(true);
    expect(may('MANAGER', ['inventory:*'], ['inventory:item:read'], ['inventory:*'], 'inventory:item:update')).toBe(false);
  });
});

describe('tickedPermissions', () => {
  const listed = ['inventory:*', 'inventory:item:read', 'inventory:item:delete', 'appointments:read', 'billing:invoice:read'];
  const ticked = (role: string, rolePermissions: string[], saved: string[] | null, revoked: string[] | null) =>
    tickedPermissions({ role, permissions: json(saved), revokedPermissions: json(revoked) }, json(rolePermissions), listed);

  it('ticks what a wildcard covers and leaves a revoked permission unticked', () => {
    expect(ticked('MANAGER', ['inventory:*', 'appointments:read'], null, ['inventory:item:delete']))
      .toEqual(['inventory:*', 'appointments:read', 'inventory:item:read']);
  });

  it('keeps a held grant that is not listed, so saving does not drop it', () => {
    expect(ticked('RECEPTION', ['appointments:read'], ['reports:custom'], null)).toEqual(['appointments:read', 'reports:custom']);
  });

  it('ticks every listed permission for a role that always has them', () => {
    expect(ticked('ADMIN', [], null, ['appointments:read'])).toEqual(listed);
    expect(ticked('PHARMACIST', [], null, ['inventory:item:read'])).toEqual(['inventory:*', 'inventory:item:read', 'inventory:item:delete']);
  });
});

describe('fixedGrants', () => {
  it.each([
    ['OWNER', ['*']],
    ['DOCTOR', ['*']],
    ['PHARMACIST', ['pharmacy:*', 'inventory:*']],
    ['RECEPTION', []],
    [null, []],
  ])('%s always has %j', (role, expected) => {
    expect(fixedGrants(role)).toEqual(expected);
  });
});

describe('permissionDeltas', () => {
  it('stores extras as saved and missing role grants as revoked', () => {
    expect(permissionDeltas('RECEPTION', '["a","b","c"]', ['b', 'x'], [])).toEqual({ permissions: ['x'], revokedPermissions: ['a', 'c'] });
  });

  it('revokes an unticked listed permission that a ticked wildcard would still cover', () => {
    const listed = ['inventory:*', 'inventory:item:read', 'inventory:item:delete', 'billing:invoice:read'];
    expect(permissionDeltas('MANAGER', '["inventory:*"]', ['inventory:*', 'inventory:item:read'], listed))
      .toEqual({ permissions: [], revokedPermissions: ['inventory:item:delete'] });
  });

  it('stores nothing the role already gives, so an unchanged save keeps the user following the role', () => {
    const listed = ['inventory:*', 'inventory:item:read', 'inventory:item:delete', 'appointments:read'];
    const untouched = (role: string, rolePermissions: string[]) => {
      const user = { role, permissions: null, revokedPermissions: null };
      return permissionDeltas(role, JSON.stringify(rolePermissions), tickedPermissions(user, JSON.stringify(rolePermissions), listed), listed);
    };
    expect(untouched('MANAGER', ['inventory:*', 'appointments:read'])).toEqual({ permissions: [], revokedPermissions: [] });
    expect(untouched('ADMIN', ['*'])).toEqual({ permissions: [], revokedPermissions: [] });
    expect(untouched('PHARMACIST', ['appointments:read'])).toEqual({ permissions: [], revokedPermissions: [] });
  });

  it('stores nothing for what a role always has, ticked or not', () => {
    expect(permissionDeltas('ADMIN', '["*"]', ['*', 'appointments:read'], ['appointments:read', 'billing:invoice:read']))
      .toEqual({ permissions: [], revokedPermissions: [] });
    expect(permissionDeltas('PHARMACIST', '["pharmacy:invoice:*"]', ['billing:invoice:read'], ['pharmacy:invoice:*', 'pharmacy:invoice:read', 'billing:invoice:read']))
      .toEqual({ permissions: ['billing:invoice:read'], revokedPermissions: [] });
  });

  it('stores a ticked wildcard extra without the listed permissions it covers', () => {
    expect(permissionDeltas('RECEPTION', '["appointments:read"]', ['appointments:read', 'inventory:*', 'inventory:item:read'], ['inventory:*', 'inventory:item:read', 'inventory:item:delete']))
      .toEqual({ permissions: ['inventory:*'], revokedPermissions: ['inventory:item:delete'] });
  });

  const listed = ['a', 'b', 'c', 'd', 'inventory:*', 'inventory:item:read', 'inventory:item:delete', 'appointments:read'];
  it.each([
    [[], []],
    [[], ['a', 'b']],
    [['a', 'b'], []],
    [['a', 'b'], ['a', 'b']],
    [['a', 'b'], ['a', 'b', 'c']],
    [['a', 'b', 'c'], ['a']],
    [['a', 'b'], ['b', 'd']],
    [['inventory:*', 'appointments:read'], ['inventory:item:read']],
    [['inventory:*', 'appointments:read'], ['inventory:*', 'inventory:item:read']],
    [['inventory:*'], ['inventory:item:read', 'inventory:item:delete', 'not:listed']],
    [['inventory:item:read'], ['inventory:*']],
    [['inventory:item:read'], ['inventory:*', 'inventory:item:read', 'inventory:item:delete', 'inventory:not:listed']],
  ])('round-trips role %j so that exactly %j is allowed', (role, target) => {
    const deltas = permissionDeltas('RECEPTION', JSON.stringify(role), target, listed);
    const user = { role: 'RECEPTION', permissions: JSON.stringify(deltas.permissions), revokedPermissions: JSON.stringify(deltas.revokedPermissions) };
    const grants = userGrants(user, JSON.stringify(role));
    const wanted = listed.filter((permission) => target.includes(permission));
    expect(listed.filter((permission) => grants.has(permission))).toEqual(wanted);
    expect(target.filter((permission) => !grants.has(permission))).toEqual([]);
    expect(tickedPermissions(user, JSON.stringify(role), listed).filter((permission) => listed.includes(permission)).sort()).toEqual([...wanted].sort());
  });
});
