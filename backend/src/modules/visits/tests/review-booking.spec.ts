import { ConflictException } from '@nestjs/common';
import { ReviewBookingService } from '../review-booking';
import { VisitsController } from '../visits.controller';
import { VisitsService } from '../visits.service';

jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }));

type Row = { id: string; patientId: string; doctorId: string; date: Date; slot: string; status: string; reviewOfVisitId: string | null; createdAt: number };
type Seed = Omit<Partial<Row>, 'date'> & { date?: string };

const DOCTORS: Record<string, { firstName: string; lastName: string }> = {
  d1: { firstName: 'Shravya', lastName: 'Rao' },
  d2: { firstName: 'Praneeta', lastName: 'Jain' },
};

function setup({ followUp = '2099-11-17', slots = ['09:00-09:30', '09:30-10:00'], taken = [] as string[], rows = [] as Seed[] } = {}) {
  let clock = 0;
  let store: Row[] = rows.map((row, i) => ({ id: `old-${i}`, patientId: 'p1', doctorId: 'd1', slot: '09:00-09:30', status: 'SCHEDULED', reviewOfVisitId: null, createdAt: clock++, ...row, date: new Date(`${row.date ?? '2099-11-17'}T00:00:00.000Z`) }));
  const visit = { id: 'v1', patientId: 'p1', doctorId: 'd1', appointmentId: 'own', followUp: followUp ? new Date(`${followUp}T00:00:00.000Z`) : null, deletedAt: null };
  const withDoctor = (row: Row) => ({ ...row, doctor: DOCTORS[row.doctorId] });
  const inDay = (row: Row, range: { gte: Date; lte: Date }) => row.date >= range.gte && row.date <= range.lte;
  const tx = {
    $queryRaw: jest.fn(async () => []),
    visit: { findFirstOrThrow: jest.fn(async () => visit) },
    appointment: {
      findMany: jest.fn(async ({ where }: any) => (where.reviewOfVisitId
        ? store.filter(r => r.reviewOfVisitId === where.reviewOfVisitId).sort((a, b) => b.createdAt - a.createdAt)
        : store
          .filter(r => r.patientId === where.patientId && inDay(r, where.date) && !where.status.notIn.includes(r.status) && r.id !== where.id?.not)
          .sort((a, b) => a.slot.localeCompare(b.slot))
      ).map(withDoctor)),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = store.find(r => r.id === where.id && r.status === where.status);
        if (row) row.status = data.status;
        return { count: row ? 1 : 0 };
      }),
    },
  };
  const prisma: any = {
    $transaction: jest.fn(async (fn: any) => {
      const snapshot = store.map(r => ({ ...r }));
      try { return await fn(tx); } catch (error) { store = snapshot; throw error; }
    }),
  };
  const appointments: any = {
    getAvailableSlots: jest.fn(async () => ({ availableSlots: slots })),
    bookInTransaction: jest.fn(async (_tx: unknown, dto: any) => {
      if (taken.includes(dto.slot)) throw new ConflictException('Scheduling conflict detected');
      const row: Row = { id: `new-${dto.slot}`, patientId: dto.patientId, doctorId: dto.doctorId, date: new Date(`${dto.date}T00:00:00.000Z`), slot: dto.slot, status: 'SCHEDULED', reviewOfVisitId: dto.reviewOfVisitId, createdAt: clock++ };
      store.push(row);
      return withDoctor(row);
    }),
    notifyBooked: jest.fn(async () => undefined),
    notifyCancelled: jest.fn(),
  };
  const service = new ReviewBookingService(prisma, appointments);
  return {
    appointments,
    book: () => service.book('v1', 'branch', 'user'),
    rows: () => store.map(r => `${r.id} ${r.date.toISOString().slice(0, 10)} ${r.slot} ${r.status}${r.reviewOfVisitId ? ' review' : ''}`),
  };
}

