import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileInterceptor,
  NestExpressApplication,
} from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { request as httpRequest } from 'node:http';
import { gzipSync } from 'node:zlib';
import request from 'supertest';
import { installHttpObservability } from '../logging/http-observability';
import { configureRequestBody } from './request-body';

const documents = new Map<string, Record<string, unknown>>();
let handlerCalls = 0;

function saveDocument(id: string, body: Record<string, unknown>) {
  handlerCalls += 1;
  documents.set(id, body);
  return { saved: true };
}

/**
 * @cc [owner:nareshshah139,label:testing] synthetic-save-readback
 * Fixture saves retain parsed bodies only in memory, and readback returns the same
 * values without querying production services or data.
 */
@Controller()
class SaveController {
  @Post('patients')
  createPatient(@Body() body: Record<string, unknown>) {
    return saveDocument('synthetic-id', body);
  }

  @Patch('patients/:id')
  patient(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return saveDocument(id, body);
  }

  @Patch('visits/:id')
  visit(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return saveDocument(id, body);
  }

  @Patch('prescriptions/:id')
  prescription(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return saveDocument(id, body);
  }

  @Patch('users/:id/profile')
  profile(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return saveDocument(id, body);
  }

  @Get('saved/:id')
  read(@Param('id') id: string) {
    return documents.get(id);
  }

  @Post('attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 6 * 1024 * 1024, files: 1 },
    }),
  )
  attachment(@UploadedFile() file: Express.Multer.File) {
    handlerCalls += 1;
    return { receivedBytes: file.size };
  }
}

function jsonOfSize(size: number): string {
  return JSON.stringify({ note: 'x'.repeat(size - 11) });
}

