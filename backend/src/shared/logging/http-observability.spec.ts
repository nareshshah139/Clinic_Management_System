import {
  BadRequestException,
  Body,
  Controller,
  Get,
  INestApplication,
  Param,
  Patch,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import { EventEmitter } from 'node:events';
import { request as httpRequest } from 'node:http';
import { gzipSync } from 'node:zlib';
import { Router } from 'express';
import request from 'supertest';
import {
  diagnosticValidationPipe,
  installHttpObservability,
  requestDiagnostics,
} from './http-observability';

class SaveDto {
  @IsString() name!: string;
}
@Controller('patients')
class TestController {
  @Patch(':id') save(@Body() body: SaveDto, @Param('id') id: string) {
    return { id, name: body.name };
  }
  @Get('validation') invalid() {
    throw new BadRequestException({
      message: ['name is required'],
      details: { field: 'name' },
    });
  }
  @Get('expired') expired() {
    throw new UnauthorizedException();
  }
  @Get('database') database() {
    throw Object.assign(new Error('SECRET PATIENT database payload'), {
      code: 'P2002',
    });
  }
}

let profileSaves = 0;
@Controller('users')
class ProfileController {
  @Patch(':id/profile') save() {
    profileSaves++;
    return { saved: true };
  }
  @Get('hostile-parser-error') hostileParserError() {
    throw Object.assign(new Error('PRIVATE EXCEPTION BODY'), {
      status: 413,
      type: 'entity.too.large',
      limit: Infinity,
      length: 'PRIVATE LENGTH',
      received: -1,
      body: 'PRIVATE BODY',
    });
  }
  @Get('unknown-parser-error') unknownParserError() {
    throw Object.assign(new Error('PRIVATE EXCEPTION BODY'), {
      status: 413,
      type: 'PRIVATE TYPE',
      limit: 100,
      length: 200,
      received: 200,
    });
  }
}

describe('HTTP diagnostics at the Nest boundary', () => {
  let app: INestApplication;
  let lines: string[];
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TestController, ProfileController],
    }).compile();
    app = module.createNestApplication({ logger: false });
    installHttpObservability(app, (line) => lines.push(line));
    app.useGlobalPipes(diagnosticValidationPipe());
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(() => {
    lines = [];
    profileSaves = 0;
  });
  afterAll(async () => {
    await app.close();
  });

  it('correlates a saved patient without logging patient data, tokens or the raw URL', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const result = await request(app.getHttpServer())
      .patch('/patients/private-patient-id?phone=9999999999')
      .set('X-Request-Id', id)
      .set('X-Request-Attempt', '2')
      .set('Authorization', 'Bearer secret-token')
      .send({ name: 'Private Patient Name' })
      .expect(200);
    expect(result.headers['x-request-id']).toBe(id);
    expect(result.body.name).toBe('Private Patient Name');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      requestId: id,
      route: '/patients/:id',
      status: 200,
      attempt: 2,
      outcome: 'succeeded',
    });
    expect(lines.join('')).not.toMatch(
      /Private Patient|private-patient-id|9999999999|secret-token/,
    );
  });

  it('records pipe validation and authentication failures with references and preserves public responses', async () => {
    const invalid = await request(app.getHttpServer())
      .patch('/patients/p')
      .send({ name: 123 })
      .expect(400);
    expect(invalid.body.message).toEqual(['name must be a string']);
    expect(invalid.body.requestId).toBe(invalid.headers['x-request-id']);
    expect(JSON.parse(lines[0]).validation).toEqual([
      { field: 'name', rules: ['isString'] },
    ]);
    const custom = await request(app.getHttpServer())
      .get('/patients/validation')
      .expect(400);
    expect(custom.body.details).toEqual({ field: 'name' });
    await request(app.getHttpServer()).get('/patients/expired').expect(401);
    expect(lines.map((line) => JSON.parse(line).errorCode)).toEqual([
      'invalid_request',
      'invalid_request',
      'unauthenticated',
    ]);
  });

  it('replaces untrusted request IDs and removes unexpected exception details', async () => {
    const result = await request(app.getHttpServer())
      .get('/patients/database')
      .set('X-Request-Id', 'patient-name')
      .expect(500);
    expect(result.body.message).toBe('Internal server error');
    expect(result.body.requestId).toMatch(/^[a-f\d-]{36}$/);
    expect(JSON.parse(lines[0])).toMatchObject({
      databaseCode: 'P2002',
      errorCode: 'server_error',
      level: 'error',
    });
    expect(lines.join('') + JSON.stringify(result.body)).not.toMatch(
      /SECRET|patient-name/,
    );
  });

  it('does not log an unmatched URL containing patient information', async () => {
    await request(app.getHttpServer())
      .get('/PrivatePatient?phone=1234567890')
      .expect(404);
    expect(JSON.parse(lines[0]).route).toBe('unmatched');
    expect(lines.join('')).not.toMatch(/PrivatePatient|1234567890/);
  });

  it('preserves malformed JSON as a 400 without logging the rejected body', async () => {
    const result = await request(app.getHttpServer())
      .patch('/patients/p')
      .set('Content-Type', 'application/json')
      .send('{"name":"PRIVATE BROKEN JSON')
      .expect(400);
    expect(result.body.requestId).toBe(result.headers['x-request-id']);
    expect(JSON.parse(lines[0])).toMatchObject({
      status: 400,
      errorCode: 'invalid_request',
      route: '/patients/:id',
      routeSource: 'registered_template',
    });
    expect(lines.join('')).not.toContain('PRIVATE');
  });

  it('identifies a rejected profile image at the unchanged 100 KiB parser boundary', async () => {
    const prefix = 'data:image/png;base64,';
    const profile = (printBgUrl: string) => ({
      metadata: { rxPrintProfile: { printBgUrl } },
    });
    const overhead = Buffer.byteLength(JSON.stringify(profile(prefix)));
    const acceptedBody = JSON.stringify(
      profile(prefix + 'A'.repeat(102400 - overhead)),
    );
    const rejectedBody = JSON.stringify(
      profile(prefix + 'A'.repeat(102401 - overhead)),
    );
    expect(Buffer.byteLength(acceptedBody)).toBe(102400);
    expect(Buffer.byteLength(rejectedBody)).toBe(102401);
    await request(app.getHttpServer())
      .patch('/users/private-user/profile')
      .set('Content-Type', 'application/json')
      .send(acceptedBody)
      .expect(200, { saved: true });
    const requestId = '11111111-1111-4111-8111-111111111111';
    const rejected = await request(app.getHttpServer())
      .patch('/users/private-user/profile?email=private@example.com')
      .set('Content-Type', 'application/json')
      .set('X-Request-Id', requestId)
      .send(rejectedBody)
      .expect(413);
    expect(profileSaves).toBe(1);
    expect(lines).toHaveLength(2);
    expect(rejected.body).toEqual({
      statusCode: 413,
      message:
        'Request body is too large. Reduce the request size and try again.',
      requestId,
      errorCode: 'payload_too_large',
    });
    expect(rejected.headers['x-request-id']).toBe(requestId);
    expect(JSON.parse(lines[1])).toMatchObject({
      requestId,
      status: 413,
      method: 'PATCH',
      route: '/users/:id/profile',
      routeSource: 'registered_template',
      errorCode: 'payload_too_large',
      parserErrorType: 'entity.too.large',
      bodyLimitBytes: 102400,
      bodyDeclaredBytes: 102401,
      outcome: 'failed',
    });
    expect(JSON.parse(lines[1])).not.toHaveProperty('bodyReceivedBytes');
    expect(lines.join('')).not.toMatch(
      /private-user|private@example|printBgUrl|data:image|AAAAAAAA/,
    );
  });

  it.each([
    ['post', '/users/private-user/profile?phone=private-phone'],
    ['patch', '/private-patient?phone=private-phone'],
    ['patch', '/users/%E0%A4/profile?phone=private-phone'],
  ] as const)(
    'keeps a rejected %s %s unmatched when no safe template matches',
    async (method, path) => {
      await request(app.getHttpServer())
        [method](path)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ private: 'x'.repeat(102400) }))
        .expect(413);
      expect(JSON.parse(lines[0])).toMatchObject({
        route: 'unmatched',
        errorCode: 'payload_too_large',
        parserErrorType: 'entity.too.large',
      });
      expect(JSON.parse(lines[0])).not.toHaveProperty('routeSource');
      expect(lines.join('')).not.toMatch(
        /private-user|private-patient|private-phone|%E0/,
      );
      expect(profileSaves).toBe(0);
    },
  );

  it('reports received bytes for a chunked rejection without claiming a declared size', async () => {
    const body = JSON.stringify({ private: 'x'.repeat(102400) });
    const response = await new Promise<{ status: number; body: any }>(
      (resolve, reject) => {
        const outgoing = httpRequest(
          {
            hostname: '127.0.0.1',
            port: app.getHttpServer().address().port,
            method: 'PATCH',
            path: '/users/private-user/profile',
            headers: { 'Content-Type': 'application/json' },
          },
          (incoming) => {
            const chunks: Buffer[] = [];
            incoming.on('data', (chunk) => chunks.push(chunk));
            incoming.on('end', () =>
              resolve({
                status: incoming.statusCode!,
                body: JSON.parse(Buffer.concat(chunks).toString()),
              }),
            );
          },
        );
        outgoing.on('error', reject);
        outgoing.write(body.slice(0, 65536));
        outgoing.end(body.slice(65536));
      },
    );
    expect(response.status).toBe(413);
    expect(response.body.errorCode).toBe('payload_too_large');
    expect(profileSaves).toBe(0);
    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0]);
    expect(event).toMatchObject({
      route: '/users/:id/profile',
      parserErrorType: 'entity.too.large',
      bodyLimitBytes: 102400,
    });
    expect(event.bodyReceivedBytes).toBeGreaterThan(102400);
    expect(event.bodyReceivedBytes).toBeLessThanOrEqual(
      Buffer.byteLength(body),
    );
    expect(event).not.toHaveProperty('bodyDeclaredBytes');
  });

  it('omits hostile numeric metadata and unrecognized parser types', async () => {
    await request(app.getHttpServer())
      .get('/users/hostile-parser-error')
      .expect(413);
    await request(app.getHttpServer())
      .get('/users/unknown-parser-error')
      .expect(413);
    const events = lines.map((line) => JSON.parse(line));
    expect(events[0].parserErrorType).toBe('entity.too.large');
    expect(events[1]).not.toHaveProperty('parserErrorType');
    for (const event of events) {
      expect(event.errorCode).toBe('payload_too_large');
      expect(event).not.toHaveProperty('bodyLimitBytes');
      expect(event).not.toHaveProperty('bodyDeclaredBytes');
      expect(event).not.toHaveProperty('bodyReceivedBytes');
    }
    expect(lines.join('')).not.toContain('PRIVATE');
  });

  it('uses Express matching options without mutating route parameters or retaining decoded identifiers', async () => {
    const layer = app
      .getHttpAdapter()
      .getInstance()
      .router.stack.find(
        (item: any) => item.route?.path === '/users/:id/profile',
      );
    let afterRouterMatch: { params: unknown; path: unknown; keys: unknown };
    const originalMatch = layer.match.bind(layer);
    const mutableMatcher = jest
      .spyOn(layer, 'match')
      .mockImplementation((path: unknown) => {
        const result = originalMatch(path);
        afterRouterMatch = {
          params: layer.params,
          path: layer.path,
          keys: layer.keys,
        };
        return result;
      });
    try {
      await request(app.getHttpServer())
        .patch('/USERS/private%2Fidentifier/PROFILE/?secret=private-value')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ private: 'x'.repeat(102400) }))
        .expect(413);
      expect(JSON.parse(lines[0])).toMatchObject({
        route: '/users/:id/profile',
        routeSource: 'registered_template',
      });
      expect(mutableMatcher).toHaveBeenCalledTimes(1);
      expect({
        params: layer.params,
        path: layer.path,
        keys: layer.keys,
      }).toEqual(afterRouterMatch!);
      expect(lines.join('')).not.toMatch(/private|identifier|secret|%2F/);
    } finally {
      mutableMatcher.mockRestore();
    }
  });

  it('labels decompressed parser bytes without mistaking compressed wire length for declared body size', async () => {
    const body = JSON.stringify({ private: 'x'.repeat(102400) });
    const compressed = gzipSync(body);
    expect(compressed.byteLength).toBeLessThan(102400);
    const response = await fetch(
      `http://127.0.0.1:${app.getHttpServer().address().port}/users/private-user/profile`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
        },
        body: compressed,
      },
    );
    expect(response.status).toBe(413);
    await response.json();
    expect(profileSaves).toBe(0);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      route: '/users/:id/profile',
      parserErrorType: 'entity.too.large',
      bodyLimitBytes: 102400,
      bodyReceivedBytes: Buffer.byteLength(body),
    });
    expect(JSON.parse(lines[0])).not.toHaveProperty('bodyDeclaredBytes');
  });

  it.each([
    ['head', '/patients/expired'],
    ['options', 'unmatched'],
  ] as const)(
    'respects %s routing semantics for parser rejection',
    async (method, route) => {
      const body = JSON.stringify({ private: 'x'.repeat(102400) });
      await request(app.getHttpServer())
        [method]('/patients/expired')
        .set('Content-Type', 'application/json')
        .set('Content-Length', String(Buffer.byteLength(body)))
        .send(body)
        .expect(413);
      expect(JSON.parse(lines[0])).toMatchObject({
        route,
        errorCode: 'payload_too_large',
      });
    },
  );
});