it('books the first free SCHEDULED slot with the visit doctor and links it to the visit', async () => {
  const t = setup();
  expect(await t.book()).toEqual({ status: 'booked', appointment: { id: 'new-09:00-09:30', date: '2099-11-17', slot: '09:00-09:30', doctorName: 'Shravya Rao' } });
  expect(t.rows()).toEqual(['new-09:00-09:30 2099-11-17 09:00-09:30 SCHEDULED review']);
  expect(t.appointments.getAvailableSlots).toHaveBeenCalledWith({ doctorId: 'd1', date: '2099-11-17', calendar: 'SCHEDULED' }, 'branch');
  expect(t.appointments.bookInTransaction.mock.calls[0][1]).toMatchObject({ patientId: 'p1', doctorId: 'd1', source: 'review', calendar: 'SCHEDULED', reviewOfVisitId: 'v1' });
  expect(t.appointments.notifyBooked.mock.calls[0][0].id).toBe('new-09:00-09:30');
});

it('takes the second slot when the first is taken by a race', async () => {
  const t = setup({ taken: ['09:00-09:30'] });
  expect(await t.book()).toMatchObject({ status: 'booked', appointment: { slot: '09:30-10:00' } });
  expect(t.rows()).toEqual(['new-09:30-10:00 2099-11-17 09:30-10:00 SCHEDULED review']);
});

it('tries every free slot before reporting the day full', async () => {
  const slots = ['09:00-09:30', '09:30-10:00', '10:00-10:30', '10:30-11:00', '11:00-11:30'];
  const t = setup({ slots, taken: slots });
  expect(await t.book()).toEqual({ status: 'full', date: '2099-11-17' });
  expect(t.appointments.bookInTransaction).toHaveBeenCalledTimes(5);
  expect(t.rows()).toEqual([]);
});

it('reports the live review on the same date as existing and books nothing', async () => {
  const t = setup({ rows: [{ id: 'r1', slot: '10:00-10:30', reviewOfVisitId: 'v1' }] });
  expect(await t.book()).toEqual({ status: 'existing', appointment: { id: 'r1', date: '2099-11-17', slot: '10:00-10:30', doctorName: 'Shravya Rao' } });
  expect(t.appointments.bookInTransaction).not.toHaveBeenCalled();
});

it('moves a scheduled review to the new date by cancelling it and booking the new day', async () => {
  const t = setup({ followUp: '2099-11-26', rows: [{ id: 'r1', date: '2099-11-16', slot: '09:00-09:30', reviewOfVisitId: 'v1' }] });
  expect(await t.book()).toEqual({
    status: 'moved',
    appointment: { id: 'new-09:00-09:30', date: '2099-11-26', slot: '09:00-09:30', doctorName: 'Shravya Rao' },
    previous: { date: '2099-11-16', slot: '09:00-09:30' },
  });
  expect(t.rows()).toEqual(['r1 2099-11-16 09:00-09:30 CANCELLED review', 'new-09:00-09:30 2099-11-26 09:00-09:30 SCHEDULED review']);
  expect(t.appointments.notifyCancelled).toHaveBeenCalledWith('r1', 'user');
});

it('keeps the earlier review when the new date has no free slot', async () => {
  const t = setup({ followUp: '2099-11-26', slots: [], rows: [{ id: 'r1', date: '2099-11-16', reviewOfVisitId: 'v1' }] });
  expect(await t.book()).toEqual({ status: 'full', date: '2099-11-26', kept: { id: 'r1', date: '2099-11-16', slot: '09:00-09:30', doctorName: 'Shravya Rao' } });
  expect(t.rows()).toEqual(['r1 2099-11-16 09:00-09:30 SCHEDULED review']);
  expect(t.appointments.notifyCancelled).not.toHaveBeenCalled();
});

