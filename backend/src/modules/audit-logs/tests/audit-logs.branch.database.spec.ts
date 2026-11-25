import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { AuditLogsService } from '../audit-logs.service';

const databaseTests = process.env.AUDIT_LOGS_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Audit log reads on PostgreSQL stay inside the reader’s branch', () => {
  const schema = `audit_logs_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let service: AuditLogsService;
  let created = false;

  beforeAll(async () => {
    const url = new URL(process.env.AUDIT_LOGS_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')],
      { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url.toString() } });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    await db.branch.createMany({ data: [{ id: 'here', name: 'Here', address: 'Synthetic' }, { id: 'there', name: 'There', address: 'Synthetic' }] });
    const staff = (id: string, branchId: string) =>
      db.user.create({ data: { id, firstName: id, lastName: 'Staff', email: `${id}@example.test`, password: 'x', role: 'OWNER', branchId } });
    await staff('owner-here', 'here');
    await staff('nurse-here', 'here');
    await staff('owner-there', 'there');
    await db.auditLog.createMany({
      data: [
        { id: 'log-here', userId: 'owner-here', action: 'BRANCH_UPDATED', entity: 'Branch', entityId: 'here', newValues: '{"phone":"1"}' },
        { id: 'log-nurse', userId: 'nurse-here', action: 'UPDATE', entity: 'Patient', entityId: 'pat-1' },
        { id: 'log-there', userId: 'owner-there', action: 'UPDATE', entity: 'Patient', entityId: 'pat-1', newValues: '{"name":"Someone else"}' },
        { id: 'log-system', userId: null, action: 'CREATE', entity: 'Appointment', entityId: 'apt-1' },
      ],
    });
    service = new AuditLogsService(db as any);
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();

  it('lists only entries made by staff of the reader’s branch', async () => {
    const page = await service.findAll({}, 'here');
    expect(ids(page.data)).toEqual(['log-here', 'log-nurse']);
    expect(page.pagination.total).toBe(2);
  });

  it('finds nothing when filtering for someone from another branch', async () => {
    expect((await service.findAll({ userId: 'owner-there' }, 'here')).data).toEqual([]);
    expect((await service.findByUser('owner-there', {}, 'here')).data).toEqual([]);
  });

  it('keeps entity history, single entries and exports inside the branch', async () => {
    expect(ids(await service.findByEntity('Patient', 'pat-1', 'here'))).toEqual(['log-nurse']);
    expect(await service.findOne('log-there', 'here')).toBeNull();
    expect((await service.findOne('log-here', 'here'))?.id).toBe('log-here');
    expect(ids(await service.exportLogs({}, 'json', 'here'))).toEqual(['log-here', 'log-nurse']);
    expect(await service.exportLogs({}, 'csv', 'here')).not.toContain('log-there');
  });

  it('counts only the branch’s entries and names every kind of record it touched', async () => {
    const stats = await service.getStatistics(undefined, undefined, 'here');
    expect(stats.totalLogs).toBe(2);
    expect(stats.actionBreakdown.map((row) => row.action).sort()).toEqual(['BRANCH_UPDATED', 'UPDATE']);
    expect(stats.entityBreakdown.map((row) => row.entity).sort()).toEqual(['Branch', 'Patient']);
    expect(stats.topUsers.map((row) => row.userId).sort()).toEqual(['nurse-here', 'owner-here']);
  });
});
