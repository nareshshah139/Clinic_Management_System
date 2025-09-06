import { Test, TestingModule } from '@nestjs/testing';
import { PrescriptionsController } from '../prescriptions.controller';
import { PrescriptionsService } from '../prescriptions.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { PrescriptionStatus, PrescriptionLanguage, RefillStatus, DosageUnit, Frequency, DurationUnit } from '../dto/prescription.dto';

describe('PrescriptionsController', () => {
  let controller: PrescriptionsController;
  let service: PrescriptionsService;

  const mockPrescriptionsService = {
    createPrescription: jest.fn(),
    findAllPrescriptions: jest.fn(),
    findPrescriptionById: jest.fn(),
    updatePrescription: jest.fn(),
    cancelPrescription: jest.fn(),
    requestRefill: jest.fn(),
    approveRefill: jest.fn(),
    rejectRefill: jest.fn(),
    findAllRefills: jest.fn(),
    getPrescriptionHistory: jest.fn(),
    searchDrugs: jest.fn(),
    getPrescriptionStatistics: jest.fn(),
    getExpiringPrescriptions: jest.fn(),
    createPrescriptionTemplate: jest.fn(),
    findAllPrescriptionTemplates: jest.fn(),
  };

  const mockRequest = {
    user: {
      id: 'user-123',
      branchId: 'branch-123',
      role: 'DOCTOR',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrescriptionsController],
      providers: [
        {
          provide: PrescriptionsService,
          useValue: mockPrescriptionsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PrescriptionsController>(PrescriptionsController);
    service = module.get<PrescriptionsService>(PrescriptionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPrescription', () => {
    it('should create a prescription', async () => {
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
        diagnosis: 'Fever',
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
        validUntil: new Date('2025-01-25'),
        interactions: [],
      };

      mockPrescriptionsService.createPrescription.mockResolvedValue(mockPrescription);

      const result = await controller.createPrescription(createPrescriptionDto, mockRequest as any);

      expect(result).toEqual(mockPrescription);
      expect(service.createPrescription).toHaveBeenCalledWith(createPrescriptionDto, mockRequest.user.branchId);
    });
  });

  describe('findAllPrescriptions', () => {
    it('should return paginated prescriptions', async () => {
      const query = {
        page: 1,
        limit: 20,
        status: PrescriptionStatus.ACTIVE,
      };

      const mockResult = {
        prescriptions: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 20,
          pages: 0,
        },
      };

      mockPrescriptionsService.findAllPrescriptions.mockResolvedValue(mockResult);

      const result = await controller.findAllPrescriptions(query, mockRequest as any);

      expect(result).toEqual(mockResult);
      expect(service.findAllPrescriptions).toHaveBeenCalledWith(query, mockRequest.user.branchId);
    });
  });

  describe('getPrescriptionHistory', () => {
    it('should return prescription history', async () => {
      const query = {
        patientId: 'patient-123',
        limit: 50,
      };

      const mockHistory = [
        {
          id: 'prescription-1',
          prescriptionNumber: 'RX-20241225-001',
          drugNames: ['Paracetamol'],
          patient: { id: 'patient-123', name: 'John Doe' },
          doctor: { id: 'doctor-123', name: 'Dr. Smith' },
        },
      ];

      mockPrescriptionsService.getPrescriptionHistory.mockResolvedValue(mockHistory);

      const result = await controller.getPrescriptionHistory(query, mockRequest as any);

      expect(result).toEqual(mockHistory);
      expect(service.getPrescriptionHistory).toHaveBeenCalledWith(query, mockRequest.user.branchId);
    });
  });

  describe('getExpiringPrescriptions', () => {
    it('should return expiring prescriptions', async () => {
      const query = {
        expireBefore: '2024-12-31',
        limit: 50,
      };

      const mockResult = {
        prescriptions: [],
        totalExpiring: 0,
      };

      mockPrescriptionsService.getExpiringPrescriptions.mockResolvedValue(mockResult);

      const result = await controller.getExpiringPrescriptions(query, mockRequest as any);

      expect(result).toEqual(mockResult);
      expect(service.getExpiringPrescriptions).toHaveBeenCalledWith(query, mockRequest.user.branchId);
    });
  });

  describe('getPrescriptionStatistics', () => {
    it('should return prescription statistics', async () => {
      const query = {
        startDate: '2024-12-01',
        endDate: '2024-12-31',
        groupBy: 'day' as const,
      };

      const mockStats = {
        totalPrescriptions: 100,
        drugBreakdown: [
          { drug: 'Paracetamol', count: 50 },
          { drug: 'Amoxicillin', count: 30 },
        ],
        doctorBreakdown: [
          { doctorId: 'doctor-1', count: 60 },
          { doctorId: 'doctor-2', count: 40 },
        ],
        dailyBreakdown: [
          { date: new Date('2024-12-01'), count: 5 },
          { date: new Date('2024-12-02'), count: 8 },
        ],
        period: {
          startDate: '2024-12-01',
          endDate: '2024-12-31',
          groupBy: 'day',
        },
      };

      mockPrescriptionsService.getPrescriptionStatistics.mockResolvedValue(mockStats);

      const result = await controller.getPrescriptionStatistics(query, mockRequest as any);

      expect(result).toEqual(mockStats);
      expect(service.getPrescriptionStatistics).toHaveBeenCalledWith(query, mockRequest.user.branchId);
    });
  });

  describe('findPrescriptionById', () => {
    it('should return prescription by id', async () => {
      const prescriptionId = 'prescription-123';
      const mockPrescription = {
        id: prescriptionId,
        prescriptionNumber: 'RX-20241225-001',
        status: PrescriptionStatus.ACTIVE,
        items: [{ drugName: 'Paracetamol', dosage: 500 }],
        interactions: [],
      };

      mockPrescriptionsService.findPrescriptionById.mockResolvedValue(mockPrescription);

      const result = await controller.findPrescriptionById(prescriptionId, mockRequest as any);

      expect(result).toEqual(mockPrescription);
      expect(service.findPrescriptionById).toHaveBeenCalledWith(prescriptionId, mockRequest.user.branchId);
    });
  });

  describe('updatePrescription', () => {
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
        ...updateDto,
        status: PrescriptionStatus.ACTIVE,
      };

      mockPrescriptionsService.updatePrescription.mockResolvedValue(mockUpdatedPrescription);

      const result = await controller.updatePrescription(prescriptionId, updateDto, mockRequest as any);

      expect(result).toEqual(mockUpdatedPrescription);
      expect(service.updatePrescription).toHaveBeenCalledWith(
        prescriptionId,
        updateDto,
        mockRequest.user.branchId,
      );
    });
  });

  describe('cancelPrescription', () => {
    it('should cancel prescription', async () => {
      const prescriptionId = 'prescription-123';
      const reason = 'Patient allergic to medication';

      const mockCancelledPrescription = {
        id: prescriptionId,
        status: PrescriptionStatus.CANCELLED,
        notes: `Cancelled: ${reason}`,
      };

      mockPrescriptionsService.cancelPrescription.mockResolvedValue(mockCancelledPrescription);

      const result = await controller.cancelPrescription(prescriptionId, reason, mockRequest as any);

      expect(result).toEqual(mockCancelledPrescription);
      expect(service.cancelPrescription).toHaveBeenCalledWith(
        prescriptionId,
        mockRequest.user.branchId,
        reason,
      );
    });
  });

  describe('requestRefill', () => {
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
      };

      mockPrescriptionsService.requestRefill.mockResolvedValue(mockRefill);

      const result = await controller.requestRefill(refillDto, mockRequest as any);

      expect(result).toEqual(mockRefill);
      expect(service.requestRefill).toHaveBeenCalledWith(refillDto, mockRequest.user.branchId);
    });
  });

  describe('approveRefill', () => {
    it('should approve refill', async () => {
      const refillId = 'refill-123';
      const approveDto = {
        refillId,
        notes: 'Approved by doctor',
      };

      const mockApprovedRefill = {
        id: refillId,
        status: RefillStatus.APPROVED,
        approvedAt: new Date(),
        approvedBy: 'doctor-123',
      };

      mockPrescriptionsService.approveRefill.mockResolvedValue(mockApprovedRefill);

      const result = await controller.approveRefill(refillId, approveDto, mockRequest as any);

      expect(result).toEqual(mockApprovedRefill);
      expect(service.approveRefill).toHaveBeenCalledWith(
        approveDto,
        mockRequest.user.branchId,
        mockRequest.user.id,
      );
    });
  });

  describe('rejectRefill', () => {
    it('should reject refill', async () => {
      const refillId = 'refill-123';
      const body = { reason: 'Patient not following instructions' };

      const mockRejectedRefill = {
        id: refillId,
        status: RefillStatus.REJECTED,
        notes: 'Rejected: Patient not following instructions',
      };

      mockPrescriptionsService.rejectRefill.mockResolvedValue(mockRejectedRefill);

      const result = await controller.rejectRefill(refillId, body, mockRequest as any);

      expect(result).toEqual(mockRejectedRefill);
      expect(service.rejectRefill).toHaveBeenCalledWith(
        refillId,
        mockRequest.user.branchId,
        body.reason,
        mockRequest.user.id,
      );
    });
  });

  describe('findAllRefills', () => {
    it('should return paginated refills', async () => {
      const query = {
        page: 1,
        limit: 20,
        status: RefillStatus.PENDING,
      };

      const mockResult = {
        refills: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 20,
          pages: 0,
        },
      };

      mockPrescriptionsService.findAllRefills.mockResolvedValue(mockResult);

      const result = await controller.findAllRefills(query, mockRequest as any);

      expect(result).toEqual(mockResult);
      expect(service.findAllRefills).toHaveBeenCalledWith(query, mockRequest.user.branchId);
    });
  });

  describe('searchDrugs', () => {
    it('should return drug search results', async () => {
      const query = {
        query: 'paracetamol',
        isGeneric: true,
        limit: 10,
      };

      const mockDrugs = [
        {
          id: '1',
          name: 'Paracetamol',
          genericName: 'Acetaminophen',
          brandNames: ['Crocin', 'Calpol'],
          category: 'Analgesic',
          dosageForms: ['Tablet', 'Syrup'],
          isGeneric: true,
          interactions: ['Warfarin'],
          contraindications: ['Liver disease'],
        },
      ];

      mockPrescriptionsService.searchDrugs.mockResolvedValue(mockDrugs);

      const result = await controller.searchDrugs(query);

      expect(result).toEqual(mockDrugs);
      expect(service.searchDrugs).toHaveBeenCalledWith(query);
    });
  });

  describe('createPrescriptionTemplate', () => {
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
      };

      mockPrescriptionsService.createPrescriptionTemplate.mockResolvedValue(mockTemplate);

      const result = await controller.createPrescriptionTemplate(templateDto, mockRequest as any);

      expect(result).toEqual(mockTemplate);
      expect(service.createPrescriptionTemplate).toHaveBeenCalledWith(
        templateDto,
        mockRequest.user.branchId,
        mockRequest.user.id,
      );
    });
  });

  describe('findAllPrescriptionTemplates', () => {
    it('should return paginated prescription templates', async () => {
      const query = {
        page: 1,
        limit: 20,
        category: 'Respiratory',
      };

      const mockResult = {
        templates: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 20,
          pages: 0,
        },
      };

      mockPrescriptionsService.findAllPrescriptionTemplates.mockResolvedValue(mockResult);

      const result = await controller.findAllPrescriptionTemplates(query, mockRequest as any);

      expect(result).toEqual(mockResult);
      expect(service.findAllPrescriptionTemplates).toHaveBeenCalledWith(query, mockRequest.user.branchId);
    });
  });

  describe('getPatientPrescriptions', () => {
    it('should return patient prescriptions', async () => {
      const patientId = 'patient-123';
      const limit = 20;

      const mockResult = {
        prescriptions: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 20,
          pages: 0,
        },
      };

      mockPrescriptionsService.findAllPrescriptions.mockResolvedValue(mockResult);

      const result = await controller.getPatientPrescriptions(patientId, limit, mockRequest as any);

      expect(result).toEqual(mockResult);
      expect(service.findAllPrescriptions).toHaveBeenCalledWith(
        { patientId, limit: 20 },
        mockRequest.user.branchId,
      );
    });
  });

  describe('getPatientPrescriptionHistory', () => {
    it('should return patient prescription history', async () => {
      const patientId = 'patient-123';
      const limit = 50;

      const mockHistory = [
        {
          id: 'prescription-1',
          prescriptionNumber: 'RX-20241225-001',
          drugNames: ['Paracetamol'],
        },
      ];

      mockPrescriptionsService.getPrescriptionHistory.mockResolvedValue(mockHistory);

      const result = await controller.getPatientPrescriptionHistory(patientId, limit, mockRequest as any);

      expect(result).toEqual(mockHistory);
      expect(service.getPrescriptionHistory).toHaveBeenCalledWith(
        { patientId, limit: 50 },
        mockRequest.user.branchId,
      );
    });
  });

  describe('getDoctorPrescriptions', () => {
    it('should return doctor prescriptions', async () => {
      const doctorId = 'doctor-123';
      const limit = 20;

      const mockResult = {
        prescriptions: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 20,
          pages: 0,
        },
      };

      mockPrescriptionsService.findAllPrescriptions.mockResolvedValue(mockResult);

      const result = await controller.getDoctorPrescriptions(doctorId, limit, mockRequest as any);

      expect(result).toEqual(mockResult);
      expect(service.findAllPrescriptions).toHaveBeenCalledWith(
        { doctorId, limit: 20 },
        mockRequest.user.branchId,
      );
    });
  });

  describe('getDoctorPrescriptionStatistics', () => {
    it('should return doctor prescription statistics', async () => {
      const doctorId = 'doctor-123';
      const query = {
        startDate: '2024-12-01',
        endDate: '2024-12-31',
      };

      const mockStats = {
        totalPrescriptions: 50,
        drugBreakdown: [],
        doctorBreakdown: [],
        dailyBreakdown: [],
        period: {
          startDate: '2024-12-01',
          endDate: '2024-12-31',
          groupBy: 'day',
        },
      };

      mockPrescriptionsService.getPrescriptionStatistics.mockResolvedValue(mockStats);

      const result = await controller.getDoctorPrescriptionStatistics(doctorId, query, mockRequest as any);

      expect(result).toEqual(mockStats);
      expect(service.getPrescriptionStatistics).toHaveBeenCalledWith(
        { ...query, doctorId },
        mockRequest.user.branchId,
      );
    });
  });
});
