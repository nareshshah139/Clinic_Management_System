import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AppointmentsService } from '../appointments.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { VisitType, UserRole } from '@prisma/client';

describe('AppointmentsService - Conflicts', () => {
  let service: AppointmentsService;
  let prisma: PrismaService;

  const mockPrisma = {
    patient: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    room: { findFirst: jest.fn() },
    appointment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const branchId = 'branch-xyz';
  const patient = { id: 'patient-1', name: 'Pat One', phone: '9999999999' };
  const doctor = { id: 'doctor-1', firstName: 'Doc', lastName: 'Tor', role: UserRole.DOCTOR } as any;
  const room = { id: 'room-1', name: 'Laser Room', isActive: true };

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5);
  const dateStr = futureDate.toISOString().split('T')[0];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('throws ConflictException when doctor has overlapping appointment', async () => {
    const dto = {
      patientId: patient.id,
      doctorId: doctor.id,
      roomId: room.id,
      date: dateStr,
      slot: '10:00-10:30',
      visitType: VisitType.OPD,
    };

    mockPrisma.patient.findFirst.mockResolvedValue(patient);
    mockPrisma.user.findFirst.mockResolvedValue(doctor);
    mockPrisma.room.findFirst.mockResolvedValue(room);

    // First call (doctor appointments) returns an overlapping slot
    mockPrisma.appointment.findMany.mockResolvedValue([
      { id: 'apt-1', slot: '10:15-10:45', patient: { name: 'Alice' } },
    ]);

    await expect(service.create(dto as any, branchId)).rejects.toThrow(ConflictException);
  });

  it('throws ConflictException when room is booked for same slot', async () => {
    const dto = {
      patientId: patient.id,
      doctorId: doctor.id,
      roomId: room.id,
      date: dateStr,
      slot: '11:00-11:30',
      visitType: VisitType.OPD,
    };

    mockPrisma.patient.findFirst.mockResolvedValue(patient);
    mockPrisma.user.findFirst.mockResolvedValue(doctor);
    mockPrisma.room.findFirst.mockResolvedValue(room);

    // First call (doctor appointments) no conflicts
    mockPrisma.appointment.findMany
      .mockResolvedValueOnce([]) // doctor
      .mockResolvedValueOnce([{ id: 'apt-2', slot: '11:00-11:30', patient: { name: 'Bob' } }]); // room

    await expect(service.create(dto as any, branchId)).rejects.toThrow(ConflictException);
  });

  it('returns suggestions in the ConflictException response payload (service-level)', async () => {
    const dto = {
      patientId: patient.id,
      doctorId: doctor.id,
      roomId: room.id,
      date: dateStr,
      slot: '10:00-10:30',
    };

    mockPrisma.patient.findFirst.mockResolvedValue(patient);
    mockPrisma.user.findFirst.mockResolvedValue(doctor);
    mockPrisma.room.findFirst.mockResolvedValue(room);
    mockPrisma.appointment.findMany.mockResolvedValue([
      { id: 'apt-3', slot: '10:00-10:30', patient: { name: 'Carol' } },
    ]);

    try {
      await service.create(dto as any, branchId);
      fail('Expected ConflictException');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      const response = e.getResponse?.();
      // Depending on Nest, getResponse may be the object we passed
      // We at least assert presence of a suggestions array in payload
      const payload = typeof response === 'object' ? response : {};
      const suggestions = (payload as any)?.suggestions || (payload as any)?.message?.suggestions;
      expect(Array.isArray(suggestions)).toBe(true);
    }
  });
}); 