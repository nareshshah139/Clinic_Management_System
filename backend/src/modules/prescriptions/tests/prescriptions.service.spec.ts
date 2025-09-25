import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrescriptionsService } from '../prescriptions.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { PrescriptionStatus, PrescriptionLanguage, RefillStatus, DosageUnit, Frequency, DurationUnit, CreatePrescriptionPadDto } from '../dto/prescription.dto';

describe('PrescriptionsService', () => {
  let service: PrescriptionsService;
  let prisma: PrismaService;

  const mockPrisma = {
    patient: {
      findFirst: jest.fn(),
    },
    visit: {
      create: jest.fn(),
      delete: jest.fn(),
    },
    visit: {
      findFirst: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
    },
    prescription: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    prescriptionRefill: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    prescriptionTemplate: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  }; 

  const mockBranchId = 'branch-123';
  const mockPatient = {
    id: 'patient-123',
    name: 'John Doe',
    phone: '1234567890',
  };
  const mockVisit = {
    id: 'visit-123',
    createdAt: new Date(),
    doctor: { id: 'doctor-123', name: 'Dr. Smith' },
  };
  const mockDoctor = {
    id: 'doctor-123',
    firstName: 'Dr.',
    lastName: 'Smith',
    name: 'Dr. Smith',
    role: 'DOCTOR',
    specialization: 'General Medicine',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrescriptionsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<PrescriptionsService>(PrescriptionsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPrescription', () => {
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
        {
          drugName: 'Amoxicillin',
          genericName: 'Amoxicillin',
          dosage: 250,
          dosageUnit: DosageUnit.MG,
          frequency: Frequency.THREE_TIMES_DAILY,
          duration: 10,
          durationUnit: DurationUnit.DAYS,
          instructions: 'Take as directed',
          route: 'Oral',
          quantity: 30,
          isGeneric: true,
        },
      ],
      diagnosis: 'Fever and infection',
      notes: 'Patient has mild fever',
      language: PrescriptionLanguage.EN,
      maxRefills: 2,
      followUpInstructions: 'Follow up in 1 week',
    };

    it('should create a prescription successfully', async () => {
      const mockPrescription = {
        id: 'prescription-123',
        prescriptionNumber: 'RX-20241225-001',
        ...createPrescriptionDto,
        status: PrescriptionStatus.ACTIVE,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        patient: mockPatient,
        visit: mockVisit,
        doctor: mockDoctor,
        refills: [],
        items: JSON.stringify(createPrescriptionDto.items),
        metadata: null,
      };

      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.visit.findFirst.mockResolvedValue(mockVisit);
      mockPrisma.user.findFirst.mockResolvedValue(mockDoctor);
      mockPrisma.prescription.create.mockResolvedValue(mockPrescription);

      const result = await service.createPrescription(createPrescriptionDto, mockBranchId);

      expect(result).toMatchObject({
        id: 'prescription-123',
        prescriptionNumber: 'RX-20241225-001',
        patientId: 'patient-123',
        visitId: 'visit-123',
        doctorId: 'doctor-123',
        status: PrescriptionStatus.ACTIVE,
      });
      expect(result.items).toEqual(createPrescriptionDto.items);
      expect(result.interactions).toBeDefined();
    });

    it('should throw NotFoundException if patient not found', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      await expect(service.createPrescription(createPrescriptionDto, mockBranchId)).rejects.toThrow(
        new NotFoundException('Patient not found in this branch'),
      );
    });

    it('should throw NotFoundException if visit not found', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.visit.findFirst.mockResolvedValue(null);

      await expect(service.createPrescription(createPrescriptionDto, mockBranchId)).rejects.toThrow(
        new NotFoundException('Visit not found in this branch'),
      );
    });

    it('should throw NotFoundException if doctor not found', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.visit.findFirst.mockResolvedValue(mockVisit);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.createPrescription(createPrescriptionDto, mockBranchId)).rejects.toThrow(
        new NotFoundException('Doctor not found'),
      );
    });

    it('should throw BadRequestException if no items provided', async () => {
      const invalidDto = { ...createPrescriptionDto, items: [] };

      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.visit.findFirst.mockResolvedValue(mockVisit);
      mockPrisma.user.findFirst.mockResolvedValue(mockDoctor);

      await expect(service.createPrescription(invalidDto, mockBranchId)).rejects.toThrow(
        new BadRequestException('At least one prescription item is required'),
      );
    });
  });

  describe('createPrescriptionPad', () => {
    const padDto: CreatePrescriptionPadDto = {
      patientId: 'patient-123',
      doctorId: 'doctor-123',
      items: [
        {
          drugName: 'Paracetamol',
          dosage: 500,
          dosageUnit: DosageUnit.MG,
          frequency: Frequency.ONCE_DAILY,
          duration: 5,
          durationUnit: DurationUnit.DAYS,
        },
      ],
      diagnosis: 'Follow-up consult',
      notes: 'Issued via quick pad',
      reason: 'Phone consult',
    };

    it('should create a visit and prescription successfully', async () => {
      const createdVisit = { id: 'generated-visit', createdAt: new Date() };
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.user.findFirst.mockResolvedValue(mockDoctor);
      mockPrisma.visit.create.mockResolvedValue(createdVisit);
      mockPrisma.prescription.create.mockResolvedValue({
        id: 'prescription-xyz',
        prescriptionNumber: 'RX-20241225-001',
        patientId: padDto.patientId,
        doctorId: padDto.doctorId,
        visitId: createdVisit.id,
        items: JSON.stringify(padDto.items),
        status: PrescriptionStatus.ACTIVE,
        metadata: null,
      });

      const result = await service.createPrescriptionPad(padDto, mockBranchId);

      expect(mockPrisma.visit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          patientId: padDto.patientId,
          doctorId: padDto.doctorId,
          complaints: expect.any(String),
          plan: expect.any(String),
        }),
      });
      expect(mockPrisma.prescription.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          visitId: createdVisit.id,
        }),
      }));
      expect(result).toMatchObject({
        id: 'prescription-xyz',
        visitId: createdVisit.id,
      });
    });

    it('should rollback visit creation if prescription fails', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.user.findFirst.mockResolvedValue(mockDoctor);
      mockPrisma.visit.create.mockResolvedValue({ id: 'generated-visit', createdAt: new Date() });
      mockPrisma.prescription.create.mockRejectedValue(new Error('Failed to create prescription'));

      await expect(service.createPrescriptionPad(padDto, mockBranchId)).rejects.toThrow('Failed to create prescription');

      expect(mockPrisma.prescription.deleteMany).toHaveBeenCalledWith({ where: { visitId: 'generated-visit' } });
      expect(mockPrisma.visit.delete).toHaveBeenCalledWith({ where: { id: 'generated-visit' } });
    });

    it('should validate patient and doctor branch membership', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      await expect(service.createPrescriptionPad(padDto, mockBranchId)).rejects.toThrow('Patient not found in this branch');

      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.createPrescriptionPad(padDto, mockBranchId)).rejects.toThrow('Doctor not found in this branch');
    });
  });

  describe('findAllPrescriptions', () => {
    it('should return paginated prescriptions', async () => {
      const mockPrescriptions = [
        {
          id: 'prescription-1',
          prescriptionNumber: 'RX-20241225-001',
          status: PrescriptionStatus.ACTIVE,
          patient: mockPatient,
          visit: mockVisit,
          doctor: mockDoctor,
          refills: [],
          items: JSON.stringify([{ drugName: 'Paracetamol', dosage: 500 }]),
          metadata: null,
        },
      ];

      mockPrisma.prescription.findMany.mockResolvedValue(mockPrescriptions);
      mockPrisma.prescription.count.mockResolvedValue(1);

      const query = { page: 1, limit: 20 };
      const result = await service.findAllPrescriptions(query, mockBranchId);

      expect(result).toEqual({
        prescriptions: [
          {
            ...mockPrescriptions[0],
            items: [{ drugName: 'Paracetamol', dosage: 500 }],
            metadata: null,
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
        status: PrescriptionStatus.ACTIVE,
        startDate: '2024-12-01',
        endDate: '2024-12-31',
      };

      mockPrisma.prescription.findMany.mockResolvedValue([]);
      mockPrisma.prescription.count.mockResolvedValue(0);

      await service.findAllPrescriptions(query, mockBranchId);

      expect(mockPrisma.prescription.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          branchId: mockBranchId,
          patientId: 'patient-123',
          status: PrescriptionStatus.ACTIVE,
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

  describe('findPrescriptionById', () => {
    it('should return prescription by id with parsed JSON fields', async () => {
      const mockPrescription = {
        id: 'prescription-123',
        prescriptionNumber: 'RX-20241225-001',
        items: JSON.stringify([
          { drugName: 'Paracetamol', dosage: 500 },
        ]),
        metadata: JSON.stringify({ source: 'web' }),
        status: PrescriptionStatus.ACTIVE,
        patient: mockPatient,
        visit: mockVisit,
        doctor: mockDoctor,
        refills: [],
      };

      mockPrisma.prescription.findFirst.mockResolvedValue(mockPrescription);

      const result = await service.findPrescriptionById('prescription-123', mockBranchId);

      expect(result).toEqual({
        ...mockPrescription,
        items: [{ drugName: 'Paracetamol', dosage: 500 }],
        metadata: { source: 'web' },
        interactions: expect.any(Array),
      });
      expect(mockPrisma.prescription.findFirst).toHaveBeenCalledWith({
        where: { id: 'prescription-123', branchId: mockBranchId },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if prescription not found', async () => {
      mockPrisma.prescription.findFirst.mockResolvedValue(null);

      await expect(service.findPrescriptionById('prescription-123', mockBranchId)).rejects.toThrow(
        new NotFoundException('Prescription not found'),
      );
    });
  });

  describe('updatePrescription', () => {
    it('should update prescription successfully', async () => {
      const mockPrescription = {
        id: 'prescription-123',
        status: PrescriptionStatus.ACTIVE,
        items: JSON.stringify([{ drugName: 'Paracetamol', dosage: 500 }]),
        metadata: JSON.stringify({ source: 'web' }),
        patient: mockPatient,
        visit: mockVisit,
        doctor: mockDoctor,
        refills: [],
      };

      const updateDto = {
        items: [
          { drugName: 'Updated Paracetamol', dosage: 600 },
        ],
        notes: 'Updated notes',
      };

      const mockUpdatedPrescription = {
        ...mockPrescription,
        notes: updateDto.notes,
      };

      mockPrisma.prescription.findFirst.mockResolvedValue(mockPrescription);
      mockPrisma.prescription.update.mockResolvedValue(mockUpdatedPrescription);

      const result = await service.updatePrescription('prescription-123', updateDto, mockBranchId);

      expect(result).toEqual(mockUpdatedPrescription);
      expect(mockPrisma.prescription.update).toHaveBeenCalledWith({
        where: { id: 'prescription-123' },
        data: expect.objectContaining({
          notes: updateDto.notes,
        }),
        include: expect.any(Object),
      });
    });

    it('should throw BadRequestException if trying to update completed prescription', async () => {
      const mockPrescription = {
        id: 'prescription-123',
        status: PrescriptionStatus.COMPLETED,
        items: JSON.stringify([{ drugName: 'Paracetamol', dosage: 500 }]),
        metadata: JSON.stringify({ source: 'web' }),
        patient: mockPatient,
        visit: mockVisit,
        doctor: mockDoctor,
        refills: [],
      };

      mockPrisma.prescription.findFirst.mockResolvedValue(mockPrescription);

      const updateDto = { notes: 'Updated notes' };

      await expect(service.updatePrescription('prescription-123', updateDto, mockBranchId)).rejects.toThrow(
        new BadRequestException('Cannot update completed prescription'),
      );
    });
  });

  describe('requestRefill', () => {
    it('should request refill successfully', async () => {
      const refillDto = {
        prescriptionId: 'prescription-123',
        reason: 'Patient needs more medication',
        notes: 'Refill requested by patient',
      };

      const mockPrescription = {
        id: 'prescription-123',
        status: PrescriptionStatus.ACTIVE,
        maxRefills: 2,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        refills: [],
        items: JSON.stringify([{ drugName: 'Paracetamol', dosage: 500 }]),
        metadata: JSON.stringify({ source: 'web' }),
        patient: mockPatient,
        visit: mockVisit,
        doctor: mockDoctor,
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

      mockPrisma.prescription.findFirst.mockResolvedValue(mockPrescription);
      mockPrisma.prescriptionRefill.create.mockResolvedValue(mockRefill);

      const result = await service.requestRefill(refillDto, mockBranchId);

      expect(result).toEqual(mockRefill);
      expect(mockPrisma.prescriptionRefill.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          prescriptionId: refillDto.prescriptionId,
          reason: refillDto.reason,
          status: RefillStatus.PENDING,
        }),
        include: expect.any(Object),
      });
    });

    it('should throw BadRequestException if prescription is not active', async () => {
      const refillDto = {
        prescriptionId: 'prescription-123',
        reason: 'Patient needs more medication',
      };

      const mockPrescription = {
        id: 'prescription-123',
        status: PrescriptionStatus.COMPLETED,
        maxRefills: 2,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        refills: [],
        items: JSON.stringify([{ drugName: 'Paracetamol', dosage: 500 }]),
        metadata: JSON.stringify({ source: 'web' }),
        patient: mockPatient,
        visit: mockVisit,
        doctor: mockDoctor,
      };

      mockPrisma.prescription.findFirst.mockResolvedValue(mockPrescription);

      await expect(service.requestRefill(refillDto, mockBranchId)).rejects.toThrow(
        new BadRequestException('Can only request refill for active prescriptions'),
      );
    });

    it('should throw BadRequestException if maximum refills exceeded', async () => {
      const refillDto = {
        prescriptionId: 'prescription-123',
        reason: 'Patient needs more medication',
      };

      const mockPrescription = {
        id: 'prescription-123',
        status: PrescriptionStatus.ACTIVE,
        maxRefills: 1,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        refills: [
          { id: 'refill-1', status: RefillStatus.COMPLETED },
          { id: 'refill-2', status: RefillStatus.APPROVED },
        ],
        items: JSON.stringify([{ drugName: 'Paracetamol', dosage: 500 }]),
        metadata: JSON.stringify({ source: 'web' }),
        patient: mockPatient,
        visit: mockVisit,
        doctor: mockDoctor,
      };

      mockPrisma.prescription.findFirst.mockResolvedValue(mockPrescription);

      await expect(service.requestRefill(refillDto, mockBranchId)).rejects.toThrow(
        new BadRequestException('Maximum refills exceeded'),
      );
    });
  });

  describe('approveRefill', () => {
    it('should approve refill successfully', async () => {
      const approveDto = {
        refillId: 'refill-123',
        notes: 'Approved by doctor',
      };

      const mockRefill = {
        id: 'refill-123',
        prescriptionId: 'prescription-123',
        status: RefillStatus.PENDING,
        prescription: {
          id: 'prescription-123',
          status: PrescriptionStatus.ACTIVE,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      };

      const mockApprovedRefill = {
        ...mockRefill,
        status: RefillStatus.APPROVED,
        approvedAt: new Date(),
        approvedBy: 'doctor-123',
      };

      mockPrisma.prescriptionRefill.findFirst.mockResolvedValue(mockRefill);
      mockPrisma.prescriptionRefill.update.mockResolvedValue(mockApprovedRefill);

      const result = await service.approveRefill(approveDto, mockBranchId, 'doctor-123');

      expect(result).toEqual(mockApprovedRefill);
      expect(mockPrisma.prescriptionRefill.update).toHaveBeenCalledWith({
        where: { id: 'refill-123' },
        data: {
          status: RefillStatus.APPROVED,
          notes: expect.stringContaining('Approved by doctor'),
          approvedAt: expect.any(Date),
          approvedBy: 'doctor-123',
        },
      });
    });

    it('should throw NotFoundException if refill not found', async () => {
      mockPrisma.prescriptionRefill.findFirst.mockResolvedValue(null);

      const approveDto = { refillId: 'refill-123' };

      await expect(service.approveRefill(approveDto, mockBranchId, 'doctor-123')).rejects.toThrow(
        new NotFoundException('Refill request not found'),
      );
    });
  });

  describe('searchDrugs', () => {
    it('should return search results for drugs', async () => {
      const query = {
        query: 'paracetamol',
        isGeneric: true,
        limit: 10,
      };

      const result = await service.searchDrugs(query);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('genericName');
      expect(result[0]).toHaveProperty('category');
    });
  });

  describe('getPrescriptionStatistics', () => {
    it('should return prescription statistics', async () => {
      const query = {
        startDate: '2024-12-01',
        endDate: '2024-12-31',
      };

      const mockStats = {
        totalPrescriptions: 100,
        prescriptionCount: 100,
        drugBreakdown: [
          { items: JSON.stringify([{ drugName: 'Paracetamol' }]), _count: { id: 50 } },
          { items: JSON.stringify([{ drugName: 'Amoxicillin' }]), _count: { id: 30 } },
        ],
        doctorBreakdown: [
          { doctorId: 'doctor-1', _count: { id: 60 } },
          { doctorId: 'doctor-2', _count: { id: 40 } },
        ],
        dailyBreakdown: [
          { createdAt: new Date('2024-12-01'), _count: { id: 5 } },
          { createdAt: new Date('2024-12-02'), _count: { id: 8 } },
        ],
      };

      mockPrisma.prescription.aggregate.mockResolvedValue({ _count: { id: 100 } });
      mockPrisma.prescription.count.mockResolvedValue(100);
      mockPrisma.prescription.groupBy
        .mockResolvedValueOnce(mockStats.drugBreakdown)
        .mockResolvedValueOnce(mockStats.doctorBreakdown)
        .mockResolvedValueOnce(mockStats.dailyBreakdown);

      const result = await service.getPrescriptionStatistics(query, mockBranchId);

      expect(result).toHaveProperty('totalPrescriptions');
      expect(result).toHaveProperty('drugBreakdown');
      expect(result).toHaveProperty('doctorBreakdown');
      expect(result).toHaveProperty('dailyBreakdown');
      expect(result.totalPrescriptions).toBe(100);
    });
  });

  describe('getExpiringPrescriptions', () => {
    it('should return expiring prescriptions', async () => {
      const query = {
        expireBefore: '2024-12-31',
        limit: 50,
      };

      const mockPrescriptions = [
        {
          id: 'prescription-1',
          validUntil: new Date('2024-12-30'),
          status: PrescriptionStatus.ACTIVE,
          patient: { id: 'patient-1', name: 'John Doe' },
          doctor: { id: 'doctor-1', name: 'Dr. Smith' },
          items: JSON.stringify([{ drugName: 'Paracetamol' }]),
          metadata: null,
        },
      ];

      mockPrisma.prescription.findMany.mockResolvedValue(mockPrescriptions);

      const result = await service.getExpiringPrescriptions(query, mockBranchId);

      expect(result).toHaveProperty('prescriptions');
      expect(result).toHaveProperty('totalExpiring');
      expect(result.prescriptions).toHaveLength(1);
      expect(result.prescriptions[0]).toHaveProperty('daysUntilExpiry');
    });
  });

  describe('createPrescriptionTemplate', () => {
    it('should create prescription template successfully', async () => {
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
        items: JSON.stringify(templateDto.items),
        metadata: null,
      };

      mockPrisma.prescriptionTemplate.create.mockResolvedValue(mockTemplate);

      const result = await service.createPrescriptionTemplate(templateDto, mockBranchId, 'doctor-123');

      expect(result).toEqual({
        ...mockTemplate,
        items: templateDto.items,
        metadata: null,
      });
      expect(mockPrisma.prescriptionTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: templateDto.name,
          description: templateDto.description,
          items: JSON.stringify(templateDto.items),
          createdBy: 'doctor-123',
        }),
      });
    });
  });
});
