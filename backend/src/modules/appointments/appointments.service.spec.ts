import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('AppointmentsService.create', () => {
  let service: AppointmentsService;
  const branchId = 'branch-1';

  const prismaMock: any = {
    patient: { findFirst: jest.fn() },
    user: { findFirst: jest.fn(), findUnique: jest.fn() },
    room: { findFirst: jest.fn() },
    appointment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const txMock: any = {
    appointment: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  const notificationsMock: any = {
    sendEmail: jest.fn().mockResolvedValue(undefined),
    sendWhatsApp: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(txMock));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsMock },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
  });

  const buildDto = (overrides: Partial<any> = {}) => ({
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // tomorrow
    slot: '10:00-10:30',
    visitType: 'OPD',
    notes: 'test',
    ...overrides,
  });

  it('throws NotFound when patient not found', async () => {
    prismaMock.patient.findFirst.mockResolvedValue(null);
    prismaMock.user.findFirst.mockResolvedValue({ id: 'doctor-1' });

    await expect(service.create(buildDto(), branchId)).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.patient.findFirst).toHaveBeenCalled();
  });

  it('throws NotFound when doctor not found', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'patient-1' });
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(service.create(buildDto(), branchId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFound when room provided but not found', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'patient-1' });
    prismaMock.user.findFirst.mockResolvedValue({ id: 'doctor-1' });
    prismaMock.room.findFirst.mockResolvedValue(null);

    await expect(service.create(buildDto({ roomId: 'room-1' }), branchId)).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.room.findFirst).toHaveBeenCalled();
  });

  it('throws BadRequest for invalid slot format', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'patient-1' });
    prismaMock.user.findFirst.mockResolvedValue({ id: 'doctor-1' });

    await expect(service.create(buildDto({ slot: '1000-1030' }), branchId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequest when scheduling in the past', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'patient-1' });
    prismaMock.user.findFirst.mockResolvedValue({ id: 'doctor-1' });

    await expect(service.create(buildDto({ date: yesterday }), branchId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws Conflict when scheduling conflicts exist', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'patient-1' });
    prismaMock.user.findFirst.mockResolvedValue({ id: 'doctor-1' });

    jest.spyOn<any, any>(service as any, 'checkSchedulingConflicts').mockResolvedValue([
      { type: 'doctor', message: 'Doctor is already booked', conflictingAppointment: { id: 'a1', patientName: 'P', slot: '10:00-10:30' } },
    ]);
    const altSpy = jest.spyOn<any, any>(service as any, 'getAlternativeSlots').mockResolvedValue(['10:30-11:00']);

    await expect(service.create(buildDto(), branchId)).rejects.toBeInstanceOf(ConflictException);
    expect(altSpy).toHaveBeenCalled();
  });

  it('creates appointment successfully and sends notifications', async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: 'patient-1' });
    prismaMock.user.findFirst.mockResolvedValue({ id: 'doctor-1', firstName: 'Do', lastName: 'Ctor', metadata: '{}' });
    prismaMock.room.findFirst.mockResolvedValue({ id: 'room-1', isActive: true });
    jest.spyOn<any, any>(service as any, 'checkSchedulingConflicts').mockResolvedValue([]);

    // Transaction mocks
    txMock.appointment.findFirst.mockResolvedValue({ tokenNumber: 5 });
    txMock.appointment.create.mockResolvedValue({
      id: 'apt-1',
      tokenNumber: 6,
      patient: { id: 'patient-1', name: 'Pat', phone: '9999999999', email: 'p@example.com' },
      doctor: { id: 'doctor-1', firstName: 'Do', lastName: 'Ctor', email: 'd@example.com' },
      room: { id: 'room-1', name: 'Room A', type: 'OPD' },
    });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'doctor-1', metadata: '{}' });

    const dto = buildDto({ roomId: 'room-1' });
    const result = await service.create(dto, branchId);

    expect(result).toBeTruthy();
    expect(txMock.appointment.create).toHaveBeenCalled();
    expect(notificationsMock.sendEmail).toHaveBeenCalledTimes(1);
  });
});


