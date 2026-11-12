import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { ReportsService } from '../reports.service';
import { BillingService } from '../../billing/billing.service';
import { InvoiceNumbersService } from '../../../shared/numbering/invoice-numbers.service';
import { PharmacyReportsService } from '../../pharmacy/pharmacy-reports.service';
import { PharmacyComplianceService } from '../../pharmacy/pharmacy-compliance.service';

const databaseTests = process.env.REPORTS_TEST_DATABASE_URL ? describe : describe.skip;

/** A date-only report range is whole clinic days in Asia/Kolkata, so every report agrees with Daily Collection. */
databaseTests('Report date ranges in clinic days on PostgreSQL', () => {
  const schema = `report_day_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let reports: ReportsService;
  let billing: BillingService;
  let pharmacyReports: PharmacyReportsService;
  let created = false;
  const DAY = { startDate: '2026-11-11', endDate: '2026-11-11' };

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
    await db.patient.create({ data: { id: 'p', name: 'Meera Shah', gender: 'F', phone: '9000000001', branchId: 'A' } });
    await db.service.create({ data: { id: 'consult', name: 'Consultation', type: 'Consult', priceMrp: 500, priceNet: 500, branchId: 'A' } });
    await db.newInvoice.create({ data: { id: 'i1', invoiceNo: 'D-1', patientId: 'p', branchId: 'A', total: 5230, balance: 0, received: 5230,
      createdAt: new Date('2026-11-10T18:35:00.000Z'), items: { create: [{ serviceId: 'consult', name: 'Consultation', qty: 1, unitPrice: 5230, total: 5230, gstRate: 0 }] } } });
    await db.newPayment.createMany({ data: [
      { invoiceId: 'i1', amount: 1000, mode: 'CASH', reconStatus: 'COMPLETED', createdAt: new Date('2026-11-11T04:30:00.000Z') },
      { invoiceId: 'i1', amount: 200, mode: 'UPI', reconStatus: 'COMPLETED', createdAt: new Date('2026-11-11T18:29:00.000Z') },
      { invoiceId: 'i1', amount: 4000, mode: 'CASH', reconStatus: 'COMPLETED', createdAt: new Date('2026-11-11T18:30:00.000Z') },
      { invoiceId: 'i1', amount: 30, mode: 'CARD', reconStatus: 'COMPLETED', createdAt: new Date('2026-11-10T18:40:00.000Z') },
    ] });
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('counts 00:10, 10:00 and 23:59 IST on 11 Nov and leaves 00:00 IST on 12 Nov to the next day', async () => {
    const revenue = await reports.generateRevenueReport({ ...DAY, includePaymentBreakdown: true } as any, 'A');
    expect([revenue.totalRevenue, revenue.period]).toEqual([1230, '2026-11-11 to 2026-11-11']);
    expect(revenue.paymentBreakdown.map((m) => [m.mode, m.amount]).sort()).toEqual([['CARD', 30], ['CASH', 1000], ['UPI', 200]]);
    expect(revenue.dailyBreakdown.map((d) => [d.date, d.revenue, d.invoiceCount])).toEqual([['2026-11-11', 1230, 3]]);
    const next = await reports.generateRevenueReport({ startDate: '2026-11-12', endDate: '2026-11-12' } as any, 'A');
    expect([next.totalRevenue, next.dailyBreakdown.map((d) => [d.date, d.revenue])]).toEqual([4000, [['2026-11-12', 4000]]]);
  });

  it('gives the same 11 Nov total in every report that takes dates, and in Daily Collection', async () => {
    const payments = await reports.generatePaymentReport(DAY as any, 'A');
    const dashboard = await reports.generateDashboard({ date: '2026-11-11' } as any, 'A');
    const summary = await billing.getPaymentSummary(DAY, 'A');
    const billingRevenue = await billing.getRevenueReport({ ...DAY, groupBy: 'day' }, 'A');
    const listed = await billing.findAllPayments(DAY as any, 'A');
    const collection = await pharmacyReports.dailyCollection('2026-11-11', { branchId: 'A', id: 'doc', role: 'DOCTOR' });
    expect([payments.totalAmount, dashboard.todayRevenue, summary.totalAmount, billingRevenue.summary.totalRevenue, listed.pagination.total, collection.clinic!.net])
      .toEqual([1230, 1230, 1230, 1230, 3, 1230]);
    expect(payments.dailyTrends.map((d) => [d.date, d.paymentCount, d.totalAmount])).toEqual([['2026-11-11', 3, 1230]]);
    expect(billingRevenue.report.map((r: any) => [r.period, r.revenue, r.transactions])).toEqual([['2026-11-11', 1230, 3]]);
  });

  it('starts a report at 00:00 IST on its first day', async () => {
    const twoDays = await reports.generateRevenueReport({ startDate: '2026-11-11', endDate: '2026-11-12' } as any, 'A');
    expect([twoDays.totalRevenue, twoDays.dailyBreakdown.map((d) => [d.date, d.revenue])]).toEqual([5230, [['2026-11-11', 1230], ['2026-11-12', 4000]]]);
    const dayBefore = await reports.generateRevenueReport({ startDate: '2026-11-10', endDate: '2026-11-10' } as any, 'A');
    expect(dayBefore.totalRevenue).toBe(0);
  });
});
