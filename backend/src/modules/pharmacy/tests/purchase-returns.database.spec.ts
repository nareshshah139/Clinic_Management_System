import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { InventoryWorkflowService } from '../../inventory/inventory-workflow.service';
import { InventoryWorkspaceService } from '../../inventory/inventory-workspace.service';
import { PharmacyPurchaseLedgerService } from '../pharmacy-purchase-ledger.service';
import { PharmacyPurchaseRegisterService } from '../pharmacy-purchase-register.service';
import { PharmacyPurchaseReturnsRegisterService } from '../pharmacy-purchase-returns-register.service';
import { PharmacyPurchasePaymentModeDto } from '../dto/pharmacy-purchase-ledger.dto';
import type { PurchaseReturnsQuery } from '../pharmacy-purchase-returns-register';

const databaseTests = process.env.PURCHASE_RETURNS_TEST_DATABASE_URL ? describe : describe.skip;

databaseTests('Purchase returns and credit notes on PostgreSQL', () => {
  const schema = `purchase_returns_${randomUUID().replaceAll('-', '')}`;
  const linae = '36ABCDE1234F1Z5';
  const migration = '20261106170000_supplier_credit_notes';
  let admin: PrismaClient;
  let db: PrismaClient;
  let fixtures: string;
  let created = false;
  let workflow: InventoryWorkflowService;
  let workspace: InventoryWorkspaceService;
  let ledger: PharmacyPurchaseLedgerService;
  let register: PharmacyPurchaseRegisterService;
  let returns: PharmacyPurchaseReturnsRegisterService;
  let columnsBeforeMigration: number;
  const branchId = 'branch';
  const actor = { id: 'asha', branchId, role: 'ADMIN' };
  const bills: Record<string, string> = {};
  let purchaseLineId: string;

  const returnsPage = (overrides: Partial<PurchaseReturnsQuery> = {}) =>
    returns.list({ from: '2026-04-01', to: '2027-03-31', sortBy: 'srNo', sortDir: 'asc', page: 1, limit: 50, ...overrides }, { branchId });
  const row = async (reference: string) => (await returnsPage()).rows.find((candidate) => candidate.returnRef === reference)!;
  const stock = async () => (await db.inventoryItem.findUniqueOrThrow({ where: { id: 'batch' } })).currentStock;
  const returnMovements = () => db.stockTransaction.count({ where: { branchId, itemId: 'batch', type: 'RETURN' } });
  const outstanding = async () =>
    Object.fromEntries(
      (await register.list({ from: '2026-04-01', to: '2027-03-31', distributorGstin: linae, sortBy: 'srNo', sortDir: 'asc', page: 1, limit: 50 }, { branchId })).rows.map(
        (bill) => [bill.billNo, bill.payment.outstanding],
      ),
    );
  const position = async () => (await ledger.getDistributorSummaries(branchId)).distributors.find((summary) => summary.distributorGstin === linae)!;

  async function raiseReturn(reference: string, quantity: number, post: 'CHALLAN' | 'POST' = 'CHALLAN') {
    const draft = await workflow.saveDocument(actor, {
      kind: 'SUPPLIER_RETURN',
      reference,
      requestKey: randomUUID(),
      supplierId: 'supplier',
      purchaseInvoiceId: bills['LIN-1'],
      payload: {
        date: '2026-11-02',
        returnType: 'NEAR_EXPIRY',
        lines: [{ inventoryId: 'batch', quantity, unitPrice: 10, sourceLineId: purchaseLineId }],
      },
    });
    return workflow.transition(actor, draft.id, { action: post, version: draft.version });
  }

  beforeAll(async () => {
    const url = new URL(process.env.PURCHASE_RETURNS_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Database tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    fixtures = mkdtempSync(path.join(tmpdir(), 'purchase-returns-'));
    const legacy = readFileSync(path.resolve('prisma/schema.prisma'), 'utf8')
      .replace(/model InventorySupplierCredit \{[\s\S]*?\n\}/, (model) =>
        model
          .split('\n')
          .filter((line) => !/^\s*(creditNoteNumber|creditNoteDate|receivedAt|receivedById|receivedBy)\s/.test(line) && !/@@unique/.test(line))
          .join('\n'),
      )
      .replace(/^\s*receivedSupplierCredits\s.*\n/m, '');
    writeFileSync(path.join(fixtures, 'legacy.prisma'), legacy);
    const prisma = (...args: string[]) =>
      execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), ...args], {
        stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: url.toString(), PRISMA_GENERATE_SKIP_AUTOINSTALL: '1' },
      });
    prisma('db', 'push', '--skip-generate', '--schema', path.join(fixtures, 'legacy.prisma'));
    db = new PrismaClient({ datasourceUrl: url.toString() });

    await db.branch.create({ data: { id: branchId, name: 'Skin Care Clinic', address: 'Synthetic' } });
    await db.user.create({
      data: { id: 'asha', firstName: 'Asha', lastName: 'Rao', email: 'asha@example.test', password: 'x', role: 'ADMIN', branchId },
    });
    columnsBeforeMigration = Number(
      (
        await db.$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT count(*) AS count FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = 'inventory_supplier_credits' AND column_name = 'creditNoteNumber'`,
          schema,
        )
      )[0].count,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO "inventory_supplier_credits" ("id", "branchId", "supplierGstin", "documentId", "reference", "amount", "applied", "createdAt")
       VALUES ('legacy-credit', $1, $2, 'legacy-doc', 'OLD-RET', 75.50, 20, '2026-06-01T05:00:00Z')`,
      branchId,
      linae,
    );
    for (let run = 0; run < 2; run++)
      prisma('db', 'execute', '--url', url.toString(), '--file', path.resolve(`prisma/migrations/${migration}/migration.sql`));
    await db.$disconnect();
    db = new PrismaClient({ datasourceUrl: url.toString() });

    await db.supplier.create({ data: { id: 'supplier', branchId, name: 'Linae Distributors', gstNumber: linae } });
    await db.inventoryItem.create({
      data: {
        id: 'batch', branchId, name: 'Synthetic Cream', type: 'MEDICINE', costPrice: 10, sellingPrice: 20, unit: 'TUBES',
        currentStock: 100, gstRate: 12, batchNumber: 'B-1', expiryDate: new Date('2027-01-31T00:00:00Z'), stockStatus: 'IN_STOCK',
      },
    });
    const seeds: [string, number, string, string][] = [
      ['LIN-1', 2000, '2026-10-01', '2026-10-31'],
      ['LIN-2', 1000, '2026-10-05', '2026-10-20'],
      ['LIN-3', 800, '2026-10-02', '2026-11-01'],
      ['LIN-4', 600, '2026-10-10', '2026-12-10'],
    ];
    for (const [invoiceNumber, netPayable, invoiceDay, dueDay] of seeds) {
      const bill = await db.pharmacyPurchaseInvoice.create({
        data: {
          branchId, createdBy: 'asha', distributorName: 'Linae Distributors', distributorGstin: linae, distributorDlNo: 'synthetic',
          invoiceNumber, invoiceDate: new Date(`${invoiceDay}T00:00:00+05:30`), dueDate: new Date(`${dueDay}T00:00:00+05:30`),
          billType: 'CREDIT', doctorNameOrRegNo: 'Synthetic', status: 'STOCK_COMMITTED', stockCommittedAt: new Date('2026-10-11T00:00:00Z'),
          grossAmount: netPayable, taxableAmount: netPayable, totalGst: 0, netPayable,
        },
      });
      bills[invoiceNumber] = bill.id;
    }
    purchaseLineId = (
      await db.pharmacyPurchaseInvoiceItem.create({
        data: {
          purchaseInvoiceId: bills['LIN-1'], lineNumber: 1, productName: 'Synthetic Cream', manufacturer: 'Synthetic', packSize: '1',
          packUnitType: 'TUBE', hsnCode: '3004', batchNumber: 'B-1', expiryMonth: 1, expiryYear: 2027, quantityPurchased: 100,
          mrp: 20, discountPercent: 0, purchaseRate: 10, taxableAmount: 1000, gstAmount: 120, lineTotal: 1120, inventoryItemId: 'batch',
        },
      })
    ).id;
    workflow = new InventoryWorkflowService(db as any);
    workspace = new InventoryWorkspaceService(db as any, workflow);
    ledger = new PharmacyPurchaseLedgerService(db as any);
    register = new PharmacyPurchaseRegisterService(db as any, ledger);
    returns = new PharmacyPurchaseReturnsRegisterService(db as any);
  }, 180000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
    if (fixtures) rmSync(fixtures, { recursive: true, force: true });
  });

  it('adds the credit note columns to a table that already holds credits, keeping them as they were', async () => {
    expect(columnsBeforeMigration).toBe(0);
    const legacy = await db.inventorySupplierCredit.findUniqueOrThrow({ where: { id: 'legacy-credit' } });
    expect([Number(legacy.amount), Number(legacy.applied), legacy.creditNoteNumber, legacy.creditNoteDate, legacy.receivedById]).toEqual([
      75.5, 20, null, null, null,
    ]);
    const index = await db.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND indexname = 'inventory_supplier_credits_credit_note_key'`,
      schema,
    );
    expect(index[0].indexdef).toContain('UNIQUE INDEX');
  });

  it('sends a return on challan: stock for the batch drops with a movement, and it waits for the credit note', async () => {
    await raiseReturn('RET-1', 20);
    expect(await stock()).toBe(80);
    const movement = await db.stockTransaction.findFirstOrThrow({ where: { branchId, itemId: 'batch', type: 'RETURN' } });
    expect([movement.quantity, movement.reference, movement.userId]).toEqual([20, 'WF-RET-1', 'asha']);
    const ret = await row('RET-1');
    expect([ret.state, ret.returnValue, ret.creditNote, ret.reason, ret.sourceBillNo, ret.distributor.name]).toEqual([
      'AWAITED', 224, null, 'NEAR_EXPIRY', 'LIN-1', 'Linae Distributors',
    ]);
  });

  it('records the distributor credit note: credit held rises and net payable falls by its amount, once per request key', async () => {
    const before = await position();
    const ret = await row('RET-1');
    const input = { requestKey: 'cn-request-1', version: ret.version, number: ' cn-77 ', date: '2026-11-05', amount: 200 };
    const first = await workflow.recordCreditNote(actor, ret.id, input);
    const retry = await workflow.recordCreditNote(actor, ret.id, input);

    expect(first.credit).toEqual({ id: first.credit.id, number: 'CN-77', date: '2026-11-05', amount: 200, applied: 0, available: 200 });
    expect(retry.credit.id).toBe(first.credit.id);
    expect(await db.inventorySupplierCredit.count({ where: { documentId: ret.id } })).toBe(1);
    expect(await db.inventoryWorkflowEvent.count({ where: { documentId: ret.id, action: 'CREDIT_NOTE' } })).toBe(1);
    const received = await row('RET-1');
    expect([received.state, received.creditNote, received.returnValue]).toEqual([
      'RECEIVED', { number: 'CN-77', date: '2026-11-05', amount: 200 }, 224,
    ]);
    expect(await stock()).toBe(80);

    const after = await position();
    expect([after.outstanding, after.creditHeld - before.creditHeld, before.netPayable - after.netPayable]).toEqual([4400, 200, 200]);
    expect(await ledger.distributorPosition(branchId, linae)).toEqual({
      gstin: linae, name: 'Linae Distributors', outstanding: 4400, creditHeld: 200, net: 4200,
    });
    const page = await register.list(
      { from: '2026-04-01', to: '2027-03-31', distributorGstin: linae, sortBy: 'srNo', sortDir: 'asc', page: 1, limit: 50 },
      { branchId },
    );
    expect([page.distributorPosition, page.creditHeld]).toEqual([
      { gstin: linae, name: 'Linae Distributors', outstanding: 4400, creditHeld: 200, net: 4200 },
      { [linae]: 200 },
    ]);
  });

  it('refuses the same credit note number twice for one distributor and leaves the second return awaited', async () => {
    await raiseReturn('RET-2', 5);
    const ret = await row('RET-2');
    await expect(
      workflow.recordCreditNote(actor, ret.id, { requestKey: 'cn-request-2', version: ret.version, number: 'CN-77', date: '2026-11-05', amount: 56 }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'CREDIT_NOTE_DUPLICATE', message: expect.stringContaining('Credit note CN-77 is already recorded for this distributor on return RET-1') },
    });
    expect((await row('RET-2')).state).toBe('AWAITED');
    expect(await stock()).toBe(75);
  });

  it('accepts a number on a legacy posted return without changing its stock', async () => {
    await raiseReturn('RET-OLD', 10, 'POST');
    expect(await stock()).toBe(65);
    const movements = await returnMovements();
    const legacy = await row('RET-OLD');
    expect([legacy.state, legacy.credit?.amount, legacy.creditNote]).toEqual(['AWAITED', 112, null]);

    await workflow.recordCreditNote(actor, legacy.id, { requestKey: 'cn-request-3', version: legacy.version, number: 'CN-80', date: '2026-11-04', amount: 112 });

    const recorded = await row('RET-OLD');
    expect([recorded.state, recorded.creditNote]).toEqual(['RECEIVED', { number: 'CN-80', date: '2026-11-04', amount: 112 }]);
    expect([await stock(), await returnMovements()]).toEqual([65, movements]);
  });

  it('sets part of a credit off against one bill and the rest against the next, oldest due first', async () => {
    const ret = await row('RET-1');
    const options = await workspace.setOffOptions(actor, { creditId: ret.credit!.id });
    expect([options.available, options.bills.map((bill) => [bill.billNo, bill.payable])]).toEqual([
      200,
      [['LIN-2', 1000], ['LIN-1', 2000], ['LIN-3', 800], ['LIN-4', 600]],
    ]);

    const part = { requestKey: 'set-off-1', creditId: ret.credit!.id, allocations: [{ purchaseInvoiceId: bills['LIN-2'], amount: 120 }] };
    await workspace.setOff(actor, part);
    await workspace.setOff(actor, part);
    expect(await db.inventoryCreditAllocation.count({ where: { creditId: ret.credit!.id } })).toBe(1);
    const adjusted = await row('RET-1');
    expect([adjusted.state, adjusted.credit?.available]).toEqual(['ADJUSTED', 80]);
    expect((await outstanding())['LIN-2']).toBe(880);

    await expect(
      workspace.setOff(actor, { requestKey: 'set-off-too-much', creditId: ret.credit!.id, allocations: [{ purchaseInvoiceId: bills['LIN-3'], amount: 90 }] }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'BALANCE_CHANGED', message: 'The credit available changed: ₹80.00 is left to set off.' } });

    await workspace.setOff(actor, { requestKey: 'set-off-2', creditId: ret.credit!.id, allocations: [{ purchaseInvoiceId: bills['LIN-3'], amount: 80 }] });
    const used = await row('RET-1');
    expect([used.state, used.credit?.available]).toEqual(['USED', 0]);
    expect(await outstanding()).toEqual({ 'LIN-1': 2000, 'LIN-2': 880, 'LIN-3': 720, 'LIN-4': 600 });
  });

  it('lets exactly one of a payment and a credit set-off settle the same bill in full at the same moment', async () => {
    await raiseReturn('RET-3', 60);
    const ret = await row('RET-3');
    await workflow.recordCreditNote(actor, ret.id, { requestKey: 'cn-request-4', version: ret.version, number: 'CN-90', date: '2026-11-05', amount: 600 });
    const creditId = (await row('RET-3')).credit!.id;
    const results = await Promise.allSettled([
      ledger.createPayment(
        {
          requestKey: randomUUID(), distributorGstin: linae, distributorName: 'Linae Distributors', paymentDate: '2026-11-05',
          mode: PharmacyPurchasePaymentModeDto.NEFT, amount: 600, allocations: [{ purchaseInvoiceId: bills['LIN-4'], amount: 600 }],
        },
        branchId,
        'asha',
      ),
      workspace.setOff(actor, { requestKey: 'race', creditId, allocations: [{ purchaseInvoiceId: bills['LIN-4'], amount: 600 }] }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const failure = (results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason;
    expect(failure.message).toMatch(/^(The balance of bill LIN-4 changed: ₹0\.00 is left to pay\.|The bill or credit balance changed while you were saving\. Check the new amounts\.|Allocation exceeds outstanding balance for invoice LIN-4)$/);
    expect((await outstanding())['LIN-4']).toBe(0);
    const bill = await db.pharmacyPurchaseInvoice.findUniqueOrThrow({
      where: { id: bills['LIN-4'] },
      include: { paymentAllocations: { where: { payment: { reversedAt: null } } } },
    });
    const settled = bill.creditApplied + bill.paymentAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    expect(settled).toBe(600);
    expect((await row('RET-3')).credit!.available).toBe(results[1].status === 'fulfilled' ? 0 : 600);
  });

  it('totals credit held and awaited returns, and filters and sorts the returns register', async () => {
    const page = await returnsPage({ sortBy: 'amount', sortDir: 'desc' });
    expect(page.rows.map((ret) => [ret.returnRef, ret.creditNote?.amount ?? ret.returnValue])).toEqual([
      ['RET-3', 600],
      ['RET-1', 200],
      ['RET-OLD', 112],
      ['RET-2', 56],
    ]);
    expect(page.totals.held).toBe(712 - (await row('RET-3')).credit!.applied);
    expect(page.totals.awaited).toEqual({ amount: 56, count: 1 });
    expect((await returnsPage({ state: 'AWAITED' })).rows.map((ret) => ret.returnRef)).toEqual(['RET-2']);
    expect((await returnsPage({ field: 'creditNoteNo', q: 'cn-8' })).rows.map((ret) => ret.returnRef)).toEqual(['RET-OLD']);
    expect((await position()).creditHeld).toBe(page.totals.held);
  });
});
