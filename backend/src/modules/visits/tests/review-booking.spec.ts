import { ConflictException } from '@nestjs/common';
import { ReviewBookingService } from '../review-booking';
import { VisitsController } from '../visits.controller';
import { VisitsService } from '../visits.service';

jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }));

type Row = {
  id: string; patientId: string; doctorId: string; date: Date; slot: string; status: string; visitType: string; notes: string | null; roomId: string | null;
  reviewOfVisitId: string | null; reviewRequestedFor: Date | null; reviewRequestedProcedure: string | null; createdAt: number;
};
type Seed = Omit<Partial<Row>, 'date' | 'reviewRequestedFor'> & { date?: string; requested?: string };
type RoomSeed = { id: string; type?: string; isActive?: boolean };

const DOCTORS: Record<string, { firstName: string; lastName: string }> = {
  d1: { firstName: 'Shravya', lastName: 'Rao' },
  d2: { firstName: 'Praneeta', lastName: 'Jain' },
};
const day = (date: string) => new Date(`${date}T00:00:00.000Z`);

function setup({ followUp = '2099-11-17', plan = null as string | null, slots = ['09:00-09:30', '09:30-10:00'], taken = [] as string[], rows = [] as Seed[], rooms = [] as RoomSeed[] } = {}) {
  let clock = 0;
  let store: Row[] = rows.map(({ requested, ...row }, i) => ({
    id: `old-${i}`, patientId: 'p1', doctorId: 'd1', slot: '09:00-09:30', status: 'SCHEDULED', visitType: 'OPD', notes: null, roomId: null, reviewOfVisitId: null, reviewRequestedProcedure: null, createdAt: clock++,
    ...row, date: day(row.date ?? '2099-11-17'), reviewRequestedFor: requested ? day(requested) : null,
  }));
  const visit = { id: 'v1', patientId: 'p1', doctorId: 'd1', appointmentId: 'own', followUp: followUp ? day(followUp) : null, createdAt: new Date('2099-11-09T20:00:00.000Z'), deletedAt: null, plan };
  const withDoctor = (row: Row) => ({ ...row, doctor: DOCTORS[row.doctorId] });
  const inDay = (row: Row, range: { gte: Date; lte: Date }) => row.date >= range.gte && row.date <= range.lte;
  const roomTaken = (roomId: string, date: Date, slot: string, except?: string) =>
    store.some(r => r.roomId === roomId && r.date.getTime() === date.getTime() && r.slot === slot && r.status !== 'CANCELLED' && r.id !== except);
  const tx = {
    $queryRaw: jest.fn(async () => []),
    visit: { findFirstOrThrow: jest.fn(async () => visit) },
    room: {
      findMany: jest.fn(async ({ where }: any) => rooms
        .filter(r => (r.isActive ?? true) === where.isActive)
        .map(r => ({ id: r.id, type: r.type ?? 'Procedure Room' }))),
    },
    appointment: {
      findMany: jest.fn(async ({ where }: any) => (where.reviewOfVisitId
        ? store.filter(r => r.reviewOfVisitId === where.reviewOfVisitId).sort((a, b) => b.createdAt - a.createdAt)
        : store
          .filter(r => r.patientId === where.patientId && inDay(r, where.date) && !where.status.notIn.includes(r.status) && r.id !== where.id?.not)
          .sort((a, b) => a.slot.localeCompare(b.slot))
      ).map(withDoctor)),
      update: jest.fn(async ({ where, data }: any) => Object.assign(store.find(r => r.id === where.id)!, data)),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = store.find(r => r.id === where.id && (where.roomId === undefined || r.roomId === where.roomId)
          && (where.status === undefined || (where.status.in ? where.status.in.includes(r.status) : r.status === where.status)));
        if (row) Object.assign(row, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
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
      if (taken.includes(dto.slot) || (dto.roomId && roomTaken(dto.roomId, day(dto.date), dto.slot))) throw new ConflictException('Scheduling conflict detected');
      const row: Row = { id: `new-${dto.slot}`, patientId: dto.patientId, doctorId: dto.doctorId, date: day(dto.date), slot: dto.slot, status: 'SCHEDULED', visitType: dto.visitType, notes: dto.notes, roomId: dto.roomId ?? null,
        reviewOfVisitId: dto.reviewOfVisitId, reviewRequestedFor: day(dto.reviewRequestedFor), reviewRequestedProcedure: dto.reviewRequestedProcedure, createdAt: clock++ };
      store.push(row);
      return withDoctor(row);
    }),
    firstFreeRoom: jest.fn(async (_tx: unknown, appointment: Row, roomIds: string[]) =>
      roomIds.find(id => !roomTaken(id, appointment.date, appointment.slot, appointment.id))),
    notifyBooked: jest.fn(async () => undefined),
    notifyCancelled: jest.fn(),
    notifyUpdated: jest.fn(),
  };
  const service = new ReviewBookingService(prisma, appointments);
  const ymd = (date: Date | null) => date?.toISOString().slice(0, 10);
  return {
    appointments,
    tx,
    setStatus: (id: string, status: string) => { store.find(r => r.id === id)!.status = status; },
    book: () => service.book('v1', 'branch', 'user'),
    roomOf: (id: string) => store.find(r => r.id === id)!.roomId,
    stored: (id: string) => { const { visitType, notes, reviewRequestedProcedure } = store.find(r => r.id === id)!; return { visitType, notes, reviewRequestedProcedure }; },
    rows: () => store.map(r => `${r.id} ${ymd(r.date)} ${r.slot} ${r.status}${r.reviewOfVisitId ? ` review for ${ymd(r.reviewRequestedFor) ?? 'unknown'}` : ''}`),
  };
}

