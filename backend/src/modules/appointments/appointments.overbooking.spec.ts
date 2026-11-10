import { ConflictException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';

const DAY = '2099-05-04';
const SLOT = '11:00-11:30';
const MOVING = 'apt-moving';
const MOVING_SLOT = '11:15-11:45';
const movingRow = { id: MOVING, doctorId: 'doc-1', roomId: null, date: new Date(`${DAY}T00:00:00.000Z`), slot: MOVING_SLOT, status: 'SCHEDULED', notes: null, tokenNumber: 1 };

type Row = { id: string; slot: string; doctorId: string; roomId: string | null };

function setup({ limit, booked, roomBooked = false, moving = false }: { limit: unknown; booked: number; roomBooked?: boolean; moving?: boolean }) {
  const events: string[] = [];
  const rows: Row[] = [
    ...Array.from({ length: booked }, (_, i) => ({ id: `apt-${i}`, slot: SLOT, doctorId: 'doc-1', roomId: null })),
    // A rescheduled appointment holds an overlapping slot; it must never count against itself.
    ...(moving ? [{ id: MOVING, slot: MOVING_SLOT, doctorId: 'doc-1', roomId: null }] : []),
    ...(roomBooked ? [{ id: 'apt-room', slot: SLOT, doctorId: 'doc-2', roomId: 'room-1' }] : []),
  ];
  const findMany = jest.fn(async ({ where }: any) => rows
    .filter((r) => (where.doctorId ? r.doctorId === where.doctorId : true))
    .filter((r) => (where.roomId ? r.roomId === where.roomId : true))
    .filter((r) => (where.OR ? where.OR.some((c: any) => (c.doctorId && c.doctorId === r.doctorId) || (c.roomId && c.roomId === r.roomId)) : true))
    .filter((r) => (where.id?.not ? r.id !== where.id.not : true))
    .map((r) => ({ ...r, patient: { name: r.id } })));
  const tx: any = {
    $executeRaw: jest.fn(async () => { events.push('lock'); }),
    user: { findUnique: jest.fn(async () => { events.push('limit'); return { maxBookingsPerSlot: limit }; }) },
    appointment: {
      findMany: jest.fn(async (args: any) => { events.push('count'); return findMany(args); }),
      findFirst: jest.fn(async ({ where }: any) => (where.id === MOVING ? movingRow : { tokenNumber: 9 })),
      create: jest.fn(async ({ data }: any) => ({ id: 'apt-new', ...data, doctor: {}, patient: {} })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: jest.fn(async () => movingRow),
    },
  };
  // The root client has no limit lookup: the limit must be read through the transaction.
  const prisma: any = {
    patient: { findFirst: jest.fn().mockResolvedValue({ id: 'pat-1' }) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'doc-1', firstName: 'A', lastName: 'B', metadata: null }) },
    room: { findFirst: jest.fn().mockResolvedValue({ id: 'room-1' }) },
    doctorTimeOff: { findMany: jest.fn().mockResolvedValue([]) },
    doctorWorkingHours: { findMany: jest.fn().mockResolvedValue([]) },
    appointment: {
      findMany,
      findFirst: jest.fn().mockResolvedValue(movingRow),
    },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  return { service: new AppointmentsService(prisma), tx, events };
}

const create = (service: AppointmentsService, allowOverbook: boolean, roomId?: string) =>
  service.create({ patientId: 'pat-1', doctorId: 'doc-1', date: DAY, slot: SLOT, roomId, allowOverbook }, 'branch-1');
const reschedule = (service: AppointmentsService, allowOverbook: boolean) =>
  service.reschedule(MOVING, { date: DAY, slot: SLOT, allowOverbook }, 'branch-1');

async function conflictOf(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (e) => e);
  expect(error).toBeInstanceOf(ConflictException);
  return (error as ConflictException).getResponse() as any;
}

const matrix = [1, 2, 3].flatMap((limit) => [0, 1, 2, 3].flatMap((booked) =>
  [false, true].map((allowOverbook) => ({ limit, booked, allowOverbook, accepted: booked === 0 || (booked < limit && allowOverbook) }))));

describe.each([
  ['create', create, (tx: any) => tx.appointment.create, false],
  ['reschedule', reschedule, (tx: any) => tx.appointment.updateMany, true],
] as const)('%s under a per-doctor overbooking limit', (_name, send, write, moving) => {
  it.each(matrix)('limit $limit, $booked already booked, allowOverbook $allowOverbook -> accepted $accepted',
    async ({ limit, booked, allowOverbook, accepted }) => {
      const { service, tx } = setup({ limit, booked, moving });
      if (accepted) {
        await send(service, allowOverbook);
        expect(write(tx)).toHaveBeenCalledTimes(1);
        return;
      }
      const body = await conflictOf(send(service, allowOverbook));
      expect(body.overbook).toEqual({ allowed: booked < limit, booked, limit });
      expect(body.conflicts.filter((c: any) => c.type === 'doctor')).toHaveLength(booked);
      expect(write(tx)).not.toHaveBeenCalled();
    });
});

describe('overbooking guard rails', () => {
  it('reads the limit inside the transaction, after taking the lock and counting', async () => {
    const { service, events } = setup({ limit: 2, booked: 1 });
    await create(service, true);
    expect(events).toEqual(['lock', 'count', 'limit']);
  });

  it('never overbooks a room, even when the doctor has room to spare and the flag is set', async () => {
    const { service, tx } = setup({ limit: 3, booked: 1, roomBooked: true });
    const body = await conflictOf(create(service, true, 'room-1'));
    expect(body.overbook).toEqual({ allowed: false, booked: 1, limit: 3 });
    expect(body.conflicts.map((c: any) => c.type).sort()).toEqual(['doctor', 'room']);
    expect(tx.appointment.create).not.toHaveBeenCalled();
  });

  it('refuses a room clash on an otherwise free doctor slot without offering to book anyway', async () => {
    const { service } = setup({ limit: 3, booked: 0, roomBooked: true });
    const body = await conflictOf(create(service, true, 'room-1'));
    expect(body.overbook).toEqual({ allowed: false, booked: 0, limit: 3 });
  });

  it.each([0, -1, 6, 2.5, '3', null, undefined, Number.NaN])('reads a stored limit of %p as 1', async (stored) => {
    const { service, tx } = setup({ limit: stored, booked: 1 });
    const body = await conflictOf(create(service, true));
    expect(body.overbook).toEqual({ allowed: false, booked: 1, limit: 1 });
    expect(tx.appointment.create).not.toHaveBeenCalled();
  });

  it('keeps the 409 payload of today for a full slot: message, conflicts, suggestions, plus overbook', async () => {
    const { service } = setup({ limit: 1, booked: 1 });
    const body = await conflictOf(create(service, false));
    expect(Object.keys(body).sort()).toEqual(['conflicts', 'message', 'overbook', 'suggestions']);
    expect(body.message).toBe('Scheduling conflict detected');
    expect(Array.isArray(body.suggestions)).toBe(true);
  });

  it('does not send allowOverbook through to the stored appointment', async () => {
    const { service, tx } = setup({ limit: 2, booked: 1 });
    await create(service, true);
    expect(tx.appointment.create.mock.calls[0][0].data).not.toHaveProperty('allowOverbook');
  });
});
