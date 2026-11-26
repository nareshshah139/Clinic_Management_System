import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { localDatabase } from '../../../shared/testing/local-database';
import { PrismaService } from '../../../shared/database/prisma.service';
import { clinicDay, clinicDayStart } from '../../pharmacy/register-utils';
import { VisitsService } from '../visits.service';

const databaseTests = process.env.FORMAL_REPLAY_TEST_DATABASE_URL ? describe : describe.skip;

databaseTests('A consultation the doctor started is never lost or doubled', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let prisma: PrismaClient;
  let visits: VisitsService;
  let branchId: string;
  let doctorId: string;
  let patientId: string;

  beforeAll(async () => {
    Logger.overrideLogger(false);
    fixture = await localDatabase(process.env.FORMAL_REPLAY_TEST_DATABASE_URL!);
    prisma = fixture.prisma;
    branchId = (await prisma.branch.create({ data: { name: 'Synthetic open visits', address: 'Synthetic' } })).id;
    visits = new VisitsService(prisma as PrismaService);
  }, 120000);

  afterAll(async () => {
    await fixture?.cleanup();
  });

  const newDoctor = async () =>
    (await prisma.user.create({
      data: { email: `open-${randomUUID()}@example.invalid`, password: 'no-login', firstName: 'Synthetic', lastName: 'Doctor', role: 'DOCTOR', branchId },
    })).id;

  beforeEach(async () => {
    doctorId = await newDoctor();
    patientId = (await prisma.patient.create({ data: { branchId, name: 'Synthetic Patient', phone: '0000000000', gender: 'FEMALE' } })).id;
  });

  const start = (extra: Record<string, unknown> = {}, who = doctorId) =>
    visits.create({ patientId, doctorId: who, complaints: [], ...extra } as any, branchId);
  const openVisit = (who = doctorId) => visits.findOpenVisit(patientId, who, branchId);
  const visitCount = () => prisma.visit.count({ where: { patientId } });

  it('finds the visit the doctor already started for this patient', async () => {
    const started = await start({ complaints: [{ complaint: 'Itchy rash' }] });
    expect((await openVisit())?.id).toBe(started.id);
  });

  it('finds nothing when the patient has no open visit', async () => {
    expect(await openVisit()).toBeNull();
  });

  it('resumes the visit that was worked on last when two are open', async () => {
    const first = await start();
    const second = await start();
    expect((await openVisit())?.id).toBe(second.id);
    await prisma.visit.update({ where: { id: first.id }, data: { complaints: JSON.stringify([{ complaint: 'Added later' }]) } });
    expect((await openVisit())?.id).toBe(first.id);
  });

  it("does not hand one doctor another doctor's consultation", async () => {
    const started = await start();
    const colleague = await newDoctor();
    expect(await openVisit(colleague)).toBeNull();
    const theirs = await start({}, colleague);
    expect(theirs.id).not.toBe(started.id);
    expect((await openVisit())?.id).toBe(started.id);
  });

  it('opens a new visit once the earlier one is completed', async () => {
    const started = await start({ complaints: [{ complaint: 'Acne' }], diagnosis: [{ diagnosis: 'Acne vulgaris' }] });
    await prisma.visit.update({ where: { id: started.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
    expect(await openVisit()).toBeNull();
    const next = await start();
    expect(next.id).not.toBe(started.id);
  });

  it('does not offer a deleted visit', async () => {
    const started = await start();
    await prisma.visit.update({ where: { id: started.id }, data: { deletedAt: new Date() } });
    expect(await openVisit()).toBeNull();
    await expect(start()).resolves.toMatchObject({ patientId });
  });

  it("leaves an earlier clinic day's open visit alone and starts today's", async () => {
    const started = await start();
    const midnight = clinicDayStart(clinicDay(new Date()));
    await prisma.visit.update({ where: { id: started.id }, data: { createdAt: new Date(midnight.getTime() - 60_000) } });
    expect(await openVisit()).toBeNull();
    const today = await start();
    expect(today.id).not.toBe(started.id);
    expect(await visitCount()).toBe(2);
  });

  it('counts the clinic day from midnight in the clinic zone, not from midnight UTC', async () => {
    const started = await start();
    const day = clinicDay(new Date());
    await prisma.visit.update({ where: { id: started.id }, data: { createdAt: new Date(clinicDayStart(day).getTime() + 5 * 60_000) } });
    const justAfterMidnight = new Date(clinicDayStart(day).getTime() + 10 * 60_000);
    expect((await visits.findOpenVisit(patientId, doctorId, branchId, justAfterMidnight))?.id).toBe(started.id);
    const nextMorning = new Date(clinicDayStart(day).getTime() + 30 * 3_600_000);
    expect(await visits.findOpenVisit(patientId, doctorId, branchId, nextMorning)).toBeNull();
  });

  it('finds a visit that is linked to an appointment', async () => {
    const appointment = await prisma.appointment.create({
      data: { patientId, doctorId, branchId, date: new Date(), slot: '10:00-10:15', status: 'SCHEDULED' },
    });
    const started = await start({ appointmentId: appointment.id });
    expect((await openVisit())?.id).toBe(started.id);
  });

  it('still starts a visit from an appointment while a walk-in visit is open', async () => {
    const walkIn = await start();
    const appointment = await prisma.appointment.create({
      data: { patientId, doctorId, branchId, date: new Date(), slot: '11:00-11:15', status: 'SCHEDULED' },
    });
    const fromAppointment = await start({ appointmentId: appointment.id });
    expect(fromAppointment.id).not.toBe(walkIn.id);
  });

  const procedureRecord = (extra: Record<string, unknown> = {}) =>
    start({
      complaints: [],
      treatmentPlan: { dermatology: { procedures: [{ machine: 'Diode laser', type: 'Hair removal', sessionNo: 1 }] }, notes: 'Session 1' },
      ...extra,
    });
  const prescriptionPadVisit = () =>
    prisma.visit.create({
      data: {
        patientId,
        doctorId,
        complaints: JSON.stringify([{ complaint: 'Prescription issued without full visit', source: 'PRESCRIPTION_PAD' }]),
        plan: JSON.stringify({ prescriptionOnly: true, metadata: { createdVia: 'PRESCRIPTION_PAD' } }),
        scribeJson: JSON.stringify({ createdVia: 'PRESCRIPTION_PAD' }),
      },
    });

  it('does not offer a procedure record as the open consultation', async () => {
    await procedureRecord();
    expect(await openVisit()).toBeNull();
  });

  it('starts a consultation of its own after a procedure was recorded', async () => {
    const procedure = await procedureRecord();
    const consultation = await start({ complaints: [{ complaint: 'Itchy rash' }] });
    expect(consultation.id).not.toBe(procedure.id);
    expect((await openVisit())?.id).toBe(consultation.id);
  });

  it('offers the consultation, not the procedure record recorded after it', async () => {
    const consultation = await start({ complaints: [{ complaint: 'Itchy rash' }] });
    await procedureRecord();
    expect((await openVisit())?.id).toBe(consultation.id);
  });

  it('does not offer a prescription-pad visit as the open consultation', async () => {
    await prescriptionPadVisit();
    expect(await openVisit()).toBeNull();
    const consultation = await start();
    expect((await openVisit())?.id).toBe(consultation.id);
  });

  it('records a procedure and then its next session while a consultation is open', async () => {
    await start({ complaints: [{ complaint: 'Itchy rash' }] });
    const first = await procedureRecord();
    const next = await procedureRecord({ treatmentPlan: { dermatology: { procedures: [{ machine: 'Diode laser', type: 'Hair removal', sessionNo: 2 }] } } });
    expect(next.id).not.toBe(first.id);
    expect(await visitCount()).toBe(3);
  });

  it('creates a visit even though another is open, exactly as before', async () => {
    const first = await start();
    const second = await start();
    expect(second.id).not.toBe(first.id);
    expect(await visitCount()).toBe(2);
  });

  it("keeps another patient's visits out of the answer", async () => {
    await start();
    const other = (await prisma.patient.create({ data: { branchId, name: 'Other Patient', phone: '1111111111', gender: 'MALE' } })).id;
    expect(await visits.findOpenVisit(other, doctorId, branchId)).toBeNull();
  });

  it("keeps another branch's visits out of the answer", async () => {
    await start();
    const otherBranch = (await prisma.branch.create({ data: { name: 'Other branch', address: 'Synthetic' } })).id;
    expect(await visits.findOpenVisit(patientId, doctorId, otherBranch)).toBeNull();
  });
});
