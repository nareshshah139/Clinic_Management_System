import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { BillingService } from '../billing.service';
import { ClinicBillRegisterService } from '../clinic-bill-register.service';
import { InvoiceNumbersService } from '../../../shared/numbering/invoice-numbers.service';
import { clinicDay } from '../../pharmacy/register-utils';

const databaseTests = process.env.BILLING_TEST_DATABASE_URL
  ? describe
  : describe.skip;

/** The clinic bill register lists, filters and totals consultation and procedure bills, and a bill can be voided. */
databaseTests('Clinic bill register on PostgreSQL', () => {
  const schema = `clinic_bill_register_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let billing: BillingService;
  let register: ClinicBillRegisterService;
  let created = false;
  const today = clinicDay(new Date());
  const owner = { id: 'owner', role: 'OWNER' };
  const reception = { id: 'reception', role: 'RECEPTION' };

  beforeAll(async () => {
    const url = new URL(process.env.BILLING_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    execFileSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'db',
        'push',
        '--skip-generate',
        '--schema',
        resolve('prisma/schema.prisma'),
      ],
      { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url.toString() } },
    );
    url.searchParams.set('connection_limit', '5');
    db = new PrismaClient({ datasourceUrl: url.toString() });
    await db.branch.create({
      data: {
        id: 'branch',
        name: 'Lakshmi Family Clinic',
        address: '12 MG Road',
        city: 'Hyderabad',
        phone: '040 2345 6789',
        licenseNumber: 'DL-77',
      },
    });
    await db.branch.create({
      data: { id: 'other', name: 'Other', address: 'Synthetic' },
    });
    const user = (
      id: string,
      role: string,
      firstName: string,
      lastName: string,
      permissions: string[] = [],
    ) =>
      db.user.create({
        data: {
          id,
          firstName,
          lastName,
          email: `${id}@example.test`,
          password: 'x',
          role: role as any,
          branchId: 'branch',
          permissions: JSON.stringify(permissions),
        },
      });
    await user('doc', 'DOCTOR', 'Asha', 'Rao');
    await user('owner', 'OWNER', 'Rajesh', 'Iyer');
    await user('reception', 'RECEPTION', 'Sunita', 'Patil', [
      'billing:invoice:read',
      'billing:payment:process',
      'billing:invoice:delete',
      'billing:refund:create',
    ]);
    await db.patient.create({
      data: {
        id: 'meera',
        name: 'Meera Shah',
        gender: 'F',
        phone: '9000000001',
        branchId: 'branch',
      },
    });
    await db.patient.create({
      data: {
        id: 'ravi',
        name: 'Ravi Kumar',
        gender: 'M',
        phone: '9000000002',
        branchId: 'branch',
      },
    });
    await db.patient.create({
      data: {
        id: 'far',
        name: 'Meera Far',
        gender: 'F',
        phone: '9000000003',
        branchId: 'other',
      },
    });
    await db.appointment.create({
      data: {
        id: 'consult',
        branchId: 'branch',
        patientId: 'meera',
        doctorId: 'doc',
        date: new Date(),
        slot: '10:00-10:15',
      },
    });
    await db.appointment.create({
      data: {
        id: 'peel',
        branchId: 'branch',
        patientId: 'ravi',
        doctorId: 'doc',
        date: new Date(),
        slot: '10:15-10:30',
        visitType: 'PROCEDURE',
      },
    });
    billing = new BillingService(
      db as any,
      new InvoiceNumbersService(db as any),
    );
    register = new ClinicBillRegisterService(db as any);
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created)
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  const bill = (patientId: string, fee: number, link: object = {}) =>
    billing.createInvoice(
      {
        patientId,
        ...link,
        items: [
          {
            name: 'Consultation',
            quantity: 1,
            unitPrice: fee,
            gstRate: 0,
            discount: 0,
          },
        ],
      } as any,
      'branch',
    );
  const pay = (invoiceId: string, amount: number, method = 'CASH') =>
    billing.processPayment({ invoiceId, amount, method } as any, 'branch');
  const list = (query: object = {}, viewer = owner) =>
    register.list(
      {
        from: today,
        to: today,
        sortBy: 'billedAt',
        sortDir: 'asc',
        page: 1,
        limit: 50,
        ...query,
      } as any,
      viewer,
      'branch',
    );
  const brief = (row: {
    billNo: string;
    status: string;
    amount: number;
    paid: number;
    due: number;
  }) => [row.billNo, row.status, row.amount, row.paid, row.due];

  let consult: { id: string; invoiceNo: string };
  let peel: { id: string; invoiceNo: string };
  let unpaid: { id: string; invoiceNo: string };

  it('lists the day’s bills with patient, doctor, type, money and status, and totals every matching bill', async () => {
    consult = await bill('meera', 500, { appointmentId: 'consult' });
    peel = await bill('ravi', 2500, { appointmentId: 'peel' });
    unpaid = await bill('meera', 300);
    await db.newInvoice.create({
      data: {
        invoiceNo: 'OTHER-1',
        patientId: 'far',
        branchId: 'other',
        total: 900,
        balance: 900,
      },
    });
    await pay(consult.id, 500);
    await pay(peel.id, 1000, 'UPI');

    const page = await list();
    expect(page.rows.map(brief)).toEqual([
      [consult.invoiceNo, 'PAID', 500, 500, 0],
      [peel.invoiceNo, 'PARTIALLY_PAID', 2500, 1000, 1500],
      [unpaid.invoiceNo, 'PENDING', 300, 0, 300],
    ]);
    expect(
      page.rows.map((r) => [
        r.patient.name,
        r.patient.phone,
        r.doctor?.name ?? null,
        r.kind,
      ]),
    ).toEqual([
      ['Meera Shah', '9000000001', 'Asha Rao', 'CONSULTATION'],
      ['Ravi Kumar', '9000000002', 'Asha Rao', 'PROCEDURE'],
      ['Meera Shah', '9000000001', null, null],
    ]);
    expect(page.totals).toEqual({
      count: 3,
      billed: 3300,
      collected: 1500,
      outstanding: 1800,
      voided: 0,
    });

    const onePerPage = await list({ limit: 1, page: 2 });
    expect([
      onePerPage.total,
      onePerPage.rows.map((r) => r.billNo),
      onePerPage.totals.outstanding,
    ]).toEqual([3, [peel.invoiceNo], 1800]);
  });

  it('filters outstanding, paid and void bills and searches by patient, mobile or bill number', async () => {
    const numbers = async (query: object) =>
      (await list(query)).rows.map((r) => r.billNo);
    expect(await numbers({ status: 'outstanding' })).toEqual([
      peel.invoiceNo,
      unpaid.invoiceNo,
    ]);
    expect(await numbers({ status: 'paid' })).toEqual([consult.invoiceNo]);
    expect(await numbers({ status: 'void' })).toEqual([]);
    expect(await numbers({ field: 'patient', q: 'meera' })).toEqual([
      consult.invoiceNo,
      unpaid.invoiceNo,
    ]);
    expect(await numbers({ field: 'mobile', q: '+91 90000 00002' })).toEqual([
      peel.invoiceNo,
    ]);
    expect(
      await numbers({ field: 'billNo', q: peel.invoiceNo.toLowerCase() }),
    ).toEqual([peel.invoiceNo]);
    expect((await list({ status: 'outstanding' })).totals).toEqual({
      count: 2,
      billed: 2800,
      collected: 1000,
      outstanding: 1800,
      voided: 0,
    });
  });

  it('leaves out bills dated outside the range, in clinic time', async () => {
    const old = await bill('ravi', 700);
    await db.newInvoice.update({
      where: { id: old.id },
      data: { createdAt: new Date('2020-01-02T23:30:00+05:30') },
    });
    expect((await list()).rows.map((r) => r.billNo)).not.toContain(
      old.invoiceNo,
    );
    expect(
      (await list({ from: '2020-01-02', to: '2020-01-02' })).rows.map(
        (r) => r.billNo,
      ),
    ).toEqual([old.invoiceNo]);
  });

  it('offers void and refund only where their routes admit the viewer', async () => {
    expect((await list({}, owner)).actions).toEqual({
      collect: true,
      void: true,
      refund: true,
    });
    expect((await list({}, reception)).actions).toEqual({
      collect: true,
      void: false,
      refund: false,
    });
  });

  it('refuses to void without a reason or while the bill holds money, and changes nothing', async () => {
    await expect(
      billing.cancelInvoice(peel.id, 'branch', '  '),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Give a reason for voiding the bill.',
    });
    await expect(
      billing.cancelInvoice(peel.id, 'branch', 'Wrong patient'),
    ).rejects.toMatchObject({
      status: 400,
      message: `Bill ${peel.invoiceNo} has received ₹1,000. Refund it first, then void the bill.`,
    });
    expect(
      (await db.newInvoice.findUniqueOrThrow({ where: { id: peel.id } }))
        .status,
    ).not.toBe('CANCELLED');
  });

  it('voids an unpaid bill with its reason, refuses payments on it, and leaves it out of the money totals', async () => {
    const voided = await billing.cancelInvoice(
      unpaid.id,
      'branch',
      'Booked twice',
    );
    expect(voided.status).toBe('CANCELLED');
    expect(
      (await billing.cancelInvoice(unpaid.id, 'branch', 'Again')).status,
    ).toBe('CANCELLED');
    await expect(pay(unpaid.id, 100)).rejects.toMatchObject({
      status: 400,
      message: `Bill ${unpaid.invoiceNo} is void, so ₹100 cannot be recorded.`,
    });

    const voids = await list({ status: 'void' });
    expect(
      voids.rows.map((r) => [r.billNo, r.status, r.due, r.voidReason]),
    ).toEqual([[unpaid.invoiceNo, 'CANCELLED', 0, 'Booked twice']]);
    expect((await list()).totals).toEqual({
      count: 2,
      billed: 3000,
      collected: 1500,
      outstanding: 1500,
      voided: 1,
    });
    expect(
      (await billing.getOutstandingInvoices({} as any, 'branch')).invoices.map(
        (i: { id: string }) => i.id,
      ),
    ).not.toContain(unpaid.id);
  });

  it('takes exactly one of a payment and a void racing for the same unpaid bill', async () => {
    const racing = await bill('ravi', 400);
    const results = await Promise.allSettled([
      pay(racing.id, 400),
      billing.cancelInvoice(racing.id, 'branch', 'Changed mind'),
    ]);
    const row = await db.newInvoice.findUniqueOrThrow({
      where: { id: racing.id },
      include: { payments: true },
    });
    const paid = row.payments.length === 1;
    expect(results.map((r) => r.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect([row.status === 'CANCELLED', row.received, row.balance]).toEqual(
      paid ? [false, 400, 0] : [true, 0, 400],
    );
  });

  it('marks a bill whose money all went back as refunded, and lets it be voided then', async () => {
    const refundable = await bill('meera', 600);
    const payment = await pay(refundable.id, 600, 'CARD');
    await billing.processRefund(
      { paymentId: payment.id, amount: 600, notes: 'Visit cancelled' } as any,
      'branch',
    );
    const row = (await list({ field: 'billNo', q: refundable.invoiceNo }))
      .rows[0];
    expect([row.status, row.paid, row.due, row.refunded]).toEqual([
      'REFUNDED',
      0,
      600,
      600,
    ]);
    expect(
      (await billing.cancelInvoice(refundable.id, 'branch', 'Visit cancelled'))
        .status,
    ).toBe('CANCELLED');
  });

  it('gives the receipt the clinic, patient, doctor, lines, payments and balance', async () => {
    await billing.processRefund(
      {
        paymentId: (
          await db.newPayment.findFirstOrThrow({
            where: { invoiceId: peel.id },
          })
        ).id,
        amount: 200,
        notes: 'Goodwill',
      } as any,
      'branch',
    );
    const receipt = await register.receipt(peel.id, 'branch');
    expect(receipt.clinic).toEqual({
      name: 'Lakshmi Family Clinic',
      address: '12 MG Road, Hyderabad',
      phone: '040 2345 6789',
    });
    expect(brief(receipt.bill)).toEqual([
      peel.invoiceNo,
      'PARTIALLY_PAID',
      2500,
      800,
      1700,
    ]);
    expect([
      receipt.bill.patient.name,
      receipt.bill.doctor?.name,
      receipt.bill.kind,
      receipt.bill.refunded,
    ]).toEqual(['Ravi Kumar', 'Asha Rao', 'PROCEDURE', 200]);
    expect(
      receipt.items.map((i) => [i.name, i.qty, i.unitPrice, i.total]),
    ).toEqual([['Consultation', 1, 2500, 2500]]);
    expect(
      receipt.payments.map((p) => [p.amount, p.mode, p.reference]),
    ).toEqual([
      [1000, 'UPI', null],
      [-200, 'UPI', 'REFUND: Goodwill'],
    ]);
    await expect(register.receipt(peel.id, 'other')).rejects.toMatchObject({
      status: 404,
    });
  });
});
