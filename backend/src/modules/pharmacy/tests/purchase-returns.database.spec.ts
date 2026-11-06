import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { InventoryWorkflowService } from '../../inventory/inventory-workflow.service';
import { InventoryWorkspaceService } from '../../inventory/inventory-workspace.service';
import { PharmacyPurchaseLedgerService } from '../pharmacy-purchase-ledger.service';
import { PharmacySupplierCreditService } from '../pharmacy-supplier-credit.service';
import { PharmacyPurchaseRegisterService } from '../pharmacy-purchase-register.service';
import { PharmacyPurchaseReturnsRegisterService } from '../pharmacy-purchase-returns-register.service';
import { PharmacyPurchasePaymentModeDto } from '../dto/pharmacy-purchase-ledger.dto';
import type { PurchaseReturnsQuery } from '../pharmacy-purchase-returns-register';
import { ROLE_PERMISSIONS } from '../../../shared/access/role-permissions';
import { isCreditNoteNumberClash } from '../../inventory/supplier-return';

const databaseTests = process.env.PURCHASE_RETURNS_TEST_DATABASE_URL ? describe : describe.skip;

databaseTests('Purchase returns and credit notes on PostgreSQL', () => {
  const schema = `purchase_returns_${randomUUID().replaceAll('-', '')}`;
  const linae = '36ABCDE1234F1Z5';
  const migrations = ['20261106170000_supplier_credit_notes', '20261107090000_supplier_credit_note_reuse', '20261107091000_supplier_credit_set_offs'];
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
  const topUp = () => db.inventoryItem.update({ where: { id: 'batch' }, data: { currentStock: { increment: 20 } } });
  const returnMovements = () => db.stockTransaction.count({ where: { branchId, itemId: 'batch', type: 'RETURN' } });
  const outstanding = async () =>
    Object.fromEntries(
      (await register.list({ from: '2026-04-01', to: '2027-03-31', distributorGstin: linae, sortBy: 'srNo', sortDir: 'asc', page: 1, limit: 50 }, { branchId })).rows.map(
        (bill) => [bill.billNo, bill.payment.outstanding],
      ),
    );
  const position = async () => (await ledger.getDistributorSummaries(branchId)).distributors.find((summary) => summary.distributorGstin === linae)!;

  async function raiseReturn(reference: string, quantity: number, post: 'CHALLAN' | 'POST' = 'CHALLAN', by = actor) {
    const draft = await workflow.saveDocument(by, {
      kind: 'SUPPLIER_RETURN',
      reference,
      requestKey: randomUUID(),
      supplierId: 'supplier',
      purchaseInvoiceId: bills['LIN-1'],
      payload: {
        date: '2026-11-02',
        returnType: 'NEAR_EXPIRY',
        reason: 'Short-dated batch',
        lines: [{ inventoryId: 'batch', quantity, unitPrice: 10, sourceLineId: purchaseLineId }],
      },
    });
    return workflow.transition(by, draft.id, { action: post, version: draft.version });
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
      .replace(/^\s*receivedSupplierCredits\s.*\n/m, '')
      .replace(/model InventoryCreditSetOff \{[\s\S]*?\n\}\n/, '')
      .replace(/^\s*(setOffId|setOff)\s.*\n/gm, '')
      .replace(/^\s*@@index\(\[setOffId\]\)\n/m, '');
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
      for (const migration of migrations)
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
          packUnitType: 'TUBE', hsnCode: '3004', batchNumber: 'B-1', expiryMonth: 1, expiryYear: 2027, quantityPurchased: 200,
          mrp: 20, discountPercent: 0, purchaseRate: 10, taxableAmount: 1000, gstAmount: 120, lineTotal: 1120, inventoryItemId: 'batch',
        },
      })
    ).id;
    workflow = new InventoryWorkflowService(db as any);
    workspace = new InventoryWorkspaceService(db as any, workflow, new PharmacySupplierCreditService(db as any));
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
    const indexes = await db.$queryRawUnsafe<{ indexname: string; indexdef: string }[]>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND indexname LIKE '%credit_note_key'`,
      schema,
    );
    expect(indexes.map((index) => index.indexname)).toEqual(['inventory_supplier_credits_open_credit_note_key']);
    expect(indexes[0].indexdef).toContain('UNIQUE INDEX');
    expect(indexes[0].indexdef).toContain('WHERE (("reversedAt" IS NULL) AND ("creditNoteNumber" IS NOT NULL))');
  });

  it('matches the migrations for supplier credits, allocations and set-offs, the partial index aside, which Prisma cannot see', async () => {
    const shadow = `cr27_shadow_${randomUUID().replaceAll('-', '')}`;
    const url = new URL(process.env.PURCHASE_RETURNS_TEST_DATABASE_URL!);
    url.pathname = `/${shadow}`;
    url.search = '';
    await admin.$executeRawUnsafe(`CREATE DATABASE "${shadow}"`);
    try {
      const diff = execFileSync(
        process.execPath,
        [
          require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-schema-datamodel', 'prisma/schema.prisma',
          '--to-migrations', 'prisma/migrations', '--shadow-database-url', url.toString(), '--script',
        ],
        { stdio: 'pipe', encoding: 'utf8' },
      );
      const statements = diff.split(';').filter((statement) => /inventory_(supplier_credits|credit_allocations|credit_set_offs)/.test(statement));
      expect(statements).toEqual([]);
    } finally {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${shadow}" WITH (FORCE)`);
    }
  }, 120000);

  it('sends a return on challan: stock for the batch drops with a movement, and it waits for the credit note', async () => {
    await raiseReturn('RET-1', 20);
    expect(await stock()).toBe(80);
    const movement = await db.stockTransaction.findFirstOrThrow({ where: { branchId, itemId: 'batch', type: 'RETURN' } });
    expect([movement.quantity, movement.reference, movement.userId, movement.reason]).toEqual([20, 'WF-RET-1', 'asha', 'Near expiry · Short-dated batch']);
    const stored = await db.inventoryWorkflowDocument.findFirstOrThrow({ where: { reference: 'RET-1' } });
    expect([(stored.payload as any).returnReason, (stored.payload as any).returnType]).toEqual(['NEAR_EXPIRY', undefined]);
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
    expect([await register.position(linae, { branchId }), page.creditHeld, page.onlyDistributor]).toEqual([
      { gstin: linae, name: 'Linae Distributors', outstanding: 4400, creditHeld: 200, net: 4200 },
      { [linae]: 200 },
      linae,
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

  it('reports a clash on the open credit note index as a duplicate number, and no other unique clash', async () => {
    const clash = await db.inventorySupplierCredit
      .create({ data: { branchId, supplierGstin: linae, documentId: 'clash-doc', reference: 'CLASH', amount: 1, creditNoteNumber: 'CN-77' } })
      .catch((error: unknown) => error);
    const otherClash = await db.inventorySupplierCredit
      .create({ data: { branchId, supplierGstin: linae, documentId: 'legacy-doc', reference: 'CLASH', amount: 1 } })
      .catch((error: unknown) => error);
    expect([isCreditNoteNumberClash(clash), isCreditNoteNumberClash(otherClash), (otherClash as any).code]).toEqual([true, false, 'P2002']);
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

  it.each([
    ['PHARMACIST', 'kiran', ROLE_PERMISSIONS.PHARMACIST],
    ['DOCTOR', 'priya', ROLE_PERMISSIONS.DOCTOR],
    ['ADMIN', 'ravi', ROLE_PERMISSIONS.ADMIN],
  ])('lets a %s raise a return, record its credit note and set it off', async (role, id, permissions) => {
    await db.user.create({
      data: { id, firstName: id, lastName: 'Synthetic', email: `${id}@example.test`, password: 'x', role: role as any, branchId, permissions: JSON.stringify(permissions) },
    });
    const who = { id, branchId, role };
    expect((await workflow.capabilities(who)).creditWrite).toBe(true);
    await raiseReturn(`RET-${role}`, 1, 'CHALLAN', who);
    const ret = await row(`RET-${role}`);
    await workflow.recordCreditNote(who, ret.id, { requestKey: `cn-${role}`, version: ret.version, number: `CN-${role}`, date: '2026-11-05', amount: 11.2 });
    const credit = (await row(`RET-${role}`)).credit!;
    expect((await workspace.setOffOptions(who, { creditId: credit.id })).available).toBe(11.2);
    await workspace.setOff(who, { requestKey: `set-off-${role}`, creditId: credit.id, allocations: [{ purchaseInvoiceId: bills['LIN-1'], amount: 11.2 }] });
    expect((await row(`RET-${role}`)).state).toBe('USED');
  });

  it('totals credit held and awaited returns, and filters and sorts the returns register', async () => {
    const page = await returnsPage({ sortBy: 'amount', sortDir: 'desc' });
    expect(page.rows.map((ret) => [ret.returnRef, ret.creditNote?.amount ?? ret.returnValue])).toEqual([
      ['RET-3', 600],
      ['RET-1', 200],
      ['RET-OLD', 112],
      ['RET-2', 56],
      ['RET-ADMIN', 11.2],
      ['RET-DOCTOR', 11.2],
      ['RET-PHARMACIST', 11.2],
    ]);
    expect(page.totals.held).toBe(712 - (await row('RET-3')).credit!.applied);
    expect(page.totals.awaited).toEqual({ amount: 56, count: 1 });
    expect((await returnsPage({ state: 'AWAITED' })).rows.map((ret) => ret.returnRef)).toEqual(['RET-2']);
    expect((await returnsPage({ field: 'creditNoteNo', q: 'cn-8' })).rows.map((ret) => ret.returnRef)).toEqual(['RET-OLD']);
    expect((await position()).creditHeld).toBe(page.totals.held);
  });

  it('frees the credit note number of a reversed return for the next return from that distributor', async () => {
    const before = await stock();
    await raiseReturn('RET-REV', 1);
    const first = await row('RET-REV');
    await workflow.recordCreditNote(actor, first.id, { requestKey: 'cn-rev-1', version: first.version, number: 'CN-REUSE', date: '2026-11-05', amount: 11.2 });
    const posted = await row('RET-REV');
    await workflow.transition(actor, posted.id, { action: 'REVERSE', version: posted.version, reason: 'Wrong distributor' } as any);
    expect([(await row('RET-REV')).state, await stock()]).toEqual(['CANCELLED', before]);

    await raiseReturn('RET-REUSE', 1);
    const second = await row('RET-REUSE');
    await workflow.recordCreditNote(actor, second.id, { requestKey: 'cn-rev-2', version: second.version, number: 'cn-reuse', date: '2026-11-05', amount: 11.2 });
    expect([(await row('RET-REUSE')).state, (await row('RET-REUSE')).creditNote?.number]).toEqual(['RECEIVED', 'CN-REUSE']);
    expect(await stock()).toBe(before - 1);
  });

  it('posts the return, then records the credit note as its own event that moves no stock', async () => {
    await topUp();
    await raiseReturn('RET-EVENTS', 1);
    const ret = await row('RET-EVENTS');
    await workflow.recordCreditNote(actor, ret.id, { requestKey: 'cn-events', version: ret.version, number: 'CN-EV', date: '2026-11-05', amount: 11 });
    const events = await db.inventoryWorkflowEvent.findMany({ where: { documentId: ret.id }, orderBy: { createdAt: 'asc' }, select: { action: true, fromStatus: true, toStatus: true, detail: true } });
    expect(events.map((event) => [event.action, event.fromStatus, event.toStatus, (event.detail as any).stockEffect])).toEqual([
      ['CREATE', null, 'DRAFT', undefined],
      ['CHALLAN', 'DRAFT', 'CHALLAN', true],
      ['POST', 'CHALLAN', 'POSTED', true],
      ['CREDIT_NOTE', 'POSTED', 'POSTED', false],
    ]);
    expect((events[3].detail as any).before).toEqual({ amount: 11.2, number: null });
    expect((events[3].detail as any).after).toEqual({ number: 'CN-EV', date: '2026-11-05', amount: 11 });
  });

  it('corrects a recorded credit note: number and date always, amount only while nothing is set off, with the change on record', async () => {
    await topUp();
    await raiseReturn('RET-FIX', 2);
    const ret = await row('RET-FIX');
    await workflow.recordCreditNote(actor, ret.id, { requestKey: 'cn-fix-1', version: ret.version, number: 'CN-TYPO', date: '2026-11-04', amount: 22 });
    const typo = await row('RET-FIX');
    const fix = { requestKey: 'cn-fix-2', version: typo.version, number: 'CN-FIXED', date: '2026-11-05', amount: 21.5, correct: true };
    await expect(workflow.recordCreditNote(actor, ret.id, { ...fix, reason: ' ' })).rejects.toMatchObject({
      status: 400, message: 'Enter why the credit note is being corrected',
    });
    await workflow.recordCreditNote(actor, ret.id, { ...fix, reason: 'Misread the note' });
    await workflow.recordCreditNote(actor, ret.id, { ...fix, reason: 'Misread the note' });
    const fixed = await row('RET-FIX');
    expect([fixed.state, fixed.creditNote, fixed.credit?.available]).toEqual(['RECEIVED', { number: 'CN-FIXED', date: '2026-11-05', amount: 21.5 }, 21.5]);
    const corrections = await db.inventoryWorkflowEvent.findMany({ where: { documentId: ret.id, action: 'CREDIT_NOTE_CORRECTED' } });
    expect(corrections.map((event) => [(event.detail as any).reason, (event.detail as any).before, (event.detail as any).after])).toEqual([
      ['Misread the note', { number: 'CN-TYPO', date: '2026-11-04', amount: 22 }, { number: 'CN-FIXED', date: '2026-11-05', amount: 21.5 }],
    ]);

    await workspace.setOff(actor, { requestKey: 'set-off-fix', creditId: fixed.credit!.id, allocations: [{ purchaseInvoiceId: bills['LIN-1'], amount: 1.5 }] });
    const adjusted = await row('RET-FIX');
    const again = { requestKey: 'cn-fix-3', version: adjusted.version, number: 'CN-FIXED', date: '2026-11-05', correct: true, reason: 'Wrong amount' };
    await expect(workflow.recordCreditNote(actor, ret.id, { ...again, amount: 20 })).rejects.toMatchObject({
      status: 400,
      message: '₹1.50 of this credit is already set off against bills, so its amount stays ₹21.50. Correct the number and date only.',
    });
    await workflow.recordCreditNote(actor, ret.id, { ...again, requestKey: 'cn-fix-4', number: 'CN-FIXED-2', amount: 21.5 });
    expect([(await row('RET-FIX')).creditNote?.number, (await row('RET-FIX')).credit?.available]).toEqual(['CN-FIXED-2', 20]);
  });

  it('refuses a credit note dated before the return, naming the return date', async () => {
    await topUp();
    await raiseReturn('RET-EARLY', 1);
    const ret = await row('RET-EARLY');
    await expect(
      workflow.recordCreditNote(actor, ret.id, { requestKey: 'cn-early', version: ret.version, number: 'CN-EARLY', date: '2026-11-01', amount: 11.2 }),
    ).rejects.toMatchObject({ status: 400, message: 'The credit note date cannot be before the return date, 02/11/2026' });
    expect((await row('RET-EARLY')).state).toBe('AWAITED');
  });

  it('records a credit note on a posted return that never had a credit, creating that credit', async () => {
    await topUp();
    await raiseReturn('RET-NOCREDIT', 1, 'POST');
    const ret = await row('RET-NOCREDIT');
    await db.inventorySupplierCredit.delete({ where: { documentId: ret.id } });
    expect((await row('RET-NOCREDIT')).state).toBe('AWAITED');
    await workflow.recordCreditNote(actor, ret.id, { requestKey: 'cn-nocredit', version: ret.version, number: 'CN-NC', date: '2026-11-05', amount: 11.2 });
    const received = await row('RET-NOCREDIT');
    expect([received.state, received.credit?.amount, received.credit?.available]).toEqual(['RECEIVED', 11.2, 11.2]);
  });

  it('tells a draft return to go on challan first, and leaves it a draft', async () => {
    const draft = await workflow.saveDocument(actor, {
      kind: 'SUPPLIER_RETURN', reference: 'RET-DRAFT', requestKey: randomUUID(), supplierId: 'supplier', purchaseInvoiceId: bills['LIN-1'],
      payload: { date: '2026-11-02', lines: [{ inventoryId: 'batch', quantity: 1, unitPrice: 10, sourceLineId: purchaseLineId }] },
    });
    await expect(
      workflow.recordCreditNote(actor, draft.id, { requestKey: 'cn-draft', version: draft.version, number: 'CN-DRAFT', date: '2026-11-05', amount: 11.2 }),
    ).rejects.toMatchObject({ status: 400, message: 'Send the goods on a return challan before recording the credit note' });
    expect((await row('RET-DRAFT')).state).toBe('DRAFT');
  });

  it('replays a set-off only for the identical request, refuses a reused key with other content, and never replays an undone set-off', async () => {
    await topUp();
    await raiseReturn('RET-KEY', 1);
    const ret = await row('RET-KEY');
    await workflow.recordCreditNote(actor, ret.id, { requestKey: 'cn-key', version: ret.version, number: 'CN-KEY', date: '2026-11-05', amount: 11.2 });
    const creditId = (await row('RET-KEY')).credit!.id;
    const before = (await outstanding())['LIN-1'];
    const request = { requestKey: 'set-off-key', creditId, allocations: [{ purchaseInvoiceId: bills['LIN-1'], amount: 5 }] };
    const first = await workspace.setOff(actor, request);
    const replay = await workspace.setOff(actor, request);
    expect([replay.setOffId, replay.allocations.map((allocation) => allocation.amount)]).toEqual([first.setOffId, [5]]);
    await expect(workspace.setOff(actor, { ...request, allocations: [{ purchaseInvoiceId: bills['LIN-1'], amount: 6 }] })).rejects.toMatchObject({
      status: 409, response: { code: 'REQUEST_KEY_REUSED' },
    });
    expect([(await outstanding())['LIN-1'], (await row('RET-KEY')).credit?.available]).toEqual([before - 5, 6.2]);

    await workspace.reverseSetOff(actor, first.setOffId, 'Undo');
    expect([(await outstanding())['LIN-1'], (await row('RET-KEY')).state, (await row('RET-KEY')).credit?.available]).toEqual([before, 'RECEIVED', 11.2]);
    await expect(workspace.setOff(actor, request)).rejects.toMatchObject({ status: 409, response: { code: 'SET_OFF_UNDONE' } });
    await expect(workspace.reverseSetOff(actor, first.setOffId, 'Undo')).rejects.toMatchObject({ status: 409, response: { code: 'SET_OFF_UNDONE' } });
    expect((await outstanding())['LIN-1']).toBe(before);
  });

  it('sends the old allocate path through the set-off rules: a numbered credit, one bill, capped at what the bill has left to pay', async () => {
    await expect(
      workspace.allocateCredit(actor, { requestKey: 'old-legacy', creditId: 'legacy-credit', purchaseInvoiceId: bills['LIN-1'], amount: 5 }),
    ).rejects.toMatchObject({ status: 400, message: "Record the distributor's credit note number before setting this credit off against bills" });
    const creditId = (await row('RET-KEY')).credit!.id;
    const payable = (await outstanding())['LIN-4'];
    expect(payable).toBe(0);
    await expect(
      workspace.allocateCredit(actor, { requestKey: 'old-capped', creditId, purchaseInvoiceId: bills['LIN-4'], amount: 5 }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'BALANCE_CHANGED', message: 'The balance of bill LIN-4 changed: ₹0.00 is left to pay.' } });
    const done = await workspace.allocateCredit(actor, { requestKey: 'old-ok', creditId, purchaseInvoiceId: bills['LIN-2'], amount: 2.2 });
    expect([done.allocations.map((allocation) => allocation.amount), (await row('RET-KEY')).credit?.available]).toEqual([[2.2], 9]);
  });

  it('posts a standalone supplier credit as received only with its credit note number and date', async () => {
    const save = (payload: Record<string, unknown>, reference: string) =>
      workflow.saveDocument(actor, {
        kind: 'CREDIT_NOTE', reference, requestKey: randomUUID(), supplierId: 'supplier',
        payload: { date: '2026-11-03', lines: [{ inventoryId: 'batch', quantity: 1, unitPrice: 40 }], ...payload },
      });
    const bare = await save({}, 'SC-BARE');
    await expect(workflow.transition(actor, bare.id, { action: 'POST', version: bare.version } as any)).rejects.toMatchObject({
      status: 400, message: "Enter the credit note number from the distributor's note",
    });
    const taken = await save({ creditNoteNumber: 'cn-77', creditNoteDate: '2026-11-04' }, 'SC-TAKEN');
    await expect(workflow.transition(actor, taken.id, { action: 'POST', version: taken.version } as any)).rejects.toMatchObject({
      status: 409, response: { code: 'CREDIT_NOTE_DUPLICATE' },
    });
    const good = await save({ creditNoteNumber: ' cn-sc-1 ', creditNoteDate: '2026-11-04' }, 'SC-GOOD');
    await workflow.transition(actor, good.id, { action: 'POST', version: good.version } as any);
    const credit = await row('SC-GOOD');
    expect([credit.kind, credit.state, credit.creditNote, credit.credit?.available]).toEqual([
      'CREDIT_NOTE', 'RECEIVED', { number: 'CN-SC-1', date: '2026-11-04', amount: credit.returnValue }, credit.returnValue,
    ]);
  });

  it('totals credit held and awaited across all dates for the distributor, whatever period the list shows', async () => {
    const all = await returnsPage();
    const lateWeek = await returnsPage({ from: '2026-11-04', to: '2026-11-04' });
    expect(lateWeek.rows).toEqual([]);
    expect([lateWeek.totals.held, lateWeek.totals.awaited]).toEqual([all.totals.held, all.totals.awaited]);
    expect(lateWeek.totals.held).toBe((await position()).creditHeld);
    expect((await returnsPage({ from: '2026-11-04', to: '2026-11-04', distributorGstin: '27AAAAA0000A1Z5' })).totals).toMatchObject({
      held: 0, awaited: { amount: 0, count: 0 },
    });
  });

  it('lists a distributor that holds credit but has no bills in Payments & dues, with a ledger to open', async () => {
    await db.supplier.create({ data: { id: 'supplier-2', branchId, name: 'Medico Agencies', gstNumber: '27AAAAA0000A1Z5' } });
    await db.inventorySupplierCredit.create({
      data: { branchId, supplierGstin: '27AAAAA0000A1Z5', documentId: 'medico-doc', reference: 'MED-RET', amount: 300, creditNoteNumber: 'MED-CN-1', receivedAt: new Date('2026-11-01T05:00:00Z') },
    });
    const medico = (await ledger.getDistributorSummaries(branchId)).distributors.find((summary) => summary.distributorGstin === '27AAAAA0000A1Z5');
    expect([medico?.distributorName, medico?.invoiceCount, medico?.outstanding, medico?.creditHeld, medico?.netPayable]).toEqual([
      'Medico Agencies', 0, 0, 300, -300,
    ]);
    const detail = await ledger.getDistributorLedger(branchId, '27AAAAA0000A1Z5');
    expect([detail.distributorName, detail.invoices, detail.runningLedger]).toEqual(['Medico Agencies', [], []]);
    await expect(ledger.getDistributorLedger(branchId, '29BBBBB0000B1Z5')).rejects.toMatchObject({ status: 404 });
  });
});
