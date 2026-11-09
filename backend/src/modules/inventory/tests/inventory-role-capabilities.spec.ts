import { readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { ROLE_PERMISSIONS } from '../../../shared/access/role-permissions';
import { InventoryWorkflowService } from '../inventory-workflow.service';

const FIXTURE = path.resolve(__dirname, '../../../../../frontend/__tests__/fixtures/workspace-capabilities.json');
const ROLES = ['PHARMACIST', 'DOCTOR', 'ADMIN', 'RECEPTION'] as const;

const seeded = (role: (typeof ROLES)[number]) => {
  const actor = { id: `${role.toLowerCase()}-1`, branchId: 'branch-1', role };
  const workflow = new InventoryWorkflowService({
    user: { findFirst: async () => ({ role, permissions: JSON.stringify(ROLE_PERMISSIONS[role]) }) },
    role: { findFirst: async () => ({ permissions: JSON.stringify(ROLE_PERMISSIONS[role]) }) },
  } as any);
  return { actor, workflow };
};

describe('Inventory workspace access for seeded roles', () => {
  it('keeps the frontend capability fixture equal to what the seeded roles really receive', async () => {
    const actual = Object.fromEntries(await Promise.all(ROLES.map(async (role) => {
      const { actor, workflow } = seeded(role);
      return [role, await workflow.capabilities(actor)] as const;
    })));
    if (process.env.UPDATE_CAPABILITY_FIXTURE) writeFileSync(FIXTURE, `${JSON.stringify(actual, null, 2)}\n`);
    expect(actual).toEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')));
  });

  it('gives the seeded pharmacist every pharmacy write but no approval', async () => {
    const { actor, workflow } = seeded('PHARMACIST');
    const caps = await workflow.capabilities(actor);
    expect({
      approve: caps.approve, settings: caps.settings, ledger: caps.ledger, creditWrite: caps.creditWrite,
      sales: caps.kinds.COUNTER_SALE, reorder: caps.kinds.PURCHASE_ORDER, count: caps.kinds.COUNT,
      supplierReturn: caps.kinds.SUPPLIER_RETURN, creditNote: caps.kinds.CREDIT_NOTE,
    }).toEqual({
      approve: false, settings: false, ledger: true, creditWrite: true,
      sales: { read: true, write: true }, reorder: { read: true, write: true }, count: { read: true, write: true },
      supplierReturn: { read: true, write: true }, creditNote: { read: true, write: true },
    });
  });

  it.each(['DOCTOR', 'ADMIN'] as const)('makes %s an approver who can change automation settings', async (role) => {
    const { actor, workflow } = seeded(role);
    const caps = await workflow.capabilities(actor);
    expect([caps.approve, caps.settings, caps.ledger, caps.creditWrite]).toEqual([true, true, true, true]);
  });

  it.each([
    ['pharmacy:purchase-ledger:read', true],
    ['pharmacy:purchase-ledger:write', true],
    ['inventory:adjustment:create', true],
    ['inventory:transaction:create', true],
    ['pharmacy:compliance:audit', true],
    ['billing:invoice:read', false],
  ])('answers the seeded pharmacist workspace check for %s with %s', async (permission, expected) => {
    const { actor, workflow } = seeded('PHARMACIST');
    expect((await workflow.permissions(actor)).has(permission)).toBe(expected);
  });

  it('lets the seeded pharmacist record a supplier credit note but not approve', async () => {
    const { actor, workflow } = seeded('PHARMACIST');
    await expect(workflow.authorize(actor, 'CREDIT_NOTE', true)).resolves.toBeUndefined();
    await expect(workflow.authorize(actor, 'SUPPLIER_RETURN', true)).resolves.toBeUndefined();
    await expect(workflow.saveSettings(actor, {})).rejects.toThrow('An inventory manager must configure');
  });
});
