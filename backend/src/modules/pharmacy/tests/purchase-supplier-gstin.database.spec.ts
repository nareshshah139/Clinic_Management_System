import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import * as path from 'path';
import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';
import { PrismaService } from '../../../shared/database/prisma.service';

// Opt-in, local-only PostgreSQL with an isolated schema containing synthetic data.
const databaseTests = process.env.PURCHASE_AUTOMATION_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Supplier GSTIN correction transactions', () => {
  const schema = `gstin_test_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let service: PharmacyPurchaseInvoiceService;
  let supplier: any;
  let invoice: any;
  let branchId: string;
  let schemaCreated = false;
  const oldGstin = '36ABCDE1234F1Z5';
  const newGstin = '36ABCDE1234F2Z5';

  beforeAll(async () => {
    const url = new URL(process.env.PURCHASE_AUTOMATION_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Database tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', path.resolve('prisma/schema.prisma')], {
      env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe',
    });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    service = new PharmacyPurchaseInvoiceService(db as PrismaService);
    branchId = (await db.branch.create({ data: { name: 'Synthetic GSTIN Test', address: 'Synthetic' } })).id;
  }, 60000);

  beforeEach(async () => {
    supplier = await db.supplier.create({ data: { name: `Supplier ${randomUUID()}`, branchId, gstNumber: oldGstin } });
    invoice = await db.pharmacyPurchaseInvoice.create({ data: {
      branchId, supplierId: supplier.id, distributorName: supplier.name, distributorGstin: oldGstin, distributorDlNo: 'SYNTHETIC',
      invoiceNumber: randomUUID(), invoiceDate: new Date('2026-01-01'), doctorNameOrRegNo: 'Synthetic', billType: 'CASH',
      grossAmount: 100, taxableAmount: 100, totalGst: 0, netPayable: 100, status: 'RECONCILIATION_FAILED',
    } });
  });
  afterEach(async () => {
    await db?.pharmacyPurchaseInvoice.deleteMany();
    await db?.supplier.deleteMany();
    await db?.auditLog.deleteMany();
  });
  afterAll(async () => {
    await db?.$disconnect();
    if (schemaCreated) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });
  const correct = (gstNumber = newGstin) => service.correctPurchaseSupplierGstin(supplier.id, {
    gstNumber, expectedGstNumber: oldGstin, expectedUpdatedAt: supplier.updatedAt.toISOString(), reason: 'Original checked', verified: true,
  }, branchId, 'synthetic-staff');

  it('persists one correction under concurrent retries and leaves the historical invoice unchanged', async () => {
    const results = await Promise.all([correct(), correct()]);
    expect(results.every(result => result.gstNumber === newGstin)).toBe(true);
    expect(await db.pharmacyPurchaseInvoice.findUnique({ where: { id: invoice.id } })).toEqual(invoice);
    const events = await db.auditLog.findMany({ where: { entityId: supplier.id, action: 'GSTIN_CORRECTED' } });
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].oldValues!)).toMatchObject({ gstNumber: oldGstin });
    expect(JSON.parse(events[0].newValues!)).toMatchObject({ gstNumber: newGstin, reason: 'Original checked' });
  });

  it('rolls back the supplier change when the audit insert fails', async () => {
    await db.$executeRawUnsafe(`ALTER TABLE audit_logs ADD CONSTRAINT synthetic_audit_failure CHECK (action <> 'GSTIN_CORRECTED')`);
    try {
      await expect(correct()).rejects.toThrow();
      expect(await db.supplier.findUnique({ where: { id: supplier.id } })).toEqual(supplier);
      expect(await db.auditLog.count({ where: { entityId: supplier.id } })).toBe(0);
    } finally {
      await db.$executeRawUnsafe('ALTER TABLE audit_logs DROP CONSTRAINT synthetic_audit_failure');
    }
  });

  it('rejects conflicting simultaneous corrections instead of overwriting the first one', async () => {
    const results = await Promise.allSettled([correct(), correct('36ABCDE1234F3Z5')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(await db.auditLog.count({ where: { entityId: supplier.id, action: 'GSTIN_CORRECTED' } })).toBe(1);
  });
});