const shravya = (id: string, date: string, slot: string) => ({ id, date, slot, doctorName: 'Shravya Rao' });

describe('a first review booking', () => {
  it('books the first free SCHEDULED slot, records the requested date and names the visit day in IST', async () => {
    const t = setup();
    expect(await t.book()).toEqual({ status: 'booked', appointment: shravya('new-09:00-09:30', '2099-11-17', '09:00-09:30') });
    expect(t.rows()).toEqual(['new-09:00-09:30 2099-11-17 09:00-09:30 SCHEDULED review for 2099-11-17']);
    expect(t.appointments.getAvailableSlots).toHaveBeenCalledWith({ doctorId: 'd1', date: '2099-11-17', calendar: 'SCHEDULED' }, 'branch');
    expect(t.appointments.bookInTransaction.mock.calls[0][1]).toMatchObject({
      patientId: 'p1', doctorId: 'd1', source: 'review', calendar: 'SCHEDULED', reviewOfVisitId: 'v1', notes: 'Review after visit on 2099-11-10',
    });
    expect(t.appointments.notifyBooked.mock.calls[0][0].id).toBe('new-09:00-09:30');
  });

  it.each([
    ['a top-level procedure', { procedurePlanned: '  Chemical peel ' }, 'PROCEDURE', 'Chemical peel', 'Chemical peel'],
    ['a legacy dermatology procedure', { dermatology: { procedurePlanned: 'PRP session' } }, 'PROCEDURE', 'PRP session', 'PRP session'],
    ['a blank procedure', { procedurePlanned: '   ' }, 'OPD', 'Review after visit on 2099-11-10', null],
    ['no procedure', { notes: 'x' }, 'OPD', 'Review after visit on 2099-11-10', null],
    ['a cleared procedure over a legacy one', { procedurePlanned: '', dermatology: { procedurePlanned: 'PRP session' } }, 'OPD', 'Review after visit on 2099-11-10', null],
  ])('books the review for %s', async (_name, plan, visitType, notes, reviewRequestedProcedure) => {
    const t = setup({ plan: JSON.stringify(plan) });
    expect(await t.book()).toMatchObject({ status: 'booked' });
    expect(t.appointments.bookInTransaction.mock.calls[0][1]).toMatchObject({ visitType, notes, reviewRequestedProcedure, source: 'review', reviewOfVisitId: 'v1' });
  });

  it.each([[null], ['not json']])('books a plain OPD review for plan %p', async (plan) => {
    const t = setup({ plan });
    expect(await t.book()).toMatchObject({ status: 'booked' });
    expect(t.appointments.bookInTransaction.mock.calls[0][1]).toMatchObject({ visitType: 'OPD', notes: 'Review after visit on 2099-11-10' });
  });

  it('takes the second slot when the first is taken by a race', async () => {
    const t = setup({ taken: ['09:00-09:30'] });
    expect(await t.book()).toMatchObject({ status: 'booked', appointment: { slot: '09:30-10:00' } });
    expect(t.rows()).toEqual(['new-09:30-10:00 2099-11-17 09:30-10:00 SCHEDULED review for 2099-11-17']);
  });

  it('tries every free slot before reporting the day full', async () => {
    const slots = ['09:00-09:30', '09:30-10:00', '10:00-10:30', '10:30-11:00', '11:00-11:30'];
    const t = setup({ slots, taken: slots });
    expect(await t.book()).toEqual({ status: 'full', date: '2099-11-17' });
    expect(t.appointments.bookInTransaction).toHaveBeenCalledTimes(5);
    expect(t.rows()).toEqual([]);
  });

  it('reports a same-doctor appointment that day as already-scheduled and books nothing', async () => {
    const t = setup({ rows: [{ id: 'a1', slot: '10:00-10:30' }] });
    expect(await t.book()).toEqual({ status: 'already-scheduled', appointment: shravya('a1', '2099-11-17', '10:00-10:30') });
    expect(t.appointments.bookInTransaction).not.toHaveBeenCalled();
  });

  it('still books when the patient sees another doctor that day, at a time that does not clash', async () => {
    const t = setup({ rows: [{ id: 'a2', doctorId: 'd2', slot: '09:00-09:30' }] });
    expect(await t.book()).toEqual({ status: 'booked', appointment: shravya('new-09:30-10:00', '2099-11-17', '09:30-10:00') });
  });

  it('ignores the visit appointment itself when looking for a same-doctor appointment', async () => {
    const t = setup({ rows: [{ id: 'own', slot: '08:00-08:30', status: 'COMPLETED' }] });
    expect(await t.book()).toMatchObject({ status: 'booked', appointment: { slot: '09:00-09:30' } });
  });

  it('books nothing for a past review date or a visit without one', async () => {
    expect(await setup({ followUp: '2020-01-01' }).book()).toEqual({ status: 'skipped', reason: 'past-date', date: '2020-01-01' });
    expect(await setup({ followUp: '' }).book()).toEqual({ status: 'skipped', reason: 'no-review-date' });
  });
});

