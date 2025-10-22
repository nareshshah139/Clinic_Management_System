import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('AppointmentsService - conflict helpers', () => {
  let service: any; // access private helpers via bracket indexing
  const branchId = 'branch-1';

  const prismaMock: any = {
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

    service = module.get<AppointmentsService>(AppointmentsService) as any;
  });

  it('detects doctor overlap conflict', async () => {
    prismaMock.appointment.findMany.mockResolvedValueOnce([
      { id: 'apt-1', slot: '10:00-10:30', patient: { name: 'Alice' } },
    ]);

    const conflicts = await service['checkSchedulingConflicts']('doc-1', null, '2099-01-01', '10:15-10:45', branchId);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('doctor');
  });

  it('detects room overlap conflict', async () => {
    // First call: doctor appointments
    prismaMock.appointment.findMany.mockResolvedValueOnce([]);
    // Second call: room appointments
    prismaMock.appointment.findMany.mockResolvedValueOnce([
      { id: 'apt-2', slot: '11:00-11:30', patient: { name: 'Bob' } },
    ]);

    const conflicts = await service['checkSchedulingConflicts']('doc-1', 'room-1', '2099-01-01', '11:00-11:30', branchId);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('room');
  });

  it('suggests alternative slots', async () => {
    // getBookedSlots → returns combined unique slots
    prismaMock.appointment.findMany.mockResolvedValueOnce([
      { slot: '10:00-10:30' },
      { slot: '10:30-11:00' },
    ]);

    const suggestions = await service['getAlternativeSlots']('doc-1', null, '2099-01-01', '10:00-10:30', branchId);
    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
  });
});


