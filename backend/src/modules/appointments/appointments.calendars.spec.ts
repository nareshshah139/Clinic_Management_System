import { BadRequestException, ConflictException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';

const DAY = '2099-05-04';
const SLOT = '11:00-11:30';

type Row = { id: string; status: string; slot: string; date: Date; doctorId: string; roomId: string | null; notes: string | null; tokenNumber: number };

const row = (id: string, status: string, slot = SLOT): Row =>
  ({ id, status, slot, date: new Date(`${DAY}T00:00:00.000Z`), doctorId: 'doc-1', roomId: null, notes: null, tokenNumber: 1 });

function setup({ rows, limit = 1, staleStatus }: { rows: Row[]; limit?: number; staleStatus?: string }) {
  const store = new Map(rows.map((r) => [r.id, { ...r }]));
  const db: any = {
    $executeRaw: jest.fn(),
    user: {
      findUnique: jest.fn(async () => ({ maxBookingsPerSlot: limit })),
      findFirst: jest.fn().mockResolvedValue({ id: 'doc-1', firstName: 'A', lastName: 'B', metadata: null }),
    },
    patient: { findFirst: jest.fn().mockResolvedValue({ id: 'pat-1' }) },
    room: { findFirst: jest.fn().mockResolvedValue({ id: 'room-1' }) },
    doctorTimeOff: { findMany: jest.fn().mockResolvedValue([]) },
    doctorWorkingHours: { findMany: jest.fn().mockResolvedValue([]) },
    appointment: {
      findMany: jest.fn(async ({ where }: any) => [...store.values()]
        .filter((r) => (where.status?.in ? where.status.in.includes(r.status) : true))
        .filter((r) => (where.id?.not ? r.id !== where.id.not : true))
        .filter((r) => (where.doctorId ? r.doctorId === where.doctorId : true))
        .map((r) => ({ ...r, patient: { name: r.id } }))),
      findFirst: jest.fn(async ({ where }: any) => {
        const found = store.get(where.id);
        return found ? { ...found } : null;
      }),
      create: jest.fn(async ({ data }: any) => ({ id: 'apt-new', ...data, doctor: {}, patient: {} })),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const found = store.get(where.id);
        const matches = found && (where.status === undefined || found.status === where.status) &&
          (where.slot === undefined || found.slot === where.slot);
        if (!matches) return { count: 0 };
        Object.assign(found, data);
        return { count: 1 };
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => ({ ...store.get(where.id) })),
    },
    $transaction: jest.fn(async (cb: any) => cb(db)),
  };
  if (staleStatus) {
    const inTransaction = db.appointment.findFirst;
    db.appointment.findFirst = jest.fn()
      .mockImplementationOnce(async (args: any) => ({ ...(await inTransaction(args)), status: staleStatus }))
      .mockImplementation(inTransaction);
  }
  return { service: new AppointmentsService(db), db, store };
}

const confirm = (service: AppointmentsService, id: string, extra: object = {}) =>
  service.reschedule(id, { date: DAY, slot: SLOT, calendar: 'CONFIRMED', ...extra }, 'branch-1');

async function conflictOf(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (e) => e);
  expect(error).toBeInstanceOf(ConflictException);
  return (error as ConflictException).getResponse() as any;
}

describe('booking into a calendar', () => {
  const book = (service: AppointmentsService, calendar?: 'SCHEDULED' | 'CONFIRMED') =>
    service.create({ patientId: 'pat-1', doctorId: 'doc-1', date: DAY, slot: SLOT, calendar }, 'branch-1');

  it('a scheduled appointment does not block the same slot in Confirmed', async () => {
    const { service, db } = setup({ rows: [row('a', 'SCHEDULED')] });
    await book(service, 'CONFIRMED');
    expect(db.appointment.create.mock.calls[0][0].data.status).toBe('CONFIRMED');
  });

  it('a confirmed appointment does not block the same slot in Scheduled, which is the default', async () => {
    const { service, db } = setup({ rows: [row('a', 'CONFIRMED')] });
    await book(service);
    expect(db.appointment.create.mock.calls[0][0].data.status).toBe('SCHEDULED');
  });

  it.each(['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW'])('a %s appointment holds its Confirmed slot', async (status) => {
    const { service, db } = setup({ rows: [row('a', status)] });
    await conflictOf(book(service, 'CONFIRMED'));
    expect(db.appointment.create).not.toHaveBeenCalled();
  });

  it('a cancelled appointment holds no slot in either calendar', async () => {
    const { service } = setup({ rows: [row('a', 'CANCELLED')] });
    await book(service, 'CONFIRMED');
    await book(service, 'SCHEDULED');
  });
});