it('leaves a review the patient already checked in for and reports it as existing', async () => {
  const t = setup({ followUp: '2099-11-26', rows: [{ id: 'r1', date: '2099-11-16', status: 'CHECKED_IN', reviewOfVisitId: 'v1' }] });
  expect(await t.book()).toMatchObject({ status: 'existing', appointment: { id: 'r1', date: '2099-11-16' } });
  expect(t.rows()).toEqual(['r1 2099-11-16 09:00-09:30 CHECKED_IN review']);
});

it('does not book again a review that staff cancelled on the same date', async () => {
  const t = setup({ rows: [{ id: 'r1', status: 'CANCELLED', reviewOfVisitId: 'v1' }] });
  expect(await t.book()).toEqual({ status: 'skipped', reason: 'cancelled-by-staff', date: '2099-11-17' });
  expect(t.appointments.bookInTransaction).not.toHaveBeenCalled();
});

it('books the date again when the newest cancelled review is on another date', async () => {
  const t = setup({ rows: [
    { id: 'r1', date: '2099-11-17', status: 'CANCELLED', reviewOfVisitId: 'v1' },
    { id: 'r2', date: '2099-11-26', status: 'CANCELLED', reviewOfVisitId: 'v1' },
  ] });
  expect(await t.book()).toMatchObject({ status: 'booked', appointment: { date: '2099-11-17' } });
});

it('reports a same-doctor appointment that day as already-scheduled and books nothing', async () => {
  const t = setup({ rows: [{ id: 'a1', slot: '10:00-10:30' }] });
  expect(await t.book()).toEqual({ status: 'already-scheduled', appointment: { id: 'a1', date: '2099-11-17', slot: '10:00-10:30', doctorName: 'Shravya Rao' } });
  expect(t.appointments.bookInTransaction).not.toHaveBeenCalled();
});

it('still books when the patient sees another doctor that day, at a time that does not clash', async () => {
  const t = setup({ rows: [{ id: 'a2', doctorId: 'd2', slot: '09:00-09:30' }] });
  expect(await t.book()).toEqual({ status: 'booked', appointment: { id: 'new-09:30-10:00', date: '2099-11-17', slot: '09:30-10:00', doctorName: 'Shravya Rao' } });
});

it('ignores the visit appointment itself when looking for a same-doctor appointment', async () => {
  const t = setup({ rows: [{ id: 'own', slot: '08:00-08:30', status: 'COMPLETED' }] });
  expect(await t.book()).toMatchObject({ status: 'booked', appointment: { slot: '09:00-09:30' } });
});

it('books nothing for a past review date or a visit without one', async () => {
  expect(await setup({ followUp: '2020-01-01' }).book()).toEqual({ status: 'skipped', reason: 'past-date', date: '2020-01-01' });
  expect(await setup({ followUp: '' }).book()).toEqual({ status: 'skipped', reason: 'no-review-date' });
});

it('returns failed and keeps the visit COMPLETED when booking throws', async () => {
  const stored: any = { id: 'v1', patientId: 'p1', doctorId: 'd1', appointmentId: null, status: 'IN_PROGRESS', version: 1, plan: '{}', followUp: null };
  const db: any = {
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(async (fn: any) => fn(db)),
    visit: {
      findFirst: jest.fn(async () => stored),
      findFirstOrThrow: jest.fn(async () => stored),
      update: jest.fn(async ({ data }: any) => Object.assign(stored, data)),
    },
    appointment: { findMany: jest.fn(async () => []) },
  };
  const appointments: any = { getAvailableSlots: jest.fn().mockRejectedValue(new Error('db down')) };
  const controller = new VisitsController(new VisitsService(db), new ReviewBookingService(db, appointments));
  const result: any = await controller.complete('v1', { followUpDate: '2099-11-21' } as any, { user: { id: 'u', branchId: 'branch' } } as any);
  expect(result).toMatchObject({ status: 'COMPLETED', followUp: new Date('2099-11-21'), reviewAppointment: { status: 'failed' } });
});
