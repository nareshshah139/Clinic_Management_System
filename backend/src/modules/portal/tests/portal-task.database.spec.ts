import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import sharp from 'sharp';
import { gate } from '../../../shared/testing/interleave';
import { FollowUpsService } from '../../follow-ups/follow-ups.service';
import { deriveTaskToken, hashTaskToken, revokeTaskLinks } from '../../follow-ups/task-link';
import { PatientPortalService } from '../../patients/portal/patient-portal.service';
import { syncPatientPhone } from '../../patients/portal/portal-profile';
import { VisitsService } from '../../visits/visits.service';
import { LinkInactive } from '../link-inactive';
import { PortalGuard } from '../portal.guard';
import { PRINCIPAL, TaskLinkPrincipal } from '../principal';
import { TaskPageService } from '../task.service';

const databaseTests = process.env.PORTAL_TASK_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Task links and the patient task page on PostgreSQL', () => {
  const schema = `portal_task_${randomUUID().replaceAll('-', '')}`;
  const env = { ...process.env };
  let admin: PrismaClient;
  let db: PrismaClient;
  let tasks: TaskPageService;
  let created = false;
  let planVersionId: string;
  let photo: string;
  let seq = 0;

  /** A patient with one OPEN symptom check-in on a fresh task link; returns the raw token. */
  const openLink = async () => {
    const n = ++seq;
    const p = await db.patient.create({ data: { name: `Synthetic Portal${n} Patient`, gender: 'F', phone: `91000${String(n).padStart(5, '0')}`, branchId: 'A' } as any });
    await db.patientPortalProfile.create({
      data: { patientId: p.id, phoneE164: `+9191000${String(n).padStart(5, '0')}`, consentState: 'OPTED_IN', phoneConfirmedAt: new Date(), preferredLanguage: 'TE' },
    });
    const v = await db.visit.create({ data: { patientId: p.id, doctorId: 'doc', complaints: '[]', diagnosis: 'Synthetic psoriasis' } as any });
    await new VisitsService(db as any).complete(v.id, { followUpPlanVersionId: planVersionId } as any, 'A');
    const [first] = await db.checkIn.findMany({ where: { track: { patientId: p.id } }, orderBy: { seq: 'asc' } });
    await db.checkIn.update({ where: { id: first.id }, data: { state: 'OPEN', opensAt: new Date() } });
    const linkId = randomUUID();
    const token = deriveTaskToken(linkId);
    await db.portalTaskLink.create({ data: { id: linkId, dedupeKey: `test:${linkId}`, patientId: p.id, tokenHash: hashTaskToken(token), checkIns: { create: [{ checkInId: first.id }] } } });
    return { patient: p, checkInId: first.id, token };
  };
  const principalFor = async (token: string, client: PrismaClient = db): Promise<TaskLinkPrincipal> => {
    const req: any = { body: { token } };
    await new PortalGuard(client as any).canActivate({ switchToHttp: () => ({ getRequest: () => req }) } as any);
    return req[PRINCIPAL];
  };
  const answer = (severity: number, withPhoto = false) => ({
    answers: { severity, change: 'same' },
    photos: withPhoto ? [{ itemKey: 'photo', dataUrl: photo }] : [],
  });

  beforeAll(async () => {
    Logger.overrideLogger(false);
    Object.assign(process.env, { PORTAL_LINK_SECRET: 'test-link-secret', CLINIC_NAME: 'Linae Skin Clinic', CLINIC_PHONE: '+91 40 5555 0100' });
    const url = new URL(process.env.PORTAL_TASK_TEST_DATABASE_URL!);
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
    tasks = new TaskPageService(db as any);
    await db.branch.create({ data: { id: 'A', name: 'Branch A', address: 'Synthetic' } });
    await db.user.create({ data: { id: 'own', email: 'own@example.test', password: 'x', firstName: 'O', lastName: 'W', role: 'OWNER', branchId: 'A' } as any });
    await db.user.create({ data: { id: 'doc', email: 'doc@example.test', password: 'x', firstName: 'Meera', lastName: 'Rao', role: 'DOCTOR', branchId: 'A' } as any });
    const results = await new FollowUpsService(db as any).importData('own');
    planVersionId = results.find((r) => r.key === 'skin-two-week')!.versionId;
    const jpeg = await sharp({ create: { width: 2600, height: 1200, channels: 3, background: '#c08060' } })
      .withMetadata({ exif: { IFD0: { Artist: 'Synthetic Patient' } } }).jpeg().toBuffer();
    photo = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  }, 120000);

  afterAll(async () => {
    process.env = env;
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('PP-40: the page carries only clinic, first name, doctor and the open questions', async () => {
    const { token } = await openLink();
    const page = await tasks.page(await principalFor(token));
    expect(page).toMatchObject({ clinic: 'Linae Skin Clinic', firstName: expect.stringMatching(/^Synthetic$/), language: 'TE' });
    expect(page.checkIns).toHaveLength(1);
    expect(page.checkIns[0].doctor).toBe('Dr. Meera Rao');
    expect(page.checkIns[0].items.map((i) => i.key)).toEqual(['severity', 'change', 'photo']);
    expect(JSON.stringify(page)).not.toMatch(/psoriasis|Patient\b|patientId|9100|score|flags|URGENT|Portal\d/);
  });

  it('PP-42: the submit saves one response pinned to its version with a re-encoded photo; a second is kept as an inbox message', async () => {
    const { patient, checkInId, token } = await openLink();
    const principal = await principalFor(token);
    await expect(tasks.submit(principal, { token, checkInId, ...answer(3, true) } as any)).resolves.toEqual({ status: 'saved', urgent: false });
    const response = await db.checkInResponse.findUniqueOrThrow({ where: { checkInId }, include: { attachments: true } });
    const checkIn = await db.checkIn.findUniqueOrThrow({ where: { id: checkInId } });
    expect(response).toMatchObject({ instrumentVersionId: checkIn.instrumentVersionId, score: 3, flag: null, answers: { severity: 3, change: 'same' } });
    expect(checkIn.state).toBe('ANSWERED');
    expect(response.attachments).toHaveLength(1);
    const meta = await sharp(Buffer.from(response.attachments[0].bytes)).metadata();
    expect([meta.format, meta.width, meta.exif]).toEqual(['jpeg', 2048, undefined]);
    expect(response.attachments[0].sizeBytes).toBeLessThanOrEqual(1.5 * 1024 * 1024);

    const again = await principalFor(token);
    expect(again.checkInIds).toEqual([]);
    await expect(tasks.page(again)).rejects.toBeInstanceOf(LinkInactive);
    await expect(tasks.submit(again, { token, checkInId, ...answer(7, true) } as any)).resolves.toEqual({ status: 'already-answered' });
    expect(await db.checkInResponse.findUniqueOrThrow({ where: { checkInId } })).toMatchObject({ score: 3, answers: { severity: 3, change: 'same' } });
    const [message] = await db.patientMessage.findMany({ where: { patientId: patient.id }, include: { attachments: true } });
    expect(message).toMatchObject({ direction: 'INBOUND', channel: 'PORTAL', authorKind: 'PATIENT' });
    expect(message.body).toContain('severity: 7');
    expect(message.attachments).toHaveLength(1);
    const [item] = await db.attentionItem.findMany({ where: { patientId: patient.id } });
    expect(item).toMatchObject({ kind: 'PATIENT_MESSAGE', state: 'OPEN' });
    const [audit] = await db.auditLog.findMany({ where: { entity: 'AttentionItem', entityId: item.id } });
    expect(audit).toMatchObject({ action: 'CREATE', oldValues: null, userId: null });
    expect(JSON.parse(audit.newValues!)).toEqual({ fields: ['branchId', 'kind', 'lastEventAt', 'patientId', 'phoneE164', 'reason', 'state', 'subjectKey'] });
  });

  it('PP-38/PP-42: a second submit is kept until the check-in closes, then gets the uniform inactive answer', async () => {
    const { patient, checkInId, token } = await openLink();
    await tasks.submit(await principalFor(token), { token, checkInId, ...answer(3) } as any);
    const { closesAt } = await db.checkIn.findUniqueOrThrow({ where: { id: checkInId } });
    const late = await principalFor(token);
    await expect(tasks.submit(late, { token, checkInId, ...answer(5) } as any, new Date(closesAt.getTime() - 1))).resolves.toEqual({ status: 'already-answered' });
    await expect(tasks.submit(late, { token, checkInId, ...answer(6) } as any, closesAt)).rejects.toBeInstanceOf(LinkInactive);
    expect(await db.patientMessage.count({ where: { patientId: patient.id } })).toBe(1);

    await revokeTaskLinks(db as any, [patient.id]);
    await expect(principalFor(token)).rejects.toBeInstanceOf(LinkInactive);
  });

  it('PP-38: a first answer after the check-in closes gets the uniform inactive answer and leaves it for the missed pass', async () => {
    const { checkInId, token } = await openLink();
    const principal = await principalFor(token);
    const { closesAt } = await db.checkIn.findUniqueOrThrow({ where: { id: checkInId } });
    await expect(tasks.submit(principal, { token, checkInId, ...answer(3) } as any, closesAt)).rejects.toBeInstanceOf(LinkInactive);
    expect(await db.checkIn.findUniqueOrThrow({ where: { id: checkInId } })).toMatchObject({ state: 'OPEN' });
    expect(await db.checkInResponse.count({ where: { checkInId } })).toBe(0);
    await db.checkIn.update({ where: { id: checkInId }, data: { closesAt: new Date(Date.now() - 1000) } });
    expect((await principalFor(token)).checkInIds).toEqual([]);
  });

  it('PP-38: a link revoked after the guard let a submit in does not write', async () => {
    const { patient, checkInId, token } = await openLink();
    const principal = await principalFor(token);
    await revokeTaskLinks(db as any, [patient.id]);
    await expect(tasks.submit(principal, { token, checkInId, ...answer(3) } as any)).rejects.toBeInstanceOf(LinkInactive);
    expect(await db.checkIn.findUniqueOrThrow({ where: { id: checkInId } })).toMatchObject({ state: 'OPEN' });
    expect(await db.checkInResponse.count({ where: { checkInId } })).toBe(0);
  });

  it('PP-38: a submit waits for a merge that holds the patient, then refuses the moved link without deadlocking', async () => {
    const { patient, checkInId, token } = await openLink();
    const other = await openLink();
    const principal = await principalFor(token);
    let submitted: Promise<unknown> | undefined;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM patients WHERE id = ${patient.id} FOR UPDATE`;
      submitted = tasks.submit(principal, { token, checkInId, ...answer(3) } as any).catch((e) => e);
      await new Promise((r) => setTimeout(r, 300));
      await tx.portalTaskLink.updateMany({ where: { patientId: patient.id }, data: { patientId: other.patient.id } });
    }, { timeout: 10_000 });
    expect(await submitted).toBeInstanceOf(LinkInactive);
    expect(await db.checkInResponse.count({ where: { checkInId } })).toBe(0);
  });

  it('PP-42: two concurrent submits leave one response and one kept message', async () => {
    const { patient, checkInId, token } = await openLink();
    const principal = await principalFor(token);
    const results = await Promise.all([
      tasks.submit(principal, { token, checkInId, ...answer(2) } as any),
      tasks.submit(principal, { token, checkInId, ...answer(4) } as any),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['already-answered', 'saved']);
    expect(await db.checkInResponse.count({ where: { checkInId } })).toBe(1);
    expect(await db.patientMessage.count({ where: { patientId: patient.id } })).toBe(1);
  });

  it('PP-42: a submit that lands in the gap of another becomes the kept message (interleaved)', async () => {
    const { patient, checkInId, token } = await openLink();
    const principal = await principalFor(token);
    const g = gate(db, 'checkIn.updateMany', { when: 'before' });
    const first = new TaskPageService(g.client as any).submit(principal, { token, checkInId, ...answer(1) } as any);
    await g.arrived;
    await expect(tasks.submit(principal, { token, checkInId, ...answer(6) } as any)).resolves.toEqual({ status: 'saved', urgent: false });
    g.release();
    await expect(first).resolves.toEqual({ status: 'already-answered' });
    expect(await db.checkInResponse.findUniqueOrThrow({ where: { checkInId } })).toMatchObject({ score: 6 });
    expect((await db.patientMessage.findFirstOrThrow({ where: { patientId: patient.id } })).body).toContain('severity: 1');
  });

  it('PP-44: an urgent answer and its RESPONSE_FLAG item commit together, or neither does', async () => {
    const { patient, checkInId, token } = await openLink();
    await expect(tasks.submit(await principalFor(token), { token, checkInId, ...answer(9) } as any)).resolves.toEqual({ status: 'saved', urgent: true, clinicPhone: '+91 40 5555 0100' });
    const branchLine = await openLink();
    await db.branch.update({ where: { id: 'A' }, data: { phone: '+91 40 5555 0200' } });
    try {
      await expect(tasks.submit(await principalFor(branchLine.token), { token: branchLine.token, checkInId: branchLine.checkInId, ...answer(9) } as any)).resolves.toEqual({ status: 'saved', urgent: true, clinicPhone: '+91 40 5555 0200' });
    } finally {
      await db.branch.update({ where: { id: 'A' }, data: { phone: null } });
    }
    expect(await db.attentionItem.findMany({ where: { patientId: patient.id } })).toMatchObject([{ kind: 'RESPONSE_FLAG', priority: 'URGENT', state: 'OPEN', subjectKey: `check-in:${checkInId}` }]);

    const blocked = await openLink();
    await db.attentionItem.create({ data: { kind: 'RESPONSE_FLAG', subjectKey: `check-in:${blocked.checkInId}`, patientId: blocked.patient.id, branchId: 'A', priority: 'NORMAL', reason: 'test', lastEventAt: new Date() } });
    await expect(tasks.submit(await principalFor(blocked.token), { token: blocked.token, checkInId: blocked.checkInId, ...answer(9) } as any)).rejects.toThrow();
    expect(await db.checkInResponse.count({ where: { checkInId: blocked.checkInId } })).toBe(0);
    expect((await db.checkIn.findUniqueOrThrow({ where: { id: blocked.checkInId } })).state).toBe('OPEN');
  });

  it('LinkAnswersOnly: a link cannot answer a check-in it does not carry', async () => {
    const mine = await openLink();
    const theirs = await openLink();
    await expect(tasks.submit(await principalFor(mine.token), { token: mine.token, checkInId: theirs.checkInId, ...answer(2) } as any)).rejects.toBeInstanceOf(LinkInactive);
    expect(await db.checkInResponse.count({ where: { checkInId: theirs.checkInId } })).toBe(0);
  });

  it('PP-38: portal off, opt-out and a phone change revoke the link at once, and the guard refuses an opted-out or disabled profile however it got there', async () => {
    const portal = new PatientPortalService(db as any);
    const off = await openLink();
    await portal.setPortalEnabled(off.patient.id, 'A', false);
    await expect(principalFor(off.token)).rejects.toBeInstanceOf(LinkInactive);
    const refused = await openLink();
    await portal.recordConsent(refused.patient.id, 'A', 'refused', 'own');
    await expect(principalFor(refused.token)).rejects.toBeInstanceOf(LinkInactive);
    const phone = await openLink();
    await db.$transaction((tx) => syncPatientPhone(tx, phone.patient.id, '9876543210'));
    await expect(principalFor(phone.token)).rejects.toBeInstanceOf(LinkInactive);
    const optedOut = await openLink();
    await db.patientPortalProfile.update({ where: { patientId: optedOut.patient.id }, data: { consentState: 'OPTED_OUT' } });
    await expect(principalFor(optedOut.token)).rejects.toBeInstanceOf(LinkInactive);
    const disabled = await openLink();
    await db.patientPortalProfile.update({ where: { patientId: disabled.patient.id }, data: { portalEnabled: false } });
    await expect(principalFor(disabled.token)).rejects.toBeInstanceOf(LinkInactive);
    const still = await openLink();
    await expect(principalFor(still.token)).resolves.toMatchObject({ patientId: still.patient.id, checkInIds: [still.checkInId] });
  });
});
