import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { PatientsService } from '../patients.service';
import { PatientsController } from '../patients.controller';
import { ReportsService } from '../../reports/reports.service';
import { PharmacyService } from '../../pharmacy/pharmacy.service';
import { ROLE_PERMISSIONS } from '../../../shared/access/role-permissions';

const databaseTests = process.env.CLINIC_COUNTS_TEST_DATABASE_URL
  ? describe
  : describe.skip;
databaseTests('Next appointment and clinic counts on PostgreSQL', () => {
  const schema = `clinic_counts_${randomUUID().replaceAll('-', '')}`;
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  let admin: PrismaClient;
  let db: PrismaClient;
  let patients: PatientsService;
  let created = false;

  const day = (offset: number) =>
    new Date(Date.parse(`${today}T00:00:00.000Z`) + offset * 86_400_000);
  const book = (
    patientId: string,
    date: Date,
    slot: string,
    status = 'SCHEDULED',
    branchId = 'branch',
  ) =>
    db.appointment.create({
      data: {
        patientId,
        doctorId: branchId === 'branch' ? 'doc' : 'doc-elsewhere',
        branchId,
        date,
        slot,
        status: status as any,
      },
    });
  const batch = (
    name: string,
    stock: {
      currentStock: number;
      heldStock?: number;
      minStockLevel?: number | null;
      reorderLevel?: number | null;
    },
    branchId = 'branch',
  ) =>
    db.inventoryItem.create({
      data: {
        name,
        type: 'MEDICINE',
        costPrice: 1,
        sellingPrice: 2,
        unit: 'PIECES',
        branchId,
        ...stock,
      } as any,
    });

  beforeAll(async () => {
    jest.useFakeTimers({
      now: new Date(`${today}T11:30:00+05:30`),
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
    const url = new URL(process.env.CLINIC_COUNTS_TEST_DATABASE_URL!);
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
    for (const id of ['branch', 'elsewhere'])
      await db.branch.create({ data: { id, name: id, address: 'Synthetic' } });
    await db.user.create({
      data: {
        id: 'doc',
        firstName: 'Shravya',
        lastName: 'Rao',
        email: 'doc@example.test',
        password: 'x',
        role: 'DOCTOR',
        branchId: 'branch',
      },
    });
    await db.user.create({
      data: {
        id: 'doc-elsewhere',
        firstName: 'Other',
        lastName: 'Doctor',
        email: 'other@example.test',
        password: 'x',
        role: 'DOCTOR',
        branchId: 'elsewhere',
      },
    });
    await db.user.create({
      data: {
        id: 'manager',
        firstName: 'Mina',
        lastName: 'Manager',
        email: 'manager@example.test',
        password: 'x',
        role: 'MANAGER',
        branchId: 'branch',
        permissions: JSON.stringify(ROLE_PERMISSIONS.MANAGER),
      },
    });
    for (const [id, branchId] of [
      ['later-today', 'branch'],
      ['in-slot', 'branch'],
      ['tomorrow', 'branch'],
      ['none', 'branch'],
      ['away', 'elsewhere'],
    ]) {
      await db.patient.create({
        data: {
          id,
          name: `Synthetic ${id}`,
          gender: 'F',
          phone: `9${Math.floor(Math.random() * 1e9)}`,
          branchId,
        },
      });
    }
    patients = new PatientsService(db as any, {} as any, {} as any);
  }, 180000);

  afterAll(async () => {
    jest.useRealTimers();
    await db?.$disconnect();
    if (created)
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('finds a booking at 11:30 later today, skipping the morning slot already over and a cancelled one', async () => {
    await book('later-today', day(0), '09:30-09:45');
    await book('later-today', day(0), '12:00-12:15', 'CANCELLED');
    await book('later-today', day(0), '15:00-15:30');
    await book('later-today', day(2), '10:00-10:15');

    const next = await patients.getNextAppointment('later-today', 'branch');

    expect([
      next?.slot,
      next?.date.toISOString().slice(0, 10),
      next?.doctor,
    ]).toEqual([
      '15:00-15:30',
      today,
      { firstName: 'Shravya', lastName: 'Rao' },
    ]);
  });

  it('keeps an appointment whose slot is still running, and skips completed and no-show ones', async () => {
    await book('in-slot', day(0), '11:00-11:30', 'COMPLETED');
    await book('in-slot', day(0), '11:15-11:45', 'NO_SHOW');
    await book('in-slot', day(0), '11:20-11:40', 'CHECKED_IN');

    expect((await patients.getNextAppointment('in-slot', 'branch'))?.slot).toBe(
      '11:20-11:40',
    );
  });

  it('moves to a later day once today is over, and answers with JSON when nothing is booked', async () => {
    await book('tomorrow', day(0), '09:00-09:15');
    await book('tomorrow', day(1), '18:00-18:15');
    const controller = new PatientsController(patients);
    const req = { user: { branchId: 'branch' } } as any;

    expect(
      (await patients.getNextAppointment('tomorrow', 'branch'))?.date
        .toISOString()
        .slice(0, 10),
    ).toBe(day(1).toISOString().slice(0, 10));
    expect(await controller.getNextAppointment('none', req)).toEqual({
      appointment: null,
    });
  });

  it('counts upcoming appointments by the same rule, per branch and without a cap', async () => {
    await book('away', day(0), '23:00-23:15', 'SCHEDULED', 'elsewhere');
    for (let i = 0; i < 11; i++) await book('none', day(3 + i), '10:00-10:15');

    const alerts = await new ReportsService(db as any).getSystemAlerts(
      'branch',
      { id: 'manager' },
    );

    expect([
      alerts.counts.upcomingAppointments,
      alerts.upcomingAppointments.length,
      alerts.upcomingAppointments[0].slot,
    ]).toEqual([15, 10, '11:20-11:40']);
  });

  it('gives Pharmacy Desk and the alerts the same low-stock count: available stock at or below the minimum, else the reorder level', async () => {
    await batch('At minimum', {
      currentStock: 5,
      minStockLevel: 5,
      reorderLevel: 10,
    });
    await batch('Above minimum, below reorder level', {
      currentStock: 8,
      minStockLevel: 5,
      reorderLevel: 10,
    });
    await batch('Held stock takes it under', {
      currentStock: 7,
      heldStock: 3,
      minStockLevel: 5,
    });
    await batch('No minimum, at reorder level', {
      currentStock: 10,
      reorderLevel: 10,
    });
    await batch('No thresholds', { currentStock: 0 });
    await batch(
      'Other branch',
      { currentStock: 0, minStockLevel: 5 },
      'elsewhere',
    );

    const alerts = await new ReportsService(db as any).getSystemAlerts(
      'branch',
      { id: 'manager' },
    );
    const desk = await new PharmacyService(db as any).getDashboard('branch');

    expect([
      alerts.counts.lowStockAlerts,
      desk.lowStockDrugs,
      alerts.lowStockAlerts.map((i: any) => i.itemName).sort(),
    ]).toEqual([
      3,
      3,
      [
        'At minimum',
        'Held stock takes it under',
        'No minimum, at reorder level',
      ],
    ]);
  });
});
