import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { ReportsService } from '../reports.service';
import { VOID } from '../../billing/clinic-bill-register';

const databaseTests = process.env.REPORTS_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('System alert counts over more rows than the list cap on PostgreSQL', () => {
  const schema = `reports_alerts_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let reports: ReportsService;
  let created = false;
  const DAY = 86_400_000;

  beforeAll(async () => {
    const url = new URL(process.env.REPORTS_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')],
      { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url.toString() } });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    reports = new ReportsService(db as any);

    for (const id of ['A', 'B']) await db.branch.create({ data: { id, name: `Branch ${id}`, address: 'Synthetic' } });
    await db.user.create({ data: { id: 'doc', firstName: 'Dr', lastName: 'Doc', email: 'doc@example.test', password: 'x', role: 'DOCTOR', branchId: 'A' } });
    await db.user.create({ data: { id: 'pharm', firstName: 'Ph', lastName: 'Arm', email: 'pharm@example.test', password: 'x', role: 'PHARMACIST', branchId: 'A' } });
    await db.patient.create({ data: { id: 'p', name: 'Synthetic P', gender: 'F', phone: '9000000001', branchId: 'A' } });
    await db.patient.create({ data: { id: 'q', name: 'Synthetic Q', gender: 'M', phone: '9000000002', branchId: 'B' } });

    // Bills as the app stores them, where only void is a stored status. Branch A: 12 unpaid past due; settled, void, not yet due, undated and other-branch bills must not count.
    const invoice = (id: string, branchId: string, patientId: string, dueInDays: number | null = -1, more = {}) =>
      db.newInvoice.create({ data: { id, invoiceNo: id, patientId, branchId, total: 100, balance: 100, dueDate: dueInDays === null ? null : new Date(Date.now() + dueInDays * DAY), ...more } });
    for (let i = 0; i < 12; i++) await invoice(`od-${i}`, 'A', 'p');
    for (const [id, dueInDays, more] of [['paid', -1, { balance: 0 }], ['void', -1, { status: VOID }], ['not-due', 3, {}], ['undated', null, {}]] as const) await invoice(id, 'A', 'p', dueInDays, more);
    await invoice('od-b', 'B', 'q');
    // 12 pending payments on branch A invoices, one on branch B, one already completed.
    for (let i = 0; i < 12; i++) await db.newPayment.create({ data: { invoiceId: `od-${i}`, amount: 10, mode: 'CASH', reconStatus: 'PENDING' } });
    await db.newPayment.create({ data: { invoiceId: 'od-b', amount: 10, mode: 'CASH', reconStatus: 'PENDING' } });
    await db.newPayment.create({ data: { invoiceId: 'paid', amount: 10, mode: 'CASH', reconStatus: 'COMPLETED' } });

    // 12 items expiring within 30 days in branch A; one expired, one far off, one in branch B.
    const item = (id: string, branchId: string, expiresInDays: number) =>
      db.inventoryItem.create({ data: { id, branchId, name: id, type: 'MEDICINE', costPrice: 1, sellingPrice: 2, unit: 'PIECES', currentStock: 5, expiryDate: new Date(Date.now() + expiresInDays * DAY) } });
    for (let i = 0; i < 12; i++) await item(`exp-${i}`, 'A', 5 + i);
    await item('expired', 'A', -3);
    await item('far', 'A', 90);
    await item('exp-b', 'B', 5);
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('counts every matching row while capping each list at ten', async () => {
    const alerts = await reports.getSystemAlerts('A', { id: 'doc', role: 'DOCTOR' });

    expect(alerts.counts).toMatchObject({ overdueInvoices: 12, expiryAlerts: 12, pendingPayments: 12 });
    expect(alerts.overdueInvoices).toHaveLength(10);
    expect(alerts.expiryAlerts).toHaveLength(10);
    expect(alerts.pendingPayments).toHaveLength(10);
  });

  it('reports zero counts for sections the viewer may not read', async () => {
    const alerts = await reports.getSystemAlerts('A', { id: 'pharm', role: 'PHARMACIST' });

    expect(alerts.counts).toMatchObject({ overdueInvoices: 0, expiryAlerts: 12, pendingPayments: 0 });
    expect(alerts.overdueInvoices).toEqual([]);
    expect(alerts.pendingPayments).toEqual([]);
  });
});
