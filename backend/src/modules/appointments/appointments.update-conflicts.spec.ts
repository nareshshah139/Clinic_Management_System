import { AppointmentsService } from './appointments.service';

const appointment = { id: 'current', doctorId: 'doctor', roomId: 'room-a', date: new Date('2099-01-01T00:00:00Z'), slot: '10:00-10:30', status: 'SCHEDULED' };

it('rejects moving an appointment to an occupied room', async () => {
  const prisma = {
    room: { findFirst: jest.fn().mockResolvedValue({ id: 'room-b' }) },
    appointment: {
      findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'other', slot: '10:15-10:45', patient: { name: 'Other' } }]),
      update: jest.fn(),
    },
  };
  const service = new AppointmentsService(prisma as any);
  jest.spyOn(service, 'findOne').mockResolvedValue(appointment as any);

  await expect(service.update('current', { roomId: 'room-b' }, 'branch')).rejects.toThrow('Scheduling conflict');
  expect(prisma.appointment.update).not.toHaveBeenCalled();
});

it('allows changing notes without rechecking the schedule', async () => {
  const prisma = { appointment: { update: jest.fn().mockResolvedValue({ id: 'current' }), findMany: jest.fn() } };
  const service = new AppointmentsService(prisma as any);
  jest.spyOn(service, 'findOne').mockResolvedValue(appointment as any);

  await service.update('current', { notes: 'Updated' }, 'branch');
  expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  expect(prisma.appointment.update).toHaveBeenCalled();
});

it('checks the schedule before reactivating a cancelled appointment', async () => {
  const prisma = { appointment: {
    findMany: jest.fn().mockResolvedValueOnce([{ id: 'other', slot: '10:00-10:30', patient: { name: 'Other' } }]).mockResolvedValueOnce([]),
    update: jest.fn(),
  } };
  const service = new AppointmentsService(prisma as any);
  jest.spyOn(service, 'findOne').mockResolvedValue({ ...appointment, status: 'CANCELLED' } as any);

  await expect(service.update('current', { status: 'SCHEDULED' }, 'branch')).rejects.toThrow('Scheduling conflict');
  expect(prisma.appointment.update).not.toHaveBeenCalled();
});

it('allows a room change when no conflict exists', async () => {
  const prisma = {
    room: { findFirst: jest.fn().mockResolvedValue({ id: 'room-b' }) },
    appointment: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({ id: 'current' }) },
  };
  const service = new AppointmentsService(prisma as any);
  jest.spyOn(service, 'findOne').mockResolvedValue(appointment as any);

  await service.update('current', { roomId: 'room-b' }, 'branch');
  expect(prisma.appointment.update).toHaveBeenCalled();
  expect(prisma.appointment.findMany.mock.calls[1][0].where).toMatchObject({ roomId: 'room-b', id: { not: 'current' }, branchId: 'branch' });
});
