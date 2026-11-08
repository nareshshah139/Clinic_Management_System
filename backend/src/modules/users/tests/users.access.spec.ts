import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { UsersController } from '../users.controller';
import { UsersService } from '../users.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';

const row = (id: string, role: string) => ({
  id, role, branchId: 'branch', firstName: id, lastName: 'Synthetic', email: `${id}@example.test`,
  password: '$2b$10$synthetic-hash', resetToken: 'synthetic-reset', resetTokenExpiry: new Date(), googleRefreshToken: 'synthetic-refresh',
  permissions: null, metadata: role === 'DOCTOR' ? JSON.stringify({ whatsappAccessToken: 'synthetic-whatsapp-token', textSize: 'LARGE' }) : null, branch: { id: 'branch' },
});

describe('/users access control', () => {
  let app: INestApplication;
  const users: Record<string, ReturnType<typeof row>> = { admin: row('admin', 'ADMIN'), reception: row('reception', 'RECEPTION'), doctor: row('doctor', 'DOCTOR'), lab: row('lab', 'LAB_TECH') };
  const db: any = {
    user: {
      findMany: jest.fn(async () => Object.values(users)),
      count: jest.fn(async () => Object.keys(users).length),
      findFirst: jest.fn(async ({ where }) => users[where.id] && users[where.id].branchId === where.branchId ? users[where.id] : null),
      update: jest.fn(async ({ where, data }) => ({ ...users[where.id], ...data })),
    },
    role: { findFirst: jest.fn(async () => ({ id: 'role', name: 'ADMIN' })), findUnique: jest.fn(async () => ({ id: 'role', name: 'ADMIN' })) },
  };
  db.user.updateMany = jest.fn(async () => ({ count: 1 }));
  db.user.findUnique = jest.fn(async ({ where }) => users[where.id] ?? null);
  const as = (id: string) => ({ 'x-user': id });

  beforeAll(async () => {
    const auth = { canActivate: (context: any) => {
      const req = context.switchToHttp().getRequest();
      const user = users[req.headers['x-user']];
      if (!user) return false;
      req.user = { id: user.id, role: user.role, branchId: user.branchId };
      return true;
    } };
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: new UsersService(db, {} as any) }, { provide: APP_GUARD, useValue: auth }, { provide: APP_GUARD, useClass: RolesGuard }],
    }).overrideGuard(JwtAuthGuard).useValue(auth).compile();
    app = module.createNestApplication();
    await app.init();
  });
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

  it.each([
    ['patch', '/users/admin/role', { roleId: 'role' }],
    ['patch', '/users/admin/status', { status: 'INACTIVE' }],
    ['patch', '/users/admin', { firstName: 'X' }],
    ['delete', '/users/admin', undefined],
    ['post', '/users', { firstName: 'X' }],
    ['patch', '/users/admin/permissions', { permissions: ['all'] }],
    ['post', '/users/roles', { name: 'X' }],
  ] as const)('forbids reception from %s %s', async (method, path, body) => {
    const res = await (request(app.getHttpServer()) as any)[method](path).set(as('reception')).send(body);
    expect(res.status).toBe(403);
  });

  it('lets a user edit only their own profile unless they manage users', async () => {
    await request(app.getHttpServer()).patch('/users/reception/profile').set(as('reception')).send({ firstName: 'Riya' }).expect(200);
    await request(app.getHttpServer()).patch('/users/admin/profile').set(as('reception')).send({ firstName: 'X' }).expect(403);
    await request(app.getHttpServer()).patch('/users/reception/profile').set(as('admin')).send({ firstName: 'Riya' }).expect(200);
    await request(app.getHttpServer()).post('/users/admin/change-password').set(as('reception'))
      .send({ currentPassword: 'x', newPassword: 'y', confirmPassword: 'y' }).expect(403);
  });
});
