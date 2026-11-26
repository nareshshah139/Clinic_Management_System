import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { diagnosticValidationPipe } from '../../../shared/logging/http-observability';
import { UsersController } from '../users.controller';
import { UsersService } from '../users.service';

const settings = JSON.stringify({ procedureAccess: { recordRoles: ['OWNER', 'ADMIN', 'DOCTOR', 'NURSE'] }, unrelated: 'kept' });
const clinic = (id: string, name: string) => ({ id, name, address: '1 Road', city: 'Mumbai', isActive: true, metadata: settings });

describe('branch edits stay inside the caller’s own clinic branch, over HTTP', () => {
  let app: INestApplication;
  let branches: Record<string, ReturnType<typeof clinic>>;
  let members: Record<string, number>;
  let audit: Array<Record<string, any>>;
  const db: any = {
    branch: {
      findUnique: jest.fn(async ({ where }: any) => (branches[where.id] ? { ...branches[where.id] } : null)),
      findFirst: jest.fn(async ({ where }: any) =>
        Object.values(branches).find((branch) => branch.name === where.name && branch.id !== where.id?.not) ?? null),
      update: jest.fn(async ({ where, data }: any) =>
        ({ ...Object.assign(branches[where.id], Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))) })),
      delete: jest.fn(async ({ where }: any) => { const gone = branches[where.id]; delete branches[where.id]; return gone; }),
    },
    user: { count: jest.fn(async ({ where }: any) => members[where.branchId] ?? 0) },
    auditLog: { create: jest.fn(async ({ data }: any) => { audit.push(data); return data; }) },
  };
  db.$transaction = async (work: (tx: any) => unknown) => work(db);

  const as = (role: string) => ({
    patch: (url: string, body: object) => request(app.getHttpServer()).patch(url).set('x-role', role).send(body),
    delete: (url: string) => request(app.getHttpServer()).delete(url).set('x-role', role),
  });
  const written = () => [db.branch.update, db.branch.delete, db.auditLog.create].flatMap((fn: jest.Mock) => fn.mock.calls);

  beforeAll(async () => {
    const authenticate = { canActivate: (context: any) => {
      const req = context.switchToHttp().getRequest();
      req.user = { id: `${req.headers['x-role']}-user`, branchId: 'branch-1', role: req.headers['x-role'] };
      return true;
    } };
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: new UsersService(db, {} as any) },
        { provide: APP_GUARD, useValue: authenticate },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).overrideGuard(JwtAuthGuard).useValue(authenticate).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(diagnosticValidationPipe());
    await app.init();
  });

  beforeEach(() => {
    branches = { 'branch-1': clinic('branch-1', 'Linae Main'), 'branch-2': clinic('branch-2', 'Linae Other') };
    members = { 'branch-1': 3, 'branch-2': 2 };
    audit = [];
    jest.clearAllMocks();
  });

  afterAll(() => app.close());

  it('answers a foreign branch exactly like a missing one and changes nothing', async () => {
    const missing = await as('OWNER').patch('/users/branches/no-such-branch', { name: 'Hijacked' }).expect(404);
    const foreignUpdate = await as('OWNER').patch('/users/branches/branch-2', { name: 'Hijacked', isActive: false }).expect(404);
    const foreignDelete = await as('ADMIN').delete('/users/branches/branch-2').expect(404);

    expect(foreignUpdate.body).toEqual(missing.body);
    expect(foreignDelete.body.message).toBe(missing.body.message);
    expect(branches['branch-2']).toEqual(clinic('branch-2', 'Linae Other'));
    expect(written()).toEqual([]);
  });

  it('saves details to the caller’s own branch without touching its other settings', async () => {
    const res = await as('OWNER').patch('/users/branches/branch-1', { name: 'Linae Central', city: 'Pune', metadata: '{}' }).expect(200);

    expect(res.body).toMatchObject({ id: 'branch-1', name: 'Linae Central', city: 'Pune' });
    expect(branches['branch-1']).toMatchObject({ name: 'Linae Central', city: 'Pune', address: '1 Road', metadata: settings });
  });

  it('ignores a settings object sent with the details', async () => {
    await as('DOCTOR').patch('/users/branches/branch-1', { address: '2 Road', metadata: { procedureAccess: { recordRoles: [] } } }).expect(200);

    expect(branches['branch-1']).toMatchObject({ address: '2 Road', metadata: settings });
  });

  it('writes one audit row naming the actor and only the fields that were sent', async () => {
    await as('ADMIN').patch('/users/branches/branch-1', { name: 'Linae Central', city: 'Pune' }).expect(200);

    expect(audit).toEqual([{
      userId: 'ADMIN-user', action: 'BRANCH_UPDATED', entity: 'Branch', entityId: 'branch-1',
      oldValues: expect.any(String), newValues: expect.any(String),
    }]);
    expect(JSON.parse(audit[0].oldValues)).toEqual({ name: 'Linae Main', city: 'Mumbai' });
    expect(JSON.parse(audit[0].newValues)).toEqual({ name: 'Linae Central', city: 'Pune' });
  });

  it('saves the clinic name trimmed, so a receipt heading never carries stray spaces', async () => {
    await as('ADMIN').patch('/users/branches/branch-1', { name: '  Linaé Skin, Hair and Aesthetic Clinic  ', gstNumber: ' 36AAAAA0000A1Z5 ' }).expect(200);

    expect(branches['branch-1']).toMatchObject({ name: 'Linaé Skin, Hair and Aesthetic Clinic', gstNumber: '36AAAAA0000A1Z5' });
  });

  it.each(['', '   ', ' a '])('refuses the blank or one-letter clinic name %j and changes nothing', async (name) => {
    await as('OWNER').patch('/users/branches/branch-1', { name }).expect(400);

    expect(branches['branch-1']).toEqual(clinic('branch-1', 'Linae Main'));
    expect(written()).toEqual([]);
  });

  it('still refuses a name another branch already uses', async () => {
    await as('OWNER').patch('/users/branches/branch-1', { name: 'Linae Other' }).expect(409);

    expect(branches['branch-1'].name).toBe('Linae Main');
    expect(written()).toEqual([]);
  });

  it('refuses to delete the caller’s own branch while people still belong to it', async () => {
    await as('OWNER').delete('/users/branches/branch-1').expect(400);

    expect(branches['branch-1']).toBeDefined();
    expect(written()).toEqual([]);
  });

  it('deletes the caller’s own emptied branch and audits it with what was removed', async () => {
    members['branch-1'] = 0;

    await as('OWNER').delete('/users/branches/branch-1').expect(200);

    expect(branches['branch-1']).toBeUndefined();
    expect(branches['branch-2']).toBeDefined();
    expect(audit).toEqual([{
      userId: 'OWNER-user', action: 'BRANCH_DELETED', entity: 'Branch', entityId: 'branch-1',
      oldValues: expect.any(String),
    }]);
    expect(JSON.parse(audit[0].oldValues)).toMatchObject({ name: 'Linae Main', address: '1 Road' });
  });

  describe('roles', () => {
    it.each(['OWNER', 'ADMIN', 'DOCTOR'])('lets %s edit their own branch', async (role) => {
      await as(role).patch('/users/branches/branch-1', { phone: '9999999999' }).expect(200);

      expect(branches['branch-1']).toMatchObject({ phone: '9999999999' });
      expect(audit[0]).toMatchObject({ userId: `${role}-user`, action: 'BRANCH_UPDATED' });
    });

    it.each(['MANAGER', 'NURSE', 'RECEPTION', 'PHARMACIST', 'ACCOUNTANT', 'LAB_TECH', 'PATIENT'])('keeps %s from editing or deleting any branch', async (role) => {
      await as(role).patch('/users/branches/branch-1', { phone: '9999999999' }).expect(403);
      await as(role).delete('/users/branches/branch-1').expect(403);

      expect(branches['branch-1']).toEqual(clinic('branch-1', 'Linae Main'));
      expect(written()).toEqual([]);
    });
  });
});
