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

  const cancelledRows = (count: number) => prismaMock.appointment.updateMany.mockResolvedValue({ count });

  it('rejects cancelling completed appointment', async () => {
    cancelledRows(0);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'a1', status: 'COMPLETED' } as any);
    await expect(service.remove('a1', branchId)).rejects.toThrow('Cannot cancel completed appointment');
  });

  it('rejects cancelling in-progress appointment', async () => {
    cancelledRows(0);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'a1', status: 'IN_PROGRESS' } as any);
    await expect(service.remove('a1', branchId)).rejects.toThrow('Cannot cancel appointment in progress');
  });

  it('cancels with a compare-and-set that skips completed, in-progress and cancelled appointments', async () => {
    cancelledRows(1);

    const res = await service.remove('a1', branchId);
    expect(prismaMock.appointment.updateMany).toHaveBeenCalledWith({
      where: { id: 'a1', branchId, status: { notIn: ['COMPLETED', 'IN_PROGRESS', 'CANCELLED'] } },
      data: { status: 'CANCELLED' },
    });
    expect(res).toEqual({ message: 'Appointment cancelled successfully' });
  });

  it('returns success message if appointment is already cancelled', async () => {
    cancelledRows(0);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'a1', status: 'CANCELLED' } as any);

    const res = await service.remove('a1', branchId);
    expect(res).toEqual({ message: 'Appointment is already cancelled' });
  });

  it('reports a visit that started after the read as in progress', async () => {
    cancelledRows(0);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'a1', status: 'IN_PROGRESS' } as any);
    await expect(service.remove('a1', branchId)).rejects.toBeInstanceOf(BadRequestException);
  });
});
