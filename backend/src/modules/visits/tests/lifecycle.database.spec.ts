import { PrismaClient, Visit, User, Patient } from '@prisma/client';
import { ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { VisitsService } from '../visits.service';
import { PrescriptionsService } from '../../prescriptions/prescriptions.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { UpdateVisitDto } from '../dto/create-visit.dto';

const databaseTests = process.env.VISIT_LIFECYCLE_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Visit and prescription lifecycle against PostgreSQL', () => {
  const schema = `visit_lifecycle_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let created = false;
  let branchId: string;
  let otherBranchId: string;
  let patient: Patient;
  let foreignPatient: Patient;
  let doctor: User;
  let visits: VisitsService;
  let prescriptions: PrescriptionsService;

  beforeAll(async () => {
    const url = new URL(process.env.VISIT_LIFECYCLE_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    branchId = (await db.branch.create({ data: { name: 'SYNTHETIC Lifecycle', address: 'Test' } })).id;
    otherBranchId = (await db.branch.create({ data: { name: 'SYNTHETIC Other', address: 'Test' } })).id;
    doctor = await db.user.create({ data: { branchId, firstName: 'Synthetic', lastName: 'Doctor', email: `${randomUUID()}@example.invalid`, password: 'NO_LOGIN', role: 'DOCTOR' } });
    foreignPatient = await db.patient.create({ data: { branchId: otherBranchId, name: 'SYNTHETIC Foreign', phone: '0000000000', gender: 'FEMALE' } });
    visits = new VisitsService(db as PrismaService);
    prescriptions = new PrescriptionsService(db as PrismaService, {} as NotificationsService);
  }, 60000);
  beforeEach(async () => {
    patient = await db.patient.create({ data: { branchId, name: 'SYNTHETIC Patient', phone: '0000000000', gender: 'FEMALE' } });
  });
  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });
  const visit = (data: Partial<Visit> = {}) => db.visit.create({ data: { patientId: patient.id, doctorId: doctor.id, complaints: '[]', ...data } });
  const rx = async (maxRefills = 0) => db.prescription.create({ data: { visitId: (await visit()).id, items: '[]', maxRefills } });
  const draft = (patientId: string, scope: string) => visits.createDraftAttachment(patientId, '20261005', scope, { preferredExt: 'png', contentType: 'image/png', buffer: Buffer.from('SYNTHETIC') });

  it('persists walk-in completion and preserves the first timestamp and notes on retry', async () => {
    const v = await visit();
    const first = await visits.complete(v.id, { finalNotes: 'First completion' }, branchId);
    const repeated = await visits.complete(v.id, { finalNotes: 'Must not overwrite' }, branchId);
    expect(first).toMatchObject({ status: 'COMPLETED', version: 1 });
    expect(first.completedAt).toBeInstanceOf(Date);
    expect(repeated.completedAt).toEqual(first.completedAt);
    expect(repeated.updatedAt).toEqual(first.updatedAt);
    expect(repeated.plan).toEqual({ finalNotes: 'First completion' });
    const history = await visits.getPatientVisitHistory({ patientId: patient.id }, branchId);
    expect(history.visits[0]).toMatchObject({ status: 'COMPLETED', completedAt: first.completedAt });
  });

  it('commits appointment completion with the visit and rolls both back on a database failure', async () => {
    const appointment = await db.appointment.create({ data: { patientId: patient.id, doctorId: doctor.id, branchId, date: new Date(), slot: '10:00', status: 'IN_PROGRESS' } });
    const v = await visit({ appointmentId: appointment.id });
    await db.$executeRawUnsafe(`ALTER TABLE appointments ADD CONSTRAINT synthetic_completion_failure CHECK (status <> 'COMPLETED')`);
    try {
      await expect(visits.complete(v.id, {}, branchId)).rejects.toThrow();
      expect(await db.visit.findUnique({ where: { id: v.id } })).toEqual(v);
      expect((await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe('IN_PROGRESS');
    } finally {
      await db.$executeRawUnsafe('ALTER TABLE appointments DROP CONSTRAINT synthetic_completion_failure');
    }
    const result = await visits.complete(v.id, {}, branchId);
    expect(result.status).toBe('COMPLETED');
    expect(result.appointment?.status).toBe('COMPLETED');
  });

  it('hides deleted visits from every normal read while preserving clinical audit data', async () => {
    const old = await visit({ history: '{"personalHistory":"Keep older active"}', createdAt: new Date('2020-01-01') });
    const v = await visit({ history: '{"personalHistory":"Deleted snapshot"}', plan: '{"notes":"Preserve"}' });
    const count = (await visits.getVisitStatistics(branchId)).totalVisits;
    await visits.remove(v.id, branchId);
    expect((await db.visit.findUniqueOrThrow({ where: { id: v.id } })).plan).toBe('{"notes":"Preserve"}');
    expect((await visits.findAll({ patientId: patient.id }, branchId)).visits.map(row => row.id)).toEqual([old.id]);
    expect((await visits.getPatientVisitHistory({ patientId: patient.id }, branchId)).visits.map(row => row.id)).toEqual([old.id]);
    expect((await visits.getDoctorVisits({ doctorId: doctor.id }, branchId)).visits.some(row => row.id === v.id)).toBe(false);
    expect((await visits.getVisitStatistics(branchId, undefined, '2099-01-01')).totalVisits).toBe(count - 1);
    expect(await visits.getPatientPersonalHistory(patient.id, branchId)).toEqual({ personalHistory: 'Keep older active' });
    await expect(visits.findOne(v.id, branchId)).rejects.toThrow('Visit not found');
    await expect(visits.complete(v.id, {}, branchId)).rejects.toThrow('Visit not found');
  });

  it('rejects deletion when a prescription or legacy attachment exists', async () => {
    const p = await rx();
    await expect(visits.remove(p.visitId, branchId)).rejects.toThrow('associated prescription');
    const v = await visit({ attachments: '["/uploads/visits/photo.jpg"]' });
    await expect(visits.remove(v.id, branchId)).rejects.toThrow('attachments');
    expect((await db.visit.findUniqueOrThrow({ where: { id: v.id } })).deletedAt).toBeNull();
  });

  it('preserves omission and persists exact clinical clears through validation and reload', async () => {
    const v = await visit({ vitals: '{"heartRate":80,"weight":60}', diagnosis: '[{"diagnosis":"Old"}]', history: '{"personalHistory":"Old","pastHistory":"Keep"}', followUp: new Date('2026-10-01'), plan: '{"followUpInstructions":"Old","investigations":["Old"],"dermatology":{"procedures":[{"type":"Old"}],"counseling":"Keep"}}' });
    const input = await new ValidationPipe({ transform: true, whitelist: true }).transform({ version: 0, vitals: { heartRate: null }, diagnosis: [], history: { personalHistory: '' }, treatmentPlan: { followUpDate: null, followUpInstructions: '', investigations: [], dermatology: { procedures: [] } } }, { type: 'body', metatype: UpdateVisitDto });
    await visits.update(v.id, input, branchId);
    expect(await visits.findOne(v.id, branchId)).toMatchObject({ version: 1, vitals: { heartRate: null, weight: 60 }, diagnosis: [], history: { personalHistory: '', pastHistory: 'Keep' }, followUp: null, plan: { followUpDate: null, followUpInstructions: '', investigations: [], dermatology: { procedures: [], counseling: 'Keep' } } });
    await expect(visits.update(v.id, { version: 0, notes: 'Stale' }, branchId)).rejects.toThrow('Visit changed');
  });

  it('rejects one of two saves based on the same visit snapshot', async () => {
    const v = await visit();
    const results = await Promise.allSettled([visits.update(v.id, { version: 0, notes: 'One' }, branchId), visits.update(v.id, { version: 0, notes: 'Two' }, branchId)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect((await db.visit.findUniqueOrThrow({ where: { id: v.id } })).version).toBe(1);
  });

  it('does not mutate saved attachment documents or timestamps while listing', async () => {
    const v = await visit({ attachments: '["/outside/no-such-file.jpg"]' });
    expect(await visits.listAttachments(v.id, branchId)).toEqual({ attachments: [], items: [], visitVersion: 0 });
    await visits.findOne(v.id, branchId);
    await visits.getPatientVisitHistory({ patientId: patient.id }, branchId);
    expect(await db.visit.findUnique({ where: { id: v.id } })).toEqual(v);
  });

  it('acknowledges the exact visit version after photo mutations', async () => {
    const v = await visit();
    const added = await visits.createVisitAttachment(v.id, branchId, { preferredExt: 'png', contentType: 'image/png', buffer: Buffer.from('SYNTHETIC') });
    expect(added.visitVersion).toBe(1);
    await expect(visits.update(v.id, { version: 0, notes: 'Stale photo version' }, branchId)).rejects.toThrow('Visit changed');
    const removed = await visits.deleteVisitAttachment(v.id, added.id, branchId);
    expect(removed.visitVersion).toBe(2);
    const saved = await visits.update(v.id, { version: removed.visitVersion, notes: 'Acknowledged' }, branchId);
    expect(saved.version).toBe(3);
    expect((await visits.listAttachments(v.id, branchId)).visitVersion).toBe(3);
  });

  it('authorizes every draft operation against the authenticated branch', async () => {
    const file = await draft(foreignPatient.id, otherBranchId);
    await expect(draft(foreignPatient.id, branchId)).rejects.toThrow('Patient not found in this branch');
    await expect(visits.listAllDraftAttachments(foreignPatient.id, branchId)).rejects.toThrow('Patient not found in this branch');
    await expect(visits.listDraftAttachments(foreignPatient.id, '20261005', branchId)).rejects.toThrow('Patient not found in this branch');
    await expect(visits.getDraftAttachmentBinary(foreignPatient.id, '20261005', file.id, branchId)).rejects.toThrow('Patient not found in this branch');
    await expect(visits.deleteDraftAttachment(foreignPatient.id, '20261005', file.id, branchId)).rejects.toThrow('Patient not found in this branch');
    expect((await visits.getDraftAttachmentBinary(foreignPatient.id, '20261005', file.id, otherBranchId)).data.toString()).toBe('SYNTHETIC');
    await visits.deleteDraftAttachment(foreignPatient.id, '20261005', file.id, otherBranchId);
    expect(await db.draftAttachment.count({ where: { id: file.id } })).toBe(0);
  });

  it('imports real catalog fields within the branch and never fabricates stock', async () => {
    const data = { name: 'SYNTHETIC IMPORT', manufacturer: 'Synthetic', packSizeLabel: '10 tablets', price: 10, strength: '1 mg', form: 'tablet' };
    expect(await prescriptions.importDrugs([data, { name: 'Missing required values' }], branchId)).toEqual({ imported: 2, upserts: 1, errors: 1 });
    expect(await prescriptions.importDrugs([data], branchId)).toEqual({ imported: 1, upserts: 1, errors: 0 });
    expect(await db.drug.count({ where: { name: data.name, branchId } })).toBe(1);
    expect(await db.stockTransaction.count()).toBe(0);
    expect(await db.inventoryItem.count()).toBe(0);
  });

  it('learns regimen defaults only from non-cancelled prescriptions on active visits', async () => {
    const drug = await db.drug.create({ data: { branchId, name: 'SYNTHETIC REGIMEN', price: 1, manufacturerName: 'Synthetic', packSizeLabel: '1 tablet' } });
    const cancelled = await rx();
    const active = await rx();
    const deleted = await rx();
    await db.prescription.update({ where: { id: cancelled.id }, data: { status: 'CANCELLED', items: JSON.stringify([{ drugId: drug.id, frequency: 'WRONG CANCELLED' }]) } });
    await db.prescription.update({ where: { id: deleted.id }, data: { items: JSON.stringify([{ drugId: drug.id, frequency: 'WRONG DELETED' }]) } });
    await db.visit.update({ where: { id: deleted.visitId }, data: { deletedAt: new Date() } });
    await db.prescription.update({ where: { id: active.id }, data: { items: JSON.stringify([{ drugId: drug.id, frequency: 'DAILY' }]) } });
    expect(await prescriptions.getMedicineRegimenDefaults(drug.id, branchId, doctor.id)).toEqual({ values: { frequency: 'DAILY', dosePattern: '' }, source: 'clinic', prescriptionCount: 1 });
  });

  it('defaults to ACTIVE with no refill allowance or fabricated review-date expiry', async () => {
    const v = await visit({ followUp: new Date('2026-10-01') });
    const p = await prescriptions.createPrescription({ patientId: patient.id, doctorId: doctor.id, visitId: v.id, items: [{ drugName: 'Synthetic', dosageUnit: 'TABLET', frequency: 'DAILY', duration: 1, durationUnit: 'DAYS' }] } as any, branchId);
    expect(p).toMatchObject({ status: 'ACTIVE', maxRefills: 0, validUntil: null, visit: { version: 1, status: 'IN_PROGRESS', completedAt: null } });
    await expect(prescriptions.requestRefill({ prescriptionId: p.id }, branchId)).rejects.toThrow('Maximum refills exceeded');
    await prescriptions.updatePrescription(p.id, { validUntil: '2099-01-01' }, branchId);
    expect((await db.visit.findUniqueOrThrow({ where: { id: v.id } })).followUp).toEqual(new Date('2026-10-01'));
    expect((await prescriptions.findPrescriptionById(p.id, branchId)).validUntil).toEqual(new Date('2099-01-01'));
  });

  it('audits cancellation, rejects pending refills, and exposes real status on all prescription reads', async () => {
    const p = await rx(1);
    const refill = await prescriptions.requestRefill({ prescriptionId: p.id }, branchId);
    const cancelled = await prescriptions.cancelPrescription(p.id, branchId, 'Clinical reason', doctor.id);
    await prescriptions.cancelPrescription(p.id, branchId, 'Retry reason', 'different-actor');
    expect(await db.prescription.findUnique({ where: { id: p.id } })).toMatchObject({ status: 'CANCELLED', cancelledAt: cancelled.cancelledAt, cancelledBy: doctor.id, cancellationReason: 'Clinical reason', updatedAt: cancelled.updatedAt });
    expect(await db.prescriptionRefill.findUnique({ where: { id: refill.id } })).toMatchObject({ status: 'REJECTED', rejectionReason: 'Prescription cancelled' });
    await expect(prescriptions.updatePrescription(p.id, { notes: 'Blocked' }, branchId)).rejects.toThrow('Cannot update');
    await expect(prescriptions.requestRefill({ prescriptionId: p.id }, branchId)).rejects.toThrow('active prescriptions');
    await expect(prescriptions.approveRefill({ refillId: refill.id }, branchId, doctor.id)).rejects.toThrow('pending refill');
    expect((await prescriptions.findAllPrescriptions({ patientId: patient.id, status: 'CANCELLED' }, branchId)).prescriptions[0].status).toBe('CANCELLED');
    expect((await prescriptions.getPrescriptionHistory({ patientId: patient.id }, branchId))[0].status).toBe('CANCELLED');
    expect((await prescriptions.getPrescriptionStatistics({ doctorId: doctor.id }, branchId)).totalPrescriptions).toBeGreaterThan(0);
    await expect(prescriptions.cancelPrescription(p.id, otherBranchId)).rejects.toThrow('Prescription not found');
  });

  it('serializes concurrent requests and never approves beyond the explicit allowance', async () => {
    const p = await rx(1);
    const requests = await Promise.allSettled([prescriptions.requestRefill({ prescriptionId: p.id }, branchId), prescriptions.requestRefill({ prescriptionId: p.id }, branchId)]);
    expect(requests.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(requests.filter(r => r.status === 'rejected')).toHaveLength(1);
    const first = await db.prescriptionRefill.findFirstOrThrow({ where: { prescriptionId: p.id } });
    const legacySecond = await db.prescriptionRefill.create({ data: { prescriptionId: p.id } });
    const approvals = await Promise.allSettled([prescriptions.approveRefill({ refillId: first.id }, branchId, doctor.id), prescriptions.approveRefill({ refillId: legacySecond.id }, branchId, doctor.id)]);
    expect(approvals.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(approvals.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect(await db.prescriptionRefill.count({ where: { prescriptionId: p.id, status: 'APPROVED' } })).toBe(1);
    await expect(prescriptions.updatePrescription(p.id, { maxRefills: 0 }, branchId)).rejects.toThrow('existing requests and approvals');
    const rows = await prescriptions.findAllRefills({ patientId: patient.id }, branchId);
    expect(rows.refills.map(r => r.prescription.patient.id)).toEqual([patient.id, patient.id]);
    expect((await prescriptions.findAllRefills({ prescriptionId: p.id }, otherBranchId)).refills).toEqual([]);
  });

  it('rejects expired, deleted-visit and cross-branch prescription commands', async () => {
    const p = await rx(1);
    await prescriptions.updatePrescription(p.id, { validUntil: '2000-01-01' }, branchId);
    await expect(prescriptions.requestRefill({ prescriptionId: p.id }, branchId)).rejects.toThrow('expired prescription');
    expect((await prescriptions.getExpiringPrescriptions({ patientId: patient.id }, branchId)).prescriptions[0].id).toBe(p.id);
    await expect(prescriptions.updatePrescription(p.id, { notes: 'Forbidden' }, otherBranchId)).rejects.toThrow('Prescription not found');
    await db.visit.update({ where: { id: p.visitId }, data: { deletedAt: new Date() } });
    expect((await prescriptions.findAllPrescriptions({ patientId: patient.id }, branchId)).prescriptions).toEqual([]);
    await expect(prescriptions.findPrescriptionById(p.id, branchId)).rejects.toThrow('Prescription not found');
    await expect(prescriptions.cancelPrescription(p.id, branchId)).rejects.toThrow('Prescription not found');
  });
});