describe('completing again with the same review date', () => {
  it('reports the open review as existing and books nothing', async () => {
    const t = setup({ rows: [{ id: 'r1', slot: '10:00-10:30', reviewOfVisitId: 'v1', requested: '2099-11-17' }] });
    expect(await t.book()).toEqual({ status: 'existing', appointment: shravya('r1', '2099-11-17', '10:00-10:30'), date: '2099-11-17' });
    expect(t.appointments.bookInTransaction).not.toHaveBeenCalled();
  });

  it('leaves a review the desk moved to another day where the desk put it', async () => {
    const t = setup({ rows: [{ id: 'r1', date: '2099-11-26', slot: '11:00-11:30', reviewOfVisitId: 'v1', requested: '2099-11-17' }] });
    expect(await t.book()).toEqual({ status: 'existing', appointment: shravya('r1', '2099-11-26', '11:00-11:30'), date: '2099-11-17' });
    expect(t.rows()).toEqual(['r1 2099-11-26 11:00-11:30 SCHEDULED review for 2099-11-17']);
    expect(t.appointments.notifyCancelled).not.toHaveBeenCalled();
  });

  it('does not book again a review that staff cancelled', async () => {
    const t = setup({ rows: [{ id: 'r1', date: '2099-11-20', status: 'CANCELLED', reviewOfVisitId: 'v1', requested: '2099-11-17' }] });
    expect(await t.book()).toEqual({ status: 'skipped', reason: 'cancelled-by-staff', date: '2099-11-17' });
    expect(t.appointments.bookInTransaction).not.toHaveBeenCalled();
  });

  it('reports a review the patient missed and books nothing', async () => {
    const t = setup({ rows: [{ id: 'r1', status: 'NO_SHOW', reviewOfVisitId: 'v1', requested: '2099-11-17' }] });
    expect(await t.book()).toEqual({ status: 'missed', appointment: shravya('r1', '2099-11-17', '09:00-09:30'), date: '2099-11-17' });
    expect(t.rows()).toEqual(['r1 2099-11-17 09:00-09:30 NO_SHOW review for 2099-11-17']);
  });

  it('reports a review that already took place and books nothing', async () => {
    const t = setup({ rows: [{ id: 'r1', status: 'COMPLETED', reviewOfVisitId: 'v1', requested: '2099-11-17' }] });
    expect(await t.book()).toEqual({ status: 'done', appointment: shravya('r1', '2099-11-17', '09:00-09:30') });
    expect(t.appointments.bookInTransaction).not.toHaveBeenCalled();
  });

  it('reports the review the desk reopened when the newest one was cancelled', async () => {
    const t = setup({ rows: [
      { id: 'r1', date: '2099-11-16', reviewOfVisitId: 'v1', requested: '2099-11-16' },
      { id: 'r2', status: 'CANCELLED', reviewOfVisitId: 'v1', requested: '2099-11-17' },
    ] });
    expect(await t.book()).toEqual({ status: 'existing', appointment: shravya('r1', '2099-11-16', '09:00-09:30'), date: '2099-11-17' });
  });

  it('treats a legacy review without a recorded date as booked for its own date', async () => {
    const t = setup({ rows: [{ id: 'r1', reviewOfVisitId: 'v1' }] });
    expect(await t.book()).toMatchObject({ status: 'existing', appointment: { id: 'r1' } });
  });
});

