import { createHmac, randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { INestApplication, Logger } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { PermissionsGuard } from '../../../shared/guards/permissions.guard';
import { IdempotencyInterceptor } from '../../../shared/interceptors/idempotency.interceptor';
import { RequestContextInterceptor } from '../../../shared/interceptors/request-context.interceptor';
import { RequestContextService } from '../../../shared/context/request-context.service';
import { diagnosticValidationPipe } from '../../../shared/logging/http-observability';
import { configureRequestBody } from '../../../shared/http/request-body';
import { WhatsAppWebhookController } from '../whatsapp-webhook.controller';
import { InboundWhatsAppService } from '../inbound.service';
import { SendPassService } from '../send-pass.service';
import { WhatsAppSender } from '../whatsapp-sender';
import { enqueueOutbound } from '../outbox';
import { PatientDeduplicationService } from '../../patients/patient-deduplication.service';
import { startFakeMeta } from './fake-meta';

const SECRET = 'meta-app-secret';
const ist = (s: string) => new Date(`${s}+05:30`);
const NOON = ist('2099-11-24T12:00:00');
const PRIVATE_TEXT = 'my rash is spreading near the eye';

const databaseTests = process.env.MESSAGING_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Inbound WhatsApp webhook on PostgreSQL against a fake Meta endpoint', () => {
  const schema = `inbound_${randomUUID().replaceAll('-', '')}`;
  const env = { ...process.env };
  let admin: PrismaClient;
  let db: PrismaClient;
  let app: INestApplication;
  let pass: SendPassService;
  let meta: Awaited<ReturnType<typeof startFakeMeta>>;
  let created = false;
  let seq = 0;
  const logged: string[] = [];

  const sign = (raw: string, secret = SECRET) => `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  const post = (body: unknown, opts: { signature?: string; headers?: Record<string, string> } = {}) => {
    const raw = JSON.stringify(body);
    const req = request(app.getHttpServer()).post('/webhooks/whatsapp').set('Content-Type', 'application/json').set('X-Hub-Signature-256', opts.signature ?? sign(raw));
    for (const [k, v] of Object.entries(opts.headers ?? {})) req.set(k, v);
    return req.send(raw);
  };
  const envelope = (value: Record<string, unknown>) => ({ object: 'whatsapp_business_account', entry: [{ id: 'waba', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', ...value } }] }] });
  const text = (from: string, body: string, extra: Record<string, unknown> = {}) =>
    envelope({ contacts: [{ wa_id: from }], messages: [{ id: `wamid.in.${++seq}`, from, timestamp: String(Math.floor(NOON.getTime() / 1000)), type: 'text', text: { body }, ...extra }] });
  const patient = async (phoneE164: string, profile: Record<string, unknown> = {}) => {
    const p = await db.patient.create({ data: { name: `Patient ${++seq}`, gender: 'F', phone: phoneE164.slice(1), branchId: 'A' } });
    await db.patientPortalProfile.create({ data: { patientId: p.id, phoneE164, consentState: 'OPTED_IN', phoneConfirmedAt: NOON, lastSeenAt: NOON, ...profile } });
    return p;
  };
  const items = (where: any = {}) => db.attentionItem.findMany({ where: { kind: 'PATIENT_MESSAGE', ...where } });

  beforeAll(async () => {
    meta = await startFakeMeta();
    Object.assign(process.env, { WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '555', WHATSAPP_GRAPH_BASE_URL: meta.baseUrl, WHATSAPP_APP_SECRET: SECRET, WHATSAPP_VERIFY_TOKEN: 'verify-me', PORTAL_CODE_SECRET: 'test-secret', CLINIC_NAME: 'Linae Skin Clinic', CLINIC_MESSAGE_HOURS: '9 am to 6 pm', CLINIC_EMERGENCY_PHONE: '+91 40 1234 5678' });
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
    await db.branch.create({ data: { id: 'A', name: 'Branch A', address: 'Synthetic' } });
    const moduleRef = await Test.createTestingModule({
      controllers: [WhatsAppWebhookController],
      providers: [
        InboundWhatsAppService, SendPassService, WhatsAppSender,
        { provide: PrismaService, useValue: db },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
        RequestContextService,
        { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureRequestBody(app as any);
    app.useGlobalPipes(diagnosticValidationPipe());
    const capture = (...args: unknown[]) => { logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); };
    app.useLogger({ log: capture, error: capture, warn: capture, debug: capture, verbose: capture });
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) jest.spyOn(console, m).mockImplementation(capture);
    await app.init();
    pass = moduleRef.get(SendPassService);
  }, 120000);

  beforeEach(async () => {
    meta.reset();
    await db.attentionItem.deleteMany();
    await db.outboundMessage.deleteMany();
    await db.patientMessage.deleteMany();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    process.env = env;
    await app?.close();
    await meta?.close();
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('PP-19: answers the Meta subscribe challenge only for the configured token', async () => {
    const ok = await request(app.getHttpServer()).get('/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '1158201444' });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe('1158201444');
    const bad = await request(app.getHttpServer()).get('/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'guess', 'hub.challenge': '1' });
    expect(bad.status).toBe(403);
  });

  it('PP-19: refuses unsigned, wrongly signed and re-serialised bodies and stores nothing', async () => {
    const body = text('919876500001', 'hello');
    expect((await post(body, { signature: 'sha256=00' })).status).toBe(401);
    expect((await post(body, { signature: sign(JSON.stringify(body), 'other-secret') })).status).toBe(401);
    const raw = JSON.stringify(body);
    const spaced = await request(app.getHttpServer()).post('/webhooks/whatsapp').set('Content-Type', 'application/json').set('X-Hub-Signature-256', sign(raw)).send(JSON.stringify(body, null, 2));
    expect(spaced.status).toBe(401);
    expect(await db.inboundWhatsAppEvent.count()).toBe(0);
    expect(await db.patientMessage.count()).toBe(0);
  });

  it('PP-19/PP-86: stores each event once by provider id, keeps fields no DTO declares, and never touches the idempotency store', async () => {
    await patient('+919876500002');
    const body = text('919876500002', 'hello', { unexpected_field: { kept: true } });
    const first = await post(body, { headers: { 'Idempotency-Key': 'same-key' } });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, stored: 1, duplicates: 0 });
    expect((await post(body, { headers: { 'Idempotency-Key': 'same-key' } })).body).toMatchObject({ stored: 0, duplicates: 1 });
    expect(await db.patientMessage.count()).toBe(1);
    const event = await db.inboundWhatsAppEvent.findFirstOrThrow({ where: { providerEventId: `message:${body.entry[0].changes[0].value.messages[0].id}` } });
    expect(event.payload).toMatchObject({ unexpected_field: { kept: true } });
    expect(event.appliedAt).not.toBeNull();
    expect(await db.idempotencyRecord.count()).toBe(0);
  });

  it('PP-20/PP-21: one portal-enabled patient on the number gets the message EXACT under one open item per patient', async () => {
    const p = await patient('+919876500003', { lastSeenAt: new Date('2020-01-01') });
    await post(text('919876500003', 'first'));
    await post(envelope({ messages: [{ id: `wamid.in.${++seq}`, from: '919876500003', timestamp: String(Math.floor(NOON.getTime() / 1000) + 60), type: 'image', image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'photo' } }] }));
    const msgs = await db.patientMessage.findMany({ where: { phoneE164: '+919876500003' }, orderBy: { createdAt: 'asc' } });
    expect(msgs.map((m) => ({ patientId: m.patientId, assignment: m.assignment, kind: m.kind, mediaId: m.mediaId }))).toEqual([
      { patientId: p.id, assignment: 'EXACT', kind: 'text', mediaId: null },
      { patientId: p.id, assignment: 'EXACT', kind: 'image', mediaId: 'media-1' },
    ]);
    expect(await items()).toEqual([expect.objectContaining({ subjectKey: `patient:${p.id}`, patientId: p.id, state: 'OPEN', branchId: 'A' })]);
    expect((await db.patientPortalProfile.findUniqueOrThrow({ where: { patientId: p.id } })).lastSeenAt!.getTime()).toBeGreaterThan(new Date('2020-01-02').getTime());
    const [item] = await items();
    const audits = await db.auditLog.findMany({ where: { entity: 'AttentionItem', entityId: item.id }, orderBy: [{ timestamp: 'asc' }, { action: 'asc' }] });
    expect(audits.map((a) => [a.action, a.actorKind, JSON.parse(a.newValues!)])).toEqual([
      ['CREATE', 'webhook', { fields: ['branchId', 'kind', 'lastEventAt', 'patientId', 'phoneE164', 'reason', 'state', 'subjectKey'] }],
      ['UPDATE', 'webhook', { fields: ['lastEventAt', 'updatedAt'] }],
    ]);
    expect(JSON.stringify(audits)).not.toContain('+919876500003');
  });

  it('PP-20: two patients on one number stay unassigned unless the message quotes an outbound message, which only suggests the patient', async () => {
    const mother = await patient('+919876500004');
    await patient('+919876500004');
    await post(text('919876500004', 'who reads this'));
    await enqueueOutbound(db, { dedupeKey: `quote:${mother.id}`, purpose: 'APPOINTMENT_CONFIRMATION', patientId: mother.id, toE164: '+919876500004', templateKey: 'patient_message_ack', params: {} });
    await db.outboundMessage.update({ where: { dedupeKey: `quote:${mother.id}` }, data: { state: 'SENT', providerMessageId: 'wamid.out.quoted' } });
    await post(text('919876500004', 'replying to that', { context: { id: 'wamid.out.quoted' } }));
    const msgs = await db.patientMessage.findMany({ where: { phoneE164: '+919876500004' }, orderBy: { createdAt: 'asc' } });
    expect(msgs.map((m) => [m.patientId, m.assignment])).toEqual([[null, 'UNASSIGNED'], [mother.id, 'SUGGESTED']]);
    expect((await items()).map((i) => i.subjectKey).sort()).toEqual([`patient:${mother.id}`, 'phone:+919876500004']);
  });

  it('PP-20/PP-21: an unknown sender lands unassigned under one item for the number', async () => {
    await post(text('14155550123', 'hi'));
    await post(text('14155550123', 'hello?'));
    expect(await db.patientMessage.count({ where: { phoneE164: '+14155550123', patientId: null, assignment: 'UNASSIGNED' } })).toBe(2);
    expect(await items()).toEqual([expect.objectContaining({ subjectKey: 'phone:+14155550123', state: 'OPEN' })]);
  });

  it('PP-22: acknowledges once in 24 hours in the patient language with the reading hours and the emergency number', async () => {
    await patient('+919876500005', { preferredLanguage: 'TE' });
    await post(text('919876500005', 'one'));
    await post(text('919876500005', 'two'));
    const acks = await db.outboundMessage.findMany({ where: { purpose: 'ACKNOWLEDGEMENT', toE164: '+919876500005' } });
    expect(acks).toHaveLength(1);
    await pass.runPass(ist('2099-11-24T22:30:00'));
    const [call, ...more] = meta.calls.filter((c) => c.body.to === '919876500005' && c.body.template?.name === 'patient_message_ack');
    expect(more).toHaveLength(0);
    expect(call.body.template).toMatchObject({ name: 'patient_message_ack', language: { code: 'te' } });
    expect(call.body.template.components[0].parameters.map((x: any) => x.text)).toEqual(['Linae Skin Clinic', '9 am to 6 pm', '+91 40 1234 5678']);
  });

  it('PP-06: STOP opts out every patient on the number, confirms once, sends no acknowledgement and suppresses care messages', async () => {
    const a = await patient('+919876500006');
    const b = await patient('+919876500006', { consentState: 'PENDING', phoneConfirmedAt: null });
    await post(text('919876500006', ' Stop. '));
    await post(text('919876500006', 'STOP'));
    expect((await db.patientPortalProfile.findMany({ where: { phoneE164: '+919876500006' } })).map((p) => [p.consentState, p.phoneConfirmedAt, p.consentMethod])).toEqual([
      ['OPTED_OUT', null, 'whatsapp-stop'], ['OPTED_OUT', null, 'whatsapp-stop'],
    ]);
    const queued = await db.outboundMessage.findMany({ where: { toE164: '+919876500006' } });
    expect(queued.map((m) => m.purpose)).toEqual(['OPT_OUT_CONFIRMATION']);
    await enqueueOutbound(db, { dedupeKey: `care:${a.id}`, purpose: 'REVIEW_REMINDER', patientId: a.id, toE164: '+919876500006', templateKey: 'patient_message_ack', params: {}, notBefore: new Date(0) });
    await pass.runPass(NOON);
    expect(meta.calls.map((c) => c.body.template?.name)).toEqual(['opt_out_confirmation']);
    expect(await db.outboundMessage.findUniqueOrThrow({ where: { dedupeKey: `care:${a.id}` } })).toMatchObject({ state: 'SUPPRESSED' });
    expect(b.id).toBeTruthy();
  });

  it('PP-06: the Telugu and Hindi stop words and a clinic-added word opt out; a sentence containing stop does not', async () => {
    process.env.WHATSAPP_STOP_WORDS = 'cancel messages';
    for (const [phone, word] of [['919876500007', 'ఆపు'], ['919876500008', 'बंद करो'], ['919876500009', 'Cancel messages']]) {
      await patient(`+${phone}`);
      await post(text(phone, word));
      expect((await db.patientPortalProfile.findFirstOrThrow({ where: { phoneE164: `+${phone}` } })).consentState).toBe('OPTED_OUT');
    }
    await patient('+919876500010');
    await post(text('919876500010', 'please do not stop my medicine'));
    expect((await db.patientPortalProfile.findFirstOrThrow({ where: { phoneE164: '+919876500010' } })).consentState).toBe('OPTED_IN');
    delete process.env.WHATSAPP_STOP_WORDS;
  });

  it('PP-04: tapping Yes on the confirmation opts in every PENDING patient on the number without a patient message', async () => {
    const p = await patient('+919876500011', { consentState: 'PENDING', phoneConfirmedAt: null });
    const challenge = await db.portalOtpChallenge.create({ data: { purpose: 'CONFIRM_NUMBER', phoneE164: '+919876500011', codeHash: 'x', expiresAt: new Date(Date.now() + 3600_000) } });
    await post(envelope({ messages: [{ id: `wamid.in.${++seq}`, from: '919876500011', type: 'button', button: { payload: `confirm:${challenge.id}`, text: 'Yes' } }] }));
    expect(await db.patientPortalProfile.findUniqueOrThrow({ where: { patientId: p.id } })).toMatchObject({ consentState: 'OPTED_IN', consentMethod: 'tapped-yes' });
    expect(await db.patientMessage.count({ where: { phoneE164: '+919876500011' } })).toBe(0);
  });

  it('PP-16: receipts apply in any order, only forward; a receipt before its row is applied by the next pass even with 60 newer unmatched ones; receipts unmatched for an hour stop being retried; a failed receipt reaches staff', async () => {
    const p = await patient('+919876500012');
    const status = (id: string, s: string, extra: Record<string, unknown> = {}) => envelope({ statuses: [{ id, status: s, recipient_id: '919876500012', timestamp: '1', ...extra }] });
    await post(status('wamid.out.early', 'delivered'));
    const early = await db.inboundWhatsAppEvent.findUniqueOrThrow({ where: { providerEventId: 'status:wamid.out.early:delivered' } });
    expect(early.appliedAt).toBeNull();
    await db.inboundWhatsAppEvent.update({ where: { id: early.id }, data: { receivedAt: new Date(NOON.getTime() - 50 * 60_000) } });
    const unmatched = (n: number, ageMs: number, tag: string) => db.inboundWhatsAppEvent.createMany({ data: Array.from({ length: n }, (_, i) => ({ providerEventId: `status:wamid.staff.${tag}${i}:delivered`, kind: 'status', payload: { id: `wamid.staff.${tag}${i}`, status: 'delivered' }, receivedAt: new Date(NOON.getTime() - ageMs) })) });
    await unmatched(60, 30 * 60_000, 'recent');
    await unmatched(5, 2 * 60 * 60_000, 'old');
    await enqueueOutbound(db, { dedupeKey: `r:${p.id}`, purpose: 'APPOINTMENT_CONFIRMATION', patientId: p.id, toE164: '+919876500012', templateKey: 'patient_message_ack', params: {} });
    await db.outboundMessage.update({ where: { dedupeKey: `r:${p.id}` }, data: { state: 'SENT', providerMessageId: 'wamid.out.early' } });
    expect(await pass.runPass(NOON)).toMatchObject({ receipts: 1 });
    expect((await db.outboundMessage.findUniqueOrThrow({ where: { dedupeKey: `r:${p.id}` } })).state).toBe('DELIVERED');
    expect(await db.inboundWhatsAppEvent.count({ where: { providerEventId: { startsWith: 'status:wamid.staff.old' }, appliedAt: null } })).toBe(0);
    expect(await db.inboundWhatsAppEvent.count({ where: { providerEventId: { startsWith: 'status:wamid.staff.recent' }, appliedAt: null } })).toBe(60);
    await post(status('wamid.out.early', 'read'));
    await post(status('wamid.out.early', 'sent'));
    expect((await db.outboundMessage.findUniqueOrThrow({ where: { dedupeKey: `r:${p.id}` } })).state).toBe('READ');

    await enqueueOutbound(db, { dedupeKey: `f:${p.id}`, purpose: 'APPOINTMENT_CONFIRMATION', patientId: p.id, toE164: '+919876500012', templateKey: 'patient_message_ack', params: {} });
    await db.outboundMessage.update({ where: { dedupeKey: `f:${p.id}` }, data: { state: 'SENT', providerMessageId: 'wamid.out.fail' } });
    await post(status('wamid.out.fail', 'failed', { errors: [{ code: 131026 }] }));
    expect(await db.outboundMessage.findUniqueOrThrow({ where: { dedupeKey: `f:${p.id}` } })).toMatchObject({ state: 'FAILED', outcome: 'receipt-failed:131026' });
    expect(await db.attentionItem.count({ where: { kind: 'DELIVERY_FAILURE', patientId: p.id, state: 'OPEN' } })).toBe(1);
  });

  it('PP-10/PP-21: a merge moves messages to the kept patient and leaves one open message item', async () => {
    const kept = await db.patient.create({ data: { name: 'Mira Dup', gender: 'F', phone: '9876500013', branchId: 'A', createdAt: new Date('2026-01-01') } });
    const dup = await db.patient.create({ data: { name: 'Mira Dup', gender: 'F', phone: '9876500013', branchId: 'A', createdAt: new Date('2026-02-01') } });
    await db.patientPortalProfile.create({ data: { patientId: kept.id, phoneE164: '+919876500013', portalEnabled: false } });
    await db.patientPortalProfile.create({ data: { patientId: dup.id, phoneE164: '+919876500013' } });
    await post(text('919876500013', 'to the duplicate'));
    await db.attentionItem.create({ data: { kind: 'PATIENT_MESSAGE', subjectKey: `patient:${kept.id}`, patientId: kept.id } });
    await new PatientDeduplicationService(db as any).runDuplicatePatientMergeJob();
    expect(await db.patientMessage.findMany({ where: { phoneE164: '+919876500013' }, select: { patientId: true } })).toEqual([{ patientId: kept.id }]);
    expect((await items({ state: { not: 'RESOLVED' } })).map((i) => i.subjectKey)).toEqual([`patient:${kept.id}`]);
  });

  it('PP-23: no log line carries the text a patient sent', () => {
    expect(logged.length).toBeGreaterThanOrEqual(0);
    expect(logged.join('\n')).not.toContain('rash is spreading');
  });

  it('PP-23: a patient text is stored in the thread but not logged', async () => {
    await patient('+919876500014');
    await post(text('919876500014', PRIVATE_TEXT));
    await post(text('919876500014', PRIVATE_TEXT), { signature: 'sha256=bad' });
    expect(await db.patientMessage.count({ where: { body: PRIVATE_TEXT } })).toBe(1);
    expect(logged.join('\n')).not.toContain(PRIVATE_TEXT);
  });
});
