import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { ReportsService } from '../reports.service';
import { BillingService } from '../../billing/billing.service';
import { InvoiceNumbersService } from '../../../shared/numbering/invoice-numbers.service';
import { PharmacyReportsService } from '../../pharmacy/pharmacy-reports.service';
import { PharmacyComplianceService } from '../../pharmacy/pharmacy-compliance.service';
import { ClinicBillRegisterService } from '../../billing/clinic-bill-register.service';

const databaseTests = process.env.REPORTS_TEST_DATABASE_URL ? describe : describe.skip;

/**
 * Issue #190: takings land on the clinic day the money was received, even when the desk keys the
 * payment in days later. Payments here are all entered on 26 Nov (IST); what they say they were
 * received on decides the day.
 */
databaseTests('Clinic takings on the day the money was received, on PostgreSQL', () => {
  const schema = `received_on_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let reports: ReportsService;
  let billing: BillingService;
  let pharmacyReports: PharmacyReportsService;
  let created = false;
  const RANGE = { startDate: '2026-11-24', endDate: '2026-11-26' };
  const ENTERED = new Date('2026-11-26T09:30:00.000Z'); // 26 Nov, 15:00 IST
  const actor = { id: 'desk', branchId: 'A' };
  const viewer = { branchId: 'A', id: 'doc', role: 'DOCTOR' };
  const dayTotals = (r: { dailyBreakdown: { date: string; revenue: number }[] }) => r.dailyBreakdown.map((d) => [d.date, d.revenue]);
  const bill = (id: string, total: number, createdAt = ENTERED) =>
    db.newInvoice.create({ data: { id, invoiceNo: `R-${id}`, patientId: 'p', branchId: 'A', total, balance: total, received: 0, status: 'PENDING',
      createdAt, items: { create: [{ serviceId: 'consult', name: 'Consultation', qty: 1, unitPrice: total, total, gstRate: 0 }] } } });

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
    billing = new BillingService(db as any, new InvoiceNumbersService(db as any));
    pharmacyReports = new PharmacyReportsService(db as any, new PharmacyComplianceService(db as any));

    await db.branch.create({ data: { id: 'A', name: 'Branch A', address: 'Synthetic' } });
    await db.user.create({ data: { id: 'doc', firstName: 'Asha', lastName: 'Rao', email: 'doc@example.test', password: 'x', role: 'DOCTOR', branchId: 'A' } });
    await db.user.create({ data: { id: 'desk', firstName: 'Sunita', lastName: 'Patil', email: 'desk@example.test', password: 'x', role: 'RECEPTION', branchId: 'A' } });
    await db.patient.create({ data: { id: 'p', name: 'Meera Shah', gender: 'F', phone: '9000000001', branchId: 'A' } });
    await db.service.create({ data: { id: 'consult', name: 'Consultation', type: 'Consult', priceMrp: 500, priceNet: 500, branchId: 'A' } });
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('dates a catch-up payment on the day it was received and audits who backdated it', async () => {
    await bill('late', 700);
    const payment = await billing.processPayment({ invoiceId: 'late', amount: 700, method: 'CASH', receivedOn: '2026-11-24' } as any, 'A', actor, ENTERED);
    const stored = await db.newPayment.findUniqueOrThrow({ where: { id: payment.id } });
    // Same clock time, two clinic days back.
    expect(stored.receivedAt.toISOString()).toBe('2026-11-24T09:30:00.000Z');
    const audit = await db.auditLog.findMany({ where: { entity: 'NewPayment', entityId: payment.id } });
    expect(audit.map((a) => [a.action, a.userId, a.branchId])).toEqual([['PAYMENT_BACKDATED', 'desk', 'A']]);
    expect(JSON.parse(audit[0].newValues!)).toMatchObject({ receivedOn: '2026-11-24', enteredOn: '2026-11-26', amount: 700, invoiceNo: 'R-late' });
  });

  it('puts the catch-up payment on 24 Nov in Takings per day and in Daily Collection, not on the day it was typed', async () => {
    const revenue = await reports.generateRevenueReport(RANGE as any, 'A');
    expect([revenue.totalRevenue, dayTotals(revenue)]).toEqual([700, [['2026-11-24', 700]]]);
    const on24 = await pharmacyReports.dailyCollection('2026-11-24', viewer);
    const on26 = await pharmacyReports.dailyCollection('2026-11-26', viewer);
    expect([on24.clinic!.net, on26.clinic!.net]).toEqual([700, 0]);
    const row = on24.sections.find((s: any) => s.id === 'clinic-bills')!.rows[0] as any;
    expect([row.cells.number, row.cells.paidToday]).toEqual(['R-late', 700]);
  });

  it('buckets received times in IST: 00:10 and 23:59 on 24 Nov stay on 24 Nov', async () => {
    await bill('edge', 300);
    await db.newPayment.createMany({ data: [
      { invoiceId: 'edge', amount: 100, mode: 'UPI', reconStatus: 'COMPLETED', createdAt: ENTERED, receivedAt: new Date('2026-11-23T18:40:00.000Z') }, // 24 Nov 00:10 IST
      { invoiceId: 'edge', amount: 150, mode: 'CASH', reconStatus: 'COMPLETED', createdAt: ENTERED, receivedAt: new Date('2026-11-24T18:29:00.000Z') }, // 24 Nov 23:59 IST
      { invoiceId: 'edge', amount: 50, mode: 'CARD', reconStatus: 'COMPLETED', createdAt: ENTERED, receivedAt: new Date('2026-11-24T18:30:00.000Z') }, // 25 Nov 00:00 IST
    ] });
    const revenue = await reports.generateRevenueReport(RANGE as any, 'A');
    expect(dayTotals(revenue)).toEqual([['2026-11-24', 950], ['2026-11-25', 50]]);
    const only24 = await reports.generateRevenueReport({ startDate: '2026-11-24', endDate: '2026-11-24' } as any, 'A');
    expect(only24.totalRevenue).toBe(950);
    expect((await pharmacyReports.dailyCollection('2026-11-24', viewer)).clinic!.net).toBe(950);
    expect((await pharmacyReports.dailyCollection('2026-11-25', viewer)).clinic!.net).toBe(50);
  });

  it('agrees across every report that totals clinic money for a day or range', async () => {
    const DAY = { startDate: '2026-11-24', endDate: '2026-11-24' };
    const payments = await reports.generatePaymentReport(DAY as any, 'A');
    const dashboard = await reports.generateDashboard({ date: '2026-11-24' } as any, 'A');
    const summary = await billing.getPaymentSummary(DAY, 'A');
    const billingRevenue = await billing.getRevenueReport({ ...DAY, groupBy: 'day' }, 'A');
    const listed = await billing.findAllPayments(DAY as any, 'A');
    expect([payments.totalAmount, dashboard.todayRevenue, summary.totalAmount, billingRevenue.summary.totalRevenue, listed.pagination.total])
      .toEqual([950, 950, 950, 950, 3]);
    expect(payments.dailyTrends.map((d) => [d.date, d.totalAmount])).toEqual([['2026-11-24', 950]]);
    const receipt = await new ClinicBillRegisterService(db as any).receipt('late', 'A');
    expect(receipt.payments.map((p: any) => p.paidAt)).toEqual(['2026-11-24T09:30:00.000Z']);
  });

  it('refuses a future day, a day more than 30 days back, a non-calendar day and a dated gateway payment, writing nothing', async () => {
    await bill('refused', 400);
    const attempt = (dto: Record<string, unknown>) =>
      billing.processPayment({ invoiceId: 'refused', amount: 100, method: 'CASH', ...dto } as any, 'A', actor, ENTERED).then(() => 'saved', (e: Error) => e.message);
    expect(await attempt({ receivedOn: '2026-11-27' })).toMatch(/cannot be a future day/);
    expect(await attempt({ receivedOn: '2026-10-26' })).toMatch(/up to 30 days back/);
    expect(await attempt({ receivedOn: '2026-02-30' })).toMatch(/real calendar day/);
    expect(await attempt({ receivedOn: '2026-11-25', gateway: 'razorpay' })).toMatch(/gateway/i);
    expect(await db.newPayment.count({ where: { invoiceId: 'refused' } })).toBe(0);
    expect((await db.newInvoice.findUniqueOrThrow({ where: { id: 'refused' } })).received).toBe(0);
    // 30 days back is the oldest allowed, and today needs no audit entry.
    expect(await attempt({ receivedOn: '2026-10-27' })).toBe('saved');
    const todays = await billing.processPayment({ invoiceId: 'refused', amount: 100, method: 'CASH', receivedOn: '2026-11-26' } as any, 'A', actor, ENTERED);
    expect((await db.newPayment.findUniqueOrThrow({ where: { id: todays.id } })).receivedAt.getTime()).toBeGreaterThanOrEqual(ENTERED.getTime());
    expect(await db.auditLog.count({ where: { entityId: todays.id } })).toBe(0);
  });

  it('dates a refund on the day it is handed back, whatever day its payment was received', async () => {
    const original = await db.newPayment.findFirstOrThrow({ where: { invoiceId: 'late' } });
    const before = new Date();
    const refund = await billing.processRefund({ paymentId: original.id, amount: 200, notes: 'overcharged' } as any, 'A');
    const stored = await db.newPayment.findUniqueOrThrow({ where: { id: refund.id } });
    expect(stored.receivedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    // The refund is handed back today (after the range); the range keeps what was received in it.
    const revenue = await reports.generateRevenueReport(RANGE as any, 'A');
    expect(dayTotals(revenue)).toEqual([['2026-11-24', 950], ['2026-11-25', 50], ['2026-11-26', 100]]);
  });
});
