import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { InventoryWorkspaceService } from '../../inventory/inventory-workspace.service';
import { PharmacyPurchaseLedgerService } from '../pharmacy-purchase-ledger.service';
import { PharmacyPurchasePaymentModeDto } from '../dto/pharmacy-purchase-ledger.dto';

const databaseTests = process.env.PAYMENT_RECOVERY_TEST_DATABASE_URL ? describe : describe.skip;

databaseTests('Supplier payment recovery with real PostgreSQL', () => {
  let admin: PrismaClient;
  let prisma: any;
  let service: PharmacyPurchaseLedgerService;
  let branchId: string;
  let userId: string;
  let a: any;
  let b: any;
  let fixtures: string;
  let clientDirectory: string;
  const schema = `payment_recovery_${randomUUID().replaceAll('-', '')}`;
  const gstin = '36ABCDE1234F1Z5';

  beforeAll(async () => {
    const url = new URL(process.env.PAYMENT_RECOVERY_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Database tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('schema', schema);
    fixtures = path.resolve('../output/diagnostics', schema);
    mkdirSync(fixtures, { recursive: true });
    clientDirectory = mkdtempSync(path.join(tmpdir(), 'payment-recovery-client-'));
    const fullSchema = readFileSync(path.resolve('prisma/schema.prisma'), 'utf8')
      .replace('provider = "prisma-client-js"', `provider = "prisma-client-js"\n  output = "${clientDirectory}"`);
    const fullPath = path.join(fixtures, 'schema.prisma');
    writeFileSync(fullPath, fullSchema);
    const legacySchema = fullSchema.replace(/model PharmacyPurchasePayment \{[\s\S]*?\n\}/, model => model
      .split('\n').filter(line => !/^\s*(requestFingerprint|reversedAt|reversedBy|reversalReason|correctionRequestKey|correctionFingerprint|replacesPaymentId|replacesPayment|replacementPayment)\s/.test(line)
        && !line.includes('@@unique([branchId, correctionRequestKey])')).join('\n'));
    const legacyPath = path.join(fixtures, 'legacy.prisma');
    writeFileSync(legacyPath, legacySchema);
    const run = (...args: string[]) => execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), ...args], {
      env: { ...process.env, DATABASE_URL: url.toString(), PRISMA_GENERATE_SKIP_AUTOINSTALL: '1' }, stdio: 'pipe',
    });
    run('generate', '--schema', fullPath);
    run('db', 'push', '--skip-generate', '--schema', legacyPath);
    const legacy = new PrismaClient({ datasourceUrl: url.toString() });
    try {
      await legacy.$executeRaw`INSERT INTO branches (id,name,address,"updatedAt") VALUES ('legacy-payment-branch','Synthetic legacy','Synthetic',NOW())`;
      await legacy.$executeRaw`INSERT INTO pharmacy_purchase_payments (id,"branchId","distributorGstin","distributorName","paymentDate",mode,"paidBy",amount,"updatedAt") VALUES ('legacy-payment','legacy-payment-branch',${gstin},'Synthetic legacy',NOW(),'NEFT','legacy-actor',100,NOW())`;
      const migration = readFileSync(path.resolve('prisma/migrations/20261015171000_supplier_payment_recovery/migration.sql'), 'utf8');
      for (const sql of migration.split(';').filter(sql => sql.trim())) await legacy.$executeRawUnsafe(sql);
    } finally { await legacy.$disconnect(); }
    const GeneratedClient = require(clientDirectory).PrismaClient;
    prisma = new GeneratedClient({ datasourceUrl: url.toString() });
    service = new PharmacyPurchaseLedgerService(prisma);
    const retained = await prisma.pharmacyPurchasePayment.findUnique({ where: { id: 'legacy-payment' } });
    expect({ amount: retained.amount, reversedAt: retained.reversedAt, replacesPaymentId: retained.replacesPaymentId }).toEqual({ amount: 100, reversedAt: null, replacesPaymentId: null });
  }, 120000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (admin) { await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect(); }
    if (fixtures) rmSync(fixtures, { recursive: true, force: true });
    if (clientDirectory) rmSync(clientDirectory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    branchId = (await prisma.branch.create({ data: { name: 'Synthetic payment recovery', address: 'Synthetic' } })).id;
    userId = (await prisma.user.create({ data: { email: `${randomUUID()}@example.invalid`, firstName: 'Synthetic', lastName: 'Operator', password: 'not-a-login', role: 'ACCOUNTANT', branchId } })).id;
    const invoice = (invoiceNumber: string) => prisma.pharmacyPurchaseInvoice.create({ data: {
      branchId, distributorName: 'Synthetic Supplier', distributorGstin: gstin, distributorDlNo: 'synthetic', invoiceNumber,
      invoiceDate: new Date('2026-10-01'), billType: 'CREDIT', doctorNameOrRegNo: 'Synthetic', status: 'STOCK_COMMITTED',
      stockCommittedAt: new Date('2026-10-01'), grossAmount: 100, taxableAmount: 100, totalGst: 0, netPayable: 100,
    } });
    [a, b] = await Promise.all([invoice('SYN-A'), invoice('SYN-B')]);
  });

  const pay = (amount = 100, invoiceId?: string, requestKey = randomUUID()) => service.createPayment({
    requestKey, distributorGstin: gstin, distributorName: 'Synthetic Supplier', paymentDate: '2026-10-01',
    mode: PharmacyPurchasePaymentModeDto.NEFT, amount, allocations: [{ purchaseInvoiceId: invoiceId || a.id, amount }],
  }, branchId, userId);
  const correction = (payment: any, key = randomUUID()) => ({ requestKey: key, expectedUpdatedAt: payment.updatedAt.toISOString(), reason: 'Synthetic correction' });
  const balances = async () => Object.fromEntries((await service.getDistributorLedger(branchId, gstin)).invoices.map(row => [row.id, row.outstanding]));

  it('replays concurrent reversal once, retains allocations and restores the exact balance with one audit event', async () => {
    const payment = await pay();
    const dto = correction(payment);
    const results = await Promise.all([service.reversePayment(payment.id, dto, branchId, userId), service.reversePayment(payment.id, dto, branchId, userId)]);
    expect(results.map(result => result.original.id)).toEqual([payment.id, payment.id]);
    expect((await balances())[a.id]).toBe(100);
    expect(await prisma.pharmacyPurchasePaymentAllocation.count({ where: { paymentId: payment.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: payment.id, action: 'SUPPLIER_PAYMENT_REVERSED' } })).toBe(1);
    await expect(service.reversePayment(payment.id, { ...dto, reason: 'Changed reason' }, branchId, userId)).rejects.toThrow('different details');
  });

  it('reallocates concurrently to one replacement with unchanged total and leaves original allocations immutable', async () => {
    const payment = await pay();
    const dto = { ...correction(payment), allocations: [{ purchaseInvoiceId: b.id, amount: 100 }] };
    const results = await Promise.all([service.reallocatePayment(payment.id, dto, branchId, userId), service.reallocatePayment(payment.id, dto, branchId, userId)]);
    expect(results[0].replacement.id).toBe(results[1].replacement.id);
    expect(await balances()).toMatchObject({ [a.id]: 100, [b.id]: 0 });
    expect(await prisma.pharmacyPurchasePayment.count({ where: { replacesPaymentId: payment.id } })).toBe(1);
    expect((await prisma.pharmacyPurchasePaymentAllocation.findMany({ where: { paymentId: payment.id } })).map((row: any) => [row.purchaseInvoiceId, row.amount])).toEqual([[a.id, 100]]);
    expect(await prisma.auditLog.count({ where: { entityId: payment.id, action: 'SUPPLIER_PAYMENT_REALLOCATED' } })).toBe(1);
  });

  it('rolls back both reversal and replacement when the audit cannot persist', async () => {
    const payment = await pay();
    await prisma.$executeRawUnsafe(`ALTER TABLE audit_logs ADD CONSTRAINT synthetic_audit_failure CHECK (action <> 'SUPPLIER_PAYMENT_REALLOCATED') NOT VALID`);
    try {
      await expect(service.reallocatePayment(payment.id, { ...correction(payment), allocations: [{ purchaseInvoiceId: b.id, amount: 100 }] }, branchId, userId)).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE audit_logs DROP CONSTRAINT synthetic_audit_failure');
    }
    expect((await prisma.pharmacyPurchasePayment.findUnique({ where: { id: payment.id } })).reversedAt).toBeNull();
    expect(await prisma.pharmacyPurchasePayment.count({ where: { replacesPaymentId: payment.id } })).toBe(0);
    expect(await balances()).toMatchObject({ [a.id]: 0, [b.id]: 100 });
  });

  it('preserves historical balances before reversal while current statements include the reversing debit', async () => {
    const payment = await pay();
    const cutoff = new Date('2026-10-02');
    await prisma.pharmacyPurchasePayment.update({ where: { id: payment.id }, data: { createdAt: new Date('2026-10-01') } });
    await prisma.pharmacyPurchasePaymentAllocation.updateMany({ where: { paymentId: payment.id }, data: { createdAt: new Date('2026-10-01') } });
    const refreshed = await prisma.pharmacyPurchasePayment.findUnique({ where: { id: payment.id } });
    const before = await service.getDistributorLedger(branchId, gstin, cutoff);
    await service.reversePayment(payment.id, correction(refreshed), branchId, userId);
    const after = await service.getDistributorLedger(branchId, gstin, cutoff);
    expect(after.invoices).toEqual(before.invoices);
    expect(after.invoices.find(row => row.id === a.id)!.outstanding).toBe(0);
    const current = await service.getDistributorLedger(branchId, gstin);
    expect(current.runningLedger.find(row => row.type === 'PAYMENT_REVERSAL')).toMatchObject({ debit: 100, credit: 0 });
    expect(current.runningLedger.at(-1)!.runningBalance).toBe(200);
  });

  it('rejects stale revisions, cross-branch corrections, changed totals and over-allocation after supplier credits', async () => {
    const payment = await pay();
    const dto = correction(payment);
    await expect(service.reversePayment(payment.id, { ...dto, expectedUpdatedAt: '2000-01-01' }, branchId, userId)).rejects.toThrow('changed');
    await expect(service.reversePayment(payment.id, dto, 'another-branch', userId)).rejects.toThrow('not found');
    await expect(service.reallocatePayment(payment.id, { ...dto, allocations: [{ purchaseInvoiceId: b.id, amount: 90 }] }, branchId, userId)).rejects.toThrow('original payment amount');
    await prisma.pharmacyPurchaseInvoice.update({ where: { id: b.id }, data: { creditApplied: 20 } });
    await expect(service.reallocatePayment(payment.id, { ...dto, allocations: [{ purchaseInvoiceId: b.id, amount: 100 }] }, branchId, userId)).rejects.toThrow('exceeds outstanding');
    expect((await prisma.pharmacyPurchasePayment.findUnique({ where: { id: payment.id } })).reversedAt).toBeNull();
  });

  it('rejects changed creation payloads and accepts order-independent allocation retries', async () => {
    const requestKey = randomUUID();
    const payment = await pay(50, a.id, requestKey);
    await expect(pay(60, a.id, requestKey)).rejects.toThrow('different details');
    expect((await pay(50, a.id, requestKey)).id).toBe(payment.id);
    const request = { requestKey: randomUUID(), distributorGstin: gstin, distributorName: 'Synthetic Supplier', paymentDate: '2026-10-01',
      mode: PharmacyPurchasePaymentModeDto.NEFT, amount: 100, allocations: [{ purchaseInvoiceId: a.id, amount: 50 }, { purchaseInvoiceId: b.id, amount: 50 }] };
    const multi = await service.createPayment(request, branchId, userId);
    const replay = await service.createPayment({ ...request, allocations: [...request.allocations].reverse() }, branchId, userId);
    expect(replay.id).toBe(multi.id);
  });
  it('restores the balance used by supplier-credit allocation and keeps ledger totals reconciled', async () => {
    const payment = await pay();
    await service.reversePayment(payment.id, correction(payment), branchId, userId);
    const workflow = { permissions: async () => new Set(['*']), transaction: (run: any) => prisma.$transaction(run, { isolationLevel: 'Serializable' }) };
    const workspace = new InventoryWorkspaceService(prisma, workflow as any);
    const actor = { id: userId, branchId, role: 'ACCOUNTANT' };
    expect((await workspace.credits(actor)).invoices.find(row => row.id === a.id)!.outstanding).toBe(100);
    const credit = await prisma.inventorySupplierCredit.create({ data: { branchId, supplierGstin: gstin, documentId: randomUUID(), reference: 'SYN-CREDIT', amount: 50 } });
    await workspace.allocateCredit(actor, { requestKey: randomUUID(), creditId: credit.id, purchaseInvoiceId: a.id, amount: 50 });
    expect((await workspace.credits(actor)).invoices.find(row => row.id === a.id)!.outstanding).toBe(50);
    const ledger = await service.getDistributorLedger(branchId, gstin);
    expect(ledger.invoices.find(row => row.id === a.id)).toMatchObject({ paid: 0, creditApplied: 50, outstanding: 50 });
    expect(ledger.runningLedger.at(-1)!.runningBalance).toBe(150);
  });

  it('allows only one competing reallocation to consume the same outstanding balance', async () => {
    const first = await pay(100, a.id);
    const second = await pay(100, b.id);
    const target = await prisma.pharmacyPurchaseInvoice.create({ data: {
      branchId, distributorName: 'Synthetic Supplier', distributorGstin: gstin, distributorDlNo: 'synthetic', invoiceNumber: 'SYN-C',
      invoiceDate: new Date('2026-10-01'), billType: 'CREDIT', doctorNameOrRegNo: 'Synthetic', status: 'STOCK_COMMITTED',
      stockCommittedAt: new Date('2026-10-01'), grossAmount: 100, taxableAmount: 100, totalGst: 0, netPayable: 100,
    } });
    const results = await Promise.allSettled([first, second].map(payment => service.reallocatePayment(payment.id, {
      ...correction(payment), allocations: [{ purchaseInvoiceId: target.id, amount: 100 }],
    }, branchId, userId)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.pharmacyPurchasePayment.count({ where: { branchId, reversedAt: { not: null } } })).toBe(1);
    expect((await balances())[target.id]).toBe(0);
  });

  it('changes historical allocations at one boundary despite a deliberate transaction-to-reversal timestamp gap', async () => {
    const payment = await pay();
    const delayed = new PharmacyPurchaseLedgerService({
      $transaction: (run: any, options: any) => prisma.$transaction(async (tx: any) => {
        await tx.$queryRawUnsafe('SELECT 1 AS waited FROM pg_sleep(0.05)');
        const payments = {
          ...tx.pharmacyPurchasePayment,
          create: async (args: any) => {
            await tx.$queryRawUnsafe('SELECT 1 AS waited FROM pg_sleep(0.05)');
            return tx.pharmacyPurchasePayment.create(args);
          },
        };
        return run(new Proxy(tx, { get: (target, key) => key === 'pharmacyPurchasePayment' ? payments : Reflect.get(target, key) }));
      }, options),
    } as any);
    const result = await delayed.reallocatePayment(payment.id, {
      ...correction(payment), allocations: [{ purchaseInvoiceId: b.id, amount: 100 }],
    }, branchId, userId);
    const effectiveAt = result.original.reversedAt.getTime();
    for (const [offset, expected] of [
      [-1, { [a.id]: 0, [b.id]: 100 }],
      [0, { [a.id]: 100, [b.id]: 0 }],
      [1, { [a.id]: 100, [b.id]: 0 }],
    ] as const) {
      const report = await service.getDistributorLedger(branchId, gstin, new Date(effectiveAt + offset));
      expect(Object.fromEntries(report.invoices.map(row => [row.id, row.outstanding]))).toEqual(expected);
      expect(report.invoices.reduce((sum, row) => sum + row.paid, 0)).toBe(100);
      expect(report.runningLedger.at(-1)!.runningBalance).toBe(100);
    }
    expect(result.replacement.createdAt).toEqual(result.original.reversedAt);
    expect(result.replacement.allocations.map((row: any) => row.createdAt)).toEqual([result.original.reversedAt]);
  });

});
