import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { Logger } from '@nestjs/common';
import { PatientsService } from '../patients.service';
import { PatientPortalService } from '../portal/patient-portal.service';
import { PatientDeduplicationService } from '../patient-deduplication.service';
import { patientsForNumber } from '../portal/portal-profile';
import { toE164 } from '../portal/phone-e164';
import { readFileSync } from 'fs';
import { PrismaService } from '../../../shared/database/prisma.service';

const databaseTests = process.env.PORTAL_PROFILE_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Patient phone, WhatsApp consent, language and portal switch on PostgreSQL', () => {
  const schema = `portal_profile_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let patients: PatientsService;
  let portal: PatientPortalService;
  let created = false;

  const profile = (patientId: string) => db.patientPortalProfile.findUniqueOrThrow({ where: { patientId } });
  const register = (name: string, phone: string, extra: Record<string, unknown> = {}) =>
    patients.create({ name, gender: 'F', phone, ...extra } as any, 'A');

  beforeAll(async () => {
    Logger.overrideLogger(false);
    process.env.PORTAL_CODE_SECRET ??= 'portal-profile-test-secret';
    const url = new URL(process.env.PORTAL_PROFILE_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')],
      { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url.toString() } });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    patients = new PatientsService(db as any, {} as any, {} as any);
    portal = new PatientPortalService(db as any);
    await db.branch.create({ data: { id: 'A', name: 'Branch A', address: 'Synthetic' } });
    await db.user.create({ data: { id: 'rec', email: 'rec@example.test', password: 'x', firstName: 'R', lastName: 'C', role: 'RECEPTION', branchId: 'A' } as any });
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('PP-01/03/05: registration stores the E.164 number, NOT_ASKED consent and the chosen language, keeping phone as typed digits', async () => {
    const p = await register('Asha', '98765 43210', { preferredLanguage: 'TE' });
    expect(p.phone).toBe('9876543210');
    expect(await profile(p.id)).toMatchObject({ phoneE164: '+919876543210', consentState: 'NOT_ASKED', preferredLanguage: 'TE', portalEnabled: true, phoneConfirmedAt: null });
    const found = await patients.findOne(p.id, 'A');
    expect((found as any).portalProfile).toMatchObject({ phoneE164: '+919876543210', consentState: 'NOT_ASKED', preferredLanguage: 'TE' });
  });

  it('PP-01: an unnormalizable number stores null and reception cannot start WhatsApp consent for it', async () => {
    const p = await register('Bad Number', '4155550100');
    expect((await profile(p.id)).phoneE164).toBeNull();
    await expect(portal.recordConsent(p.id, 'A', 'agreed', 'rec')).rejects.toThrow('no phone number WhatsApp can use');
    expect((await profile(p.id)).consentState).toBe('NOT_ASKED');
  });

  it('PP-03/04: recording agreement moves consent to PENDING with recorder, time and method; refusal moves it to OPTED_OUT', async () => {
    const p = await register('Chitra', '9876500011');
    const pending = await portal.recordConsent(p.id, 'A', 'agreed', 'rec');
    expect(pending).toMatchObject({ consentState: 'PENDING', consentRecordedById: 'rec', consentMethod: 'reception-agreed' });
    expect(pending.consentRecordedAt).toBeInstanceOf(Date);
    expect((await portal.recordConsent(p.id, 'A', 'refused', 'rec')).consentState).toBe('OPTED_OUT');
  });

  it('PP-05: editing the patient changes the preferred language', async () => {
    const p = await register('Divya', '9876500012');
    await patients.update(p.id, { preferredLanguage: 'HI' } as any, 'A');
    expect((await profile(p.id)).preferredLanguage).toBe('HI');
  });

  it('PP-07: saving an international patient again with the stored "+"-less phone keeps the number and consent', async () => {
    const p = await register('Kiran Abroad', '+1 415 555 0101');
    expect(p.phone).toBe('14155550101');
    await portal.recordConsent(p.id, 'A', 'agreed', 'rec');
    await patients.update(p.id, { phone: p.phone, email: 'kiran@example.test' } as any, 'A');
    expect(await profile(p.id)).toMatchObject({ phoneE164: '+14155550101', consentState: 'PENDING' });
  });

  it('PP-01: an 11-digit number typed without "+" (a Brazilian local mobile) stores no WhatsApp number and agreement is refused', async () => {
    const p = await register('Ana Local', '11987654321');
    expect(await profile(p.id)).toMatchObject({ phoneE164: null, consentState: 'NOT_ASKED' });
    await expect(portal.recordConsent(p.id, 'A', 'agreed', 'rec')).rejects.toThrow('no phone number WhatsApp can use');
  });

  it('PP-07: changing the phone resets consent to NOT_ASKED and clears confirmation; saving the same number keeps it', async () => {
    const p = await register('Esha', '9876500013');
    await db.patientPortalProfile.update({ where: { patientId: p.id }, data: { consentState: 'OPTED_IN', phoneConfirmedAt: new Date() } });
    await patients.update(p.id, { phone: '+91 98765 00013', name: 'Esha R' } as any, 'A');
    expect(await profile(p.id)).toMatchObject({ consentState: 'OPTED_IN' });
    await patients.update(p.id, { phone: '9876500099' } as any, 'A');
    expect(await profile(p.id)).toMatchObject({ phoneE164: '+919876500099', consentState: 'NOT_ASKED', phoneConfirmedAt: null, consentMethod: 'phone-changed' });
  });

  it('PP-09: staff can switch the portal off for one patient', async () => {
    const p = await register('Farah', '9876500014');
    expect((await portal.setPortalEnabled(p.id, 'A', false)).portalEnabled).toBe(false);
    expect(await patientsForNumber(db as any, '+919876500014')).toEqual([]);
  });

  it('PP-02: number matching is E.164 equality only, never a prefix or the secondary phone', async () => {
    const a = await register('Gita', '9876500015', { secondaryPhone: '9876500016' });
    await register('Gita Prefix', '98765000151');
    const match = await patientsForNumber(db as any, '+919876500015');
    expect(match.map((m) => m.patientId)).toEqual([a.id]);
    expect(await patientsForNumber(db as any, '+919876500016')).toEqual([]);
    expect(await patientsForNumber(db as any, '+91987650001')).toEqual([]);
  });

  it('PP-10: merging duplicates keeps one profile where opt-out wins and a disabled portal wins', async () => {
    const kept = await db.patient.create({ data: { name: 'Hema Dup', gender: 'F', phone: '9876500017', branchId: 'A', createdAt: new Date('2026-01-01') } });
    const dup = await db.patient.create({ data: { name: 'Hema Dup', gender: 'F', phone: '9876500017', branchId: 'A', createdAt: new Date('2026-02-01') } });
    await db.patientPortalProfile.create({ data: { patientId: kept.id, phoneE164: '+919876500017', consentState: 'OPTED_IN', phoneConfirmedAt: new Date(), portalEnabled: true } });
    await db.patientPortalProfile.create({ data: { patientId: dup.id, phoneE164: '+919876500017', consentState: 'OPTED_OUT', portalEnabled: false } });
    await new PatientDeduplicationService(db as any).runDuplicatePatientMergeJob();
    expect(await db.patientPortalProfile.findUnique({ where: { patientId: dup.id } })).toBeNull();
    expect(await profile(kept.id)).toMatchObject({ consentState: 'OPTED_OUT', portalEnabled: false });
  });

  it('PP-10: a merge keeps the duplicate agreement on the same number when the kept patient was never asked', async () => {
    const kept = await db.patient.create({ data: { name: 'Jaya Dup', gender: 'F', phone: '9876500019', branchId: 'A', createdAt: new Date('2026-01-01') } });
    const dup = await db.patient.create({ data: { name: 'Jaya Dup', gender: 'F', phone: '9876500019', branchId: 'A', createdAt: new Date('2026-02-01') } });
    await db.patientPortalProfile.create({ data: { patientId: kept.id, phoneE164: '+919876500019' } });
    await db.patientPortalProfile.create({ data: { patientId: dup.id, phoneE164: '+919876500019', consentState: 'PENDING', consentRecordedById: 'rec', consentMethod: 'reception-agreed' } });
    await new PatientDeduplicationService(db as any).runDuplicatePatientMergeJob();
    expect(await profile(kept.id)).toMatchObject({ consentState: 'PENDING', consentRecordedById: 'rec', consentMethod: 'reception-agreed' });
  });

  it('PP-10: a merge repoints the duplicate outbound messages and attention items to the kept patient', async () => {
    const kept = await db.patient.create({ data: { name: 'Lata Dup', gender: 'F', phone: '9876500020', branchId: 'A', createdAt: new Date('2026-01-01') } });
    const dup = await db.patient.create({ data: { name: 'Lata Dup', gender: 'F', phone: '9876500020', branchId: 'A', createdAt: new Date('2026-02-01') } });
    await db.outboundMessage.create({ data: { dedupeKey: `merge:${dup.id}`, purpose: 'APPOINTMENT_CONFIRMATION', patientId: dup.id, toE164: '+919876500020', templateKey: 'appointment_confirmation' } });
    await db.attentionItem.create({ data: { kind: 'DELIVERY_FAILURE', subjectKey: `merge:${dup.id}`, patientId: dup.id } });
    await new PatientDeduplicationService(db as any).runDuplicatePatientMergeJob();
    expect(await db.outboundMessage.findMany({ where: { dedupeKey: `merge:${dup.id}` }, select: { patientId: true } })).toEqual([{ patientId: kept.id }]);
    expect(await db.attentionItem.findMany({ where: { subjectKey: `merge:${dup.id}` }, select: { patientId: true } })).toEqual([{ patientId: kept.id }]);
  });

  it('PP-10: a merge moves the duplicate profile to a kept patient without one, keeping an opt-out', async () => {
    const kept = await db.patient.create({ data: { name: 'Indu Dup', gender: 'F', phone: '9876500018', branchId: 'A', createdAt: new Date('2026-01-01') } });
    const dup = await db.patient.create({ data: { name: 'Indu Dup', gender: 'F', phone: '9876500018', branchId: 'A', createdAt: new Date('2026-02-01') } });
    await db.patientPortalProfile.create({ data: { patientId: dup.id, phoneE164: '+919876500018', consentState: 'OPTED_OUT', preferredLanguage: 'HI' } });
    await new PatientDeduplicationService(db as any).runDuplicatePatientMergeJob();
    expect(await profile(kept.id)).toMatchObject({ phoneE164: '+919876500018', consentState: 'OPTED_OUT', preferredLanguage: 'HI' });
  });

  it('PP-01: the migration backfills every existing patient with the same E.164 number toE164 derives', async () => {
    const phones = ['9876511111', '098765-11112', '+91 98765 11113', '919876511114', '+1 415 555 0100', '14155550100', '4155550100', '12345', '+91 12345 67890'];
    const ids: string[] = [];
    for (const [i, phone] of phones.entries()) ids.push((await db.patient.create({ data: { name: `Backfill ${i}`, gender: 'F', phone, branchId: 'A' } })).id);
    const sql = readFileSync(resolve('prisma/migrations/20261124100000_patient_portal_profile/migration.sql'), 'utf8');
    await db.$executeRawUnsafe(sql.slice(sql.indexOf('-- Backfill')));
    const rows = await db.patientPortalProfile.findMany({ where: { patientId: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.patientId, r]));
    expect(ids.map((id, i) => ({ phone: phones[i], e164: byId.get(id)?.phoneE164, consent: byId.get(id)?.consentState })))
      .toEqual(phones.map((phone) => ({ phone, e164: toE164(phone), consent: 'NOT_ASKED' })));
  });

  it('PP-88: audit rows for portal profiles hold field names and actor kind, never values', async () => {
    const url = new URL(process.env.PORTAL_PROFILE_TEST_DATABASE_URL!);
    url.searchParams.set('schema', schema);
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = url.toString();
    const audited = new PrismaService({ get: () => ({ userId: 'rec' }) } as any);
    try {
      const p = await new PatientsService(audited as any, {} as any, {} as any).create({ name: 'Audit Me', gender: 'F', phone: '9876522222', preferredLanguage: 'HI' } as any, 'A');
      await new PatientPortalService(audited as any).recordConsent(p.id, 'A', 'agreed', 'rec');
      const prof = await profile(p.id);
      const logs = await db.auditLog.findMany({ where: { entity: 'PatientPortalProfile', entityId: prof.id }, orderBy: { timestamp: 'asc' } });
      expect(logs.length).toBeGreaterThanOrEqual(2);
      for (const log of logs) {
        expect(log.oldValues).toBeNull();
        expect(log.actorKind).toBe('staff');
        expect(log.userId).toBeNull();
        expect(log.newValues).not.toContain('+919876522222');
        expect(log.newValues).not.toContain('PENDING');
        expect(Object.keys(JSON.parse(log.newValues!))).toEqual(['fields']);
      }
      expect(JSON.parse(logs[logs.length - 1].newValues!).fields).toEqual(expect.arrayContaining(['consentState', 'consentRecordedById']));
    } finally {
      await audited.$disconnect();
      process.env.DATABASE_URL = previous;
    }
  });
});
