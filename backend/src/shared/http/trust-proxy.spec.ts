import { Controller, Get, INestApplication, Req } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import request from 'supertest';
import { DEFAULT_THROTTLE } from '../../modules/auth/auth.module';
import { RequestContextService } from '../context/request-context.service';
import { RequestContextInterceptor } from '../interceptors/request-context.interceptor';
import { configureTrustProxy, trustProxyHops } from './trust-proxy';
import { WindowThrottlerStorage } from './window-throttler-storage';

@Controller('probe')
class ProbeController {
  constructor(private readonly context: RequestContextService) {}
  @Get()
  probe(@Req() req: Request) {
    return { ip: req.ip, audited: this.context.get()?.ipAddress };
  }
}

describe('trusted proxy hops and the default throttle window', () => {
  let app: INestApplication;
  const hops = process.env.TRUST_PROXY_HOPS;
  const from = (forwardedFor: string) =>
    request(app.getHttpServer()).get('/probe').set('X-Forwarded-For', forwardedFor);

  beforeAll(async () => {
    delete process.env.TRUST_PROXY_HOPS;
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: [DEFAULT_THROTTLE], storage: new WindowThrottlerStorage() })],
      controllers: [ProbeController],
      providers: [
        RequestContextService,
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureTrustProxy(app as NestExpressApplication);
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app.close();
    if (hops === undefined) delete process.env.TRUST_PROXY_HOPS;
    else process.env.TRUST_PROXY_HOPS = hops;
  });

  it.each([
    [undefined, 1], ['', 1], ['2', 2], ['0', 0], ['-1', 1], ['1.5', 1], ['true', 1], ['99', 1],
  ])('reads TRUST_PROXY_HOPS=%j as %d', (configured, expected) => {
    expect(trustProxyHops(configured as string | undefined)).toBe(expected);
  });

  it('records the address the edge proxy saw, not one the client wrote into X-Forwarded-For', async () => {
    const res = await from('198.51.100.7, 203.0.113.9').expect(200);
    expect(res.body).toEqual({ ip: '203.0.113.9', audited: '203.0.113.9' });
  });

  it('allows the limit per client in a 60-second window, then 429 that outlasts 60 ms, per client address', async () => {
    const client = '203.0.113.20';
    for (let sent = 0; sent < DEFAULT_THROTTLE.limit; sent += 20) {
      const batch = await Promise.all(Array.from({ length: 20 }, () => from(client)));
      expect(batch.map((res) => res.status)).toEqual(Array(20).fill(200));
    }
    const refused = await from(client).expect(429);
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(50);
    expect(Number(refused.headers['retry-after'])).toBeLessThanOrEqual(60);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await from(client).expect(429);
    await from(`10.9.9.9, ${client}`).expect(429);
    await from('203.0.113.21').expect(200);
  });
});
