import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import ts from 'typescript';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { diagnosticValidationPipe } from '../../../shared/logging/http-observability';
import { canonicalBody, encodeCaller, signPortalCall, type PortalCaller } from '../portal-call';
import { Caller, PortalInternal } from '../portal-internal.decorator';
import { PrismaService } from '../../../shared/database/prisma.service';
import { deriveTaskToken, hashTaskToken } from '../../follow-ups/task-link';
import { LINK_INACTIVE_BODY } from '../../portal/link-inactive';
import { PortalRecordsService } from '../../portal/records.service';
import { TaskPageService } from '../../portal/task.service';
import { SignInService } from '../../portal/sign-in.service';
import { PortalInternalModule } from '../portal-internal.module';
import vector from './portal-call.vector.json';

const SECRET = 'portal-service-secret-for-tests-0123456789';
const PATIENT: PortalCaller = { kind: 'patient', phoneE164: '+919876543210', patientId: 'pat_1' };

@Controller('internal/portal/echo')
@PortalInternal()
class EchoController {
  @Post()
  echo(@Caller() caller: PortalCaller, @Body() body: unknown) {
    return { caller, body };
  }
}

type Signed = { method: 'GET' | 'POST'; path: string; body?: unknown; caller?: PortalCaller; ts?: number };

function headers({ method, path: p, body, caller = PATIENT, ts = Date.now() }: Signed, secret = SECRET) {
  const callerRaw = encodeCaller(caller);
  return {
    'x-portal-timestamp': String(ts),
    'x-portal-caller': callerRaw,
    'x-portal-signature': signPortalCall(secret, { method, path: p, ts, body: canonicalBody(method, body), caller: callerRaw }),
  };
}

const LIVE_SESSION = 'L'.repeat(43);
const CHOSEN_SESSION = 'C'.repeat(43);

