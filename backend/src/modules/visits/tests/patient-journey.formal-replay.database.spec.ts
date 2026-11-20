import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { AppointmentStatus, PrismaClient } from '@prisma/client';
import { localDatabase } from '../../../shared/testing/local-database';
import { PrismaService } from '../../../shared/database/prisma.service';
import { InvoiceNumbersService } from '../../../shared/numbering/invoice-numbers.service';
import { AppointmentsService } from '../../appointments/appointments.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { DrugService } from '../../pharmacy/drug.service';
import { PharmacyInvoiceService } from '../../pharmacy/pharmacy-invoice.service';
import { PharmacyPrescriptionQueueService } from '../../pharmacy/pharmacy-prescription-queue.service';
import { DosageUnit } from '../../prescriptions/dto/prescription.dto';
import { PrescriptionsService } from '../../prescriptions/prescriptions.service';
import { VisitsService } from '../visits.service';

// Replays of verification/state-machines/patient-journey. Each test walks TLC's path
// from results/code.md, one call per model action, through the real services.
const databaseTests = process.env.FORMAL_REPLAY_TEST_DATABASE_URL ? describe : describe.skip;

databaseTests('Patient journey formal replay with PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let db: PrismaClient;
  let appointments: AppointmentsService;
  let visits: VisitsService;
  let queue: PharmacyPrescriptionQueueService;
  let prescriptions: PrescriptionsService;
  let invoices: PharmacyInvoiceService;

  beforeAll(async () => {
    Logger.overrideLogger(false);
    fixture = await localDatabase(process.env.FORMAL_REPLAY_TEST_DATABASE_URL!);
    db = fixture.prisma;
    const prisma = db as unknown as PrismaService;
    appointments = new AppointmentsService(prisma);
    visits = new VisitsService(prisma);
    queue = new PharmacyPrescriptionQueueService(prisma, new DrugService(prisma));
    prescriptions = new PrescriptionsService(prisma, {} as NotificationsService, queue);
    invoices = new PharmacyInvoiceService(prisma, new InvoiceNumbersService(prisma));
  }, 120000);

  afterAll(async () => {
    await fixture?.cleanup();
  });

  async function clinic() {
    const branchId = (await db.branch.create({ data: { name: 'Synthetic journey clinic', address: 'Synthetic' } })).id;
    const user = (role: 'DOCTOR' | 'PHARMACIST') => db.user.create({
      data: { branchId, role, firstName: 'Synthetic', lastName: role, email: `${randomUUID()}@example.invalid`, password: 'no-login' },
    });
    const doctorId = (await user('DOCTOR')).id;
    const pharmacistId = (await user('PHARMACIST')).id;
    const patientId = (await db.patient.create({
      data: { branchId, name: 'Synthetic Patient', phone: '9000000000', gender: 'FEMALE' },
    })).id;
    const drugId = (await db.drug.create({
      data: { branchId, name: 'Synthetic Cetirizine 10', manufacturerName: 'Synthetic', packSizeLabel: '1', price: 10 },
    })).id;
    const inventoryItemId = (await db.inventoryItem.create({
      data: {
        branchId, name: 'Synthetic Cetirizine 10', type: 'MEDICINE', costPrice: 5, sellingPrice: 10, unit: 'PIECES',
        currentStock: 50, stockStatus: 'IN_STOCK', expiryDate: new Date('2099-01-01'), drugs: { connect: { id: drugId } },
      },
    })).id;

    const appointmentStatus = async (id: string) =>
      (await db.appointment.findUniqueOrThrow({ where: { id } })).status;
    const visitStatus = async (id: string) =>
      (await db.visit.findUniqueOrThrow({ where: { id } })).status;
    const prescriptionStatus = async (id: string) =>
      (await db.prescription.findUniqueOrThrow({ where: { id } })).status;

    return {
      branchId,
      appointmentStatus,
      visitStatus,
      prescriptionStatus,
      visitCount: () => db.visit.count({ where: { patientId } }),
      queueTotal: async () => (await queue.findAll({}, branchId)).pagination.total,
      book: () => appointments.create(
        { patientId, doctorId, date: '2099-01-05', slot: '10:00-10:30', calendar: 'SCHEDULED' } as any,
        branchId,
      ),
      deskChecksIn: (appointmentId: string) =>
        appointments.update(appointmentId, { status: AppointmentStatus.CHECKED_IN }, branchId),
      deskMarksCompleted: (appointmentId: string) =>
        appointments.update(appointmentId, { status: AppointmentStatus.COMPLETED }, branchId),
      doctorStartsVisit: (appointmentId: string) =>
        visits.create({ patientId, doctorId, appointmentId, complaints: [] } as any, branchId, doctorId),
      doctorDeletesVisit: (visitId: string) => visits.remove(visitId, branchId),
      doctorWritesPrescription: (visitId: string) => prescriptions.createPrescription({
        patientId, visitId, doctorId,
        items: [{
          drugId, inventoryItemId, drugName: 'Synthetic Cetirizine 10', dosage: 10, dosageUnit: DosageUnit.MG,
          frequency: 'ONCE_DAILY', duration: 5, durationUnit: 'DAYS', quantity: 5,
        }],
      } as any, branchId, doctorId),
      pharmacistBills: (prescriptionId: string) => invoices.checkout({
        requestKey: randomUUID(), patientId, doctorId, prescriptionId, paymentMethod: 'UPI',
        billingName: 'Synthetic Patient', billingPhone: '9000000000',
        items: [{ drugId, inventoryItemId, quantity: 5, unitPrice: 10, discountPercent: 0, taxPercent: 12 }],
      } as any, branchId, pharmacistId),
      doctorCancelsPrescription: (prescriptionId: string) =>
        prescriptions.cancelPrescription(prescriptionId, branchId, 'Synthetic change of plan', doctorId),
    };
  }

  describe('CalendarFollowsVisit', () => {
    it('CalendarFollowsVisit: a check-in sent after the doctor started the visit leaves the calendar showing the consultation', async () => {
      const c = await clinic();
      const appointment = await c.book();
      const visit = await c.doctorStartsVisit(appointment.id);
      await c.deskChecksIn(appointment.id).catch(() => undefined);
      expect([await c.appointmentStatus(appointment.id), await c.visitStatus(visit.id)]).toEqual(['IN_PROGRESS', 'IN_PROGRESS']);
    });
  });

  describe('CompletedOnlyAfterVisit', () => {
    it('CompletedOnlyAfterVisit: the desk cannot mark a booked appointment completed when no visit happened', async () => {
      const c = await clinic();
      const appointment = await c.book();
      await c.deskMarksCompleted(appointment.id).catch(() => undefined);
      expect([await c.appointmentStatus(appointment.id), await c.visitCount()]).toEqual(['SCHEDULED', 0]);
    });
  });

  describe('BilledPrescriptionStaysActive', () => {
    it('BilledPrescriptionStaysActive: a prescription whose medicines were billed cannot be cancelled', async () => {
      const c = await clinic();
      const appointment = await c.book();
      const visit = await c.doctorStartsVisit(appointment.id);
      const prescription = await c.doctorWritesPrescription(visit.id);
      await c.pharmacistBills(prescription.id);
      await c.doctorCancelsPrescription(prescription.id).catch(() => undefined);
      expect([await c.prescriptionStatus(prescription.id), await c.queueTotal()]).toEqual(['ACTIVE', 1]);
    });
  });

  describe('PatientLeavesServed', () => {
    const outcome = (attempt: Promise<{ status: string }>) =>
      attempt.then(visit => visit.status, (error: Error) => error.message);

    it('PatientLeavesServed: a checked-in patient whose appointment was marked completed can still be seen by the doctor', async () => {
      const c = await clinic();
      const appointment = await c.book();
      await c.deskChecksIn(appointment.id);
      const visit = await c.doctorStartsVisit(appointment.id);
      await c.doctorDeletesVisit(visit.id);
      await c.deskMarksCompleted(appointment.id).catch(() => undefined);
      expect(await outcome(c.doctorStartsVisit(appointment.id))).toBe('IN_PROGRESS');
    });
  });
});
