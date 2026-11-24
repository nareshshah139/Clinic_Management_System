import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { JwtStrategy, passwordStamp } from '../../auth/strategies/jwt.strategy';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { LegacyUploadsController, VisitsController } from '../visits.controller';
import { VisitsService } from '../visits.service';
import { ReviewBookingService } from '../review-booking';

jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }));

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const users: Record<string, { id: string; role: string; branchId: string }> = {
  doctor: { id: 'doctor', role: 'DOCTOR', branchId: 'branch-a' },
  reception: { id: 'reception', role: 'RECEPTION', branchId: 'branch-a' },
  foreign: { id: 'foreign', role: 'OWNER', branchId: 'branch-b' },
  lab: { id: 'lab', role: 'LAB_TECH', branchId: 'branch-a' },
};
const visits = [
  { id: 'v0', deletedAt: null, branchId: 'branch-a', attachments: JSON.stringify(['/uploads/visits/1700000000000_aa.png.png']) },
  { id: 'v1', deletedAt: null, branchId: 'branch-a', attachments: JSON.stringify(['/uploads/visits/1700000000000_aa.png']) },
  { id: 'v2', deletedAt: new Date(), branchId: 'branch-a', attachments: JSON.stringify(['/uploads/visits/1700000000000_deleted.png']) },
  { id: 'v3', deletedAt: null, branchId: 'branch-a', attachments: JSON.stringify(['uploads/visits/1700000000000_relative.png']) },
];
const db: any = {
  user: {
    findUnique: async ({ where }: any) => users[where.id] && {
      ...users[where.id], email: `${where.id}@example.test`, status: 'ACTIVE', isActive: true, password: 'hash',
    },
  },
  visit: {
    findMany: async ({ where }: any) => visits.filter(v =>
      v.deletedAt === where.deletedAt && v.branchId === where.patient.branchId &&
      v.attachments.includes(where.attachments.contains)),
    findUnique: async () => { throw new Error('unexpected'); },
  },
  patient: { findFirst: async ({ where }: any) => where.id === 'p1' && where.branchId === 'branch-a' ? { id: 'p1' } : null },
  visitAttachment: {
    findFirst: async ({ where }: any) => where.id === 'att' && where.visitId === 'v1' && where.visit.patient.branchId === 'branch-a'
      ? { data: PNG, contentType: 'image/png' } : null,
  },
};

describe('legacy /uploads and clinic photo delivery', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let root: string;
  const as = (id: string) => ({ Authorization: `Bearer ${jwt.sign({ sub: id, pwdStamp: passwordStamp('hash') })}` });
  const get = (url: string, headers: Record<string, string> = {}) => request(app.getHttpServer()).get(url).set(headers);

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-uploads-'));
    for (const rel of [
      'uploads/visits/1700000000000_aa.png', 'uploads/visits/1700000000000_unlisted.png',
      'uploads/visits/1700000000000_deleted.png', 'uploads/visits/1700000000000_relative.png', 'uploads/patients/p1/20261124/draft.png',
      'uploads/pharmacy-agent/s1/invoice.png', 'uploads/visits/notes.txt', 'secret.png',
    ]) {
      fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), PNG);
    }
    jest.spyOn(process, 'cwd').mockReturnValue(root);
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'synthetic-secret' })],
      controllers: [VisitsController, LegacyUploadsController],
      providers: [
        VisitsService, JwtStrategy,
        { provide: ReviewBookingService, useValue: {} },
        { provide: PrismaService, useValue: db },
        { provide: ConfigService, useValue: { getOrThrow: () => 'synthetic-secret', get: () => undefined } },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    jwt = app.get(JwtService);
  });
  afterAll(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('refuses every /uploads path to a caller without a staff session', async () => {
    for (const url of ['/uploads/visits/1700000000000_aa.png', '/uploads/patients/p1/20261124/draft.png', '/uploads/visits/missing.png']) {
      const res = await get(url);
      expect(res.status).toBe(401);
      expect(res.body).not.toBeInstanceOf(Buffer);
    }
    await get('/uploads/visits/1700000000000_aa.png', { Cookie: 'portal_session=x' }).expect(401);
  });

  it('serves a recorded visit photo and a draft photo to clinic staff in the branch, never cached', async () => {
    for (const url of ['/uploads/visits/1700000000000_aa.png', '/uploads/visits/1700000000000_relative.png', '/uploads/patients/p1/20261124/draft.png']) {
      for (const user of ['doctor', 'reception']) {
        const res = await get(url, as(user)).buffer(true).expect(200);
        expect(res.headers['content-type']).toBe('image/png');
        expect(res.headers['cache-control']).toBe('private, no-store');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(Buffer.compare(res.body, PNG)).toBe(0);
      }
    }
    const cookie = as('doctor').Authorization.replace('Bearer ', '');
    await get('/uploads/visits/1700000000000_aa.png', { Cookie: `auth_token=${cookie}` }).expect(200);
  });

  it.each([
    ['another branch', '/uploads/visits/1700000000000_aa.png', 'foreign'],
    ['another branch (draft)', '/uploads/patients/p1/20261124/draft.png', 'foreign'],
    ['a file on disk that no visit records', '/uploads/visits/1700000000000_unlisted.png', 'doctor'],
    ['a deleted visit', '/uploads/visits/1700000000000_deleted.png', 'doctor'],
    ['another upload folder', '/uploads/pharmacy-agent/s1/invoice.png', 'doctor'],
    ['a non-image file', '/uploads/visits/notes.txt', 'doctor'],
    ['an encoded traversal', '/uploads/visits/..%2F..%2Fsecret.png', 'doctor'],
    ['a traversal alias of a readable photo', '/uploads/visits/..%2Fvisits%2F1700000000000_aa.png', 'doctor'],
    ['a dot-segment alias of a readable photo', '/uploads/visits/.%2F1700000000000_aa.png', 'doctor'],
    ['a missing file', '/uploads/visits/missing.png', 'doctor'],
  ])('answers 404 for %s', async (_case, url, user) => {
    const res = await get(url, as(user));
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).not.toBe('image/png');
  });

  it('refuses a signed-in role outside clinic staff', async () => {
    await get('/uploads/visits/1700000000000_aa.png', as('lab')).expect(403);
  });

  it('marks a stored clinic photo private and no-store', async () => {
    const res = await get('/visits/v1/photos/att', as('doctor')).buffer(true).expect(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['cache-control']).not.toMatch(/public|max-age|immutable/);
    await get('/visits/v1/photos/att', as('foreign')).expect(404);
  });
});
