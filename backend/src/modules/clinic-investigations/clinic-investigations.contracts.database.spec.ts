import { PrismaClient, User } from '@prisma/client';
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
import { ClinicInvestigationsController } from './clinic-investigations.controller';
import { ClinicInvestigationsService } from './clinic-investigations.service';

const databaseTests = process.env.CLINIC_INVESTIGATIONS_TEST_DATABASE_URL
  ? describe
  : describe.skip;
databaseTests('Clinic investigation contracts against PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let db: PrismaClient;
  let app: INestApplication;
  let branchId: string;
  let otherBranchId: string;
  const people: Record<string, User> = {};

  const as = (name: string) => {
    const http = () => requestHttp(app.getHttpServer());
    const id = people[name].id;
    return {
      get: (url: string) => http().get(url).set('x-test-user', id),
      post: (url: string) => http().post(url).set('x-test-user', id),
      patch: (url: string) => http().patch(url).set('x-test-user', id),
      delete: (url: string) => http().delete(url).set('x-test-user', id),
    };
  };
  const create = (name: unknown, who = 'doctor') =>
    as(who).post('/clinic-investigations').send({ name });
  const names = async (who = 'doctor') =>
    (
      (await as(who).get('/clinic-investigations').expect(200)).body as {
        name: string;
      }[]
    ).map((row) => row.name);

  beforeAll(async () => {
    fixture = await localDatabase(
      process.env.CLINIC_INVESTIGATIONS_TEST_DATABASE_URL!,
    );
    db = fixture.prisma;
    branchId = (
      await db.branch.create({
        data: { name: 'SYNTHETIC Investigations', address: 'Test' },
      })
    ).id;
    otherBranchId = (
      await db.branch.create({
        data: { name: 'SYNTHETIC Other', address: 'Test' },
      })
    ).id;
    const make = async (name: string, role: string, branch = branchId) => {
      people[name] = await db.user.create({
        data: {
          branchId: branch,
          firstName: 'Synthetic',
          lastName: name,
          email: `${randomUUID()}@example.invalid`,
          password: 'NO_LOGIN',
          role: role as never,
        },
      });
    };
    await make('owner', 'OWNER');
    await make('admin', 'ADMIN');
    await make('doctor', 'DOCTOR');
    await make('nurse', 'NURSE');
    await make('reception', 'RECEPTION');
    await make('pharmacist', 'PHARMACIST');
    await make('patientUser', 'PATIENT');
    await make('remoteDoctor', 'DOCTOR', otherBranchId);
    const module = await Test.createTestingModule({
      controllers: [ClinicInvestigationsController],
      providers: [
        ClinicInvestigationsService,
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
    await db.clinicInvestigation.deleteMany({});
  });

  describe('clinic-investigation-route-access', () => {
    it.each(['owner', 'admin', 'doctor'])(
      'lets %s create, list, rename and delete',
      async (who) => {
        const row = (await create('Lipid Profile', who).expect(201)).body;
        expect(await names(who)).toEqual(['Lipid Profile']);
        await as(who)
          .patch(`/clinic-investigations/${row.id}`)
          .send({ name: 'Lipid Panel' })
          .expect(200);
        await as(who).delete(`/clinic-investigations/${row.id}`).expect(200);
        expect(await db.clinicInvestigation.count()).toBe(0);
      },
    );

    it('lets a nurse read the list but not change it', async () => {
      const row = (await create('CBC').expect(201)).body;
      expect(await names('nurse')).toEqual(['CBC']);
      await create('ECG', 'nurse').expect(403);
      await as('nurse')
        .patch(`/clinic-investigations/${row.id}`)
        .send({ name: 'Complete Blood Count' })
        .expect(403);
      await as('nurse').delete(`/clinic-investigations/${row.id}`).expect(403);
      expect(
        await db.clinicInvestigation.findMany({ select: { name: true } }),
      ).toEqual([{ name: 'CBC' }]);
    });

    it.each(['reception', 'pharmacist', 'patientUser'])(
      'refuses %s every route',
      async (who) => {
        const row = (await create('CBC').expect(201)).body;
        await as(who).get('/clinic-investigations').expect(403);
        await create('ECG', who).expect(403);
        await as(who)
          .patch(`/clinic-investigations/${row.id}`)
          .send({ name: 'Renamed' })
          .expect(403);
        await as(who).delete(`/clinic-investigations/${row.id}`).expect(403);
        expect(
          await db.clinicInvestigation.findMany({ select: { name: true } }),
        ).toEqual([{ name: 'CBC' }]);
      },
    );

    it('does not reach the service without a signed-in user', async () => {
      await requestHttp(app.getHttpServer())
        .get('/clinic-investigations')
        .expect(403);
      await requestHttp(app.getHttpServer())
        .post('/clinic-investigations')
        .send({ name: 'CBC' })
        .expect(403);
      expect(await db.clinicInvestigation.count()).toBe(0);
    });
  });

  describe('clinic-investigation-name-input', () => {
    it.each([
      ['a blank name', '   '],
      ['an empty name', ''],
      ['a missing name', undefined],
      ['a number', 42],
      ['a list', ['CBC']],
      ['a 101-character name', 'x'.repeat(101)],
    ])('rejects %s', async (_label, name) => {
      await create(name).expect(400);
      expect(await db.clinicInvestigation.count()).toBe(0);
    });

    it('accepts exactly 100 characters, also when padded with spaces', async () => {
      const name = 'y'.repeat(100);
      await create(`  ${name}  `).expect(201);
      expect(await names()).toEqual([name]);
    });

    it('counts the collapsed length, not the typed length', async () => {
      await create(`a${' '.repeat(40)}b`).expect(201);
      expect(await names()).toEqual(['a b']);
    });

    it('rejects a rename to a blank or over-long name and keeps the row', async () => {
      const row = (await create('CBC').expect(201)).body;
      await as('doctor')
        .patch(`/clinic-investigations/${row.id}`)
        .send({ name: '  ' })
        .expect(400);
      await as('doctor')
        .patch(`/clinic-investigations/${row.id}`)
        .send({ name: 'z'.repeat(101) })
        .expect(400);
      expect(await names()).toEqual(['CBC']);
    });

    it('ignores fields other than name', async () => {
      const row = (
        await as('doctor')
          .post('/clinic-investigations')
          .send({ name: 'CBC', branchId: otherBranchId, id: 'forced' })
          .expect(201)
      ).body;
      expect(row.id).not.toBe('forced');
      expect(Object.keys(row).sort()).toEqual(['id', 'name']);
      const stored = await db.clinicInvestigation.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(stored.branchId).toBe(branchId);
      expect(stored.createdById).toBe(people.doctor.id);
    });
  });

  describe('clinic-investigation-create-once', () => {
    it.each([
      ['different case', 'mri brain'],
      ['extra spaces', '  MRI    Brain  '],
      ['tabs and line breaks', 'MRI\tBrain\n'],
      ['case and spaces together', ' mRi   bRAIN '],
      ['a non-breaking space', 'MRI Brain'],
    ])(
      'returns the first row when created again with %s',
      async (_label, again) => {
        const first = (await create('MRI Brain').expect(201)).body;
        const second = await create(again);
        expect(second.status).toBeLessThan(300);
        expect(second.body).toEqual({ id: first.id, name: 'MRI Brain' });
        expect(await db.clinicInvestigation.count()).toBe(1);
      },
    );

    it('keeps names that differ by a letter or by an inner space apart', async () => {
      await create('MRI Brain').expect(201);
      await create('MRI Brains').expect(201);
      await create('MRIBrain').expect(201);
      expect(await db.clinicInvestigation.count()).toBe(3);
    });

    it('creates one row when equal requests arrive together', async () => {
      const variants = [
        'Thyroid Panel',
        'thyroid panel',
        ' THYROID   PANEL',
        'Thyroid  Panel ',
        'thyroid\tpanel',
        'THYROID PANEL',
      ];
      const responses = await Promise.all(variants.map((name) => create(name)));
      expect(
        responses.map((res) => res.status).every((status) => status < 300),
      ).toBe(true);
      expect(new Set(responses.map((res) => res.body.id)).size).toBe(1);
      expect(await db.clinicInvestigation.count()).toBe(1);
    });

    it('lets a different doctor of the same branch reuse the clinic’s row', async () => {
      const first = (await create('ECG', 'doctor').expect(201)).body;
      const again = (await create('ecg', 'admin')).body;
      expect(again.id).toBe(first.id);
    });
  });

  describe('clinic-investigation-rename-unique', () => {
    it('stores the new spelling normalized and returns it', async () => {
      const row = (await create('MRI Brain').expect(201)).body;
      const renamed = await as('doctor')
        .patch(`/clinic-investigations/${row.id}`)
        .send({ name: ' MRI  Brain   contrast ' })
        .expect(200);
      expect(renamed.body).toEqual({ id: row.id, name: 'MRI Brain contrast' });
      expect(
        (
          await db.clinicInvestigation.findUniqueOrThrow({
            where: { id: row.id },
          })
        ).normalizedName,
      ).toBe('mri brain contrast');
    });

    it('lets a row change only the case or spacing of its own name', async () => {
      const row = (await create('mri brain').expect(201)).body;
      const renamed = await as('doctor')
        .patch(`/clinic-investigations/${row.id}`)
        .send({ name: 'MRI  BRAIN' })
        .expect(200);
      expect(renamed.body.name).toBe('MRI BRAIN');
      expect(await db.clinicInvestigation.count()).toBe(1);
    });

    it.each([
      ['the same case', 'MRI Brain'],
      ['another case', 'mri BRAIN'],
      ['other spacing', '  mri    brain '],
    ])(
      'answers 409 when renamed onto an existing name with %s',
      async (_label, target) => {
        await create('MRI Brain').expect(201);
        const other = (await create('CT Brain').expect(201)).body;
        await as('doctor')
          .patch(`/clinic-investigations/${other.id}`)
          .send({ name: target })
          .expect(409);
        expect((await names()).sort()).toEqual(['CT Brain', 'MRI Brain']);
      },
    );

    it('lists rows in name order regardless of case and after a rename', async () => {
      await create('zinc level').expect(201);
      const beta = (await create('Beta HCG').expect(201)).body;
      await create('albumin').expect(201);
      expect(await names()).toEqual(['albumin', 'Beta HCG', 'zinc level']);
      await as('doctor')
        .patch(`/clinic-investigations/${beta.id}`)
        .send({ name: 'Zz Final' })
        .expect(200);
      expect(await names()).toEqual(['albumin', 'zinc level', 'Zz Final']);
    });
  });

  describe('clinic-investigation-branch-isolation', () => {
    it('hides another branch’s rows from the list', async () => {
      await create('MRI Brain').expect(201);
      await create('PET Scan', 'remoteDoctor').expect(201);
      expect(await names('doctor')).toEqual(['MRI Brain']);
      expect(await names('remoteDoctor')).toEqual(['PET Scan']);
    });

    it('answers 404 to rename and delete of another branch’s row and leaves it intact', async () => {
      const row = (await create('MRI Brain').expect(201)).body;
      await as('remoteDoctor')
        .patch(`/clinic-investigations/${row.id}`)
        .send({ name: 'Stolen' })
        .expect(404);
      await as('remoteDoctor')
        .delete(`/clinic-investigations/${row.id}`)
        .expect(404);
      expect(
        await db.clinicInvestigation.findUniqueOrThrow({
          where: { id: row.id },
        }),
      ).toMatchObject({ name: 'MRI Brain', branchId });
    });

    it('lets two branches hold the same name and keeps their rows separate', async () => {
      const a = (await create('MRI Brain').expect(201)).body;
      const b = (await create('mri brain', 'remoteDoctor').expect(201)).body;
      expect(a.id).not.toBe(b.id);
      expect(b.name).toBe('mri brain');
      expect(await db.clinicInvestigation.count()).toBe(2);
    });

    it('lets a branch rename onto a name only another branch holds', async () => {
      await create('PET Scan', 'remoteDoctor').expect(201);
      const row = (await create('CT Scan').expect(201)).body;
      await as('doctor')
        .patch(`/clinic-investigations/${row.id}`)
        .send({ name: 'pet scan' })
        .expect(200);
    });

    it('answers 404 for a missing id and for a second delete', async () => {
      const row = (await create('CBC').expect(201)).body;
      await as('doctor').delete(`/clinic-investigations/${row.id}`).expect(200);
      await as('doctor').delete(`/clinic-investigations/${row.id}`).expect(404);
      await as('doctor')
        .patch(`/clinic-investigations/${row.id}`)
        .send({ name: 'CBC' })
        .expect(404);
      await as('admin')
        .delete('/clinic-investigations/does-not-exist')
        .expect(404);
    });
  });
});
