import { PrismaClient } from '@prisma/client';
import { ReportsService } from '../reports.service';
import { BillingService } from '../../billing/billing.service';
import { InvoiceNumbersService } from '../../../shared/numbering/invoice-numbers.service';
import { localDatabase } from '../../../shared/testing/local-database';

const databaseTests = process.env.REPORTS_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Alerts list the clinic bills the app creates', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let db: PrismaClient;
  let billing: BillingService;
  let branchId: string;
  let ownerId: string;
  let accountantId: string;
  let appointmentId: string;
  let doctorId: string;

  beforeAll(async () => {
    fixture = await localDatabase(process.env.REPORTS_TEST_DATABASE_URL!);
    db = fixture.prisma;
    branchId = (await db.branch.create({ data: { name: 'Synthetic bills branch', address: 'test' } })).id;
    const user = (role: 'OWNER' | 'DOCTOR' | 'ACCOUNTANT') =>
      db.user.create({ data: { branchId, firstName: 'Test', lastName: role, email: `${role}@example.invalid`, password: 'no-login', role } });
    ownerId = (await user('OWNER')).id;
    doctorId = (await user('DOCTOR')).id;
    accountantId = (await user('ACCOUNTANT')).id;
    const patientId = (await db.patient.create({ data: { name: 'Kavya Iyer', gender: 'F', phone: '9000000001', branchId } })).id;
    appointmentId = (await db.appointment.create({ data: { branchId, patientId, doctorId, date: new Date('2026-11-10T00:00:00.000Z'), slot: '10:00-10:15' } })).id;
    billing = new BillingService(db as any, new InvoiceNumbersService(db as any));
    const bill = await billing.createInvoice(
      { patientId, appointmentId, items: [{ name: 'Consultation', quantity: 1, unitPrice: 700, gstRate: 0, discount: 0 }] } as any,
      branchId,
    );
    await billing.processPayment({ invoiceId: bill.id, amount: 300, method: 'CASH' } as any, branchId);
  }, 120000);

  afterAll(async () => fixture?.cleanup());

  it('lists a part-paid bill with no status by its balance, patient and appointment, as the outstanding list does', async () => {
    const alerts = await new ReportsService(db as any).getSystemAlerts(branchId, { id: ownerId, role: 'OWNER' });
    const outstanding = await billing.getOutstandingInvoices({} as any, branchId);

    expect({
      count: alerts.counts.billsDue,
      total: alerts.billsDueBalance,
      rows: alerts.billsDue.map((b: any) => [b.patient.name, b.balance, b.appointment]),
      canTakePayment: alerts.canTakePayment,
    }).toEqual({
      count: 1,
      total: 400,
      rows: [['Kavya Iyer', 400, { id: appointmentId, doctorId, day: '2026-11-10' }]],
      canTakePayment: true,
    });
    expect([outstanding.invoices.length, outstanding.totalOutstanding]).toEqual([1, 400]);
  });

  it('says when the viewer may not take a payment', async () => {
    const alerts = await new ReportsService(db as any).getSystemAlerts(branchId, { id: accountantId, role: 'ACCOUNTANT' });
    expect(alerts.canTakePayment).toBe(false);
  });
});
