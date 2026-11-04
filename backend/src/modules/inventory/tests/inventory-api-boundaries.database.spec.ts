import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { localDatabase } from '../../../shared/testing/local-database';
import { InventoryService } from '../inventory.service';
import { InventoryWorkflowService } from '../inventory-workflow.service';
import { PharmacyPurchaseInvoiceService } from '../../pharmacy/pharmacy-purchase-invoice.service';

const databaseTests = process.env.INVENTORY_API_BOUNDARIES_TEST_DATABASE_URL ? describe : describe.skip;

databaseTests('Inventory API boundaries with PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let prisma: PrismaClient;
  let actor: { id: string; branchId: string; role: string };
  let service: InventoryService;
  let item: any;

  beforeAll(async () => {
    fixture = await localDatabase(process.env.INVENTORY_API_BOUNDARIES_TEST_DATABASE_URL!);
    prisma = fixture.prisma;
    const branch = await prisma.branch.create({ data: { name: 'Synthetic API boundary test', address: 'Synthetic' } });
    const user = await prisma.user.create({ data: { email: `${randomUUID()}@example.invalid`, password: 'no-login', firstName: 'Synthetic', lastName: 'Reviewer', role: 'OWNER', branchId: branch.id } });
    actor = { id: user.id, branchId: branch.id, role: 'OWNER' };
    service = new InventoryService(prisma as any);
  }, 120000);
  beforeEach(async () => {
    item = await prisma.inventoryItem.create({ data: { branchId: actor.branchId, name: 'Synthetic cream', type: 'SUPPLY', unit: 'PIECES', costPrice: 2, sellingPrice: 3, currentStock: 10, batchNumber: 'PACK-1', expiryDate: new Date('2020-01-01') } });
  });
  afterAll(async () => { await fixture?.cleanup(); });

  it('rejects expired sale and bulk sale without quantity changes or committed movement receipts', async () => {
    const operationId = randomUUID();
    const input = { operationId, itemId: item.id, type: 'SALE', quantity: 1, unitPrice: 3 } as any;
    await expect(service.createStockTransaction(input, actor.branchId, actor.id)).rejects.toThrow('cannot be sold');
    const bulk = await service.bulkStockUpdate({ operationId: randomUUID(), transactions: [{ ...input, rowId: 'line-1' }] }, actor.branchId, actor.id);
    expect(bulk.successful).toBe(0);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).currentStock).toBe(10);
    expect(await prisma.stockTransaction.count({ where: { itemId: item.id } })).toBe(0);
    expect(await service.stockOperationOutcome(operationId, actor.branchId)).toMatchObject({ status: 'UNKNOWN', rows: [{ status: 'UNKNOWN' }] });
  });

  it('sells through the expiry UTC day and replays once without another movement', async () => {
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { expiryDate: new Date(new Date().toISOString().slice(0, 10)) } });
    const input = { operationId: randomUUID(), itemId: item.id, type: 'SALE', quantity: 1, unitPrice: 3 } as any;
    const first = await service.createStockTransaction(input, actor.branchId, actor.id);
    const replay = await service.createStockTransaction(input, actor.branchId, actor.id);
    expect(replay.id).toBe(first.id);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).currentStock).toBe(9);
    expect(await prisma.stockTransaction.count({ where: { itemId: item.id } })).toBe(1);
  });

  it('audits one guarded metadata correction and rejects a stale follow-up', async () => {
    const input = { updatedAt: item.updatedAt.toISOString(), reason: 'Verified printed pack', batchNumber: 'PACK-2', expiryDate: '2028-02-29' };
    const saved = await service.updateInventoryItem(item.id, input, actor.branchId, actor.id);
    expect(saved).toMatchObject({ batchNumber: 'PACK-2', currentStock: 10, costPrice: 2 });
    expect(new Date(saved.expiryDate).toISOString()).toBe('2028-02-29T23:59:59.999Z');
    await expect(service.updateInventoryItem(item.id, { ...input, batchNumber: 'PACK-3' }, actor.branchId, actor.id)).rejects.toThrow('changed');
    const audit = await prisma.auditLog.findMany({ where: { entityId: item.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0].userId).toBe(actor.id);
    expect(JSON.parse(audit[0].newValues!)).toMatchObject({ batchNumber: 'PACK-2', reason: 'Verified printed pack' });
  });

  it('rolls back metadata if its required audit cannot be stored', async () => {
    const failing = new InventoryService({ $transaction: (run: any, options: any) => prisma.$transaction(tx => run(new Proxy(tx, {
      get(target, key) { return key === 'auditLog' ? { create: async () => { throw new Error('Synthetic audit outage'); } } : Reflect.get(target, key); },
    })), options) } as any);
    await expect(failing.updateInventoryItem(item.id, { updatedAt: item.updatedAt.toISOString(), reason: 'Verified printed pack', batchNumber: 'PACK-2' }, actor.branchId, actor.id)).rejects.toThrow('Synthetic audit outage');
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).batchNumber).toBe('PACK-1');
    expect(await prisma.auditLog.count({ where: { entityId: item.id } })).toBe(0);
  });

  it('does not disclose a financial replay and rejects cross-kind reuse for the owner too', async () => {
    const key = randomUUID();
    const doc = await prisma.inventoryWorkflowDocument.create({ data: { branchId: actor.branchId, kind: 'CREDIT_NOTE', reference: 'Synthetic credit', requestKey: key, createdBy: actor.id, payload: { lines: [] }, totalAmount: 5000 } });
    const user = await prisma.user.create({ data: { email: `${randomUUID()}@example.invalid`, password: 'no-login', firstName: 'Synthetic', lastName: 'Movement', role: 'RECEPTION', branchId: actor.branchId, permissions: JSON.stringify(['inventory:transaction:create', 'inventory:item:read']) } });
    const workflow = new InventoryWorkflowService(prisma as any);
    const input = { kind: 'LOSS', requestKey: key, reference: 'Synthetic loss', payload: { lines: [] } } as any;
    await expect(workflow.saveDocument({ id: user.id, branchId: actor.branchId, role: 'RECEPTION' }, input)).rejects.toMatchObject({ status: 403 });
    await expect(workflow.saveDocument(actor, input)).rejects.toMatchObject({ status: 409 });
    expect((await workflow.saveDocument(actor, { ...input, kind: 'CREDIT_NOTE' })).id).toBe(doc.id);
    expect(await prisma.inventoryWorkflowDocument.count({ where: { requestKey: key, branchId: actor.branchId } })).toBe(1);
  });

  it('requires and retains the reopen reason without moving stock', async () => {
    const invoice = await prisma.pharmacyPurchaseInvoice.create({ data: { branchId: actor.branchId, createdBy: actor.id, distributorName: 'Synthetic supplier', distributorGstin: '36ABCDE1234F1Z5', distributorDlNo: 'SYNTHETIC', invoiceNumber: randomUUID(), invoiceDate: new Date('2026-11-01'), billType: 'CASH', doctorNameOrRegNo: 'Synthetic', grossAmount: 0, taxableAmount: 0, totalGst: 0, netPayable: 0, status: 'REVIEWED' } });
    const purchase = new PharmacyPurchaseInvoiceService(prisma as any);
    await expect(purchase.reopenReview(invoice.id, { expectedUpdatedAt: invoice.updatedAt.toISOString() } as any, actor.branchId, actor.id)).rejects.toThrow('reason');
    const saved = await purchase.reopenReview(invoice.id, { expectedUpdatedAt: invoice.updatedAt.toISOString(), reason: ' Correct product identity ' }, actor.branchId, actor.id);
    expect(saved.status).toBe('DRAFT');
    const audit = await prisma.auditLog.findMany({ where: { entityId: invoice.id, action: 'REVIEW_REOPENED' } });
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0].newValues!).reason).toBe('Correct product identity');
    expect(await prisma.stockTransaction.count({ where: { itemId: item.id } })).toBe(0);
  });
});
