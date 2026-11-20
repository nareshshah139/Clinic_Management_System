import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { localDatabase } from '../../../shared/testing/local-database';
import { PrismaService } from '../../../shared/database/prisma.service';
import { AppointmentsService } from '../../appointments/appointments.service';
import { VisitsService } from '../visits.service';

// Replays of verification/state-machines/appointment-visit. Each rule's steps follow
// TLC's path in results/code.md, one call per model action. The "screens only" paths
// come from the model's uiOnly mode and use only writes a screen sends.
const databaseTests = process.env.FORMAL_REPLAY_TEST_DATABASE_URL ? describe : describe.skip;

databaseTests('Appointment and visit model replays', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let prisma: PrismaClient;
  let appointments: AppointmentsService;
  let visits: VisitsService;
  let branchId: string;
  let doctorId: string;
  let patientId: string;

  beforeAll(async () => {
    Logger.overrideLogger(false);
    fixture = await localDatabase(process.env.FORMAL_REPLAY_TEST_DATABASE_URL!);
    prisma = fixture.prisma;
    branchId = (await prisma.branch.create({ data: { name: 'Synthetic replay', address: 'Synthetic' } })).id;
    appointments = new AppointmentsService(prisma as PrismaService);
    visits = new VisitsService(prisma as PrismaService);
  }, 120000);

  afterAll(async () => {
    await fixture?.cleanup();
  });

  // Each test gets its own doctor so capacity, which another model covers, never refuses a write.
  beforeEach(async () => {
    doctorId = (await prisma.user.create({
      data: {
        email: `replay-${randomUUID()}@example.invalid`,
        password: 'no-login',
        firstName: 'Synthetic',
        lastName: 'Doctor',
        role: 'DOCTOR',
        branchId,
      },
    })).id;
    patientId = (await prisma.patient.create({
      data: { branchId, name: 'Synthetic Patient', phone: '0000000000', gender: 'FEMALE' },
    })).id;
  });

  const booked = async () =>
    (await prisma.appointment.create({
      data: { patientId, doctorId, branchId, date: new Date('2026-11-20'), slot: '10:00-10:15', status: 'SCHEDULED' },
    })).id;

  const doctorStartsVisit = async (appointmentId: string) =>
    (await visits.create({ patientId, doctorId, appointmentId, complaints: [] } as any, branchId)).id;
  const doctorEditsNotes = (visitId: string) =>
    visits.update(visitId, { diagnosis: [{ diagnosis: 'Amended after signing' }] } as any, branchId);
  const doctorCompletesVisit = (visitId: string) => visits.complete(visitId, {}, branchId);
  const deskSetsStatus = (appointmentId: string, status: string) =>
    appointments.update(appointmentId, { status } as any, branchId);
  const deskCancels = (appointmentId: string) => appointments.remove(appointmentId, branchId);
  // The voice dialog offers check-in only for an appointment its list shows as waiting.
  const deskPlansCheckIn = async (appointmentId: string) =>
    expect((await appointments.findOne(appointmentId, branchId)).status).toBe('SCHEDULED');
  // VoiceCommandDialog sends exactly this PATCH body.
  const deskConfirmsCheckIn = (appointmentId: string) =>
    appointments.update(appointmentId, { status: 'CHECKED_IN' } as any, branchId);

  // A fixed server refuses some of these writes. The replay must then still read the rows.
  const attempt = (call: Promise<unknown>) => call.then(() => 'applied', () => 'refused');

  // NoResurrection constrains only a cancel that was applied. A refused cancel leaves nothing to keep.
  const standingCancel = (cancel: string, status: string) => (cancel === 'applied' ? status : 'CANCELLED');

  const rows = async (appointmentId: string, visitId: string) => {
    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    const visit = await prisma.visit.findUniqueOrThrow({ where: { id: visitId } });
    return { appointment: appointment.status, visit: visit.status };
  };

  describe('StatusesAgree', () => {
    it('StatusesAgree: a desk status edit cannot move an appointment out of in progress while its visit is open', async () => {
      const appointmentId = await booked();
      const visitId = await doctorStartsVisit(appointmentId);
      await attempt(deskSetsStatus(appointmentId, 'SCHEDULED'));
      expect(await rows(appointmentId, visitId)).toEqual({ appointment: 'IN_PROGRESS', visit: 'IN_PROGRESS' });
    });

    it('StatusesAgree (screens only): a voice check-in planned before the visit started leaves the appointment in progress', async () => {
      const appointmentId = await booked();
      await deskPlansCheckIn(appointmentId);
      const visitId = await doctorStartsVisit(appointmentId);
      await attempt(deskConfirmsCheckIn(appointmentId));
      expect(await rows(appointmentId, visitId)).toEqual({ appointment: 'IN_PROGRESS', visit: 'IN_PROGRESS' });
    });
  });

  describe('NoResurrection', () => {
    it('NoResurrection: completing a visit does not turn a cancelled appointment into completed', async () => {
      const appointmentId = await booked();
      const visitId = await doctorStartsVisit(appointmentId);
      const cancel = await attempt(deskSetsStatus(appointmentId, 'CANCELLED'));
      await attempt(doctorCompletesVisit(visitId));
      expect(standingCancel(cancel, (await rows(appointmentId, visitId)).appointment)).toBe('CANCELLED');
    });

    it('NoResurrection (screens only): a voice check-in planned before a cancel leaves the appointment cancelled', async () => {
      const appointmentId = await booked();
      await deskPlansCheckIn(appointmentId);
      await deskCancels(appointmentId);
      await attempt(deskConfirmsCheckIn(appointmentId));
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).status).toBe('CANCELLED');
    });

    it('NoResurrection (screens only): a cancel after a stale voice check-in survives the visit being completed', async () => {
      const appointmentId = await booked();
      await deskPlansCheckIn(appointmentId);
      const visitId = await doctorStartsVisit(appointmentId);
      await attempt(deskConfirmsCheckIn(appointmentId));
      const cancel = await attempt(deskCancels(appointmentId));
      await attempt(doctorCompletesVisit(visitId));
      expect(standingCancel(cancel, (await rows(appointmentId, visitId)).appointment)).toBe('CANCELLED');
    });
  });

  describe('CompletedVisitFrozen', () => {
    it.failing('CompletedVisitFrozen: a completed visit keeps the diagnosis it was completed with', async () => {
      const appointmentId = await booked();
      const visitId = await doctorStartsVisit(appointmentId);
      await doctorCompletesVisit(visitId);
      await attempt(doctorEditsNotes(visitId));
      const visit = await prisma.visit.findUniqueOrThrow({ where: { id: visitId } });
      expect({ status: visit.status, diagnosis: visit.diagnosis }).toEqual({ status: 'COMPLETED', diagnosis: null });
    });

    it('today: a completed visit accepts a new diagnosis', async () => {
      const appointmentId = await booked();
      const visitId = await doctorStartsVisit(appointmentId);
      await doctorCompletesVisit(visitId);
      expect(await attempt(doctorEditsNotes(visitId))).toBe('applied');
      const visit = await prisma.visit.findUniqueOrThrow({ where: { id: visitId } });
      expect({ status: visit.status, diagnosis: visit.diagnosis })
        .toEqual({ status: 'COMPLETED', diagnosis: '[{"diagnosis":"Amended after signing"}]' });
    });
  });

  describe('DisagreementHeals', () => {
    // The model has no timer, cron or reconciler to wait out. After the path, the reads
    // the screens make are the only thing left to run, and they must show agreement.
    it('DisagreementHeals: after a status edit during an open visit, the appointment ends up in progress again', async () => {
      const appointmentId = await booked();
      const visitId = await doctorStartsVisit(appointmentId);
      await attempt(deskSetsStatus(appointmentId, 'CANCELLED'));
      await attempt(doctorEditsNotes(visitId));
      const shown = await appointments.findOne(appointmentId, branchId);
      expect({ appointment: shown.status, visit: shown.visit?.status }).toEqual({ appointment: 'IN_PROGRESS', visit: 'IN_PROGRESS' });
    });
  });
});
