import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { localDatabase } from '../../../shared/testing/local-database';
import { InventoryWorkflowService } from '../inventory-workflow.service';
import { InventoryReplenishmentService } from '../inventory-replenishment.service';

const databaseTests = process.env.FORMAL_REPLAY_TEST_DATABASE_URL ? describe : describe.skip;

databaseTests('Inventory documents formal replay', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let prisma: PrismaClient;
  let workflow: InventoryWorkflowService;
  let replenishment: InventoryReplenishmentService;
  let clerk: { id: string; branchId: string; role: string };

  beforeAll(async () => {
    fixture = await localDatabase(process.env.FORMAL_REPLAY_TEST_DATABASE_URL!);
    prisma = fixture.prisma;
    const branch = await prisma.branch.create({ data: { name: 'Synthetic shortbook replay', address: 'Synthetic' } });
    const user = await prisma.user.create({ data: {
      email: `shortbook-${randomUUID()}@example.invalid`, password: 'no-login', firstName: 'Synthetic', lastName: 'Clerk', role: 'OWNER', branchId: branch.id,
    } });
    clerk = { id: user.id, branchId: branch.id, role: 'OWNER' };
    workflow = new InventoryWorkflowService(prisma as any);
    replenishment = new InventoryReplenishmentService(prisma as any, workflow);
  }, 120000);

  afterAll(async () => { await fixture?.cleanup(); });

  async function orderThenClose(action: 'CANCEL' | 'REJECT') {
    const item = await prisma.inventoryItem.create({ data: {
      branchId: clerk.branchId, name: 'Shortbook item', type: 'SUPPLY', costPrice: 1, sellingPrice: 1, unit: 'PIECES', currentStock: 1, heldStock: 0,
    } });
    const shortbook = await prisma.inventoryWorkflowDocument.create({ data: {
      branchId: clerk.branchId, kind: 'SHORTBOOK', reference: `SB-${randomUUID()}`, requestKey: randomUUID(), createdBy: clerk.id,
      payload: { date: new Date().toISOString().slice(0, 10), lines: [{ id: 'need-line', inventoryId: item.id, name: 'Shortbook item', unit: 'PIECES', quantity: 2 }] },
    } });
    const order = await workflow.transition(clerk, shortbook.id, { version: 1, action: 'CREATE_PO' } as any);
    await workflow.transition(clerk, order.id, { version: order.version, action } as any);
    const after = await prisma.inventoryWorkflowDocument.findUniqueOrThrow({ where: { id: shortbook.id } });
    const closedOrder = await prisma.inventoryWorkflowDocument.findUniqueOrThrow({ where: { id: order.id } });
    return { shortbook: after, order: closedOrder };
  }

  it('ShortbookFollowsOrder: cancelling the order made from a shortbook closes the shortbook', async () => {
    const { shortbook, order } = await orderThenClose('CANCEL');
    expect(order.status).toBe('CANCELLED');
    expect(shortbook.status).toBe('CANCELLED');
  });

  it('ShortbookFollowsOrder: rejecting the order made from a shortbook closes the shortbook', async () => {
    const { shortbook, order } = await orderThenClose('REJECT');
    expect(order.status).toBe('REJECTED');
    expect(shortbook.status).toBe('CANCELLED');
  });
});
