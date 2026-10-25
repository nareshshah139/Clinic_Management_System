import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../../../shared/database/prisma.service';
import { localDatabase } from '../../../shared/testing/local-database';
import {
  bindPurchaseImport,
  claimPurchaseImport,
  preparePurchaseWrite,
  PurchaseImportRecovery,
} from '../purchase-import-recovery';

const databaseTests = process.env.PURCHASE_DELEGATION_TEST_DATABASE_URL ? describe : describe.skip;

/**
 * @cc [owner:nareshshah139,label:testing] delegated-recovery-database-witness
 * The regression suite MUST exercise persisted recovery fences and competing workers in its own
 * disposable loopback schema. Recovery MUST retain the original owner and leave stock unchanged.
 */
function delegatedRecoveryDatabaseTests() {
  let database: Awaited<ReturnType<typeof localDatabase>>;
  let prisma: PrismaClient;
  let recovery: PurchaseImportRecovery;
  let branchId: string;
  let originalUserId: string;
  let recoveringUserId: string;
  let foreignBranchId: string;
  let foreignUserId: string;
  let inventoryItemId: string;
  let orphanSourceId: string;
  const orphanAttemptId = randomUUID();
  const orphanInvoiceId = `missing-${randomUUID()}`;
  const reason = 'Original operator cannot finish this interrupted import';

  const fence = (id: string, userId = originalUserId) => ({ id, branchId, userId });
  const actor = () => ({ branchId, userId: recoveringUserId });
  const input = (attemptId: string) => ({ attemptId, originalActorId: originalUserId, reason });
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    return { promise, resolve };
  };
  const createUser = (targetBranchId: string, isActive = true) => prisma.user.create({ data: {
    firstName: 'Synthetic', lastName: 'Recovery', email: `${randomUUID()}@example.invalid`,
    password: 'no-login-test-only', role: 'ADMIN', branchId: targetBranchId, isActive,
    status: isActive ? 'ACTIVE' : 'INACTIVE',
  } });
  const createInvoice = (tx: Prisma.TransactionClient, id = randomUUID()) => tx.pharmacyPurchaseInvoice.create({ data: {
    id, branchId, createdBy: originalUserId, distributorName: 'Synthetic Supplier',
    distributorGstin: '36ABCDE1234F1Z5', distributorDlNo: 'SYNTHETIC', invoiceNumber: randomUUID(),
    invoiceDate: new Date('2026-01-01T00:00:00.000Z'), billType: 'CASH', doctorNameOrRegNo: 'Synthetic Clinic',
    grossAmount: 100, taxableAmount: 100, totalGst: 0, netPayable: 100,
  } });
  const createRunning = (id = randomUUID(), userId = originalUserId) => prisma.pharmacyPurchaseImportAttempt.create({
    data: { ...fence(id, userId), status: 'RUNNING' },
  });
  const savedAttempt = (id: string) => prisma.pharmacyPurchaseImportAttempt.findUniqueOrThrow({ where: { id } });
  const audits = (id: string) => prisma.auditLog.findMany({ where: { entity: 'PharmacyPurchaseImportAttempt', entityId: id } });

  beforeAll(async () => {
    database = await localDatabase(process.env.PURCHASE_DELEGATION_TEST_DATABASE_URL!);
    prisma = database.prisma;
    await prisma.$executeRawUnsafe('DROP TABLE "pharmacy_purchase_import_attempts"');
    const attemptMigration = readFileSync(path.resolve('prisma/migrations/20261024120000_purchase_import_recovery/migration.sql'), 'utf8');
    for (const sql of attemptMigration.split(';').filter(statement => statement.trim())) await prisma.$executeRawUnsafe(sql);
    branchId = (await prisma.branch.create({ data: { name: 'Synthetic Recovery', address: 'Synthetic' } })).id;
    foreignBranchId = (await prisma.branch.create({ data: { name: 'Synthetic Other Branch', address: 'Synthetic' } })).id;
    originalUserId = (await createUser(branchId)).id;
    recoveringUserId = (await createUser(branchId)).id;
    foreignUserId = (await createUser(foreignBranchId)).id;
    inventoryItemId = (await prisma.inventoryItem.create({ data: {
      branchId, name: 'Synthetic stock sentinel', type: 'SUPPLY', costPrice: 1, sellingPrice: 1,
      unit: 'PIECES', currentStock: 7, heldStock: 2,
    } })).id;
    orphanSourceId = (await prisma.pharmacyPurchaseInvoiceDocument.create({ data: {
      branchId, uploadedBy: originalUserId, fileName: 'synthetic-original.txt', mimeType: 'text/plain',
      sizeBytes: 8, sha256: randomUUID(), data: Buffer.from('retained'),
    } })).id;
    await prisma.pharmacyPurchaseImportAttempt.create({ data: {
      ...fence(orphanAttemptId), status: 'INVOICE_SAVED', purchaseInvoiceId: orphanInvoiceId,
      result: { sourceDocumentIds: [orphanSourceId] },
    } });
    const recoveryMigration = readFileSync(path.resolve('prisma/migrations/20261024150000_unlinked_purchase_recovery/migration.sql'), 'utf8');
    for (const sql of recoveryMigration.split('-- statement-breakpoint').filter(statement => statement.trim())) await prisma.$executeRawUnsafe(sql);
    recovery = new PurchaseImportRecovery(prisma as PrismaService);
  }, 60000);

  afterEach(async () => {
    if (!prisma) return;
    expect(await prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId },
      select: { currentStock: true, heldStock: true } })).toEqual({ currentStock: 7, heldStock: 2 });
    expect(await prisma.stockMovement.count()).toBe(0);
    expect(await prisma.stockTransaction.count()).toBe(0);
  });

  afterAll(async () => { await database?.cleanup(); });

  it('fences a running import without transferring ownership and attributes the audit to the recovering actor', async () => {
    const attempt = await createRunning();
    const result = await recovery.recoverDelegated(actor(), input(attempt.id));
    expect(result).toMatchObject({ attemptId: attempt.id, outcome: 'NO_STOCK_WRITTEN', invoiceId: null });
    expect(await savedAttempt(attempt.id)).toMatchObject({ userId: originalUserId, branchId, status: 'NO_STOCK_WRITTEN', purchaseInvoiceId: null });
    const records = await audits(attempt.id);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ userId: recoveringUserId, action: 'DELEGATED_RECOVERY' });
    expect(JSON.parse(records[0].newValues!)).toMatchObject({ originalActorId: originalUserId,
      originalActorAttribution: 'persisted', recoveredBy: recoveringUserId, stockEffect: 0,
      outcome: 'NO_STOCK_WRITTEN', priorStatus: 'RUNNING', reason });
    await expect(recovery.read(fence(attempt.id, recoveringUserId))).rejects.toThrow('Import attempt not found');
    expect(await prisma.pharmacyPurchaseInvoice.count()).toBe(0);
  });

  it('creates an original-owner tombstone before a delayed request can register its worker', async () => {
    const id = randomUUID();
    expect(await recovery.recoverDelegated(actor(), input(id))).toMatchObject({ outcome: 'NO_STOCK_WRITTEN', invoiceId: null });
    const worker = jest.fn(async () => ({ unexpected: true }));
    expect(await recovery.execute(fence(id), 'delayed-request', worker)).toMatchObject({ importAttempt: { outcome: 'NO_STOCK_WRITTEN' } });
    expect(worker).not.toHaveBeenCalled();
    expect(await savedAttempt(id)).toMatchObject({ userId: originalUserId, status: 'NO_STOCK_WRITTEN', purchaseInvoiceId: null });
    const records = await audits(id);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ userId: recoveringUserId, action: 'DELEGATED_RECOVERY' });
    expect(JSON.parse(records[0].newValues!)).toMatchObject({ originalActorId: originalUserId,
      originalActorAttribution: 'supplied', priorStatus: 'ABSENT', stockEffect: 0 });
  });

  it('returns the exact invoice when the worker holds the save lock before recovery', async () => {
    const attempt = await createRunning();
    const bound = deferred();
    const release = deferred();
    const invoiceId = randomUUID();
    const worker = prisma.$transaction(async tx => {
      await preparePurchaseWrite(tx, branchId);
      await claimPurchaseImport(tx, fence(attempt.id));
      await createInvoice(tx, invoiceId);
      await bindPurchaseImport(tx, fence(attempt.id), invoiceId);
      bound.resolve();
      await release.promise;
    }, { timeout: 15000 });
    await bound.promise;
    let recovering: ReturnType<PurchaseImportRecovery['recoverDelegated']>;
    try {
      recovering = recovery.recoverDelegated(actor(), input(attempt.id));
    } finally {
      release.resolve();
    }
    await worker;
    expect(await recovering!).toMatchObject({ attemptId: attempt.id, outcome: 'DRAFT_SAVED', invoiceId });
    expect(await savedAttempt(attempt.id)).toMatchObject({ userId: originalUserId, status: 'INVOICE_SAVED', purchaseInvoiceId: invoiceId });
    expect(await prisma.pharmacyPurchaseInvoice.count({ where: { id: invoiceId } })).toBe(1);
    const terminal = await savedAttempt(attempt.id);
    const records = await audits(attempt.id);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ userId: recoveringUserId, action: 'DELEGATED_RECOVERY' });
    expect(await recovery.recoverDelegated(actor(), { ...input(attempt.id), reason: 'Repeat exact invoice recovery' }))
      .toMatchObject({ outcome: 'DRAFT_SAVED', invoiceId });
    expect(await savedAttempt(attempt.id)).toEqual(terminal);
    expect(await audits(attempt.id)).toEqual(records);
  });

  it('prevents a delayed worker from claiming or binding an invoice after recovery wins', async () => {
    const id = randomUUID();
    const started = deferred();
    const release = deferred();
    const invoiceId = randomUUID();
    const worker = recovery.execute(fence(id), 'slow-extraction', async () => {
      started.resolve();
      await release.promise;
      return prisma.$transaction(async tx => {
        await preparePurchaseWrite(tx, branchId);
        await claimPurchaseImport(tx, fence(id));
        const invoice = await createInvoice(tx, invoiceId);
        await bindPurchaseImport(tx, fence(id), invoiceId);
        return { invoice };
      });
    });
    await started.promise;
    try {
      expect(await recovery.recoverDelegated(actor(), input(id))).toMatchObject({ outcome: 'NO_STOCK_WRITTEN', invoiceId: null });
    } finally {
      release.resolve();
    }
    expect(await worker).toMatchObject({ importAttempt: { outcome: 'NO_STOCK_WRITTEN', invoiceId: null } });
    expect(await prisma.pharmacyPurchaseInvoice.findUnique({ where: { id: invoiceId } })).toBeNull();
    expect(await savedAttempt(id)).toMatchObject({ userId: originalUserId, status: 'NO_STOCK_WRITTEN', purchaseInvoiceId: null });
  });

  it('converges concurrent recovery requests to one stable terminal result', async () => {
    const attempt = await createRunning();
    const results = await Promise.all(Array.from({ length: 6 }, () => recovery.recoverDelegated(actor(), input(attempt.id))));
    for (const result of results) expect(result).toMatchObject({ attemptId: attempt.id, outcome: 'NO_STOCK_WRITTEN', invoiceId: null });
    expect(await savedAttempt(attempt.id)).toMatchObject({ userId: originalUserId, status: 'NO_STOCK_WRITTEN' });
    expect(await recovery.read(fence(attempt.id))).toMatchObject({ outcome: 'NO_STOCK_WRITTEN', invoiceId: null });
    const records = await audits(attempt.id);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ userId: recoveringUserId, action: 'DELEGATED_RECOVERY' });
    const terminal = await savedAttempt(attempt.id);
    await recovery.recoverDelegated(actor(), { ...input(attempt.id), reason: 'Repeated recovery must retain the first evidence' });
    expect(await savedAttempt(attempt.id)).toEqual(terminal);
    expect(await audits(attempt.id)).toEqual(records);
  });

  it('rolls back the fence when its recovery audit cannot be persisted', async () => {
    const attempt = await createRunning();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION reject_recovery_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."entityId" = '${attempt.id}' THEN RAISE EXCEPTION 'synthetic audit unavailable'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER reject_recovery_audit BEFORE INSERT ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION reject_recovery_audit()');
    try {
      await expect(recovery.recoverDelegated(actor(), input(attempt.id))).rejects.toThrow('synthetic audit unavailable');
      expect(await savedAttempt(attempt.id)).toMatchObject({ userId: originalUserId, status: 'RUNNING', purchaseInvoiceId: null });
      expect(await audits(attempt.id)).toEqual([]);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER reject_recovery_audit ON "audit_logs"');
      await prisma.$executeRawUnsafe('DROP FUNCTION reject_recovery_audit()');
    }
  });

  it('rejects a foreign branch and a mismatched supplied owner without modifying the attempt', async () => {
    const attempt = await createRunning();
    await expect(recovery.recoverDelegated({ branchId: foreignBranchId, userId: foreignUserId }, input(attempt.id))).rejects.toThrow('Import attempt not found');
    await expect(recovery.recoverDelegated(actor(), { ...input(attempt.id), originalActorId: recoveringUserId })).rejects.toThrow('The original operator does not match this import attempt');
    expect(await savedAttempt(attempt.id)).toEqual(attempt);
    expect(await audits(attempt.id)).toEqual([]);
    const absent = randomUUID();
    await expect(recovery.recoverDelegated(actor(), { ...input(absent), originalActorId: foreignUserId })).rejects.toThrow('Original operator not found in this branch');
    expect(await prisma.pharmacyPurchaseImportAttempt.findUnique({ where: { id: absent } })).toBeNull();
  });

  it('can recover an inactive original operator without changing that operator or ownership', async () => {
    const inactive = await createUser(branchId, false);
    const attempt = await createRunning(randomUUID(), inactive.id);
    expect(await recovery.recoverDelegated(actor(), { ...input(attempt.id), originalActorId: inactive.id })).toMatchObject({ outcome: 'NO_STOCK_WRITTEN' });
    expect(await savedAttempt(attempt.id)).toMatchObject({ userId: inactive.id, status: 'NO_STOCK_WRITTEN' });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: inactive.id } })).toEqual(inactive);
    expect((await audits(attempt.id))[0].userId).toBe(recoveringUserId);
  });

  it('rejects missing linked invoices as unverified and fences the retained originals', async () => {
    const result = await recovery.recoverDelegated(actor(), input(orphanAttemptId));
    expect(result).toMatchObject({ attemptId: orphanAttemptId, outcome: 'RETRY_REJECTED', invoiceId: orphanInvoiceId, stockOutcome: 'UNVERIFIED',
      retained: { rejectedSourceDocumentIds: [orphanSourceId], historicalInvoiceIds: [orphanInvoiceId], stockOutcome: 'UNVERIFIED' } });
    expect(await savedAttempt(orphanAttemptId)).toMatchObject({ userId: originalUserId, status: 'RETRY_REJECTED', purchaseInvoiceId: orphanInvoiceId });
    expect((await audits(orphanAttemptId))[0].userId).toBe(recoveringUserId);
    const invoice = await prisma.$transaction(async tx => {
      await preparePurchaseWrite(tx, branchId);
      return createInvoice(tx);
    });
    await expect(prisma.pharmacyPurchaseInvoiceDocument.update({ where: { id: orphanSourceId }, data: { purchaseInvoiceId: invoice.id } })).rejects.toThrow('Original belongs to a rejected uncertain import');
    expect(await prisma.pharmacyPurchaseInvoiceDocument.findUniqueOrThrow({ where: { id: orphanSourceId },
      select: { purchaseInvoiceId: true, data: true } })).toEqual({ purchaseInvoiceId: null, data: Buffer.from('retained') });
    await expect(prisma.$transaction(async tx => {
      await preparePurchaseWrite(tx, branchId);
      return createInvoice(tx, orphanInvoiceId);
    })).rejects.toThrow('Uncertain receipt was rejected for further intake');
    expect(await prisma.pharmacyPurchaseInvoice.findUnique({ where: { id: orphanInvoiceId } })).toBeNull();
  });
}

databaseTests('Delegated purchase import recovery with real PostgreSQL', delegatedRecoveryDatabaseTests);
