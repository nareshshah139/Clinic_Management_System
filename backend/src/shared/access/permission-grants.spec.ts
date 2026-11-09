import { grantsForRole, parsePermissionList, permissionGranted } from './permission-grants';

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

describe('grantsForRole', () => {
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
    expect(grantsForRole(role, stored)).toEqual(expected);
  });
});

describe('parsePermissionList', () => {
  it.each([
    ['["pharmacy:invoice:read",1,"inventory:*"]', ['pharmacy:invoice:read', 'inventory:*']],
    [['pharmacy:drug:read', null], ['pharmacy:drug:read']],
    ['not json', []],
    ['{"pharmacy":true}', []],
    [null, []],
  ])('reads %j as %j', (raw, expected) => {
    expect(parsePermissionList(raw)).toEqual(expected);
  });
});
