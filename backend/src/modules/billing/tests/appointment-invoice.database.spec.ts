import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { BillingService } from '../billing.service';
import { InvoiceNumbersService } from '../../../shared/numbering/invoice-numbers.service';

const databaseTests = process.env.BILLING_TEST_DATABASE_URL ? describe : describe.skip;

/** CR-17: a clinic bill raised for an appointment keeps its appointment and its visit. */
databaseTests('Clinic invoices linked to appointments on PostgreSQL', () => {
  const schema = `appointment_invoice_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let billing: BillingService;
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
    for (const branchId of ['branch', 'other']) {
      await db.branch.create({ data: { id: branchId, name: branchId, address: 'Synthetic' } });
      await db.user.create({ data: { id: `doc-${branchId}`, firstName: 'Doc', lastName: branchId, email: `doc-${branchId}@example.test`, password: 'x', role: 'DOCTOR', branchId } });
      await db.patient.create({ data: { id: `patient-${branchId}`, name: 'Meera Shah', gender: 'F', phone: '9000000000', branchId } });
    }
    await db.patient.create({ data: { id: 'second-patient', name: 'Ravi Kumar', gender: 'M', phone: '9000000001', branchId: 'branch' } });
    const appointment = (id: string, branchId = 'branch', patientId = `patient-${branchId}`) =>
      db.appointment.create({ data: { id, branchId, patientId, doctorId: `doc-${branchId}`, date: new Date('2099-03-01'), slot: '10:00-10:15' } });
    await appointment('with-visit');
    await appointment('no-visit');
    await appointment('elsewhere', 'other');
    await db.visit.create({ data: { id: 'visit', patientId: 'patient-branch', doctorId: 'doc-branch', appointmentId: 'with-visit', complaints: '[]' } });
    await db.visit.create({ data: { id: 'walk-in', patientId: 'patient-branch', doctorId: 'doc-branch', complaints: '[]' } });
    billing = new BillingService(db as any, new InvoiceNumbersService(db as any));
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  const consultation = [{ name: 'First consultation', quantity: 1, unitPrice: 500, gstRate: 0, discount: 0 }];
  const links = async (id: string) => {
    const row = await db.newInvoice.findUniqueOrThrow({ where: { id } });
    return [row.appointmentId, row.visitId];
  };

  it('stores the appointment a bill was raised for, with the appointment’s visit', async () => {
    const invoice = await billing.createInvoice({ patientId: 'patient-branch', appointmentId: 'with-visit', items: consultation } as any, 'branch');
    expect(await links(invoice.id)).toEqual(['with-visit', 'visit']);
  });

  it('stores an appointment that has no visit yet', async () => {
    const invoice = await billing.createInvoice({ patientId: 'patient-branch', appointmentId: 'no-visit', items: consultation } as any, 'branch');
    expect(await links(invoice.id)).toEqual(['no-visit', null]);
  });

  it('takes the appointment from a visit that has one', async () => {
    const invoice = await billing.createInvoice({ patientId: 'patient-branch', visitId: 'visit', items: consultation } as any, 'branch');
    expect(await links(invoice.id)).toEqual(['with-visit', 'visit']);
    const walkIn = await billing.createInvoice({ patientId: 'patient-branch', visitId: 'walk-in', items: consultation } as any, 'branch');
    expect(await links(walkIn.id)).toEqual([null, 'walk-in']);
  });

  it('refuses an appointment of another branch or patient, or a visit of another appointment, writing nothing', async () => {
    const before = await db.newInvoice.count();
    await expect(billing.createInvoice({ patientId: 'patient-branch', appointmentId: 'elsewhere', items: consultation } as any, 'branch'))
      .rejects.toMatchObject({ status: 404, message: 'Appointment not found' });
    await expect(billing.createInvoice({ patientId: 'second-patient', appointmentId: 'no-visit', items: consultation } as any, 'branch'))
      .rejects.toMatchObject({ status: 404, message: 'Appointment not found' });
    await expect(billing.createInvoice({ patientId: 'patient-branch', appointmentId: 'no-visit', visitId: 'visit', items: consultation } as any, 'branch'))
      .rejects.toMatchObject({ status: 400, message: 'The visit belongs to a different appointment' });
    expect(await db.newInvoice.count()).toBe(before);
  });
});
