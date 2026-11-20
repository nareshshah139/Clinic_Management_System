import { randomUUID } from 'node:crypto';
import { CanActivate, ExecutionContext, INestApplication, Logger } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../database/prisma.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { diagnosticValidationPipe } from '../../logging/http-observability';
import { gate, Gate } from '../../testing/interleave';
import { localDatabase } from '../../testing/local-database';
import { IdempotencyInterceptor } from '../idempotency.interceptor';
import { PrescriptionsController } from '../../../modules/prescriptions/prescriptions.controller';
import { PrescriptionsService } from '../../../modules/prescriptions/prescriptions.service';

const databaseTests = process.env.FORMAL_REPLAY_TEST_DATABASE_URL ? describe : describe.skip;

databaseTests('Idempotency formal replay: prescription pad saves', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let prisma: PrismaClient;
  let branchId: string;
  let doctorId: string;
  let patientId: string;
  let app: INestApplication;
  let store: Gate<PrismaClient>;

  const pad = () => ({
    patientId,
    doctorId,
    items: [
      {
        drugName: 'Doxycycline 100',
        dosageUnit: 'MG',
        frequency: 'ONCE_DAILY',
        duration: 30,
        durationUnit: 'DAYS',
      },
    ],
    diagnosis: 'Acne vulgaris',
    reason: 'Monthly repeat',
  });

  // createQuickPrescription in frontend/src/lib/api.ts derives the key from the payload alone,
  // so every save of the same pad sends this same key.
  const padKey = () => `cms:POST:prescriptions:pad:${patientId}`;

  const save = (key: string) =>
    request(app.getHttpServer()).post('/prescriptions/pad').set('Idempotency-Key', key).send(pad());

  const counts = async () => ({
    visits: await prisma.visit.count({ where: { patientId } }),
    prescriptions: await prisma.prescription.count({ where: { visit: { patientId } } }),
  });

  const storedResponse = async (key: string) => {
    for (let i = 0; i < 100; i++) {
      const row = await prisma.idempotencyRecord.findFirst({ where: { key } });
      if (row) return JSON.parse(row.responseBody) as { id: string };
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('the first response was never stored');
  };

  beforeAll(async () => {
    Logger.overrideLogger(false);
    fixture = await localDatabase(process.env.FORMAL_REPLAY_TEST_DATABASE_URL!);
    prisma = fixture.prisma;
    branchId = (await prisma.branch.create({ data: { name: 'Synthetic pad', address: 'Synthetic' } })).id;
    doctorId = (
      await prisma.user.create({
        data: {
          email: `pad-${randomUUID()}@example.invalid`,
          password: 'no-login',
          firstName: 'Synthetic',
          lastName: 'Doctor',
          role: 'DOCTOR',
          branchId,
        },
      })
    ).id;
  }, 120_000);

  afterAll(() => fixture?.cleanup());

  beforeEach(async () => {
    patientId = (
      await prisma.patient.create({ data: { name: 'Synthetic Patient', gender: 'F', phone: '9000000000', branchId } })
    ).id;
    store = gate(prisma, 'idempotencyRecord.updateMany', { when: 'before' });
    const signedIn: CanActivate = {
      canActivate(context: ExecutionContext) {
        context.switchToHttp().getRequest().user = { id: doctorId, branchId, role: 'DOCTOR' };
        return true;
      },
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [PrescriptionsController],
      providers: [
        { provide: PrescriptionsService, useValue: new PrescriptionsService(prisma as any, {} as any) },
        { provide: PrismaService, useValue: store.client },
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(signedIn)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(diagnosticValidationPipe());
    await app.listen(0, '127.0.0.1');
  });

  afterEach(async () => {
    store.release();
    await app.close();
  });

  it('OnePrescriptionPerIssue: a retry during a slow save creates no second visit or prescription', async () => {
    const key = padKey();
    const first = save(key).then((res) => res);
    await store.arrived;
    expect(await counts()).toEqual({ visits: 1, prescriptions: 1 });
    const retry = await save(key);
    expect([retry.status, retry.body.message]).toEqual([425, 'This save is still in progress. Wait a few seconds, then save again.']);
    store.release();
    const answered = await first;
    const later = await save(key);
    expect([answered.status, later.status, later.body.id]).toEqual([201, 201, answered.body.id]);
    expect(await counts()).toEqual({ visits: 1, prescriptions: 1 });
  });

  async function saveSamePadTwice() {
    store.release();
    const key = padKey();
    const first = await save(key);
    expect(first.status).toBe(201);
    await storedResponse(key);
    const second = await save(key);
    return { first: first.body as { id: string }, second };
  }

  it.failing('NoStaleReplay: saving the same prescription again later creates a new prescription', async () => {
    const { first, second } = await saveSamePadTwice();
    expect(second.body.id).not.toBe(first.id);
    expect(await counts()).toEqual({ visits: 2, prescriptions: 2 });
  });

  it('today: saving the same prescription again later answers with the earlier prescription', async () => {
    const { first, second } = await saveSamePadTwice();
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.id);
    expect(await counts()).toEqual({ visits: 1, prescriptions: 1 });
  });
});