describe('Configured save request bodies', () => {
  let app: NestExpressApplication;
  let lines: string[];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SaveController],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    installHttpObservability(app, (line) => lines.push(line));
    configureRequestBody(app);
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(() => {
    lines = [];
    documents.clear();
    handlerCalls = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  async function sendStream(body: string | Buffer, compressed = false) {
    const bytes = typeof body === 'string' ? Buffer.from(body) : body;
    return new Promise<{ status: number; body: Record<string, unknown> }>(
      (resolve, reject) => {
        const outgoing = httpRequest(
          {
            hostname: '127.0.0.1',
            port: app.getHttpServer().address().port,
            method: 'PATCH',
            path: '/patients/synthetic-id',
            headers: {
              'Content-Type': 'application/json',
              ...(compressed ? { 'Content-Encoding': 'gzip' } : {}),
            },
          },
          (incoming) => {
            const chunks: Buffer[] = [];
            incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
            incoming.on('error', reject);
            incoming.on('end', () =>
              resolve({
                status: incoming.statusCode!,
                body: JSON.parse(Buffer.concat(chunks).toString()),
              }),
            );
          },
        );
        outgoing.on('error', reject);
        for (let offset = 0; offset < bytes.length; offset += 65536) {
          outgoing.write(bytes.subarray(offset, offset + 65536));
        }
        outgoing.end();
      },
    );
  }

  it.each<[string, string, Record<string, unknown>]>([
    [
      'patient details',
      '/patients/synthetic-id',
      {
        medicalHistory: 'SYNTHETIC_CLINICAL_CONTENT'.repeat(6000),
      },
    ],
    [
      'UTF-8 visit notes',
      '/visits/synthetic-id',
      {
        notes: 'SYNTHETIC_CLINICAL_CONTENT' + 'न'.repeat(36000),
      },
    ],
    [
      'duplicated prescription history',
      '/prescriptions/synthetic-id',
      {
        clinicalData: {
          history: {
            personalHistory: 'SYNTHETIC_CLINICAL_CONTENT' + 'a'.repeat(60000),
          },
        },
        metadata: {
          histories: {
            personalHistory: 'SYNTHETIC_CLINICAL_CONTENT' + 'a'.repeat(60000),
          },
        },
      },
    ],
    [
      'doctor print background',
      '/users/synthetic-id/profile',
      {
        metadata: {
          rxPrintProfile: {
            printBgUrl:
              'data:image/png;base64,' +
              Buffer.alloc(102400, 1).toString('base64'),
          },
        },
      },
    ],
  ])(
    'preserves %s above the former 100 KiB ceiling',
    async (_label, route, body) => {
      expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(102400);
      await request(app.getHttpServer())
        .patch(route)
        .send(body)
        .expect(200, { saved: true });
      const saved = await request(app.getHttpServer())
        .get('/saved/synthetic-id')
        .expect(200);
      expect(saved.body).toEqual(body);
      expect(handlerCalls).toBe(1);
      expect(lines).toHaveLength(2);
      expect(lines.join('')).not.toContain('SYNTHETIC_CLINICAL_CONTENT');
      expect(lines.join('')).not.toContain('data:image/png;base64,');
      expect(lines.join('')).not.toContain('synthetic-id');
    },
  );

  it('registers a patient with details above the former 100 KiB ceiling', async () => {
    const body = { medicalHistory: 'SYNTHETIC_CLINICAL_CONTENT'.repeat(6000) };
    expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(102400);
    await request(app.getHttpServer())
      .post('/patients')
      .send(body)
      .expect(201, { saved: true });
    const saved = await request(app.getHttpServer())
      .get('/saved/synthetic-id')
      .expect(200);
    expect(saved.body).toEqual(body);
    expect(handlerCalls).toBe(1);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({
      route: '/patients',
      status: 201,
    });
    expect(lines.join('')).not.toContain('SYNTHETIC_CLINICAL_CONTENT');
  });

  it('preserves a JSON body of exactly 5242880 bytes', async () => {
    const body = jsonOfSize(5242880);
    expect(Buffer.byteLength(body)).toBe(5242880);
    await request(app.getHttpServer())
      .patch('/patients/synthetic-id')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200, { saved: true });
    const saved = await request(app.getHttpServer())
      .get('/saved/synthetic-id')
      .expect(200);
    expect(saved.body).toEqual(JSON.parse(body));
    expect(handlerCalls).toBe(1);
  });

  it('rejects one byte above the ceiling before saving with safe correlated diagnostics', async () => {
    const reference = '11111111-1111-4111-8111-111111111111';
    const body = jsonOfSize(5242881);
    expect(Buffer.byteLength(body)).toBe(5242881);
    const response = await request(app.getHttpServer())
      .patch('/patients/synthetic-id?private=secret')
      .set('Content-Type', 'application/json')
      .set('X-Request-Id', reference)
      .send(body)
      .expect(413);
    expect(response.headers['x-request-id']).toBe(reference);
    expect(response.body.errorCode).toBe('payload_too_large');
    expect(handlerCalls).toBe(0);
    expect(documents.size).toBe(0);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      requestId: reference,
      event: 'http.request_completed',
      route: '/patients/:id',
      routeSource: 'registered_template',
      status: 413,
      errorCode: 'payload_too_large',
      parserErrorType: 'entity.too.large',
      bodyLimitBytes: 5242880,
      bodyDeclaredBytes: 5242881,
    });
    expect(lines[0]).not.toContain('synthetic-id');
    expect(lines[0]).not.toContain('secret');
    expect(lines[0]).not.toContain('xxxx');
  });

  it.each([false, true])(
    'accepts streamed JSON above 100 KiB (gzip=%s)',
    async (compressed) => {
      const body = jsonOfSize(200000);
      const response = await sendStream(
        compressed ? gzipSync(body) : body,
        compressed,
      );
      expect(response.status).toBe(200);
      const saved = await request(app.getHttpServer())
        .get('/saved/synthetic-id')
        .expect(200);
      expect(saved.body).toEqual(JSON.parse(body));
      expect(handlerCalls).toBe(1);
    },
  );

  it.each([false, true])(
    'caps streamed decoded JSON at 5 MiB (gzip=%s)',
    async (compressed) => {
      const body = jsonOfSize(5242881);
      const encoded = compressed ? gzipSync(body) : body;
      if (compressed) expect(Buffer.byteLength(encoded)).toBeLessThan(102400);
      const response = await sendStream(encoded, compressed);
      expect(response.status).toBe(413);
      expect(response.body.errorCode).toBe('payload_too_large');
      expect(handlerCalls).toBe(0);
      expect(documents.size).toBe(0);
      expect(lines).toHaveLength(1);
      const event = JSON.parse(lines[0]);
      expect(event).toMatchObject({
        parserErrorType: 'entity.too.large',
        bodyLimitBytes: 5242880,
      });
      expect(event.bodyReceivedBytes).toBeGreaterThan(5242880);
      expect(event.bodyReceivedBytes).toBeLessThanOrEqual(5242881);
      expect(event).not.toHaveProperty('bodyDeclaredBytes');
    },
  );

  it('preserves malformed JSON rejection and its request reference', async () => {
    const response = await request(app.getHttpServer())
      .patch('/patients/synthetic-id')
      .set('Content-Type', 'application/json')
      .send('{"note":')
      .expect(400);
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
    expect(handlerCalls).toBe(0);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      route: '/patients/:id',
      status: 400,
    });
  });

  it('retains the 100 KiB urlencoded limit and parsing', async () => {
    await request(app.getHttpServer())
      .patch('/patients/synthetic-id')
      .type('form')
      .send({ note: 'small synthetic form' })
      .expect(200, { saved: true });
    const saved = await request(app.getHttpServer())
      .get('/saved/synthetic-id')
      .expect(200);
    expect(saved.body).toEqual({ note: 'small synthetic form' });
    await request(app.getHttpServer())
      .patch('/patients/synthetic-id')
      .type('form')
      .send('note=' + 'x'.repeat(102400))
      .expect(413);
    expect(handlerCalls).toBe(1);
    expect(JSON.parse(lines[2])).toMatchObject({
      parserErrorType: 'entity.too.large',
      bodyLimitBytes: 102400,
    });
    expect(documents.get('synthetic-id')).toEqual({
      note: 'small synthetic form',
    });
  });

  it('leaves multipart uploads to their own interceptor limit', async () => {
    await request(app.getHttpServer())
      .post('/attachments')
      .attach('file', Buffer.alloc(5242881, 1), 'synthetic.bin')
      .expect(201, { receivedBytes: 5242881 });
    await request(app.getHttpServer())
      .post('/attachments')
      .attach('file', Buffer.alloc(6291457, 1), 'synthetic.bin')
      .expect(413);
    expect(handlerCalls).toBe(1);
  });
});
