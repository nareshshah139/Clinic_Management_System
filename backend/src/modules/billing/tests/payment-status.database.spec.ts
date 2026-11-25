import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BulkPaymentDto, PaymentDto, RefundDto } from '../dto/invoice.dto';
import { paise, rupees } from '../clinic-bill-register';
import { BillingService } from '../billing.service';
import { ClinicBillRegisterService } from '../clinic-bill-register.service';
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
  let register: ClinicBillRegisterService;
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
    register = new ClinicBillRegisterService(db as any);
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

  it('refuses to refund a cash payment again once it is refunded in full, and still refunds the UPI payment', async () => {
    const invoice = await bill(1000);
    const cash = await pay(invoice.id, 500);
    const upi = await pay(invoice.id, 500, { method: 'UPI' });
    await billing.processRefund({ paymentId: cash.id, amount: 500 } as any, 'branch');

    await expect(billing.processRefund({ paymentId: cash.id, amount: 500 } as any, 'branch')).rejects.toMatchObject({
      status: 400,
      message: 'This ₹500 payment is already refunded in full, so ₹500 cannot be refunded.',
    });
    expect(await money(invoice.id)).toEqual({
      received: 500,
      balance: 500,
      payments: [[500, 'CASH', 'COMPLETED'], [500, 'UPI', 'COMPLETED'], [-500, 'CASH', 'COMPLETED']],
    });

    await billing.processRefund({ paymentId: upi.id, amount: 500 } as any, 'branch');
    expect(await money(invoice.id)).toMatchObject({ received: 0, balance: 1000 });
  });

  it('refunds only what is left of a partly refunded payment', async () => {
    const invoice = await bill(1000);
    const cash = await pay(invoice.id, 500);
    await pay(invoice.id, 500, { method: 'UPI' });
    await billing.processRefund({ paymentId: cash.id, amount: 200 } as any, 'branch');

    await expect(billing.processRefund({ paymentId: cash.id, amount: 400 } as any, 'branch')).rejects.toMatchObject({
      status: 400,
      message: 'Only ₹300 of this ₹500 payment is left to refund, so ₹400 cannot be refunded.',
    });
    await billing.processRefund({ paymentId: cash.id, amount: 300 } as any, 'branch');
    expect(await money(invoice.id)).toEqual({
      received: 500,
      balance: 500,
      payments: [[500, 'CASH', 'COMPLETED'], [500, 'UPI', 'COMPLETED'], [-200, 'CASH', 'COMPLETED'], [-300, 'CASH', 'COMPLETED']],
    });
  });

  it('tells the receipt what is left to refund on each payment', async () => {
    const invoice = await bill(1000);
    const cash = await pay(invoice.id, 500);
    const upi = await pay(invoice.id, 500, { method: 'UPI' });
    await billing.processRefund({ paymentId: cash.id, amount: 500 } as any, 'branch');
    await billing.processRefund({ paymentId: upi.id, amount: 200 } as any, 'branch');

    const { payments } = await register.receipt(invoice.id, 'branch');
    expect(payments.map((p) => [p.amount, p.mode, p.refundable])).toEqual([
      [500, 'CASH', 0],
      [500, 'UPI', 300],
      [-500, 'CASH', 0],
      [-200, 'UPI', 0],
    ]);
  });

  it('counts a refund stored before refunds were linked against an older payment of its mode', async () => {
    const invoice = await bill(1000);
    const cash = await pay(invoice.id, 500);
    const upi = await pay(invoice.id, 500, { method: 'UPI' });
    await db.newPayment.create({ data: { invoiceId: invoice.id, amount: -500, mode: 'CASH', reference: 'REFUND', reconStatus: 'COMPLETED' } });
    await db.newInvoice.update({ where: { id: invoice.id }, data: { received: 500, balance: 500 } });

    const { payments } = await register.receipt(invoice.id, 'branch');
    expect(payments.map((p) => [p.amount, p.mode, p.refundable])).toEqual([
      [500, 'CASH', 0],
      [500, 'UPI', 500],
      [-500, 'CASH', 0],
    ]);
    await expect(billing.processRefund({ paymentId: cash.id, amount: 500 } as any, 'branch')).rejects.toMatchObject({
      status: 400,
      message: 'This ₹500 payment is already refunded in full, so ₹500 cannot be refunded.',
    });
    await billing.processRefund({ paymentId: upi.id, amount: 500 } as any, 'branch');
    expect(await money(invoice.id)).toMatchObject({ received: 0, balance: 1000 });
  });

  it('counts a refund stored before refunds were linked against the one same-mode payment that could hold it', async () => {
    const invoice = await bill(1000);
    const small = await pay(invoice.id, 200);
    const large = await pay(invoice.id, 800);
    await db.newPayment.create({ data: { invoiceId: invoice.id, amount: -800, mode: 'CASH', reference: 'REFUND', reconStatus: 'COMPLETED' } });
    await db.newInvoice.update({ where: { id: invoice.id }, data: { received: 200, balance: 800 } });

    const { payments } = await register.receipt(invoice.id, 'branch');
    expect(payments.map((p) => [p.amount, p.refundable])).toEqual([[200, 200], [800, 0], [-800, 0]]);
    await expect(billing.processRefund({ paymentId: large.id, amount: 100 } as any, 'branch')).rejects.toMatchObject({ status: 400 });
    await billing.processRefund({ paymentId: small.id, amount: 200 } as any, 'branch');
    expect(await money(invoice.id)).toMatchObject({ received: 0, balance: 1000 });
  });

  it('takes one of two simultaneous refunds of one payment that together exceed it', async () => {
    const invoice = await bill(1000);
    const cash = await pay(invoice.id, 500);
    await pay(invoice.id, 500, { method: 'UPI' });
    const refund = () => billing.processRefund({ paymentId: cash.id, amount: 500 } as any, 'branch');
    const results = await Promise.allSettled([refund(), refund()]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await money(invoice.id)).toMatchObject({ received: 500, balance: 500 });
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

  it('settles a ₹600.30 bill when the desk collects ₹200.10 and then exactly the ₹400.20 shown as due', async () => {
    const invoice = await bill(600.3);
    await pay(invoice.id, 200.1);
    expect((await register.receipt(invoice.id, 'branch')).bill.due).toBe(400.2);
    await pay(invoice.id, 400.2, { method: 'UPI' });
    expect(await money(invoice.id)).toEqual({
      received: 600.3,
      balance: 0,
      payments: [[200.1, 'CASH', 'COMPLETED'], [400.2, 'UPI', 'COMPLETED']],
    });
    const { status, paid, due } = (await register.receipt(invoice.id, 'branch')).bill;
    expect([status, paid, due]).toEqual(['PAID', 600.3, 0]);
  });

  it('starts and confirms a gateway payment of exactly the ₹400.20 shown as due', async () => {
    const invoice = await bill(600.3);
    await pay(invoice.id, 200.1);
    const online = await pay(invoice.id, 400.2, { method: 'UPI', gateway: 'razorpay' });
    await billing.confirmPayment(online.id, 'branch');
    expect(await money(invoice.id)).toEqual({
      received: 600.3,
      balance: 0,
      payments: [[200.1, 'CASH', 'COMPLETED'], [400.2, 'UPI', 'COMPLETED']],
    });
  });

  it('settles two ₹600.30 bills part paid ₹200.10 with one bulk payment of the ₹800.40 still due', async () => {
    const first = await bill(600.3);
    const second = await bill(600.3);
    await pay(first.id, 200.1);
    await pay(second.id, 200.1);
    await billing.processBulkPayment({ invoiceIds: [first.id, second.id], totalAmount: 800.4, method: 'UPI' } as any, 'branch');
    const settled = { received: 600.3, balance: 0, payments: [[200.1, 'CASH', 'COMPLETED'], [400.2, 'UPI', 'COMPLETED']] };
    expect([await money(first.id), await money(second.id)]).toEqual([settled, settled]);
  });

  it('refunds a ₹600.30 payment in full as ₹200.10 and then ₹400.20', async () => {
    const invoice = await bill(600.3);
    const payment = await pay(invoice.id, 600.3);
    await billing.processRefund({ paymentId: payment.id, amount: 200.1 } as any, 'branch');
    await billing.processRefund({ paymentId: payment.id, amount: 400.2 } as any, 'branch');
    expect(await money(invoice.id)).toEqual({
      received: 0,
      balance: 600.3,
      payments: [[600.3, 'CASH', 'COMPLETED'], [-200.1, 'CASH', 'COMPLETED'], [-400.2, 'CASH', 'COMPLETED']],
    });
  });

  const gstBill = (unitPrice: number) =>
    billing.createInvoice({ patientId: 'patient', items: [{ name: 'Procedure', quantity: 1, unitPrice, gstRate: 18, discount: 0 }] } as any, 'branch');

  it('keeps a GST bill in whole paise, so collecting the balance shown never takes more than was billed', async () => {
    const invoice = await gstBill(223.75);
    await pay(invoice.id, 100.01);
    const shown = (await register.receipt(invoice.id, 'branch')).bill;
    expect([shown.amount, shown.due]).toEqual([264.03, 164.02]);
    await pay(invoice.id, shown.due, { method: 'UPI' });
    const row = await db.newInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect([row.total, row.received, row.balance]).toEqual([264.03, 264.03, 0]);
  });

  const toWholePaise = async () => {
    const sql = readFileSync(resolve('prisma/migrations/20261125150000_clinic_bill_whole_paise/migration.sql'), 'utf8');
    for (const statement of sql.split(';').filter((s) => s.replace(/--.*$/gm, '').trim())) await db.$executeRawUnsafe(statement);
  };

  it('keeps a bill paid when it was settled a fraction of a paisa under its total before the migration', async () => {
    const invoice = await bill(264.025);
    await pay(invoice.id, 264.02);
    await db.newInvoice.update({ where: { id: invoice.id }, data: { total: 264.025, received: 264.02, balance: 264.025 - 264.02 } });
    expect((await register.receipt(invoice.id, 'branch')).bill.status).toBe('PAID');
    await toWholePaise();
    await toWholePaise();
    const { status, amount, paid, due } = (await register.receipt(invoice.id, 'branch')).bill;
    expect([status, amount, paid, due]).toEqual(['PAID', 264.02, 264.02, 0]);
  });

  it('shows a payment saved with a half paisa rounded the same way as the bill it paid, without changing it', async () => {
    const invoice = await bill(264.025);
    const payment = await pay(invoice.id, 264.03);
    await db.newPayment.update({ where: { id: payment.id }, data: { amount: 264.025 } });
    await db.newInvoice.update({ where: { id: invoice.id }, data: { total: 264.025, received: 264.025, balance: 0 } });
    await toWholePaise();
    const receipt = await register.receipt(invoice.id, 'branch');
    expect([receipt.bill.amount, receipt.bill.paid, receipt.bill.due]).toEqual([264.03, 264.03, 0]);
    expect(receipt.payments.map((p) => p.amount)).toEqual([264.03]);
    expect((await db.newPayment.findUniqueOrThrow({ where: { id: payment.id } })).amount).toBe(264.025);
  });

  it('never refunds more than an old half-paisa payment holds, so the ledger never goes negative', async () => {
    const invoice = await bill(264.025);
    const payment = await pay(invoice.id, 264.03);
    await db.newPayment.update({ where: { id: payment.id }, data: { amount: 264.025 } });
    await db.newInvoice.update({ where: { id: invoice.id }, data: { total: 264.025, received: 264.025, balance: 0 } });
    await toWholePaise();
    const offered = (await register.receipt(invoice.id, 'branch')).payments[0].refundable;
    expect(offered).toBe(264.02);
    await expect(billing.processRefund({ paymentId: payment.id, amount: 264.03 } as any, 'branch')).rejects.toMatchObject({ status: 400 });
    await billing.processRefund({ paymentId: payment.id, amount: offered } as any, 'branch');
    const ledger = await db.newPayment.findMany({ where: { invoiceId: invoice.id } });
    expect(ledger.reduce((sum, p) => sum + p.amount, 0)).toBeGreaterThanOrEqual(0);
  });

  it('leaves split payments as they were taken, so the ledger still adds up to what the bill received', async () => {
    const invoice = await bill(100.01);
    const first = await pay(invoice.id, 50);
    const second = await pay(invoice.id, 50.01);
    await db.newPayment.update({ where: { id: first.id }, data: { amount: 50.005 } });
    await db.newPayment.update({ where: { id: second.id }, data: { amount: 50.005 } });
    await toWholePaise();
    const rows = await db.newPayment.findMany({ where: { invoiceId: invoice.id } });
    expect(rupees(paise(rows.reduce((sum, p) => sum + p.amount, 0)))).toBe(100.01);
    expect((await register.receipt(invoice.id, 'branch')).bill.paid).toBe(100.01);
  });

  it('refuses a payment or refund with a fraction of a paisa before it reaches the bill', async () => {
    const errors = async (dto: object, type: new () => object) => (await validate(plainToInstance(type, dto))).map((e) => e.property);
    expect(await errors({ invoiceId: 'cmww7600u00001qlx1h22nc71', amount: 50.005, method: 'CASH' }, PaymentDto)).toEqual(['amount']);
    expect(await errors({ paymentId: 'cmww7600u00001qlx1h22nc71', amount: 50.005 }, RefundDto)).toEqual(['amount']);
    expect(await errors({ invoiceIds: ['cmww7600u00001qlx1h22nc71'], totalAmount: 50.005, method: 'CASH' }, BulkPaymentDto)).toEqual(['totalAmount']);
    expect(await errors({ invoiceId: 'cmww7600u00001qlx1h22nc71', amount: 50.01, method: 'CASH' }, PaymentDto)).toEqual([]);
  });

  it('rounds a bill saved with a fraction of a paisa to whole paise when migrated', async () => {
    const invoice = await bill(264.025);
    await db.newInvoice.update({ where: { id: invoice.id }, data: { total: 264.025, received: 100.01, balance: 164.015 } });
    await toWholePaise();

    const shown = (await register.receipt(invoice.id, 'branch')).bill;
    expect([shown.amount, shown.due]).toEqual([264.03, 164.02]);
    await pay(invoice.id, shown.due);
    const row = await db.newInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect([row.total, row.received, row.balance]).toEqual([264.03, 264.03, 0]);
  });

  it('adds up the register in the same whole paise each GST bill was settled in', async () => {
    await db.patient.create({ data: { id: 'gst-patient', name: 'Kiran Varma', gender: 'M', phone: '9000000001', branchId: 'branch' } });
    const gst = () =>
      billing.createInvoice({ patientId: 'gst-patient', items: [{ name: 'Procedure', quantity: 1, unitPrice: 508.7, gstRate: 18, discount: 0 }] } as any, 'branch');
    for (const b of [await gst(), await gst()]) await pay(b.id, (await register.receipt(b.id, 'branch')).bill.due);
    const today = clinicDay(new Date());
    const { rows, totals } = await register.list(
      { from: today, to: today, field: 'patient', q: 'Kiran Varma', sortBy: 'billedAt', sortDir: 'asc', page: 1, limit: 50 } as any,
      { id: 'doc', role: 'OWNER' },
      'branch',
    );
    expect(rows.map((r) => [r.amount, r.paid, r.due])).toEqual([[600.27, 600.27, 0], [600.27, 600.27, 0]]);
    expect([totals.billed, totals.collected, totals.outstanding]).toEqual([1200.54, 1200.54, 0]);
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
