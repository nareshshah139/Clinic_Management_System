import { randomUUID } from 'node:crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/guards/permissions.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { diagnosticValidationPipe } from '../../../shared/logging/http-observability';
import { localDatabase } from '../../../shared/testing/local-database';
import { UsersModule } from '../../users/users.module';
import { AuthModule } from '../auth.module';

// Replays TLC's shortest paths from verification/state-machines/access-session/results/code.md.
const databaseTests = process.env.FORMAL_REPLAY_TEST_DATABASE_URL ? describe : describe.skip;

const PASSWORD = 'staff-password-1';
const NEW_PASSWORD = 'after-reset-pass-2';

databaseTests('Access session replays on PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let prisma: PrismaClient;
  let app: INestApplication;
  let branchId: string;
  let ownerEmail: string;
  let staffId: string;
  let staffEmail: string;
  const savedEnv = { secret: process.env.JWT_SECRET, expires: process.env.JWT_EXPIRES_IN };

  const http = () => request(app.getHttpServer());

  const signIn = async (email: string) => {
    const res = await http().post('/auth/login').send({ identifier: email, password: PASSWORD });
    expect(res.status).toBe(201);
    return (res.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('auth_token='))!.split(';')[0];
  };

  const asOwner = async () => signIn(ownerEmail);

  const staffRow = () => prisma.user.findUniqueOrThrow({ where: { id: staffId } });

  beforeAll(async () => {
    Logger.overrideLogger(false);
    process.env.JWT_SECRET = 'formal-replay-secret';
    process.env.JWT_EXPIRES_IN = '1d';
    fixture = await localDatabase(process.env.FORMAL_REPLAY_TEST_DATABASE_URL!);
    prisma = fixture.prisma;
    branchId = (await prisma.branch.create({ data: { name: 'Synthetic access', address: 'Synthetic' } })).id;
    await prisma.role.createMany({ data: [{ name: 'ADMIN' }, { name: 'RECEPTION' }] });
  }, 120000);

  afterAll(async () => {
    await fixture?.cleanup();
    process.env.JWT_SECRET = savedEnv.secret;
    process.env.JWT_EXPIRES_IN = savedEnv.expires;
  });

  beforeEach(async () => {
    const password = await bcrypt.hash(PASSWORD, 4);
    const user = (role: 'OWNER' | 'ADMIN') => prisma.user.create({ data: {
      email: `${role.toLowerCase()}-${randomUUID()}@example.invalid`, password,
      firstName: 'Synthetic', lastName: role, role, branchId,
    } });
    ownerEmail = (await user('OWNER')).email;
    const staff = await user('ADMIN');
    staffId = staff.id;
    staffEmail = staff.email;

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        AuthModule,
        UsersModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    }).overrideProvider(PrismaService).useValue(prisma).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(diagnosticValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  const managerSuspends = async () => {
    const res = await http().patch(`/users/${staffId}/status`).set('Cookie', await asOwner()).send({ status: 'SUSPENDED' });
    expect(res.status).toBe(200);
  };

  const managerDemotes = async () => {
    const res = await http().patch(`/users/${staffId}/role`).set('Cookie', await asOwner()).send({ role: 'RECEPTION' });
    expect(res.status).toBe(200);
  };

  const managerIssuesResetCode = async () => {
    const res = await http().post(`/auth/users/${staffId}/reset-code`).set('Cookie', await asOwner());
    expect(res.status).toBe(201);
    return res.body.code as string;
  };

  const youResetPassword = (code: string) =>
    http().post('/auth/reset-password').send({ code, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

  const youOpenAPage = (cookie: string) => http().get('/auth/me').set('Cookie', cookie);

  const youUseAManagerAction = (cookie: string) =>
    http().patch(`/users/${staffId}/role`).set('Cookie', cookie).send({ role: 'ADMIN' });

  describe('ColumnsAgree', () => {
    it.failing('ColumnsAgree: suspending an account also clears its active flag', async () => {
      await managerSuspends();
      const row = await staffRow();
      expect([row.status, row.isActive]).toEqual(['SUSPENDED', false]);
    });

    it('today: suspending an account leaves its active flag set', async () => {
      await managerSuspends();
      const row = await staffRow();
      expect([row.status, row.isActive]).toEqual(['SUSPENDED', true]);
    });
  });

  describe('NoAccessWhileSuspended', () => {
    it.failing('NoAccessWhileSuspended: a session signed in before the suspension is refused', async () => {
      const cookie = await signIn(staffEmail);
      await managerSuspends();
      expect((await youOpenAPage(cookie)).status).toBe(401);
    });

    it('today: a suspended account keeps using its day-long session', async () => {
      const cookie = await signIn(staffEmail);
      const claims = JSON.parse(Buffer.from(cookie.split('.')[1], 'base64url').toString());
      expect(claims.exp - claims.iat).toBe(86400);
      await managerSuspends();
      const res = await youOpenAPage(cookie);
      expect([res.status, res.body.id]).toEqual([200, staffId]);
      expect((await http().post('/auth/login').send({ identifier: staffEmail, password: PASSWORD })).status).toBe(403);
    });
  });

  describe('RoleIsCurrent', () => {
    it.failing('RoleIsCurrent: a demoted admin cannot use a manager action with the old session', async () => {
      const cookie = await signIn(staffEmail);
      await managerDemotes();
      const res = await youUseAManagerAction(cookie);
      expect([res.status, (await staffRow()).role]).toEqual([403, 'RECEPTION']);
    });

    it('today: a demoted admin promotes themselves back with the old session', async () => {
      const cookie = await signIn(staffEmail);
      await managerDemotes();
      expect((await staffRow()).role).toBe('RECEPTION');
      const res = await youUseAManagerAction(cookie);
      expect([res.status, (await staffRow()).role]).toEqual([200, 'ADMIN']);
    });
  });

  describe('ResetEndsOldSessions', () => {
    it.failing('ResetEndsOldSessions: a session signed in before a password reset is refused', async () => {
      const cookie = await signIn(staffEmail);
      const code = await managerIssuesResetCode();
      expect((await youResetPassword(code)).status).toBe(201);
      expect((await youOpenAPage(cookie)).status).toBe(401);
    });

    it('today: a session signed in before a password reset keeps working', async () => {
      const cookie = await signIn(staffEmail);
      const code = await managerIssuesResetCode();
      expect((await youResetPassword(code)).status).toBe(201);
      expect(await bcrypt.compare(NEW_PASSWORD, (await staffRow()).password)).toBe(true);
      const res = await youOpenAPage(cookie);
      expect([res.status, res.body.id]).toEqual([200, staffId]);
    });
  });

  describe('NoResetWhileSuspended', () => {
    it.failing('NoResetWhileSuspended: a suspended account cannot redeem a reset code', async () => {
      await managerSuspends();
      const code = await managerIssuesResetCode();
      const res = await youResetPassword(code);
      expect([res.status, await bcrypt.compare(PASSWORD, (await staffRow()).password)]).toEqual([400, true]);
    });

    it('today: a suspended account is issued a reset code and redeems it', async () => {
      await managerSuspends();
      const code = await managerIssuesResetCode();
      const res = await youResetPassword(code);
      expect([res.status, await bcrypt.compare(NEW_PASSWORD, (await staffRow()).password)]).toEqual([201, true]);
    });
  });
});