describe('/internal/portal (signed portal calls)', () => {
  let app: INestApplication;
  const signIn = {
    requestCode: jest.fn(async () => 'sent'),
    verifyCode: jest.fn(async (): Promise<unknown> => ({ ok: false, reason: 'wrong' })),
    resolve: jest.fn(async (token: string) => {
      const base = { session: { id: 's1', identityId: 'i1' }, phoneE164: '+919800000001', profiles: [] };
      if (token === LIVE_SESSION) return { ...base, chosen: null };
      if (token === CHOSEN_SESSION) return { ...base, chosen: { patientId: 'p1', branchId: 'b1' } };
      return null;
    }),
    profileList: jest.fn(async () => ({ profiles: [{ ref: 'r'.repeat(22), firstName: 'Asha', branch: 'Banjara Hills' }], chosen: null })),
    chooseProfile: jest.fn(async () => true),
    signOut: jest.fn(async () => undefined),
  };
  const records = {
    home: jest.fn(async () => ({ home: true })),
    appointments: jest.fn(async () => []),
    visits: jest.fn(async () => []),
    checkIns: jest.fn(async () => []),
    messages: jest.fn(async () => []),
    write: jest.fn(async () => ({ sent: true })),
  };
  const links = new Map<string, unknown>();
  const prisma = { portalTaskLink: { findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) => links.get(where.tokenHash) ?? null) } };
  const tasks = { page: jest.fn(async () => ({ page: true })), submit: jest.fn(async () => ({ status: 'saved', urgent: false })) };
  const link = (id: string, revokedAt: Date | null, states: string[]) => {
    const token = deriveTaskToken(id);
    links.set(hashTaskToken(token), {
      id, patientId: `patient-of-${id}`, revokedAt, patient: { branchId: 'A', portalProfile: { consentState: 'OPTED_IN', portalEnabled: true } },
      checkIns: states.map((state, i) => ({ checkInId: `${id}-c${i}`, checkIn: { state, closesAt: new Date(Date.now() + 86_400_000) } })),
    });
    return token;
  };
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PortalInternalModule, ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 2 }] })],
      controllers: [EchoController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    })
      .overrideProvider(PrismaService).useValue(prisma)
      .overrideProvider(TaskPageService).useValue(tasks)
      .overrideProvider(SignInService).useValue(signIn)
      .overrideProvider(PortalRecordsService).useValue(records)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(diagnosticValidationPipe());
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PORTAL_SERVICE_SECRET = SECRET;
    process.env.PORTAL_LINK_SECRET = 'portal-link-test-secret';
    process.env.PORTAL_CODE_ANSWER_MS = '30';
  });
  afterEach(() => {
    delete process.env.PORTAL_SERVICE_SECRET;
  });

  it('answers 404 to every request, signed or not, while the secret is unset or short', async () => {
    const signed = headers({ method: 'GET', path: '/internal/portal/ping' });
    delete process.env.PORTAL_SERVICE_SECRET;
    await http().get('/internal/portal/ping').set(signed).expect(404);
    await http().get('/internal/portal/ping').expect(404);
    process.env.PORTAL_SERVICE_SECRET = 'short';
    await http().get('/internal/portal/ping').set(headers({ method: 'GET', path: '/internal/portal/ping' }, 'short')).expect(404);
  });

  it('accepts a signed read, names only the caller kind, and is never cached', async () => {
    const res = await http().get('/internal/portal/ping').set(headers({ method: 'GET', path: '/internal/portal/ping' })).expect(200);
    expect(res.body).toEqual({ ok: true, caller: 'patient' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('hands the route the signed caller and body exactly', async () => {
    const body = { text: 'Rash is better. నమస్తే', n: 1.5 };
    const res = await http().post('/internal/portal/echo').set(headers({ method: 'POST', path: '/internal/portal/echo', body })).send(body).expect(201);
    expect(res.body).toEqual({ caller: PATIENT, body });
  });

  it('is not limited by the shared-address throttle', async () => {
    for (let i = 0; i < 5; i++) {
      await http().get('/internal/portal/ping').set(headers({ method: 'GET', path: '/internal/portal/ping', ts: Date.now() + i })).expect(200);
    }
  });

  it('refuses a request with no signature headers', async () => {
    await http().get('/internal/portal/ping').expect(401);
  });

  it('refuses a signature made with another secret', async () => {
    await http().get('/internal/portal/ping').set(headers({ method: 'GET', path: '/internal/portal/ping' }, `${SECRET}x`)).expect(401);
  });

  it('refuses a changed body, caller, path or method under a valid signature', async () => {
    const body = { text: 'hello' };
    const signed = headers({ method: 'POST', path: '/internal/portal/echo', body });
    await http().post('/internal/portal/echo').set(signed).send({ text: 'hellO' }).expect(401);
    await http()
      .post('/internal/portal/echo')
      .set({ ...signed, 'x-portal-caller': encodeCaller({ ...PATIENT, patientId: 'pat_2' }) })
      .send(body)
      .expect(401);
    await http().post('/internal/portal/echo?x=1').set(signed).send(body).expect(401);
    await http().get('/internal/portal/ping').set(headers({ method: 'GET', path: '/internal/portal/ping?x=1' })).expect(401);
    await http().get('/internal/portal/ping').set(headers({ method: 'POST', path: '/internal/portal/ping' })).expect(401);
  });

  it('refuses timestamps more than 60 seconds old or ahead', async () => {
    const p = '/internal/portal/ping';
    await http().get(p).set(headers({ method: 'GET', path: p, ts: Date.now() - 61_000 })).expect(401);
    await http().get(p).set(headers({ method: 'GET', path: p, ts: Date.now() + 61_000 })).expect(401);
    await http().get(p).set(headers({ method: 'GET', path: p, ts: Date.now() - 50_000 })).expect(200);
  });

  it('refuses a replayed call', async () => {
    const signed = headers({ method: 'GET', path: '/internal/portal/ping' });
    await http().get('/internal/portal/ping').set(signed).expect(200);
    await http().get('/internal/portal/ping').set(signed).expect(401);
  });

  it('refuses staff credentials, cookies and idempotency keys even on a valid signature', async () => {
    const p = '/internal/portal/ping';
    await http().get(p).set({ ...headers({ method: 'GET', path: p }), Authorization: 'Bearer staff.jwt.token' }).expect(401);
    await http().get(p).set({ ...headers({ method: 'GET', path: p }), Cookie: 'auth_token=staff.jwt.token' }).expect(401);
    await http().get(p).set({ ...headers({ method: 'GET', path: p }), 'Idempotency-Key': 'k1' }).expect(401);
  });

  it.each([
    ['a patient without a phone', { kind: 'patient', patientId: 'pat_1' }],
    ['a phone that is not E.164', { kind: 'phone', phoneE164: '9876543210' }],
    ['an extra field', { kind: 'anonymous', patientId: 'pat_1' }],
    ['a short task token', { kind: 'task-link', token: 'abc' }],
    ['an unknown kind', { kind: 'staff' }],
  ])('refuses a signed caller header with %s', async (_, caller) => {
    const p = '/internal/portal/ping';
    await http().get(p).set(headers({ method: 'GET', path: p, caller: caller as PortalCaller })).expect(401);
  });

  const post = (p: string, body: unknown, caller: PortalCaller = { kind: 'anonymous' }) =>
    http().post(p).set(headers({ method: 'POST', path: p, body, caller })).send(body as object);
  const SESSION: PortalCaller = { kind: 'session', token: LIVE_SESSION };

  it('answers every code request with the same body, whether or not a code was sent (PP-55)', async () => {
    const bodies = new Set<string>();
    for (const outcome of ['sent', 'not-eligible', 'phone-window', 'clinic-ceiling']) {
      signIn.requestCode.mockResolvedValueOnce(outcome);
      const res = await post('/internal/portal/sign-in/code', { phone: '9800000001' }).expect(200);
      bodies.add(res.text);
    }
    expect(bodies.size).toBe(1);
  });

  it('answers a wrong code with 401 and a right one with the session token and profile list', async () => {
    await post('/internal/portal/sign-in/verify', { phone: '9800000001', code: '000000' }).expect(401);
    signIn.verifyCode.mockResolvedValueOnce({
      ok: true, token: LIVE_SESSION, absoluteExpiresAt: new Date('2026-11-26T00:00:00Z'),
      principal: { kind: 'portal-identity', sessionId: 's1', identityId: 'i1', phoneE164: '+919800000001' },
    });
    const res = await post('/internal/portal/sign-in/verify', { phone: '9800000001', code: '123456' }).expect(200);
    expect(res.body).toEqual({
      token: LIVE_SESSION, absoluteExpiresAt: '2026-11-26T00:00:00.000Z',
      profiles: [{ ref: 'r'.repeat(22), firstName: 'Asha', branch: 'Banjara Hills' }], chosen: null,
    });
  });

  it.each([
    ['GET', '/internal/portal/session'],
    ['POST', '/internal/portal/session/profile'],
    ['POST', '/internal/portal/sign-out'],
    ['POST', '/internal/portal/sign-out-everywhere'],
  ] as const)('%s %s works only for a live session caller', async (method, p) => {
    const body = method === 'GET' ? undefined : { ref: 'r'.repeat(22) };
    const call = (caller: PortalCaller) => {
      const req = method === 'GET' ? http().get(p) : http().post(p);
      return req.set(headers({ method: method as 'GET' | 'POST', path: p, body, caller })).send(body as object);
    };
    for (const caller of [{ kind: 'anonymous' }, PATIENT, { kind: 'phone', phoneE164: '+919800000001' }, { kind: 'session', token: 'U'.repeat(43) }] as PortalCaller[]) {
      expect((await call(caller)).status).toBe(401);
    }
    expect(signIn.signOut).not.toHaveBeenCalled();
    expect(signIn.chooseProfile).not.toHaveBeenCalled();
    expect((await call(SESSION)).status).toBe(200);
  });

  it('signs out only this session, or every session of the number', async () => {
    const principal = { kind: 'portal-identity', sessionId: 's1', identityId: 'i1', phoneE164: '+919800000001' };
    await post('/internal/portal/sign-out', {}, SESSION).expect(200);
    await post('/internal/portal/sign-out-everywhere', {}, SESSION).expect(200);
    expect(signIn.signOut.mock.calls).toEqual([[principal, false], [principal, true]]);
  });

  it.each([
    ['GET', '/internal/portal/records/home', 'home'],
    ['GET', '/internal/portal/records/appointments', 'appointments'],
    ['GET', '/internal/portal/records/visits', 'visits'],
    ['GET', '/internal/portal/records/check-ins', 'checkIns'],
    ['GET', '/internal/portal/records/messages', 'messages'],
    ['POST', '/internal/portal/records/messages', 'write'],
  ] as const)('%s %s opens only the profile chosen in a live session', async (method, p, fn) => {
    const body = method === 'GET' ? undefined : { body: 'Is the rash worse?', clientKey: '3f0c1a7e-2b4d-4c8e-9a6f-1d2e3f4a5b6c' };
    const call = (caller: PortalCaller) => {
      const req = method === 'GET' ? http().get(p) : http().post(p);
      return req.set(headers({ method, path: p, body, caller })).send(body as object);
    };
    for (const caller of [{ kind: 'anonymous' }, PATIENT, { kind: 'session', token: 'U'.repeat(43) }] as PortalCaller[]) {
      expect((await call(caller)).status).toBe(401);
    }
    const unchosen = await call(SESSION);
    expect([unchosen.status, unchosen.body.message]).toEqual([401, 'Choose whose records to open.']);
    expect(records[fn]).not.toHaveBeenCalled();
    expect((await call({ kind: 'session', token: CHOSEN_SESSION })).status).toBe(200);
    const patient = { kind: 'portal-patient', sessionId: 's1', identityId: 'i1', patientId: 'p1', branchId: 'b1' };
    expect(records[fn].mock.calls[0]).toEqual(body ? [patient, body] : [patient]);
  });

  it('refuses a malformed patient message before it reaches the records', async () => {
    const caller: PortalCaller = { kind: 'session', token: CHOSEN_SESSION };
    await post('/internal/portal/records/messages', { body: '', clientKey: 'not-a-uuid' }, caller).expect(400);
    expect(records.write).not.toHaveBeenCalled();
  });

  it.each(['questions', 'responses'])('task/%s answers every non-link caller and every dead link with the same inactive body (PP-39)', async (route) => {
    const p = `/internal/portal/task/${route}`;
    const body = route === 'responses' ? { checkInId: 'x', answers: {} } : {};
    const revoked = link('revoked', new Date(), ['OPEN']);
    const callers: PortalCaller[] = [
      { kind: 'anonymous' }, PATIENT, SESSION, { kind: 'session', token: CHOSEN_SESSION },
      { kind: 'task-link', token: deriveTaskToken('never-issued') }, { kind: 'task-link', token: revoked },
    ];
    for (const caller of callers) {
      const res = await post(p, body, caller);
      expect([res.status, res.text, res.headers['cache-control']]).toEqual([404, LINK_INACTIVE_BODY, 'no-store']);
    }
    expect(tasks.page).not.toHaveBeenCalled();
    expect(tasks.submit).not.toHaveBeenCalled();
  });

  it('builds the task principal from the signed token alone, with only OPEN check-ins (PP-84, LinkAnswersOnly)', async () => {
    const token = link('live', null, ['OPEN', 'ANSWERED', 'OPEN']);
    await post('/internal/portal/task/questions', { token: 'ignored', patientId: 'someone-else' }, { kind: 'task-link', token }).expect(200, { page: true });
    const principal = { kind: 'task-link', linkId: 'live', patientId: 'patient-of-live', branchId: 'A', checkInIds: ['live-c0', 'live-c2'] };
    expect(tasks.page).toHaveBeenCalledWith(principal);
    expect(Object.isFrozen((tasks.page.mock.calls[0] as unknown[])[0])).toBe(true);
    const answers = { checkInId: 'live-c0', answers: { severity: 3 } };
    await post('/internal/portal/task/responses', answers, { kind: 'task-link', token }).expect(200);
    expect(tasks.submit).toHaveBeenCalledWith(principal, answers);
  });

  it('sends no patient-entered text or photo to OpenAI (PP-90)', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    const sources = ['../../portal', '..'].flatMap((d) => walk(path.resolve(__dirname, d))).filter((f) => f.endsWith('.ts') && !f.includes(`${path.sep}tests${path.sep}`));
    expect(sources.length).toBeGreaterThan(10);
    for (const f of sources) expect(fs.readFileSync(f, 'utf8')).not.toMatch(/openai|api\.openai\.com/i);
  });

  it('matches the shared test vector the portal service also checks', () => {
    const { secret, signature, ...call } = vector;
    expect(signPortalCall(secret, call)).toBe(signature);
  });
});

describe('internal route list', () => {
  const decoratorName = (d: ts.Decorator) => {
    const e = ts.isCallExpression(d.expression) ? d.expression.expression : d.expression;
    return ts.isIdentifier(e) ? e.text : '';
  };
  const decoratorsOf = (n: ts.Node) => (ts.canHaveDecorators(n) ? ts.getDecorators(n) ?? [] : []);
  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? files(full) : e.name.endsWith('.controller.ts') ? [full] : [];
    });

  it('puts PortalInternal on every controller under /internal and on no other', () => {
    const wrong: string[] = [];
    for (const file of files(path.resolve(__dirname, '../../..'))) {
      const src = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      for (const node of src.statements) {
        if (!ts.isClassDeclaration(node)) continue;
        const decorators = decoratorsOf(node);
        const controller = decorators.find((d) => decoratorName(d) === 'Controller');
        if (!controller) continue;
        const arg = ts.isCallExpression(controller.expression) ? controller.expression.arguments[0] : undefined;
        const route = arg && ts.isStringLiteral(arg) ? arg.text.replace(/^\//, '') : '';
        const internal = route === 'internal' || route.startsWith('internal/');
        const guarded = decorators.some((d) => decoratorName(d) === 'PortalInternal');
        const methodGuarded = node.members.some((m) => decoratorsOf(m).some((d) => decoratorName(d) === 'PortalInternal'));
        if (internal !== guarded || methodGuarded || (internal && !route.startsWith('internal/portal'))) {
          wrong.push(`${path.relative(process.cwd(), file)}:${node.name?.text}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
