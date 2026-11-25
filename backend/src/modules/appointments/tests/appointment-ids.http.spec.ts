import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { diagnosticValidationPipe } from '../../../shared/logging/http-observability';
import { AppointmentsController } from '../appointments.controller';
import { AppointmentsService } from '../appointments.service';

jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }));

const roomId = 'cmwwamknq000c7dvr72lkgveh';
const appointmentIds = ['cmwwanss800g37dvr6ygrdyhv', 'cmwwant2v00gk7dvr9s4r5c5g'];

describe('appointment ids over HTTP', () => {
  let app: INestApplication;
  const service = { update: jest.fn(async (id: string, dto: object) => ({ id, ...dto })), bulkUpdate: jest.fn(async () => ({ count: 2 })) };

  beforeAll(async () => {
    const auth = { canActivate: (ctx: any) => {
      ctx.switchToHttp().getRequest().user = { id: 'admin-user', branchId: 'branch-1', role: 'ADMIN' };
      return true;
    } };
    const module = await Test.createTestingModule({
      controllers: [AppointmentsController],
      providers: [
        { provide: AppointmentsService, useValue: service },
        { provide: APP_GUARD, useValue: auth },
      ],
    }).overrideGuard(JwtAuthGuard).useValue(auth).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(diagnosticValidationPipe());
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('passes a room change with a real room id to the service', async () => {
    const res = await request(app.getHttpServer()).patch(`/appointments/${appointmentIds[0]}`).send({ roomId });
    expect(res.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(appointmentIds[0], { roomId }, 'branch-1', 'admin-user');
  });

  it('rejects an empty room id', async () => {
    const res = await request(app.getHttpServer()).patch(`/appointments/${appointmentIds[0]}`).send({ roomId: '' });
    expect(res.status).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('passes a bulk update of real appointment ids to the service', async () => {
    const res = await request(app.getHttpServer()).post('/appointments/bulk-update').send({ appointmentIds, status: 'CONFIRMED' });
    expect(res.status).toBe(201);
    expect(service.bulkUpdate).toHaveBeenCalledWith({ appointmentIds, status: 'CONFIRMED' }, 'branch-1');
  });

  it('rejects a bulk update with an empty id', async () => {
    const res = await request(app.getHttpServer()).post('/appointments/bulk-update').send({ appointmentIds: [appointmentIds[0], ''] });
    expect(res.status).toBe(400);
    expect(service.bulkUpdate).not.toHaveBeenCalled();
  });
});
