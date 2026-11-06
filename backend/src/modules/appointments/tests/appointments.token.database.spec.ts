import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { AppointmentsService } from '../appointments.service';

const databaseTests = process.env.APPOINTMENT_TOKEN_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Per-doctor token queue on PostgreSQL', () => {
  const schema = `appointment_tokens_${randomUUID().replaceAll('-', '')}`;
  const day = '2099-03-04';
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
    for (const id of ['doctor-a', 'doctor-b']) {
      await db.user.create({ data: { id, firstName: id, lastName: 'Synthetic', email: `${id}@example.test`, password: 'x', role: 'DOCTOR', branchId: 'branch' } });
    }
    await db.patient.create({ data: { id: 'patient', name: 'Synthetic Patient', gender: 'F', phone: '9000000000', branchId: 'branch' } });
    service = new AppointmentsService(db as any);
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  const slot = (index: number) => {
    const start = 8 * 60 + index * 10;
    const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    return `${hhmm(start)}-${hhmm(start + 10)}`;
  };
  const book = (doctorId: string, index: number, date = day) =>
    service.create({ patientId: 'patient', doctorId, date, slot: slot(index) } as any, 'branch');

  it('gives every concurrent booking for a doctor a distinct token from that doctor\'s own queue', async () => {
    const results = await Promise.all([
      ...Array.from({ length: 20 }, (_, i) => book('doctor-a', i)),
      ...Array.from({ length: 6 }, (_, i) => book('doctor-b', i)),
    ]);
    const tokens = (doctorId: string) => results.filter(r => r.doctorId === doctorId).map(r => r.tokenNumber).sort((x, y) => x! - y!);
    expect(tokens('doctor-a')).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(tokens('doctor-b')).toEqual([1, 2, 3, 4, 5, 6]);
  }, 60000);

  it('rejects a duplicate token for the same doctor and day at the database', async () => {
    await expect(db.appointment.create({ data: { patientId: 'patient', doctorId: 'doctor-a', date: new Date(day), slot: 'x', branchId: 'branch', tokenNumber: 1 } }))
      .rejects.toMatchObject({ code: 'P2002' });
  });

  it('puts a rescheduled appointment at the end of the new day\'s queue', async () => {
    const first = await book('doctor-b', 0, '2099-03-05');
    expect(first.tokenNumber).toBe(1);
    const moved = await service.reschedule(first.id, { date: day, slot: slot(30) } as any, 'branch');
    expect(moved.tokenNumber).toBe(7);
    const sameDay = await service.reschedule(first.id, { date: day, slot: slot(31) } as any, 'branch');
    expect(sameDay.tokenNumber).toBe(7);
  });

  it('lets only one of many simultaneous bookings take the same doctor slot', async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => book('doctor-a', 40, '2099-03-06')));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected').every(r => (r as PromiseRejectedResult).reason?.status === 409)).toBe(true);
  }, 60000);

  it('lets only one doctor take a room for the same slot', async () => {
    const room = await db.room.create({ data: { name: 'Laser', type: 'PROCEDURE', branchId: 'branch' } });
    const results = await Promise.allSettled(['doctor-a', 'doctor-b'].flatMap(doctorId => [0, 1, 2].map(() =>
      service.create({ patientId: 'patient', doctorId, roomId: room.id, date: '2099-03-07', slot: '10:00-10:30' } as any, 'branch'))));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  }, 60000);
});
