import { PrismaClient, User } from '@prisma/client';
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
import { ClinicInvestigationsController } from './clinic-investigations.controller';
import { ClinicInvestigationsService } from './clinic-investigations.service';

const databaseTests = process.env.CLINIC_INVESTIGATIONS_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Clinic investigations against PostgreSQL', () => {
  const schema = `clinic_investigations_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let created = false;
  let app: INestApplication;
  let doctor: User;
  let otherBranchDoctor: User;
  let reception: User;

  const http = (user: User) => ({
    get: (url: string) => requestHttp(app.getHttpServer()).get(url).set('x-test-user', user.id),
    post: (url: string) => requestHttp(app.getHttpServer()).post(url).set('x-test-user', user.id),
    patch: (url: string) => requestHttp(app.getHttpServer()).patch(url).set('x-test-user', user.id),
    delete: (url: string) => requestHttp(app.getHttpServer()).delete(url).set('x-test-user', user.id),
  });
  const list = async (user: User) => (await http(user).get('/clinic-investigations').expect(200)).body;

  beforeAll(async () => {
    const url = new URL(process.env.CLINIC_INVESTIGATIONS_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    const branchId = (await db.branch.create({ data: { name: 'SYNTHETIC Investigations', address: 'Test' } })).id;
    const otherBranchId = (await db.branch.create({ data: { name: 'SYNTHETIC Other', address: 'Test' } })).id;
    const user = (branch: string, role: 'DOCTOR' | 'RECEPTION') => db.user.create({
      data: { branchId: branch, firstName: 'Synthetic', lastName: role, email: `${randomUUID()}@example.invalid`, password: 'NO_LOGIN', role },
    });
    doctor = await user(branchId, 'DOCTOR');
    reception = await user(branchId, 'RECEPTION');
    otherBranchDoctor = await user(otherBranchId, 'DOCTOR');
    const module = await Test.createTestingModule({
      controllers: [ClinicInvestigationsController],
      providers: [ClinicInvestigationsService, { provide: PrismaService, useValue: db }],
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
    await db.clinicInvestigation.deleteMany({});
  });

  it('lists a created investigation with its literal name', async () => {
    const res = await http(doctor).post('/clinic-investigations').send({ name: 'MRI Brain' }).expect(201);
    expect(await list(doctor)).toEqual([{ id: res.body.id, name: 'MRI Brain' }]);
  });

  it('sorts the list by name ignoring case', async () => {
    for (const name of ['zinc level', 'Beta HCG', 'albumin']) await http(doctor).post('/clinic-investigations').send({ name }).expect(201);
    expect((await list(doctor)).map((row: { name: string }) => row.name)).toEqual(['albumin', 'Beta HCG', 'zinc level']);
  });

  it('returns the existing row when the same name is created again with different case and spacing', async () => {
    const first = await http(doctor).post('/clinic-investigations').send({ name: 'MRI Brain' }).expect(201);
    const second = await http(doctor).post('/clinic-investigations').send({ name: '  mri   BRAIN ' });
    expect(second.status).toBeLessThan(300);
    expect(second.body).toEqual({ id: first.body.id, name: 'MRI Brain' });
    expect(await list(doctor)).toHaveLength(1);
  });

  it('rejects blank and over-long names', async () => {
    await http(doctor).post('/clinic-investigations').send({ name: '   ' }).expect(400);
    await http(doctor).post('/clinic-investigations').send({ name: 'x'.repeat(101) }).expect(400);
    await http(doctor).post('/clinic-investigations').send({}).expect(400);
  });

  it('renames an investigation', async () => {
    const row = (await http(doctor).post('/clinic-investigations').send({ name: 'MRI Brain' }).expect(201)).body;
    const renamed = await http(doctor).patch(`/clinic-investigations/${row.id}`).send({ name: ' MRI  Brain contrast ' }).expect(200);
    expect(renamed.body).toEqual({ id: row.id, name: 'MRI Brain contrast' });
    expect(await list(doctor)).toEqual([{ id: row.id, name: 'MRI Brain contrast' }]);
  });

  it('answers 409 when renaming onto another existing name', async () => {
    await http(doctor).post('/clinic-investigations').send({ name: 'MRI Brain' }).expect(201);
    const other = (await http(doctor).post('/clinic-investigations').send({ name: 'CT Brain' }).expect(201)).body;
    await http(doctor).patch(`/clinic-investigations/${other.id}`).send({ name: 'mri brain' }).expect(409);
    expect((await list(doctor)).map((row: { name: string }) => row.name)).toEqual(['CT Brain', 'MRI Brain']);
  });

  it('deletes an investigation', async () => {
    const row = (await http(doctor).post('/clinic-investigations').send({ name: 'MRI Brain' }).expect(201)).body;
    await http(doctor).delete(`/clinic-investigations/${row.id}`).expect(200);
    expect(await list(doctor)).toEqual([]);
  });

  it("hides one branch's investigations from another branch and blocks rename and delete with 404", async () => {
    const row = (await http(doctor).post('/clinic-investigations').send({ name: 'MRI Brain' }).expect(201)).body;
    expect(await list(otherBranchDoctor)).toEqual([]);
    await http(otherBranchDoctor).patch(`/clinic-investigations/${row.id}`).send({ name: 'Stolen' }).expect(404);
    await http(otherBranchDoctor).delete(`/clinic-investigations/${row.id}`).expect(404);
    expect(await list(doctor)).toEqual([{ id: row.id, name: 'MRI Brain' }]);
  });

  it('lets two branches hold the same name independently', async () => {
    await http(doctor).post('/clinic-investigations').send({ name: 'MRI Brain' }).expect(201);
    await http(otherBranchDoctor).post('/clinic-investigations').send({ name: 'MRI Brain' }).expect(201);
    expect(await list(doctor)).toHaveLength(1);
    expect(await list(otherBranchDoctor)).toHaveLength(1);
  });

  it('forbids reception from creating', async () => {
    await http(reception).post('/clinic-investigations').send({ name: 'MRI Brain' }).expect(403);
    expect(await db.clinicInvestigation.count()).toBe(0);
  });
});