it.each(['array', 'regexp', 'mounted'] as const)(
  'does not guess a parser-failure template for an unsupported %s route',
  async (shape) => {
    const module = await Test.createTestingModule({}).compile();
    const app = module.createNestApplication({ logger: false });
    const lines: string[] = [];
    installHttpObservability(app, (line) => lines.push(line));
    await app.init();
    const express = app.getHttpAdapter().getInstance();
    const handler = (_req: unknown, res: any) => res.sendStatus(200);
    if (shape === 'array')
      express.patch(['/users/:id/profile', '/aliases/:id/profile'], handler);
    if (shape === 'regexp') express.patch(/^\/users\/[^/]+\/profile$/, handler);
    if (shape === 'mounted')
      express.use('/users', Router().patch('/:id/profile', handler));
    try {
      await request(app.getHttpServer())
        .patch('/users/private-user/profile?secret=private-value')
        .send({ private: 'x'.repeat(102400) })
        .expect(413);
      expect(JSON.parse(lines[0])).toMatchObject({
        route: 'unmatched',
        errorCode: 'payload_too_large',
      });
      expect(JSON.parse(lines[0])).not.toHaveProperty('routeSource');
      expect(lines.join('')).not.toMatch(/private-user|private-value/);
    } finally {
      await app.close();
    }
  },
);

it('logs a premature disconnect once as unknown and tolerates a broken log sink', () => {
  const lines: string[] = [];
  const req = {
    headers: {},
    method: 'PATCH',
    route: { path: '/patients/:id' },
  };
  const res = Object.assign(new EventEmitter(), {
    setHeader: jest.fn(),
    writableFinished: false,
    statusCode: 200,
  });
  const next = jest.fn();
  requestDiagnostics((line) => lines.push(line))(req as any, res as any, next);
  res.emit('close');
  res.emit('finish');
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0])).toMatchObject({
    event: 'http.request_aborted',
    outcome: 'unknown',
    status: null,
  });
  const broken = Object.assign(new EventEmitter(), {
    setHeader: jest.fn(),
    writableFinished: true,
    statusCode: 200,
  });
  requestDiagnostics(() => {
    throw new Error('sink unavailable');
  })(req as any, broken as any, next);
  expect(() => broken.emit('finish')).not.toThrow();
  expect(next).toHaveBeenCalledTimes(2);
});
