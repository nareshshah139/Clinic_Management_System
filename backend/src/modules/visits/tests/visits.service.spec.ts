import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { VisitsService } from '../visits.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { Language } from '@prisma/client';

describe('VisitsService', () => {
  let service: VisitsService;
  let prisma: PrismaService;

  const mockPrisma = {
    patient: {
      findFirst: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
    },
    appointment: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    visit: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    prescription: {
      findFirst: jest.fn(),
    },
  };

  const mockBranchId = 'branch-123';
  const mockPatient = {
    id: 'patient-123',
    name: 'John Doe',
    phone: '1234567890',
  };
  const mockDoctor = {
    id: 'doctor-123',
    name: 'Dr. Smith',
    role: 'DOCTOR',
  };
  const mockAppointment = {
    id: 'appointment-123',
    patientId: 'patient-123',
    doctorId: 'doctor-123',
    status: 'SCHEDULED',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<VisitsService>(VisitsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
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
        },
      ],
      history: 'No significant medical history',
      examination: {
        generalAppearance: 'Well appearing',
        skinExamination: 'Normal',
      },
      diagnosis: [
        {
          diagnosis: 'Tension headache',
          icd10Code: 'G44.2',
          type: 'Primary',
        },
      ],
      treatmentPlan: {
        medications: 'Paracetamol 500mg',
        followUpInstructions: 'Return if symptoms worsen',
      },
      language: Language.EN,
      notes: 'Patient cooperative',
    };

    it('should create a visit successfully', async () => {
      const mockVisit = {
        id: 'visit-123',
        ...createVisitDto,
        patient: mockPatient,
        doctor: mockDoctor,
        appointment: mockAppointment,
      };

      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.user.findFirst.mockResolvedValue(mockDoctor);
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.visit.findFirst.mockResolvedValue(null); // No existing visit
      mockPrisma.visit.create.mockResolvedValue(mockVisit);
      mockPrisma.appointment.update.mockResolvedValue({
        ...mockAppointment,
        status: 'IN_PROGRESS',
      });

      const result = await service.create(createVisitDto, mockBranchId);

      expect(result).toEqual(mockVisit);
      expect(mockPrisma.patient.findFirst).toHaveBeenCalledWith({
        where: { id: createVisitDto.patientId, branchId: mockBranchId },
      });
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: createVisitDto.doctorId, branchId: mockBranchId, role: 'DOCTOR' },
      });
      expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
        where: { id: createVisitDto.appointmentId },
        data: { status: 'IN_PROGRESS' },
      });
    });

    it('should throw NotFoundException if patient not found', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      await expect(service.create(createVisitDto, mockBranchId)).rejects.toThrow(
        new NotFoundException('Patient not found in this branch'),
      );
    });

    it('should throw NotFoundException if doctor not found', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.create(createVisitDto, mockBranchId)).rejects.toThrow(
        new NotFoundException('Doctor not found in this branch'),
      );
    });

    it('should throw ConflictException if visit already exists for appointment', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.user.findFirst.mockResolvedValue(mockDoctor);
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.visit.findFirst.mockResolvedValue({ id: 'existing-visit' });

      await expect(service.create(createVisitDto, mockBranchId)).rejects.toThrow(
        new ConflictException('Visit already exists for this appointment'),
      );
    });

    it('should throw BadRequestException if no complaints provided', async () => {
      const invalidDto = { ...createVisitDto, complaints: [], appointmentId: undefined };

      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.user.findFirst.mockResolvedValue(mockDoctor);
      // Mock appointment check to return null for this test
      mockPrisma.appointment.findFirst.mockResolvedValue(null);

      await expect(service.create(invalidDto, mockBranchId)).rejects.toThrow(
        new BadRequestException('At least one complaint is required'),
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated visits', async () => {
      const mockVisits = [
        {
          id: 'visit-1',
          patient: mockPatient,
          doctor: mockDoctor,
          appointment: mockAppointment,
        },
      ];

      mockPrisma.visit.findMany.mockResolvedValue(mockVisits);
      mockPrisma.visit.count.mockResolvedValue(1);

      const query = { page: 1, limit: 20 };
      const result = await service.findAll(query, mockBranchId);

      expect(result).toEqual({
        visits: mockVisits,
        pagination: {
          total: 1,
          page: 1,
          limit: 20,
          pages: 1,
        },
      });
    });

    it('should apply filters correctly', async () => {
      const query = {
        patientId: 'patient-123',
        doctorId: 'doctor-123',
        date: '2024-12-25',
      };

      mockPrisma.visit.findMany.mockResolvedValue([]);
      mockPrisma.visit.count.mockResolvedValue(0);

      await service.findAll(query, mockBranchId);

      expect(mockPrisma.visit.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          branchId: mockBranchId,
          patientId: 'patient-123',
          doctorId: 'doctor-123',
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
        include: expect.any(Object),
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return visit by id with parsed JSON fields', async () => {
      const mockVisit = {
        id: 'visit-123',
        vitals: JSON.stringify({ systolicBP: 120, diastolicBP: 80 }),
        complaints: JSON.stringify([{ complaint: 'Headache' }]),
        diagnosis: JSON.stringify([{ diagnosis: 'Tension headache' }]),
        history: null,
        exam: null,
        plan: null,
        attachments: null,
        scribeJson: null,
        patient: mockPatient,
        doctor: mockDoctor,
        appointment: mockAppointment,
        prescription: null,
        consents: [],
        labOrders: [],
        deviceLogs: [],
      };

      mockPrisma.visit.findFirst.mockResolvedValue(mockVisit);

      const result = await service.findOne('visit-123', mockBranchId);

      expect(result).toEqual({
        ...mockVisit,
        vitals: { systolicBP: 120, diastolicBP: 80 },
        complaints: [{ complaint: 'Headache' }],
        diagnosis: [{ diagnosis: 'Tension headache' }],
        history: null,
        exam: null,
        plan: null,
        attachments: [],
        scribeJson: null,
      });
      expect(mockPrisma.visit.findFirst).toHaveBeenCalledWith({
        where: { id: 'visit-123', branchId: mockBranchId },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if visit not found', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue(null);

      await expect(service.findOne('visit-123', mockBranchId)).rejects.toThrow(
        new NotFoundException('Visit not found'),
      );
    });
  });

  describe('update', () => {
    it('should update visit successfully', async () => {
      const mockVisit = {
        id: 'visit-123',
        vitals: JSON.stringify({ systolicBP: 120 }),
        complaints: JSON.stringify([{ complaint: 'Headache' }]),
        patient: mockPatient,
        doctor: mockDoctor,
        appointment: mockAppointment,
      };

      const updateDto = {
        vitals: { systolicBP: 130, diastolicBP: 85 },
        notes: 'Updated notes',
      };

      const mockUpdatedVisit = {
        ...mockVisit,
        vitals: JSON.stringify(updateDto.vitals),
        notes: updateDto.notes,
      };

      mockPrisma.visit.findFirst.mockResolvedValue(mockVisit);
      mockPrisma.visit.update.mockResolvedValue(mockUpdatedVisit);

      const result = await service.update('visit-123', updateDto, mockBranchId);

      expect(result).toEqual(mockUpdatedVisit);
      expect(mockPrisma.visit.update).toHaveBeenCalledWith({
        where: { id: 'visit-123' },
        data: expect.objectContaining({
          vitals: JSON.stringify(updateDto.vitals),
          notes: updateDto.notes,
        }),
        include: expect.any(Object),
      });
    });
  });

  describe('complete', () => {
    it('should complete visit successfully', async () => {
      const mockVisit = {
        id: 'visit-123',
        appointmentId: 'appointment-123',
        plan: JSON.stringify({ medications: 'Paracetamol' }),
        patient: mockPatient,
        doctor: mockDoctor,
        appointment: mockAppointment,
      };

      const completeDto = {
        finalNotes: 'Visit completed successfully',
        followUpDate: '2024-12-30',
        followUpInstructions: 'Return in 1 week',
      };

      const mockCompletedVisit = {
        ...mockVisit,
        notes: completeDto.finalNotes,
        followUp: new Date(completeDto.followUpDate),
      };

      mockPrisma.visit.findFirst.mockResolvedValue(mockVisit);
      mockPrisma.visit.update.mockResolvedValue(mockCompletedVisit);
      mockPrisma.appointment.update.mockResolvedValue({
        ...mockAppointment,
        status: 'COMPLETED',
      });

      const result = await service.complete('visit-123', completeDto, mockBranchId);

      expect(result).toEqual(mockCompletedVisit);
      expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appointment-123' },
        data: { status: 'COMPLETED' },
      });
    });
  });

  describe('remove', () => {
    it('should soft delete visit successfully', async () => {
      const mockVisit = {
        id: 'visit-123',
        notes: 'Original notes',
        patient: mockPatient,
        doctor: mockDoctor,
        appointment: mockAppointment,
      };

      mockPrisma.visit.findFirst.mockResolvedValue(mockVisit);
      mockPrisma.prescription.findFirst.mockResolvedValue(null);
      mockPrisma.visit.update.mockResolvedValue({
        ...mockVisit,
        notes: '[DELETED] Original notes',
      });

      const result = await service.remove('visit-123', mockBranchId);

      expect(result).toEqual({ message: 'Visit deleted successfully' });
      expect(mockPrisma.visit.update).toHaveBeenCalledWith({
        where: { id: 'visit-123' },
        data: { notes: '[DELETED] Original notes' },
      });
    });

    it('should throw BadRequestException if visit has prescription', async () => {
      const mockVisit = {
        id: 'visit-123',
        notes: 'Original notes',
        patient: mockPatient,
        doctor: mockDoctor,
        appointment: mockAppointment,
      };

      mockPrisma.visit.findFirst.mockResolvedValue(mockVisit);
      mockPrisma.prescription.findFirst.mockResolvedValue({ id: 'prescription-123' });

      await expect(service.remove('visit-123', mockBranchId)).rejects.toThrow(
        new BadRequestException('Cannot delete visit with associated prescription'),
      );
    });
  });

  describe('getPatientVisitHistory', () => {
    it('should return patient visit history', async () => {
      const mockVisits = [
        {
          id: 'visit-1',
          vitals: JSON.stringify({ systolicBP: 120 }),
          complaints: JSON.stringify([{ complaint: 'Headache' }]),
          diagnosis: JSON.stringify([{ diagnosis: 'Tension headache' }]),
          doctor: mockDoctor,
          appointment: mockAppointment,
        },
      ];

      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.visit.findMany.mockResolvedValue(mockVisits);

      const query = { patientId: 'patient-123' };
      const result = await service.getPatientVisitHistory(query, mockBranchId);

      expect(result).toHaveProperty('patient');
      expect(result).toHaveProperty('visits');
      expect(result.visits).toHaveLength(1);
      expect(result.visits[0]).toHaveProperty('vitals');
      expect(result.visits[0]).toHaveProperty('complaints');
      expect(result.visits[0]).toHaveProperty('diagnosis');
    });

    it('should throw NotFoundException if patient not found', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      const query = { patientId: 'patient-123' };
      await expect(service.getPatientVisitHistory(query, mockBranchId)).rejects.toThrow(
        new NotFoundException('Patient not found in this branch'),
      );
    });
  });

  describe('getDoctorVisits', () => {
    it('should return doctor visits', async () => {
      const mockVisits = [
        {
          id: 'visit-1',
          vitals: JSON.stringify({ systolicBP: 120 }),
          complaints: JSON.stringify([{ complaint: 'Headache' }]),
          diagnosis: JSON.stringify([{ diagnosis: 'Tension headache' }]),
          patient: mockPatient,
          appointment: mockAppointment,
        },
      ];

      mockPrisma.user.findFirst.mockResolvedValue(mockDoctor);
      mockPrisma.visit.findMany.mockResolvedValue(mockVisits);

      const query = { doctorId: 'doctor-123' };
      const result = await service.getDoctorVisits(query, mockBranchId);

      expect(result).toHaveProperty('doctor');
      expect(result).toHaveProperty('visits');
      expect(result.visits).toHaveLength(1);
    });

    it('should throw NotFoundException if doctor not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const query = { doctorId: 'doctor-123' };
      await expect(service.getDoctorVisits(query, mockBranchId)).rejects.toThrow(
        new NotFoundException('Doctor not found in this branch'),
      );
    });
  });

  describe('getVisitStatistics', () => {
    it('should return visit statistics', async () => {
      const mockStats = {
        totalVisits: 100,
        visitsWithPrescriptions: 80,
        visitsWithFollowUp: 60,
        averageVisitsPerDay: 50, // Fixed calculation: 100 visits / 2 days = 50
      };

      mockPrisma.visit.count
        .mockResolvedValueOnce(100) // total visits
        .mockResolvedValueOnce(80)  // visits with prescriptions
        .mockResolvedValueOnce(60); // visits with follow up

      mockPrisma.visit.groupBy.mockResolvedValue([
        { createdAt: new Date('2024-12-01'), _count: { id: 5 } },
        { createdAt: new Date('2024-12-02'), _count: { id: 6 } },
      ]);

      const result = await service.getVisitStatistics(mockBranchId);

      expect(result).toEqual({
        totalVisits: 100,
        visitsWithPrescriptions: 80,
        visitsWithFollowUp: 60,
        averageVisitsPerDay: 50, // 100 / 2 = 50
        period: {
          startDate: null,
          endDate: null,
        },
      });
    });
  });
});
