import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { AppointmentsService } from '../appointments.service';
import { BillingService } from '../../billing/billing.service';
import { InvoiceNumbersService } from '../../../shared/numbering/invoice-numbers.service';

const databaseTests = process.env.BILLING_TEST_DATABASE_URL ? describe : describe.skip;

/** CR-17: the doctor's day calendar carries each appointment's bill type and clinic billing. */
databaseTests('Doctor schedule billing on PostgreSQL', () => {
  const schema = `schedule_billing_${randomUUID().replaceAll('-', '')}`;
  const DAY = '2099-04-01';
  let admin: PrismaClient;
  let db: PrismaClient;
  let appointments: AppointmentsService;
  let billing: BillingService;
  let created = false;

  const viewers = {
    reception: { id: 'reception', role: 'RECEPTION' },
    nurse: { id: 'nurse', role: 'NURSE' },
    bare: { id: 'bare-reception', role: 'RECEPTION' },
    doctor: { id: 'doc', role: 'DOCTOR' },
    admin: { id: 'admin', role: 'ADMIN' },
  };

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
    for (const branchId of ['branch', 'other']) await db.branch.create({ data: { id: branchId, name: branchId, address: 'Synthetic' } });
    const user = (id: string, role: any, permissions: string[]) =>
      db.user.create({ data: { id, firstName: id, lastName: 'Synthetic', email: `${id}@example.test`, password: 'x', role, branchId: 'branch', permissions: JSON.stringify(permissions) } });
    await user('doc', 'DOCTOR', []);
    await user('admin', 'ADMIN', []);
    await user('reception', 'RECEPTION', ['appointments:read', 'billing:invoice:create', 'billing:invoice:read', 'billing:payment:process']);
    await user('bare-reception', 'RECEPTION', ['appointments:read']);
    await user('nurse', 'NURSE', ['appointments:read', 'billing:invoice:read']);

    const patients = ['first', 'review', 'procedure', 'paid', 'two', 'visit-only', 'appointment-only', 'cancelled', 'done-unbilled'];
    for (const p of patients) await db.patient.create({ data: { id: p, name: `Patient ${p}`, gender: 'F', phone: '9000000000', branchId: 'branch', dob: new Date('1990-05-01') } });
    let minute = 0;
    for (const p of patients) {
      const start = `${String(9 + Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
      minute += 15;
      const end = `${String(9 + Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
      await db.appointment.create({
        data: { id: p, branchId: 'branch', patientId: p, doctorId: 'doc', date: new Date(DAY), slot: `${start}-${end}`, status: p === 'done-unbilled' ? 'COMPLETED' : 'CONFIRMED', visitType: p === 'procedure' ? 'PROCEDURE' : 'OPD' },
      });
    }
    await db.visit.create({ data: { patientId: 'review', doctorId: 'doc', complaints: '[]', createdAt: new Date('2099-03-01T05:00:00Z') } });
    await db.visit.create({ data: { patientId: 'procedure', doctorId: 'doc', complaints: '[]', createdAt: new Date('2099-03-01T05:00:00Z') } });
    await db.visit.create({ data: { id: 'first-own-visit', patientId: 'first', doctorId: 'doc', appointmentId: 'first', complaints: '[]', createdAt: new Date(`${DAY}T03:31:00Z`) } });
    await db.visit.create({ data: { id: 'visit-only-visit', patientId: 'visit-only', doctorId: 'doc', appointmentId: 'visit-only', complaints: '[]' } });
    await db.visit.create({ data: { id: 'two-visit', patientId: 'two', doctorId: 'doc', appointmentId: 'two', complaints: '[]' } });

    billing = new BillingService(db as any, new InvoiceNumbersService(db as any));
    appointments = new AppointmentsService(db as any);
    const bill = async (patientId: string, amount: number, paid: number, link: object) => {
      const invoice = await billing.createInvoice({ patientId, items: [{ name: 'Consultation', quantity: 1, unitPrice: amount, gstRate: 0, discount: 0 }], ...link } as any, 'branch');
      if (paid) await billing.processPayment({ invoiceId: invoice.id, amount: paid, method: 'CASH' } as any, 'branch');
      return invoice;
    };
    await bill('first', 500, 300, { appointmentId: 'first' });
    await bill('paid', 700, 700, { appointmentId: 'paid' });
    await bill('two', 500, 500, { appointmentId: 'two' });
    await bill('two', 1200, 1000, { visitId: 'two-visit' });
    await bill('appointment-only', 800, 0, { appointmentId: 'appointment-only' });
    const visitOnly = await bill('visit-only', 600, 600, { visitId: 'visit-only-visit' });
    await db.newInvoice.update({ where: { id: visitOnly.id }, data: { appointmentId: null } });
    const cancelled = await bill('cancelled', 900, 0, { appointmentId: 'cancelled' });
    await db.newInvoice.update({ where: { id: cancelled.id }, data: { status: 'CANCELLED' } });
    await db.patient.create({ data: { id: 'elsewhere', name: 'Elsewhere', gender: 'F', phone: '9', branchId: 'other' } });
    await db.newInvoice.create({ data: { invoiceNo: 'OTHER-1', patientId: 'elsewhere', branchId: 'other', appointmentId: 'paid', total: 999, balance: 999 } });
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  const day = async (viewer: { id: string; role: string }) => {
    const schedule = await appointments.getDoctorSchedule('doc', DAY, 'branch', viewer);
    const rows = Object.fromEntries(schedule.appointments.map((a: any) => [a.id, a]));
    return { schedule, rows };
  };
  const money = (row: any) => row.billing && [row.billing.state, row.billing.total, row.billing.received, row.billing.due, row.billing.invoices.length, row.billing.attention];

  it('labels every row First consultation, Review or Procedure', async () => {
    const { rows } = await day(viewers.reception);
    expect([rows.first.billType, rows.review.billType, rows.procedure.billType]).toEqual(['FIRST_CONSULTATION', 'REVIEW', 'PROCEDURE']);
  });

  it('sums each appointment’s live bills, linked either way, once each', async () => {
    const { schedule, rows } = await day(viewers.reception);
    expect(schedule.billingAccess).toEqual({ read: true, createBill: true, takePayment: true, editFees: false });
    expect({
      notBilled: money(rows.review),
      partlyPaid: money(rows.first),
      paid: money(rows.paid),
      twoBills: money(rows.two),
      visitOnly: money(rows['visit-only']),
      appointmentOnly: money(rows['appointment-only']),
      cancelledIgnored: money(rows.cancelled),
      completedUnbilled: money(rows['done-unbilled']),
    }).toEqual({
      notBilled: ['NOT_BILLED', 0, 0, 0, 0, false],
      partlyPaid: ['DUE', 500, 300, 200, 1, true],
      paid: ['PAID', 700, 700, 0, 1, false],
      twoBills: ['DUE', 1700, 1500, 200, 2, true],
      visitOnly: ['PAID', 600, 600, 0, 1, false],
      appointmentOnly: ['DUE', 800, 0, 800, 1, true],
      cancelledIgnored: ['NOT_BILLED', 0, 0, 0, 0, false],
      completedUnbilled: ['NOT_BILLED', 0, 0, 0, 0, true],
    });
  });

  it('returns the patient’s sex and date of birth with the row', async () => {
    const { rows } = await day(viewers.reception);
    expect([rows.first.patient.gender, rows.first.patient.dob.toISOString()]).toEqual(['F', '1990-05-01T00:00:00.000Z']);
  });

  it('keeps bill amounts from a viewer the bill routes refuse, and still gives the bill type', async () => {
    for (const viewer of [viewers.nurse, viewers.bare]) {
      const { schedule, rows } = await day(viewer);
      expect(schedule.billingAccess).toEqual({ read: false, createBill: false, takePayment: false, editFees: false });
      expect([rows.first.billType, 'billing' in rows.first]).toEqual(['FIRST_CONSULTATION', false]);
    }
  });

  it('lets a doctor read and take payment through the role guard', async () => {
    const { schedule, rows } = await day(viewers.doctor);
    expect(schedule.billingAccess).toEqual({ read: true, createBill: true, takePayment: true, editFees: false });
    expect(money(rows.paid)).toEqual(['PAID', 700, 700, 0, 1, false]);
  });

  it('gives each row the fee its bill type has in this branch, null without one, and offers the fee list to an admin only', async () => {
    const fee = (rows: any) => [rows.first.fee, rows.review.fee, rows.procedure.fee];
    expect(fee((await day(viewers.reception)).rows)).toEqual([null, null, null]);
    await db.clinicFee.create({ data: { branchId: 'branch', billType: 'FIRST_CONSULTATION', amount: 1280, updatedById: 'admin' } });
    await db.clinicFee.create({ data: { branchId: 'branch', billType: 'PROCEDURE', amount: null, updatedById: 'admin' } });
    await db.clinicFee.create({ data: { branchId: 'other', billType: 'REVIEW', amount: 999, updatedById: 'admin' } });
    expect(fee((await day(viewers.reception)).rows)).toEqual([1280, null, null]);
    await db.clinicFee.create({ data: { branchId: 'branch', billType: 'REVIEW', amount: 390, updatedById: 'admin' } });
    expect(fee((await day(viewers.doctor)).rows)).toEqual([1280, 390, null]);
    const asAdmin = await day(viewers.admin);
    expect([asAdmin.schedule.billingAccess, fee(asAdmin.rows)]).toEqual([{ read: true, createBill: true, takePayment: true, editFees: true }, [1280, 390, null]]);
    const nurse = await day(viewers.nurse);
    expect(['fee' in nurse.rows.first, 'fee' in nurse.rows.review]).toEqual([false, false]);
  });

  it('never changes a bill already made when the fee changes', async () => {
    await db.clinicFee.update({ where: { branchId_billType: { branchId: 'branch', billType: 'FIRST_CONSULTATION' } }, data: { amount: 2000, version: { increment: 1 } } });
    const { rows } = await day(viewers.reception);
    expect([rows.first.fee, money(rows.first)]).toEqual([2000, ['DUE', 500, 300, 200, 1, true]]);
  });
});
