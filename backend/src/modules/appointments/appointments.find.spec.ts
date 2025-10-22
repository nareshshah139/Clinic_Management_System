import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException } from '@nestjs/common';

describe('AppointmentsService.findOne/findAll', () => {
  let service: AppointmentsService;
  const branchId = 'branch-1';

  const prismaMock: any = {
    appointment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
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

  it('findOne throws NotFound when missing', async () => {
    prismaMock.appointment.findFirst.mockResolvedValue(null);
    await expect(service.findOne('a1', branchId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findOne returns appointment when present', async () => {
    prismaMock.appointment.findFirst.mockResolvedValue({ id: 'a1' });
    const res = await service.findOne('a1', branchId);
    expect(res).toEqual({ id: 'a1' });
  });

  it('findAll returns paginated result', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([{ id: 'a1' }]);
    prismaMock.appointment.count.mockResolvedValue(1);

    const res = await service.findAll({ page: 1, limit: 10 } as any, branchId);
    expect(res.pagination.total).toBe(1);
    expect(res.appointments.length).toBe(1);
  });
});
