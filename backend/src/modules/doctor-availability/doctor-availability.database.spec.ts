import { PrismaClient, User, Patient } from '@prisma/client';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import requestHttp from 'supertest';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { PrismaService } from '../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { PermissionsGuard } from '../../shared/guards/permissions.guard';
import { AppointmentsService } from '../appointments/appointments.service';
import { DoctorAvailabilityController } from './doctor-availability.controller';
import { DoctorAvailabilityService } from './doctor-availability.service';
import { weekdayOf } from './availability';

const DATE = '2099-03-02';
const NEXT = '2099-03-03';
const ist = (date: string, time: string) => `${date}T${time}:00+05:30`;

const databaseTests = process.env.DOCTOR_AVAILABILITY_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Doctor availability against PostgreSQL', () => {
  const schema = `doctor_availability_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let created = false;
  let app: INestApplication;
  let branchId: string;
  let legacyDoctor: User;
  let otherDoctor: User;
  let adminUser: User;
  let patient: Patient;
  let appointments: AppointmentsService;

  const http = (user: User) => ({
    get: (url: string) => requestHttp(app.getHttpServer()).get(url).set('x-test-user', user.id),
    put: (url: string) => requestHttp(app.getHttpServer()).put(url).set('x-test-user', user.id),
    post: (url: string) => requestHttp(app.getHttpServer()).post(url).set('x-test-user', user.id),
    delete: (url: string) => requestHttp(app.getHttpServer()).delete(url).set('x-test-user', user.id),
  });
  const slots = async (doctor: User) =>
    (await appointments.getAvailableSlots({ doctorId: doctor.id, date: DATE, durationMinutes: 30 }, branchId)).availableSlots;
  const book = (doctor: User, slot: string) =>
    appointments.create({ patientId: patient.id, doctorId: doctor.id, date: DATE, slot }, branchId);

  beforeAll(async () => {
    const url = new URL(process.env.DOCTOR_AVAILABILITY_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    branchId = (await db.branch.create({ data: { name: 'SYNTHETIC Availability', address: 'Test' } })).id;
    const user = (role: 'DOCTOR' | 'ADMIN', metadata?: string) => db.user.create({
      data: { branchId, firstName: 'Synthetic', lastName: role, email: `${randomUUID()}@example.invalid`, password: 'NO_LOGIN', role, metadata },
    });
    legacyDoctor = await user('DOCTOR', JSON.stringify({ workingHours: { startHour: 10, endHour: 12 }, whatsappAutoConfirmAppointments: false }));
    otherDoctor = await user('DOCTOR');
    adminUser = await user('ADMIN');
    patient = await db.patient.create({ data: { branchId, name: 'SYNTHETIC Patient', phone: '0000000000', gender: 'FEMALE' } });
    appointments = new AppointmentsService(db as PrismaService);
    const module = await Test.createTestingModule({
      controllers: [DoctorAvailabilityController],
      providers: [DoctorAvailabilityService, { provide: PrismaService, useValue: db }],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    app.use(async (req: any, _res: any, next: () => void) => {
      const id = req.headers['x-test-user'];
      const found = id ? await db.user.findUnique({ where: { id } }) : null;
      req.user = found && { id: found.id, branchId: found.branchId, role: found.role };
      next();
    });
    const reflector = new Reflector();
    app.useGlobalGuards(new RolesGuard(reflector), new PermissionsGuard(reflector, db as PrismaService));
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  }, 60000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  afterEach(async () => {
    await db.appointment.deleteMany({});
    await db.doctorTimeOff.deleteMany({});
    await db.doctorWorkingHours.deleteMany({});
  });

  it('keeps legacy metadata hours until hours are configured, then configured hours win without touching metadata', async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: legacyDoctor.id } });
    expect(await slots(legacyDoctor)).toEqual(['10:00-10:30', '10:30-11:00', '11:00-11:30', '11:30-12:00']);
    expect((await http(legacyDoctor).get(`/doctor-availability/${legacyDoctor.id}`).expect(200)).body.source).toBe('legacy');

    const weekday = weekdayOf(DATE);
    const saved = await http(legacyDoctor).put(`/doctor-availability/${legacyDoctor.id}/hours`)
      .send({ hours: [{ weekday, start: '09:00', end: '10:00' }, { weekday, start: '15:00', end: '15:30' }] }).expect(200);
    expect(saved.body.source).toBe('configured');

    expect(await slots(legacyDoctor)).toEqual(['09:00-09:30', '09:30-10:00', '15:00-15:30']);
    const day = (await http(legacyDoctor).get(`/doctor-availability/${legacyDoctor.id}/day?date=${NEXT}`).expect(200)).body;
    expect(day).toMatchObject({ source: 'configured', working: [], intervals: [] });
    expect((await db.user.findUniqueOrThrow({ where: { id: legacyDoctor.id } })).metadata).toBe(before.metadata);
  });

  it('rejects overlapping shifts', async () => {
    const weekday = weekdayOf(DATE);
    const res = await http(adminUser).put(`/doctor-availability/${otherDoctor.id}/hours`)
      .send({ hours: [{ weekday, start: '09:00', end: '12:00' }, { weekday, start: '11:00', end: '13:00' }] }).expect(400);
    expect(res.body.message).toMatch(/overlap/);
  });

  it("stops a doctor from editing another doctor's hours or time off", async () => {
    await http(otherDoctor).put(`/doctor-availability/${legacyDoctor.id}/hours`)
      .send({ hours: [{ weekday: 1, start: '09:00', end: '10:00' }] }).expect(403);
    await http(otherDoctor).post('/doctor-availability/time-off')
      .send({ doctorId: legacyDoctor.id, kind: 'LEAVE', startsAt: ist(DATE, '00:00'), endsAt: ist(NEXT, '00:00') }).expect(403);
    await http(otherDoctor).post('/doctor-availability/time-off')
      .send({ kind: 'HOLIDAY', startsAt: ist(DATE, '00:00'), endsAt: ist(NEXT, '00:00') }).expect(403);
    const own = await http(legacyDoctor).post('/doctor-availability/time-off')
      .send({ doctorId: legacyDoctor.id, kind: 'BLOCKED', startsAt: ist(DATE, '10:00'), endsAt: ist(DATE, '10:30') }).expect(201);
    await http(otherDoctor).delete(`/doctor-availability/time-off/${own.body.id}`).expect(403);
    await http(adminUser).put(`/doctor-availability/${legacyDoctor.id}/hours`)
      .send({ hours: [{ weekday: 1, start: '09:00', end: '10:00' }] }).expect(200);
    expect(await db.doctorWorkingHours.count({ where: { doctorId: legacyDoctor.id } })).toBe(1);
    await http(legacyDoctor).delete(`/doctor-availability/time-off/${own.body.id}`).expect(200);
  });

  it('removes leave and blocked time from slots and rejects booking or rescheduling into them with 409', async () => {
    await http(legacyDoctor).post('/doctor-availability/time-off')
      .send({ doctorId: legacyDoctor.id, kind: 'BLOCKED', startsAt: ist(DATE, '10:30'), endsAt: ist(DATE, '11:00'), reason: 'Rounds' }).expect(201);
    expect(await slots(legacyDoctor)).toEqual(['10:00-10:30', '11:00-11:30', '11:30-12:00']);
    await expect(book(legacyDoctor, '10:45-11:15')).rejects.toMatchObject({
      status: 409,
      response: { message: expect.stringMatching(/blocked off.*Rounds/), conflicts: [expect.objectContaining({ type: 'time_off' })] },
    });

    const booked = await book(legacyDoctor, '11:00-11:30');
    await expect(appointments.reschedule(booked.id, { date: DATE, slot: '10:30-11:00' }, branchId)).rejects.toMatchObject({ status: 409 });

    await http(adminUser).post('/doctor-availability/time-off')
      .send({ doctorId: legacyDoctor.id, kind: 'LEAVE', startsAt: ist(DATE, '00:00'), endsAt: ist(NEXT, '00:00'), reason: 'Conference' }).expect(201);
    expect(await slots(legacyDoctor)).toEqual([]);
    await expect(book(legacyDoctor, '11:30-12:00')).rejects.toMatchObject({ status: 409, response: { message: expect.stringMatching(/on leave.*Conference/) } });
    expect(await db.appointment.count()).toBe(1);
  });

  it('applies a branch holiday to every doctor and only admins may remove it', async () => {
    const holiday = await http(adminUser).post('/doctor-availability/time-off')
      .send({ kind: 'HOLIDAY', startsAt: ist(DATE, '00:00'), endsAt: ist(NEXT, '00:00'), reason: 'Holi' }).expect(201);
    expect(holiday.body.doctorId).toBeNull();
    for (const doctor of [legacyDoctor, otherDoctor]) {
      expect(await slots(doctor)).toEqual([]);
      await expect(book(doctor, '12:00-12:30')).rejects.toMatchObject({ status: 409, response: { message: expect.stringMatching(/holiday.*Holi/) } });
      const listed = (await http(doctor).get(`/doctor-availability/${doctor.id}?from=${DATE}&to=${DATE}`).expect(200)).body.timeOff;
      expect(listed.map((t: { id: string }) => t.id)).toEqual([holiday.body.id]);
    }
    expect(await slots(otherDoctor)).toEqual([]);
    expect((await appointments.getAvailableSlots({ doctorId: otherDoctor.id, date: NEXT, durationMinutes: 60 }, branchId)).availableSlots).toHaveLength(9);
    await http(otherDoctor).delete(`/doctor-availability/time-off/${holiday.body.id}`).expect(403);
    await http(adminUser).delete(`/doctor-availability/time-off/${holiday.body.id}`).expect(200);
    expect(await slots(otherDoctor)).toHaveLength(18);
  });

  it('requires a doctor for leave and keeps reads branch-scoped to doctors', async () => {
    await http(adminUser).post('/doctor-availability/time-off')
      .send({ kind: 'LEAVE', startsAt: ist(DATE, '00:00'), endsAt: ist(NEXT, '00:00') }).expect(400);
    await http(adminUser).post('/doctor-availability/time-off')
      .send({ doctorId: otherDoctor.id, kind: 'LEAVE', startsAt: ist(NEXT, '00:00'), endsAt: ist(DATE, '00:00') }).expect(400);
    await http(adminUser).get(`/doctor-availability/${adminUser.id}`).expect(404);
  });
});
