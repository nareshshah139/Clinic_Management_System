import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { ClinicBillRegisterService } from '../clinic-bill-register.service';
import { VOID } from '../clinic-bill-register';
import { ReportsService } from '../../reports/reports.service';
import { clinicDay, financialYear } from '../../pharmacy/register-utils';

const databaseTests = process.env.BILLING_TEST_DATABASE_URL
  ? describe
  : describe.skip;

/** The overdue alert's number is the number of rows its link opens: the register's overdue filter. */
databaseTests('Overdue clinic bills: alert count and register list', () => {
  const schema = `clinic_bill_overdue_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let register: ClinicBillRegisterService;
  let reports: ReportsService;
  let created = false;
  const DAY = 86_400_000;
  const doctor = { id: 'doc', role: 'DOCTOR' };

  beforeAll(async () => {
    const url = new URL(process.env.BILLING_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    execFileSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'db',
        'push',
        '--skip-generate',
        '--schema',
        resolve('prisma/schema.prisma'),
      ],
      { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url.toString() } },
    );
    db = new PrismaClient({ datasourceUrl: url.toString() });
    register = new ClinicBillRegisterService(db as any);
    reports = new ReportsService(db as any);

    for (const id of ['A', 'B'])
      await db.branch.create({
        data: { id, name: `Branch ${id}`, address: 'Synthetic' },
      });
    await db.user.create({
      data: {
        id: 'doc',
        firstName: 'Dr',
        lastName: 'Doc',
        email: 'doc@example.test',
        password: 'x',
        role: 'DOCTOR',
        branchId: 'A',
      },
    });
    for (const [id, branchId] of [
      ['p', 'A'],
      ['q', 'B'],
    ])
      await db.patient.create({
        data: {
          id,
          name: `Synthetic ${id}`,
          gender: 'F',
          phone: '9000000001',
          branchId,
        },
      });

    const bill = (
      id: string,
      dueInDays: number | null,
      more: Record<string, unknown> = {},
    ) =>
      db.newInvoice.create({
        data: {
          id,
          invoiceNo: id,
          patientId: 'p',
          branchId: 'A',
          total: 100,
          balance: 100,
          dueDate:
            dueInDays === null ? null : new Date(Date.now() + dueInDays * DAY),
          ...more,
        },
      });
    await bill('past-due', -1);
    await bill('part-paid-past-due', -5, { received: 40, balance: 60 });
    await bill('last-year-past-due', -380, {
      createdAt: new Date(Date.now() - 400 * DAY),
    });
    await bill('not-due', 3);
    await bill('undated', null);
    await bill('settled', -1, { received: 100, balance: 0 });
    await bill('void', -1, { status: VOID });
    await bill('other-branch', -1, { branchId: 'B', patientId: 'q' });
    const today = clinicDay(new Date());
    const yesterday = clinicDay(new Date(Date.now() - DAY));
    await bill('due-today', null, { dueDate: new Date(today) });
    await bill('due-yesterday', null, { dueDate: new Date(yesterday) });
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created)
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('lists exactly the bills the alert counts, including ones billed before the period, and not a bill due today', async () => {
    const alerts = (await reports.getSystemAlerts('A', doctor)) as {
      counts: { overdueInvoices: number };
      overdueInvoices: { invoiceNo: string }[];
    };
    const listed = await register.list(
      {
        ...financialYear(clinicDay(new Date())),
        status: 'overdue',
        sortBy: 'billedAt',
        sortDir: 'desc',
        page: 1,
        limit: 50,
      },
      doctor,
      'A',
    );

    const expected = ['due-yesterday', 'last-year-past-due', 'part-paid-past-due', 'past-due'];
    expect(listed.rows.map((row) => row.billNo).sort()).toEqual(expected);
    expect(listed.total).toBe(alerts.counts.overdueInvoices);
    expect(alerts.overdueInvoices.map((row) => row.invoiceNo).sort()).toEqual(
      expected,
    );
    expect(listed.totals).toMatchObject({ count: 4, outstanding: 360 });
  });
});
