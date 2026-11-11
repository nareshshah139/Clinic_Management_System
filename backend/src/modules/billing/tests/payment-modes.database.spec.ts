import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { BillingService } from '../billing.service';
import { InvoiceNumbersService } from '../../../shared/numbering/invoice-numbers.service';
import { ReportsService } from '../../reports/reports.service';
import { PharmacyReportsService } from '../../pharmacy/pharmacy-reports.service';
import { PharmacyComplianceService } from '../../pharmacy/pharmacy-compliance.service';
import { clinicDay } from '../../pharmacy/clinic-day';

const databaseTests = process.env.BILLING_TEST_DATABASE_URL ? describe : describe.skip;

/** Bank transfers and cheques are taken at the desk like cash: stored, completed and counted under their own mode. */
databaseTests('Net banking and cheque payments on PostgreSQL', () => {
  const schema = `payment_modes_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let billing: BillingService;
  let reports: ReportsService;
  let pharmacyReports: PharmacyReportsService;
  let created = false;

  beforeAll(async () => {
    const url = new URL(process.env.BILLING_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')],
      { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url.toString() } });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    await db.branch.create({ data: { id: 'branch', name: 'Branch', address: 'Synthetic' } });
    await db.patient.create({ data: { id: 'patient', name: 'Meera Shah', gender: 'F', phone: '9000000000', branchId: 'branch' } });
    await db.user.create({ data: { id: 'doc', firstName: 'Asha', lastName: 'Rao', email: 'doc@example.test', password: 'x', role: 'DOCTOR', branchId: 'branch' } });
    billing = new BillingService(db as any, new InvoiceNumbersService(db as any));
    reports = new ReportsService(db as any);
    pharmacyReports = new PharmacyReportsService(db as any, new PharmacyComplianceService(db as any));
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  const bill = (fee: number) =>
    billing.createInvoice({ patientId: 'patient', items: [{ name: 'Consultation', quantity: 1, unitPrice: fee, gstRate: 0, discount: 0 }] } as any, 'branch');

  it('stores each desk mode as a completed payment with its reference, and counts it under that mode everywhere', async () => {
    const cash = await bill(300);
    const transfer = await bill(800);
    const cheque = await bill(500);
    await billing.processPayment({ invoiceId: cash.id, amount: 300, method: 'CASH' } as any, 'branch');
    await billing.processPayment({ invoiceId: transfer.id, amount: 800, method: 'NET_BANKING', reference: 'UTR 4521' } as any, 'branch');
    const paidByCheque = await billing.processPayment({ invoiceId: cheque.id, amount: 500, method: 'CHEQUE', reference: '004512' } as any, 'branch');
    await billing.processRefund({ paymentId: paidByCheque.id, amount: 100, notes: 'cheque short' } as any, 'branch');

    const stored = await db.newPayment.findMany({ orderBy: { createdAt: 'asc' }, select: { mode: true, amount: true, reconStatus: true, reference: true } });
    expect(stored.map((p) => [p.mode, p.amount, p.reconStatus, p.reference])).toEqual([
      ['CASH', 300, 'COMPLETED', null],
      ['NET_BANKING', 800, 'COMPLETED', 'UTR 4521'],
      ['CHEQUE', 500, 'COMPLETED', '004512'],
      ['CHEQUE', -100, 'COMPLETED', 'REFUND: cheque short'],
    ]);
    const balances = await db.newInvoice.findMany({ where: { id: { in: [transfer.id, cheque.id] } }, orderBy: { total: 'desc' }, select: { received: true, balance: true } });
    expect(balances.map((b) => [b.received, b.balance])).toEqual([[800, 0], [400, 100]]);

    const day = clinicDay(new Date());
    const collection = await pharmacyReports.dailyCollection(day, { branchId: 'branch', id: 'doc', role: 'DOCTOR' });
    expect(collection.clinic!.modes.map((m) => [m.label, m.received, m.refunds, m.net])).toEqual([
      ['Cash', 300, 0, 300],
      ['UPI', 0, 0, 0],
      ['Card', 0, 0, 0],
      ['Net banking / NEFT', 800, 0, 800],
      ['Cheque', 500, 100, 400],
    ]);
    const revenue = await reports.generateRevenueReport({ startDate: day, endDate: day, includePaymentBreakdown: true } as any, 'branch');
    const summary = await billing.getPaymentSummary({ startDate: day, endDate: day }, 'branch');
    const byMode = (rows: [string, number][]) => rows.sort(([a], [b]) => a.localeCompare(b));
    expect([revenue.totalRevenue, summary.totalAmount, collection.clinic!.net]).toEqual([1500, 1500, 1500]);
    expect(byMode(revenue.paymentBreakdown.map((m) => [m.mode, m.amount]))).toEqual([['CASH', 300], ['CHEQUE', 400], ['NET_BANKING', 800]]);
    expect(byMode(summary.methodBreakdown.map((m) => [m.method, m.amount]))).toEqual([['CASH', 300], ['CHEQUE', 400], ['NET_BANKING', 800]]);
    const payments = await reports.generatePaymentReport({ startDate: day, endDate: day, paymentMode: 'CHEQUE', includeRefunds: true } as any, 'branch');
    expect([payments.totalAmount, payments.refundSummary.totalRefundAmount, payments.refundSummary.refundReasons.map((r) => r.reason)]).toEqual([400, 100, ['cheque short']]);
  });
});
