import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { ALLOWED_ORIGINS, CORS_OPTIONS } from '../cors-origins';

@Controller('probe')
class ProbeController {
  @Get()
  probe() {
    return { ok: true };
  }
}

describe('CORS origins', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();
    app = module.createNestApplication();
    app.enableCors(CORS_OPTIONS);
    await app.init();
  });
  afterAll(() => app.close());

  it('pins the reviewed origin list', () => {
    expect(ALLOWED_ORIGINS.map((origin) => origin.source)).toEqual([
      '^http:\\/\\/localhost:(3000|3001|3002)$',
      '^https:\\/\\/.*\\.railway\\.app$',
      '^https:\\/\\/.*\\.up\\.railway\\.app$',
    ]);
  });

  it('is the configuration the boot path installs', () => {
    const main = fs.readFileSync(
      path.join(__dirname, '..', '..', 'main.ts'),
      'utf8',
    );
    expect(main.match(/enableCors\([^)]*\)/g)).toEqual([
      'enableCors(CORS_OPTIONS)',
    ]);
  });

  it.each([
    ['http://localhost:3000', true],
    ['http://localhost:3001', true],
    ['http://localhost:3002', true],
    ['https://clinic.up.railway.app', true],
    ['https://evil.up.railway.app', true],
    ['https://anyone.railway.app', true],
    ['http://localhost:4000', false],
    ['https://localhost:3000', false],
    ['http://evil.up.railway.app', false],
    ['https://railway.app', false],
    ['https://railway.app.evil.example', false],
    ['https://evil.example', false],
    ['null', false],
  ])('%s granted: %s', async (origin, granted) => {
    const preflight = await request(app.getHttpServer())
      .options('/probe')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'authorization,idempotency-key');
    const simple = await request(app.getHttpServer())
      .get('/probe')
      .set('Origin', origin)
      .expect(200);
    for (const res of [preflight, simple]) {
      expect(res.headers['access-control-allow-origin']).toBe(
        granted ? origin : undefined,
      );
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    }
    if (granted) {
      expect(preflight.headers['access-control-allow-methods']).toBe(
        'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      );
      expect(preflight.headers['access-control-allow-headers']).toBe(
        'Content-Type,Authorization,Idempotency-Key,X-Request-Id,X-Request-Attempt',
      );
      expect(simple.headers['access-control-expose-headers']).toBe(
        'X-Request-Id,Retry-After',
      );
    }
  });
});
