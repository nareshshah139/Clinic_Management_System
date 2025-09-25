import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { VisitsService } from '../visits.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { Language } from '@prisma/client';

type PrismaServiceMock = {
  patient: {
    findFirst: jest.Mock;
  };
  user: {
    findFirst: jest.Mock;
  };
  appointment: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  visit: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
    groupBy: jest.Mock;
  };
  prescription: {
    findFirst: jest.Mock;
  };
};

const createPrismaMock = (): PrismaServiceMock => ({
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
});

describe('VisitsService', () => {
  let service: VisitsService;
  let prismaMock: PrismaServiceMock;

  const mockBranchId = 'branch-123';
  const mockPatient = {
    id: 'patient-123',
    name: 'John Doe',
    phone: '1234567890',
  };
  const mockDoctor = {
    id: 'doctor-123',
    firstName: 'Dr.',
    lastName: 'Smith',
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
    prismaMock = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<VisitsService>(VisitsService);
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
        patientId: createVisitDto.patientId,
        doctorId: createVisitDto.doctorId,
        appointmentId: createVisitDto.appointmentId,
        vitals: JSON.stringify(createVisitDto.vitals),
        complaints: JSON.stringify(createVisitDto.complaints),
        history: JSON.stringify(createVisitDto.history),
        exam: JSON.stringify(createVisitDto.examination),
        diagnosis: JSON.stringify(createVisitDto.diagnosis),
        plan: JSON.stringify({
          ...createVisitDto.treatmentPlan,
          notes: createVisitDto.notes,
        }),
        attachments: null,
        scribeJson: null,
        patient: mockPatient,
        doctor: {
          ...mockDoctor,
        },
        appointment: mockAppointment,
      };

      prismaMock.patient.findFirst.mockResolvedValue(mockPatient);
      prismaMock.user.findFirst.mockResolvedValue(mockDoctor);
      prismaMock.appointment.findFirst.mockResolvedValue(mockAppointment);
      prismaMock.visit.findFirst.mockResolvedValue(null); // No existing visit
      prismaMock.visit.create.mockResolvedValue({
        ...mockVisit,
      });
      prismaMock.appointment.update.mockResolvedValue({
        ...mockAppointment,
        status: 'IN_PROGRESS',
      });

      const result = await service.create(createVisitDto, mockBranchId);

      expect(result).toMatchObject({
        id: 'visit-123',
        patient: mockPatient,
        appointment: mockAppointment,
        doctor: {
          ...mockDoctor,
          name: 'Dr. Smith',
        },
        notes: createVisitDto.notes,
      });
      expect(result.plan).toEqual(
        JSON.stringify({
          ...createVisitDto.treatmentPlan,
          notes: createVisitDto.notes,
        }),
      );
      expect(prismaMock.patient.findFirst).toHaveBeenCalledWith({
        where: { id: createVisitDto.patientId, branchId: mockBranchId },
      });
      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: {
          id: createVisitDto.doctorId,
          branchId: mockBranchId,
          role: 'DOCTOR',
        },
      });
      expect(prismaMock.appointment.update).toHaveBeenCalledWith({
        where: { id: createVisitDto.appointmentId },
        data: { status: 'IN_PROGRESS' },
      });
    });

    it('should throw NotFoundException if patient not found', async () => {
      prismaMock.patient.findFirst.mockResolvedValue(null);

      await expect(
        service.create(createVisitDto, mockBranchId),
      ).rejects.toThrow(
        new NotFoundException('Patient not found in this branch'),
      );
    });

    it('should throw NotFoundException if doctor not found', async () => {
      prismaMock.patient.findFirst.mockResolvedValue(mockPatient);
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(
        service.create(createVisitDto, mockBranchId),
      ).rejects.toThrow(
        new NotFoundException('Doctor not found in this branch'),
      );
    });

    it('should throw ConflictException if visit already exists for appointment', async () => {
      prismaMock.patient.findFirst.mockResolvedValue(mockPatient);
      prismaMock.user.findFirst.mockResolvedValue(mockDoctor);
      prismaMock.appointment.findFirst.mockResolvedValue(mockAppointment);
      prismaMock.visit.findFirst.mockResolvedValue({ id: 'existing-visit' });

      await expect(
        service.create(createVisitDto, mockBranchId),
      ).rejects.toThrow(
        new ConflictException('Visit already exists for this appointment'),
      );
    });

    it('should throw BadRequestException if no complaints provided', async () => {
      const invalidDto = {
        ...createVisitDto,
        complaints: [],
        appointmentId: undefined,
      };

      prismaMock.patient.findFirst.mockResolvedValue(mockPatient);
      prismaMock.user.findFirst.mockResolvedValue(mockDoctor);
      // Mock appointment check to return null for this test
      prismaMock.appointment.findFirst.mockResolvedValue(null);

      await expect(service.create(invalidDto, mockBranchId)).rejects.toThrow(
        new BadRequestException('At least one complaint is required'),
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated visits', async () => {
      const visitRecord = {
        id: 'visit-1',
        patient: mockPatient,
        doctor: { ...mockDoctor },
        appointment: mockAppointment,
        plan: JSON.stringify({ notes: 'Follow up in 1 week' }),
        createdAt: new Date(),
      };

      prismaMock.visit.findMany.mockResolvedValue([visitRecord]);
      prismaMock.visit.count.mockResolvedValue(1);

      const query = { page: 1, limit: 20 };
      const result = await service.findAll(query, mockBranchId);

      expect(result).toEqual({
        visits: [
          {
            id: visitRecord.id,
            patient: mockPatient,
            doctor: {
              ...mockDoctor,
              name: 'Dr. Smith',
            },
            appointment: mockAppointment,
            plan: visitRecord.plan,
          },
        ],
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

      prismaMock.visit.findMany.mockResolvedValue([]);
      prismaMock.visit.count.mockResolvedValue(0);

      await service.findAll(query, mockBranchId);

      const expectedInclude = {
        patient: {
          select: { id: true, name: true, phone: true, gender: true },
        },
        doctor: {
          select: { id: true, firstName: true, lastName: true },
        },
        appointment: {
          select: { id: true, date: true, slot: true, tokenNumber: true },
        },
      };

      expect(prismaMock.visit.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          patientId: 'patient-123',
          doctorId: 'doctor-123',
          patient: expect.objectContaining({
            branchId: mockBranchId,
          }),
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: expect.objectContaining(expectedInclude),
      });
    });
  });

  describe('findOne', () => {
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

    it('should return visit by id with parsed JSON fields', async () => {
      const mockPlan = {
        ...createVisitDto.treatmentPlan,
        notes: createVisitDto.notes,
      };
      const mockVisit = {
        id: 'visit-123',
        vitals: JSON.stringify(createVisitDto.vitals),
        complaints: JSON.stringify(createVisitDto.complaints),
        diagnosis: JSON.stringify(createVisitDto.diagnosis),
        history: JSON.stringify(createVisitDto.history),
        exam: JSON.stringify(createVisitDto.examination),
        plan: JSON.stringify(mockPlan),
        attachments: null,
        scribeJson: null,
        patient: mockPatient,
        doctor: { ...mockDoctor },
        appointment: mockAppointment,
        prescription: null,
        consents: [],
        labOrders: [],
        deviceLogs: [],
      };

      prismaMock.visit.findFirst.mockResolvedValue({
        ...mockVisit,
      });

      const result = await service.findOne('visit-123', mockBranchId);

      expect(result).toEqual({
        ...mockVisit,
        patient: mockPatient,
        doctor: {
          ...mockDoctor,
          name: 'Dr. Smith',
        },
        appointment: mockAppointment,
        vitals: createVisitDto.vitals,
        complaints: createVisitDto.complaints,
        history: createVisitDto.history,
        exam: createVisitDto.examination,
        diagnosis: createVisitDto.diagnosis,
        plan: mockPlan,
        notes: createVisitDto.notes,
        attachments: [],
        scribeJson: null,
      });
      expect(prismaMock.visit.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'visit-123',
          patient: {
            branchId: mockBranchId,
          },
        },
        include: {
          patient: {
            select: {
              id: true,
              name: true,
              phone: true,
              gender: true,
              dob: true,
              address: true,
            },
          },
          doctor: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          appointment: {
            select: {
              id: true,
              date: true,
              slot: true,
              status: true,
              tokenNumber: true,
            },
          },
          prescription: {
            select: {
              id: true,
              language: true,
              items: true,
              instructions: true,
              qrcode: true,
              signature: true,
            },
          },
          consents: {
            select: {
              id: true,
              consentType: true,
              language: true,
              text: true,
              signedAt: true,
              signer: true,
              method: true,
            },
          },
          labOrders: {
            select: {
              id: true,
              tests: true,
              partner: true,
              status: true,
              resultsRef: true,
            },
          },
          deviceLogs: {
            select: {
              id: true,
              deviceModel: true,
              serialNo: true,
              parameters: true,
              photoRefs: true,
              operatorId: true,
            },
          },
        },
      });
    });

    it('should throw NotFoundException if visit not found', async () => {
      prismaMock.visit.findFirst.mockResolvedValue(null);

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

      prismaMock.visit.findFirst.mockResolvedValue(mockVisit);
      const updatedPlan = { notes: updateDto.notes };
      prismaMock.visit.update.mockResolvedValue({
        ...mockVisit,
        vitals: JSON.stringify(updateDto.vitals),
        plan: JSON.stringify(updatedPlan),
        doctor: { ...mockDoctor },
      });

      const result = await service.update('visit-123', updateDto, mockBranchId);

      expect(result).toMatchObject({
        ...mockUpdatedVisit,
        doctor: {
          ...mockDoctor,
          name: 'Dr. Smith',
        },
        notes: updateDto.notes,
        plan: JSON.stringify(updatedPlan),
      });
      expect(result.vitals).toEqual(JSON.stringify(updateDto.vitals));
      expect(prismaMock.visit.update).toHaveBeenCalledWith({
        where: { id: 'visit-123' },
        data: expect.objectContaining({
          plan: expect.stringMatching(/notes/),
        }),
        include: {
          patient: {
            select: { id: true, name: true, phone: true },
          },
          doctor: {
            select: { id: true, firstName: true, lastName: true },
          },
          appointment: {
            select: { id: true, date: true, slot: true },
          },
        },
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

      const completedPlan = { finalNotes: completeDto.finalNotes };

      prismaMock.visit.findFirst.mockResolvedValue(mockVisit);
      prismaMock.visit.update.mockResolvedValue({
        ...mockVisit,
        plan: JSON.stringify(completedPlan),
        doctor: { ...mockDoctor },
      });
      prismaMock.appointment.update.mockResolvedValue({
        ...mockAppointment,
        status: 'COMPLETED',
      });

      const result = await service.complete(
        'visit-123',
        completeDto,
        mockBranchId,
      );

      expect(result).toMatchObject({
        ...mockVisit,
        doctor: {
          ...mockDoctor,
          name: 'Dr. Smith',
        },
        notes: completeDto.finalNotes,
        plan: JSON.stringify(completedPlan),
      });
      expect(prismaMock.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appointment-123' },
        data: { status: 'COMPLETED' },
      });
      expect(prismaMock.visit.update).toHaveBeenCalledWith({
        where: { id: 'visit-123' },
        data: expect.objectContaining({
          plan: expect.stringContaining('finalNotes'),
        }),
        include: {
          patient: {
            select: { id: true, name: true, phone: true },
          },
          doctor: {
            select: { id: true, firstName: true, lastName: true },
          },
          appointment: {
            select: { id: true, date: true, slot: true },
          },
        },
      });
    });
  });

  describe('remove', () => {
    it('should soft delete visit successfully', async () => {
      const mockVisit = {
        id: 'visit-123',
        plan: JSON.stringify({ notes: 'Original notes' }),
        patient: mockPatient,
        doctor: mockDoctor,
        appointment: mockAppointment,
      };

      prismaMock.visit.findFirst.mockResolvedValue(mockVisit);
      prismaMock.prescription.findFirst.mockResolvedValue(null);
      prismaMock.visit.update.mockResolvedValue({
        ...mockVisit,
        plan: JSON.stringify({
          deleted: true,
          deletedAt: '2025-01-01T00:00:00.000Z',
        }),
      });

      const result = await service.remove('visit-123', mockBranchId);

      expect(result).toEqual({ message: 'Visit deleted successfully' });
      expect(prismaMock.visit.update).toHaveBeenCalledWith({
        where: { id: 'visit-123' },
        data: {
          plan: expect.stringMatching(/"deleted":true/),
        },
      });
    });

    it('should throw BadRequestException if visit has prescription', async () => {
      const mockVisit = {
        id: 'visit-123',
        plan: JSON.stringify({ notes: 'Original notes' }),
        patient: mockPatient,
        doctor: mockDoctor,
        appointment: mockAppointment,
      };

      prismaMock.visit.findFirst.mockResolvedValue(mockVisit);
      prismaMock.prescription.findFirst.mockResolvedValue({
        id: 'prescription-123',
      });

      await expect(service.remove('visit-123', mockBranchId)).rejects.toThrow(
        new BadRequestException(
          'Cannot delete visit with associated prescription',
        ),
      );
    });
  });

  describe('getPatientVisitHistory', () => {
    it('should return patient visit history', async () => {
      prismaMock.patient.findFirst.mockResolvedValue(mockPatient);
      prismaMock.visit.findMany.mockResolvedValue([
        {
          id: 'visit-1',
          patient: { ...mockPatient },
          doctor: { ...mockDoctor },
          appointment: mockAppointment,
          plan: JSON.stringify({ notes: 'Follow up in 1 week' }),
        },
      ]);

      const query = { patientId: 'patient-123' };
      const result = await service.getPatientVisitHistory(query, mockBranchId);

      expect(result).toHaveProperty('patient');
      expect(result).toHaveProperty('visits');
      expect(result.visits).toHaveLength(1);
      expect(result.visits[0]).toHaveProperty('vitals');
      expect(result.visits[0]).toHaveProperty('complaints');
      expect(result.visits[0]).toHaveProperty('diagnosis');
      expect(prismaMock.visit.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          patientId: 'patient-123',
          patient: expect.objectContaining({
            branchId: mockBranchId,
          }),
        }),
        include: {
          doctor: {
            select: { id: true, firstName: true, lastName: true },
          },
          appointment: {
            select: { id: true, date: true, slot: true, tokenNumber: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });

    it('should throw NotFoundException if patient not found', async () => {
      prismaMock.patient.findFirst.mockResolvedValue(null);

      const query = { patientId: 'patient-123' };
      await expect(
        service.getPatientVisitHistory(query, mockBranchId),
      ).rejects.toThrow(
        new NotFoundException('Patient not found in this branch'),
      );
    });
  });

  describe('getDoctorVisits', () => {
    it('should return doctor visits', async () => {
      prismaMock.user.findFirst.mockResolvedValue(mockDoctor);
      prismaMock.visit.findMany.mockResolvedValue([
        {
          id: 'visit-1',
          vitals: JSON.stringify({ systolicBP: 120 }),
          complaints: JSON.stringify([{ complaint: 'Headache' }]),
          diagnosis: JSON.stringify([{ diagnosis: 'Tension headache' }]),
          patient: mockPatient,
          appointment: mockAppointment,
        },
      ]);

      const query = { doctorId: 'doctor-123' };
      const result = await service.getDoctorVisits(query, mockBranchId);

      expect(result).toHaveProperty('doctor');
      expect(result).toHaveProperty('visits');
      expect(result.visits).toHaveLength(1);
      expect(prismaMock.visit.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          doctorId: 'doctor-123',
          doctor: expect.objectContaining({
            branchId: mockBranchId,
          }),
        }),
        include: {
          patient: {
            select: { id: true, name: true, phone: true, gender: true },
          },
          appointment: {
            select: { id: true, date: true, slot: true, tokenNumber: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });

    it('should throw NotFoundException if doctor not found', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      const query = { doctorId: 'doctor-123' };
      await expect(
        service.getDoctorVisits(query, mockBranchId),
      ).rejects.toThrow(
        new NotFoundException('Doctor not found in this branch'),
      );
    });
  });

  describe('getVisitStatistics', () => {
    it('should return visit statistics', async () => {
      prismaMock.visit.count
        .mockResolvedValueOnce(100) // total visits
        .mockResolvedValueOnce(80) // visits with prescriptions
        .mockResolvedValueOnce(60); // visits with follow up

      prismaMock.visit.groupBy.mockResolvedValue([
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
