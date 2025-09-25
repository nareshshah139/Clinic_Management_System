import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { AppointmentsService } from '../appointments.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { AppointmentStatus, VisitType, UserRole } from '@prisma/client';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prisma: PrismaService;

  const mockPrisma = {
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
    role: UserRole.DOCTOR,
  };
  const mockRoom = {
    id: 'room-123',
    name: 'Room 1',
    type: 'Consultation',
    isActive: true,
  };

  // Use future date for tests
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7); // 7 days from now
  const futureDateString = futureDate.toISOString().split('T')[0];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
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

    it('should create an appointment successfully', async () => {
      const mockAppointment = {
        id: 'appointment-123',
        ...createAppointmentDto,
        date: new Date(createAppointmentDto.date),
        tokenNumber: 1,
        patient: mockPatient,
        doctor: mockDoctor,
        room: mockRoom,
      };

      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.user.findFirst.mockResolvedValue(mockDoctor);
      mockPrisma.room.findFirst.mockResolvedValue(mockRoom);
      mockPrisma.appointment.findMany.mockResolvedValue([]); // No conflicts
      mockPrisma.appointment.findFirst.mockResolvedValue(null); // No existing appointments for token
      mockPrisma.appointment.create.mockResolvedValue(mockAppointment);

      const result = await service.create(createAppointmentDto, mockBranchId);

      expect(result).toEqual(mockAppointment);
      expect(mockPrisma.patient.findFirst).toHaveBeenCalledWith({
        where: { id: createAppointmentDto.patientId, branchId: mockBranchId },
      });
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: createAppointmentDto.doctorId, branchId: mockBranchId, role: 'DOCTOR' },
      });
      expect(mockPrisma.room.findFirst).toHaveBeenCalledWith({
        where: { id: createAppointmentDto.roomId, branchId: mockBranchId, isActive: true },
      });
    });

    it('should throw NotFoundException if patient not found', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      await expect(service.create(createAppointmentDto, mockBranchId)).rejects.toThrow(
        new NotFoundException('Patient not found in this branch'),
      );
    });

    it('should throw NotFoundException if doctor not found', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.create(createAppointmentDto, mockBranchId)).rejects.toThrow(
        new NotFoundException('Doctor not found in this branch'),
      );
    });

    it('should throw NotFoundException if room not found', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.user.findFirst.mockResolvedValue(mockDoctor);
      mockPrisma.room.findFirst.mockResolvedValue(null);

      await expect(service.create(createAppointmentDto, mockBranchId)).rejects.toThrow(
        new NotFoundException('Room not found or inactive'),
      );
    });

    it('should throw BadRequestException for invalid time slot', async () => {
      const invalidDto = { ...createAppointmentDto, slot: 'invalid-slot' };

      await expect(service.create(invalidDto, mockBranchId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for past date', async () => {
      const pastDto = { ...createAppointmentDto, date: '2020-01-01' };

      await expect(service.create(pastDto, mockBranchId)).rejects.toThrow(
        new BadRequestException('Cannot schedule appointment in the past'),
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated appointments', async () => {
      const mockAppointments = [
        {
          id: 'appointment-1',
          patient: mockPatient,
          doctor: mockDoctor,
          room: mockRoom,
        },
      ];

      mockPrisma.appointment.findMany.mockResolvedValue(mockAppointments);
      mockPrisma.appointment.count.mockResolvedValue(1);

      const query = { page: 1, limit: 20 };
      const result = await service.findAll(query, mockBranchId);

      expect(result).toEqual({
        appointments: mockAppointments,
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
        doctorId: 'doctor-123',
        status: AppointmentStatus.SCHEDULED,
        date: futureDateString,
      };

      mockPrisma.appointment.findMany.mockResolvedValue([]);
      mockPrisma.appointment.count.mockResolvedValue(0);

      await service.findAll(query, mockBranchId);

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          branchId: mockBranchId,
          doctorId: 'doctor-123',
          status: AppointmentStatus.SCHEDULED,
          date: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
        include: expect.any(Object),
        skip: 0,
        take: 20,
        orderBy: { date: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return appointment by id', async () => {
      const mockAppointment = {
        id: 'appointment-123',
        patient: mockPatient,
        doctor: mockDoctor,
        room: mockRoom,
      };

      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);

      const result = await service.findOne('appointment-123', mockBranchId);

      expect(result).toEqual(mockAppointment);
      expect(mockPrisma.appointment.findFirst).toHaveBeenCalledWith({
        where: { id: 'appointment-123', branchId: mockBranchId },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if appointment not found', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(null);

      await expect(service.findOne('appointment-123', mockBranchId)).rejects.toThrow(
        new NotFoundException('Appointment not found'),
      );
    });
  });

  describe('getDoctorSchedule', () => {
    it('should include patient, room, and visit details', async () => {
      const mockAppointments = [
        {
          id: 'appointment-1',
          slot: '10:00-10:30',
          patient: mockPatient,
          room: mockRoom,
          visit: { id: 'visit-1', status: 'IN_PROGRESS' },
        },
      ];

      mockPrisma.user.findFirst.mockResolvedValue(mockDoctor);
      mockPrisma.appointment.findMany.mockResolvedValue(mockAppointments);

      const result = await service.getDoctorSchedule(mockDoctor.id, futureDateString, mockBranchId);

      expect(result).toEqual({
        doctorId: mockDoctor.id,
        doctorName: `${mockDoctor.firstName} ${mockDoctor.lastName}`,
        date: futureDateString,
        appointments: mockAppointments,
      });

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith({
        where: {
          doctorId: mockDoctor.id,
          date: {
            gte: new Date(`${futureDateString}T00:00:00.000Z`),
            lte: new Date(`${futureDateString}T23:59:59.999Z`),
          },
          branchId: mockBranchId,
        },
        include: {
          patient: {
            select: { id: true, name: true, phone: true },
          },
          room: {
            select: { id: true, name: true, type: true },
          },
          visit: {
            select: { id: true, status: true },
          },
        },
        orderBy: {
          slot: 'asc',
        },
      });
    });

    it('should throw NotFoundException if doctor not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.getDoctorSchedule(mockDoctor.id, futureDateString, mockBranchId),
      ).rejects.toThrow(new NotFoundException('Doctor not found in this branch'));
    });
  });

  describe('getRoomSchedule', () => {
    it('should include patient, doctor, and visit details', async () => {
      const mockAppointments = [
        {
          id: 'appointment-1',
          slot: '10:00-10:30',
          patient: mockPatient,
          doctor: mockDoctor,
          visit: { id: 'visit-1', status: 'COMPLETED' },
        },
      ];

      mockPrisma.room.findFirst.mockResolvedValue(mockRoom);
      mockPrisma.appointment.findMany.mockResolvedValue(mockAppointments);

      const result = await service.getRoomSchedule(mockRoom.id, futureDateString, mockBranchId);

      expect(result).toEqual({
        roomId: mockRoom.id,
        roomName: mockRoom.name,
        roomType: mockRoom.type,
        date: futureDateString,
        appointments: mockAppointments,
      });

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith({
        where: {
          roomId: mockRoom.id,
          date: {
            gte: new Date(`${futureDateString}T00:00:00.000Z`),
            lte: new Date(`${futureDateString}T23:59:59.999Z`),
          },
          branchId: mockBranchId,
        },
        include: {
          patient: {
            select: { id: true, name: true, phone: true },
          },
          doctor: {
            select: { id: true, firstName: true, lastName: true },
          },
          visit: {
            select: { id: true, status: true },
          },
        },
        orderBy: {
          slot: 'asc',
        },
      });
    });

    it('should throw NotFoundException if room not found', async () => {
      mockPrisma.room.findFirst.mockResolvedValue(null);

      await expect(
        service.getRoomSchedule(mockRoom.id, futureDateString, mockBranchId),
      ).rejects.toThrow(new NotFoundException('Room not found or inactive'));
    });
  });

  describe('getAvailableSlots', () => {
    it('should return available slots', async () => {
      const query = {
        doctorId: 'doctor-123',
        date: futureDateString,
        durationMinutes: 30,
      };

      mockPrisma.user.findFirst.mockResolvedValue(mockDoctor);
      mockPrisma.appointment.findMany.mockResolvedValue([
        { slot: '10:00-10:30' },
        { slot: '11:00-11:30' },
      ]);

      const result = await service.getAvailableSlots(query, mockBranchId);

      expect(result).toHaveProperty('availableSlots');
      expect(result).toHaveProperty('bookedSlots');
      expect(result.bookedSlots).toContain('10:00-10:30');
      expect(result.bookedSlots).toContain('11:00-11:30');
    });

    it('should throw NotFoundException if doctor not found', async () => {
      const query = {
        doctorId: 'doctor-123',
        date: futureDateString,
      };

      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.getAvailableSlots(query, mockBranchId)).rejects.toThrow(
        new NotFoundException('Doctor not found in this branch'),
      );
    });
  });

  describe('reschedule', () => {
    const rescheduleDto = {
      date: futureDateString,
      slot: '14:00-14:30',
      notes: 'Rescheduled appointment',
    };

    it('should reschedule appointment successfully', async () => {
      // Use a future date that's more than 24 hours away
      const futureAppointmentDate = new Date();
      futureAppointmentDate.setDate(futureAppointmentDate.getDate() + 2); // 2 days from now

      const mockAppointment = {
        id: 'appointment-123',
        date: futureAppointmentDate,
        status: AppointmentStatus.SCHEDULED,
        doctorId: 'doctor-123',
        roomId: 'room-123',
      };

      const mockRescheduledAppointment = {
        ...mockAppointment,
        date: new Date(rescheduleDto.date),
        slot: rescheduleDto.slot,
        notes: rescheduleDto.notes,
        patient: mockPatient,
        doctor: mockDoctor,
        room: mockRoom,
      };

      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.appointment.findMany.mockResolvedValue([]); // No conflicts
      mockPrisma.appointment.update.mockResolvedValue(mockRescheduledAppointment);

      const result = await service.reschedule('appointment-123', rescheduleDto, mockBranchId);

      expect(result).toEqual(mockRescheduledAppointment);
      expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appointment-123' },
        data: expect.objectContaining({
          date: new Date(rescheduleDto.date),
          slot: rescheduleDto.slot,
          status: AppointmentStatus.SCHEDULED,
        }),
        include: expect.any(Object),
      });
    });

    it('should throw BadRequestException if appointment cannot be rescheduled', async () => {
      const mockAppointment = {
        id: 'appointment-123',
        date: new Date(futureDateString),
        status: AppointmentStatus.COMPLETED,
      };

      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);

      await expect(
        service.reschedule('appointment-123', rescheduleDto, mockBranchId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should cancel appointment successfully', async () => {
      const mockAppointment = {
        id: 'appointment-123',
        status: AppointmentStatus.SCHEDULED,
      };

      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.appointment.update.mockResolvedValue({
        ...mockAppointment,
        status: AppointmentStatus.CANCELLED,
      });

      const result = await service.remove('appointment-123', mockBranchId);

      expect(result).toEqual({ message: 'Appointment cancelled successfully' });
      expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appointment-123' },
        data: { status: AppointmentStatus.CANCELLED },
      });
    });

    it('should throw BadRequestException if appointment is completed', async () => {
      const mockAppointment = {
        id: 'appointment-123',
        status: AppointmentStatus.COMPLETED,
      };

      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);

      await expect(service.remove('appointment-123', mockBranchId)).rejects.toThrow(
        new BadRequestException('Cannot cancel completed appointment'),
      );
    });
  });
});
