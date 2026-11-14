import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import sharp from 'sharp';
import { UsersController } from '../users.controller';
import { UsersService } from '../users.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { diagnosticValidationPipe } from '../../../shared/logging/http-observability';

const row = (id: string, role: string) => ({
  id, role, branchId: 'branch', isActive: true, firstName: id, lastName: 'Synthetic', email: `${id}@example.test`,
  password: '$2b$10$synthetic-hash', resetToken: 'synthetic-reset', resetTokenExpiry: new Date(), googleRefreshToken: 'synthetic-refresh',
  permissions: null, revokedPermissions: null, metadata: role === 'DOCTOR' ? JSON.stringify({ whatsappAccessToken: 'synthetic-whatsapp-token', textSize: 'LARGE' }) : null, branch: { id: 'branch' },
});

const matches = (record: Record<string, unknown>, where: Record<string, unknown> = {}) =>
  Object.entries(where).every(([key, value]) => value === null || typeof value !== 'object' ? record[key] === value : true);

const MANAGERS = ['owner', 'admin', 'doctor'] as const;
const NON_MANAGERS = ['reception', 'pharmacist', 'nurse'] as const;

const MANAGER_WRITES = [
  ['post', '/users', { firstName: 'New', lastName: 'Person', email: 'new@example.test', password: 'Password1!', role: 'NURSE' }],
  ['patch', '/users/target', { firstName: 'Renamed' }],
  ['delete', '/users/target', undefined],
  ['patch', '/users/target/role', { role: 'ADMIN' }],
  ['patch', '/users/target/permissions', { permissions: ['all'] }],
  ['patch', '/users/target/status', { status: 'INACTIVE' }],
  ['post', '/users/branches', { name: 'New branch', address: '1 Road' }],
  ['patch', '/users/branches/empty-branch', { name: 'Renamed branch' }],
  ['delete', '/users/branches/empty-branch', undefined],
  ['post', '/users/permissions', { name: 'x.read', resource: 'x', action: 'read' }],
  ['patch', '/users/permissions/perm', { description: 'Changed' }],
  ['delete', '/users/permissions/perm', undefined],
  ['post', '/users/roles', { name: 'Auditor' }],
  ['patch', '/users/roles/role-admin', { description: 'Changed' }],
  ['delete', '/users/roles/role-admin', undefined],
] as const;

