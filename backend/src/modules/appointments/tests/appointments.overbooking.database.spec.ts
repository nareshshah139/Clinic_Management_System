import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { AppointmentsService } from '../appointments.service';

const databaseTests = process.env.APPOINTMENT_TOKEN_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Per-doctor overbooking limit on PostgreSQL', () => {
  const schema = `appointment_overbooking_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let service: AppointmentsService;
  let created = false;

  beforeAll(async () => {
    const url = new URL(process.env.APPOINTMENT_TOKEN_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    url.searchParams.set('connection_limit', '20');
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')],
      { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url.toString() } });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    await db.branch.create({ data: { id: 'branch', name: 'Branch', address: 'Synthetic' } });
    for (const [id, maxBookingsPerSlot] of [['limit-1', 1], ['limit-2', 2], ['limit-3', 3]] as const) {
      await db.user.create({ data: { id, firstName: id, lastName: 'Synthetic', email: `${id}@example.test`, password: 'x', role: 'DOCTOR', branchId: 'branch', maxBookingsPerSlot } });
    }
    await db.patient.create({ data: { id: 'patient', name: 'Synthetic Patient', gender: 'F', phone: '9000000000', branchId: 'branch' } });
    service = new AppointmentsService(db as any);
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  const book = (doctorId: string, date: string, allowOverbook?: boolean, slot = '11:00-11:30') =>
    service.create({ patientId: 'patient', doctorId, date, slot, allowOverbook }, 'branch');
  const booked = (doctorId: string, date: string) =>
    db.appointment.findMany({ where: { doctorId, date: new Date(date), status: { not: 'CANCELLED' } }, select: { tokenNumber: true } });
  const settle = async <T>(requests: Promise<T>[]) => {
    const results = await Promise.allSettled(requests);
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    return { accepted: results.length - refused.length, refusedStatuses: refused.map((r) => r.reason?.status) };
  };

  it('with a limit of 2, six simultaneous overbook requests leave exactly two bookings in the slot', async () => {
    const outcome = await settle(Array.from({ length: 6 }, () => book('limit-2', '2099-04-01', true)));
    expect(outcome).toEqual({ accepted: 2, refusedStatuses: [409, 409, 409, 409] });
    const rows = await booked('limit-2', '2099-04-01');
    expect(rows.map((r) => r.tokenNumber).sort()).toEqual([1, 2]);
  }, 60000);

  it('with a limit of 1, simultaneous requests leave exactly one booking even when they all ask to overbook', async () => {
    const outcome = await settle(Array.from({ length: 6 }, () => book('limit-1', '2099-04-02', true)));
    expect(outcome).toEqual({ accepted: 1, refusedStatuses: [409, 409, 409, 409, 409] });
    expect(await booked('limit-1', '2099-04-02')).toHaveLength(1);
  }, 60000);

  it('with a limit of 3, a request without the flag is refused once the slot is occupied and is told it may overbook', async () => {
    await book('limit-3', '2099-04-03');
    await expect(book('limit-3', '2099-04-03')).rejects.toMatchObject({
      status: 409,
      response: { overbook: { allowed: true, booked: 1, limit: 3 } },
    });
    await book('limit-3', '2099-04-03', true);
    await book('limit-3', '2099-04-03', true);
    await expect(book('limit-3', '2099-04-03', true)).rejects.toMatchObject({
      status: 409,
      response: { overbook: { allowed: false, booked: 3, limit: 3 } },
    });
    expect(await booked('limit-3', '2099-04-03')).toHaveLength(3);
  }, 60000);

  it('applies the same limit to simultaneous reschedules into a partly booked slot', async () => {
    const date = '2099-04-04';
    await book('limit-2', date, false, '11:00-11:30');
    const movers = await Promise.all(['09:00-09:30', '09:30-10:00', '10:00-10:30', '12:00-12:30'].map((slot) => book('limit-2', date, false, slot)));
    const outcome = await settle(movers.map((m) => service.reschedule(m.id, { date, slot: '11:00-11:30', allowOverbook: true }, 'branch')));
    expect(outcome).toEqual({ accepted: 1, refusedStatuses: [409, 409, 409] });
    expect(await db.appointment.count({ where: { doctorId: 'limit-2', date: new Date(date), slot: '11:00-11:30' } })).toBe(2);
  }, 60000);

  it('lets an overbooked appointment change to a free room but not into an occupied one', async () => {
    const date = '2099-04-05';
    const [roomA, roomB] = await Promise.all(['Consult A', 'Consult B'].map((name) => db.room.create({ data: { name, type: 'CONSULTATION', branchId: 'branch' } })));
    const first = await service.create({ patientId: 'patient', doctorId: 'limit-2', date, slot: '11:00-11:30', roomId: roomA.id }, 'branch');
    const second = await book('limit-2', date, true);
    await expect(service.update(second.id, { roomId: roomB.id }, 'branch')).resolves.toMatchObject({ roomId: roomB.id });
    await expect(service.update(second.id, { roomId: roomA.id }, 'branch')).rejects.toMatchObject({ status: 409 });
    expect((await db.appointment.findUniqueOrThrow({ where: { id: first.id } })).roomId).toBe(roomA.id);
  }, 60000);

  it('un-cancels only into a slot with room for the patient, without overbooking', async () => {
    const date = '2099-04-06';
    const cancelled = await book('limit-2', date);
    await service.update(cancelled.id, { status: 'CANCELLED' as any }, 'branch');
    await book('limit-2', date);
    await expect(service.update(cancelled.id, { status: 'SCHEDULED' as any }, 'branch')).rejects.toMatchObject({ status: 409 });
    expect(await booked('limit-2', date)).toHaveLength(1);
    const freeDate = '2099-04-07';
    const restored = await book('limit-2', freeDate);
    await service.update(restored.id, { status: 'CANCELLED' as any }, 'branch');
    await expect(service.update(restored.id, { status: 'SCHEDULED' as any }, 'branch')).resolves.toMatchObject({ status: 'SCHEDULED' });
  }, 60000);
});
