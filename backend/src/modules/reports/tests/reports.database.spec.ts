import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { ReportsService } from '../reports.service';

const databaseTests = process.env.REPORTS_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Reports over live billing tables on PostgreSQL', () => {
  const schema = `reports_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let reports: ReportsService;
  let created = false;
  const range = { startDate: new Date(Date.now() - 86_400_000).toISOString(), endDate: new Date(Date.now() + 86_400_000).toISOString() };

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
    for (const id of ['d1', 'd2']) {
      await db.user.create({ data: { id, firstName: 'Dr', lastName: id, email: `${id}@example.test`, password: 'x', role: 'DOCTOR', branchId: 'A' } });
    }
    await db.patient.create({ data: { id: 'p', name: 'Synthetic P', gender: 'F', phone: '9000000001', branchId: 'A' } });
    await db.patient.create({ data: { id: 'q', name: 'Synthetic Q', gender: 'M', phone: '9000000002', branchId: 'B' } });
    await db.service.create({ data: { id: 'consult', name: 'Consultation', type: 'Consult', priceMrp: 1000, priceNet: 1000, branchId: 'A' } });
    await db.service.create({ data: { id: 'laser', name: 'Laser', type: 'Procedure', priceMrp: 1000, priceNet: 1000, branchId: 'A' } });
    await db.visit.create({ data: { id: 'v1', patientId: 'p', doctorId: 'd1', complaints: '[]' } });
    await db.visit.create({ data: { id: 'v2', patientId: 'p', doctorId: 'd2', complaints: '[]' } });

    const line = (serviceId: string, total: number, gstRate: number) => ({ serviceId, name: serviceId, qty: 1, unitPrice: total, total, gstRate });
    // I1: 1000 consult at 18% GST plus 1000 laser exempt, total 2180. Half paid, then 109 refunded.
    await db.newInvoice.create({ data: { id: 'i1', invoiceNo: 'R-1', patientId: 'p', visitId: 'v1', branchId: 'A', total: 2180, balance: 1199, received: 981,
      items: { create: [line('consult', 1000, 18), line('laser', 1000, 0)] } } });
    // I2: 500 consult, exempt, paid in full by UPI, plus a pending card payment.
    await db.newInvoice.create({ data: { id: 'i2', invoiceNo: 'R-2', patientId: 'p', visitId: 'v2', branchId: 'A', total: 500, balance: 0, received: 500,
      items: { create: [line('consult', 500, 0)] } } });
    // I3 belongs to another branch and must never show up.
    await db.newInvoice.create({ data: { id: 'i3', invoiceNo: 'R-3', patientId: 'q', branchId: 'B', total: 999, balance: 0, received: 999,
      items: { create: [line('consult', 999, 0)] } } });
    await db.newPayment.createMany({ data: [
      { invoiceId: 'i1', amount: 1090, mode: 'CASH', reconStatus: 'COMPLETED' },
      { invoiceId: 'i1', amount: -109, mode: 'CASH', reconStatus: 'COMPLETED', reference: 'REFUND: overcharge' },
      { invoiceId: 'i2', amount: 500, mode: 'UPI', reconStatus: 'COMPLETED' },
      { invoiceId: 'i2', amount: 100, mode: 'CARD', reconStatus: 'PENDING' },
      { invoiceId: 'i3', amount: 999, mode: 'CASH', reconStatus: 'COMPLETED' },
    ] });
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('reports collected revenue, GST share, and per-doctor revenue for the branch', async () => {
    const report = await reports.generateRevenueReport({ ...range, includePaymentBreakdown: true } as any, 'A');

    expect(report.totalRevenue).toBe(1481);
    expect(report.totalInvoices).toBe(2);
    // GST is counted on what was collected: 981 of 2180 on I1 carries 981 * 180 / 2180 = 81.
    expect(report.totalGst).toBeCloseTo(81);
    expect(report.netRevenue).toBeCloseTo(1400);
    expect(Object.fromEntries(report.paymentBreakdown.map((b) => [b.mode, b.amount]))).toEqual({ CASH: 981, UPI: 500 });
    expect(Object.fromEntries(report.doctorBreakdown.map((d) => [d.doctorId, d.revenue]))).toEqual({ d1: 981, d2: 500 });
  });

  it('filters revenue by doctor, payment mode, and service type', async () => {
    expect((await reports.generateRevenueReport({ ...range, doctorId: 'd2' } as any, 'A')).totalRevenue).toBe(500);
    expect((await reports.generateRevenueReport({ ...range, paymentMode: 'UPI' } as any, 'A')).totalRevenue).toBe(500);
    expect((await reports.generateRevenueReport({ ...range, serviceType: 'Procedure' } as any, 'A')).totalRevenue).toBe(981);
  });

  it('reports payments, reconciliation, and refunds for the branch', async () => {
    const report = await reports.generatePaymentReport({ ...range, includeReconciliation: true, includeRefunds: true } as any, 'A');

    expect(report.totalPayments).toBe(4);
    expect(report.successfulPayments).toBe(3);
    expect(report.pendingPayments).toBe(1);
    expect(report.refundSummary.totalRefunds).toBe(1);
    expect(report.refundSummary.totalRefundAmount).toBe(109);
    expect(report.refundSummary.refundReasons).toEqual([expect.objectContaining({ reason: 'overcharge', count: 1, amount: 109 })]);
  });

  it('attributes collected revenue to each doctor in the doctor report', async () => {
    const report = await reports.generateDoctorReport({ ...range, includePerformanceMetrics: true } as any, 'A');
    expect(Object.fromEntries(report.doctorMetrics.map((m) => [m.doctorId, m.totalRevenue]))).toEqual({ d1: 981, d2: 500 });
  });

  it('totals each top patient’s collected revenue in the patient report', async () => {
    const report = await reports.generatePatientReport(range as any, 'A');
    expect(report.topVisitingPatients).toEqual([expect.objectContaining({ patientId: 'p', totalRevenue: 1481 })]);
  });
});
