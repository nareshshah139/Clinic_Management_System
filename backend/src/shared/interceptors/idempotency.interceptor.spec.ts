import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  HttpCode,
  INestApplication,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../database/prisma.service';
import { IdempotencyInterceptor } from './idempotency.interceptor';

type StoredRecord = {
  key: string;
  userId: string;
  resourceType: string;
  resourceId: string;
  method: string;
  statusCode: number;
  responseBody: string;
};

const scopeOf = (r: Omit<StoredRecord, 'statusCode' | 'responseBody'>) =>
  [r.key, r.userId, r.resourceType, r.resourceId, r.method].join('|');

type FakeStore = {
  records: Map<string, StoredRecord>;
  failReads: boolean;
  failWrites: boolean;
  idempotencyRecord: {
    findFirst: jest.Mock<
      Promise<StoredRecord | null>,
      [{ where: StoredRecord }]
    >;
    create: jest.Mock<Promise<StoredRecord>, [{ data: StoredRecord }]>;
  };
};

const store: FakeStore = {
  records: new Map<string, StoredRecord>(),
  failReads: false,
  failWrites: false,
  idempotencyRecord: {
    findFirst: jest.fn(async ({ where }: { where: StoredRecord }) => {
      await Promise.resolve();
      if (store.failReads) throw new Error('idempotency store unavailable');
      return store.records.get(scopeOf(where)) ?? null;
    }),
    create: jest.fn(async ({ data }: { data: StoredRecord }) => {
      await Promise.resolve();
      if (store.failWrites) throw new Error('idempotency store unavailable');
      if (store.records.has(scopeOf(data)))
        throw Object.assign(new Error('Unique constraint failed'), {
          code: 'P2002',
        });
      store.records.set(scopeOf(data), data);
      return data;
    }),
  },
};

const calls = {
  create: 0,
  update: 0,
  replace: 0,
  remove: 0,
  read: 0,
  complete: 0,
  reject: 0,
  slow: 0,
};
let releaseSlow: () => void = () => {};
let slowGate = Promise.resolve();

@Controller('visits')
class VisitsController {
  @Post()
  create(@Body() body: { note: string }) {
    calls.create += 1;
    return { id: `visit-${calls.create}`, note: body.note };
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { note: string }) {
    calls.update += 1;
    return { id, note: body.note, revision: calls.update };
  }

  @Put(':id')
  replace(@Param('id') id: string) {
    calls.replace += 1;
    return { id, replaced: calls.replace };
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    calls.remove += 1;
    return { id, removed: calls.remove };
  }

  @Get(':id')
  read(@Param('id') id: string) {
    calls.read += 1;
    return { id, read: calls.read };
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(@Param('id') id: string) {
    calls.complete += 1;
    return { id, completed: calls.complete };
  }

  @Post('reject/now')
  reject() {
    calls.reject += 1;
    throw new BadRequestException('complaints are required');
  }

  @Post('slow/now')
  async slow() {
    calls.slow += 1;
    await slowGate;
    return { slow: calls.slow };
  }
}

class HeaderUserGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const id = req.headers['x-user'];
    if (id) req.user = { id, role: 'DOCTOR', branchId: 'branch' };
    return true;
  }
}

