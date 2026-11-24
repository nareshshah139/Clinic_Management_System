import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import request from 'supertest';
import { JwtStrategy, passwordStamp } from '../../auth/strategies/jwt.strategy';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/guards/permissions.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { UploadsController } from '../uploads.controller';
import { UploadsService } from '../uploads.service';

const SECRET = 'synthetic-uploads-test-secret';
const VISIT_FILE = '/uploads/visits/1700000000000_0123456789abcdef.jpg';
const DRAFT_FILE = '/uploads/patients/patient-a/20250101/front.png';
const PHOTO_FILE = '/uploads/photos/face.webp';

const users = [
  { id: 'reception-a', role: 'RECEPTION', branchId: 'branch-a' },
  { id: 'nurse-b', role: 'NURSE', branchId: 'branch-b' },
  { id: 'patient-user-a', role: 'PATIENT', branchId: 'branch-a' },
  { id: 'lab-a', role: 'LAB_TECH', branchId: 'branch-a' },
  { id: 'left-a', role: 'RECEPTION', branchId: 'branch-a', isActive: false },
].map((user) => ({
  email: `${user.id}@example.invalid`,
  status: 'ACTIVE',
  isActive: true,
  password: `hash-${user.id}`,
  ...user,
}));

const patients = [
  { id: 'patient-a', branchId: 'branch-a', photoUrl: PHOTO_FILE },
  {
    id: 'patient-a2',
    branchId: 'branch-a',
    photoUrl: 'uploads/photos/shared.jpg',
  },
  {
    id: 'patient-a3',
    branchId: 'branch-a',
    photoUrl: '/uploads/tmp/transcribe/claimed.jpg',
  },
  {
    id: 'patient-b',
    branchId: 'branch-b',
    photoUrl: '/uploads/photos/shared.jpg',
  },
];

const visits = [
  {
    deletedAt: null,
    branchId: 'branch-a',
    attachments: JSON.stringify([
      VISIT_FILE,
      '/uploads/visits/link.jpg',
      '/uploads/visits/missing.jpg',
      '/uploads/visits/notes.txt',
    ]),
  },
  {
    deletedAt: new Date(),
    branchId: 'branch-a',
    attachments: JSON.stringify(['/uploads/visits/deleted-visit.jpg']),
  },
  // Names the first visit's file only as part of a longer name, which must not count as a match.
  {
    deletedAt: null,
    branchId: 'branch-b',
    attachments: JSON.stringify([
      `/uploads/visits/x${path.basename(VISIT_FILE)}`,
    ]),
  },
];

/** The subset of Prisma the guards and the uploads service use, answering from the rows above. */
const db = {
  user: {
    findUnique: async ({ where }: any) =>
      users.find((user) => user.id === where.id) ?? null,
  },
  role: { findFirst: async () => null },
  visit: {
    findMany: async ({ where }: any) =>
      visits.filter(
        (visit) =>
          (visit.deletedAt === null) === (where.deletedAt === null) &&
          visit.branchId === where.patient.branchId &&
          visit.attachments.includes(where.attachments.contains),
      ),
  },
  patient: {
    findFirst: async ({ where }: any) =>
      patients.find(
        (patient) =>
          patient.id === where.id && patient.branchId === where.branchId,
      ) ?? null,
    findMany: async ({ where }: any) =>
      patients.filter((patient) =>
        where.photoUrl.in.includes(patient.photoUrl),
      ),
  },
};

