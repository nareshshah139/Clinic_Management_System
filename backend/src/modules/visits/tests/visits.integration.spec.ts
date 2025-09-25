import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { VisitsModule } from '../visits.module';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { Language } from '@prisma/client';
import { RequestContextService, RequestContextData } from '../../../shared/context/request-context.service';

describe('VisitsController (Integration)', () => {
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

  const createPrismaMock = () => {
    let requestContextStore: RequestContextData | undefined;
    const requestContext = {
      run: <T>(data: RequestContextData, callback: () => T) => {
        requestContextStore = data;
        try {
          return callback();
        } finally {
          requestContextStore = undefined;
        }
      },
      get: () => requestContextStore ?? { userId: mockUser.id, ipAddress: '127.0.0.1', userAgent: 'jest' },
    } as RequestContextService;

    const prisma = new PrismaService(requestContext);
    prisma.patient.findFirst = jest.fn();
    prisma.user.findFirst = jest.fn();
    prisma.appointment.findFirst = jest.fn();
    prisma.appointment.update = jest.fn();
    prisma.visit.create = jest.fn();
    prisma.visit.findMany = jest.fn();
    prisma.visit.findFirst = jest.fn();
    prisma.visit.update = jest.fn();
    prisma.visit.count = jest.fn();
    prisma.visit.groupBy = jest.fn();
    prisma.prescription.findFirst = jest.fn();
    prisma.auditLog.create = jest.fn();
    prisma.onModuleInit = jest.fn();
    prisma.$connect = jest.fn();
    prisma.enableShutdownHooks = jest.fn();
    prisma.$disconnect = jest.fn();
    return prisma;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [VisitsModule],
    })
      .overrideProvider(PrismaService)
      .useFactory({
        factory: createPrismaMock,
      })
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

  describe('/visits (POST)', () => {
    it('should create a new visit', async () => {
      const createVisitDto = {
        patientId: 'patient-123',
        doctorId: 'doctor-123',
        appointmentId: 'appointment-123',
        vitals: {
          systolicBP: 120,
          diastolicBP: 80,
          heartRate: 72,
          temperature: 36.5,
          weight: 70,
          height: 175,
        },
        complaints: [
          {
            complaint: 'Headache',
            duration: '2 days',
            severity: 'Moderate',
            notes: 'Patient reports throbbing pain',
          },
        ],
        history: 'No significant medical history',
        examination: {
          generalAppearance: 'Well appearing',
          skinExamination: 'Normal',
          cardiovascularSystem: 'Normal heart sounds',
        },
        diagnosis: [
          {
            diagnosis: 'Tension headache',
            icd10Code: 'G44.2',
            type: 'Primary',
            notes: 'Based on symptoms and examination',
          },
        ],
        treatmentPlan: {
          medications: 'Paracetamol 500mg TID',
          procedures: 'None required',
          lifestyleModifications: 'Adequate rest and hydration',
          followUpInstructions: 'Return if symptoms worsen',
          followUpDate: '2024-12-30',
        },
        language: Language.EN,
        notes: 'Patient cooperative and understanding',
      };

      const mockPatient = { id: 'patient-123', name: 'John Doe' };
      const mockDoctor = { id: 'doctor-123', firstName: 'Dr.', lastName: 'Smith', name: 'Dr. Smith', role: 'DOCTOR' };
      const mockAppointment = { 
        id: 'appointment-123', 
        patientId: 'patient-123',
        doctorId: 'doctor-123',
        status: 'SCHEDULED',
      };
      const mockVisit = {
        id: 'visit-123',
        patientId: 'patient-123',
        doctorId: 'doctor-123',
        appointmentId: 'appointment-123',
        vitals: JSON.stringify(createVisitDto.vitals),
        complaints: JSON.stringify(createVisitDto.complaints),
        history: JSON.stringify(createVisitDto.history),
        exam: JSON.stringify(createVisitDto.examination),
        diagnosis: JSON.stringify(createVisitDto.diagnosis),
        plan: JSON.stringify({ ...createVisitDto.treatmentPlan, notes: createVisitDto.notes }),
        attachments: null,
        scribeJson: null,
        patient: mockPatient,
        doctor: {
          ...mockDoctor,
          firstName: 'Dr.',
          lastName: 'Smith',
        },
        appointment: mockAppointment,
      };

      prisma.patient.findFirst.mockResolvedValue(mockPatient);
      prisma.user.findFirst.mockResolvedValue(mockDoctor);
      prisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      prisma.visit.findFirst.mockResolvedValue(null);
      prisma.visit.create.mockResolvedValue(mockVisit);
      prisma.appointment.update.mockResolvedValue({
        ...mockAppointment,
        status: 'IN_PROGRESS',
      });

      const response = await request(app.getHttpServer())
        .post('/visits')
        .send(createVisitDto)
        .expect(201);

      expect(response.body).toMatchObject({
        id: 'visit-123',
        patientId: 'patient-123',
        doctorId: 'doctor-123',
        appointmentId: 'appointment-123',
      });
      expect(response.body.plan).toEqual(JSON.stringify({ ...createVisitDto.treatmentPlan, notes: createVisitDto.notes }));
      expect(response.body.notes).toBe(createVisitDto.notes);
    });

    it('should return 400 for missing complaints', async () => {
      const createVisitDto = {
        patientId: 'patient-123',
        doctorId: 'doctor-123',
        complaints: [], // Empty complaints array
      };

      const mockPatient = { id: 'patient-123', name: 'John Doe' };
      const mockDoctor = { id: 'doctor-123', firstName: 'Dr.', lastName: 'Smith', name: 'Dr. Smith', role: 'DOCTOR' };

      prisma.patient.findFirst.mockResolvedValue(mockPatient);
      prisma.user.findFirst.mockResolvedValue(mockDoctor);

      await request(app.getHttpServer())
        .post('/visits')
        .send(createVisitDto)
        .expect(400);
    });

    it('should return 404 for non-existent patient', async () => {
      const createVisitDto = {
        patientId: 'non-existent',
        doctorId: 'doctor-123',
        complaints: [{ complaint: 'Headache' }],
      };

      prisma.patient.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/visits')
        .send(createVisitDto)
        .expect(404);
    });
  });

  describe('/visits (GET)', () => {
    it('should return paginated visits', async () => {
      const mockVisits = [
        {
          id: 'visit-1',
          patient: { id: 'patient-1', name: 'John Doe' },
          doctor: { id: 'doctor-1', firstName: 'Dr.', lastName: 'Smith', name: 'Dr. Smith' },
          appointment: { id: 'appointment-1', date: '2024-12-25', slot: '10:00-10:30' },
        },
      ];

      prisma.visit.findMany.mockResolvedValue(mockVisits);
      prisma.visit.count.mockResolvedValue(1);

      const response = await request(app.getHttpServer())
        .get('/visits')
        .query({ page: 1, limit: 20 })
        .expect(200);

      expect(response.body).toHaveProperty('visits');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.visits).toHaveLength(1);
    });

    it('should filter visits by patient', async () => {
      prisma.visit.findMany.mockResolvedValue([]);
      prisma.visit.count.mockResolvedValue(0);

      await request(app.getHttpServer())
        .get('/visits')
        .query({ patientId: 'patient-123' })
        .expect(200);

      expect(prisma.visit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            patientId: 'patient-123',
          }),
        }),
      );
    });
  });

  describe('/visits/statistics (GET)', () => {
    it('should return visit statistics', async () => {
      const mockStats = {
        totalVisits: 100,
        visitsWithPrescriptions: 80,
        visitsWithFollowUp: 60,
        averageVisitsPerDay: 50,
        period: {
          startDate: null,
          endDate: null,
        },
      };

      prisma.visit.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(80)
        .mockResolvedValueOnce(60);
      prisma.visit.groupBy.mockResolvedValue([
        { createdAt: new Date('2024-12-01'), _count: { id: 5 } },
        { createdAt: new Date('2024-12-02'), _count: { id: 6 } },
      ]);

      const response = await request(app.getHttpServer())
        .get('/visits/statistics')
        .expect(200);

      expect(response.body).toEqual(mockStats);
    });
  });

  describe('/visits/patient/:patientId/history (GET)', () => {
    it('should return patient visit history', async () => {
      const patientId = 'patient-123';
      const mockHistory = {
        patient: {
          id: 'patient-123',
          name: 'John Doe',
          phone: '1234567890',
        },
        visits: [
          {
            id: 'visit-1',
            vitals: JSON.stringify({ systolicBP: 120 }),
            complaints: JSON.stringify([{ complaint: 'Headache' }]),
            diagnosis: JSON.stringify([{ diagnosis: 'Tension headache' }]),
            doctor: { id: 'doctor-1', firstName: 'Dr.', lastName: 'Smith', name: 'Dr. Smith' },
            appointment: { id: 'appointment-1', date: '2024-12-25', slot: '10:00-10:30' },
          },
        ],
      };

      prisma.patient.findFirst.mockResolvedValue(mockHistory.patient);
      prisma.visit.findMany.mockResolvedValue(mockHistory.visits);

      const response = await request(app.getHttpServer())
        .get(`/visits/patient/${patientId}/history`)
        .expect(200);

      expect(response.body).toHaveProperty('patient');
      expect(response.body).toHaveProperty('visits');
      expect(response.body.visits).toHaveLength(1);
    });
  });

  describe('/visits/doctor/:doctorId (GET)', () => {
    it('should return doctor visits', async () => {
      const doctorId = 'doctor-123';
      const mockVisits = {
        doctor: {
          id: 'doctor-123',
          name: 'Dr. Smith',
          firstName: 'Dr.',
          lastName: 'Smith',
        },
        visits: [
          {
            id: 'visit-1',
            vitals: JSON.stringify({ systolicBP: 120 }),
            complaints: JSON.stringify([{ complaint: 'Headache' }]),
            diagnosis: JSON.stringify([{ diagnosis: 'Tension headache' }]),
            patient: { id: 'patient-1', name: 'John Doe', phone: '1234567890', gender: 'Male' },
            appointment: { id: 'appointment-1', date: '2024-12-25', slot: '10:00-10:30' },
          },
        ],
      };

      prisma.user.findFirst.mockResolvedValue(mockVisits.doctor);
      prisma.visit.findMany.mockResolvedValue(mockVisits.visits);

      const response = await request(app.getHttpServer())
        .get(`/visits/doctor/${doctorId}`)
        .expect(200);

      expect(response.body).toHaveProperty('doctor');
      expect(response.body).toHaveProperty('visits');
      expect(response.body.visits).toHaveLength(1);
    });
  });

  describe('/visits/:id (GET)', () => {
    it('should return visit by id', async () => {
      const visitId = 'visit-123';
      const mockVisit = {
        id: visitId,
        vitals: JSON.stringify({ systolicBP: 120, diastolicBP: 80 }),
        complaints: JSON.stringify([{ complaint: 'Headache' }]),
        diagnosis: JSON.stringify([{ diagnosis: 'Tension headache' }]),
        plan: JSON.stringify({ notes: 'Patient cooperative' }),
        patient: { id: 'patient-123', name: 'John Doe' },
        doctor: { id: 'doctor-123', firstName: 'Dr.', lastName: 'Smith', name: 'Dr. Smith' },
        appointment: { id: 'appointment-123', date: '2024-12-25', slot: '10:00-10:30' },
        prescription: null,
        consents: [],
        labOrders: [],
        deviceLogs: [],
      };

    prisma.visit.findFirst.mockResolvedValue(mockVisit);

      const response = await request(app.getHttpServer())
        .get(`/visits/${visitId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: visitId,
        vitals: JSON.parse(mockVisit.vitals),
        complaints: JSON.parse(mockVisit.complaints),
        diagnosis: JSON.parse(mockVisit.diagnosis),
        plan: JSON.parse(mockVisit.plan),
      });
      expect(response.body.notes).toBe('Patient cooperative');
    });

    it('should return 404 for non-existent visit', async () => {
      prisma.visit.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/visits/non-existent')
        .expect(404);
    });
  });

  describe('/visits/:id (PATCH)', () => {
    it('should update visit', async () => {
      const visitId = 'visit-123';
      const updateDto = {
        vitals: {
          systolicBP: 130,
          diastolicBP: 85,
        },
        notes: 'Updated notes',
      };

      const mockVisit = {
        id: visitId,
        vitals: JSON.stringify({ systolicBP: 120 }),
        complaints: JSON.stringify([{ complaint: 'Headache' }]),
        patient: { id: 'patient-123', name: 'John Doe' },
        doctor: { id: 'doctor-123', firstName: 'Dr.', lastName: 'Smith', name: 'Dr. Smith' },
        appointment: { id: 'appointment-123', date: '2024-12-25', slot: '10:00-10:30' },
        plan: JSON.stringify({ notes: 'Original notes' }),
      };

      const mockUpdatedVisit = {
        ...mockVisit,
        vitals: JSON.stringify(updateDto.vitals),
        plan: JSON.stringify({ notes: updateDto.notes }),
      };

      prisma.visit.findFirst.mockResolvedValue(mockVisit);
      prisma.visit.update.mockResolvedValue(mockUpdatedVisit);

      const response = await request(app.getHttpServer())
        .patch(`/visits/${visitId}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.vitals).toEqual(JSON.stringify(updateDto.vitals));
      expect(response.body.plan).toEqual(JSON.stringify({ notes: updateDto.notes }));
      expect(response.body.notes).toBe(updateDto.notes);
    });
  });

  describe('/visits/:id/complete (POST)', () => {
    it('should complete visit', async () => {
      const visitId = 'visit-123';
      const completeDto = {
        finalNotes: 'Visit completed successfully',
        followUpDate: '2024-12-30',
        followUpInstructions: 'Return in 1 week',
      };

      const mockVisit = {
        id: visitId,
        appointmentId: 'appointment-123',
        plan: JSON.stringify({ medications: 'Paracetamol' }),
        patient: { id: 'patient-123', name: 'John Doe' },
        doctor: { id: 'doctor-123', firstName: 'Dr.', lastName: 'Smith', name: 'Dr. Smith' },
        appointment: { id: 'appointment-123', date: '2024-12-25', slot: '10:00-10:30' },
      };

      const mockCompletedVisit = {
        ...mockVisit,
        plan: JSON.stringify({ finalNotes: completeDto.finalNotes }),
      };

      prisma.visit.findFirst.mockResolvedValue(mockVisit);
      prisma.visit.update.mockResolvedValue(mockCompletedVisit);
      prisma.appointment.update.mockResolvedValue({
        ...mockVisit.appointment,
        status: 'COMPLETED',
      });

      const response = await request(app.getHttpServer())
        .post(`/visits/${visitId}/complete`)
        .send(completeDto)
        .expect(201);

      expect(response.body.notes).toBe(completeDto.finalNotes);
      expect(response.body.plan).toEqual(JSON.stringify({ finalNotes: completeDto.finalNotes }));
    });
  });

  describe('/visits/:id (DELETE)', () => {
    it('should delete visit', async () => {
      const visitId = 'visit-123';
      const mockVisit = {
        id: visitId,
        plan: JSON.stringify({ notes: 'Original notes' }),
        patient: { id: 'patient-123', name: 'John Doe' },
        doctor: { id: 'doctor-123', firstName: 'Dr.', lastName: 'Smith', name: 'Dr. Smith' },
        appointment: { id: 'appointment-123', date: '2024-12-25', slot: '10:00-10:30' },
      };

      prisma.visit.findFirst.mockResolvedValue(mockVisit);
      prisma.prescription.findFirst.mockResolvedValue(null);
      prisma.visit.update.mockResolvedValue({
        ...mockVisit,
        plan: JSON.stringify({ deleted: true, deletedAt: '2025-01-01T00:00:00.000Z' }),
      });

      const response = await request(app.getHttpServer())
        .delete(`/visits/${visitId}`)
        .expect(200);

      expect(response.body.message).toBe('Visit deleted successfully');
      expect(prisma.visit.update).toHaveBeenCalledWith({
        where: { id: visitId },
        data: { plan: expect.stringMatching(/"deleted":true/) },
      });
    });

    it('should return 404 if visit not found', async () => {
      const visitId = 'visit-123';
      prisma.visit.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete(`/visits/${visitId}`)
        .expect(404);
    });

    it('should return 400 if visit has prescription', async () => {
      const visitId = 'visit-123';
      const mockVisit = {
        id: visitId,
        plan: JSON.stringify({ notes: 'Original notes' }),
        patient: { id: 'patient-123', name: 'John Doe' },
        doctor: { id: 'doctor-123', firstName: 'Dr.', lastName: 'Smith', name: 'Dr. Smith' },
        appointment: { id: 'appointment-123', date: '2024-12-25', slot: '10:00-10:30' },
      };

      prisma.visit.findFirst.mockResolvedValue(mockVisit);
      prisma.prescription.findFirst.mockResolvedValue({ id: 'prescription-123' });

      await request(app.getHttpServer())
        .delete(`/visits/${visitId}`)
        .expect(400);
    });
  });
});
