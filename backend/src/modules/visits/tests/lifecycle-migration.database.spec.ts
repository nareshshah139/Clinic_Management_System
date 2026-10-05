import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';

const databaseTests = process.env.VISIT_LIFECYCLE_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Additive lifecycle migration', () => {
  const schema = `visit_migration_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let created = false;
  const auditTime = new Date('2020-01-02T03:04:05Z');
  beforeAll(async () => {
    const url = new URL(process.env.VISIT_LIFECYCLE_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    db = new PrismaClient({ datasourceUrl: url.toString() });
    await db.$executeRawUnsafe('CREATE TABLE visits (id TEXT PRIMARY KEY, "appointmentId" TEXT, plan TEXT, "updatedAt" TIMESTAMP NOT NULL)');
    await db.$executeRawUnsafe('CREATE TABLE appointments (id TEXT PRIMARY KEY, status TEXT, "updatedAt" TIMESTAMP NOT NULL)');
    await db.$executeRawUnsafe('CREATE TABLE prescriptions (id TEXT PRIMARY KEY, "visitId" TEXT)');
    await db.$executeRaw`INSERT INTO appointments VALUES ('completed', 'COMPLETED', ${auditTime.toISOString()}::timestamp), ('scheduled', 'SCHEDULED', ${auditTime.toISOString()}::timestamp)`;
    const fixtures = [
      ['compact', null, '{"deleted":true,"deletedAt":"2021-01-01T00:00:00Z"}'],
      ['whitespace', null, '{ "deleted"  :  true, "deletedAt" : "bad-date" }'],
      ['invalid', null, 'Legacy notes {"deleted": true'],
      ['nested', null, '{"data":{"deleted":true}}'],
      ['string', null, '{"deleted":"true"}'],
      ['completed', 'completed', '{"finalNotes":"Historical completion"}'],
      ['walk-in', null, '{"finalNotes":"Not proof of completion"}'],
      ['scheduled', 'scheduled', null],
    ];
    for (const [id, appointmentId, plan] of fixtures) await db.$executeRaw`INSERT INTO visits VALUES (${id}, ${appointmentId}, ${plan}, ${auditTime.toISOString()}::timestamp)`;
    await db.$executeRaw`INSERT INTO prescriptions VALUES ('legacy-rx', 'completed')`;
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'execute', '--url', url.toString(), '--file', resolve('prisma/migrations/20261005093000_visit_prescription_lifecycle/migration.sql')], { stdio: 'pipe' });
  }, 60000);
  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });
  it('backfills only top-level boolean deletion independent of whitespace and retains audit timestamps', async () => {
    const rows = await db.$queryRaw<{ id: string; deletedAt: Date | null; updatedAt: Date }[]>`SELECT id, "deletedAt", "updatedAt" FROM visits ORDER BY id`;
    expect(rows.filter(row => row.deletedAt).map(row => row.id)).toEqual(['compact', 'whitespace']);
    expect(rows.find(row => row.id === 'compact')?.deletedAt).toEqual(new Date('2021-01-01T00:00:00Z'));
    expect(rows.find(row => row.id === 'whitespace')?.deletedAt).toEqual(auditTime);
    expect(rows.every(row => row.updatedAt.getTime() === auditTime.getTime())).toBe(true);
  });
  it('uses only completed linked appointments as legacy completion evidence', async () => {
    const rows = await db.$queryRaw<{ id: string; status: string; completedAt: Date | null }[]>`SELECT id, status, "completedAt" FROM visits ORDER BY id`;
    expect(rows.filter(row => row.status === 'COMPLETED')).toEqual([{ id: 'completed', status: 'COMPLETED', completedAt: auditTime }]);
    expect(rows.find(row => row.id === 'walk-in')).toEqual({ id: 'walk-in', status: 'IN_PROGRESS', completedAt: null });
  });
  it('detaches legacy deleted appointment visits while preserving clinical history and cancellation state', async () => {
    for (const status of ['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'SCHEDULED']) {
      const id = `deleted-${status}`;
      await db.$executeRaw`INSERT INTO appointments VALUES (${id}, ${status}, ${auditTime.toISOString()}::timestamp)`;
      await db.$executeRaw`INSERT INTO visits (id, "appointmentId", plan, "updatedAt", "deletedAt", status, "completedAt") VALUES (${id}, ${id}, '{"notes":"Retain audit history"}', ${auditTime.toISOString()}::timestamp, ${auditTime.toISOString()}::timestamp, 'COMPLETED', ${auditTime.toISOString()}::timestamp)`;
    }
    const url = new URL(process.env.VISIT_LIFECYCLE_TEST_DATABASE_URL!);
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'execute', '--url', url.toString(), '--file', resolve('prisma/migrations/20261005120000_deleted_visit_appointment_link/migration.sql')], { stdio: 'pipe' });
    const rows = await db.$queryRaw<{ id: string; appointmentId: string | null; deletedAppointmentId: string; plan: string; status: string; completedAt: Date; updatedAt: Date }[]>`SELECT id, "appointmentId", "deletedAppointmentId", plan, status, "completedAt", "updatedAt" FROM visits WHERE id LIKE 'deleted-%'`;
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row).toEqual({ id: row.id, appointmentId: null, deletedAppointmentId: row.id, plan: '{"notes":"Retain audit history"}', status: 'COMPLETED', completedAt: auditTime, updatedAt: auditTime });
    }
    const appointments = await db.$queryRaw<{ id: string; status: string; updatedAt: Date }[]>`SELECT id, status, "updatedAt" FROM appointments ORDER BY id`;
    expect(appointments).toEqual([
      { id: 'completed', status: 'COMPLETED', updatedAt: auditTime },
      { id: 'deleted-CANCELLED', status: 'CANCELLED', updatedAt: auditTime },
      { id: 'deleted-COMPLETED', status: 'CHECKED_IN', updatedAt: auditTime },
      { id: 'deleted-IN_PROGRESS', status: 'CHECKED_IN', updatedAt: auditTime },
      { id: 'deleted-SCHEDULED', status: 'SCHEDULED', updatedAt: auditTime },
      { id: 'scheduled', status: 'SCHEDULED', updatedAt: auditTime },
    ]);
    const activeLink = await db.$queryRaw<{ appointmentId: string; deletedAppointmentId: string | null }[]>`SELECT "appointmentId", "deletedAppointmentId" FROM visits WHERE id = 'completed'`;
    expect(activeLink).toEqual([{ appointmentId: 'completed', deletedAppointmentId: null }]);
  });
  it('gives legacy prescriptions ACTIVE status, zero allowance and no inferred expiry', async () => {
    const rows = await db.$queryRaw<{ status: string; maxRefills: number; validUntil: Date | null }[]>`SELECT status, "maxRefills", "validUntil" FROM prescriptions`;
    expect(rows).toEqual([{ status: 'ACTIVE', maxRefills: 0, validUntil: null }]);
  });
});
