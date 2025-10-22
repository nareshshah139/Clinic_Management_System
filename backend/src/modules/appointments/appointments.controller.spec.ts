import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

// Bypass guards by overriding JwtAuthGuard and inject a fake user
class JwtAuthGuardBypass {
  canActivate(): boolean {
    return true;
  }
}

describe('AppointmentsController (lite integration)', () => {
  let app: INestApplication;
  const serviceMock = {
    create: jest.fn(),
  } as unknown as AppointmentsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppointmentsController],
      providers: [
        { provide: AppointmentsService, useValue: serviceMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new JwtAuthGuardBypass())
      .compile();

    app = moduleRef.createNestApplication();
    // Middleware to inject req.user
    app.use((req: any, _res, next) => {
      req.user = { id: 'u1', branchId: 'branch-1', role: 'ADMIN' };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /appointments calls service.create with branchId from request', async () => {
    const dto = {
      patientId: 'p1',
      doctorId: 'd1',
      date: '2099-01-01',
      slot: '10:00-10:30',
    };
    (serviceMock.create as any).mockResolvedValue({ id: 'apt-1', ...dto });

    type SupertestApp = Parameters<typeof request>[0];
    const server = app.getHttpServer() as unknown as SupertestApp;

    await request(server)
      .post('/appointments')
      .send(dto)
      .expect(201);

    expect(serviceMock.create as any).toHaveBeenCalledWith(expect.any(Object), 'branch-1');
  });
});
