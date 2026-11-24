import * as fs from 'node:fs';
import * as path from 'node:path';
import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { lastValueFrom, of } from 'rxjs';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { IdempotencyInterceptor } from '../../../shared/interceptors/idempotency.interceptor';
import { installHttpObservability } from '../../../shared/logging/http-observability';
import { deriveTaskToken, hashTaskToken } from '../../follow-ups/task-link';
import { LINK_INACTIVE_BODY } from '../link-inactive';
import { PortalController } from '../portal.controller';
import { PORTAL_ROUTE } from '../portal.decorator';
import { PortalGuard } from '../portal.guard';
import { TaskPageService } from '../task.service';

const portalDir = path.resolve(__dirname, '..');

/** Every route of every controller under modules/portal, read from Nest metadata. */
function portalRoutes() {
  const routes: { key: string; method: string; path: string; handler: any; controller: any }[] = [];
  for (const file of fs.readdirSync(portalDir).filter((f) => f.endsWith('.controller.ts'))) {
    for (const exported of Object.values(require(path.join(portalDir, file))) as any[]) {
      const prefix = typeof exported === 'function' && Reflect.getMetadata(PATH_METADATA, exported);
      if (prefix === undefined || prefix === false) continue;
      for (const name of Object.getOwnPropertyNames(exported.prototype)) {
        const handler = exported.prototype[name];
        const method = Reflect.getMetadata(METHOD_METADATA, handler);
        if (name === 'constructor' || method === undefined) continue;
        const route = `/${prefix}/${Reflect.getMetadata(PATH_METADATA, handler)}`.replace(/\/+/g, '/');
        routes.push({ key: `${RequestMethod[method]} ${route}`, method: RequestMethod[method].toLowerCase(), path: route, handler, controller: exported });
      }
    }
  }
  return routes;
}

