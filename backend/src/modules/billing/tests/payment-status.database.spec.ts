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

/** Money taken at the desk is received the moment it is recorded; a gateway payment only once it is confirmed. */
databaseTests('Clinic payments on PostgreSQL', () => {
  const schema = `payment_status_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let billing: BillingService;
  let revenue: ReportsService;
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
    url.searchParams.set('connection_limit', '5');
    db = new PrismaClient({ datasourceUrl: url.toString() });
    await db.branch.create({ data: { id: 'branch', name: 'Branch', address: 'Synthetic' } });
    await db.patient.create({ data: { id: 'patient', name: 'Meera Shah', gender: 'F', phone: '9000000000', branchId: 'branch' } });
    await db.user.create({ data: { id: 'doc', firstName: 'Asha', lastName: 'Rao', email: 'doc@example.test', password: 'x', role: 'DOCTOR', branchId: 'branch' } });
    billing = new BillingService(db as any, new InvoiceNumbersService(db as any));
    revenue = new ReportsService(db as any);
    pharmacyReports = new PharmacyReportsService(db as any, new PharmacyComplianceService(db as any));
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  const bill = (fee: number) =>
    billing.createInvoice({ patientId: 'patient', items: [{ name: 'Consultation', quantity: 1, unitPrice: fee, gstRate: 0, discount: 0 }] } as any, 'branch');
  const pay = (invoiceId: string, amount: number, extra: object = {}) =>
    billing.processPayment({ invoiceId, amount, method: 'CASH', ...extra } as any, 'branch');
  const money = async (invoiceId: string) => {
    const row = await db.newInvoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: { orderBy: { createdAt: 'asc' } } } });
    return { received: row.received, balance: row.balance, payments: row.payments.map((p) => [p.amount, p.mode, p.reconStatus]) };
  };

  // First, so the day's clinic takings are only this test's bills.
  it('shows the same clinic takings in the revenue report and in Daily Collection', async () => {
    const consult = await bill(500);
    const procedure = await bill(800);
    await pay(consult.id, 500);
    const online = await pay(procedure.id, 300, { method: 'UPI', gateway: 'razorpay' });
    const day = clinicDay(new Date());
    const window = { startDate: new Date(Date.now() - 3_600_000).toISOString(), endDate: new Date(Date.now() + 3_600_000).toISOString() };
    const takings = async () => {
      const report = await revenue.generateRevenueReport(window as any, 'branch');
      const summary = await billing.getPaymentSummary({} as any, 'branch');
      const collection = await pharmacyReports.dailyCollection(day, { branchId: 'branch', id: 'doc', role: 'DOCTOR' });
      const clinic = collection.clinic!;
      return [report.totalRevenue, summary.totalAmount, clinic.net, clinic.dueAtDayEnd, clinic.modes.map((m) => [m.mode, m.net])];
    };

    expect(await takings()).toEqual([500, 500, 500, 800, [['CASH', 500], ['UPI', 0], ['CARD', 0]]]);
    await billing.confirmPayment(online.id, 'branch');
    expect(await takings()).toEqual([800, 800, 800, 500, [['CASH', 500], ['UPI', 300], ['CARD', 0]]]);
  });

  it('records cash taken at the desk as completed, so the bill is paid', async () => {
    const invoice = await bill(500);
    const payment = await pay(invoice.id, 500);
    expect(payment.reconStatus).toBe('COMPLETED');
    expect(await money(invoice.id)).toEqual({ received: 500, balance: 0, payments: [[500, 'CASH', 'COMPLETED']] });
  });

  it('lets the desk refund a payment it recorded', async () => {
    const invoice = await bill(500);
    const payment = await pay(invoice.id, 500, { method: 'UPI' });
    await billing.processRefund({ paymentId: payment.id, amount: 200, reason: 'Fee waived' } as any, 'branch');
    expect(await money(invoice.id)).toEqual({ received: 300, balance: 200, payments: [[500, 'UPI', 'COMPLETED'], [-200, 'UPI', 'COMPLETED']] });
  });

  it('takes one of two simultaneous refunds that together exceed what was received', async () => {
    const invoice = await bill(500);
    const payment = await pay(invoice.id, 500);
    const refund = () => billing.processRefund({ paymentId: payment.id, amount: 300 } as any, 'branch');
    const results = await Promise.allSettled([refund(), refund()]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await money(invoice.id)).toEqual({ received: 200, balance: 300, payments: [[500, 'CASH', 'COMPLETED'], [-300, 'CASH', 'COMPLETED']] });
  });

  it('refuses a payment above what is due, naming the due amount, and writes nothing', async () => {
    const invoice = await bill(500);
    await pay(invoice.id, 200);
    await expect(pay(invoice.id, 400)).rejects.toMatchObject({
      status: 400,
      message: `Only ₹300 is due on bill ${invoice.invoiceNo}, so ₹400 cannot be recorded.`,
    });
    await expect(pay(invoice.id, 0)).rejects.toMatchObject({ status: 400, message: 'Enter a payment above ₹0.' });
    await expect(pay(invoice.id, -50)).rejects.toMatchObject({ status: 400, message: 'Enter a payment above ₹0.' });
    expect(await money(invoice.id)).toEqual({ received: 200, balance: 300, payments: [[200, 'CASH', 'COMPLETED']] });
  });

  it('takes exactly one of two simultaneous payments that each settle the bill', async () => {
    const invoice = await bill(500);
    const results = await Promise.allSettled([pay(invoice.id, 500), pay(invoice.id, 500, { method: 'UPI' })]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const refused = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')!;
    expect(refused.reason).toMatchObject({ status: 400, message: `Bill ${invoice.invoiceNo} is already paid in full, so ₹500 cannot be recorded.` });
    const after = await money(invoice.id);
    expect([after.received, after.balance, after.payments.length]).toEqual([500, 0, 1]);
  });

  it('holds a gateway payment as pending until it is confirmed, and confirming twice changes nothing', async () => {
    const invoice = await bill(500);
    const payment = await pay(invoice.id, 300, { method: 'UPI', gateway: 'razorpay' });
    expect(await money(invoice.id)).toEqual({ received: 0, balance: 500, payments: [[300, 'UPI', 'PENDING']] });
    await expect(billing.processRefund({ paymentId: payment.id, amount: 100 } as any, 'branch'))
      .rejects.toMatchObject({ status: 400, message: 'Can only refund completed payments' });

    const confirmed = await billing.confirmPayment(payment.id, 'branch');
    expect(confirmed.reconStatus).toBe('COMPLETED');
    expect(await money(invoice.id)).toEqual({ received: 300, balance: 200, payments: [[300, 'UPI', 'COMPLETED']] });

    await billing.confirmPayment(payment.id, 'branch');
    expect(await money(invoice.id)).toEqual({ received: 300, balance: 200, payments: [[300, 'UPI', 'COMPLETED']] });
  });

  it('does not confirm a gateway payment once the desk has collected what was due', async () => {
    const invoice = await bill(500);
    const online = await pay(invoice.id, 500, { method: 'CARD', gateway: 'razorpay' });
    await pay(invoice.id, 500);
    await expect(billing.confirmPayment(online.id, 'branch')).rejects.toMatchObject({
      status: 409,
      message: `Bill ${invoice.invoiceNo} is already paid in full, so ₹500 cannot be recorded.`,
    });
    expect(await money(invoice.id)).toEqual({ received: 500, balance: 0, payments: [[500, 'CARD', 'PENDING'], [500, 'CASH', 'COMPLETED']] });
  });

});
