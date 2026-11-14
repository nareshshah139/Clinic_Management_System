import { fixedGrants, heldPermissions, permissionDeltas, permissionGranted, userGrants } from './permission-grants';

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
    ['PHARMACIST', [], ['pharmacy:*', 'inventory:*']],
    ['PHARMACIST', ['billing:invoice:read'], ['billing:invoice:read', 'pharmacy:*', 'inventory:*']],
    ['DOCTOR', ['visits:*'], ['*']],
    ['ADMIN', [], ['*']],
    ['OWNER', [], ['*']],
    ['RECEPTION', ['*', 'inventory:item:read'], ['inventory:item:read']],
    ['MANAGER', ['pharmacy:*'], ['pharmacy:*']],
    [undefined, ['inventory:item:read'], ['inventory:item:read']],
  ])('gives %s with %j the grants %j', (role, stored, expected) => {
    expect(userGrants({ role, permissions: stored, revokedPermissions: null }, null)).toEqual(expected);
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

describe('userGrants', () => {
  it.each(['OWNER', 'ADMIN', 'DOCTOR'])('gives %s every permission whatever is revoked', (role) => {
    expect(userGrants({ role, permissions: null, revokedPermissions: '["a","*"]' }, '["a"]')).toEqual(['*']);
  });

  it('keeps the pharmacist implied grants when they are revoked', () => {
    expect(userGrants(
      { role: 'PHARMACIST', permissions: null, revokedPermissions: '["pharmacy:*","inventory:*","billing:invoice:read"]' },
      '["billing:invoice:read","pharmacy:*"]',
    )).toEqual(['pharmacy:*', 'inventory:*']);
  });

  it('removes a revoked role grant from a receptionist', () => {
    expect(userGrants(
      { role: 'RECEPTION', permissions: null, revokedPermissions: '["inventory:storage:read"]' },
      '["inventory:storage:read","appointments:read"]',
    )).toEqual(['appointments:read']);
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
    expect(permissionDeltas('["a","b","c"]', ['b', 'x'])).toEqual({ permissions: ['x'], revokedPermissions: ['a', 'c'] });
  });

  it.each([
    [[], []],
    [[], ['a', 'b']],
    [['a', 'b'], []],
    [['a', 'b'], ['a', 'b']],
    [['a', 'b'], ['a', 'b', 'c']],
    [['a', 'b', 'c'], ['a']],
    [['a', 'b'], ['b', 'd']],
    [['inventory:*', 'appointments:read'], ['inventory:item:read']],
  ])('round-trips role %j to exactly the held set %j', (role, target) => {
    const deltas = permissionDeltas(JSON.stringify(role), target);
    const held = heldPermissions(JSON.stringify(role), {
      permissions: JSON.stringify(deltas.permissions),
      revokedPermissions: JSON.stringify(deltas.revokedPermissions),
    });
    expect([...held].sort()).toEqual([...target].sort());
  });
});
