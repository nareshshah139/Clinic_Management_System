import { Test, TestingModule } from '@nestjs/testing';
import { VisitsController } from '../visits.controller';
import { VisitsService } from '../visits.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { Language } from '@prisma/client';

describe('VisitsController', () => {
  let controller: VisitsController;
  let service: VisitsService;

  const mockVisitsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    complete: jest.fn(),
    remove: jest.fn(),
    getPatientVisitHistory: jest.fn(),
    getDoctorVisits: jest.fn(),
    getVisitStatistics: jest.fn(),
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
      controllers: [VisitsController],
      providers: [
        {
          provide: VisitsService,
          useValue: mockVisitsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<VisitsController>(VisitsController);
    service = module.get<VisitsService>(VisitsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a visit', async () => {
      const createVisitDto = {
        patientId: 'patient-123',
        doctorId: 'doctor-123',
        appointmentId: 'appointment-123',
        vitals: {
          systolicBP: 120,
          diastolicBP: 80,
          heartRate: 72,
        },
        complaints: [
          {
            complaint: 'Headache',
            duration: '2 days',
            severity: 'Moderate',
          },
        ],
        diagnosis: [
          {
            diagnosis: 'Tension headache',
            icd10Code: 'G44.2',
            type: 'Primary',
          },
        ],
        language: Language.EN,
      };

      const mockVisit = {
        id: 'visit-123',
        ...createVisitDto,
      };

      mockVisitsService.create.mockResolvedValue(mockVisit);

      const result = await controller.create(createVisitDto, mockRequest as any);

      expect(result).toEqual(mockVisit);
      expect(service.create).toHaveBeenCalledWith(createVisitDto, mockRequest.user.branchId);
    });
  });

  describe('findAll', () => {
    it('should return paginated visits', async () => {
      const query = {
        page: 1,
        limit: 20,
        patientId: 'patient-123',
      };

      const mockResult = {
        visits: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 20,
          pages: 0,
        },
      };

      mockVisitsService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll(query, mockRequest as any);

      expect(result).toEqual(mockResult);
      expect(service.findAll).toHaveBeenCalledWith(query, mockRequest.user.branchId);
    });
  });

  describe('getStatistics', () => {
    it('should return visit statistics', async () => {
      const mockStats = {
        totalVisits: 100,
        visitsWithPrescriptions: 80,
        visitsWithFollowUp: 60,
        averageVisitsPerDay: 5.5,
        period: {
          startDate: null,
          endDate: null,
        },
      };

      mockVisitsService.getVisitStatistics.mockResolvedValue(mockStats);

      const result = await controller.getStatistics(undefined, undefined, mockRequest as any);

      expect(result).toEqual(mockStats);
      expect(service.getVisitStatistics).toHaveBeenCalledWith(
        mockRequest.user.branchId,
        undefined,
        undefined,
      );
    });

    it('should return visit statistics with date range', async () => {
      const startDate = '2024-12-01';
      const endDate = '2024-12-31';
      const mockStats = {
        totalVisits: 50,
        visitsWithPrescriptions: 40,
        visitsWithFollowUp: 30,
        averageVisitsPerDay: 1.6,
        period: {
          startDate,
          endDate,
        },
      };

      mockVisitsService.getVisitStatistics.mockResolvedValue(mockStats);

      const result = await controller.getStatistics(startDate, endDate, mockRequest as any);

      expect(result).toEqual(mockStats);
      expect(service.getVisitStatistics).toHaveBeenCalledWith(
        mockRequest.user.branchId,
        startDate,
        endDate,
      );
    });
  });

  describe('getPatientVisitHistory', () => {
    it('should return patient visit history', async () => {
      const patientId = 'patient-123';
      const query = {
        startDate: '2024-12-01',
        endDate: '2024-12-31',
        limit: 50,
      };

      const mockHistory = {
        patient: {
          id: 'patient-123',
          name: 'John Doe',
          phone: '1234567890',
        },
        visits: [],
      };

      mockVisitsService.getPatientVisitHistory.mockResolvedValue(mockHistory);

      const result = await controller.getPatientVisitHistory(patientId, query, mockRequest as any);

      expect(result).toEqual(mockHistory);
      expect(service.getPatientVisitHistory).toHaveBeenCalledWith(
        { patientId, ...query },
        mockRequest.user.branchId,
      );
    });
  });

  describe('getDoctorVisits', () => {
    it('should return doctor visits', async () => {
      const doctorId = 'doctor-123';
      const query = {
        date: '2024-12-25',
        limit: 50,
      };

      const mockVisits = {
        doctor: {
          id: 'doctor-123',
          name: 'Dr. Smith',
        },
        visits: [],
      };

      mockVisitsService.getDoctorVisits.mockResolvedValue(mockVisits);

      const result = await controller.getDoctorVisits(doctorId, query, mockRequest as any);

      expect(result).toEqual(mockVisits);
      expect(service.getDoctorVisits).toHaveBeenCalledWith(
        { doctorId, ...query },
        mockRequest.user.branchId,
      );
    });
  });

  describe('findOne', () => {
    it('should return visit by id', async () => {
      const visitId = 'visit-123';
      const mockVisit = {
        id: visitId,
        patientId: 'patient-123',
        doctorId: 'doctor-123',
        vitals: { systolicBP: 120, diastolicBP: 80 },
        complaints: [{ complaint: 'Headache' }],
        diagnosis: [{ diagnosis: 'Tension headache' }],
      };

      mockVisitsService.findOne.mockResolvedValue(mockVisit);

      const result = await controller.findOne(visitId, mockRequest as any);

      expect(result).toEqual(mockVisit);
      expect(service.findOne).toHaveBeenCalledWith(visitId, mockRequest.user.branchId);
    });
  });

  describe('update', () => {
    it('should update visit', async () => {
      const visitId = 'visit-123';
      const updateDto = {
        vitals: {
          systolicBP: 130,
          diastolicBP: 85,
        },
        notes: 'Updated notes',
      };

      const mockUpdatedVisit = {
        id: visitId,
        ...updateDto,
      };

      mockVisitsService.update.mockResolvedValue(mockUpdatedVisit);

      const result = await controller.update(visitId, updateDto, mockRequest as any);

      expect(result).toEqual(mockUpdatedVisit);
      expect(service.update).toHaveBeenCalledWith(
        visitId,
        updateDto,
        mockRequest.user.branchId,
      );
    });
  });

  describe('complete', () => {
    it('should complete visit', async () => {
      const visitId = 'visit-123';
      const completeDto = {
        finalNotes: 'Visit completed successfully',
        followUpDate: '2024-12-30',
        followUpInstructions: 'Return in 1 week',
      };

      const mockCompletedVisit = {
        id: visitId,
        notes: completeDto.finalNotes,
        followUp: new Date(completeDto.followUpDate),
      };

      mockVisitsService.complete.mockResolvedValue(mockCompletedVisit);

      const result = await controller.complete(visitId, completeDto, mockRequest as any);

      expect(result).toEqual(mockCompletedVisit);
      expect(service.complete).toHaveBeenCalledWith(
        visitId,
        completeDto,
        mockRequest.user.branchId,
      );
    });
  });

  describe('remove', () => {
    it('should delete visit', async () => {
      const visitId = 'visit-123';
      const mockResult = { message: 'Visit deleted successfully' };

      mockVisitsService.remove.mockResolvedValue(mockResult);

      const result = await controller.remove(visitId, mockRequest as any);

      expect(result).toEqual(mockResult);
      expect(service.remove).toHaveBeenCalledWith(visitId, mockRequest.user.branchId);
    });
  });
});