describe('a procedure review and its room', () => {
  const procedure = JSON.stringify({ procedurePlanned: 'Chemical peel' });
  const rooms = [{ id: 'room-a' }, { id: 'room-b' }];
  const busy = (roomId: string, slot: string) => ({ id: `busy-${roomId}-${slot}`, patientId: 'other', roomId, slot });

  it('books the first free procedure room', async () => {
    const t = setup({ plan: procedure, rooms });
    expect(await t.book()).toEqual({ status: 'booked', appointment: shravya('new-09:00-09:30', '2099-11-17', '09:00-09:30') });
    expect(t.roomOf('new-09:00-09:30')).toBe('room-a');
    expect(t.appointments.bookInTransaction.mock.calls[0][1]).toMatchObject({ visitType: 'PROCEDURE', roomId: 'room-a' });
  });

  it('takes the second room when the first is taken at that slot', async () => {
    const t = setup({ plan: procedure, rooms, rows: [busy('room-a', '09:00-09:30')] });
    expect(await t.book()).toMatchObject({ status: 'booked', appointment: { slot: '09:00-09:30' } });
    expect(t.roomOf('new-09:00-09:30')).toBe('room-b');
  });

  it('takes the next slot with a room when every room is taken at the first one', async () => {
    const t = setup({ plan: procedure, rooms, rows: [busy('room-a', '09:00-09:30'), busy('room-b', '09:00-09:30')] });
    expect(await t.book()).toMatchObject({ status: 'booked', appointment: { slot: '09:30-10:00' } });
    expect(t.roomOf('new-09:30-10:00')).toBe('room-a');
  });

  it('books the first free slot without a room when no room is free all day', async () => {
    const t = setup({
      plan: procedure,
      rooms,
      rows: ['09:00-09:30', '09:30-10:00'].flatMap((slot) => [busy('room-a', slot), busy('room-b', slot)]),
    });
    expect(await t.book()).toMatchObject({ status: 'booked', appointment: { slot: '09:00-09:30' } });
    expect(t.roomOf('new-09:00-09:30')).toBeNull();
  });

  it('still reports the day full when no slot is left, with or without a room', async () => {
    const t = setup({ plan: procedure, rooms, slots: [] });
    expect(await t.book()).toEqual({ status: 'full', date: '2099-11-17' });
  });

  it.each([
    ['only consultation rooms', [{ id: 'room-c', type: 'Consultation Room' }]],
    ['only inactive procedure rooms', [{ id: 'room-a', isActive: false }]],
    ['no rooms', []],
  ])('books without a room in a branch with %s', async (_name, branchRooms) => {
    const t = setup({ plan: procedure, rooms: branchRooms });
    expect(await t.book()).toMatchObject({ status: 'booked', appointment: { slot: '09:00-09:30' } });
    expect(t.roomOf('new-09:00-09:30')).toBeNull();
  });

  it.each(['Procedure Room', 'Operation Theatre', 'Minor SURGERY Suite'])('treats the room type %p as a procedure room', async (type) => {
    const t = setup({ plan: procedure, rooms: [{ id: 'room-a', type }] });
    await t.book();
    expect(t.roomOf('new-09:00-09:30')).toBe('room-a');
  });

  it.each(['Consultation Room', 'Telemedicine', 'OPD 2'])('does not treat the room type %p as a procedure room', async (type) => {
    const t = setup({ plan: procedure, rooms: [{ id: 'room-a', type }] });
    await t.book();
    expect(t.roomOf('new-09:00-09:30')).toBeNull();
  });

  it('gives an OPD review no room even when procedure rooms are free', async () => {
    const t = setup({ plan: null, rooms });
    expect(await t.book()).toMatchObject({ status: 'booked' });
    expect(t.roomOf('new-09:00-09:30')).toBeNull();
    expect(t.appointments.bookInTransaction.mock.calls[0][1].roomId).toBeUndefined();
  });

  it('books the moved review into a procedure room', async () => {
    const t = setup({ plan: procedure, rooms, rows: [{ id: 'r1', date: '2099-11-16', reviewOfVisitId: 'v1', requested: '2099-11-16' }] });
    expect(await t.book()).toMatchObject({ status: 'moved' });
    expect(t.roomOf('new-09:00-09:30')).toBe('room-a');
  });
});

