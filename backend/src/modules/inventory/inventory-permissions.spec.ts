import { InventoryWorkflowService } from './inventory-workflow.service';
import { InventoryWorkspaceService } from './inventory-workspace.service';

const database = (role: string, stored: string | null, roleGrants: string[]) => ({
  user: { findFirst: jest.fn().mockResolvedValue({ role, permissions: stored }) },
  role: { findFirst: jest.fn().mockResolvedValue({ permissions: JSON.stringify(roleGrants) }) },
});

it('honors scoped wildcard grants in workflow and workspace checks', async () => {
  const prisma = database('RECEPTION', null, ['inventory:item:*', 'inventory:po:*']);
  const workflow = new InventoryWorkflowService(prisma as any);
  const workspace = new InventoryWorkspaceService(prisma as any, workflow, {} as any);
  const actor = { id: 'reception', branchId: 'branch', role: 'RECEPTION' } as any;

  await expect(workflow.authorize(actor, 'PURCHASE_ORDER', true)).resolves.toBeUndefined();
  await expect(workspace.require(actor, 'inventory:item:read')).resolves.toBeUndefined();
  expect((await workflow.capabilities(actor)).itemWrite).toBe(true);
  await expect(workspace.require(actor, 'inventory:transaction:create')).rejects.toThrow('This action requires inventory:transaction:create');
});

it('gives a pharmacist with no stored grants the inventory scope', async () => {
  const workflow = new InventoryWorkflowService(database('PHARMACIST', null, []) as any);
  const actor = { id: 'pharmacist', branchId: 'branch', role: 'PHARMACIST' } as any;

  await expect(workflow.authorize(actor, 'PURCHASE_ORDER', true)).resolves.toBeUndefined();
  expect((await workflow.capabilities(actor)).itemWrite).toBe(true);
});

it('does not treat a stored bare wildcard as the privileged-role bypass', async () => {
  const workflow = new InventoryWorkflowService(database('LAB_TECH', '["*"]', ['*']) as any);
  const actor = { id: 'lab', branchId: 'branch', role: 'LAB_TECH' } as any;

  await expect(workflow.authorize(actor, 'PURCHASE_ORDER', true)).rejects.toThrow();
});

it('offers batch delete only to roles the delete route admits', async () => {
  const canDelete = async (role: string) =>
    (await new InventoryWorkflowService(database(role, '["inventory:*"]', ['inventory:*']) as any)
      .capabilities({ id: role, branchId: 'branch', role } as any)).itemDelete;
  expect(await canDelete('PHARMACIST')).toBe(true);
  expect(await canDelete('OWNER')).toBe(true);
  expect(await canDelete('MANAGER')).toBe(false);
});

it('refuses a role grant the user has had revoked, in checks and in the count staff list', async () => {
  const user = { id: 'reception', firstName: 'Riya', lastName: 'Rao', role: 'RECEPTION', permissions: null, revokedPermissions: '["inventory:*","pharmacy:compliance:audit"]' };
  const prisma = {
    user: { findFirst: jest.fn().mockResolvedValue(user), findMany: jest.fn().mockResolvedValue([user]) },
    role: {
      findFirst: jest.fn().mockResolvedValue({ permissions: '["inventory:*","inventory:po:read","pharmacy:compliance:audit"]' }),
      findMany: jest.fn().mockResolvedValue([{ name: 'RECEPTION', permissions: '["inventory:*","inventory:po:read","pharmacy:compliance:audit"]' }]),
    },
  };
  const workflow = new InventoryWorkflowService(prisma as any);
  const actor = { id: 'reception', branchId: 'branch', role: 'RECEPTION' } as any;

  await expect(workflow.authorize(actor, 'PURCHASE_ORDER', true)).rejects.toThrow();
  await expect(workflow.authorize(actor, 'PURCHASE_ORDER', false)).resolves.toBeUndefined();
  expect(await workflow.countStaff('branch')).toEqual([]);
  user.revokedPermissions = null;
  expect(await workflow.countStaff('branch')).toEqual([{ id: 'reception', name: 'Riya Rao', role: 'RECEPTION' }]);
});
