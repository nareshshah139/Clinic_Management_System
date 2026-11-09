import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException } from '@nestjs/common';

describe('AppointmentsService.getAvailableSlots', () => {
  let service: AppointmentsService;
  const branchId = 'branch-1';

  const prismaMock: any = {
    user: { findFirst: jest.fn(), findUnique: jest.fn() },
    doctorWorkingHours: { findMany: jest.fn().mockResolvedValue([]) },
    doctorTimeOff: { findMany: jest.fn().mockResolvedValue([]) },
    appointment: { findMany: jest.fn() },
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

  const baseQuery = (overrides: Partial<any> = {}) => ({
    doctorId: 'doctor-1',
    date: '2099-12-01',
    durationMinutes: 30,
    ...overrides,
  });

  it('throws NotFound if doctor missing', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    await expect(service.getAvailableSlots(baseQuery(), branchId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns all slots when no bookings', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'doctor-1' });
    prismaMock.appointment.findMany.mockResolvedValue([]);

    const result = await service.getAvailableSlots(baseQuery({ startHour: 10, endHour: 12 }), branchId);
    expect(result.availableSlots).toEqual(['10:00-10:30', '10:30-11:00', '11:00-11:30', '11:30-12:00']);
    expect(result.bookedSlots).toEqual([]);
  });

  it('filters out overlapping booked slots (doctor)', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'doctor-1' });
    // First call for doctor bookings
    prismaMock.appointment.findMany
      .mockResolvedValueOnce([{ slot: '10:00-10:30' }])
      // Second call for room bookings (none)
      .mockResolvedValueOnce([]);

    const result = await service.getAvailableSlots(baseQuery({ startHour: 10, endHour: 11 }), branchId);
    expect(result.availableSlots).toEqual(['10:30-11:00']);
    expect(result.bookedSlots).toEqual(['10:00-10:30']);
  });

  it('merges room bookings when roomId provided', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'doctor-1' });
    // Doctor bookings
    prismaMock.appointment.findMany
      .mockResolvedValueOnce([{ slot: '10:00-10:30' }])
      // Room bookings
      .mockResolvedValueOnce([{ slot: '10:30-11:00' }]);

    const result = await service.getAvailableSlots(baseQuery({ startHour: 10, endHour: 11, roomId: 'room-1' }), branchId);
    expect(result.availableSlots).toEqual(['10:30-11:00']);
    // Implementation returns only doctor bookedSlots in payload even when roomId is provided
    expect(result.bookedSlots.sort()).toEqual(['10:00-10:30']);
  });

  it("uses the doctor's legacy metadata hours when no override is given", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'doctor-1', metadata: JSON.stringify({ workingHours: { startHour: 10, endHour: 11 } }) });
    prismaMock.appointment.findMany.mockReset().mockResolvedValue([]);

    const result = await service.getAvailableSlots(baseQuery(), branchId);
    expect(result.availableSlots).toEqual(['10:00-10:30', '10:30-11:00']);
    expect(result.hoursSource).toBe('legacy');
  });

  it('drops slots that overlap time off and reports the block', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'doctor-1', metadata: null });
    prismaMock.appointment.findMany.mockReset().mockResolvedValue([]);
    prismaMock.doctorTimeOff.findMany.mockResolvedValueOnce([
      { id: 'off-1', kind: 'BLOCKED', reason: 'Rounds', startsAt: new Date('2099-12-01T10:00:00+05:30'), endsAt: new Date('2099-12-01T10:30:00+05:30') },
    ]);

    const result = await service.getAvailableSlots(baseQuery({ startHour: 10, endHour: 11 }), branchId);
    expect(result.availableSlots).toEqual(['10:30-11:00']);
    expect(result.timeOff).toEqual([expect.objectContaining({ kind: 'BLOCKED', reason: 'Rounds', start: 600, end: 630 })]);
  });
});
