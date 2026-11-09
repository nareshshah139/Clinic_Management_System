import { PrismaClient, User, Patient } from '@prisma/client';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import requestHttp from 'supertest';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../shared/database/prisma.service';
import { localDatabase } from '../../shared/testing/local-database';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { PermissionsGuard } from '../../shared/guards/permissions.guard';
import { AppointmentsService } from '../appointments/appointments.service';
import { DoctorAvailabilityController } from './doctor-availability.controller';
import { DoctorAvailabilityService } from './doctor-availability.service';

const DATE = '2099-03-02';
const NEXT = '2099-03-03';
const ist = (date: string, time: string) => `${date}T${time}:00+05:30`;
const HOURS = [{ weekday: 1, start: '09:00', end: '10:00' }];

const databaseTests = process.env.DOCTOR_AVAILABILITY_TEST_DATABASE_URL
  ? describe
  : describe.skip;
databaseTests('Doctor availability access and scheduling contracts', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let db: PrismaClient;
  let app: INestApplication;
  let appointments: AppointmentsService;
  let patient: Patient;
  let branchId: string;
  let otherBranchId: string;
  const people: Record<string, User> = {};

  const as = (name: string) => {
    const header = people[name].id;
    const http = () => requestHttp(app.getHttpServer());
    return {
      get: (url: string) => http().get(url).set('x-test-user', header),
      put: (url: string) => http().put(url).set('x-test-user', header),
      post: (url: string) => http().post(url).set('x-test-user', header),
      delete: (url: string) => http().delete(url).set('x-test-user', header),
    };
  };
  const timeOff = (name: string, body: object) =>
    as(name).post('/doctor-availability/time-off').send(body);
  const leave = (
    doctor: string,
    kind: string,
    from: string,
    to: string,
    day = DATE,
  ) => ({
    doctorId: people[doctor].id,
    kind,
    startsAt: ist(day, from),
    endsAt: ist(day, to),
  });
  const slots = async (doctor: string) =>
    (
      await appointments.getAvailableSlots(
        { doctorId: people[doctor].id, date: DATE, durationMinutes: 30 },
        branchId,
      )
    ).availableSlots;
  const book = (doctor: string, slot: string, branch = branchId) =>
    appointments.create(
      { patientId: patient.id, doctorId: people[doctor].id, date: DATE, slot },
      branch,
    );
  const seedLeave = (
    doctorId: string,
    branch: string,
    kind: 'LEAVE' | 'BLOCKED' | 'HOLIDAY',
    from: string,
    to: string,
  ) =>
    db.doctorTimeOff.create({
      data: {
        branchId: branch,
        doctorId: kind === 'HOLIDAY' ? null : doctorId,
        kind,
        startsAt: new Date(ist(DATE, from)),
        endsAt: new Date(ist(DATE, to)),
      },
    });

  beforeAll(async () => {
    fixture = await localDatabase(
      process.env.DOCTOR_AVAILABILITY_TEST_DATABASE_URL!,
    );
    db = fixture.prisma;
    branchId = (
      await db.branch.create({
        data: { name: 'SYNTHETIC Availability', address: 'Test' },
      })
    ).id;
    otherBranchId = (
      await db.branch.create({
        data: { name: 'SYNTHETIC Elsewhere', address: 'Test' },
      })
    ).id;
    const make = async (
      name: string,
      role: string,
      branch = branchId,
      permissions?: string[],
    ) => {
      people[name] = await db.user.create({
        data: {
          branchId: branch,
          firstName: 'Synthetic',
          lastName: name,
          email: `${randomUUID()}@example.invalid`,
          password: 'NO_LOGIN',
          role: role as never,
          permissions: permissions && JSON.stringify(permissions),
        },
      });
    };
    await make('owner', 'OWNER');
    await make('admin', 'ADMIN');
    await make('doctorA', 'DOCTOR');
    await make('doctorB', 'DOCTOR');
    await make('remoteDoctor', 'DOCTOR', otherBranchId);
    await make('remoteAdmin', 'ADMIN', otherBranchId);
    await make('nurseWithRead', 'NURSE', branchId, ['appointments:read']);
    await make('receptionWithRead', 'RECEPTION', branchId, [
      'appointments:read',
    ]);
    await make('receptionNoGrant', 'RECEPTION');
    await make('pharmacist', 'PHARMACIST', branchId, ['appointments:read']);
    await make('patientUser', 'PATIENT', branchId, ['appointments:read']);
    patient = await db.patient.create({
      data: {
        branchId,
        name: 'SYNTHETIC Patient',
        phone: '0000000000',
        gender: 'FEMALE',
      },
    });
    appointments = new AppointmentsService(db as PrismaService);
    const module = await Test.createTestingModule({
      controllers: [DoctorAvailabilityController],
      providers: [
        DoctorAvailabilityService,
        { provide: PrismaService, useValue: db },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.use(async (req: any, _res: any, next: () => void) => {
      const id = req.headers['x-test-user'];
      const found = id ? await db.user.findUnique({ where: { id } }) : null;
      req.user = found && {
        id: found.id,
        branchId: found.branchId,
        role: found.role,
      };
      next();
    });
    const reflector = new Reflector();
    app.useGlobalGuards(
      new RolesGuard(reflector),
      new PermissionsGuard(reflector, db as PrismaService),
    );
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  }, 90000);

  afterAll(async () => {
    await app?.close();
    await fixture?.cleanup();
  });

  afterEach(async () => {
    await db.appointment.deleteMany({});
    await db.doctorTimeOff.deleteMany({});
    await db.doctorWorkingHours.deleteMany({});
  });

  describe('doctor-availability-route-access', () => {
    it.each([
      'owner',
      'admin',
      'doctorA',
      'nurseWithRead',
      'receptionWithRead',
    ])('lets %s read availability, a day and holidays', async (name) => {
      await as(name)
        .get(`/doctor-availability/${people.doctorB.id}`)
        .expect(200);
      await as(name)
        .get(`/doctor-availability/${people.doctorB.id}/day?date=${DATE}`)
        .expect(200);
      await as(name).get('/doctor-availability/holidays').expect(200);
    });

    it.each(['receptionNoGrant', 'pharmacist', 'patientUser'])(
      'refuses %s every read',
      async (name) => {
        await as(name)
          .get(`/doctor-availability/${people.doctorB.id}`)
          .expect(403);
        await as(name).get('/doctor-availability/holidays').expect(403);
      },
    );

    it.each([
      'nurseWithRead',
      'receptionWithRead',
      'receptionNoGrant',
      'pharmacist',
      'patientUser',
    ])('refuses %s every write', async (name) => {
      await as(name)
        .put(`/doctor-availability/${people.doctorA.id}/hours`)
        .send({ hours: HOURS })
        .expect(403);
      await timeOff(name, leave('doctorA', 'LEAVE', '00:00', '23:00')).expect(
        403,
      );
      await timeOff(name, {
        kind: 'HOLIDAY',
        startsAt: ist(DATE, '00:00'),
        endsAt: ist(NEXT, '00:00'),
      }).expect(403);
      expect(await db.doctorWorkingHours.count()).toBe(0);
      expect(await db.doctorTimeOff.count()).toBe(0);
    });
  });

  describe('doctor-hours-edit-access', () => {
    it.each(['owner', 'admin'])(
      'lets %s replace any doctor in the branch',
      async (name) => {
        await as(name)
          .put(`/doctor-availability/${people.doctorA.id}/hours`)
          .send({ hours: HOURS })
          .expect(200);
        expect(
          await db.doctorWorkingHours.count({
            where: { doctorId: people.doctorA.id },
          }),
        ).toBe(1);
      },
    );

    it('lets a doctor replace their own hours but not a colleague’s', async () => {
      await as('doctorA')
        .put(`/doctor-availability/${people.doctorA.id}/hours`)
        .send({ hours: HOURS })
        .expect(200);
      await as('doctorA')
        .put(`/doctor-availability/${people.doctorB.id}/hours`)
        .send({ hours: HOURS })
        .expect(403);
      expect(
        await db.doctorWorkingHours.count({
          where: { doctorId: people.doctorB.id },
        }),
      ).toBe(0);
    });

    it('treats a doctor of another branch as missing, even for an admin', async () => {
      await as('admin')
        .put(`/doctor-availability/${people.remoteDoctor.id}/hours`)
        .send({ hours: HOURS })
        .expect(404);
      await as('remoteDoctor')
        .put(`/doctor-availability/${people.doctorA.id}/hours`)
        .send({ hours: HOURS })
        .expect(403);
      await as('remoteAdmin')
        .put(`/doctor-availability/${people.doctorA.id}/hours`)
        .send({ hours: HOURS })
        .expect(404);
    });

    it.each([
      ['empty list', []],
      [
        'overlapping shifts',
        [
          { weekday: 1, start: '09:00', end: '12:00' },
          { weekday: 1, start: '11:00', end: '13:00' },
        ],
      ],
      ['end before start', [{ weekday: 1, start: '12:00', end: '09:00' }]],
      ['bad weekday', [{ weekday: 9, start: '09:00', end: '10:00' }]],
    ])('rejects %s and keeps the stored hours', async (_name, hours) => {
      await as('admin')
        .put(`/doctor-availability/${people.doctorA.id}/hours`)
        .send({ hours: HOURS })
        .expect(200);
      await as('admin')
        .put(`/doctor-availability/${people.doctorA.id}/hours`)
        .send({ hours })
        .expect(400);
      const stored = await db.doctorWorkingHours.findMany({
        where: { doctorId: people.doctorA.id },
      });
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        weekday: 1,
        startMinute: 540,
        endMinute: 600,
      });
    });
  });

  describe('time-off-edit-access and time-off-delete-access', () => {
    it.each(['owner', 'admin'])(
      'lets %s add and remove leave for any doctor in the branch',
      async (name) => {
        const added = await timeOff(
          name,
          leave('doctorA', 'LEAVE', '00:00', '23:00'),
        ).expect(201);
        await as(name)
          .delete(`/doctor-availability/time-off/${added.body.id}`)
          .expect(200);
        expect(await db.doctorTimeOff.count()).toBe(0);
      },
    );

    it('lets a doctor manage only their own leave and blocked time', async () => {
      const own = await timeOff(
        'doctorA',
        leave('doctorA', 'BLOCKED', '10:00', '10:30'),
      ).expect(201);
      await timeOff(
        'doctorA',
        leave('doctorB', 'LEAVE', '00:00', '23:00'),
      ).expect(403);
      const theirs = await timeOff(
        'admin',
        leave('doctorB', 'LEAVE', '00:00', '23:00'),
      ).expect(201);
      await as('doctorA')
        .delete(`/doctor-availability/time-off/${theirs.body.id}`)
        .expect(403);
      expect(
        await db.doctorTimeOff.count({ where: { id: theirs.body.id } }),
      ).toBe(1);
      await as('doctorA')
        .delete(`/doctor-availability/time-off/${own.body.id}`)
        .expect(200);
    });

    it.each(['owner', 'admin'])(
      'lets %s add and remove a branch holiday',
      async (name) => {
        const holiday = await timeOff(name, {
          kind: 'HOLIDAY',
          startsAt: ist(DATE, '00:00'),
          endsAt: ist(NEXT, '00:00'),
        }).expect(201);
        expect(holiday.body.doctorId).toBeNull();
        await as(name)
          .delete(`/doctor-availability/time-off/${holiday.body.id}`)
          .expect(200);
      },
    );

    it('keeps holidays away from doctors, including a doctor-scoped holiday', async () => {
      await timeOff('doctorA', {
        kind: 'HOLIDAY',
        startsAt: ist(DATE, '00:00'),
        endsAt: ist(NEXT, '00:00'),
      }).expect(403);
      await timeOff('doctorA', {
        ...leave('doctorA', 'HOLIDAY', '00:00', '23:00'),
      }).expect(403);
      const holiday = await seedLeave(
        people.doctorA.id,
        branchId,
        'HOLIDAY',
        '00:00',
        '23:00',
      );
      await as('doctorA')
        .delete(`/doctor-availability/time-off/${holiday.id}`)
        .expect(403);
      expect(await db.doctorTimeOff.count({ where: { id: holiday.id } })).toBe(
        1,
      );
    });

    it('rejects leave without a doctor and leave for a doctor of another branch', async () => {
      await timeOff('admin', {
        kind: 'LEAVE',
        startsAt: ist(DATE, '00:00'),
        endsAt: ist(NEXT, '00:00'),
      }).expect(400);
      await timeOff(
        'admin',
        leave('remoteDoctor', 'LEAVE', '00:00', '23:00'),
      ).expect(404);
      expect(await db.doctorTimeOff.count()).toBe(0);
    });

    it('cannot remove time off of another branch', async () => {
      const remote = await seedLeave(
        people.remoteDoctor.id,
        otherBranchId,
        'LEAVE',
        '00:00',
        '23:00',
      );
      await as('admin')
        .delete(`/doctor-availability/time-off/${remote.id}`)
        .expect(404);
      await as('owner')
        .delete(`/doctor-availability/time-off/${remote.id}`)
        .expect(404);
      expect(await db.doctorTimeOff.count({ where: { id: remote.id } })).toBe(
        1,
      );
    });
  });

  describe('time-off-range-validation', () => {
    it.each([
      ['ends before it starts', ist(DATE, '10:00'), ist(DATE, '09:00'), 400],
      ['has no length', ist(DATE, '10:00'), ist(DATE, '10:00'), 400],
      [
        'spans 366 days',
        '2099-01-01T00:00:00+05:30',
        '2100-01-02T00:00:00+05:30',
        201,
      ],
      [
        'spans more than 366 days',
        '2099-01-01T00:00:00+05:30',
        '2100-01-02T00:00:01+05:30',
        400,
      ],
    ])(
      'time off that %s returns %i',
      async (_name, startsAt, endsAt, status) => {
        await timeOff('admin', {
          doctorId: people.doctorA.id,
          kind: 'LEAVE',
          startsAt,
          endsAt,
        }).expect(status);
        expect(await db.doctorTimeOff.count()).toBe(status === 201 ? 1 : 0);
      },
    );
  });

  describe('time-off-scope-and-boundaries', () => {
    it('merges overlapping leave so every covered slot disappears once', async () => {
      await seedLeave(people.doctorA.id, branchId, 'BLOCKED', '10:00', '11:00');
      await seedLeave(people.doctorA.id, branchId, 'LEAVE', '10:30', '11:30');
      const free = await slots('doctorA');
      expect(free).not.toContain('10:00-10:30');
      expect(free).not.toContain('11:00-11:30');
      expect(free).toContain('09:30-10:00');
      expect(free).toContain('11:30-12:00');
      await expect(book('doctorA', '11:00-11:30')).rejects.toMatchObject({
        status: 409,
      });
      await book('doctorA', '11:30-12:00');
    });

    it('does not block the slot that starts when leave ends', async () => {
      await seedLeave(people.doctorA.id, branchId, 'BLOCKED', '10:00', '10:30');
      const free = await slots('doctorA');
      expect(free).toContain('10:30-11:00');
      expect(free).not.toContain('10:00-10:30');
      await book('doctorA', '10:30-11:00');
      await expect(book('doctorA', '10:00-10:30')).rejects.toMatchObject({
        status: 409,
      });
    });

    it('does not block the slot that ends when leave starts', async () => {
      await seedLeave(people.doctorA.id, branchId, 'BLOCKED', '11:00', '11:30');
      expect(await slots('doctorA')).toContain('10:30-11:00');
      await book('doctorA', '10:30-11:00');
    });

    it('blocks a slot that only partly overlaps leave', async () => {
      await seedLeave(people.doctorA.id, branchId, 'BLOCKED', '10:15', '10:45');
      const free = await slots('doctorA');
      expect(free).not.toContain('10:00-10:30');
      expect(free).not.toContain('10:30-11:00');
      await expect(book('doctorA', '10:00-10:30')).rejects.toMatchObject({
        status: 409,
      });
    });

    it('lists a slot as free exactly when booking it is accepted', async () => {
      await seedLeave(people.doctorA.id, branchId, 'BLOCKED', '09:45', '10:30');
      await seedLeave(people.doctorA.id, branchId, 'LEAVE', '13:00', '14:00');
      await seedLeave(people.doctorA.id, branchId, 'HOLIDAY', '16:15', '16:45');
      const free = await slots('doctorA');
      const all = await appointments.getAvailableSlots(
        { doctorId: people.doctorA.id, date: DATE, durationMinutes: 30 },
        branchId,
      );
      expect(all.timeOff.length).toBe(3);
      const attempted: Record<string, number> = {};
      for (let minute = 9 * 60; minute < 18 * 60; minute += 30) {
        const hhmm = (m: number) =>
          `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        const slot = `${hhmm(minute)}-${hhmm(minute + 30)}`;
        attempted[slot] = await book('doctorA', slot).then(
          () => 201,
          (error: { status: number }) => error.status,
        );
      }
      expect(
        Object.keys(attempted).filter((slot) => attempted[slot] === 201),
      ).toEqual(free);
      expect(
        Object.values(attempted).filter(
          (status) => status !== 201 && status !== 409,
        ),
      ).toEqual([]);
    });

    it('ignores another doctor’s leave and another branch’s leave and holiday', async () => {
      await seedLeave(people.doctorB.id, branchId, 'LEAVE', '00:00', '23:59');
      await seedLeave(
        people.remoteDoctor.id,
        otherBranchId,
        'LEAVE',
        '00:00',
        '23:59',
      );
      await seedLeave(
        people.remoteDoctor.id,
        otherBranchId,
        'HOLIDAY',
        '00:00',
        '23:59',
      );
      expect(await slots('doctorA')).toHaveLength(18);
      await book('doctorA', '12:00-12:30');
      const view = await as('admin')
        .get(
          `/doctor-availability/${people.doctorA.id}?from=${DATE}&to=${DATE}`,
        )
        .expect(200);
      expect(view.body.timeOff).toEqual([]);
      await as('admin')
        .get(`/doctor-availability/${people.remoteDoctor.id}`)
        .expect(404);
      await as('admin')
        .get(`/doctor-availability/${people.remoteDoctor.id}/day?date=${DATE}`)
        .expect(404);
    });

    it('applies a branch holiday only to the branch that declared it', async () => {
      await seedLeave(people.doctorA.id, branchId, 'HOLIDAY', '00:00', '23:59');
      expect(await slots('doctorA')).toEqual([]);
      const remote = await appointments.getAvailableSlots(
        { doctorId: people.remoteDoctor.id, date: DATE, durationMinutes: 30 },
        otherBranchId,
      );
      expect(remote.availableSlots).toHaveLength(18);
      const listed = await as('remoteAdmin')
        .get('/doctor-availability/holidays')
        .expect(200);
      expect(listed.body).toEqual([]);
    });
  });
});