describe('/users access control', () => {
  let app: INestApplication;
  let png: Buffer;
  const users: Record<string, ReturnType<typeof row>> = {
    owner: row('owner', 'OWNER'), admin: row('admin', 'ADMIN'), doctor: row('doctor', 'DOCTOR'),
    reception: row('reception', 'RECEPTION'), pharmacist: row('pharmacist', 'PHARMACIST'), nurse: row('nurse', 'NURSE'),
    target: row('target', 'NURSE'), lab: row('lab', 'LAB_TECH'),
  };
  const roleRecord = { id: 'role-admin', name: 'ADMIN', permissions: null };
  const roleRecords: Record<string, { permissions: string | null }> = {
    ADMIN: roleRecord,
    NURSE: { permissions: JSON.stringify(['appointments:read', 'visits:read', 'patients:read']) },
  };
  const branchRecord = { id: 'empty-branch', name: 'Empty' };
  const permissionRecord = { id: 'perm', name: 'appointments:read' };
  const byWhere = (where: any) => Object.values(users).find(user => matches(user, where)) ?? null;
  const db: any = {
    user: {
      findMany: jest.fn(async () => Object.values(users)),
      count: jest.fn(async ({ where }) => Object.values(users).filter(user => matches(user, where)).length),
      groupBy: jest.fn(async () => []),
      findFirst: jest.fn(async ({ where }) => byWhere(where)),
      findUnique: jest.fn(async ({ where }) => users[where.id] ?? null),
      create: jest.fn(async ({ data }) => ({ ...data, id: 'created' })),
      update: jest.fn(async ({ where, data }) => ({ ...users[where.id], ...data })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      delete: jest.fn(async ({ where }) => users[where.id]),
    },
    role: {
      findFirst: jest.fn(async ({ where }) => roleRecords[where.name] ?? null),
      findMany: jest.fn(async () => [roleRecord]),
      count: jest.fn(async () => 1),
      findUnique: jest.fn(async ({ where }) => where.id === roleRecord.id ? roleRecord : null),
      create: jest.fn(async ({ data }) => ({ ...data, id: 'created' })),
      update: jest.fn(async ({ data }) => ({ ...roleRecord, ...data })),
      delete: jest.fn(async () => roleRecord),
    },
    branch: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => [branchRecord]),
      count: jest.fn(async () => 1),
      findUnique: jest.fn(async ({ where }) => where.id === branchRecord.id ? branchRecord : null),
      create: jest.fn(async ({ data }) => ({ ...data, id: 'created' })),
      update: jest.fn(async ({ data }) => ({ ...branchRecord, ...data })),
      delete: jest.fn(async () => branchRecord),
    },
    permission: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => [permissionRecord]),
      count: jest.fn(async () => 1),
      findUnique: jest.fn(async ({ where }) => where.id === permissionRecord.id ? permissionRecord : null),
      create: jest.fn(async ({ data }) => ({ ...data, id: 'created' })),
      update: jest.fn(async ({ data }) => ({ ...permissionRecord, ...data })),
      delete: jest.fn(async () => permissionRecord),
    },
    clinicAsset: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      create: jest.fn(async ({ data }) => ({ id: 'asset', url: data.url })),
    },
    appointment: { count: jest.fn(async () => 0) },
    visit: { count: jest.fn(async () => 0) },
  };
  db.$transaction = jest.fn(async (work: (tx: any) => unknown) => work(db));
  const writes = () => ['user', 'role', 'branch', 'permission', 'clinicAsset']
    .flatMap(model => ['create', 'update', 'updateMany', 'delete'].map(op => db[model][op]).filter(Boolean))
    .flatMap((fn: jest.Mock) => fn.mock.calls);
  const as = (id: string) => ({ 'x-user': id });
  const send = (method: string, path: string, user: string, body?: object) =>
    (request(app.getHttpServer()) as any)[method](path).set(as(user)).send(body);

  beforeAll(async () => {
    png = await sharp({ create: { width: 4, height: 4, channels: 4, background: '#000' } }).png().toBuffer();
    const authenticate = { canActivate: (context: any) => {
      const req = context.switchToHttp().getRequest();
      const user = users[req.headers['x-user']];
      if (!user) return false;
      req.user = { id: user.id, role: user.role, branchId: user.branchId };
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
  beforeEach(() => jest.clearAllMocks());
  afterAll(() => app.close());

  it('never returns password hashes or tokens', async () => {
    const list = await request(app.getHttpServer()).get('/users').set(as('reception')).expect(200);
    const one = await request(app.getHttpServer()).get('/users/admin').set(as('reception')).expect(200);
    for (const user of [...list.body.users, one.body]) {
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('resetToken');
      expect(user).not.toHaveProperty('resetTokenExpiry');
      expect(user).not.toHaveProperty('googleRefreshToken');
    }
  });

  it('rejects a lab user and redacts doctor WhatsApp tokens from staff responses', async () => {
    await request(app.getHttpServer()).get('/users').set(as('lab')).expect(403);
    const list = await request(app.getHttpServer()).get('/users').set(as('reception')).expect(200);
    const doctor = list.body.users.find((user: any) => user.id === 'doctor');
    expect(doctor.metadata).toEqual({ textSize: 'LARGE' });
    const one = await request(app.getHttpServer()).get('/users/doctor').set(as('reception')).expect(200);
    expect(one.body.metadata).toEqual({ textSize: 'LARGE' });
  });

  describe.each(MANAGERS)('%s', (manager) => {
    it.each(MANAGER_WRITES)('may %s %s', async (method, path, body) => {
      const res = await send(method, path, manager, body);
      expect({ status: res.status, body: res.body }).toEqual({ status: method === 'post' ? 201 : 200, body: expect.anything() });
      expect(writes().length).toBeGreaterThan(0);
      expect(JSON.stringify(res.body)).not.toContain('synthetic-hash');
    });
  });

  describe.each(NON_MANAGERS)('%s', (staff) => {
    it.each(MANAGER_WRITES)('is forbidden from %s %s without a write', async (method, path, body) => {
      const res = await send(method, path, staff, body);
      expect(res.status).toBe(403);
      expect(writes()).toEqual([]);
    });
  });

  it.each(NON_MANAGERS)('%s cannot change their own role, permissions or status', async (staff) => {
    for (const [method, path, body] of [
      ['patch', `/users/${staff}/role`, { role: 'ADMIN' }],
      ['patch', `/users/${staff}/permissions`, { permissions: ['all'] }],
      ['patch', `/users/${staff}/status`, { status: 'ACTIVE' }],
      ['patch', `/users/${staff}`, { role: 'ADMIN', permissions: ['all'] }],
    ] as const) {
      expect((await send(method, path, staff, body)).status).toBe(403);
    }
    expect(writes()).toEqual([]);
  });

  it('drops role and permissions from a self profile edit', async () => {
    const res = await send('patch', '/users/reception/profile', 'reception', { firstName: 'Riya', role: 'ADMIN', permissions: ['all'], status: 'ACTIVE' }).expect(200);
    expect(res.body).toMatchObject({ firstName: 'Riya', role: 'RECEPTION', permissions: null });
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'reception' }, data: { firstName: 'Riya' } }));
  });

  it('lets a user edit only their own profile unless they manage users', async () => {
    await request(app.getHttpServer()).patch('/users/reception/profile').set(as('reception')).send({ firstName: 'Riya' }).expect(200);
    await request(app.getHttpServer()).patch('/users/admin/profile').set(as('reception')).send({ firstName: 'Xavier' }).expect(403);
    await request(app.getHttpServer()).patch('/users/reception/profile').set(as('admin')).send({ firstName: 'Riya' }).expect(200);
    await request(app.getHttpServer()).post('/users/admin/change-password').set(as('reception'))
      .send({ currentPassword: 'Password1!', newPassword: 'Password2!', confirmPassword: 'Password2!' }).expect(403);
  });

  describe('list routes that share a path shape with /users/:id', () => {
    it.each([
      ['/users/roles?limit=100', 'roles', roleRecord],
      ['/users/permissions?limit=100', 'permissions', permissionRecord],
      ['/users/branches?limit=100', 'branches', branchRecord],
    ] as const)('GET %s returns the list, not a user lookup', async (path, key, record) => {
      const res = await request(app.getHttpServer()).get(path).set(as('admin')).expect(200);
      expect(res.body[key]).toEqual([record]);
      expect(res.body.pagination).toMatchObject({ total: 1, totalPages: 1 });
      expect(db.user.findFirst).not.toHaveBeenCalled();
    });

    it.each(['/users/statistics', '/users/dashboard'])('GET %s returns counts, not a user lookup', async (path) => {
      const res = await request(app.getHttpServer()).get(path).set(as('admin')).expect(200);
      expect(res.body.totalUsers ?? res.body.summary.totalUsers).toBe(Object.keys(users).length);
      expect(db.user.findFirst).not.toHaveBeenCalled();
    });

    it('still serves one user by id', async () => {
      const res = await request(app.getHttpServer()).get('/users/target').set(as('admin')).expect(200);
      expect(res.body).toMatchObject({ id: 'target', role: 'NURSE' });
    });
  });

  describe('status on the user form', () => {
    it('saves the status sent with an edit', async () => {
      const res = await send('patch', '/users/target', 'admin', { firstName: 'Tara', status: 'INACTIVE' }).expect(200);
      expect(res.body).toMatchObject({ id: 'target', firstName: 'Tara', status: 'INACTIVE' });
      expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'target' }, data: { firstName: 'Tara', status: 'INACTIVE' } }));
    });

    it('creates a user with the chosen status, and ACTIVE when none is sent', async () => {
      const body = { firstName: 'New', lastName: 'Person', email: 'new@example.test', password: 'Password1!', role: 'NURSE' };
      await send('post', '/users', 'admin', { ...body, status: 'PENDING' }).expect(201);
      await send('post', '/users', 'admin', body).expect(201);
      expect(db.user.create.mock.calls.map(([{ data }]: any) => data.status)).toEqual(['PENDING', 'ACTIVE']);
    });

    it.each([
      ['patch', '/users/target', { status: 'RETIRED' }],
      ['post', '/users', { firstName: 'New', lastName: 'Person', email: 'new@example.test', password: 'Password1!', role: 'NURSE', status: 'RETIRED' }],
    ] as const)('rejects an unknown status on %s %s without a write', async (method, path, body) => {
      await send(method, path, 'admin', body).expect(400);
      expect(writes()).toEqual([]);
    });
  });

  describe('the permissions a user holds', () => {
    const written = () => db.user.update.mock.calls.map(([{ data }]: any) => data);

    it('stores a ticked subset of the role as revocations plus extras', async () => {
      await send('patch', '/users/target/permissions', 'admin', { permissions: ['appointments:read', 'billing:invoice:read'] }).expect(200);
      expect(written()).toEqual([{ permissions: '["billing:invoice:read"]', revokedPermissions: '["visits:read","patients:read"]' }]);
    });

    it('stores deltas against the new role when an edit changes role and permissions together', async () => {
      await send('patch', '/users/target', 'admin', { role: 'ADMIN', permissions: ['appointments:read'] }).expect(200);
      expect(written()).toEqual([{ role: 'ADMIN', permissions: '["appointments:read"]', revokedPermissions: '[]' }]);
    });

    it('clears both columns when a role is assigned without permissions', async () => {
      await send('patch', '/users/target/role', 'admin', { role: 'ADMIN' }).expect(200);
      expect(written()).toEqual([{ role: 'ADMIN', permissions: null, revokedPermissions: null }]);
    });

    it('stores deltas against the assigned role when permissions are sent with it', async () => {
      await send('patch', '/users/target/role', 'admin', { role: 'NURSE', permissions: ['visits:read'] }).expect(200);
      expect(written()).toEqual([{ role: 'NURSE', permissions: '[]', revokedPermissions: '["appointments:read","patients:read"]' }]);
    });

    it('returns the held set and what the role always has', async () => {
      Object.assign(users.target, { permissions: '["billing:invoice:read"]', revokedPermissions: '["visits:read"]' });
      try {
        const res = await send('get', '/users/target/permissions', 'admin').expect(200);
        expect(res.body).toEqual({ permissions: ['appointments:read', 'patients:read', 'billing:invoice:read'], always: [] });
        expect((await send('get', '/users/target', 'admin').expect(200)).body).toMatchObject({
          permissions: ['billing:invoice:read'], revokedPermissions: ['visits:read'],
        });
      } finally {
        Object.assign(users.target, { permissions: null, revokedPermissions: null });
      }
      expect((await send('get', '/users/doctor/permissions', 'owner').expect(200)).body).toEqual({ permissions: [], always: ['*'] });
      expect((await send('get', '/users/pharmacist/permissions', 'owner').expect(200)).body).toEqual({ permissions: [], always: ['pharmacy:*', 'inventory:*'] });
    });

    it('answers 404 for an unknown user', async () => {
      await send('get', '/users/nobody/permissions', 'admin').expect(404);
    });

    it.each(NON_MANAGERS)('forbids %s from reading a user\'s permissions', async (staff) => {
      await send('get', '/users/target/permissions', staff).expect(403);
    });
  });

  describe('/users/me assets', () => {
    const upload = (kind: 'signature' | 'letterhead', user: string) =>
      request(app.getHttpServer()).post(`/users/me/${kind}?ownerId=admin&userId=admin`).set(as(user))
        .field('ownerId', 'admin').field('id', 'admin').attach('file', png, { filename: 'a.png', contentType: 'image/png' });

    it.each(['signature', 'letterhead'] as const)('writes the calling doctor\'s %s even when another id is supplied', async (kind) => {
      await upload(kind, 'doctor').expect(201);
      expect(db.clinicAsset.create).toHaveBeenCalledTimes(1);
      expect(db.clinicAsset.create.mock.calls[0][0].data).toMatchObject({ ownerId: 'doctor', branchId: 'branch', isActive: true });
      expect(db.clinicAsset.updateMany.mock.calls[0][0].where).toMatchObject({ ownerId: 'doctor' });
    });

    it.each(['signature', 'letterhead'] as const)('removes only the calling doctor\'s %s', async (kind) => {
      await request(app.getHttpServer()).delete(`/users/me/${kind}?ownerId=admin`).set(as('doctor')).send({ ownerId: 'admin' }).expect(200);
      expect(db.clinicAsset.updateMany.mock.calls[0][0].where).toMatchObject({ ownerId: 'doctor' });
      expect(db.clinicAsset.create.mock.calls[0][0].data).toMatchObject({ ownerId: 'doctor', isActive: false });
    });

    it.each([
      ['owner', 'signature'], ['admin', 'signature'], ['reception', 'signature'], ['pharmacist', 'letterhead'], ['admin', 'letterhead'],
    ] as const)('forbids %s from uploading a %s without a write', async (user, kind) => {
      await upload(kind, user).expect(403);
      await request(app.getHttpServer()).delete(`/users/me/${kind}`).set(as(user)).expect(403);
      expect(db.clinicAsset.create).not.toHaveBeenCalled();
      expect(db.clinicAsset.updateMany).not.toHaveBeenCalled();
    });

    it('forbids an inactive doctor', async () => {
      users.doctor.isActive = false;
      try {
        await upload('signature', 'doctor').expect(403);
        expect(db.clinicAsset.create).not.toHaveBeenCalled();
      } finally {
        users.doctor.isActive = true;
      }
    });
  });
});
