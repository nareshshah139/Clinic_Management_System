import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppointmentsModule } from '../appointments.module';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { AppointmentStatus, VisitType, UserRole } from '@prisma/client';

describe('AppointmentsController (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const mockUser = {
    id: 'user-123',
    branchId: 'branch-123',
    role: 'DOCTOR',
  };

  const mockAuthGuard = {
    canActivate: jest.fn(() => true),
  };

  // Mock Prisma Service
  const mockPrismaService = {
    patient: {
      findFirst: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
    },
    room: {
      findFirst: jest.fn(),
    },
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

  // Use future date for tests
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7);
  const futureDateString = futureDate.toISOString().split('T')[0];

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
    prisma = moduleFixture.get<PrismaService>(PrismaService);

    // Mock request user
    app.use((req, res, next) => {
      req.user = mockUser;
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

  describe('/appointments (POST)', () => {
    it('should create a new appointment', async () => {
      const createAppointmentDto = {
        patientId: 'patient-123',
        doctorId: 'doctor-123',
        roomId: 'room-123',
        date: futureDateString,
        slot: '10:00-10:30',
        visitType: VisitType.OPD,
        notes: 'Regular checkup',
        source: 'Walk-in',
      };

      const mockPatient = { id: 'patient-123', name: 'John Doe' };
      const mockDoctor = { id: 'doctor-123', name: 'Dr. Smith', role: UserRole.DOCTOR };
      const mockRoom = { id: 'room-123', name: 'Room 1', isActive: true };
      const mockAppointment = {
        id: 'appointment-123',
        ...createAppointmentDto,
        tokenNumber: 1,
        patient: mockPatient,
        doctor: mockDoctor,
        room: mockRoom,
      };

      mockPrismaService.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrismaService.user.findFirst.mockResolvedValue(mockDoctor);
      mockPrismaService.room.findFirst.mockResolvedValue(mockRoom);
      mockPrismaService.appointment.findMany.mockResolvedValue([]);
      mockPrismaService.appointment.findFirst.mockResolvedValue(null);
      mockPrismaService.appointment.create.mockResolvedValue(mockAppointment);

      const response = await request(app.getHttpServer())
        .post('/appointments')
        .send(createAppointmentDto)
        .expect(201);

      expect(response.body).toMatchObject({
        id: 'appointment-123',
        patientId: 'patient-123',
        doctorId: 'doctor-123',
      });
    });

    it('should return 400 for invalid time slot', async () => {
      const createAppointmentDto = {
        patientId: 'patient-123',
        doctorId: 'doctor-123',
        date: futureDateString,
        slot: 'invalid-slot',
        visitType: VisitType.OPD,
      };

      await request(app.getHttpServer())
        .post('/appointments')
        .send(createAppointmentDto)
        .expect(400);
    });
  });

  describe('/appointments (GET)', () => {
    it('should return paginated appointments', async () => {
      const mockAppointments = [
        {
          id: 'appointment-1',
          patient: { id: 'patient-1', name: 'John Doe' },
          doctor: { id: 'doctor-1', name: 'Dr. Smith' },
          room: { id: 'room-1', name: 'Room 1' },
        },
      ];

      mockPrismaService.appointment.findMany.mockResolvedValue(mockAppointments);
      mockPrismaService.appointment.count.mockResolvedValue(1);

      const response = await request(app.getHttpServer())
        .get('/appointments')
        .query({ page: 1, limit: 20 })
        .expect(200);

      expect(response.body).toHaveProperty('appointments');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.appointments).toHaveLength(1);
    });

    it('should filter appointments by doctor', async () => {
      mockPrismaService.appointment.findMany.mockResolvedValue([]);
      mockPrismaService.appointment.count.mockResolvedValue(0);

      await request(app.getHttpServer())
        .get('/appointments')
        .query({ doctorId: 'doctor-123' })
        .expect(200);

      expect(mockPrismaService.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            doctorId: 'doctor-123',
          }),
        }),
      );
    });
  });

  describe('/appointments/available-slots (GET)', () => {
    it('should return available slots', async () => {
      const mockDoctor = { id: 'doctor-123', name: 'Dr. Smith', role: UserRole.DOCTOR };
      const mockBookedAppointments = [
        { slot: '10:00-10:30' },
        { slot: '11:00-11:30' },
      ];

      mockPrismaService.user.findFirst.mockResolvedValue(mockDoctor);
      mockPrismaService.appointment.findMany.mockResolvedValue(mockBookedAppointments);

      const response = await request(app.getHttpServer())
        .get('/appointments/available-slots')
        .query({
          doctorId: 'doctor-123',
          date: futureDateString,
          durationMinutes: 30,
        })
        .expect(200);

      expect(response.body).toHaveProperty('availableSlots');
      expect(response.body).toHaveProperty('bookedSlots');
      expect(response.body.bookedSlots).toContain('10:00-10:30');
    });
  });

  describe('/appointments/:id (GET)', () => {
    it('should return appointment by id', async () => {
      const mockAppointment = {
        id: 'appointment-123',
        patient: { id: 'patient-123', name: 'John Doe' },
        doctor: { id: 'doctor-123', name: 'Dr. Smith' },
        room: { id: 'room-123', name: 'Room 1' },
      };

      mockPrismaService.appointment.findFirst.mockResolvedValue(mockAppointment);

      const response = await request(app.getHttpServer())
        .get('/appointments/appointment-123')
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'appointment-123',
      });
    });

    it('should return 404 for non-existent appointment', async () => {
      mockPrismaService.appointment.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/appointments/non-existent')
        .expect(404);
    });
  });

  describe('/appointments/:id (PATCH)', () => {
    it('should update appointment', async () => {
      const mockAppointment = {
        id: 'appointment-123',
        status: AppointmentStatus.SCHEDULED,
      };

      const mockUpdatedAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.CONFIRMED,
        patient: { id: 'patient-123', name: 'John Doe' },
        doctor: { id: 'doctor-123', name: 'Dr. Smith' },
        room: { id: 'room-123', name: 'Room 1' },
      };

      mockPrismaService.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrismaService.appointment.update.mockResolvedValue(mockUpdatedAppointment);

      const response = await request(app.getHttpServer())
        .patch('/appointments/appointment-123')
        .send({ status: AppointmentStatus.CONFIRMED })
        .expect(200);

      expect(response.body.status).toBe(AppointmentStatus.CONFIRMED);
    });
  });

  describe('/appointments/:id/reschedule (POST)', () => {
    it('should reschedule appointment', async () => {
      const futureAppointmentDate = new Date();
      futureAppointmentDate.setDate(futureAppointmentDate.getDate() + 2);

      const mockAppointment = {
        id: 'appointment-123',
        date: futureAppointmentDate,
        status: AppointmentStatus.SCHEDULED,
        doctorId: 'doctor-123',
        roomId: 'room-123',
      };

      const mockRescheduledAppointment = {
        ...mockAppointment,
        date: new Date(futureDateString),
        slot: '14:00-14:30',
        patient: { id: 'patient-123', name: 'John Doe' },
        doctor: { id: 'doctor-123', name: 'Dr. Smith' },
        room: { id: 'room-123', name: 'Room 1' },
      };

      mockPrismaService.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrismaService.appointment.findMany.mockResolvedValue([]);
      mockPrismaService.appointment.update.mockResolvedValue(mockRescheduledAppointment);

      const response = await request(app.getHttpServer())
        .post('/appointments/appointment-123/reschedule')
        .send({
          date: futureDateString,
          slot: '14:00-14:30',
          notes: 'Rescheduled appointment',
        })
        .expect(201);

      expect(response.body.slot).toBe('14:00-14:30');
    });
  });

  describe('/appointments/:id (DELETE)', () => {
    it('should cancel appointment', async () => {
      const mockAppointment = {
        id: 'appointment-123',
        status: AppointmentStatus.SCHEDULED,
      };

      mockPrismaService.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrismaService.appointment.update.mockResolvedValue({
        ...mockAppointment,
        status: AppointmentStatus.CANCELLED,
      });

      const response = await request(app.getHttpServer())
        .delete('/appointments/appointment-123')
        .expect(200);

      expect(response.body.message).toBe('Appointment cancelled successfully');
    });
  });

  describe('/appointments/bulk-update (POST)', () => {
    it('should bulk update appointments', async () => {
      const bulkUpdateDto = {
        appointmentIds: ['appointment-1', 'appointment-2'],
        status: AppointmentStatus.CONFIRMED,
      };

      const mockAppointments = [
        { id: 'appointment-1' },
        { id: 'appointment-2' },
      ];

      mockPrismaService.appointment.findMany.mockResolvedValue(mockAppointments);
      mockPrismaService.appointment.updateMany.mockResolvedValue({ count: 2 });

      const response = await request(app.getHttpServer())
        .post('/appointments/bulk-update')
        .send(bulkUpdateDto)
        .expect(201);

      expect(response.body.updated).toBe(2);
      expect(response.body.appointmentIds).toEqual(bulkUpdateDto.appointmentIds);
    });
  });
});
