import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { Logger } from '@nestjs/common';
import { PatientsService } from '../../patients/patients.service';
import { PatientPortalService } from '../../patients/portal/patient-portal.service';
import { SendPassService, LAPSE_MS } from '../send-pass.service';
import { WhatsAppSender } from '../whatsapp-sender';
import { enqueueOutbound } from '../outbox';
import { confirmByCode, hashCode, MAX_CODE_ATTEMPTS } from '../number-confirmation';
import { startFakeMeta } from './fake-meta';
import { AppointmentsService } from '../../appointments/appointments.service';

// Pass times sit in the future so rows queued now are already due.
const ist = (s: string) => new Date(`${s}+05:30`);
const NOON = ist('2099-11-24T12:00:00');

const databaseTests = process.env.MESSAGING_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Durable outbound WhatsApp messages on PostgreSQL against a fake Meta endpoint', () => {
  const schema = `messaging_${randomUUID().replaceAll('-', '')}`;
  const env = { ...process.env };
  let admin: PrismaClient;
  let db: PrismaClient;
  let patients: PatientsService;
  let portal: PatientPortalService;
  let pass: SendPassService;
  let meta: Awaited<ReturnType<typeof startFakeMeta>>;
  let created = false;
  let seq = 0;

  const register = async (phone: string, extra: Record<string, unknown> = {}) =>
    patients.create({ name: `Patient ${++seq}`, gender: 'F', phone, ...extra } as any, 'A');
  const profile = (patientId: string) => db.patientPortalProfile.findUniqueOrThrow({ where: { patientId } });
  const messages = (where: any = {}) => db.outboundMessage.findMany({ where, orderBy: { createdAt: 'asc' } });
  const optIn = async (patientId: string) => {
    await db.patientPortalProfile.update({ where: { patientId }, data: { consentState: 'OPTED_IN', phoneConfirmedAt: NOON, lastSeenAt: NOON } });
  };
  const appointment = async (patientId: string, date = '2099-11-30', status = 'SCHEDULED') =>
    db.appointment.create({ data: { patientId, doctorId: 'doc', branchId: 'A', date: new Date(`${date}T00:00:00Z`), slot: '10:00-10:30', status } as any });
  const care = async (patientId: string, purpose: 'REVIEW_REMINDER' | 'CHECK_IN_OPENED' | 'CHECK_IN_REMINDER', key: string, subjectId?: string) => {
    const p = await profile(patientId);
    await enqueueOutbound(db, { dedupeKey: key, purpose, patientId, toE164: p.phoneE164!, templateKey: 'patient_message_ack', params: {}, subjectType: subjectId ? 'APPOINTMENT' : null, subjectId: subjectId ?? null, notBefore: new Date(0) });
  };

  beforeAll(async () => {
    Logger.overrideLogger(false);
    meta = await startFakeMeta();
    Object.assign(process.env, { WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '555', WHATSAPP_GRAPH_BASE_URL: meta.baseUrl, PORTAL_CODE_SECRET: 'test-secret', CLINIC_NAME: 'Linae Skin Clinic' });
    const url = new URL(process.env.MESSAGING_TEST_DATABASE_URL!);
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
    patients = new PatientsService(db as any, {} as any, {} as any);
    portal = new PatientPortalService(db as any);
    pass = new SendPassService(db as any, new WhatsAppSender());
    await db.branch.create({ data: { id: 'A', name: 'Branch A', address: 'Synthetic' } });
    await db.user.create({ data: { id: 'rec', email: 'rec@example.test', password: 'x', firstName: 'R', lastName: 'C', role: 'RECEPTION', branchId: 'A' } as any });
    await db.user.create({ data: { id: 'doc', email: 'doc@example.test', password: 'x', firstName: 'D', lastName: 'R', role: 'DOCTOR', branchId: 'A' } as any });
  }, 120000);

  beforeEach(async () => {
    meta.reset();
    await db.attentionItem.deleteMany();
    await db.outboundMessage.deleteMany();
    await db.patientPortalProfile.updateMany({ where: { consentState: 'OPTED_IN' }, data: { lastSeenAt: NOON } });
  });

  afterAll(async () => {
    process.env = env;
    await meta?.close();
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('PP-04/11/12: agreement queues one confirmation naming the clinic and no person; the pass sends it and stores the provider id', async () => {
    const p = await register('9876511111');
    await portal.recordConsent(p.id, 'A', 'agreed', 'rec');
    const [row] = await messages();
    expect(row).toMatchObject({ purpose: 'NUMBER_CONFIRMATION', state: 'QUEUED', toE164: '+919876511111' });
    expect(await pass.runPass(NOON)).toMatchObject({ sent: 1 });
    const [sent] = await messages();
    expect(sent).toMatchObject({ state: 'SENT', providerMessageId: 'wamid.fake.1' });
    const params = meta.calls[0].body.template.components[0].parameters.map((x: any) => x.text);
    expect(params[0]).toBe('Linae Skin Clinic');
    expect(params[1]).toMatch(/^\d{6}$/);
    expect(JSON.stringify(meta.calls[0].body)).not.toContain(p.name);
    expect(meta.calls[0].body.template.components[1]).toMatchObject({ type: 'button', sub_type: 'quick_reply' });
    expect((await profile(p.id)).consentState).toBe('PENDING');
  });

  it('PP-04: one code confirms every PENDING patient on the number, and only then do they become OPTED_IN; a wrong code changes nothing', async () => {
    const mother = await register('9876522222');
    const child = await register('98765 22222');
    const notAsked = await register('9876522222');
    await portal.recordConsent(child.id, 'A', 'agreed', 'rec');
    await portal.recordConsent(mother.id, 'A', 'agreed', 'rec');
    await pass.runPass(NOON);
    const code = meta.calls.at(-1)!.body.template.components[0].parameters[1].text;
    await expect(portal.confirmWithCode(mother.id, 'A', code === '000000' ? '111111' : '000000')).rejects.toThrow('does not match');
    expect((await profile(mother.id)).consentState).toBe('PENDING');
    expect(await messages({ purpose: 'NUMBER_CONFIRMATION' })).toHaveLength(1);
    await portal.confirmWithCode(mother.id, 'A', code);
    expect((await profile(mother.id)).consentState).toBe('OPTED_IN');
    expect((await profile(child.id)).consentState).toBe('OPTED_IN');
    expect((await profile(mother.id)).phoneConfirmedAt).toBeInstanceOf(Date);
    expect((await profile(notAsked.id)).consentState).toBe('NOT_ASKED');
    const challenges = await db.portalOtpChallenge.findMany({ where: { phoneE164: '+919876522222' } });
    expect(challenges.every((c) => c.codeHash !== code && c.codeHash.length === 64)).toBe(true);
    expect(challenges.some((c) => c.codeHash === hashCode('+919876522222', code))).toBe(true);
  });

  it('PP-11: queuing the same event twice leaves one row and sends once', async () => {
    const p = await register('9876533333');
    await optIn(p.id);
    const a = await appointment(p.id);
    const req = { dedupeKey: `appointment-confirmation:${a.id}`, purpose: 'APPOINTMENT_CONFIRMATION' as const, patientId: p.id, toE164: '+919876533333', templateKey: 'x', params: { whatsapp: { kind: 'text', text: 'Booked' } }, subjectType: 'APPOINTMENT', subjectId: a.id };
    expect(await enqueueOutbound(db, req)).toBe(true);
    expect(await enqueueOutbound(db, req)).toBe(false);
    await pass.runPass(NOON);
    await pass.runPass(NOON);
    expect(await messages()).toHaveLength(1);
    expect(meta.calls).toHaveLength(1);
  });

  it('PP-13: consent, confirmation, portal switch and archive are read at send time, not queue time', async () => {
    const stopped = await register('9876544441');
    const disabled = await register('9876544442');
    const archived = await register('9876544443');
    const changed = await register('9876544444');
    for (const p of [stopped, disabled, archived, changed]) {
      await optIn(p.id);
      await care(p.id, 'REVIEW_REMINDER', `rr:${p.id}`);
    }
    await db.patientPortalProfile.update({ where: { patientId: stopped.id }, data: { consentState: 'OPTED_OUT' } });
    await portal.setPortalEnabled(disabled.id, 'A', false);
    await db.patient.update({ where: { id: archived.id }, data: { isArchived: true } });
    await patients.update(changed.id, { phone: '9876549999' } as any, 'A');
    await pass.runPass(NOON);
    const rows = await messages();
    expect(rows.map((r) => [r.patientId, r.state, r.outcome])).toEqual(expect.arrayContaining([
      [stopped.id, 'SUPPRESSED', 'consent-opted_out'],
      [disabled.id, 'SUPPRESSED', 'portal-disabled'],
      [archived.id, 'SUPPRESSED', 'archived'],
      [changed.id, 'SUPPRESSED', 'consent-not_asked'],
    ]));
    expect(meta.calls).toHaveLength(0);
  });

  it('PP-13: a message about a cancelled or past appointment expires instead of sending', async () => {
    const p = await register('9876555555');
    await optIn(p.id);
    const cancelled = await appointment(p.id, '2099-11-30', 'CANCELLED');
    const past = await appointment(p.id, '2099-11-20');
    await care(p.id, 'REVIEW_REMINDER', 'cancelled', cancelled.id);
    await care(p.id, 'CHECK_IN_REMINDER', 'past', past.id);
    await pass.runPass(NOON);
    expect((await messages()).map((r) => r.state)).toEqual(['EXPIRED', 'EXPIRED']);
    expect(meta.calls).toHaveLength(0);
  });

  it('PP-04: parallel wrong guesses spend at most five attempts, and then even the right code is refused until a new code is sent', async () => {
    const p = await register('9876577771');
    await portal.recordConsent(p.id, 'A', 'agreed', 'rec');
    await db.portalOtpChallenge.updateMany({ where: { phoneE164: '+919876577771' }, data: { codeHash: hashCode('+919876577771', '424242') } });
    const results = await Promise.all(Array.from({ length: 12 }, () => db.$transaction((tx) => confirmByCode(tx, '+919876577771', '000000'))));
    expect(results.filter((r) => r === 'wrong')).toHaveLength(MAX_CODE_ATTEMPTS);
    expect(results.filter((r) => r === 'locked')).toHaveLength(12 - MAX_CODE_ATTEMPTS);
    expect((await db.portalOtpChallenge.findFirstOrThrow({ where: { phoneE164: '+919876577771' } })).attempts).toBe(MAX_CODE_ATTEMPTS);
    await expect(portal.confirmWithCode(p.id, 'A', '424242')).rejects.toThrow();
    expect((await profile(p.id)).consentState).toBe('PENDING');
    await pass.runPass(NOON);
    await portal.recordConsent(p.id, 'A', 'agreed', 'rec');
    await pass.runPass(NOON);
    await portal.confirmWithCode(p.id, 'A', meta.calls.at(-1)!.body.template.components[0].parameters[1].text);
    expect((await profile(p.id)).consentState).toBe('OPTED_IN');
  });

  it('PP-13: an archive that starts while the pass is deciding waits for it, and an archive that commits first suppresses the send', async () => {
    const p = await register('9876577772');
    await optIn(p.id);
    await care(p.id, 'REVIEW_REMINDER', `race:${p.id}`);
    let release!: () => void;
    let locked!: () => void;
    const archiveHeld = new Promise<void>((r) => { locked = r; });
    const archiving = db.$transaction(async (tx) => {
      await tx.patient.update({ where: { id: p.id }, data: { isArchived: true } });
      locked();
      await new Promise<void>((r) => { release = r; });
    }, { timeout: 20_000 });
    await archiveHeld;
    const passing = pass.runPass(NOON);
    await new Promise((r) => setTimeout(r, 300));
    expect(meta.calls).toHaveLength(0);
    release();
    await archiving;
    await passing;
    expect((await messages())[0]).toMatchObject({ state: 'SUPPRESSED', outcome: 'archived' });
    expect(meta.calls).toHaveLength(0);
  });

  it('PP-13: a phone edit running while the pass sends to that patient does not deadlock (patient row is locked before profiles)', async () => {
    const p = await register('9876577774');
    await optIn(p.id);
    await care(p.id, 'REVIEW_REMINDER', `edit:${p.id}`);
    let release!: () => void;
    let locked!: () => void;
    const patientHeld = new Promise<void>((r) => { locked = r; });
    const editing = db.$transaction(async (tx) => {
      await tx.patient.update({ where: { id: p.id }, data: { phone: '9876577775' } });
      locked();
      await new Promise<void>((r) => { release = r; });
      await tx.patientPortalProfile.update({ where: { patientId: p.id }, data: { phoneE164: '+919876577775', consentState: 'NOT_ASKED', phoneConfirmedAt: null } });
    }, { timeout: 20_000 });
    await patientHeld;
    const passing = pass.runPass(NOON);
    await new Promise((r) => setTimeout(r, 300));
    release();
    await expect(editing).resolves.toBeUndefined();
    await passing;
    expect((await messages())[0]).toMatchObject({ state: 'SUPPRESSED', outcome: 'consent-not_asked' });
  });

  it('PP-13: a confirmation for an appointment that was moved, or whose slot has started, expires instead of sending the old time', async () => {
    const p = await register('9876577773');
    await optIn(p.id);
    const moved = await appointment(p.id, '2099-11-30');
    const started = await appointment(p.id, '2099-11-24');
    const kept = await appointment(p.id, '2099-11-30');
    for (const a of [moved, started, kept]) {
      await enqueueOutbound(db, { dedupeKey: `appointment-confirmation:${a.id}`, purpose: 'APPOINTMENT_CONFIRMATION', patientId: p.id, toE164: '+919876577773', templateKey: 'appointment_confirmation', params: { whatsapp: { kind: 'text', text: 'Booked' }, booked: { date: a.date.toISOString().slice(0, 10), slot: a.slot } }, subjectType: 'APPOINTMENT', subjectId: a.id });
    }
    await db.appointment.update({ where: { id: moved.id }, data: { slot: '16:00-16:30' } });
    await pass.runPass(NOON);
    const state = async (id: string) => (await db.outboundMessage.findUniqueOrThrow({ where: { dedupeKey: `appointment-confirmation:${id}` } })).state;
    expect([await state(moved.id), await state(started.id), await state(kept.id)]).toEqual(['EXPIRED', 'EXPIRED', 'SENT']);
  });

  it('PP-14: care messages wait for 09:00 Kolkata; confirmations go out at night', async () => {
    const p = await register('9876566666');
    await optIn(p.id);
    await care(p.id, 'REVIEW_REMINDER', 'night-care');
    const late = await register('9876566667');
    await portal.recordConsent(late.id, 'A', 'agreed', 'rec');
    await pass.runPass(ist('2099-11-24T22:15:00'));
    const rows = await messages();
    expect(rows.find((r) => r.purpose === 'REVIEW_REMINDER')).toMatchObject({ state: 'QUEUED', outcome: 'outside-window' });
    expect(rows.find((r) => r.purpose === 'REVIEW_REMINDER')!.notBefore.toISOString()).toBe(ist('2099-11-25T09:00:00').toISOString());
    expect(rows.find((r) => r.purpose === 'NUMBER_CONFIRMATION')!.state).toBe('SENT');
    await pass.runPass(ist('2099-11-25T09:05:00'));
    expect((await messages({ purpose: 'REVIEW_REMINDER' }))[0].state).toBe('SENT');
  });

  it('PP-15: one care message per patient per Kolkata day, appointment reminder first, check-in next, open check-in reminder last', async () => {
    const p = await register('9876577777');
    await optIn(p.id);
    await care(p.id, 'CHECK_IN_REMINDER', 'c-rem');
    await care(p.id, 'CHECK_IN_OPENED', 'c-open');
    await care(p.id, 'REVIEW_REMINDER', 'r-rem');
    await pass.runPass(ist('2099-11-24T10:00:00'));
    let rows = await messages({ state: 'SENT' });
    expect(rows.map((r) => r.purpose)).toEqual(['REVIEW_REMINDER']);
    await pass.runPass(ist('2099-11-24T19:00:00'));
    expect(await messages({ state: 'SENT' })).toHaveLength(1);
    await pass.runPass(ist('2099-11-25T09:00:00'));
    rows = await messages({ state: 'SENT' });
    expect(rows.map((r) => r.purpose).sort()).toEqual(['CHECK_IN_OPENED', 'REVIEW_REMINDER']);
    await pass.runPass(ist('2099-11-26T09:00:00'));
    expect(await messages({ state: 'SENT' })).toHaveLength(3);
  });

  it('PP-17: a rejected send about a current appointment opens one delivery-failure item; a second failure reuses it', async () => {
    const p = await register('9876588888');
    await optIn(p.id);
    const a = await appointment(p.id);
    meta.answerNext(400, { error: { code: 131026 } });
    await care(p.id, 'REVIEW_REMINDER', 'fail-1', a.id);
    await pass.runPass(NOON);
    expect((await messages())[0]).toMatchObject({ state: 'FAILED', outcome: 'rejected:400:131026' });
    meta.answerNext(400, { error: { code: 131026 } });
    await care(p.id, 'REVIEW_REMINDER', 'fail-2', a.id);
    await pass.runPass(ist('2099-11-25T12:00:00'));
    const items = await db.attentionItem.findMany();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'DELIVERY_FAILURE', state: 'OPEN', subjectKey: `APPOINTMENT:${a.id}`, patientId: p.id, branchId: 'A' });
    expect(items[0].lastEventAt.toISOString()).toBe(ist('2099-11-25T12:00:00').toISOString());
  });

  it('PP-12/17: a provider outage retries later instead of failing; credentials missing leaves the row queued', async () => {
    const p = await register('9876599999');
    await optIn(p.id);
    meta.answerNext(503, {});
    await care(p.id, 'REVIEW_REMINDER', 'outage');
    await pass.runPass(NOON);
    expect((await messages())[0]).toMatchObject({ state: 'QUEUED', attempts: 1, outcome: 'unavailable:503' });
    delete process.env.WHATSAPP_TOKEN;
    await pass.runPass(ist('2099-11-24T12:10:00'));
    expect((await messages())[0]).toMatchObject({ state: 'QUEUED', outcome: 'not-configured' });
    process.env.WHATSAPP_TOKEN = 't';
    expect(await db.attentionItem.count()).toBe(0);
  });

  it('PP-08: a number opted in with no contact for 12 months moves to PENDING and is asked to confirm again', async () => {
    const stale = await register('9876500101');
    const recent = await register('9876500102');
    const longAgo = new Date(NOON.getTime() - LAPSE_MS - 24 * 3600 * 1000);
    await db.patientPortalProfile.update({ where: { patientId: stale.id }, data: { consentState: 'OPTED_IN', phoneConfirmedAt: longAgo, lastSeenAt: longAgo } });
    await db.patientPortalProfile.update({ where: { patientId: recent.id }, data: { consentState: 'OPTED_IN', phoneConfirmedAt: longAgo, lastSeenAt: new Date(NOON.getTime() - 30 * 24 * 3600 * 1000) } });
    await pass.runPass(NOON);
    expect(await profile(stale.id)).toMatchObject({ consentState: 'PENDING', phoneConfirmedAt: null, consentMethod: 'lapsed' });
    expect((await profile(recent.id)).consentState).toBe('OPTED_IN');
    expect(await messages({ toE164: '+919876500101', purpose: 'NUMBER_CONFIRMATION', state: 'SENT' })).toHaveLength(1);
  });

  it('PP-18: booking with automated confirmation on queues one OutboundMessage that the pass sends from the clinic number', async () => {
    const p = await register('9876500201');
    await optIn(p.id);
    await db.user.update({ where: { id: 'doc' }, data: { metadata: JSON.stringify({ whatsappAutoConfirmAppointments: true, whatsappPhoneNumberId: 'doctor-own-number', whatsappAccessToken: 'doctor-token' }) } as any });
    const sendWhatsApp = jest.fn();
    const appts = new AppointmentsService(db as any, { sendEmail: jest.fn(), sendWhatsApp } as any, undefined, undefined);
    const a = await appointment(p.id, '2099-11-30');
    await appts.notifyBooked(await db.appointment.findUniqueOrThrow({ where: { id: a.id }, include: { patient: true, doctor: true } }) as any, 'A');
    expect(sendWhatsApp).not.toHaveBeenCalled();
    expect(await messages()).toEqual([expect.objectContaining({ purpose: 'APPOINTMENT_CONFIRMATION', subjectId: a.id, toE164: '+919876500201' })]);
    await pass.runPass(NOON);
    expect(meta.calls).toHaveLength(1);
    expect(meta.calls[0]).toMatchObject({ path: '/v18.0/555/messages', auth: 'Bearer t' });
  });
});
