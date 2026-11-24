import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { configureTrustProxy } from './trust-proxy';
import { WindowThrottlerStorage } from './window-throttler-storage';

@Controller('probe')
class ProbeController {
  @Get()
  probe() {
    return { ok: true };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('throttle windows stay per client when another client is blocked', () => {
  let app: INestApplication;
  const from = (ip: string) => request(app.getHttpServer()).get('/probe').set('X-Forwarded-For', ip);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 400, limit: 3 }], storage: new WindowThrottlerStorage() })],
      controllers: [ProbeController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureTrustProxy(app as NestExpressApplication);
    await app.listen(0, '127.0.0.1');
  });
  afterAll(() => app.close());

  it("lets a client back in after its window although another client's block lifted meanwhile", async () => {
    for (let i = 0; i < 3; i++) expect((await from('203.0.113.10')).status).toBe(200);
    const blocked = await from('203.0.113.10');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBe('1');
    await sleep(250);
    for (let i = 0; i < 3; i++) expect((await from('203.0.113.20')).status).toBe(200);
    await sleep(200);
    expect((await from('203.0.113.10')).status).toBe(200);
    await sleep(450);
    for (let i = 0; i < 3; i++) expect((await from('203.0.113.20')).status).toBe(200);
  });
});
