import { InventoryWorkflowService } from './inventory-workflow.service';
import { InventoryWorkspaceService } from './inventory-workspace.service';

it('honors scoped pharmacist grants in workflow and workspace checks', async () => {
  const prisma = {
    user: { findFirst: jest.fn().mockResolvedValue({ role: 'PHARMACIST', permissions: null }) },
    role: { findFirst: jest.fn().mockResolvedValue({ permissions: JSON.stringify(['inventory:item:*', 'inventory:po:*']) }) },
  };
  const workflow = new InventoryWorkflowService(prisma as any);
  const workspace = new InventoryWorkspaceService(prisma as any, workflow);
  const actor = { id: 'pharmacist', branchId: 'branch', role: 'PHARMACIST' } as any;

  await expect(workflow.authorize(actor, 'PURCHASE_ORDER', true)).resolves.toBeUndefined();
  await expect(workspace.require(actor, 'inventory:item:read')).resolves.toBeUndefined();
  expect((await workflow.capabilities(actor)).itemWrite).toBe(true);
  await expect(workspace.require(actor, 'inventory:item:prices:approve')).rejects.toThrow();
});

it('does not treat a stored bare wildcard as the privileged-role bypass', async () => {
  const prisma = {
    user: { findFirst: jest.fn().mockResolvedValue({ role: 'LAB_TECH', permissions: '["*"]' }) },
    role: { findFirst: jest.fn().mockResolvedValue({ permissions: '["*"]' }) },
  };
  const workflow = new InventoryWorkflowService(prisma as any);
  const actor = { id: 'lab', branchId: 'branch', role: 'LAB_TECH' } as any;

  await expect(workflow.authorize(actor, 'PURCHASE_ORDER', true)).rejects.toThrow();
});
