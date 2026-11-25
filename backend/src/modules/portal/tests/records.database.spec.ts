import { BadRequestException, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { FollowUpsService } from '../../follow-ups/follow-ups.service';
import { staffReplyStatus } from '../../messaging/staff-reply';
import { VisitsService } from '../../visits/visits.service';
import { PortalPatientPrincipal } from '../principal';
import { PortalRecordsService } from '../records.service';

const DAY = 24 * 3600 * 1000;
/** Text only the clinic may see; none of it may reach a portal answer (PP-64). */
const SECRETS = ['Synthetic psoriasis', 'itching-complaint', 'plaque-exam', 'steroid-plan', 'family-history', 'pharmacist-note', 'HSN-3004', 'lab-order-cbc', 'invoice-950', 'clinic-photo.jpg'];

const databaseTests = process.env.PORTAL_SIGN_IN_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Portal records and portal messages on PostgreSQL (PP-63 to PP-66)', () => {
  const schema = `portal_records_${randomUUID().replaceAll('-', '')}`;
  const env = { ...process.env };
  let admin: PrismaClient;
  let db: PrismaClient;
  let records: PortalRecordsService;
  let planVersionId: string;
  let created = false;
  let seq = 0;

  const newSession = async (identityId: string, phoneE164: string, patientId: string) => {
    const now = Date.now();
    const challenge = await db.portalOtpChallenge.create({ data: { purpose: 'SIGN_IN', phoneE164, codeHash: randomUUID(), expiresAt: new Date(now + 300_000), consumedAt: new Date(now) } });
    return db.portalSession.create({
      data: { tokenHash: randomUUID(), identityId, challengeId: challenge.id, patientId, lastActiveAt: new Date(now), idleExpiresAt: new Date(now + 1800_000), absoluteExpiresAt: new Date(now + DAY) },
    });
  };

  /** A patient on `phone`, signed in on a session that chose them. */
  const signedIn = async (phone: string, branchId = 'A', name = `Asha${++seq} Synthetic`) => {
    const patient = await db.patient.create({ data: { name, gender: 'F', phone, branchId } as any });
    await db.patientPortalProfile.create({ data: { patientId: patient.id, phoneE164: `+91${phone}`, consentState: 'OPTED_IN', phoneConfirmedAt: new Date() } });
    const identity = await db.portalIdentity.upsert({ where: { phoneE164: `+91${phone}` }, create: { phoneE164: `+91${phone}` }, update: {} });
    const session = await newSession(identity.id, `+91${phone}`, patient.id);
    const principal: PortalPatientPrincipal = { kind: 'portal-patient', sessionId: session.id, identityId: identity.id, patientId: patient.id, branchId };
    return { patient, principal };
  };

  /** A full record: appointments, a visit with clinical notes and a prescription, an answered check-in and a thread. */
  const fullRecord = async (patientId: string, tag: string, branchId = 'A') => {
    await db.appointment.create({ data: { patientId, doctorId: 'doc', branchId, date: new Date(Date.now() + 3 * DAY), slot: '10:30-10:45', status: 'SCHEDULED' } });
    await db.appointment.create({ data: { patientId, doctorId: 'doc', branchId, date: new Date(Date.now() + 4 * DAY), slot: '11:00-11:15', status: 'CANCELLED' } });
    const appt = await db.appointment.create({ data: { patientId, doctorId: 'doc', branchId, date: new Date(Date.now() - 10 * DAY), slot: '09:00-09:15', status: 'COMPLETED' } });
    const visit = await db.visit.create({
      data: {
        patientId, doctorId: 'doc', appointmentId: appt.id,
        complaints: JSON.stringify([{ complaint: 'itching-complaint' }]), history: 'family-history', exam: 'plaque-exam', diagnosis: 'Synthetic psoriasis', plan: 'steroid-plan',
        attachments: JSON.stringify(['clinic-photo.jpg']),
      } as any,
    });
    await db.prescription.create({
      data: {
        visitId: visit.id, status: 'ACTIVE', pharmacistNotes: 'pharmacist-note', instructions: `Avoid hot showers ${tag}`,
        items: JSON.stringify([
          { drugName: `Clobetasol ${tag}`, dosage: '0.05', dosageUnit: '%', frequency: 'BD', duration: 14, durationUnit: 'DAYS', applicationSite: 'Elbows', instructions: 'Thin layer', clinicalData: { diagnosis: 'Synthetic psoriasis' }, hsnCode: 'HSN-3004', price: 950 },
          { genericName: 'nameless line' },
        ]),
      },
    });
    const draftVisit = await db.visit.create({ data: { patientId, doctorId: 'doc', complaints: '[]' } as any });
    await db.prescription.create({ data: { visitId: draftVisit.id, status: 'DRAFT', items: JSON.stringify([{ drugName: `Draft drug ${tag}` }]) } });
    await db.labOrder.create({ data: { patientId, visitId: visit.id, tests: 'lab-order-cbc', partner: 'Synthetic Labs' } as any });

    const tracked = await db.visit.create({ data: { patientId, doctorId: 'doc', complaints: '[]' } as any });
    await new VisitsService(db as any).complete(tracked.id, { followUpPlanVersionId: planVersionId } as any, branchId);
    const [first, second] = await db.checkIn.findMany({ where: { track: { patientId } }, orderBy: { seq: 'asc' } });
    await db.checkIn.update({ where: { id: first.id }, data: { state: 'ANSWERED', opensAt: new Date(Date.now() - 2 * DAY) } });
    await db.checkInResponse.create({ data: { checkInId: first.id, instrumentVersionId: first.instrumentVersionId, answers: { severity: 3, change: 'same' }, score: 3, flag: 'URGENT' } });
    await db.checkIn.update({ where: { id: second.id }, data: { state: 'OPEN', opensAt: new Date() } });

    const msg = (data: Record<string, unknown>) => db.patientMessage.create({ data: { patientId, phoneE164: '+910', direction: 'INBOUND', channel: 'WHATSAPP', kind: 'text', assignment: 'EXACT', authorKind: 'patient', ...data } as any });
    await msg({ body: `Hello ${tag}`, createdAt: new Date(Date.now() - 3000) });
    await msg({ direction: 'OUTBOUND', authorKind: 'staff', body: `Reply ${tag}`, createdAt: new Date(Date.now() - 2000) });
    await msg({ body: `Suggested ${tag}`, assignment: 'SUGGESTED' });
    await msg({ direction: 'OUTBOUND', channel: 'CALL', authorKind: 'staff', body: `Call note ${tag}` });
  };

  beforeAll(async () => {
    Logger.overrideLogger(false);
    Object.assign(process.env, { CLINIC_NAME: 'Linae Skin Clinic' });
    const url = new URL(process.env.PORTAL_SIGN_IN_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')],
      { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url.toString() } });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    await db.$executeRawUnsafe(`CREATE UNIQUE INDEX "attention_items_one_open_per_subject" ON "attention_items"("kind", "subjectKey") WHERE "state" <> 'RESOLVED'`);
    await db.$executeRawUnsafe(`CREATE UNIQUE INDEX "follow_up_tracks_one_live_per_visit" ON "follow_up_tracks"("visitId") WHERE "state" <> 'STOPPED'`);
    await db.branch.create({ data: { id: 'A', name: 'Banjara Hills', address: 'Synthetic' } });
    await db.branch.create({ data: { id: 'B', name: 'Kukatpally', address: 'Synthetic' } });
    await db.user.create({ data: { id: 'own', email: 'own@example.test', password: 'x', firstName: 'O', lastName: 'W', role: 'OWNER', branchId: 'A' } as any });
    await db.user.create({ data: { id: 'doc', email: 'doc@example.test', password: 'x', firstName: 'Meera', lastName: 'Rao', role: 'DOCTOR', branchId: 'A' } as any });
    planVersionId = (await new FollowUpsService(db as any).importData('own')).find((r) => r.key === 'skin-two-week')!.versionId;
    records = new PortalRecordsService(db as any);
  }, 120000);

  afterAll(async () => {
    process.env = env;
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('PP-63, PP-64: shows appointments, visits with the doctor, prescriptions, check-ins and the thread, and nothing clinical', async () => {
    const { patient, principal } = await signedIn('9800000001');
    await fullRecord(patient.id, 'mine');

    const appts = await records.appointments(principal);
    expect(appts.upcoming).toEqual([{ date: expect.any(Date), slot: '10:30-10:45', status: 'SCHEDULED', doctor: 'Dr. Meera Rao', branch: 'Banjara Hills' }]);

    const { visits } = await records.visits(principal);
    const withRx = visits.filter((v) => v.prescription);
    expect(withRx).toHaveLength(1);
    expect(withRx[0]).toMatchObject({ doctor: 'Dr. Meera Rao', prescription: { status: 'ACTIVE', instructions: 'Avoid hot showers mine' } });
    expect(withRx[0].prescription!.items).toEqual([
      { drugName: 'Clobetasol mine', dosage: '0.05', dosageUnit: '%', frequency: 'BD', duration: 14, durationUnit: 'DAYS', applicationSite: 'Elbows', instructions: 'Thin layer' },
    ]);

    const { checkIns } = await records.checkIns(principal);
    const answered = checkIns.find((c) => c.state === 'ANSWERED')!;
    expect(answered.response!.answers.map((a) => a.answer)).toHaveLength(2);
    expect(checkIns.some((c) => c.state === 'OPEN')).toBe(true);

    const { messages } = await records.messages(principal);
    expect(messages.map((m) => [m.from, m.body])).toEqual([['patient', 'Hello mine'], ['clinic', 'Reply mine']]);

    const home = await records.home(principal);
    expect(home).toMatchObject({ profile: { firstName: patient.name.split(' ')[0], branch: 'Banjara Hills' }, nextAppointment: { slot: '10:30-10:45' }, latestPrescription: { doctor: 'Dr. Meera Rao', status: 'ACTIVE' } });
    expect(home.openCheckIns).toHaveLength(1);

    const everything = JSON.stringify([appts, visits, checkIns, messages, home]);
    for (const secret of [...SECRETS, 'Draft drug', 'Suggested', 'Call note', 'URGENT', '"score"', patient.id, '9800000001']) expect(everything).not.toContain(secret);
    expect(everything).not.toMatch(/"(complaints|history|exam|diagnosis|plan|attachments|labOrders|invoices?|pharmacistNotes|clinicalData|price|hsnCode)"/);
  });

  it('PP-63: upcoming follows the clinic rule (today\'s ended slots gone, checked-in still upcoming) and home shows the newest prescription however many visits came after', async () => {
    const { patient, principal } = await signedIn('9800000007');
    const ist = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const today = new Date(`${ist}T00:00:00.000Z`);
    await db.appointment.create({ data: { patientId: patient.id, doctorId: 'doc', branchId: 'A', date: today, slot: '00:00-00:01', status: 'SCHEDULED' } });
    await db.appointment.create({ data: { patientId: patient.id, doctorId: 'doc', branchId: 'A', date: today, slot: '23:58-23:59', status: 'CHECKED_IN' } as any });
    const visit = (createdAt: Date) => db.visit.create({ data: { patientId: patient.id, doctorId: 'doc', complaints: '[]', createdAt } as any });
    const older = await visit(new Date(Date.now() - 40 * DAY));
    const old = await visit(new Date(Date.now() - 30 * DAY));
    await db.prescription.create({ data: { visitId: old.id, status: 'ACTIVE', items: JSON.stringify([{ drugName: 'Written first' }]), createdAt: new Date(Date.now() - 30 * DAY) } });
    await db.prescription.create({ data: { visitId: older.id, status: 'ACTIVE', items: JSON.stringify([{ drugName: 'Written last' }]), createdAt: new Date(Date.now() - 20 * DAY) } });
    for (let i = 0; i < 11; i++) await visit(new Date(Date.now() - (10 - i) * 3600_000));

    const home = await records.home(principal);
    expect(home.nextAppointment).toMatchObject({ slot: '23:58-23:59', status: 'CHECKED_IN' });
    expect((await records.appointments(principal)).upcoming.map((a) => a.slot)).toEqual(['23:58-23:59']);
    expect(home.latestPrescription!.items).toEqual([{ drugName: 'Written last' }]);
  });

  it('OwnDataOnly: a shared phone shows each profile only its own record', async () => {
    const mine = await signedIn('9800000002', 'A');
    const sibling = await signedIn('9800000002', 'B');
    await fullRecord(mine.patient.id, 'alpha');
    await fullRecord(sibling.patient.id, 'bravo', 'B');
    const first = JSON.stringify([await records.home(mine.principal), await records.visits(mine.principal), await records.messages(mine.principal), await records.checkIns(mine.principal)]);
    const second = JSON.stringify([await records.home(sibling.principal), await records.visits(sibling.principal), await records.messages(sibling.principal)]);
    expect(first).toContain('Clobetasol alpha');
    expect(first).not.toContain('bravo');
    expect(second).toContain('Clobetasol bravo');
    expect(second).toContain('Kukatpally');
    expect(second).not.toContain('alpha');
  });

  it('PP-66: every record view appends one RECORD_VIEW event naming the view and the chosen patient', async () => {
    const { patient, principal } = await signedIn('9800000003');
    for (const view of ['home', 'appointments', 'visits', 'checkIns', 'messages'] as const) await records[view](principal);
    const events = await db.portalAccessEvent.findMany({ where: { sessionId: principal.sessionId }, orderBy: { createdAt: 'asc' } });
    expect(events.map((e) => [e.kind, e.view, e.patientId, e.identityId])).toEqual(
      ['home', 'appointments', 'visits', 'check-ins', 'messages'].map((v) => ['RECORD_VIEW', v, patient.id, principal.identityId]),
    );
  });

  it('PP-65: a portal message lands once per client key under the patient’s open message item and leaves the WhatsApp window shut', async () => {
    const { patient, principal } = await signedIn('9800000004');
    const clientKey = randomUUID();
    const sent = await Promise.all([1, 2, 3].map(() => records.write(principal, { body: '  My skin is dry  ', clientKey })));
    await records.write(principal, { body: 'My skin is dry', clientKey });
    expect(sent[0].messages.map((m) => [m.from, m.channel, m.body])).toEqual([['patient', 'PORTAL', 'My skin is dry']]);
    const stored = await db.patientMessage.findMany({ where: { patientId: patient.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ direction: 'INBOUND', channel: 'PORTAL', assignment: 'EXACT', authorKind: 'patient', phoneE164: '+919800000004' });
    const items = await db.attentionItem.findMany({ where: { kind: 'PATIENT_MESSAGE', subjectKey: `patient:${patient.id}` } });
    expect(items).toEqual([expect.objectContaining({ state: 'OPEN', patientId: patient.id, branchId: 'A' })]);
    expect(await staffReplyStatus(db as any, patient.id, new Date())).toMatchObject({ canReply: false, reason: 'window-closed' });

    await records.write(principal, { body: 'And itchy', clientKey: randomUUID() });
    expect(await db.patientMessage.count({ where: { patientId: patient.id } })).toBe(2);
    await expect(records.write(principal, { body: '   ', clientKey: randomUUID() })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('PP-65: the same client key from another session is another message', async () => {
    const { patient, principal } = await signedIn('9800000005');
    const other = await newSession(principal.identityId, '+919800000005', patient.id);
    const clientKey = randomUUID();
    await records.write(principal, { body: 'One', clientKey });
    await records.write({ ...principal, sessionId: other.id }, { body: 'Two', clientKey });
    expect(await db.patientMessage.count({ where: { patientId: patient.id } })).toBe(2);
  });
});
