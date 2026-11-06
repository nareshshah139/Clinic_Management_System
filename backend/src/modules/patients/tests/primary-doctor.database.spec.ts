import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { PatientsService } from '../patients.service';
import { VisitsService } from '../../visits/visits.service';

const MIGRATION = resolve('prisma/migrations/20261106120000_patient_primary_doctor/migration.sql');
const databaseTests = process.env.PRIMARY_DOCTOR_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Patient primary doctor on PostgreSQL', () => {
  const schema = `primary_doctor_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let url: URL;
  let patients: PatientsService;
  let visits: VisitsService;
  let created = false;

  const prisma = (...args: string[]) => execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), ...args],
    { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url.toString() } });
  const doctor = (id: string, firstName: string, lastName: string, branchId = 'branch', role = 'DOCTOR') =>
    db.user.create({ data: { id, firstName, lastName, email: `${id}@example.test`, password: 'x', role: role as any, branchId } });
  const register = (name: string, creator?: { id: string; role: string }, primaryDoctorId?: string | null) =>
    patients.create({ name, gender: 'FEMALE', phone: `9${Math.floor(Math.random() * 1e9)}`, primaryDoctorId } as any, 'branch', creator);
  const visit = (patientId: string, doctorId: string) => visits.create({ patientId, doctorId, complaints: [{ complaint: 'Synthetic' }] } as any, 'branch');

  beforeAll(async () => {
    url = new URL(process.env.PRIMARY_DOCTOR_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    prisma('db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma'));
    db = new PrismaClient({ datasourceUrl: url.toString() });
    for (const id of ['branch', 'other-branch']) await db.branch.create({ data: { id, name: id, address: 'Synthetic' } });
    await doctor('praneeta', 'Dr. Praneeta', 'Jain');
    await doctor('rahul', 'Rahul', 'Mehta');
    await doctor('asha', 'Asha', 'Rao');
    await doctor('elsewhere', 'Elsewhere', 'Doctor', 'other-branch');
    patients = new PatientsService(db as any, {} as any, {} as any);
    visits = new VisitsService(db as any);
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('makes the registering doctor the primary doctor unless another is chosen', async () => {
    expect((await register('By doctor', { id: 'rahul', role: 'DOCTOR' })).primaryDoctorId).toBe('rahul');
    expect((await register('Chosen', { id: 'rahul', role: 'DOCTOR' }, 'asha')).primaryDoctorId).toBe('asha');
    expect((await register('By reception', { id: 'reception', role: 'RECEPTION' })).primaryDoctorId).toBeNull();
  });

  it('assigns the first visit\'s doctor and keeps that assignment on later visits', async () => {
    const patient = await register('Walk in', { id: 'reception', role: 'RECEPTION' });
    await visit(patient.id, 'asha');
    await visit(patient.id, 'rahul');
    expect((await patients.findOne(patient.id, 'branch')).primaryDoctor).toMatchObject({ id: 'asha', firstName: 'Asha' });
  });

  it('lists only a doctor\'s own patients with their latest visit', async () => {
    const mine = await register('Mine', { id: 'praneeta', role: 'DOCTOR' });
    const seen = await visit(mine.id, 'praneeta');
    const list = await patients.findAll({ page: 1, limit: 50, primaryDoctorId: 'praneeta' }, 'branch');
    expect(list.data.map(p => p.id)).toEqual([mine.id]);
    expect(list.data[0]).toMatchObject({ primaryDoctor: { id: 'praneeta' }, lastVisitAt: seen.createdAt });
  });

  it('rejects a primary doctor outside the branch and allows clearing it', async () => {
    const patient = await register('Reassigned', { id: 'rahul', role: 'DOCTOR' });
    await expect(patients.update(patient.id, { primaryDoctorId: 'elsewhere' } as any, 'branch')).rejects.toThrow('active doctor in this branch');
    await expect(patients.update(patient.id, { primaryDoctorId: 'nobody' } as any, 'branch')).rejects.toThrow('active doctor in this branch');
    expect((await patients.update(patient.id, { primaryDoctorId: null } as any, 'branch')).primaryDoctorId).toBeNull();
    expect((await patients.update(patient.id, { primaryDoctorId: 'asha' } as any, 'branch')).primaryDoctorId).toBe('asha');
  });

  it('migration tags every existing unassigned patient to Dr. Praneeta Jain in her branch and keeps other assignments', async () => {
    await db.patient.create({ data: { id: 'legacy', name: 'Legacy', gender: 'F', phone: '1', branchId: 'branch' } });
    await db.patient.create({ data: { id: 'legacy-other-branch', name: 'Elsewhere', gender: 'F', phone: '2', branchId: 'other-branch' } });
    const before = await db.patient.findMany({ where: { primaryDoctorId: { not: null } }, select: { id: true, primaryDoctorId: true } });
    prisma('db', 'execute', '--url', url.toString(), '--file', MIGRATION);
    prisma('db', 'execute', '--url', url.toString(), '--file', MIGRATION);
    const after = await db.patient.findMany({ select: { id: true, primaryDoctorId: true } });
    const byId = new Map(after.map(p => [p.id, p.primaryDoctorId]));
    expect(byId.get('legacy')).toBe('praneeta');
    expect(byId.get('legacy-other-branch')).toBeNull();
    before.forEach(p => expect(byId.get(p.id)).toBe(p.primaryDoctorId));
    expect(after.filter(p => p.primaryDoctorId === null).map(p => p.id)).toEqual(['legacy-other-branch']);
  });
});
