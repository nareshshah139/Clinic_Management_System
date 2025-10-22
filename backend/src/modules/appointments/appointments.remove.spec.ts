import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException } from '@nestjs/common';

describe('AppointmentsService.remove', () => {
  let service: AppointmentsService;
  const branchId = 'branch-1';

  const prismaMock: any = {
    appointment: {
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

  it('rejects cancelling completed appointment', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'a1', status: 'COMPLETED' } as any);
    await expect(service.remove('a1', branchId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects cancelling in-progress appointment', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'a1', status: 'IN_PROGRESS' } as any);
    await expect(service.remove('a1', branchId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cancels scheduled appointment', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'a1', status: 'SCHEDULED' } as any);
    prismaMock.appointment.update.mockResolvedValue({ id: 'a1', status: 'CANCELLED' });

    const res = await service.remove('a1', branchId);
    expect(prismaMock.appointment.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { status: 'CANCELLED' },
    });
    expect(res).toEqual({ message: 'Appointment cancelled successfully' });
  });
});


