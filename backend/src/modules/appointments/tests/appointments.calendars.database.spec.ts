import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { AppointmentsService } from '../appointments.service';

const databaseTests = process.env.APPOINTMENT_TOKEN_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Scheduled and Confirmed calendars on PostgreSQL', () => {
  const schema = `appointment_calendars_${randomUUID().replaceAll('-', '')}`;
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
    await db.user.create({ data: { id: 'doc', firstName: 'Doc', lastName: 'Synthetic', email: 'doc@example.test', password: 'x', role: 'DOCTOR', branchId: 'branch', maxBookingsPerSlot: 1 } });
    await db.patient.create({ data: { id: 'patient', name: 'Synthetic Patient', gender: 'F', phone: '9000000000', branchId: 'branch' } });
    service = new AppointmentsService(db as any);
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  const SLOT = '11:00-11:30';
  const book = (date: string, slot = SLOT, calendar?: 'SCHEDULED' | 'CONFIRMED') =>
    service.create({ patientId: 'patient', doctorId: 'doc', date, slot, calendar }, 'branch');
  const confirm = (id: string, date: string, slot = SLOT) =>
    service.reschedule(id, { date, slot, calendar: 'CONFIRMED' }, 'branch');
  const statusOf = async (id: string) => (await db.appointment.findUniqueOrThrow({ where: { id } })).status;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('six scheduled appointments confirmed at once into one Confirmed slot leave exactly one CONFIRMED', async () => {
    const date = '2099-06-01';
    const waiting = await Promise.all(['08:00-08:30', '08:30-09:00', '09:00-09:30', '09:30-10:00', '10:00-10:30', '10:30-11:00'].map((slot) => book(date, slot)));
    const results = await Promise.allSettled(waiting.map((a) => confirm(a.id, date)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason.status)).toEqual([409, 409, 409, 409, 409]);
    expect(await db.appointment.count({ where: { doctorId: 'doc', date: new Date(date), slot: SLOT, status: 'CONFIRMED' } })).toBe(1);
    expect(await db.appointment.count({ where: { doctorId: 'doc', date: new Date(date), status: 'SCHEDULED' } })).toBe(5);
  }, 60000);

  it('a scheduled and a confirmed appointment share one slot, one per calendar', async () => {
    const date = '2099-06-02';
    await book(date, SLOT, 'SCHEDULED');
    await book(date, SLOT, 'CONFIRMED');
    await expect(book(date, SLOT, 'SCHEDULED')).rejects.toMatchObject({ status: 409 });
    await expect(book(date, SLOT, 'CONFIRMED')).rejects.toMatchObject({ status: 409 });
  }, 60000);

  it('a concurrent cancel and confirm never leave the appointment CONFIRMED once the cancel succeeded', async () => {
    const rounds = 20;
    const outcomes: string[] = [];
    for (let round = 0; round < rounds; round++) {
      const date = `2099-07-${String(round + 1).padStart(2, '0')}`;
      const appointment = await book(date);
      const [cancelled, confirmed] = await Promise.allSettled([
        sleep(round % 10).then(() => service.remove(appointment.id, 'branch')),
        confirm(appointment.id, date),
      ]);
      expect(cancelled).toMatchObject({ status: 'fulfilled', value: { message: 'Appointment cancelled successfully' } });
      expect(await statusOf(appointment.id)).toBe('CANCELLED');
      if (confirmed.status === 'rejected') {
        expect([400, 409]).toContain(confirmed.reason.status);
        outcomes.push('cancelled, confirm refused');
      } else {
        expect(confirmed.value.status).toBe('CONFIRMED');
        outcomes.push('confirmed, then cancelled');
      }
    }
    expect(outcomes).toHaveLength(rounds);
  }, 120000);

  it('a repeated confirm succeeds both times and keeps the appointment confirmed', async () => {
    const date = '2099-06-03';
    const appointment = await book(date);
    const first = await confirm(appointment.id, date);
    const second = await confirm(appointment.id, date);
    expect(first).toMatchObject({ status: 'CONFIRMED', slot: SLOT });
    expect(second).toMatchObject({ status: 'CONFIRMED', slot: SLOT, tokenNumber: first.tokenNumber });
  }, 60000);

  it('simultaneous identical confirms of one appointment both succeed', async () => {
    const date = '2099-06-04';
    const appointment = await book(date);
    const results = await Promise.allSettled([confirm(appointment.id, date), confirm(appointment.id, date)]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await statusOf(appointment.id)).toBe('CONFIRMED');
  }, 60000);
});
