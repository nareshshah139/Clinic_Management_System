import { ConflictException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { InboundWhatsAppService } from '../../messaging/inbound.service';
import { SendPassService } from '../../messaging/send-pass.service';
import { WhatsAppSender } from '../../messaging/whatsapp-sender';
import { startFakeMeta } from '../../messaging/tests/fake-meta';
import { FollowUpsService } from '../follow-ups.service';
import { kolkataAt } from '../schedule';
import { startTrack } from '../tracks';
import { WorklistController } from '../worklist.controller';
import { Staff, WorklistService } from '../worklist.service';

const HOUR = 3600 * 1000;
const ist = (s: string) => new Date(`${s}+05:30`);

const databaseTests = process.env.FOLLOW_UPS_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Follow-up worklist and clinic inbox on PostgreSQL against a fake Meta endpoint', () => {
  const schema = `worklist_${randomUUID().replaceAll('-', '')}`;
  const env = { ...process.env };
  let admin: PrismaClient;
  let db: PrismaClient;
  let worklist: WorklistService;
  let inbound: InboundWhatsAppService;
  let pass: SendPassService;
  let meta: Awaited<ReturnType<typeof startFakeMeta>>;
  let created = false;
  let planVersionId: string;
  let seq = 0;

  const doctor: Staff = { id: 'doc', role: 'DOCTOR', branchId: 'A' };
  const reception: Staff = { id: 'rec', role: 'RECEPTION', branchId: 'A' };
  const nurse: Staff = { id: 'nur', role: 'NURSE', branchId: 'A' };
  const otherBranch: Staff = { id: 'docB', role: 'DOCTOR', branchId: 'B' };

  const phoneFor = (n: number) => `+9191000${String(n).padStart(5, '0')}`;
  const patient = async (opts: { branchId?: string; consent?: 'OPTED_IN' | 'PENDING' | 'OPTED_OUT' | null; phone?: string } = {}) => {
    const n = ++seq;
    const phone = opts.phone ?? phoneFor(n);
    const p = await db.patient.create({ data: { name: `Synthetic Inbox ${n}`, gender: 'F', phone: phone.slice(3), branchId: opts.branchId ?? 'A' } as any });
    if (opts.consent !== null) {
      const consent = opts.consent ?? 'OPTED_IN';
      await db.patientPortalProfile.create({
        data: { patientId: p.id, phoneE164: phone, consentState: consent, phoneConfirmedAt: consent === 'OPTED_IN' ? new Date() : null, lastSeenAt: new Date('2099-01-01') },
      });
    }
    return { ...p, phoneE164: phone };
  };
  const inboundText = (from: string, text: string, at = new Date(), extra: Record<string, unknown> = {}) =>
    inbound.applyMessage({ id: `wamid.in.${randomUUID()}`, from: from.replace('+', ''), type: 'text', text: { body: text }, timestamp: String(Math.floor(at.getTime() / 1000)), ...extra }, at);
  const itemFor = (subjectKey: string) => db.attentionItem.findFirstOrThrow({ where: { subjectKey, state: { not: 'RESOLVED' } } });
  const item = (data: Record<string, unknown>) =>
    db.attentionItem.create({ data: { kind: 'MISSED_CHECK_IN', subjectKey: `check-in:${randomUUID()}`, branchId: 'A', ...data } as any });

  beforeAll(async () => {
    Logger.overrideLogger(false);
    meta = await startFakeMeta();
    Object.assign(process.env, {
      WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '555', WHATSAPP_GRAPH_BASE_URL: meta.baseUrl,
      PORTAL_LINK_SECRET: 'test-link-secret', PORTAL_BASE_URL: 'https://portal.example.test', CLINIC_NAME: 'Linae Skin Clinic',
    });
    const url = new URL(process.env.FOLLOW_UPS_TEST_DATABASE_URL!);
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
    pass = new SendPassService(db as any, new WhatsAppSender());
    inbound = new InboundWhatsAppService(db as any, pass);
    worklist = new WorklistService(db as any, pass);
    await db.branch.createMany({ data: [{ id: 'A', name: 'Branch A', address: 'Synthetic' }, { id: 'B', name: 'Branch B', address: 'Synthetic' }] });
    for (const [id, role, first, branchId] of [['own', 'OWNER', 'Owner', 'A'], ['doc', 'DOCTOR', 'Meera', 'A'], ['rec', 'RECEPTION', 'Sunita', 'A'], ['nur', 'NURSE', 'Anita', 'A'], ['docB', 'DOCTOR', 'Ravi', 'B']]) {
      await db.user.create({ data: { id, email: `${id}@example.test`, password: 'x', firstName: first, lastName: 'Synthetic', role, branchId } as any });
    }
    const results = await new FollowUpsService(db as any).importData('own');
    planVersionId = results.find((r) => r.key === 'skin-two-week')!.versionId;
  }, 120000);

  beforeEach(async () => {
    meta.reset();
    await db.attentionItem.deleteMany({});
  });

  afterAll(async () => {
    process.env = env;
    await meta?.close();
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  describe('PP-48: Needs attention', () => {
    it('lists open items by priority then oldest first with their age, scoped to the branch plus unknown senders', async () => {
      const now = new Date();
      const p = await patient();
      const pb = await patient({ branchId: 'B' });
      const oldNormal = await item({ priority: 'NORMAL', patientId: p.id, createdAt: new Date(now.getTime() - 5 * HOUR) });
      const newUrgent = await item({ priority: 'URGENT', patientId: p.id, createdAt: new Date(now.getTime() - 1 * HOUR) });
      const oldUrgent = await item({ priority: 'URGENT', patientId: p.id, createdAt: new Date(now.getTime() - 3 * HOUR) });
      const high = await item({ priority: 'HIGH', patientId: p.id, createdAt: new Date(now.getTime() - 2 * HOUR) });
      const unknown = await item({ kind: 'PATIENT_MESSAGE', subjectKey: 'phone:+919999900001', patientId: null, branchId: null, phoneE164: '+919999900001', createdAt: new Date(now.getTime() - 4 * HOUR) });
      const otherBranchItem = await item({ priority: 'URGENT', patientId: pb.id, branchId: 'B' });
      await item({ priority: 'URGENT', patientId: p.id, state: 'RESOLVED' });

      const list = await worklist.listItems('A', now);
      expect(list.map((i) => i.id)).toEqual([oldUrgent.id, newUrgent.id, high.id, oldNormal.id, unknown.id]);
      expect(list[0].ageMinutes).toBe(180);
      expect((await worklist.listItems('B', now)).map((i) => i.id)).toEqual([otherBranchItem.id, unknown.id]);
      await expect(worklist.getItem(otherBranchItem.id, doctor)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('PP-50: claim, release, resolve', () => {
    it('one claimer at a time; reception may claim an urgent item but only doctors, nurses and admins resolve it', async () => {
      const p = await patient();
      const urgent = await item({ priority: 'URGENT', patientId: p.id });
      const results = await Promise.allSettled([worklist.claim(urgent.id, reception), worklist.claim(urgent.id, doctor)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const winner = results[0].status === 'fulfilled' ? reception : doctor;
      const loser = winner === reception ? doctor : reception;
      expect((await db.attentionItem.findUniqueOrThrow({ where: { id: urgent.id } })).claimedById).toBe(winner.id);
      await worklist.release(urgent.id, winner);
      await expect(worklist.release(urgent.id, loser)).rejects.toBeInstanceOf(ConflictException);

      const claimed = await worklist.claim(urgent.id, reception);
      expect(claimed).toMatchObject({ state: 'CLAIMED', claimedBy: { id: 'rec', name: 'Sunita Synthetic' }, canResolve: false });
      await expect(worklist.claim(urgent.id, doctor)).rejects.toThrow('Sunita Synthetic is already working on this item.');
      await expect(worklist.resolve(urgent.id, reception, 'CALLED', 'Called, no answer')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(worklist.resolve(urgent.id, nurse, 'CALLED', 'Called')).rejects.toThrow('Someone else is working on this item.');
      await worklist.release(urgent.id, reception);
      const resolved = await worklist.resolve(urgent.id, nurse, 'CALLED', '  Spoke to the patient, review booked.  ');
      expect(resolved).toMatchObject({ state: 'RESOLVED', resolutionCode: 'CALLED', resolutionNote: 'Spoke to the patient, review booked.', resolvedBy: { id: 'nur' } });
      await expect(worklist.resolve(urgent.id, doctor, 'CALLED', 'again')).rejects.toThrow('already resolved');
      expect((await worklist.listItems('A')).map((i) => i.id)).not.toContain(urgent.id);

      const normal = await item({ priority: 'NORMAL', patientId: p.id });
      expect(await worklist.resolve(normal.id, reception, 'NO_ACTION_NEEDED', 'Patient is fine')).toMatchObject({ state: 'RESOLVED', canResolve: true });
    });
  });

  describe('PP-51: staff replies', () => {
    it('inside the window a reply reaches the confirmed number through the sender and joins the thread', async () => {
      const p = await patient();
      await inboundText(p.phoneE164, 'My rash is <b>worse</b> today');
      const pending = await itemFor(`patient:${p.id}`);
      expect((await worklist.listThreads('A')).find((t) => t.subjectKey === `patient:${p.id}`)).toMatchObject({ unread: 1, itemId: pending.id, preview: 'My rash is <b>worse</b> today' });
      meta.reset();

      const result = await worklist.reply(pending.id, doctor, 'Please send a photo and come in tomorrow.');
      expect(result).toMatchObject({ outcome: 'sent', delivery: { state: 'SENT' } });
      expect(meta.calls).toHaveLength(1);
      expect(meta.calls[0].body).toEqual({ messaging_product: 'whatsapp', to: p.phoneE164.slice(1), type: 'text', text: { body: 'Please send a photo and come in tomorrow.' } });
      const out = await db.outboundMessage.findFirstOrThrow({ where: { patientId: p.id, purpose: 'STAFF_REPLY' } });
      expect(out).toMatchObject({ state: 'SENT', toE164: p.phoneE164 });
      expect(result.item.thread.map((m) => [m.direction, m.body, m.author, m.delivery?.state ?? null])).toEqual([
        ['INBOUND', 'My rash is <b>worse</b> today', null, null],
        ['OUTBOUND', 'Please send a photo and come in tomorrow.', 'Meera Synthetic', 'SENT'],
      ]);
      expect((await worklist.listThreads('A')).find((t) => t.subjectKey === `patient:${p.id}`)).toBeUndefined();
    });

    it('a closed window, an unconfirmed number or an opt-out offers "log a call" and sends nothing', async () => {
      const stale = await patient();
      await inboundText(stale.phoneE164, 'Hello', new Date(Date.now() - 25 * HOUR));
      const staleItem = await itemFor(`patient:${stale.id}`);
      expect((await worklist.getItem(staleItem.id, reception)).reply).toMatchObject({ canReply: false, reason: 'window-closed' });
      meta.reset();
      await expect(worklist.reply(staleItem.id, reception, 'Hi')).rejects.toBeInstanceOf(ConflictException);
      expect(meta.calls).toHaveLength(0);
      expect(await db.outboundMessage.count({ where: { patientId: stale.id, purpose: 'STAFF_REPLY' } })).toBe(0);
      const logged = await worklist.logCall(staleItem.id, reception, 'Called, patient will come on Friday');
      expect(logged.thread.at(-1)).toMatchObject({ direction: 'OUTBOUND', channel: 'PHONE', body: 'Called, patient will come on Friday', author: 'Sunita Synthetic' });

      const pending = await patient({ consent: 'PENDING' });
      await inboundText(pending.phoneE164, 'Hello');
      expect((await worklist.getItem((await itemFor(`patient:${pending.id}`)).id, reception)).reply).toMatchObject({ canReply: false, reason: 'number-not-confirmed' });

      const unknownPhone = '+919999900077';
      await inboundText(unknownPhone, 'Who is this?');
      expect((await worklist.getItem((await itemFor(`phone:${unknownPhone}`)).id, reception)).reply).toMatchObject({ canReply: false, reason: 'unknown-sender' });
    });

    it('the send pass re-checks at send time and exempts replies from the send window and the daily cap (PP-14)', async () => {
      const p = await patient();
      const night = ist('2026-11-20T23:30:00');
      await inboundText(p.phoneE164, 'Itching at night', new Date(night.getTime() - HOUR));
      await db.outboundMessage.create({ data: { dedupeKey: `care-${p.id}`, purpose: 'CHECK_IN_OPENED', patientId: p.id, toE164: p.phoneE164, templateKey: 'check_in_opened', state: 'SENT', sentAt: kolkataAt('2026-11-20', 10) } });
      const row = await db.outboundMessage.create({ data: { dedupeKey: `reply-${p.id}`, purpose: 'STAFF_REPLY', patientId: p.id, toE164: p.phoneE164, templateKey: 'staff_reply', params: { whatsapp: { kind: 'text', text: 'Apply the cream' } } } });
      expect(await db.$transaction((tx) => pass.decide(tx, row, night))).toEqual({ kind: 'send' });
      await db.patientPortalProfile.update({ where: { patientId: p.id }, data: { consentState: 'OPTED_OUT', phoneConfirmedAt: null } });
      expect(await db.$transaction((tx) => pass.decide(tx, row, night))).toEqual({ kind: 'suppress', reason: 'reply-opted-out' });
    });
  });

  describe('PP-52: assigning messages', () => {
    it('an unknown sender shows to every branch and on no patient page until staff assign it', async () => {
      const unknownPhone = '+919999900055';
      await inboundText(unknownPhone, 'This is my new number');
      const phoneItem = await itemFor(`phone:${unknownPhone}`);
      expect((await worklist.listItems('B')).map((i) => i.id)).toContain(phoneItem.id);
      const p = await patient();
      const detail = await worklist.getItem(phoneItem.id, reception);
      const message = detail.thread[0];
      expect(message).toMatchObject({ assignment: 'UNASSIGNED', patient: null });
      expect((await worklist.timeline(p.id, 'A')).messages).toHaveLength(0);

      await expect(worklist.assignMessage(message.id, otherBranch, p.id)).rejects.toBeInstanceOf(NotFoundException);
      const assigned = await worklist.assignMessage(message.id, reception, p.id);
      expect(assigned.itemId).toBe((await itemFor(`patient:${p.id}`)).id);
      expect((await db.attentionItem.findUniqueOrThrow({ where: { id: phoneItem.id } })).state).toBe('RESOLVED');
      expect((await worklist.timeline(p.id, 'A')).messages.map((m) => m.body)).toEqual(['This is my new number']);
      await expect(worklist.assignMessage(message.id, reception, p.id)).rejects.toThrow('already assigned');
    });

    it('a suggested assignment stays off the patient page until confirmed', async () => {
      const phone = '+919999900066';
      const mother = await patient({ phone });
      const child = await patient({ phone });
      await db.outboundMessage.create({ data: { dedupeKey: `q-${child.id}`, purpose: 'CHECK_IN_OPENED', patientId: child.id, toE164: phone, templateKey: 'check_in_opened', state: 'SENT', providerMessageId: `wamid.out.${child.id}` } });
      await inboundText(phone, 'Answering for my son', new Date(), { context: { id: `wamid.out.${child.id}` } });
      const suggested = await db.patientMessage.findFirstOrThrow({ where: { phoneE164: phone } });
      expect(suggested).toMatchObject({ patientId: child.id, assignment: 'SUGGESTED' });
      expect((await worklist.timeline(child.id, 'A')).messages).toHaveLength(0);
      expect((await worklist.listThreads('A')).find((t) => t.subjectKey === `patient:${child.id}`)).toMatchObject({ suggested: true });
      await worklist.confirmMessage(suggested.id, nurse);
      expect((await worklist.timeline(child.id, 'A')).messages.map((m) => m.body)).toEqual(['Answering for my son']);
      expect((await worklist.timeline(mother.id, 'A')).messages).toHaveLength(0);
      await expect(worklist.confirmMessage(suggested.id, nurse)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('PP-49/53: item detail, waiting check-ins, timeline and photos', () => {
    it('shows answers, photo, score, earlier responses and the thread; the timeline and waiting list carry the same check-ins', async () => {
      const p = await patient();
      const visit = await db.visit.create({ data: { patientId: p.id, doctorId: 'doc', complaints: '[]', status: 'COMPLETED', completedAt: ist('2026-11-01T11:00:00') } as any });
      const track = await db.$transaction((tx) => startTrack(tx, { visitId: visit.id, patientId: p.id, planVersionId, anchorDay: '2026-11-01' }));
      const [first, second] = await db.checkIn.findMany({ where: { trackId: track.id }, orderBy: { seq: 'asc' } });
      const earlier = await db.checkInResponse.create({ data: { checkInId: first.id, instrumentVersionId: first.instrumentVersionId, answers: { severity: 4, change: 'same' }, score: 4, submittedAt: ist('2026-11-04T10:00:00') } });
      await db.checkIn.update({ where: { id: first.id }, data: { state: 'ANSWERED' } });
      const latest = await db.checkInResponse.create({ data: { checkInId: second.id, instrumentVersionId: second.instrumentVersionId, answers: { severity: 9, change: 'worse' }, score: 9, flag: 'URGENT', submittedAt: ist('2026-11-15T10:00:00') } });
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
      const photo = await db.responseAttachment.create({ data: { responseId: latest.id, itemKey: 'photo', mime: 'image/jpeg', sizeBytes: jpeg.length, bytes: jpeg } });
      await db.checkIn.update({ where: { id: second.id }, data: { state: 'ANSWERED' } });
      const flag = await item({ kind: 'RESPONSE_FLAG', subjectKey: `response:${latest.id}`, priority: 'URGENT', patientId: p.id });
      await inboundText(p.phoneE164, 'Sent the photo');

      const detail = await worklist.getItem(flag.id, doctor);
      expect(detail.response).toMatchObject({ id: latest.id, score: 9, flag: 'URGENT', photos: [{ id: photo.id, itemKey: 'photo' }] });
      expect(detail.response!.answers.find((a) => a.key === 'severity')).toMatchObject({ value: '9' });
      expect(detail.response!.answers.find((a) => a.key === 'change')!.value).toMatch(/worse/i);
      expect(detail.earlierResponses.map((r) => [r.id, r.score])).toEqual([[earlier.id, 4]]);
      expect(detail.checkIn).toMatchObject({ id: second.id, stepKey: 'day14', plan: 'Two-week skin check' });
      expect(detail.thread.map((m) => m.body)).toEqual(['Sent the photo']);

      const timeline = await worklist.timeline(p.id, 'A');
      expect(timeline.profile).toMatchObject({ consentState: 'OPTED_IN', preferredLanguage: 'EN' });
      expect(timeline.tracks[0].checkIns.map((c) => [c.stepKey, c.state, c.response?.score ?? null])).toEqual([['day3', 'ANSWERED', 4], ['day14', 'ANSWERED', 9]]);
      await expect(worklist.timeline(p.id, 'B')).rejects.toBeInstanceOf(NotFoundException);

      const res = { headers: {} as Record<string, string>, set(h: Record<string, string>) { Object.assign(this.headers, h); } };
      const controller = new WorklistController(worklist);
      const file = await controller.attachment(photo.id, { user: { id: 'doc', branchId: 'A', role: 'DOCTOR' } } as any, res as any);
      expect(res.headers).toEqual({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      const chunks: Buffer[] = [];
      for await (const chunk of file.getStream()) chunks.push(chunk as Buffer);
      expect(Buffer.concat(chunks)).toEqual(jpeg);
      await expect(worklist.attachment(photo.id, 'B')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('"Waiting on patient" lists open check-ins with the delivery state of their message', async () => {
      const p = await patient();
      const visit = await db.visit.create({ data: { patientId: p.id, doctorId: 'doc', complaints: '[]' } });
      const track = await db.$transaction((tx) => startTrack(tx, { visitId: visit.id, patientId: p.id, planVersionId, anchorDay: '2026-11-01' }));
      const first = await db.checkIn.findFirstOrThrow({ where: { trackId: track.id, seq: 0 } });
      await pass.runPass(new Date(first.opensAt.getTime() + 60 * 1000));
      const row = (await worklist.listWaiting('A')).find((c) => c.checkInId === first.id);
      expect(row).toMatchObject({ stepKey: 'day3', plan: 'Two-week skin check', patient: { id: p.id }, delivery: { purpose: 'CHECK_IN_OPENED', state: 'SENT' } });
      expect((await worklist.listWaiting('B')).find((c) => c.checkInId === first.id)).toBeUndefined();
    });
  });
});
