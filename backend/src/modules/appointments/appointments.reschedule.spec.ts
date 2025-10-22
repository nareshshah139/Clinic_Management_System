import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException, ConflictException } from '@nestjs/common';

describe('AppointmentsService.reschedule', () => {
  let service: AppointmentsService;
  const branchId = 'branch-1';

  const prismaMock: any = {
    appointment: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
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
    prismaMock.appointment.update.mockResolvedValue({ id: 'apt-1' });

    const res = await service.reschedule('apt-1', { date: '2099-01-02', slot: '12:00-12:30' }, branchId);
    expect(res).toEqual({ id: 'apt-1' });
    expect(prismaMock.appointment.update).toHaveBeenCalled();
  });
});


