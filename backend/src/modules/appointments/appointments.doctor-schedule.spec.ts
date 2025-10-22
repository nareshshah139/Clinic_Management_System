import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException } from '@nestjs/common';

describe('AppointmentsService.getDoctorSchedule', () => {
  let service: AppointmentsService;
  const branchId = 'branch-1';

  const prismaMock: any = {
    user: { findFirst: jest.fn() },
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

  it('throws NotFound if doctor missing', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    await expect(service.getDoctorSchedule('doc-1', '2099-01-01', branchId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns ordered appointments with doctor name', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'doc-1', firstName: 'Do', lastName: 'Ctor' });
    prismaMock.appointment.findMany.mockResolvedValue([
      { slot: '10:00-10:30' },
      { slot: '11:00-11:30' },
    ]);

    const result = await service.getDoctorSchedule('doc-1', '2099-01-01', branchId);
    expect(result.doctorId).toBe('doc-1');
    expect(result.doctorName).toBe('Do Ctor');
    // Ensure the query requested ascending slot order
    expect(prismaMock.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { slot: 'asc' },
      }),
    );
    expect(result.appointments[0].slot).toBe('10:00-10:30');
  });
});