describe('portal routes (PP-37, PP-39, PP-83, PP-84, PP-86, StaffCookieStaysStaff)', () => {
  const routes = portalRoutes();
  let app: INestApplication;
  const links = new Map<string, any>();
  const prisma = {
    portalTaskLink: { findUnique: jest.fn(async ({ where }: any) => links.get(where.tokenHash) ?? null) },
    idempotencyRecord: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
  };
  const tasks = { page: jest.fn(), submit: jest.fn() };
  const link = (id: string, revokedAt: Date | null, states: string[]) => {
    const token = deriveTaskToken(id);
    links.set(hashTaskToken(token), {
      id, patientId: `patient-of-${id}`, revokedAt, patient: { branchId: 'A', portalProfile: { consentState: 'OPTED_IN', portalEnabled: true } },
      checkIns: states.map((state, i) => ({ checkInId: `${id}-c${i}`, checkIn: { state, closesAt: new Date(Date.now() + 86_400_000) } })),
    });
    return token;
  };

  beforeAll(async () => {
    process.env.PORTAL_LINK_SECRET = 'portal-route-test-secret';
    const module = await Test.createTestingModule({
      controllers: [PortalController],
      providers: [
        PortalGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: TaskPageService, useValue: tasks },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
        Reflector,
      ],
    }).compile();
    app = module.createNestApplication();
    installHttpObservability(app);
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('finds the task-link routes, all POST, none taking a patient id', () => {
    expect(routes.map((r) => r.key)).toEqual(['POST /portal/task/questions', 'POST /portal/task/responses']);
    for (const r of routes) {
      expect(r.path).not.toMatch(/:|patient/i);
      expect(r.method).toBe('post');
    }
  });

  it('puts every portal route behind the one Portal() decorator: public to staff, portal guard on', () => {
    const reflector = new Reflector();
    for (const r of routes) {
      expect(reflector.get('isPublic', r.handler)).toBe(true);
      expect(reflector.get(PORTAL_ROUTE, r.handler)).toBe(true);
      expect(reflector.get(GUARDS_METADATA, r.handler)).toContain(PortalGuard);
    }
  });

  it.each(routes.map((r) => [r.key, r]))('%s answers no credential, a staff cookie or a staff bearer with the inactive body', async (_, r: any) => {
    const server = app.getHttpServer();
    const attempts = [
      () => request(server).post(r.path).send({}),
      () => request(server).post(r.path).set('Cookie', 'auth_token=staff.jwt.value').send({ patientId: 'p1' }),
      () => request(server).post(r.path).set('Authorization', 'Bearer staff.jwt.value').send({ token: 'short' }),
    ];
    for (const attempt of attempts) {
      const res = await attempt();
      expect(res.status).toBe(404);
      expect(res.text).toBe(LINK_INACTIVE_BODY);
    }
    expect(tasks.page).not.toHaveBeenCalled();
    expect(tasks.submit).not.toHaveBeenCalled();
  });

  it('answers unknown, revoked and expired tokens with byte-identical responses (PP-39)', async () => {
    const unknown = deriveTaskToken('never-issued');
    const revoked = link('revoked', new Date(), ['OPEN']);
    const expired = link('expired', null, ['ANSWERED', 'MISSED']);
    tasks.page.mockImplementation(async (p: any) => {
      if (!p.checkInIds.length) throw new (require('../link-inactive').LinkInactive)();
      return {};
    });
    const bodies = [];
    for (const token of [unknown, revoked, expired]) bodies.push(await request(app.getHttpServer()).post('/portal/task/questions').send({ token }));
    for (const res of bodies) {
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toBe(bodies[0].headers['content-type']);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(new Set(bodies.map((b) => b.text))).toEqual(new Set([LINK_INACTIVE_BODY]));
  });

  it('builds the principal from the token alone, with only OPEN check-ins (PP-84, LinkAnswersOnly)', async () => {
    const token = link('live', null, ['OPEN', 'ANSWERED', 'OPEN']);
    tasks.page.mockResolvedValue({ ok: true });
    await request(app.getHttpServer()).post('/portal/task/questions').set('Authorization', 'Bearer staff').send({ token, patientId: 'someone-else' }).expect(200, { ok: true });
    expect(tasks.page).toHaveBeenCalledWith({ kind: 'task-link', linkId: 'live', patientId: 'patient-of-live', branchId: 'A', checkInIds: ['live-c0', 'live-c2'] });
    expect(Object.isFrozen(tasks.page.mock.calls[0][0])).toBe(true);
  });

  it('runs portal writes outside the idempotency store (PP-86)', async () => {
    const token = link('write', null, ['OPEN']);
    tasks.submit.mockResolvedValue({ status: 'saved', urgent: false });
    await request(app.getHttpServer()).post('/portal/task/responses').set('Idempotency-Key', 'k1').send({ token, checkInId: 'write-c0', answers: {} }).expect(200);
    await request(app.getHttpServer()).post('/portal/task/responses').set('Idempotency-Key', 'k1').send({ token, checkInId: 'write-c0', answers: {} }).expect(200);
    expect(tasks.submit).toHaveBeenCalledTimes(2);
    expect(prisma.idempotencyRecord.findFirst).not.toHaveBeenCalled();
    expect(prisma.idempotencyRecord.create).not.toHaveBeenCalled();
    const interceptor = new IdempotencyInterceptor(prisma as any);
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ path: '/webhooks/whatsapp', method: 'POST', headers: { 'idempotency-key': 'k' } }), getResponse: () => ({}) }) } as any;
    await expect(lastValueFrom(interceptor.intercept(ctx, { handle: () => of('ran') }))).resolves.toBe('ran');
  });

  it('sends no patient-entered text or photo to OpenAI (PP-90)', () => {
    const sources = [portalDir, path.resolve(__dirname, '../../../../../frontend/src/app/p'), path.resolve(__dirname, '../../../../../frontend/src/lib/portal')]
      .flatMap(function walk(dir: string): string[] {
        return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
      })
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes(`${path.sep}tests${path.sep}`));
    expect(sources.length).toBeGreaterThan(10);
    for (const f of sources) expect(fs.readFileSync(f, 'utf8')).not.toMatch(/openai|api\.openai\.com/i);
  });
});
