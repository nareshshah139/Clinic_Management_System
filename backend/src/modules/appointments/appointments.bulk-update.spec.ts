import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException } from '@nestjs/common';

describe('AppointmentsService.bulkUpdate', () => {
  let service: AppointmentsService;
  const branchId = 'branch-1';

  const prismaMock: any = {
    appointment: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
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

  it('throws NotFound if some appointments missing', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([{ id: 'a1' }]);
    await expect(
      service.bulkUpdate({ appointmentIds: ['a1', 'a2'], status: 'SCHEDULED' } as any, branchId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('performs update when all appointments exist', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    prismaMock.appointment.updateMany.mockResolvedValue({ count: 2 });

    const res = await service.bulkUpdate({ appointmentIds: ['a1', 'a2'], status: 'CANCELLED' } as any, branchId);
    expect(res).toEqual({ updated: 2, appointmentIds: ['a1', 'a2'] });
  });
});


