import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppointmentsModule } from '../appointments.module';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { UserRole, VisitType } from '@prisma/client';

describe('AppointmentsController - Conflicts (Integration)', () => {
  let app: INestApplication;
  const mockUser = { id: 'user-1', branchId: 'branch-1', role: 'RECEPTIONIST' };

  const mockAuthGuard = { canActivate: jest.fn(() => true) };

  const mockPrismaService = {
    patient: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    room: { findFirst: jest.fn() },
    appointment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    onModuleInit: jest.fn(),
    $connect: jest.fn(),
    enableShutdownHooks: jest.fn(),
  };

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5);
  const dateStr = futureDate.toISOString().split('T')[0];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppointmentsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideGuard(JwtAuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();

    // inject mock user into request
    app.use((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /appointments returns 409 when doctor is already booked (overlapping slot)', async () => {
    const dto = {
      patientId: 'patient-1',
      doctorId: 'doctor-1',
      roomId: 'room-1',
      date: dateStr,
      slot: '10:00-10:30',
      visitType: VisitType.OPD,
    };

    const patient = { id: 'patient-1', name: 'Pat' };
    const doctor = { id: 'doctor-1', role: UserRole.DOCTOR } as any;
    const room = { id: 'room-1', isActive: true };

    mockPrismaService.patient.findFirst.mockResolvedValue(patient);
    mockPrismaService.user.findFirst.mockResolvedValue(doctor);
    mockPrismaService.room.findFirst.mockResolvedValue(room);

    // doctor conflict
    mockPrismaService.appointment.findMany.mockResolvedValue([
      { id: 'apt-x', slot: '10:15-10:45', patient: { name: 'Alice' } },
    ]);

    const res = await request(app.getHttpServer())
      .post('/appointments')
      .send(dto)
      .expect(409);

    expect(res.body).toHaveProperty('message');
  });
}); 