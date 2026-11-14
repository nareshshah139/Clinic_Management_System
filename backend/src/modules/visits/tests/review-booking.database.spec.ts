import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AppointmentsService } from '../../appointments/appointments.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ReviewBookingService } from '../review-booking';
import { VisitsController } from '../visits.controller';
import { VisitsService } from '../visits.service';

jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }));

const databaseTests = process.env.REVIEW_BOOKING_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Review booking on PostgreSQL', () => {
  const schema = `review_booking_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let controller: VisitsController;
  let created = false;
  const request = { user: { id: 'doctor', branchId: 'branch' } } as any;

  beforeAll(async () => {
    const url = new URL(process.env.REVIEW_BOOKING_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    url.searchParams.set('connection_limit', '20');
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')],
      { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url.toString() } });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    const migration = readFileSync(resolve('prisma/migrations/20261114100000_appointment_review_of_visit/migration.sql'), 'utf8');
    await db.$executeRawUnsafe(migration.slice(migration.indexOf('CREATE UNIQUE INDEX')));
    await db.branch.create({ data: { id: 'branch', name: 'Branch', address: 'Synthetic' } });
    await db.user.create({ data: { id: 'doctor', firstName: 'Synthetic', lastName: 'Doctor', email: 'doctor@example.test', password: 'x', role: 'DOCTOR', branchId: 'branch' } });
    await db.patient.create({ data: { id: 'patient', name: 'Synthetic Patient', gender: 'F', phone: '9000000000', branchId: 'branch' } });
    const appointments = new AppointmentsService(db as PrismaService);
    controller = new VisitsController(new VisitsService(db as PrismaService), new ReviewBookingService(db as PrismaService, appointments));
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  const visitFor = (followUp: string) =>
    db.visit.create({ data: { patientId: 'patient', doctorId: 'doctor', complaints: '[]', followUp: new Date(followUp) } });
  const reviews = async (visitId: string) =>
    (await db.appointment.findMany({ where: { reviewOfVisitId: visitId }, orderBy: { createdAt: 'asc' } }))
      .map((a) => `${a.date.toISOString().slice(0, 10)} ${a.slot} ${a.status}`);

  it('books one review when the same visit is completed five times at once', async () => {
    const visit = await visitFor('2099-03-04');
    const results = await Promise.all(Array.from({ length: 5 }, () => controller.complete(visit.id, { version: visit.version } as any, request)));
    expect(results.map((r) => r.status)).toEqual(['COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED']);
    expect(results.map((r) => r.reviewAppointment.status).sort()).toEqual(['booked', 'existing', 'existing', 'existing', 'existing']);
    expect(await reviews(visit.id)).toEqual(['2099-03-04 09:00-09:30 SCHEDULED']);
  }, 60000);

  it('moves the review when the date changes and keeps one live review', async () => {
    const visit = await visitFor('2099-03-05');
    expect((await controller.complete(visit.id, {} as any, request)).reviewAppointment.status).toBe('booked');
    await db.visit.update({ where: { id: visit.id }, data: { followUp: new Date('2099-03-06') } });
    const moved = await Promise.all([controller.complete(visit.id, {} as any, request), controller.complete(visit.id, {} as any, request)]);
    expect(moved.map((r) => r.reviewAppointment.status).sort()).toEqual(['existing', 'moved']);
    expect(await reviews(visit.id)).toEqual(['2099-03-05 09:00-09:30 CANCELLED', '2099-03-06 09:00-09:30 SCHEDULED']);
  }, 60000);

  it('rejects a second live review for one visit at the database', async () => {
    const visit = await visitFor('2099-03-07');
    const row = { patientId: 'patient', doctorId: 'doctor', date: new Date('2099-03-07'), branchId: 'branch', reviewOfVisitId: visit.id };
    await db.appointment.create({ data: { ...row, slot: '09:00-09:30' } });
    await expect(db.appointment.create({ data: { ...row, slot: '10:00-10:30' } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(db.appointment.create({ data: { ...row, slot: '11:00-11:30', status: 'CANCELLED' } })).resolves.toMatchObject({ status: 'CANCELLED' });
  });
});
