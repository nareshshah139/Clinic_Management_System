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
import { canonicalBody, encodeCaller, signPortalCall, type PortalCaller } from '../portal-call';
import { Caller, PortalInternal } from '../portal-internal.decorator';
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

describe('/internal/portal (signed portal calls)', () => {
  let app: INestApplication;
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
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => {
    process.env.PORTAL_SERVICE_SECRET = SECRET;
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