describe('GET /uploads/*', () => {
  let app: INestApplication;
  let cwd: string;
  let port: number;
  const jwt = new JwtService({ secret: SECRET });
  const cookieFor = (id: string, password = `hash-${id}`) =>
    `auth_token=${jwt.sign({ sub: id, pwdStamp: passwordStamp(password) })}`;
  const get = (url: string, userId?: string) => {
    const call = request(app.getHttpServer()).get(url);
    return userId ? call.set('Cookie', cookieFor(userId)) : call;
  };
  /** supertest normalises dot segments before sending, so traversal attempts go out as written. */
  const rawGet = (rawPath: string, userId: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      http
        .get(
          {
            host: '127.0.0.1',
            port,
            path: rawPath,
            headers: { Cookie: cookieFor(userId) },
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => {
              body += chunk;
            });
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
          },
        )
        .on('error', reject);
    });

  beforeAll(async () => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-spec-'));
    const write = (relative: string, content: string) => {
      fs.mkdirSync(path.dirname(path.join(cwd, relative)), { recursive: true });
      fs.writeFileSync(path.join(cwd, relative), content);
    };
    write(VISIT_FILE.slice(1), 'visit-photo');
    write(DRAFT_FILE.slice(1), 'draft-photo');
    write(PHOTO_FILE.slice(1), 'patient-photo');
    write('uploads/photos/shared.jpg', 'claimed-by-two-branches');
    write('uploads/visits/orphan.jpg', 'no-record-points-here');
    write('uploads/visits/deleted-visit.jpg', 'deleted-visit-photo');
    write('uploads/visits/notes.txt', 'not-an-image');
    write('uploads/tmp/transcribe/claimed.jpg', 'working-file');
    write('uploads/pharmacy-agent/session/bill.jpg', 'supplier-bill');
    write('secret.jpg', 'outside-uploads');
    fs.symlinkSync(
      path.join(cwd, 'secret.jpg'),
      path.join(cwd, 'uploads/visits/link.jpg'),
    );
    jest.spyOn(process, 'cwd').mockReturnValue(cwd);

    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [UploadsController],
      providers: [
        UploadsService,
        JwtStrategy,
        { provide: PrismaService, useValue: db },
        { provide: ConfigService, useValue: { getOrThrow: () => SECRET } },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
  });

  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it.each([
    VISIT_FILE,
    DRAFT_FILE,
    PHOTO_FILE,
    '/uploads/visits/orphan.jpg',
    '/uploads/does-not-exist.jpg',
  ])('answers 401 without a session for %s', async (url) => {
    const res = await get(url).expect(401);
    expect(res.text).not.toContain('photo');
  });

  it('answers 401 for a forged, expired, deactivated or password-changed session', async () => {
    const forged = new JwtService({ secret: 'another-secret' }).sign({
      sub: 'reception-a',
      pwdStamp: passwordStamp('hash-reception-a'),
    });
    const expired = jwt.sign(
      { sub: 'reception-a', pwdStamp: passwordStamp('hash-reception-a') },
      { expiresIn: -10 },
    );
    await request(app.getHttpServer())
      .get(VISIT_FILE)
      .set('Cookie', `auth_token=${forged}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(VISIT_FILE)
      .set('Cookie', `auth_token=${expired}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(VISIT_FILE)
      .set('Cookie', cookieFor('left-a'))
      .expect(401);
    await request(app.getHttpServer())
      .get(VISIT_FILE)
      .set('Cookie', cookieFor('reception-a', 'old-hash'))
      .expect(401);
  });

  it.each(['patient-user-a', 'lab-a'])(
    'answers 403 to %s, who is signed in but not clinic staff',
    async (userId) => {
      await get(VISIT_FILE, userId).expect(403);
    },
  );

  it.each([
    [VISIT_FILE, 'image/jpeg', 'visit-photo'],
    [DRAFT_FILE, 'image/png', 'draft-photo'],
    [PHOTO_FILE, 'image/webp', 'patient-photo'],
  ])(
    'serves %s to staff of the owning branch, privately',
    async (url, type, content) => {
      const res = await get(url, 'reception-a').expect(200);
      expect(res.headers['content-type']).toBe(type);
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.from(res.body).toString()).toBe(content);
    },
  );

  it('accepts the same session as a bearer token', async () => {
    const token = cookieFor('reception-a').replace('auth_token=', '');
    await request(app.getHttpServer())
      .get(VISIT_FILE)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it.each([VISIT_FILE, DRAFT_FILE, PHOTO_FILE])(
    'answers 404 to staff of another branch for %s',
    async (url) => {
      const res = await get(url, 'nurse-b').expect(404);
      expect(res.text).not.toContain('photo');
    },
  );

  it.each([
    ['a file no record points at', '/uploads/visits/orphan.jpg'],
    ['a file of a deleted visit', '/uploads/visits/deleted-visit.jpg'],
    ['a listed file that is gone from disk', '/uploads/visits/missing.jpg'],
    ['a listed file that is not an image', '/uploads/visits/notes.txt'],
    [
      'a listed link that leaves the uploads folder',
      '/uploads/visits/link.jpg',
    ],
    ['a patient photo that two branches claim', '/uploads/photos/shared.jpg'],
    [
      'a transcription working file claimed as a patient photo',
      '/uploads/tmp/transcribe/claimed.jpg',
    ],
    [
      'a pharmacy assistant attachment',
      '/uploads/pharmacy-agent/session/bill.jpg',
    ],
    ['a folder', '/uploads/visits'],
    [
      'a patients path of the wrong shape',
      '/uploads/patients/patient-a/front.png',
    ],
  ])('answers 404 to branch staff for %s', async (_label, url) => {
    await get(url, 'reception-a').expect(404);
  });

  it('answers 404 for a claimed patient photo to the other claiming branch as well', async () => {
    await get('/uploads/photos/shared.jpg', 'nurse-b').expect(404);
  });

  it.each([
    '/uploads/../secret.jpg',
    '/uploads/visits/../../secret.jpg',
    '/uploads/%2e%2e/secret.jpg',
    '/uploads/visits/..%2f..%2fsecret.jpg',
    '/uploads/visits/%2e%2e%2f%2e%2e%2fsecret.jpg',
    '/uploads/visits/..%5c..%5csecret.jpg',
    '/uploads/visits/.hidden.jpg',
    '/uploads/visits/photo.jpg%00.png',
    '/uploads//visits/photo.jpg',
    `/uploads/${'a/'.repeat(7)}photo.jpg`,
  ])('refuses the traversal attempt %s', async (rawPath) => {
    const res = await rawGet(rawPath, 'reception-a');
    expect(res.status).toBe(400);
    expect(res.body).not.toContain('outside-uploads');
  });
});

it('serves uploads only through the authenticated route', () => {
  const main = fs.readFileSync(
    path.resolve(__dirname, '../../../main.ts'),
    'utf8',
  );
  expect(main).not.toMatch(/express\.static|useStaticAssets|serve-static/);
});
