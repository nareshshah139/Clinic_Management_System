import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Request, Response, NextFunction } from 'express';
import { VisitsModule } from '../visits.module';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { Language, UserRole, AppointmentStatus } from '@prisma/client';
import { ValidationPipe } from '@nestjs/common';
import { RequestContextData, RequestContextService } from '../../../shared/context/request-context.service';

describe('Visits E2E Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let setupPrisma: PrismaService;
  let authToken: string;
  let branchId: string;
  let patientId: string;
  let doctorId: string;
  let appointmentId: string;
  let requestContextStub: RequestContextService;

  const mockAuthGuard = {
    canActivate: jest.fn(() => true),
  };

  beforeAll(async () => {
    let store: RequestContextData | undefined;
    const isPromise = <TValue>(value: unknown): value is Promise<TValue> => {
      return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as any).then === 'function'
      );
    };

    requestContextStub = {
      run: <T>(data: RequestContextData, callback: () => T) => {
        const previous = store;
        store = data;
        const finalize = () => {
          store = previous;
        };

        try {
          const result = callback();
          if (isPromise<T>(result)) {
            return result.finally(finalize) as unknown as T;
          }
          finalize();
          return result;
        } catch (error) {
          finalize();
          throw error;
        }
      },
      get: () => store,
    } as unknown as RequestContextService;

    setupPrisma = new PrismaService(requestContextStub);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [VisitsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(setupPrisma)
      .overrideProvider(RequestContextService)
      .useValue(requestContextStub)
      .overrideGuard(JwtAuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);

    await setupPrisma.$connect?.();

    // Setup test data first (before creating the app)
    await requestContextStub.run(
      {
        userId: 'seed-user',
        branchId: null,
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
      () => setupTestData(),
    );

    // Ensure DTO validation runs as in prod
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }));

    // Mock the JWT auth guard for testing with actual test data
    app.use((req: Request, res: Response, next: NextFunction) => {
      const user = {
        id: doctorId,
        branchId: branchId,
        role: 'DOCTOR',
      };
      (req as any).user = user;

      return requestContextStub.run(
        {
          userId: user.id,
          branchId: user.branchId,
          ipAddress: req.ip ?? null,
          userAgent: req.get('user-agent') ?? 'jest',
        },
        () => next(),
      );
    });

    await app.init();
  });

  afterAll(async () => {
    // Cleanup test data
    await runWithContext(
      {
        userId: 'seed-user',
        branchId: branchId ?? null,
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
      () => cleanupTestData(),
    );
    await setupPrisma?.$disconnect?.();
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    // Reset any test-specific data
  });

  async function runWithContext<T>(ctx: RequestContextData, fn: () => Promise<T> | T): Promise<T> {
    const result = requestContextStub.run(ctx, fn);
    return await Promise.resolve(result as any);
  }

  async function setupTestData() {
    const timestamp = Date.now();
    
    // Create a test branch without branch-scoped context
    const branch = await runWithContext(
      {
        userId: 'seed-user',
        branchId: null,
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
      () => setupPrisma.branch.create({
        data: {
          name: `Test Clinic E2E ${timestamp}`,
          address: '123 Test Street',
          city: 'Test City',
          state: 'Test State',
          pincode: '123456',
          phone: `987654321${timestamp % 10}`,
          email: `test${timestamp}@clinic.com`,
        },
      }),
    );
    branchId = branch.id;

    await runWithContext(
      {
        userId: 'seed-user',
        branchId,
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
      async () => {
      // Create a test doctor
      const doctor = await setupPrisma.user.create({
        data: {
          firstName: 'Dr. Test',
          lastName: 'Doctor',
          email: `doctor${timestamp}@test.com`,
          password: '$2b$10$hashedpassword',
          phone: `987654321${timestamp % 100}`,
          role: UserRole.DOCTOR,
          branchId,
          employeeId: `DOC${timestamp}`,
          designation: 'Senior Physician',
          department: 'General Medicine',
        },
      });
      doctorId = doctor.id;

      // Create a test patient
      const patient = await setupPrisma.patient.create({
        data: {
          name: `John Doe ${timestamp}`,
          phone: `987654321${timestamp % 1000}`,
          email: `patient${timestamp}@test.com`,
          dob: new Date('1990-01-01'),
          gender: 'Male',
          address: '456 Patient Street',
          city: 'Test City',
          state: 'Test State',
          pincode: '123456',
          branchId,
        },
      });
      patientId = patient.id;

      // Create a test appointment
      const appointment = await setupPrisma.appointment.create({
        data: {
          patientId,
          doctorId,
          date: new Date(),
          slot: '10:00-10:30',
          tokenNumber: 1,
          status: AppointmentStatus.SCHEDULED,
          branchId,
          notes: 'Test appointment for E2E testing',
        },
      });
      appointmentId = appointment.id;
      },
    );

    // For E2E tests, we'll mock the authentication
    // In a real scenario, you'd create a proper JWT token
    authToken = 'mock-jwt-token-for-testing';
  }

  async function cleanupTestData() {
    if (!branchId) {
      return;
    }
    try {
      // Clean up in reverse order of dependencies
      // Find visits by patient/doctor that belong to our test branch
      const testVisits = await setupPrisma.visit.findMany({
        where: {
          OR: [
            { patientId },
            { doctorId }
          ]
        },
        select: { id: true }
      });
      
      if (testVisits.length > 0) {
        await setupPrisma.visit.deleteMany({ 
          where: { 
            id: { 
              in: testVisits.map(v => v.id) 
            } 
          } 
        });
      }
      
      await setupPrisma.appointment.deleteMany({ where: { branchId } });
      await setupPrisma.patient.deleteMany({ where: { branchId } });
      await setupPrisma.user.deleteMany({ where: { branchId } });
      await setupPrisma.branch.deleteMany({ where: { id: branchId } });
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  function getAuthHeaders() {
    // For E2E tests, we rely on the middleware mock, so no headers needed
    return {};
  }

  describe('Complete Visit Workflow', () => {
    it('should create, retrieve, update, and complete a visit successfully', async () => {
      // Step 1: Create a new visit
      const createVisitDto = {
        patientId,
        doctorId,
        appointmentId,
        vitals: {
          systolicBP: 120,
          diastolicBP: 80,
          heartRate: 72,
          temperature: 36.5,
          weight: 70,
          height: 175,
          oxygenSaturation: 98,
          respiratoryRate: 16,
          notes: 'Normal vitals',
        },
        complaints: [
          {
            complaint: 'Headache',
            duration: '2 days',
            severity: 'Moderate',
            notes: 'Throbbing pain in temples',
          },
          {
            complaint: 'Fatigue',
            duration: '1 week',
            severity: 'Mild',
            notes: 'Feeling tired throughout the day',
          },
        ],
        history: 'No significant medical history. Patient reports good general health.',
        examination: {
          generalAppearance: 'Well-appearing, alert and oriented',
          skinExamination: 'Normal skin color and texture',
          cardiovascularSystem: 'Regular heart rate and rhythm, no murmurs',
          respiratorySystem: 'Clear breath sounds bilaterally',
          abdominalExamination: 'Soft, non-tender, no organomegaly',
          neurologicalExamination: 'Alert, oriented x3, no focal deficits',
          otherFindings: 'No significant findings',
        },
        diagnosis: [
          {
            diagnosis: 'Tension headache',
            icd10Code: 'G44.2',
            type: 'Primary',
            notes: 'Based on history and examination',
          },
          {
            diagnosis: 'Fatigue, unspecified',
            icd10Code: 'R53.1',
            type: 'Secondary',
            notes: 'May be related to stress',
          },
        ],
        treatmentPlan: {
          medications: 'Paracetamol 500mg TID for headache',
          procedures: 'None required at this time',
          lifestyleModifications: 'Adequate rest, hydration, stress management',
          followUpInstructions: 'Return if symptoms worsen or persist beyond 1 week',
          followUpDate: '2024-12-30',
          notes: 'Patient counseled on stress management techniques',
        },
        language: Language.EN,
        notes: 'Patient cooperative and understanding. Good rapport established.',
      };

      const createResponse = await request(app.getHttpServer())
        .post('/visits')
        .set(getAuthHeaders())
        .send(createVisitDto)
        .expect(201);

      expect(createResponse.body).toHaveProperty('id');
      expect(createResponse.body.patientId).toBe(patientId);
      expect(createResponse.body.doctorId).toBe(doctorId);
      expect(createResponse.body.appointmentId).toBe(appointmentId);

      const visitId = createResponse.body.id;

      // Step 2: Retrieve the created visit
      const getResponse = await request(app.getHttpServer())
        .get(`/visits/${visitId}`)
        .set(getAuthHeaders())
        .expect(200);

      expect(getResponse.body.id).toBe(visitId);
      expect(getResponse.body.vitals).toEqual(createVisitDto.vitals);
      expect(getResponse.body.complaints).toEqual(createVisitDto.complaints);
      expect(getResponse.body.diagnosis).toEqual(createVisitDto.diagnosis);

      // Step 3: Update the visit
      const updateDto = {
        vitals: {
          systolicBP: 125,
          diastolicBP: 82,
          heartRate: 74,
          temperature: 36.7,
          weight: 70,
          height: 175,
          oxygenSaturation: 97,
          respiratoryRate: 16,
          notes: 'Slightly elevated BP',
        },
        notes: 'Updated after reassessment. BP slightly elevated.',
        diagnosis: [
          {
            diagnosis: 'Tension headache',
            icd10Code: 'G44.2',
            type: 'Primary',
            notes: 'Confirmed after reassessment',
          },
          {
            diagnosis: 'Essential hypertension, stage 1',
            icd10Code: 'I10',
            type: 'Secondary',
            notes: 'New finding - BP monitoring recommended',
          },
        ],
      };

      const updateResponse = await request(app.getHttpServer())
        .patch(`/visits/${visitId}`)
        .set(getAuthHeaders())
        .send(updateDto)
        .expect(200);

      expect(updateResponse.body.notes).toBe(updateDto.notes);

      // Step 4: Complete the visit
      const completeDto = {
        finalNotes: 'Visit completed successfully. Patient educated about BP monitoring.',
        followUpDate: '2024-12-30',
        followUpInstructions: 'Return in 1 week for BP recheck. Continue current medications.',
      };

      const completeResponse = await request(app.getHttpServer())
        .post(`/visits/${visitId}/complete`)
        .set(getAuthHeaders())
        .send(completeDto)
        .expect(201);

      expect(completeResponse.body.notes).toBe(completeDto.finalNotes);

      // Step 5: Verify appointment status was updated
      const appointmentCheck = await prisma.appointment.findUnique({
        where: { id: appointmentId },
      });
      expect(appointmentCheck?.status).toBe(AppointmentStatus.COMPLETED);

      // Step 6: Test visit statistics
      const statsResponse = await request(app.getHttpServer())
        .get('/visits/statistics')
        .set(getAuthHeaders())
        .expect(200);

      expect(statsResponse.body).toHaveProperty('totalVisits');
      expect(statsResponse.body.totalVisits).toBeGreaterThan(0);
    });

    it('should handle visit creation with minimal required data', async () => {
      const minimalVisitDto = {
        patientId,
        doctorId,
        complaints: [
          {
            complaint: 'General consultation',
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/visits')
        .set(getAuthHeaders())
        .send(minimalVisitDto)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.patientId).toBe(patientId);
      expect(response.body.doctorId).toBe(doctorId);
    });

    it('should retrieve patient visit history', async () => {
      const response = await request(app.getHttpServer())
        .get(`/visits/patient/${patientId}/history`)
        .set(getAuthHeaders())
        .expect(200);

      expect(response.body).toHaveProperty('patient');
      expect(response.body).toHaveProperty('visits');
      expect(response.body.patient.id).toBe(patientId);
      expect(Array.isArray(response.body.visits)).toBe(true);
    });

    it('should retrieve doctor visits', async () => {
      const response = await request(app.getHttpServer())
        .get(`/visits/doctor/${doctorId}`)
        .set(getAuthHeaders())
        .expect(200);

      expect(response.body).toHaveProperty('doctor');
      expect(response.body).toHaveProperty('visits');
      expect(response.body.doctor.id).toBe(doctorId);
      expect(Array.isArray(response.body.visits)).toBe(true);
    });

    it('should filter visits by various parameters', async () => {
      const today = new Date().toISOString().split('T')[0];

      // Test date filter
      const dateFilterResponse = await request(app.getHttpServer())
        .get('/visits')
        .query({ date: today })
        .set(getAuthHeaders())
        .expect(200);

      expect(dateFilterResponse.body).toHaveProperty('visits');
      expect(dateFilterResponse.body).toHaveProperty('pagination');

      // Test patient filter
      const patientFilterResponse = await request(app.getHttpServer())
        .get('/visits')
        .query({ patientId })
        .set(getAuthHeaders())
        .expect(200);

      expect(patientFilterResponse.body.visits.every((visit: any) => visit.patientId === patientId)).toBe(true);

      // Test doctor filter
      const doctorFilterResponse = await request(app.getHttpServer())
        .get('/visits')
        .query({ doctorId })
        .set(getAuthHeaders())
        .expect(200);

      expect(doctorFilterResponse.body.visits.every((visit: any) => visit.doctorId === doctorId)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for invalid visit data', async () => {
      const invalidDto = {
        patientId: 'invalid-id',
        doctorId: 'invalid-id',
        complaints: [], // Empty complaints should fail
      };

      await request(app.getHttpServer())
        .post('/visits')
        .set(getAuthHeaders())
        .send(invalidDto)
        .expect(400);
    });

    it('should return 404 for non-existent patient', async () => {
      const dto = {
        patientId: 'non-existent-patient-id',
        doctorId,
        complaints: [{ complaint: 'Test complaint' }],
      };

      await request(app.getHttpServer())
        .post('/visits')
        .set(getAuthHeaders())
        .send(dto)
        .expect(404);
    });

    it('should return 404 for non-existent doctor', async () => {
      const dto = {
        patientId,
        doctorId: 'non-existent-doctor-id',
        complaints: [{ complaint: 'Test complaint' }],
      };

      await request(app.getHttpServer())
        .post('/visits')
        .set(getAuthHeaders())
        .send(dto)
        .expect(404);
    });

    it('should return 404 for non-existent visit', async () => {
      await request(app.getHttpServer())
        .get('/visits/non-existent-visit-id')
        .set(getAuthHeaders())
        .expect(404);
    });

    it('should return 409 for duplicate visit on same appointment', async () => {
      // Create a fresh appointment to isolate this test
      const newAppointment = await setupPrisma.appointment.create({
        data: {
          patientId,
          doctorId,
          date: new Date(),
          slot: '11:00-11:30',
          tokenNumber: Math.floor(Date.now() % 1000),
          status: AppointmentStatus.SCHEDULED,
          branchId,
          notes: 'Duplicate test appointment',
        },
      });

      const newAppointmentId = newAppointment.id;

      // Create first visit
      const visitDto = {
        patientId,
        doctorId,
        appointmentId: newAppointmentId,
        complaints: [{ complaint: 'First visit' }],
      };

      await request(app.getHttpServer())
        .post('/visits')
        .set(getAuthHeaders())
        .send(visitDto)
        .expect(201);

      // Try to create second visit for same appointment
      const duplicateDto = {
        patientId,
        doctorId,
        appointmentId: newAppointmentId,
        complaints: [{ complaint: 'Duplicate visit' }],
      };

      await request(app.getHttpServer())
        .post('/visits')
        .set(getAuthHeaders())
        .send(duplicateDto)
        .expect(409);
    });
  });

  describe('Data Validation', () => {
    it('should validate vitals ranges', async () => {
      const invalidVitalsDto = {
        patientId,
        doctorId,
        complaints: [{ complaint: 'Test complaint' }],
        vitals: {
          systolicBP: -10, // Invalid negative value
          diastolicBP: 500, // Invalid high value
          heartRate: 400, // Invalid high value
          temperature: 60, // Invalid high value
          weight: -5, // Invalid negative value
          height: 300, // Invalid high value
          oxygenSaturation: 150, // Invalid high value
          respiratoryRate: 100, // Invalid high value
        },
      };

      await request(app.getHttpServer())
        .post('/visits')
        .set(getAuthHeaders())
        .send(invalidVitalsDto)
        .expect(400);
    });

    it('should validate required complaint field', async () => {
      const invalidComplaintsDto = {
        patientId,
        doctorId,
        complaints: [{}], // Missing required complaint field
      };

      await request(app.getHttpServer())
        .post('/visits')
        .set(getAuthHeaders())
        .send(invalidComplaintsDto)
        .expect(400);
    });

    it('should validate language enum', async () => {
      const invalidLanguageDto = {
        patientId,
        doctorId,
        complaints: [{ complaint: 'Test complaint' }],
        language: 'INVALID_LANGUAGE' as any,
      };

      await request(app.getHttpServer())
        .post('/visits')
        .set(getAuthHeaders())
        .send(invalidLanguageDto)
        .expect(400);
    });
  });

  describe('Pagination and Sorting', () => {
    beforeEach(async () => {
      // Create multiple visits for pagination testing
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/visits')
          .set(getAuthHeaders())
          .send({
            patientId,
            doctorId,
            complaints: [{ complaint: `Test complaint ${i + 1}` }],
            notes: `Visit ${i + 1}`,
          });
      }
    });

    it('should paginate visits correctly', async () => {
      const page1Response = await request(app.getHttpServer())
        .get('/visits')
        .query({ page: 1, limit: 2 })
        .set(getAuthHeaders())
        .expect(200);

      expect(page1Response.body.visits).toHaveLength(2);
      expect(page1Response.body.pagination.page).toBe(1);
      expect(page1Response.body.pagination.limit).toBe(2);

      const page2Response = await request(app.getHttpServer())
        .get('/visits')
        .query({ page: 2, limit: 2 })
        .set(getAuthHeaders())
        .expect(200);

      expect(page2Response.body.visits).toHaveLength(2);
      expect(page2Response.body.pagination.page).toBe(2);
    });

    it('should sort visits by different fields', async () => {
      const sortedResponse = await request(app.getHttpServer())
        .get('/visits')
        .query({ sortBy: 'createdAt', sortOrder: 'asc' })
        .set(getAuthHeaders())
        .expect(200);

      expect(sortedResponse.body.visits).toBeInstanceOf(Array);
      // Verify sorting by checking if first visit is older than last
      const visits = sortedResponse.body.visits;
      if (visits.length > 1) {
        const firstVisit = new Date(visits[0].createdAt);
        const lastVisit = new Date(visits[visits.length - 1].createdAt);
        expect(firstVisit.getTime()).toBeLessThanOrEqual(lastVisit.getTime());
      }
    });
  });

  describe('Search Functionality', () => {
    beforeEach(async () => {
      // Create visits with different searchable content
      await request(app.getHttpServer())
        .post('/visits')
        .set(getAuthHeaders())
        .send({
          patientId,
          doctorId,
          complaints: [{ complaint: 'Chest pain' }],
          notes: 'Patient reports chest discomfort',
        });

      await request(app.getHttpServer())
        .post('/visits')
        .set(getAuthHeaders())
        .send({
          patientId,
          doctorId,
          complaints: [{ complaint: 'Headache' }],
          notes: 'Severe headache with nausea',
        });
    });

    it('should search visits by complaint text', async () => {
      const searchResponse = await request(app.getHttpServer())
        .get('/visits')
        .query({ search: 'chest' })
        .set(getAuthHeaders())
        .expect(200);

      expect(searchResponse.body.visits.length).toBeGreaterThan(0);
      // Verify search results contain the search term
      const hasChestComplaint = searchResponse.body.visits.some((visit: any) =>
        visit.complaints?.toLowerCase().includes('chest') ||
        visit.notes?.toLowerCase().includes('chest')
      );
      expect(hasChestComplaint).toBe(true);
    });

    it('should search visits by notes', async () => {
      const searchResponse = await request(app.getHttpServer())
        .get('/visits')
        .query({ search: 'nausea' })
        .set(getAuthHeaders())
        .expect(200);

      expect(searchResponse.body.visits.length).toBeGreaterThan(0);
    });
  });
}); 