describe('confirming through reschedule', () => {
  it('is refused into a taken confirmed slot and says it cannot be overbooked at limit 1', async () => {
    const { service, store } = setup({ rows: [row('a', 'SCHEDULED'), row('b', 'CONFIRMED')] });
    const body = await conflictOf(confirm(service, 'a', { allowOverbook: true }));
    expect(body.overbook).toEqual({ allowed: false, booked: 1, limit: 1 });
    expect(store.get('a')!.status).toBe('SCHEDULED');
  });

  it('is refused with overbook details under the limit, and lands with allowOverbook', async () => {
    const { service, store } = setup({ rows: [row('a', 'SCHEDULED'), row('b', 'CONFIRMED')], limit: 2 });
    const body = await conflictOf(confirm(service, 'a'));
    expect(body.overbook).toEqual({ allowed: true, booked: 1, limit: 2 });
    await confirm(service, 'a', { allowOverbook: true });
    expect(store.get('a')!.status).toBe('CONFIRMED');
  });

  it('retried after it took effect returns the appointment without writing or counting', async () => {
    const { service, db } = setup({ rows: [row('a', 'CONFIRMED'), row('b', 'CONFIRMED')] });
    await expect(confirm(service, 'a')).resolves.toMatchObject({ id: 'a', status: 'CONFIRMED' });
    expect(db.appointment.updateMany).not.toHaveBeenCalled();
    expect(db.appointment.findMany).not.toHaveBeenCalled();
  });

  it('without a calendar moves the appointment to Scheduled', async () => {
    const { service, store } = setup({ rows: [row('a', 'CONFIRMED')] });
    await service.reschedule('a', { date: DAY, slot: '12:00-12:30' }, 'branch-1');
    expect(store.get('a')).toMatchObject({ status: 'SCHEDULED', slot: '12:00-12:30' });
  });

  it.each(['IN_PROGRESS', 'COMPLETED'])('refuses to move an appointment that is %s when read inside the transaction', async (status) => {
    const { service, db, store } = setup({ rows: [row('a', status)], staleStatus: 'SCHEDULED' });
    await expect(service.reschedule('a', { date: DAY, slot: '12:00-12:30' }, 'branch-1')).rejects.toThrow(`Cannot move an appointment that is ${status}`);
    expect(db.appointment.updateMany).not.toHaveBeenCalled();
    expect(store.get('a')!.slot).toBe(SLOT);
  });

  it('refuses a cancelled appointment read inside the transaction', async () => {
    const { service, db } = setup({ rows: [row('a', 'CANCELLED')], staleStatus: 'SCHEDULED' });
    await expect(confirm(service, 'a')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.appointment.updateMany).not.toHaveBeenCalled();
  });

  it('answers 409 when the compare-and-set matches no row', async () => {
    const { service, db } = setup({ rows: [row('a', 'SCHEDULED')] });
    db.appointment.updateMany.mockResolvedValue({ count: 0 });
    const body = await conflictOf(confirm(service, 'a'));
    expect(body.message).toBe('Appointment changed; refresh and try again');
  });

  it('writes with the status, date and slot it read', async () => {
    const { service, db } = setup({ rows: [row('a', 'SCHEDULED')] });
    await confirm(service, 'a');
    expect(db.appointment.updateMany.mock.calls[0][0].where).toEqual({
      id: 'a', branchId: 'branch-1', status: 'SCHEDULED', date: new Date(`${DAY}T00:00:00.000Z`), slot: SLOT,
    });
  });
});

describe('status edits through update', () => {
  it('refuses SCHEDULED to CONFIRMED into a taken confirmed slot', async () => {
    const { service, store } = setup({ rows: [row('a', 'SCHEDULED'), row('b', 'CONFIRMED')] });
    await conflictOf(service.update('a', { status: 'CONFIRMED' }, 'branch-1'));
    expect(store.get('a')!.status).toBe('SCHEDULED');
  });

  it('accepts it into a free confirmed slot and never stores allowOverbook', async () => {
    const { service, db, store } = setup({ rows: [row('a', 'SCHEDULED'), row('b', 'SCHEDULED')], limit: 2 });
    await service.update('a', { status: 'CONFIRMED', allowOverbook: true }, 'branch-1');
    expect(store.get('a')!.status).toBe('CONFIRMED');
    expect(db.appointment.updateMany.mock.calls[0][0].data).toEqual({ status: 'CONFIRMED' });
  });

  it('does not check capacity for a status change inside the same calendar', async () => {
    const { service, db } = setup({ rows: [row('a', 'CONFIRMED'), row('b', 'CONFIRMED')] });
    await service.update('a', { status: 'COMPLETED' }, 'branch-1');
    expect(db.appointment.findMany).not.toHaveBeenCalled();
  });

  it('un-cancels into the calendar of the new status', async () => {
    const { service } = setup({ rows: [row('a', 'CANCELLED'), row('b', 'CONFIRMED')] });
    await conflictOf(service.update('a', { status: 'CONFIRMED' }, 'branch-1'));
    await expect(service.update('a', { status: 'SCHEDULED' }, 'branch-1')).resolves.toMatchObject({ status: 'SCHEDULED' });
  });
});

describe('bulk update', () => {
  it.each(['SCHEDULED', 'CONFIRMED'])('refuses status %s because the move needs a capacity check', async (status) => {
    const { service, db } = setup({ rows: [row('a', 'SCHEDULED')] });
    await expect(service.bulkUpdate({ appointmentIds: ['a'], status } as any, 'branch-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.appointment.updateMany).not.toHaveBeenCalled();
  });
});

describe('available slots by calendar', () => {
  it.each([
    [undefined, ['SCHEDULED']],
    ['SCHEDULED', ['SCHEDULED']],
    ['CONFIRMED', ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW']],
  ] as const)('calendar %s blocks only statuses %j', async (calendar, statuses) => {
    const { service, db } = setup({ rows: [] });
    await service.getAvailableSlots({ doctorId: 'doc-1', date: DAY, calendar } as any, 'branch-1');
    expect(db.appointment.findMany.mock.calls[0][0].where.status).toEqual({ in: statuses });
  });
});
