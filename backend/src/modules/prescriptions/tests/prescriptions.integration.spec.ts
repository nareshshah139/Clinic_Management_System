import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrescriptionsModule } from '../prescriptions.module';
import { PrescriptionsService } from '../prescriptions.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { PrescriptionStatus, PrescriptionLanguage, RefillStatus, DosageUnit, Frequency, DurationUnit } from '../dto/prescription.dto';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('PrescriptionsController (Integration)', () => {
  let app: INestApplication;
  let prescriptionsService: PrescriptionsService;

  const mockUser = {
    id: 'user-123',
    branchId: 'branch-123',
    role: 'DOCTOR',
  };

  const mockAuthGuard = {
    canActivate: jest.fn(() => true),
  };

  // Mock PrismaService
  const mockPrismaService = {
    onModuleInit: jest.fn(),
    $connect: jest.fn(),
    enableShutdownHooks: jest.fn(),
  };

  // Mock PrescriptionsService with correct method names
  const mockPrescriptionsService = {
    createPrescription: jest.fn(),
    findAllPrescriptions: jest.fn(),
    findPrescriptionById: jest.fn(),
    updatePrescription: jest.fn(),
    cancelPrescription: jest.fn(),
    getPrescriptionHistory: jest.fn(),
    getExpiringPrescriptions: jest.fn(),
    getPrescriptionStatistics: jest.fn(),
    requestRefill: jest.fn(),
    approveRefill: jest.fn(),
    rejectRefill: jest.fn(),
    findAllRefills: jest.fn(),
    searchDrugs: jest.fn(),
    createPrescriptionTemplate: jest.fn(),
    findAllPrescriptionTemplates: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PrescriptionsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideProvider(PrescriptionsService)
      .useValue(mockPrescriptionsService)
      .overrideGuard(JwtAuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    prescriptionsService = moduleFixture.get<PrescriptionsService>(PrescriptionsService);

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

  describe('/prescriptions (POST)', () => {
    it('should create a new prescription', async () => {
      const createPrescriptionDto = {
        patientId: 'patient-123',
        visitId: 'visit-123',
        doctorId: 'doctor-123',
        items: [
          {
            drugName: 'Paracetamol',
            genericName: 'Acetaminophen',
            dosage: 500,
            dosageUnit: DosageUnit.MG,
            frequency: Frequency.TWICE_DAILY,
            duration: 7,
            durationUnit: DurationUnit.DAYS,
            instructions: 'Take with food',
            route: 'Oral',
            timing: 'After meals',
            quantity: 14,
            isGeneric: true,
          },
        ],
        diagnosis: 'Fever and infection',
        notes: 'Patient has mild fever',
        language: PrescriptionLanguage.EN,
        maxRefills: 2,
        followUpInstructions: 'Follow up in 1 week',
      };

      const mockPrescription = {
        id: 'prescription-123',
        prescriptionNumber: 'RX-20241225-001',
        ...createPrescriptionDto,
        status: PrescriptionStatus.ACTIVE,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        patient: { id: 'patient-123', name: 'John Doe' },
        visit: { id: 'visit-123', createdAt: new Date() },
        doctor: { id: 'doctor-123', name: 'Dr. Smith' },
        refills: [],
        items: createPrescriptionDto.items,
        metadata: null,
        interactions: [],
      };

      mockPrescriptionsService.createPrescription.mockResolvedValue(mockPrescription);

      const response = await request(app.getHttpServer())
        .post('/prescriptions')
        .send(createPrescriptionDto)
        .expect(201);

      expect(response.body).toMatchObject({
        id: 'prescription-123',
        prescriptionNumber: 'RX-20241225-001',
        patientId: 'patient-123',
        visitId: 'visit-123',
        doctorId: 'doctor-123',
        status: PrescriptionStatus.ACTIVE,
      });
      expect(response.body.items).toEqual(createPrescriptionDto.items);
      expect(response.body.interactions).toBeDefined();
    });

    it('should return 400 for missing items', async () => {
      const createPrescriptionDto = {
        patientId: 'patient-123',
        visitId: 'visit-123',
        doctorId: 'doctor-123',
        items: [], // Empty items array
      };

      mockPrescriptionsService.createPrescription.mockRejectedValue(new BadRequestException('At least one prescription item is required'));

      await request(app.getHttpServer())
        .post('/prescriptions')
        .send(createPrescriptionDto)
        .expect(400);
    });

    it('should return 404 for non-existent patient', async () => {
      const createPrescriptionDto = {
        patientId: 'non-existent',
        visitId: 'visit-123',
        doctorId: 'doctor-123',
        items: [
          {
            drugName: 'Paracetamol',
            dosage: 500,
            dosageUnit: DosageUnit.MG,
            frequency: Frequency.TWICE_DAILY,
            duration: 7,
            durationUnit: DurationUnit.DAYS,
          },
        ],
      };

      mockPrescriptionsService.createPrescription.mockRejectedValue(new NotFoundException('Patient not found'));

      await request(app.getHttpServer())
        .post('/prescriptions')
        .send(createPrescriptionDto)
        .expect(404);
    });
  });

  describe('/prescriptions (GET)', () => {
    it('should return paginated prescriptions', async () => {
      const mockPrescriptions = [
        {
          id: 'prescription-1',
          prescriptionNumber: 'RX-20241225-001',
          status: PrescriptionStatus.ACTIVE,
          patient: { id: 'patient-1', name: 'John Doe' },
          visit: { id: 'visit-1', createdAt: new Date() },
          doctor: { id: 'doctor-1', name: 'Dr. Smith' },
          refills: [],
          items: [{ drugName: 'Paracetamol', dosage: 500 }],
          metadata: null,
        },
      ];

      const mockResult = {
        prescriptions: mockPrescriptions,
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      mockPrescriptionsService.findAllPrescriptions.mockResolvedValue(mockResult);

      const response = await request(app.getHttpServer())
        .get('/prescriptions')
        .query({ page: 1, limit: 20 })
        .expect(200);

      expect(response.body).toHaveProperty('prescriptions');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.prescriptions).toHaveLength(1);
    });

    it('should filter prescriptions by status', async () => {
      const mockResult = {
        prescriptions: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
        },
      };

      mockPrescriptionsService.findAllPrescriptions.mockResolvedValue(mockResult);

      await request(app.getHttpServer())
        .get('/prescriptions')
        .query({ status: PrescriptionStatus.ACTIVE })
        .expect(200);

      expect(mockPrescriptionsService.findAllPrescriptions).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PrescriptionStatus.ACTIVE,
        }),
        mockUser.branchId,
      );
    });
  });

  describe('/prescriptions/history (GET)', () => {
    it('should return prescription history', async () => {
      const mockHistory = [
        {
          id: 'prescription-1',
          prescriptionNumber: 'RX-20241225-001',
          drugNames: ['Paracetamol'],
          patient: { id: 'patient-1', name: 'John Doe' },
          doctor: { id: 'doctor-1', name: 'Dr. Smith' },
          visit: { id: 'visit-1', createdAt: new Date() },
          items: [{ drugName: 'Paracetamol', dosage: 500 }],
          metadata: null,
        },
      ];

      mockPrescriptionsService.getPrescriptionHistory.mockResolvedValue(mockHistory);

      const response = await request(app.getHttpServer())
        .get('/prescriptions/history')
        .query({ patientId: 'patient-123', limit: 50 })
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty('drugNames');
    });
  });

  describe('/prescriptions/expiring (GET)', () => {
    it('should return expiring prescriptions', async () => {
      const mockPrescriptions = [
        {
          id: 'prescription-1',
          validUntil: new Date('2024-12-30'),
          status: PrescriptionStatus.ACTIVE,
          patient: { id: 'patient-1', name: 'John Doe' },
          doctor: { id: 'doctor-1', name: 'Dr. Smith' },
          items: [{ drugName: 'Paracetamol' }],
          metadata: null,
        },
      ];

      const mockResult = {
        prescriptions: mockPrescriptions,
        totalExpiring: 1,
      };

      mockPrescriptionsService.getExpiringPrescriptions.mockResolvedValue(mockResult);

      const response = await request(app.getHttpServer())
        .get('/prescriptions/expiring')
        .query({ expireBefore: '2024-12-31' })
        .expect(200);

      expect(response.body).toHaveProperty('prescriptions');
      expect(response.body).toHaveProperty('totalExpiring');
      expect(response.body.prescriptions).toHaveLength(1);
    });
  });

  describe('/prescriptions/statistics (GET)', () => {
    it('should return prescription statistics', async () => {
      const mockStats = {
        totalPrescriptions: 100,
        prescriptionCount: 100,
        drugBreakdown: [
          { drugName: 'Paracetamol', count: 50 },
          { drugName: 'Amoxicillin', count: 30 },
        ],
        doctorBreakdown: [
          { doctorId: 'doctor-1', count: 60 },
          { doctorId: 'doctor-2', count: 40 },
        ],
        dailyBreakdown: [
          { date: '2024-12-01', count: 5 },
          { date: '2024-12-02', count: 8 },
        ],
      };

      mockPrescriptionsService.getPrescriptionStatistics.mockResolvedValue(mockStats);

      const response = await request(app.getHttpServer())
        .get('/prescriptions/statistics')
        .query({ startDate: '2024-12-01', endDate: '2024-12-31' })
        .expect(200);

      expect(response.body).toHaveProperty('totalPrescriptions');
      expect(response.body).toHaveProperty('drugBreakdown');
      expect(response.body).toHaveProperty('doctorBreakdown');
      expect(response.body).toHaveProperty('dailyBreakdown');
      expect(response.body.totalPrescriptions).toBe(100);
    });
  });

  describe('/prescriptions/:id (GET)', () => {
    it('should return prescription by id', async () => {
      const prescriptionId = 'prescription-123';
      const mockPrescription = {
        id: prescriptionId,
        prescriptionNumber: 'RX-20241225-001',
        items: [
          { drugName: 'Paracetamol', dosage: 500 },
        ],
        metadata: { source: 'web' },
        status: PrescriptionStatus.ACTIVE,
        patient: { id: 'patient-123', name: 'John Doe' },
        visit: { id: 'visit-123', createdAt: new Date() },
        doctor: { id: 'doctor-123', name: 'Dr. Smith' },
        refills: [],
        interactions: [],
      };

      mockPrescriptionsService.findPrescriptionById.mockResolvedValue(mockPrescription);

      const response = await request(app.getHttpServer())
        .get(`/prescriptions/${prescriptionId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: prescriptionId,
        prescriptionNumber: 'RX-20241225-001',
        status: PrescriptionStatus.ACTIVE,
      });
      expect(response.body.items).toEqual([
        { drugName: 'Paracetamol', dosage: 500 },
      ]);
      expect(response.body.metadata).toEqual({ source: 'web' });
      expect(response.body.interactions).toBeDefined();
    });

    it('should return 404 for non-existent prescription', async () => {
      mockPrescriptionsService.findPrescriptionById.mockRejectedValue(new NotFoundException('Prescription not found'));

      await request(app.getHttpServer())
        .get('/prescriptions/non-existent')
        .expect(404);
    });
  });

  describe('/prescriptions/:id (PATCH)', () => {
    it('should update prescription', async () => {
      const prescriptionId = 'prescription-123';
      const updateDto = {
        items: [
          { drugName: 'Updated Paracetamol', dosage: 600 },
        ],
        notes: 'Updated notes',
      };

      const mockUpdatedPrescription = {
        id: prescriptionId,
        status: PrescriptionStatus.ACTIVE,
        items: updateDto.items,
        metadata: { source: 'web' },
        patient: { id: 'patient-123', name: 'John Doe' },
        visit: { id: 'visit-123', createdAt: new Date() },
        doctor: { id: 'doctor-123', name: 'Dr. Smith' },
        refills: [],
        interactions: [],
        notes: updateDto.notes,
      };

      mockPrescriptionsService.updatePrescription.mockResolvedValue(mockUpdatedPrescription);

      const response = await request(app.getHttpServer())
        .patch(`/prescriptions/${prescriptionId}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.notes).toBe(updateDto.notes);
    });
  });

  describe('/prescriptions/:id (DELETE)', () => {
    it('should cancel prescription', async () => {
      const prescriptionId = 'prescription-123';
      const reason = 'Patient allergic to medication';

      const mockCancelledPrescription = {
        id: prescriptionId,
        status: PrescriptionStatus.CANCELLED,
        items: [{ drugName: 'Paracetamol', dosage: 500 }],
        metadata: { source: 'web' },
        patient: { id: 'patient-123', name: 'John Doe' },
        visit: { id: 'visit-123', createdAt: new Date() },
        doctor: { id: 'doctor-123', name: 'Dr. Smith' },
        refills: [],
        interactions: [],
      };

      mockPrescriptionsService.cancelPrescription.mockResolvedValue(mockCancelledPrescription);

      const response = await request(app.getHttpServer())
        .delete(`/prescriptions/${prescriptionId}`)
        .query({ reason })
        .expect(200);

      expect(response.body.status).toBe(PrescriptionStatus.CANCELLED);
    });
  });

  describe('/prescriptions/refills (POST)', () => {
    it('should request refill', async () => {
      const refillDto = {
        prescriptionId: 'prescription-123',
        reason: 'Patient needs more medication',
        notes: 'Refill requested by patient',
      };

      const mockRefill = {
        id: 'refill-123',
        ...refillDto,
        status: RefillStatus.PENDING,
        prescription: {
          id: 'prescription-123',
          prescriptionNumber: 'RX-20241225-001',
          patient: { id: 'patient-123', name: 'John Doe' },
          doctor: { id: 'doctor-123', name: 'Dr. Smith' },
        },
      };

      mockPrescriptionsService.requestRefill.mockResolvedValue(mockRefill);

      const response = await request(app.getHttpServer())
        .post('/prescriptions/refills')
        .send(refillDto)
        .expect(201);

      expect(response.body).toMatchObject({
        id: 'refill-123',
        prescriptionId: 'prescription-123',
        reason: 'Patient needs more medication',
        status: RefillStatus.PENDING,
      });
    });
  });

  describe('/prescriptions/refills/:id/approve (POST)', () => {
    it('should approve refill', async () => {
      const refillId = 'refill-123';
      const approveDto = {
        refillId,
        notes: 'Approved by doctor',
      };

      const mockApprovedRefill = {
        id: refillId,
        prescriptionId: 'prescription-123',
        status: RefillStatus.APPROVED,
        approvedAt: new Date(),
        approvedBy: 'doctor-123',
      };

      mockPrescriptionsService.approveRefill.mockResolvedValue(mockApprovedRefill);

      const response = await request(app.getHttpServer())
        .post(`/prescriptions/refills/${refillId}/approve`)
        .send(approveDto)
        .expect(201);

      expect(response.body.status).toBe(RefillStatus.APPROVED);
    });
  });

  describe('/prescriptions/refills/:id/reject (POST)', () => {
    it('should reject refill', async () => {
      const refillId = 'refill-123';
      const body = { reason: 'Patient not following instructions' };

      const mockRejectedRefill = {
        id: refillId,
        prescriptionId: 'prescription-123',
        status: RefillStatus.REJECTED,
        notes: 'Rejected: Patient not following instructions',
      };

      mockPrescriptionsService.rejectRefill.mockResolvedValue(mockRejectedRefill);

      const response = await request(app.getHttpServer())
        .post(`/prescriptions/refills/${refillId}/reject`)
        .send(body)
        .expect(201);

      expect(response.body.status).toBe(RefillStatus.REJECTED);
    });
  });

  describe('/prescriptions/refills (GET)', () => {
    it('should return paginated refills', async () => {
      const mockRefills = [
        {
          id: 'refill-1',
          status: RefillStatus.PENDING,
          reason: 'Patient needs more medication',
          prescription: {
            id: 'prescription-1',
            prescriptionNumber: 'RX-20241225-001',
            patient: { id: 'patient-1', name: 'John Doe' },
            doctor: { id: 'doctor-1', name: 'Dr. Smith' },
          },
        },
      ];

      const mockResult = {
        refills: mockRefills,
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      mockPrescriptionsService.findAllRefills.mockResolvedValue(mockResult);

      const response = await request(app.getHttpServer())
        .get('/prescriptions/refills')
        .query({ page: 1, limit: 20 })
        .expect(200);

      expect(response.body).toHaveProperty('refills');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.refills).toHaveLength(1);
    });
  });

  describe('/prescriptions/drugs/search (GET)', () => {
    it('should return drug search results', async () => {
      const mockDrugs = [
        {
          id: 'drug-1',
          name: 'Paracetamol',
          genericName: 'Acetaminophen',
          dosage: '500mg',
          form: 'Tablet',
          manufacturer: 'Generic Pharma',
          isGeneric: true,
          category: 'Analgesic',
          description: 'Pain relief medication',
        },
      ];

      mockPrescriptionsService.searchDrugs.mockResolvedValue(mockDrugs);

      const response = await request(app.getHttpServer())
        .get('/prescriptions/drugs/search')
        .query({ query: 'paracetamol', isGeneric: true, limit: 10 })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe('/prescriptions/templates (POST)', () => {
    it('should create prescription template', async () => {
      const templateDto = {
        name: 'Common Cold Template',
        description: 'Template for common cold treatment',
        items: [
          {
            drugName: 'Paracetamol',
            dosage: 500,
            dosageUnit: DosageUnit.MG,
            frequency: Frequency.TWICE_DAILY,
            duration: 5,
            durationUnit: DurationUnit.DAYS,
          },
        ],
        category: 'Respiratory',
        specialty: 'General Medicine',
        isPublic: false,
      };

      const mockTemplate = {
        id: 'template-123',
        ...templateDto,
        createdBy: 'doctor-123',
        items: templateDto.items,
        metadata: null,
      };

      mockPrescriptionsService.createPrescriptionTemplate.mockResolvedValue(mockTemplate);

      const response = await request(app.getHttpServer())
        .post('/prescriptions/templates')
        .send(templateDto)
        .expect(201);

      expect(response.body).toMatchObject({
        id: 'template-123',
        name: 'Common Cold Template',
        description: 'Template for common cold treatment',
        category: 'Respiratory',
        specialty: 'General Medicine',
        isPublic: false,
      });
      expect(response.body.items).toEqual(templateDto.items);
    });
  });

  describe('/prescriptions/templates (GET)', () => {
    it('should return paginated prescription templates', async () => {
      const mockTemplates = [
        {
          id: 'template-1',
          name: 'Common Cold Template',
          description: 'Template for common cold treatment',
          category: 'Respiratory',
          specialty: 'General Medicine',
          isPublic: false,
          createdBy: 'doctor-123',
          items: [{ drugName: 'Paracetamol', dosage: 500 }],
          metadata: null,
        },
      ];

      const mockResult = {
        templates: mockTemplates,
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      mockPrescriptionsService.findAllPrescriptionTemplates.mockResolvedValue(mockResult);

      const response = await request(app.getHttpServer())
        .get('/prescriptions/templates')
        .query({ page: 1, limit: 20 })
        .expect(200);

      expect(response.body).toHaveProperty('templates');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.templates).toHaveLength(1);
    });
  });

  describe('/prescriptions/patient/:patientId (GET)', () => {
    it('should return patient prescriptions', async () => {
      const patientId = 'patient-123';
      const mockPrescriptions = [
        {
          id: 'prescription-1',
          prescriptionNumber: 'RX-20241225-001',
          status: PrescriptionStatus.ACTIVE,
          patient: { id: 'patient-123', name: 'John Doe' },
          visit: { id: 'visit-1', createdAt: new Date() },
          doctor: { id: 'doctor-1', name: 'Dr. Smith' },
          refills: [],
          items: [{ drugName: 'Paracetamol', dosage: 500 }],
          metadata: null,
        },
      ];

      const mockResult = {
        prescriptions: mockPrescriptions,
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      // The patient endpoint calls findAllPrescriptions with patientId filter
      mockPrescriptionsService.findAllPrescriptions.mockResolvedValue(mockResult);

      const response = await request(app.getHttpServer())
        .get(`/prescriptions/patient/${patientId}`)
        .query({ limit: 20 })
        .expect(200);

      expect(response.body).toHaveProperty('prescriptions');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.prescriptions).toHaveLength(1);
    });
  });

  describe('/prescriptions/doctor/:doctorId (GET)', () => {
    it('should return doctor prescriptions', async () => {
      const doctorId = 'doctor-123';
      const mockPrescriptions = [
        {
          id: 'prescription-1',
          prescriptionNumber: 'RX-20241225-001',
          status: PrescriptionStatus.ACTIVE,
          patient: { id: 'patient-1', name: 'John Doe' },
          visit: { id: 'visit-1', createdAt: new Date() },
          doctor: { id: 'doctor-123', name: 'Dr. Smith' },
          refills: [],
          items: [{ drugName: 'Paracetamol', dosage: 500 }],
          metadata: null,
        },
      ];

      const mockResult = {
        prescriptions: mockPrescriptions,
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      // The doctor endpoint calls findAllPrescriptions with doctorId filter
      mockPrescriptionsService.findAllPrescriptions.mockResolvedValue(mockResult);

      const response = await request(app.getHttpServer())
        .get(`/prescriptions/doctor/${doctorId}`)
        .query({ limit: 20 })
        .expect(200);

      expect(response.body).toHaveProperty('prescriptions');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.prescriptions).toHaveLength(1);
    });
  });
});