describe('completing with a new review date', () => {
  const earlier = (status = 'SCHEDULED') => ({ id: 'r1', date: '2099-11-16', status, reviewOfVisitId: 'v1', requested: '2099-11-16' });

  it('moves a scheduled review by cancelling it and booking the new day', async () => {
    const t = setup({ rows: [earlier()] });
    expect(await t.book()).toEqual({
      status: 'moved',
      appointment: shravya('new-09:00-09:30', '2099-11-17', '09:00-09:30'),
      previous: { date: '2099-11-16', slot: '09:00-09:30' },
    });
    expect(t.rows()).toEqual(['r1 2099-11-16 09:00-09:30 CANCELLED review for 2099-11-16', 'new-09:00-09:30 2099-11-17 09:00-09:30 SCHEDULED review for 2099-11-17']);
    expect(t.appointments.notifyCancelled).toHaveBeenCalledWith('r1', 'user');
  });

  it('moves a legacy review whose own date differs', async () => {
    const t = setup({ rows: [{ id: 'r1', date: '2099-11-16', reviewOfVisitId: 'v1' }] });
    expect(await t.book()).toMatchObject({ status: 'moved', previous: { date: '2099-11-16' } });
  });

  it('keeps a confirmed review when the new date has no free slot', async () => {
    const t = setup({ slots: [], rows: [earlier('CONFIRMED')] });
    expect(await t.book()).toEqual({ status: 'full', date: '2099-11-17', kept: shravya('r1', '2099-11-16', '09:00-09:30') });
    expect(t.rows()).toEqual(['r1 2099-11-16 09:00-09:30 CONFIRMED review for 2099-11-16']);
    expect(t.appointments.notifyCancelled).not.toHaveBeenCalled();
  });

  it('keeps the review when the patient already sees the doctor on the new date', async () => {
    const t = setup({ rows: [earlier(), { id: 'a1', slot: '10:00-10:30' }] });
    expect(await t.book()).toEqual({
      status: 'already-scheduled', appointment: shravya('a1', '2099-11-17', '10:00-10:30'), kept: shravya('r1', '2099-11-16', '09:00-09:30'),
    });
    expect(t.rows()).toEqual(['r1 2099-11-16 09:00-09:30 SCHEDULED review for 2099-11-16', 'a1 2099-11-17 10:00-10:30 SCHEDULED']);
  });

  it.each(['CHECKED_IN', 'IN_PROGRESS'])('leaves a %s review alone and books nothing', async (status) => {
    const t = setup({ rows: [earlier(status)] });
    expect(await t.book()).toEqual({ status: 'in-progress', appointment: shravya('r1', '2099-11-16', '09:00-09:30'), date: '2099-11-17' });
    expect(t.rows()).toEqual([`r1 2099-11-16 09:00-09:30 ${status} review for 2099-11-16`]);
  });

  it.each(['NO_SHOW', 'COMPLETED', 'CANCELLED'])('books the new date beside a %s review', async (status) => {
    const t = setup({ rows: [earlier(status)] });
    expect(await t.book()).toEqual({ status: 'booked', appointment: shravya('new-09:00-09:30', '2099-11-17', '09:00-09:30') });
    expect(t.rows()).toEqual([`r1 2099-11-16 09:00-09:30 ${status} review for 2099-11-16`, 'new-09:00-09:30 2099-11-17 09:00-09:30 SCHEDULED review for 2099-11-17']);
  });

  it('keeps a review the desk already put on the new date and records it as requested', async () => {
    const t = setup({ rows: [{ id: 'r1', slot: '11:00-11:30', reviewOfVisitId: 'v1', requested: '2099-11-16' }] });
    expect(await t.book()).toEqual({ status: 'existing', appointment: shravya('r1', '2099-11-17', '11:00-11:30'), date: '2099-11-17' });
    expect(t.rows()).toEqual(['r1 2099-11-17 11:00-11:30 SCHEDULED review for 2099-11-17']);
  });
});

