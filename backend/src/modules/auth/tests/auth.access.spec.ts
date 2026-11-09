import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { exec } from 'child_process';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { PasswordResetService } from '../password-reset.service';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { diagnosticValidationPipe } from '../../../shared/logging/http-observability';

jest.mock('child_process', () => ({
  exec: jest.fn((_cmd: string, done: (...args: unknown[]) => void) =>
    done(null, '', ''),
  ),
}));

const hashCode = (code: string) =>
  createHash('sha256').update(code).digest('hex');
const PASSWORD = 'correct-horse';
const JOB_ID = /^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[a-z]+$/;

type Row = {
  id: string;
  role: string;
  email: string;
  status: string;
  isActive: boolean;
  password: string;
  branchId: string;
  resetToken: string | null;
  resetTokenExpiry: Date | null;
};

describe('/auth access control', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let root: string;
  let users: Record<string, Row>;
  const future = () => new Date(Date.now() + 60_000);

  const db: any = {
    user: {
      findFirst: jest.fn(
        async ({ where }) =>
          Object.values(users).find((user) =>
            where.email ? user.email === where.email.equals : false,
          ) ?? null,
      ),
      updateMany: jest.fn(async ({ where, data }) => {
        const hits = Object.values(users).filter(
          (user) =>
            user.resetToken === where.resetToken &&
            user.resetTokenExpiry !== null &&
            user.resetTokenExpiry > where.resetTokenExpiry.gt &&
            user.isActive === where.isActive,
        );
        hits.forEach((user) => Object.assign(user, data));
        return { count: hits.length };
      }),
    },
  };
  const as = (id: string) => ({
    Authorization: `Bearer ${jwt.sign({ sub: id, role: users[id].role, branchId: 'branch', email: users[id].email })}`,
  });
  const jobsDir = () => path.join(root, 'backups', '.jobs');

  const boot = async () => {
    const module = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60, limit: 10 }]),
        JwtModule.register({
          secret: 'synthetic-secret',
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        PasswordResetService,
        JwtStrategy,
        { provide: PrismaService, useValue: db },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: () => 'synthetic-secret',
            get: () => undefined,
          },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(diagnosticValidationPipe());
    await app.init();
    jwt = app.get(JwtService);
  };

  beforeEach(async () => {
    const hash = await bcrypt.hash(PASSWORD, 4);
    const row = (id: string, role: string, extra: Partial<Row> = {}): Row => ({
      id,
      role,
      email: `${id}@example.test`,
      status: 'ACTIVE',
      isActive: true,
      password: hash,
      branchId: 'branch',
      resetToken: null,
      resetTokenExpiry: null,
      ...extra,
    });
    users = {
      owner: row('owner', 'OWNER'),
      admin: row('admin', 'ADMIN'),
      doctor: row('doctor', 'DOCTOR'),
      reception: row('reception', 'RECEPTION', {
        resetToken: hashCode('ABCDEFGH'),
        resetTokenExpiry: future(),
      }),
      pharmacist: row('pharmacist', 'PHARMACIST', {
        resetToken: hashCode('EXPIREDX'),
        resetTokenExpiry: new Date(Date.now() - 1000),
      }),
      gone: row('gone', 'NURSE', {
        isActive: false,
        status: 'INACTIVE',
        resetToken: hashCode('INACTIVE'),
        resetTokenExpiry: future(),
      }),
    };
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-access-'));
    fs.mkdirSync(path.join(root, 'app'));
    jest.spyOn(process, 'cwd').mockReturnValue(path.join(root, 'app'));
    jest.clearAllMocks();
    await boot();
  });
  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('backup', () => {
    it.each(['owner', 'admin'])(
      'queues a backup job for %s and reports its status',
      async (user) => {
        const { body } = await request(app.getHttpServer())
          .post('/auth/backup')
          .set(as(user))
          .expect(201);
        expect(body).toEqual({
          success: true,
          jobId: expect.stringMatching(JOB_ID),
        });
        expect(body.jobId.endsWith(`-${user}`)).toBe(true);
        expect(exec).toHaveBeenCalledTimes(1);
        const status = await request(app.getHttpServer())
          .get(`/auth/backup/${body.jobId}`)
          .set(as(user))
          .expect(200);
        expect(status.body).toMatchObject({
          id: body.jobId,
          status: 'QUEUED',
          createdBy: user,
        });
      },
    );

    it.each(['doctor', 'reception', 'pharmacist'])(
      'forbids %s from queueing or reading a backup',
      async (user) => {
        await request(app.getHttpServer())
          .post('/auth/backup')
          .set(as(user))
          .expect(403);
        expect(exec).not.toHaveBeenCalled();
        expect(fs.existsSync(jobsDir())).toBe(false);
        const { body } = await request(app.getHttpServer())
          .post('/auth/backup')
          .set(as('admin'))
          .expect(201);
        await request(app.getHttpServer())
          .get(`/auth/backup/${body.jobId}`)
          .set(as(user))
          .expect(403);
      },
    );

    it.each([
      '..%2F..%2Fsecret',
      '..%2Fsecret',
      'backup-2026-01-01T00-00-00-admin%2F..%2F..%2F..%2Fsecret',
      'backup-2026-01-01T00-00-00-admin..',
    ])(
      'never reads a file outside the jobs folder for jobId %s',
      async (jobId) => {
        fs.writeFileSync(
          path.join(root, 'secret.json'),
          JSON.stringify({ secret: 'outside-jobs' }),
        );
        fs.mkdirSync(path.join(root, 'backups'), { recursive: true });
        fs.writeFileSync(
          path.join(root, 'backups', 'secret.json'),
          JSON.stringify({ secret: 'outside-jobs' }),
        );
        const res = await request(app.getHttpServer())
          .get(`/auth/backup/${jobId}`)
          .set(as('owner'));
        expect({
          status: res.status,
          leaked: JSON.stringify(res.body).includes('outside-jobs'),
        }).toEqual({ status: 404, leaked: false });
      },
    );

    it('requires a token', async () => {
      await request(app.getHttpServer()).post('/auth/backup').expect(401);
      await request(app.getHttpServer())
        .get('/auth/backup/backup-2026-01-01T00-00-00-admin')
        .expect(401);
      expect(exec).not.toHaveBeenCalled();
    });

    it('returns 404 for a job that does not exist', async () => {
      await request(app.getHttpServer())
        .get('/auth/backup/backup-2026-01-01T00-00-00-admin')
        .set(as('admin'))
        .expect(404);
    });
  });

  describe('reset-password', () => {
    const reset = (code: string, password = 'new-password-1') =>
      request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ code, password, confirmPassword: password });

    it('sets a new password from a valid code without a token and makes the code single-use', async () => {
      const before = users.reception.password;
      await reset('abcd-efgh').expect(201, {
        message: 'Password updated. You can now sign in.',
      });
      expect(users.reception.password).not.toBe(before);
      expect(
        await bcrypt.compare('new-password-1', users.reception.password),
      ).toBe(true);
      expect(users.reception.resetToken).toBeNull();
    });

    it('gives one answer for unknown, expired, used and inactive-user codes', async () => {
      await reset('ABCDEFGH').expect(201);
      const answers = [];
      for (const code of ['ZZZZZZZZ', 'EXPIREDX', 'ABCDEFGH', 'INACTIVE']) {
        const res = await reset(code);
        answers.push({ status: res.status, message: res.body.message });
      }
      expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
      expect(answers[0]).toEqual({
        status: 400,
        message:
          'This reset code is invalid or has expired. Ask an admin for a new one.',
      });
      expect(users.gone.resetToken).toBe(hashCode('INACTIVE'));
      expect(users.pharmacist.resetToken).toBe(hashCode('EXPIREDX'));
    });

    it('rejects a malformed body before touching any user', async () => {
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ code: 'ABC', password: 'short', confirmPassword: 'short' })
        .expect(400);
      expect(db.user.updateMany).not.toHaveBeenCalled();
    });

    it('allows five attempts a minute and then answers 429', async () => {
      for (let i = 0; i < 5; i++) await reset('ZZZZZZZZ').expect(400);
      await reset('ABCDEFGH').expect(429);
      expect(users.reception.resetToken).toBe(hashCode('ABCDEFGH'));
    });
  });

  describe('login and logout', () => {
    const login = (body: object) =>
      request(app.getHttpServer()).post('/auth/login').send(body);

    it('sets an httpOnly SameSite=Strict cookie and returns a token without the password hash', async () => {
      const res = await login({
        email: 'doctor@example.test',
        password: PASSWORD,
      }).expect(201);
      expect(jwt.verify(res.body.access_token)).toMatchObject({
        sub: 'doctor',
        role: 'DOCTOR',
        branchId: 'branch',
      });
      expect(res.body.user).toMatchObject({ id: 'doctor', role: 'DOCTOR' });
      expect(res.body.user).not.toHaveProperty('password');
      const cookie = res.headers['set-cookie'][0];
      expect(cookie).toMatch(/^auth_token=[^;]+;/);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).not.toMatch(/Secure/);
    });

    it('marks the cookie Secure in production', async () => {
      const env = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const res = await login({
          identifier: 'admin@example.test',
          password: PASSWORD,
        }).expect(201);
        expect(res.headers['set-cookie'][0]).toMatch(/Secure/);
      } finally {
        process.env.NODE_ENV = env;
      }
    });

    it.each([
      [{}],
      [{ email: 'doctor@example.test' }],
      [{ password: PASSWORD }],
      [{ identifier: '   ', password: PASSWORD }],
    ])('answers 400 without a cookie for %j', async (body) => {
      const res = await login(body).expect(400);
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('gives no cookie for a wrong password', async () => {
      const res = await login({
        email: 'doctor@example.test',
        password: 'wrong-password',
      }).expect(401);
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('allows five attempts a minute and then answers 429 even with the right password', async () => {
      for (let i = 0; i < 5; i++)
        await login({
          email: 'doctor@example.test',
          password: 'wrong-password',
        }).expect(401);
      const res = await login({
        email: 'doctor@example.test',
        password: PASSWORD,
      }).expect(429);
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('expires the cookie on logout without a token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .expect(201, { success: true });
      const cookie = res.headers['set-cookie'][0];
      expect(cookie).toMatch(/^auth_token=;/);
      expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
      expect(cookie).toMatch(/HttpOnly/);
    });
  });
});