describe('IdempotencyInterceptor over HTTP', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [VisitsController],
      providers: [
        { provide: PrismaService, useValue: store },
        { provide: APP_GUARD, useClass: HeaderUserGuard },
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => {
    store.records.clear();
    store.failReads = false;
    store.failWrites = false;
    jest.clearAllMocks();
    for (const name of Object.keys(calls) as (keyof typeof calls)[])
      calls[name] = 0;
  });

  it('replays the first status and body for a repeated POST and runs the handler once', async () => {
    const first = await http()
      .post('/visits')
      .set('x-user', 'doctor-1')
      .set('Idempotency-Key', 'k1')
      .send({ note: 'fever' });
    const repeat = await http()
      .post('/visits')
      .set('x-user', 'doctor-1')
      .set('Idempotency-Key', 'k1')
      .send({ note: 'fever' });
    expect(first.status).toBe(201);
    expect(repeat.status).toBe(first.status);
    expect(repeat.body).toEqual(first.body);
    expect(first.body).toEqual({ id: 'visit-1', note: 'fever' });
    expect(calls.create).toBe(1);
  });

  it('replays PATCH and explicit-status POST writes without rerunning them', async () => {
    const patch = () =>
      http()
        .patch('/visits/v1')
        .set('x-user', 'doctor-1')
        .set('Idempotency-Key', 'k2')
        .send({ note: 'cough' });
    const complete = () =>
      http()
        .post('/visits/v1/complete')
        .set('x-user', 'doctor-1')
        .set('Idempotency-Key', 'k3');
    const [p1, c1] = [await patch(), await complete()];
    const [p2, c2] = [await patch(), await complete()];
    expect([p1.status, p2.status, c1.status, c2.status]).toEqual([
      200, 200, 200, 200,
    ]);
    expect(p2.body).toEqual({ id: 'v1', note: 'cough', revision: 1 });
    expect(c2.body).toEqual(c1.body);
    expect([calls.update, calls.complete]).toEqual([1, 1]);
  });

  it('replays PUT and DELETE writes without rerunning them', async () => {
    const put = () =>
      http()
        .put('/visits/v1')
        .set('x-user', 'doctor-1')
        .set('Idempotency-Key', 'k11');
    const del = () =>
      http()
        .delete('/visits/v1')
        .set('x-user', 'doctor-1')
        .set('Idempotency-Key', 'k12');
    const [put1, del1] = [await put(), await del()];
    const [put2, del2] = [await put(), await del()];
    expect([put2.status, put2.body]).toEqual([
      put1.status,
      { id: 'v1', replaced: 1 },
    ]);
    expect([del2.status, del2.body]).toEqual([
      del1.status,
      { id: 'v1', removed: 1 },
    ]);
    expect([calls.replace, calls.remove]).toEqual([1, 1]);
  });

  it("never replays one user's response to another user who sends the same key", async () => {
    const own = await http()
      .post('/visits')
      .set('x-user', 'doctor-1')
      .set('Idempotency-Key', 'shared')
      .send({ note: 'doctor one' });
    const other = await http()
      .post('/visits')
      .set('x-user', 'reception-1')
      .set('Idempotency-Key', 'shared')
      .send({ note: 'reception' });
    expect(own.body).toEqual({ id: 'visit-1', note: 'doctor one' });
    expect(other.body).toEqual({ id: 'visit-2', note: 'reception' });
    expect(calls.create).toBe(2);
  });

  it('scopes a key to the resource id and the method', async () => {
    await http()
      .patch('/visits/v1')
      .set('x-user', 'doctor-1')
      .set('Idempotency-Key', 'k4')
      .send({ note: 'a' });
    const otherVisit = await http()
      .patch('/visits/v2')
      .set('x-user', 'doctor-1')
      .set('Idempotency-Key', 'k4')
      .send({ note: 'b' });
    const otherMethod = await http()
      .post('/visits/v1/complete')
      .set('x-user', 'doctor-1')
      .set('Idempotency-Key', 'k4');
    expect(otherVisit.body).toEqual({ id: 'v2', note: 'b', revision: 2 });
    expect(otherMethod.body).toEqual({ id: 'v1', completed: 1 });
    expect([calls.update, calls.complete]).toEqual([2, 1]);
  });

  it('never caches GET requests, even with a key', async () => {
    const first = await http()
      .get('/visits/v1')
      .set('x-user', 'doctor-1')
      .set('Idempotency-Key', 'k5');
    const second = await http()
      .get('/visits/v1')
      .set('x-user', 'doctor-1')
      .set('Idempotency-Key', 'k5');
    expect(
      [first.body, second.body].map((body: { read: number }) => body.read),
    ).toEqual([1, 2]);
    expect(store.idempotencyRecord.findFirst).not.toHaveBeenCalled();
    expect(store.idempotencyRecord.create).not.toHaveBeenCalled();
  });

  it('runs every write that carries no key and stores nothing', async () => {
    await http().post('/visits').set('x-user', 'doctor-1').send({ note: 'a' });
    await http()
      .post('/visits')
      .set('x-user', 'doctor-1')
      .set('Idempotency-Key', '   ')
      .send({ note: 'a' });
    expect(calls.create).toBe(2);
    expect(store.records.size).toBe(0);
  });

  it('does not store a failed write, so a retry runs the handler again', async () => {
    const first = await http()
      .post('/visits/reject/now')
      .set('x-user', 'doctor-1')
      .set('Idempotency-Key', 'k6');
    const retry = await http()
      .post('/visits/reject/now')
      .set('x-user', 'doctor-1')
      .set('Idempotency-Key', 'k6');
    expect([first.status, retry.status]).toEqual([400, 400]);
    expect(calls.reject).toBe(2);
    expect(store.records.size).toBe(0);
  });

  it('lets the write proceed when the store cannot be read', async () => {
    store.failReads = true;
    const res = await http()
      .post('/visits')
      .set('x-user', 'doctor-1')
      .set('Idempotency-Key', 'k7')
      .send({ note: 'store down' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'visit-1', note: 'store down' });
    expect(calls.create).toBe(1);
  });

  it('lets the write proceed when the store cannot be written, and runs a retry again', async () => {
    store.failWrites = true;
    const first = await http()
      .post('/visits')
      .set('x-user', 'doctor-1')
      .set('Idempotency-Key', 'k8')
      .send({ note: 'a' });
    const retry = await http()
      .post('/visits')
      .set('x-user', 'doctor-1')
      .set('Idempotency-Key', 'k8')
      .send({ note: 'a' });
    expect([first.status, retry.status]).toEqual([201, 201]);
    expect(
      [first.body, retry.body].map((body: { id: string }) => body.id),
    ).toEqual(['visit-1', 'visit-2']);
    expect(calls.create).toBe(2);
  });

  // Target idempotency-concurrent-first-requests: both requests miss the store before either response is saved.
  it.failing(
    'runs the handler once when two first requests with one key overlap',
    async () => {
      slowGate = new Promise<void>((resolve) => {
        releaseSlow = resolve;
      });
      const send = () =>
        http()
          .post('/visits/slow/now')
          .set('x-user', 'doctor-1')
          .set('Idempotency-Key', 'k9')
          .then((res) => res);
      const pending = [send(), send()];
      await new Promise((resolve) => setTimeout(resolve, 50));
      releaseSlow();
      const [a, b] = await Promise.all(pending);
      expect(b.body).toEqual(a.body);
      expect(calls.slow).toBe(1);
    },
  );

  // Target idempotency-anonymous-keys-unscoped: requests without a user all share the empty user id.
  it.failing(
    'never replays one anonymous caller response to another anonymous caller',
    async () => {
      await http()
        .post('/visits')
        .set('Idempotency-Key', 'k10')
        .send({ note: 'first caller' });
      const second = await http()
        .post('/visits')
        .set('Idempotency-Key', 'k10')
        .send({ note: 'second caller' });
      expect(second.body).toEqual({ id: 'visit-2', note: 'second caller' });
      expect(calls.create).toBe(2);
    },
  );
});
