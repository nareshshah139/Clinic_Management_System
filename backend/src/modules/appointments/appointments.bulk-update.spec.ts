import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('AppointmentsService.bulkUpdate', () => {
  let service: AppointmentsService;
  const branchId = 'branch-1';

  const prismaMock: any = {
    appointment: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((work: (tx: unknown) => unknown) => work(prismaMock)),
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
      service.bulkUpdate({ appointmentIds: ['a1', 'a2'], status: 'CANCELLED' } as any, branchId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('performs update when all appointments exist', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    prismaMock.appointment.updateMany.mockResolvedValue({ count: 2 });

    const res = await service.bulkUpdate({ appointmentIds: ['a1', 'a2'], status: 'CANCELLED' } as any, branchId);
    expect(res).toEqual({ updated: 2, appointmentIds: ['a1', 'a2'] });
  });

  it.each([
    ['sets an appointment completed', 'CHECKED_IN', 'COMPLETED'],
    ['changes an appointment whose visit has started', 'IN_PROGRESS', 'CANCELLED'],
    ['checks in a cancelled appointment', 'CANCELLED', 'CHECKED_IN'],
  ])('refuses a bulk update that %s', async (_case, from, to) => {
    prismaMock.appointment.findMany.mockResolvedValue([{ id: 'a1', status: 'CHECKED_IN' }, { id: 'a2', status: from }]);
    await expect(
      service.bulkUpdate({ appointmentIds: ['a1', 'a2'], status: to } as any, branchId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.appointment.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['CONFIRMED', 'CHECKED_IN'],
    ['CHECKED_IN', 'NO_SHOW'],
    ['SCHEDULED', 'CANCELLED'],
    ['CONFIRMED', 'CANCELLED'],
    ['NO_SHOW', 'CANCELLED'],
  ])('moves %s rows to %s in one write, because no row enters a calendar', async (from, to) => {
    prismaMock.appointment.findMany.mockResolvedValue([{ id: 'a1', status: from }, { id: 'a2', status: from }]);
    prismaMock.appointment.updateMany.mockResolvedValue({ count: 2 });
    await expect(
      service.bulkUpdate({ appointmentIds: ['a1', 'a2'], status: to } as any, branchId),
    ).resolves.toEqual({ updated: 2, appointmentIds: ['a1', 'a2'] });
    expect(prismaMock.appointment.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.appointment.updateMany.mock.calls[0][0].where).toEqual({
      branchId,
      OR: [{ id: 'a1', status: from }, { id: 'a2', status: from }],
    });
  });
});


