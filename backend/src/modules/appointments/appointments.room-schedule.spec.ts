import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException } from '@nestjs/common';

describe('AppointmentsService.getRoomSchedule', () => {
  let service: AppointmentsService;
  const branchId = 'branch-1';

  const prismaMock: any = {
    room: { findFirst: jest.fn() },
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

  it('throws NotFound if room missing', async () => {
    prismaMock.room.findFirst.mockResolvedValue(null);
    await expect(service.getRoomSchedule('room-1', '2099-01-01', branchId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns room schedule payload when room exists', async () => {
    prismaMock.room.findFirst.mockResolvedValue({ id: 'room-1', name: 'Room A', type: 'OPD' });
    prismaMock.appointment.findMany.mockResolvedValue([{ slot: '10:00-10:30' }]);

    const res = await service.getRoomSchedule('room-1', '2099-01-01', branchId);
    expect(res.roomId).toBe('room-1');
    expect(res.roomName).toBe('Room A');
    expect(res.appointments[0].slot).toBe('10:00-10:30');
  });
});
