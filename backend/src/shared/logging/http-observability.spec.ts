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

describe('HTTP diagnostics at the Nest boundary', () => {
  let app: INestApplication;
  let lines: string[];
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TestController],
    }).compile();
    app = module.createNestApplication({ logger: false });
    installHttpObservability(app, (line) => lines.push(line));
    app.useGlobalPipes(diagnosticValidationPipe());
    await app.init();
  });
  beforeEach(() => {
    lines = [];
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
    });
    expect(lines.join('')).not.toContain('PRIVATE');
  });
});

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
