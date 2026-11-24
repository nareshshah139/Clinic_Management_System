import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { gate } from '../../../shared/testing/interleave';
import { SendPassService } from '../../messaging/send-pass.service';
import { WhatsAppSender } from '../../messaging/whatsapp-sender';
import { startFakeMeta } from '../../messaging/tests/fake-meta';
import { PatientDeduplicationService } from '../../patients/patient-deduplication.service';
import { PatientsService } from '../../patients/patients.service';
import { AppointmentsService } from '../../appointments/appointments.service';
import { ReviewBookingService } from '../../visits/review-booking';
import { VisitsService } from '../../visits/visits.service';
import { FollowUpsService } from '../follow-ups.service';
import { importFollowUpData, readDataFiles } from '../plan-import';
import { anchorDay } from '../tracks';
import { hashTaskToken } from '../task-link';
import { addDays, kolkataAt } from '../schedule';
import { queueCheckInReminders } from '../scheduler';

const ist = (s: string) => new Date(`${s}+05:30`);

const databaseTests = process.env.FOLLOW_UPS_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Follow-up plans, tracks and the scheduler pass on PostgreSQL against a fake Meta endpoint', () => {
  const schema = `follow_ups_${randomUUID().replaceAll('-', '')}`;
  const env = { ...process.env };
  let admin: PrismaClient;
  let db: PrismaClient;
  let visits: VisitsService;
  let followUps: FollowUpsService;
  let pass: SendPassService;
  let meta: Awaited<ReturnType<typeof startFakeMeta>>;
  let created = false;
  let planVersionId: string;
  let otherPlanVersionId: string;
  let seq = 0;

  const patient = async (consent = true) => {
    const n = ++seq;
    const p = await db.patient.create({ data: { name: `Synthetic Follow ${n}`, gender: 'F', phone: `90000${String(n).padStart(5, '0')}`, branchId: 'A' } as any });
    if (consent) {
      await db.patientPortalProfile.create({
        data: { patientId: p.id, phoneE164: `+9190000${String(n).padStart(5, '0')}`, consentState: 'OPTED_IN', phoneConfirmedAt: new Date(), lastSeenAt: new Date('2099-01-01'), preferredLanguage: 'TE' },
      });
    }
    return p;
  };
  const visit = async (patientId: string) => db.visit.create({ data: { patientId, doctorId: 'doc', complaints: '[]' } });
  const tracks = (where: any = {}) => db.followUpTrack.findMany({ where, orderBy: { createdAt: 'asc' }, include: { checkIns: { orderBy: { seq: 'asc' } } } });
  const completed = async (planId: string | null = planVersionId) => {
    const p = await patient();
    const v = await visit(p.id);
    await visits.complete(v.id, { followUpPlanVersionId: planId } as any, 'A');
    const row = await db.visit.findUniqueOrThrow({ where: { id: v.id } });
    return { p, v: row, anchor: anchorDay(row.completedAt!) };
  };

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
    visits = new VisitsService(db as any);
    followUps = new FollowUpsService(db as any);
    pass = new SendPassService(db as any, new WhatsAppSender());
    await db.branch.create({ data: { id: 'A', name: 'Branch A', address: 'Synthetic' } });
    await db.user.create({ data: { id: 'own', email: 'own@example.test', password: 'x', firstName: 'O', lastName: 'W', role: 'OWNER', branchId: 'A' } as any });
    await db.user.create({ data: { id: 'doc', email: 'doc@example.test', password: 'x', firstName: 'Meera', lastName: 'Rao', role: 'DOCTOR', branchId: 'A' } as any });
    const results = await followUps.importData('own');
    planVersionId = results.find((r) => r.key === 'skin-two-week')!.versionId;
    otherPlanVersionId = results.find((r) => r.key === 'treatment-four-week')!.versionId;
  }, 120000);

  beforeEach(() => meta.reset());

  afterAll(async () => {
    process.env = env;
    await meta?.close();
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  describe('PP-24: reviewed plan import', () => {
    it('identical content is a no-op, twice and concurrently', async () => {
      const before = await db.followUpPlanVersion.count();
      const again = await Promise.all([followUps.importData('own'), followUps.importData('own')]);
      expect(again.flat().every((r) => !r.created)).toBe(true);
      expect(await db.followUpPlanVersion.count()).toBe(before);
      expect(await db.instrumentVersion.count()).toBe(2);
    });

    it('changed content publishes the next version and leaves the published one unchanged', async () => {
      const files = readDataFiles();
      const first = await db.instrumentVersion.findFirstOrThrow({ where: { instrument: { key: 'treatment-check' }, version: 1 } });
      const changed = structuredClone(files);
      changed.instruments.find((i) => i.key === 'treatment-check')!.title.EN = 'Treatment check (revised)';
      const results = await db.$transaction((tx) => importFollowUpData(tx, changed, 'own'));
      expect(results.find((r) => r.key === 'treatment-check')).toMatchObject({ version: 2, created: true });
      expect(results.find((r) => r.key === 'treatment-four-week')).toMatchObject({ version: 2, created: true });
      expect(results.find((r) => r.key === 'skin-two-week')).toMatchObject({ version: 1, created: false });
      expect(await db.instrumentVersion.findUniqueOrThrow({ where: { id: first.id } })).toEqual(first);
      const plans = await followUps.listPlans();
      expect(plans.find((p) => p.key === 'treatment-four-week')).toMatchObject({ version: 2 });
    });

    it('reimporting an older version\'s content publishes it as the next version (v1 -> v2 -> v1 content = v3)', async () => {
      const v1 = await db.instrumentVersion.findFirstOrThrow({ where: { instrument: { key: 'treatment-check' }, version: 1 } });
      const v2 = await db.instrumentVersion.findFirstOrThrow({ where: { instrument: { key: 'treatment-check' }, version: 2 } });
      const original = readDataFiles();
      const results = await Promise.all([
        db.$transaction((tx) => importFollowUpData(tx, original, 'own')),
        db.$transaction((tx) => importFollowUpData(tx, original, 'own')),
      ]);
      expect(results.flat().filter((r) => r.key === 'treatment-check' && r.created)).toHaveLength(1);
      const v3 = await db.instrumentVersion.findFirstOrThrow({ where: { instrument: { key: 'treatment-check' }, version: 3 } });
      expect(v3.contentHash).toBe(v1.contentHash);
      expect(v3.content).toEqual(v1.content);
      expect(await db.instrumentVersion.findUniqueOrThrow({ where: { id: v1.id } })).toEqual(v1);
      expect(await db.instrumentVersion.findUniqueOrThrow({ where: { id: v2.id } })).toEqual(v2);
      expect(await db.instrumentVersion.count({ where: { instrument: { key: 'treatment-check' } } })).toBe(3);
      const plans = await followUps.listPlans();
      expect(plans.find((p) => p.key === 'treatment-four-week')).toMatchObject({ version: 3 });
      expect(plans.find((p) => p.key === 'skin-two-week')).toMatchObject({ version: 1 });
      const again = await db.$transaction((tx) => importFollowUpData(tx, original, 'own'));
      expect(again.every((r) => !r.created)).toBe(true);
    });

    it('refuses a version that misses a Telugu or Hindi translation and publishes nothing', async () => {
      const before = await db.instrumentVersion.count();
      const broken = structuredClone(readDataFiles());
      delete (broken.instruments[0].items[0].prompt as any).HI;
      await expect(db.$transaction((tx) => importFollowUpData(tx, broken, 'own'))).rejects.toThrow('Follow-up data refused');
      expect(await db.instrumentVersion.count()).toBe(before);
    });
  });

  describe('PP-27/28/29: tracks follow the visit', () => {
    it('completion creates one track with every check-in at the spec times, twice and concurrently', async () => {
      const p = await patient();
      const v = await visit(p.id);
      await Promise.all([
        visits.complete(v.id, { followUpPlanVersionId: planVersionId } as any, 'A'),
        visits.complete(v.id, { followUpPlanVersionId: planVersionId } as any, 'A'),
      ]);
      await visits.complete(v.id, { followUpPlanVersionId: planVersionId } as any, 'A');
      const rows = await tracks({ visitId: v.id });
      expect(rows).toHaveLength(1);
      const anchor = anchorDay((await db.visit.findUniqueOrThrow({ where: { id: v.id } })).completedAt!);
      expect(rows[0]).toMatchObject({ state: 'ACTIVE', anchorDate: anchor, patientId: p.id });
      expect(rows[0].checkIns.map((c) => [c.stepKey, c.state, c.opensAt, c.closesAt])).toEqual([
        ['day3', 'SCHEDULED', kolkataAt(addDays(anchor, 3), 9), kolkataAt(addDays(anchor, 4), 20)],
        ['day14', 'SCHEDULED', kolkataAt(addDays(anchor, 14), 9), kolkataAt(addDays(anchor, 16), 20)],
      ]);
      expect((await db.visit.findUniqueOrThrow({ where: { id: v.id } })).followUpPlanVersionId).toBe(planVersionId);
    });

    it('"No follow-up" creates no track', async () => {
      const { v } = await completed(null);
      expect(await tracks({ visitId: v.id })).toHaveLength(0);
    });

    it('a plan change stops the old track and starts the new one from the first completion date; a date-only edit changes nothing', async () => {
      const { v, anchor } = await completed();
      await visits.update(v.id, { treatmentPlan: { followUpDate: '2099-12-01' } } as any, 'A', 'doc');
      expect(await tracks({ visitId: v.id })).toHaveLength(1);
      const current = await db.visit.findUniqueOrThrow({ where: { id: v.id } });
      await visits.update(v.id, { followUpPlanVersionId: otherPlanVersionId, version: current.version } as any, 'A', 'doc');
      const [old, next] = await tracks({ visitId: v.id });
      expect(old).toMatchObject({ state: 'STOPPED', stopReason: 'plan-changed', stoppedById: 'doc' });
      expect(old.checkIns.every((c) => c.state === 'CANCELLED')).toBe(true);
      expect(next).toMatchObject({ state: 'ACTIVE', planVersionId: otherPlanVersionId, anchorDate: anchor });
    });

    it('deleting the visit and archiving the patient stop tracks and cancel open check-ins', async () => {
      const a = await completed();
      await visits.remove(a.v.id, 'A');
      expect(await tracks({ visitId: a.v.id })).toMatchObject([{ state: 'STOPPED', stopReason: 'visit-deleted' }]);
      const b = await completed();
      await db.checkIn.updateMany({ where: { track: { visitId: b.v.id }, seq: 0 }, data: { state: 'OPEN' } });
      await new PatientsService(db as any, {} as any, {} as any).archive(b.p.id, 'A', 'own');
      const [t] = await tracks({ visitId: b.v.id });
      expect(t).toMatchObject({ state: 'STOPPED', stopReason: 'patient-archived' });
      expect(t.checkIns.map((c) => c.state)).toEqual(['CANCELLED', 'CANCELLED']);
    });

    it('PP-29: completing or re-planning a visit of an archived patient starts no track', async () => {
      const p = await patient();
      const v = await visit(p.id);
      await new PatientsService(db as any, {} as any, {} as any).archive(p.id, 'A', 'own');
      await visits.complete(v.id, { followUpPlanVersionId: planVersionId } as any, 'A');
      const row = await db.visit.findUniqueOrThrow({ where: { id: v.id } });
      await visits.update(v.id, { version: row.version, followUpPlanVersionId: otherPlanVersionId } as any, 'A', 'doc');
      expect(await tracks({ visitId: v.id })).toEqual([]);
    });

    it('PP-29: a staff archive and a plan change at once both succeed and leave no live track', async () => {
      for (let round = 0; round < 5; round++) {
        const { p, v } = await completed();
        await Promise.all([
          new PatientsService(db as any, {} as any, {} as any).archive(p.id, 'A', 'own'),
          visits.update(v.id, { version: v.version, followUpPlanVersionId: otherPlanVersionId } as any, 'A', 'doc'),
        ]);
        expect((await tracks({ visitId: v.id })).filter((t) => t.state !== 'STOPPED')).toEqual([]);
      }
    });

    it('PP-26: lists the plan picker and active tracks, and a doctor stop is idempotent under concurrency', async () => {
      const { p } = await completed();
      expect((await followUps.listPlans()).map((x) => x.key)).toEqual(['skin-two-week', 'treatment-four-week']);
      const [t] = await followUps.activeTracks(p.id, 'A');
      const results = await Promise.all([followUps.stopTrack(t.id, 'A', 'doc'), followUps.stopTrack(t.id, 'A', 'doc')]);
      expect(results.map((r) => r.stopped).sort()).toEqual([false, true]);
      expect(await followUps.activeTracks(p.id, 'A')).toHaveLength(0);
      await expect(followUps.stopTrack(t.id, 'B', 'doc')).rejects.toThrow('Track not found');
    });

    it('PP-10: merging a duplicate moves its track and task link to the kept patient and stops nothing', async () => {
      const name = `Merge Person ${randomUUID().slice(0, 6)}`;
      const kept = await db.patient.create({ data: { name, gender: 'F', phone: '9811122233', branchId: 'A', createdAt: new Date('2020-01-01') } as any });
      const dup = await db.patient.create({ data: { name: name.toUpperCase(), gender: 'F', phone: '98111-22233', branchId: 'A' } as any });
      const v = await visit(dup.id);
      await visits.complete(v.id, { followUpPlanVersionId: planVersionId } as any, 'A');
      await db.portalTaskLink.create({ data: { dedupeKey: `merge-${dup.id}`, patientId: dup.id, tokenHash: randomUUID() } });
      await new PatientDeduplicationService(db as any).runDuplicatePatientMergeJob();
      expect(await tracks({ visitId: v.id })).toMatchObject([{ state: 'ACTIVE', patientId: kept.id }]);
      expect(await db.portalTaskLink.findMany({ where: { dedupeKey: `merge-${dup.id}` } })).toMatchObject([{ patientId: kept.id, revokedAt: null }]);
    });
  });

  describe('PP-30..34: the scheduler pass', () => {
    const passAt = (anchor: string, offset: number, time: string) => ist(`${addDays(anchor, offset)}T${time}`);

    it('opens due check-ins and sends one CHECK_IN_OPENED per patient-day with the task token as the URL button, twice and concurrently', async () => {
      const { p, v, anchor } = await completed();
      // a second visit with the same plan: both day-3 check-ins share one link and one message
      const v2 = await visit(p.id);
      await visits.complete(v2.id, { followUpPlanVersionId: planVersionId } as any, 'A');
      const at = passAt(anchor, 3, '10:00:00');
      await Promise.all([pass.runPass(at), pass.runPass(at)]);
      await pass.runPass(at);
      const opened = await db.checkIn.findMany({ where: { track: { patientId: p.id }, state: 'OPEN' }, include: { taskLink: true } });
      expect(opened).toHaveLength(2);
      expect(new Set(opened.map((c) => c.taskLink!.linkId)).size).toBe(1);
      const linkId = opened[0].taskLink!.linkId;
      const msgs = await db.outboundMessage.findMany({ where: { patientId: p.id } });
      expect(msgs).toMatchObject([{ purpose: 'CHECK_IN_OPENED', state: 'SENT', subjectType: 'TASK_LINK', subjectId: linkId }]);
      const to = (await db.patientPortalProfile.findUniqueOrThrow({ where: { patientId: p.id } })).phoneE164!.slice(1);
      const sends = meta.calls.filter((c) => c.body?.to === to);
      expect(sends).toHaveLength(1);
      const body = sends[0].body;
      const button = body.template.components.find((c: any) => c.type === 'button');
      expect(button).toMatchObject({ sub_type: 'url' });
      const token = button.parameters[0].text;
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
      expect((await db.portalTaskLink.findUniqueOrThrow({ where: { id: linkId } })).tokenHash).toBe(hashTaskToken(token));
      expect(JSON.stringify(body)).not.toMatch(/score|diagnos|mg\b/i);
      expect(await tracks({ visitId: v.id })).toMatchObject([{ state: 'ACTIVE' }]);
    });

    it('a second pass in the gap of an opening adds nothing (interleaved)', async () => {
      const { p, anchor } = await completed();
      const at = passAt(anchor, 3, '10:00:00');
      const g = gate(db, 'checkIn.updateMany', { when: 'before' });
      const first = new SendPassService(g.client as any, new WhatsAppSender()).runPass(at);
      await g.arrived;
      await pass.runPass(at);
      g.release();
      await first;
      expect(await db.checkIn.count({ where: { track: { patientId: p.id }, state: 'OPEN' } })).toBe(1);
      expect(await db.outboundMessage.count({ where: { patientId: p.id } })).toBe(1);
    });

    it('a late open keeps a whole send window', async () => {
      const { p, anchor } = await completed();
      await pass.runPass(passAt(anchor, 4, '21:00:00'));
      const [c] = await db.checkIn.findMany({ where: { track: { patientId: p.id }, state: 'OPEN' } });
      expect(c.closesAt).toEqual(kolkataAt(addDays(anchor, 5), 20));
    });

    it('a reminder reuses the link and goes only while a check-in on it is OPEN', async () => {
      const open = await completed();
      const answered = await completed();
      for (const x of [open, answered]) await pass.runPass(passAt(x.anchor, 3, '10:00:00'));
      for (const x of [open, answered]) await queueCheckInReminders(db, passAt(x.anchor, 4, '10:00:00'));
      await db.checkIn.updateMany({ where: { track: { patientId: answered.p.id }, state: 'OPEN' }, data: { state: 'ANSWERED' } });
      meta.reset();
      for (const x of [open, answered]) {
        await pass.runPass(passAt(x.anchor, 4, '10:00:00'));
        await pass.runPass(passAt(x.anchor, 4, '10:00:00'));
      }
      const reminder = async (patientId: string) => db.outboundMessage.findFirstOrThrow({ where: { patientId, purpose: 'CHECK_IN_REMINDER' } });
      const opened = await db.outboundMessage.findFirstOrThrow({ where: { patientId: open.p.id, purpose: 'CHECK_IN_OPENED' } });
      expect(await reminder(open.p.id)).toMatchObject({ state: 'SENT', subjectId: opened.subjectId });
      expect((await reminder(answered.p.id)).state).not.toBe('SENT');
      expect(meta.calls.filter((c) => c.body?.template?.name === 'check_in_reminder')).toHaveLength(1);
    });

    it('PP-32/33: an ended window becomes MISSED with or without a message, and onMissed attention says whether one was delivered', async () => {
      const silent = await completed();
      await db.patientPortalProfile.delete({ where: { patientId: silent.p.id } });
      const told = await completed();
      const accepted = await completed();
      for (const x of [silent, told, accepted]) await pass.runPass(passAt(x.anchor, 14, '10:00:00'));
      expect(await db.outboundMessage.count({ where: { patientId: { in: [told.p.id, accepted.p.id] }, purpose: 'CHECK_IN_OPENED', state: 'SENT' } })).toBe(2);
      await db.outboundMessage.updateMany({ where: { patientId: told.p.id, purpose: 'CHECK_IN_OPENED' }, data: { state: 'DELIVERED' } });
      for (const x of [silent, told, accepted]) {
        await pass.runPass(passAt(x.anchor, 17, '10:00:00'));
        await pass.runPass(passAt(x.anchor, 17, '10:00:00'));
      }
      const [s] = await tracks({ visitId: silent.v.id });
      expect(s.checkIns.map((c) => c.state)).toEqual(['MISSED', 'MISSED']);
      expect(s.state).toBe('COMPLETED');
      const items = await db.attentionItem.findMany({ where: { kind: 'MISSED_CHECK_IN', patientId: { in: [silent.p.id, told.p.id, accepted.p.id] } } });
      expect(items.map((i) => [i.patientId, i.reason]).sort()).toEqual([
        [silent.p.id, 'missed:no-message-delivered'],
        [told.p.id, 'missed:message-delivered'],
        [accepted.p.id, 'missed:no-message-delivered'],
      ].sort());
      const audits = await db.auditLog.findMany({ where: { entity: 'AttentionItem', entityId: { in: items.map((i) => i.id) } } });
      expect(audits.map((a) => [a.entityId, a.action, a.actorKind, a.oldValues]).sort()).toEqual(items.map((i) => [i.id, 'CREATE', 'system', null]).sort());
      for (const a of audits) expect(JSON.parse(a.newValues!)).toEqual({ fields: ['branchId', 'kind', 'lastEventAt', 'patientId', 'priority', 'reason', 'state', 'subjectKey'] });
    });

    it('PP-34: queues one review reminder the day before a review appointment naming date, time and doctor', async () => {
      const p = await patient();
      const appt = await db.appointment.create({
        data: { patientId: p.id, doctorId: 'doc', branchId: 'A', date: new Date('2099-06-11T00:00:00Z'), slot: '10:30-10:45', status: 'CONFIRMED', reviewRequestedFor: new Date('2099-06-11T00:00:00Z') } as any,
      });
      await db.appointment.create({ data: { patientId: p.id, doctorId: 'doc', branchId: 'A', date: new Date('2099-06-11T00:00:00Z'), slot: '11:30-11:45', status: 'CONFIRMED' } as any });
      await Promise.all([pass.runPass(ist('2099-06-10T10:00:00')), pass.runPass(ist('2099-06-10T10:00:00'))]);
      const rows = await db.outboundMessage.findMany({ where: { patientId: p.id } });
      expect(rows).toMatchObject([{ purpose: 'REVIEW_REMINDER', subjectType: 'APPOINTMENT', subjectId: appt.id, state: 'SENT' }]);
      const sent = meta.calls.find((c) => c.body?.template?.name === 'review_reminder')!.body;
      const texts = sent.template.components[0].parameters.map((x: any) => x.text);
      expect(texts).toEqual(['Linae Skin Clinic', '2099-06-11', '10:30', 'Dr. Meera Rao']);
    });

    it('PP-34: a review booked by ReviewBookingService is reminded on the IST day before, not earlier', async () => {
      const p = await patient();
      const v = await db.visit.create({ data: { patientId: p.id, doctorId: 'doc', complaints: '[]', followUp: ist('2099-07-15T00:00:00') } });
      const booking = await new ReviewBookingService(db as any, new AppointmentsService(db as any)).book(v.id, 'A');
      expect(booking).toMatchObject({ status: 'booked', appointment: { date: '2099-07-15' } });
      const reminders = () => db.outboundMessage.findMany({ where: { patientId: p.id, purpose: 'REVIEW_REMINDER' } });
      for (const at of ['2099-07-13T10:00:00', '2099-07-13T23:59:00']) await pass.runPass(ist(at));
      expect(await reminders()).toHaveLength(0);
      await Promise.all([pass.runPass(ist('2099-07-14T00:30:00')), pass.runPass(ist('2099-07-14T00:30:00'))]);
      expect(await reminders()).toMatchObject([{ params: expect.objectContaining({ date: '2099-07-15' }) }]);
    });
  });
});