describe('keeping a booked review in step with the planned procedure', () => {
  const plan = (procedurePlanned: string) => JSON.stringify({ procedurePlanned });
  const opd = { visitType: 'OPD', notes: 'Review after visit on 2099-11-10', reviewRequestedProcedure: null };
  const peel = { visitType: 'PROCEDURE', notes: 'Chemical peel', reviewRequestedProcedure: 'Chemical peel' };
  const review = (extra: Seed = {}) => ({ id: 'r1', slot: '10:00-10:30', reviewOfVisitId: 'v1', requested: '2099-11-17', ...opd, ...extra });
  const existingR1 = { status: 'existing', appointment: shravya('r1', '2099-11-17', '10:00-10:30'), date: '2099-11-17' };

  it.each(['SCHEDULED', 'CONFIRMED'])('turns a %s review into a procedure review when a procedure is added', async (status) => {
    const t = setup({ plan: plan(' Chemical peel '), rows: [review({ status })] });
    expect(await t.book()).toEqual(existingR1);
    expect(t.stored('r1')).toEqual(peel);
    expect(t.rows()).toEqual([`r1 2099-11-17 10:00-10:30 ${status} review for 2099-11-17`]);
    expect(t.appointments.bookInTransaction).not.toHaveBeenCalled();
    expect(t.appointments.notifyUpdated).toHaveBeenCalledWith('r1', 'user');
  });

  it('renames the procedure on a procedure review', async () => {
    const t = setup({ plan: plan('PRP session'), rows: [review(peel)] });
    expect(await t.book()).toEqual(existingR1);
    expect(t.stored('r1')).toEqual({ visitType: 'PROCEDURE', notes: 'PRP session', reviewRequestedProcedure: 'PRP session' });
  });

  it('turns a procedure review back into an OPD review when the procedure is cleared', async () => {
    const t = setup({ plan: plan(''), rows: [review(peel)] });
    expect(await t.book()).toEqual(existingR1);
    expect(t.stored('r1')).toEqual(opd);
  });

  it('leaves a note the desk edited when the procedure did not change', async () => {
    const t = setup({ plan: plan('Chemical peel'), rows: [review({ ...peel, notes: 'Chemical peel, bring consent form' })] });
    expect(await t.book()).toEqual(existingR1);
    expect(t.stored('r1')).toEqual({ ...peel, notes: 'Chemical peel, bring consent form' });
    expect(t.appointments.notifyUpdated).not.toHaveBeenCalled();
  });

  it('leaves a legacy review without a recorded procedure alone when the visit has none', async () => {
    const t = setup({ plan: null, rows: [review({ notes: 'Desk note' })] });
    expect(await t.book()).toEqual(existingR1);
    expect(t.stored('r1')).toEqual({ ...opd, notes: 'Desk note' });
  });

  it.each(['CHECKED_IN', 'IN_PROGRESS'])('leaves a %s review alone when the procedure changed', async (status) => {
    const t = setup({ plan: plan('PRP session'), rows: [review({ ...peel, status })] });
    expect(await t.book()).toEqual(existingR1);
    expect(t.stored('r1')).toEqual(peel);
    expect(t.appointments.notifyUpdated).not.toHaveBeenCalled();
  });

  it('leaves a review the desk checks in after it was read alone', async () => {
    const t = setup({ plan: plan('PRP session'), rows: [review(peel)] });
    const read = t.tx.appointment.findMany.getMockImplementation()!;
    t.tx.appointment.findMany.mockImplementationOnce(async (args: any) => {
      const rows = await read(args);
      t.setStatus('r1', 'CHECKED_IN');
      return rows;
    });
    expect(await t.book()).toEqual(existingR1);
    expect(t.stored('r1')).toEqual(peel);
    expect(t.appointments.notifyUpdated).not.toHaveBeenCalled();
  });

  it('turns a review the desk already put on the new date into a procedure review', async () => {
    const t = setup({ plan: plan('Chemical peel'), rows: [review({ requested: '2099-11-16' })] });
    expect(await t.book()).toEqual(existingR1);
    expect(t.rows()).toEqual(['r1 2099-11-17 10:00-10:30 SCHEDULED review for 2099-11-17']);
    expect(t.stored('r1')).toEqual(peel);
    expect(t.appointments.notifyUpdated).toHaveBeenCalledWith('r1', 'user');
  });

  it('records the procedure on the review booked when the date moves', async () => {
    const t = setup({ plan: plan('Chemical peel'), rows: [review({ date: '2099-11-16', requested: '2099-11-16' })] });
    expect(await t.book()).toMatchObject({ status: 'moved' });
    expect(t.stored('new-09:00-09:30')).toEqual(peel);
  });

  describe('and its room', () => {
    const rooms = [{ id: 'room-a' }, { id: 'room-b' }];
    const busy = (roomId: string) => ({ id: `busy-${roomId}`, patientId: 'other', roomId, slot: '10:00-10:30' });

    it('gives a review turned into a procedure review the first free procedure room at its slot', async () => {
      const t = setup({ plan: plan('Chemical peel'), rooms, rows: [review(), busy('room-a')] });
      expect(await t.book()).toEqual(existingR1);
      expect(t.stored('r1')).toEqual(peel);
      expect(t.roomOf('r1')).toBe('room-b');
      expect(t.appointments.notifyUpdated).toHaveBeenCalledWith('r1', 'user');
    });

    it('turns the review into a procedure review without a room when every room is taken at its slot', async () => {
      const t = setup({ plan: plan('Chemical peel'), rooms, rows: [review(), busy('room-a'), busy('room-b')] });
      expect(await t.book()).toEqual(existingR1);
      expect(t.stored('r1')).toEqual(peel);
      expect(t.roomOf('r1')).toBeNull();
    });

    it('keeps a procedure room the desk already gave the review when it becomes a procedure review', async () => {
      const t = setup({ plan: plan('Chemical peel'), rooms, rows: [review({ roomId: 'room-b' })] });
      expect(await t.book()).toEqual(existingR1);
      expect(t.stored('r1')).toEqual(peel);
      expect(t.roomOf('r1')).toBe('room-b');
      expect(t.appointments.firstFreeRoom).not.toHaveBeenCalled();
    });

    it('writes no room when the desk confirms the review between the read and the room check', async () => {
      const t = setup({ plan: plan('Chemical peel'), rooms, rows: [review()] });
      const check = t.appointments.firstFreeRoom.getMockImplementation()!;
      t.appointments.firstFreeRoom.mockImplementationOnce(async (...args: any[]) => {
        t.setStatus('r1', 'CONFIRMED');
        return check(...args);
      });
      expect(await t.book()).toEqual(existingR1);
      expect(t.stored('r1')).toEqual(opd);
      expect(t.roomOf('r1')).toBeNull();
      expect(t.appointments.notifyUpdated).not.toHaveBeenCalled();
    });

    it('clears the room when the procedure is cleared', async () => {
      const t = setup({ plan: plan(''), rooms, rows: [review({ ...peel, roomId: 'room-a' })] });
      expect(await t.book()).toEqual(existingR1);
      expect(t.stored('r1')).toEqual(opd);
      expect(t.roomOf('r1')).toBeNull();
    });

    it('keeps the room when the procedure is renamed', async () => {
      const t = setup({ plan: plan('PRP session'), rooms, rows: [review({ ...peel, roomId: 'room-b' })] });
      expect(await t.book()).toEqual(existingR1);
      expect(t.stored('r1')).toEqual({ visitType: 'PROCEDURE', notes: 'PRP session', reviewRequestedProcedure: 'PRP session' });
      expect(t.roomOf('r1')).toBe('room-b');
    });

    it('leaves the room of a checked-in review alone when the procedure changed', async () => {
      const t = setup({ plan: plan(''), rooms, rows: [review({ ...peel, roomId: 'room-a', status: 'CHECKED_IN' })] });
      expect(await t.book()).toEqual(existingR1);
      expect(t.roomOf('r1')).toBe('room-a');
    });
  });
});

it('returns failed and keeps the visit COMPLETED when booking throws', async () => {
  const stored: any = { id: 'v1', patientId: 'p1', doctorId: 'd1', appointmentId: null, status: 'IN_PROGRESS', version: 1, plan: '{}', followUp: null, createdAt: new Date() };
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
