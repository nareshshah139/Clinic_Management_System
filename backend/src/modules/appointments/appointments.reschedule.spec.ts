import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException, ConflictException } from '@nestjs/common';

describe('AppointmentsService.reschedule', () => {
  let service: AppointmentsService;
  const branchId = 'branch-1';

  const prismaMock: any = {
    doctorWorkingHours: { findMany: jest.fn().mockResolvedValue([]) },
    doctorTimeOff: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    appointment: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(async (cb: any) => cb(prismaMock)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: { sendEmail: jest.fn(), sendWhatsApp: jest.fn() } },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
  });

  const existing = (overrides: Partial<any> = {}) => ({
    id: 'apt-1',
    doctorId: 'doc-1',
    roomId: 'room-1',
    date: new Date('2099-01-01T10:00:00.000Z'),
    slot: '09:00-09:30',
    status: 'SCHEDULED',
    notes: 'n',
    ...overrides,
  });

  it('rejects when cannot reschedule due to status/time', async () => {
    prismaMock.appointment.findFirst.mockResolvedValue(existing({ status: 'COMPLETED' }));
    await expect(
      service.reschedule('apt-1', { date: '2099-01-02', slot: '10:00-10:30' }, branchId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws Conflict when new slot conflicts', async () => {
    prismaMock.appointment.findFirst.mockResolvedValue(existing());
    jest.spyOn<any, any>(service as any, 'checkSchedulingConflicts').mockResolvedValue([
      { type: 'doctor', message: 'Overlap' },
    ]);
    jest.spyOn<any, any>(service as any, 'getAlternativeSlots').mockResolvedValue(['11:00-11:30']);

    await expect(
      service.reschedule('apt-1', { date: '2099-01-02', slot: '10:00-10:30' }, branchId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates appointment on success', async () => {
    prismaMock.appointment.findFirst.mockResolvedValue(existing());
    jest.spyOn<any, any>(service as any, 'checkSchedulingConflicts').mockResolvedValue([]);
    prismaMock.appointment.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.appointment.findUniqueOrThrow.mockResolvedValue({ id: 'apt-1' });

    const res = await service.reschedule('apt-1', { date: '2099-01-02', slot: '12:00-12:30' }, branchId);
    expect(res).toEqual({ id: 'apt-1' });
    expect(prismaMock.appointment.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe('AppointmentsService.reschedule into the past', () => {
  const DAY = '2099-05-04';
  const NOW = new Date('2099-05-04T04:46:00.000Z');

  const build = (current: { status: string; slot: string }) => {
    const store = { id: 'apt-1', doctorId: 'doc-1', roomId: null, date: new Date(`${DAY}T00:00:00.000Z`), notes: null, tokenNumber: 1, ...current };
    const db: any = {
      $executeRaw: jest.fn(),
      user: { findUnique: jest.fn().mockResolvedValue({ maxBookingsPerSlot: 1 }) },
      doctorTimeOff: { findMany: jest.fn().mockResolvedValue([]) },
      doctorWorkingHours: { findMany: jest.fn().mockResolvedValue([]) },
      appointment: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(async () => ({ ...store })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn(async () => ({ ...store })),
      },
      $transaction: jest.fn(async (cb: any) => cb(db)),
    };
    return { service: new AppointmentsService(db), db };
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('refuses a move to a slot that started at 10:00 IST when it is 10:16 IST', async () => {
    const { service, db } = build({ status: 'SCHEDULED', slot: '12:00-12:30' });

    await expect(service.reschedule('apt-1', { date: DAY, slot: '10:00-10:30' }, 'branch-1')).rejects.toThrow(
      new BadRequestException('Cannot move an appointment to a time that has already started'),
    );
    expect(db.appointment.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a move to an earlier day', async () => {
    const { service, db } = build({ status: 'SCHEDULED', slot: '12:00-12:30' });

    await expect(service.reschedule('apt-1', { date: '2099-05-03', slot: '15:00-15:30' }, 'branch-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.appointment.updateMany).not.toHaveBeenCalled();
  });

  it('still confirms an appointment whose slot has started, without changing its time', async () => {
    const { service, db } = build({ status: 'SCHEDULED', slot: '10:00-10:30' });

    await service.reschedule('apt-1', { date: DAY, slot: '10:00-10:30', calendar: 'CONFIRMED' }, 'branch-1');

    expect(db.appointment.updateMany).toHaveBeenCalledTimes(1);
  });

  it('moves an appointment to a later slot', async () => {
    const { service, db } = build({ status: 'SCHEDULED', slot: '12:00-12:30' });

    await service.reschedule('apt-1', { date: DAY, slot: '10:30-11:00' }, 'branch-1');

    expect(db.appointment.updateMany).toHaveBeenCalledTimes(1);
  });
});

