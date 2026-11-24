import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { allowedOrigins, CORS_OPTIONS } from '../cors-origins';

@Controller('probe')
class ProbeController {
  @Get()
  probe() {
    return { ok: true };
  }
}

describe('CORS origins', () => {
  let app: INestApplication;

  const configured = process.env.CORS_ALLOWED_ORIGINS;
  beforeAll(async () => {
    process.env.CORS_ALLOWED_ORIGINS =
      ' https://clinic.example.test , https://frontend-production-703e.up.railway.app,https://*.up.railway.app,http://plain.example.test,https://slash.example.test/,not a url';
    const module = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();
    app = module.createNestApplication();
    app.enableCors(CORS_OPTIONS);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    if (configured === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
    else process.env.CORS_ALLOWED_ORIGINS = configured;
  });

  it('keeps only the local frontend ports and the exact https origins configured', () => {
    expect([...allowedOrigins()]).toEqual([
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'https://clinic.example.test',
      'https://frontend-production-703e.up.railway.app',
    ]);
    expect([...allowedOrigins('')]).toEqual([
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
    ]);
  });

  it('is the configuration both boot paths install', () => {
    const main = fs.readFileSync(
      path.join(__dirname, '..', '..', 'main.ts'),
      'utf8',
    );
    expect(main.match(/enableCors\([^)]*\)/g)).toEqual([
      'enableCors(CORS_OPTIONS)',
      'enableCors(CORS_OPTIONS)',
    ]);
  });

  it.each([
    ['http://localhost:3000', true],
    ['http://localhost:3001', true],
    ['http://localhost:3002', true],
    ['https://clinic.example.test', true],
    ['https://frontend-production-703e.up.railway.app', true],
    ['https://clinic.up.railway.app', false],
    ['https://evil.up.railway.app', false],
    ['https://anyone.railway.app', false],
    ['https://frontend-production-703e.up.railway.app.evil.example', false],
    ['https://x.frontend-production-703e.up.railway.app', false],
    ['http://plain.example.test', false],
    ['https://slash.example.test', false],
    ['https://clinic.example.test:8443', false],
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
      expect(res.headers['access-control-allow-credentials']).toBe(
        granted ? 'true' : undefined,
      );
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
