import { ConflictException } from '@nestjs/common';
import { bookReviewAppointment } from '../review-booking';
import { VisitsService } from '../visits.service';

const NOW = new Date('2026-11-14T06:00:00.000Z');
const visit = { patientId: 'p1', doctorId: 'd1', appointmentId: 'a0', followUp: new Date('2026-11-21T00:00:00.000Z') };
const bookedRow = (slot: string) => ({ id: 'new', date: new Date('2026-11-21T00:00:00.000Z'), slot, doctor: { firstName: 'Shravya', lastName: 'Rao' } });

function setup(slots: string[], existing: any = null) {
  const prisma = { appointment: { findFirst: jest.fn().mockResolvedValue(existing) } };
  const appointments = {
    getAvailableSlots: jest.fn().mockResolvedValue({ availableSlots: slots }),
    create: jest.fn(async (dto: any) => bookedRow(dto.slot)),
  };
  return { prisma, appointments, run: (v: any = visit) => bookReviewAppointment({ prisma, appointments }, v, 'branch', 'user', NOW) };
}

it('books the first free SCHEDULED slot for the visit doctor on the review day', async () => {
  const t = setup(['10:30-11:00', '11:00-11:30']);
  expect(await t.run()).toEqual({ status: 'booked', appointment: { id: 'new', date: '2026-11-21', slot: '10:30-11:00', doctorName: 'Shravya Rao' } });
  expect(t.appointments.getAvailableSlots).toHaveBeenCalledWith({ doctorId: 'd1', date: '2026-11-21', calendar: 'SCHEDULED' }, 'branch');
  expect(t.appointments.create).toHaveBeenCalledTimes(1);
  expect(t.appointments.create).toHaveBeenCalledWith(
    expect.objectContaining({ patientId: 'p1', doctorId: 'd1', date: '2026-11-21', slot: '10:30-11:00', visitType: 'OPD', source: 'review', calendar: 'SCHEDULED', notes: 'Review after visit on 2026-11-14' }),
    'branch', 'user',
  );
});

it('returns existing and creates nothing when the patient already has a live appointment that day', async () => {
  const t = setup(['10:30-11:00'], { id: 'old', date: new Date('2026-11-21T00:00:00.000Z'), slot: '09:00-09:30', doctor: { firstName: 'Shravya', lastName: 'Rao' } });
  expect(await t.run()).toEqual({ status: 'existing', appointment: { id: 'old', date: '2026-11-21', slot: '09:00-09:30', doctorName: 'Shravya Rao' } });
  expect(t.appointments.create).not.toHaveBeenCalled();
  const where = t.prisma.appointment.findFirst.mock.calls[0][0].where;
  expect(where.status).toEqual({ notIn: ['CANCELLED', 'NO_SHOW'] });
  expect(where.id).toEqual({ not: 'a0' });
});

it('returns full with the date when no slot is free', async () => {
  const t = setup([]);
  expect(await t.run()).toEqual({ status: 'full', date: '2026-11-21' });
  expect(t.appointments.create).not.toHaveBeenCalled();
});

it('books the second slot when the first is taken by a race', async () => {
  const t = setup(['10:30-11:00', '11:00-11:30']);
  t.appointments.create.mockRejectedValueOnce(new ConflictException('Scheduling conflict detected'));
  expect(await t.run()).toMatchObject({ status: 'booked', appointment: { slot: '11:00-11:30' } });
  expect(t.appointments.create).toHaveBeenCalledTimes(2);
});

it('reports full after three conflicting slots', async () => {
  const t = setup(['a', 'b', 'c', 'd']);
  t.appointments.create.mockRejectedValue(new ConflictException('Scheduling conflict detected'));
  expect(await t.run()).toEqual({ status: 'full', date: '2026-11-21' });
  expect(t.appointments.create).toHaveBeenCalledTimes(3);
});

it('skips a past review day and a visit without a review date or doctor', async () => {
  const t = setup(['10:30-11:00']);
  expect(await t.run({ ...visit, followUp: new Date('2026-11-13T00:00:00.000Z') })).toEqual({ status: 'skipped', reason: 'past-date' });
  expect(await t.run({ ...visit, followUp: null })).toEqual({ status: 'skipped', reason: 'no-review-date' });
  expect(await t.run({ ...visit, doctorId: null })).toEqual({ status: 'skipped', reason: 'no-review-date' });
  expect(t.appointments.create).not.toHaveBeenCalled();
});

it('still books a review dated today', async () => {
  const t = setup(['16:00-16:30']);
  expect(await t.run({ ...visit, followUp: new Date('2026-11-14T00:00:00.000Z') })).toMatchObject({ status: 'booked' });
});

it('returns failed on an unexpected error', async () => {
  const t = setup(['10:30-11:00']);
  t.appointments.create.mockRejectedValue(new Error('db down'));
  expect(await t.run()).toEqual({ status: 'failed' });
});

describe('VisitsService.complete', () => {
  function service(appointments: any) {
    const stored: any = { id: 'v', patientId: 'p1', doctorId: 'd1', appointmentId: null, status: 'IN_PROGRESS', version: 1, plan: '{}', followUp: null };
    const db: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(async (fn: any) => fn(db)),
      visit: {
        findFirst: jest.fn(async () => stored),
        update: jest.fn(async ({ data }: any) => Object.assign(stored, data)),
      },
      appointment: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
    };
    return { svc: new VisitsService(db, appointments), db };
  }

  it('returns the COMPLETED visit with a failed review when booking throws', async () => {
    const { svc } = service({ getAvailableSlots: jest.fn().mockRejectedValue(new Error('boom')), create: jest.fn() });
    const result = await svc.complete('v', { followUpDate: '2099-11-21' }, 'branch', 'user');
    expect(result).toMatchObject({ status: 'COMPLETED', reviewAppointment: { status: 'failed' } });
  });

  it('runs again on a repeated completion and finds the earlier booking', async () => {
    const existing = { id: 'r1', date: new Date('2099-11-21T00:00:00.000Z'), slot: '10:30-11:00', doctor: { firstName: 'Shravya', lastName: 'Rao' } };
    const appointments = { getAvailableSlots: jest.fn().mockResolvedValue({ availableSlots: ['10:30-11:00'] }), create: jest.fn(async () => existing) };
    const { svc, db } = service(appointments);
    const first = await svc.complete('v', { followUpDate: '2099-11-21' }, 'branch');
    expect(first.reviewAppointment.status).toBe('booked');
    db.appointment.findFirst.mockResolvedValue(existing);
    const second = await svc.complete('v', { followUpDate: '2099-11-21' }, 'branch');
    expect(second.reviewAppointment).toMatchObject({ status: 'existing' });
    expect(appointments.create).toHaveBeenCalledTimes(1);
  });
});
