import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { NAMES_ONLY_AUDIT_MODELS } from '../../../shared/database/prisma.service';
import { PatientPortalService } from '../../patients/portal/patient-portal.service';
import { syncPatientPhone } from '../../patients/portal/portal-profile';
import { PortalIdentityPrincipal } from '../principal';
import { hashSessionToken, profileRef } from '../session';
import { SignInService } from '../sign-in.service';

const databaseTests = process.env.PORTAL_SIGN_IN_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Portal sign-in, sessions and the profile picker on PostgreSQL (PP-55 to PP-61, PP-66)', () => {
  const schema = `portal_sign_in_${randomUUID().replaceAll('-', '')}`;
  const env = { ...process.env };
  let admin: PrismaClient;
  let db: PrismaClient;
  let created = false;
  let seq = 0;
  /** The code each send carried, read from the outbox row at send time, by number. */
  const delivered = new Map<string, string>();
  const sendNow = jest.fn(async (id: string) => {
    const row = await db.outboundMessage.findUniqueOrThrow({ where: { id } });
    delivered.set(row.toE164, String((row.params as any).code));
    return 'sent';
  });
  let service: SignInService;

  const number = () => `98${String(++seq).padStart(8, '0')}`;
  const patient = async (phone: string, opts: { name?: string; branchId?: string; confirmed?: boolean; portalEnabled?: boolean; archived?: boolean } = {}) => {
    const p = await db.patient.create({ data: { name: opts.name ?? `Synthetic${seq} Person`, gender: 'F', phone, branchId: opts.branchId ?? 'A', isArchived: !!opts.archived } as any });
    await db.patientPortalProfile.create({
      data: { patientId: p.id, phoneE164: `+91${phone}`, consentState: opts.confirmed === false ? 'NOT_ASKED' : 'OPTED_IN', phoneConfirmedAt: opts.confirmed === false ? null : new Date(), portalEnabled: opts.portalEnabled ?? true },
    });
    return p;
  };
  const signIn = async (phone: string, at = new Date()) => {
    expect(await service.requestCode(phone, at)).toBe('sent');
    const result = await service.verifyCode(phone, delivered.get(`+91${phone}`)!, at);
    if (!result.ok) throw new Error(`sign-in failed: ${result.reason}`);
    return result;
  };
  const wrongCode = (phone: string) => (delivered.get(`+91${phone}`) === '000000' ? '111111' : '000000');

  beforeAll(async () => {
    Logger.overrideLogger(false);
    Object.assign(process.env, { PORTAL_CODE_SECRET: 'sign-in-test-secret', PORTAL_CODES_PER_HOUR: '1000' });
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
    await db.branch.create({ data: { id: 'A', name: 'Banjara Hills', address: 'Synthetic' } });
    await db.branch.create({ data: { id: 'B', name: 'Kukatpally', address: 'Synthetic' } });
    service = new SignInService(db as any, { sendNow } as any);
  }, 120000);

  afterAll(async () => {
    process.env = env;
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  beforeEach(() => {
    sendNow.mockClear();
    delivered.clear();
  });

  it('PP-55: sends a six-digit code only to a confirmed number with a portal-enabled, unarchived patient', async () => {
    const unconfirmed = number();
    await patient(unconfirmed, { confirmed: false });
    const off = number();
    await patient(off, { portalEnabled: false });
    const archived = number();
    await patient(archived, { archived: true });
    for (const phone of [unconfirmed, off, archived, number()]) expect(await service.requestCode(phone)).toBe('not-eligible');
    expect(await service.requestCode('not a number')).toBe('invalid-number');
    expect(sendNow).not.toHaveBeenCalled();

    const ok = number();
    await patient(ok);
    expect(await service.requestCode(ok)).toBe('sent');
    const code = delivered.get(`+91${ok}`)!;
    expect(code).toMatch(/^\d{6}$/);
    const challenge = await db.portalOtpChallenge.findFirstOrThrow({ where: { phoneE164: `+91${ok}`, purpose: 'SIGN_IN' } });
    expect(challenge.codeHash).not.toContain(code);
    const row = await db.outboundMessage.findFirstOrThrow({ where: { toE164: `+91${ok}`, purpose: 'PORTAL_SIGN_IN_CODE' } });
    expect(row).toMatchObject({ patientId: null, templateKey: 'portal_sign_in_code', subjectType: 'PORTAL_OTP', subjectId: challenge.id });
    // The code does not stay in the outbox once the send is decided.
    expect(JSON.stringify(row.params)).not.toContain(code);
  });

  it('PP-56: a code expires after five minutes', async () => {
    const phone = number();
    await patient(phone);
    const t0 = new Date();
    await service.requestCode(phone, t0);
    const code = delivered.get(`+91${phone}`)!;
    expect(await service.verifyCode(phone, code, new Date(t0.getTime() + 5 * 60_000))).toEqual({ ok: false, reason: 'expired' });
  });

  it('PP-56: a code locks after five wrong attempts, and the right code no longer works', async () => {
    const phone = number();
    await patient(phone);
    await service.requestCode(phone);
    const code = delivered.get(`+91${phone}`)!;
    for (let i = 0; i < 5; i++) expect(await service.verifyCode(phone, wrongCode(phone))).toEqual({ ok: false, reason: 'wrong' });
    expect(await service.verifyCode(phone, code)).toEqual({ ok: false, reason: 'locked' });
    expect(await db.portalSession.count({ where: { identity: { phoneE164: `+91${phone}` } } })).toBe(0);
  });

  it('PP-56: two concurrent correct submissions of one code yield exactly one session', async () => {
    const phone = number();
    await patient(phone);
    await service.requestCode(phone);
    const code = delivered.get(`+91${phone}`)!;
    const results = await Promise.all([1, 2, 3, 4].map(() => service.verifyCode(phone, code)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.portalSession.count({ where: { identity: { phoneE164: `+91${phone}` } } })).toBe(1);
  });

  it('PP-57: at most three codes in fifteen minutes and ten in a day per number', async () => {
    const phone = number();
    await patient(phone);
    const t0 = new Date();
    for (let i = 0; i < 3; i++) expect(await service.requestCode(phone, new Date(t0.getTime() + i * 1000))).toBe('sent');
    expect(await service.requestCode(phone, new Date(t0.getTime() + 5000))).toBe('phone-window');
    // Codes are counted by their stored creation time, so later windows are simulated by later clocks.
    for (let i = 1; i <= 2; i++) for (let j = 0; j < 3; j++) expect(await service.requestCode(phone, new Date(t0.getTime() + i * 16 * 60_000 + j * 1000))).toBe('sent');
    expect(await service.requestCode(phone, new Date(t0.getTime() + 50 * 60_000))).toBe('sent');
    expect(await service.requestCode(phone, new Date(t0.getTime() + 70 * 60_000))).toBe('phone-day');
    expect(await db.portalOtpChallenge.count({ where: { phoneE164: `+91${phone}`, purpose: 'SIGN_IN' } })).toBe(10);
  });

  it('PP-57: ten wrong attempts across a number’s codes lock it for 24 hours', async () => {
    const phone = number();
    await patient(phone);
    const t0 = new Date();
    for (const offset of [0, 16]) {
      await service.requestCode(phone, new Date(t0.getTime() + offset * 60_000));
      for (let i = 0; i < 5; i++) await service.verifyCode(phone, wrongCode(phone), new Date(t0.getTime() + offset * 60_000 + 1000));
    }
    expect(await service.requestCode(phone, new Date(t0.getTime() + 40 * 60_000))).toBe('phone-locked');
    expect(await service.requestCode(phone, new Date(t0.getTime() + 24 * 3600_000 + 60_000))).toBe('sent');
  });

  it('PP-57: the clinic-wide hourly ceiling pauses issuing and opens one attention item', async () => {
    process.env.PORTAL_CODES_PER_HOUR = String((await db.portalOtpChallenge.count({ where: { purpose: 'SIGN_IN', createdAt: { gte: new Date(Date.now() - 3600_000) } } })) + 1);
    try {
      const a = number();
      await patient(a);
      const b = number();
      await patient(b);
      expect(await service.requestCode(a)).toBe('sent');
      expect(await service.requestCode(b)).toBe('clinic-ceiling');
      expect(await service.requestCode(b)).toBe('clinic-ceiling');
      const items = await db.attentionItem.findMany({ where: { reason: 'sign-in-code-ceiling', state: 'OPEN' } });
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ kind: 'DELIVERY_FAILURE', patientId: null, phoneE164: null });
    } finally {
      process.env.PORTAL_CODES_PER_HOUR = '1000';
    }
  });

  it('PP-58: every sign-in issues a new opaque session and stores only its hash', async () => {
    const phone = number();
    await patient(phone);
    const first = await signIn(phone);
    const second = await signIn(phone);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.token).not.toBe(second.token);
    const rows = await db.portalSession.findMany({ where: { identity: { phoneE164: `+91${phone}` } } });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.tokenHash).sort()).toEqual([hashSessionToken(first.token), hashSessionToken(second.token)].sort());
    expect(JSON.stringify(rows)).not.toContain(first.token);
    expect([...NAMES_ONLY_AUDIT_MODELS]).toEqual(expect.arrayContaining(['PortalIdentity', 'PortalSession', 'PortalAccessEvent']));
  });

  it('PP-60: a session ends after 30 idle minutes and after 24 hours, and activity keeps it alive until then', async () => {
    const phone = number();
    await patient(phone);
    const t0 = new Date();
    const { token } = await signIn(phone, t0);
    const at = (min: number) => new Date(t0.getTime() + min * 60_000);
    expect(await service.resolve(token, at(29))).not.toBeNull();
    expect(await service.resolve(token, at(58))).not.toBeNull();
    expect(await service.resolve(token, at(89))).toBeNull();

    // Every request counts, even one seconds after the last.
    const busy = await signIn(phone, t0);
    expect(await service.resolve(busy.token, new Date(t0.getTime() + 30_000))).not.toBeNull();
    expect(await service.resolve(busy.token, new Date(t0.getTime() + 30_000 + 29.5 * 60_000))).not.toBeNull();

    const fresh = await signIn(phone, t0);
    for (let min = 25; min < 24 * 60; min += 25) expect(await service.resolve(fresh.token, at(min))).not.toBeNull();
    expect(await service.resolve(fresh.token, at(24 * 60))).toBeNull();
  });

  it('PP-60, PP-66: sign out ends one session; sign out everywhere ends every session of the number', async () => {
    const phone = number();
    await patient(phone);
    const [a, b, c] = [await signIn(phone), await signIn(phone), await signIn(phone)];
    await service.signOut(a.principal, false);
    expect(await service.resolve(a.token)).toBeNull();
    expect(await service.resolve(b.token)).not.toBeNull();
    await service.signOut(b.principal, true);
    expect(await service.resolve(b.token)).toBeNull();
    expect(await service.resolve(c.token)).toBeNull();
    const kinds = (await db.portalAccessEvent.findMany({ where: { identityId: a.principal.identityId }, orderBy: { createdAt: 'asc' } })).map((e) => e.kind);
    expect(kinds.filter((k) => k === 'SIGN_IN')).toHaveLength(3);
    expect(kinds).toEqual(expect.arrayContaining(['SIGN_OUT', 'SIGN_OUT_EVERYWHERE']));
  });

  it('PP-61, PP-66: a shared phone lists every eligible patient across branches by first name and branch, rebuilt on every request', async () => {
    const phone = number();
    const asha = await patient(phone, { name: 'Asha Rao', branchId: 'A' });
    const ravi = await patient(phone, { name: 'Ravi Kumar Rao', branchId: 'B' });
    await patient(phone, { name: 'Archived Rao', archived: true });
    const lata = await patient(phone, { name: 'Lata Rao', portalEnabled: false });
    const { principal, token } = await signIn(phone);
    const list = await service.profileList(principal);
    expect(list.chosen).toBeNull();
    expect(list.profiles.map((p) => [p.firstName, p.branch])).toEqual([['Asha', 'Banjara Hills'], ['Ravi', 'Kukatpally']]);
    expect(JSON.stringify(list)).not.toMatch(new RegExp(`${asha.id}|${ravi.id}|${phone}`));

    // A ref names a profile only within its own session.
    const other = await signIn(phone);
    expect(await service.chooseProfile(principal, profileRef(other.principal.sessionId, ravi.id))).toBe(false);
    expect(await service.chooseProfile(principal, profileRef(principal.sessionId, lata.id))).toBe(false);
    expect(await service.chooseProfile(principal, profileRef(principal.sessionId, ravi.id))).toBe(true);
    expect((await service.resolve(token))!.chosen).toMatchObject({ patientId: ravi.id, branchId: 'B' });
    // Switching needs no new code.
    expect(await service.chooseProfile(principal, profileRef(principal.sessionId, asha.id))).toBe(true);
    expect((await service.resolve(token))!.chosen!.patientId).toBe(asha.id);

    // The list is read again: turning Lata's portal on shows her at once; turning Asha's off drops the choice.
    await db.patientPortalProfile.update({ where: { patientId: lata.id }, data: { portalEnabled: true } });
    expect((await service.profileList(principal)).profiles.map((p) => p.firstName)).toEqual(['Asha', 'Lata', 'Ravi']);
    await db.patientPortalProfile.update({ where: { patientId: asha.id }, data: { portalEnabled: false } });
    expect((await service.resolve(token))!.chosen).toBeNull();

    const events = await db.portalAccessEvent.findMany({ where: { sessionId: principal.sessionId, kind: 'PROFILE_CHOICE' } });
    expect(events.map((e) => e.patientId)).toEqual([ravi.id, asha.id]);
  });

  it('chooses the only profile on a single-patient number at sign-in', async () => {
    const phone = number();
    const p = await patient(phone);
    const { token, principal } = await signIn(phone);
    expect((await service.resolve(token))!.chosen!.patientId).toBe(p.id);
    expect((await service.profileList(principal)).chosen).toBe(profileRef(principal.sessionId, p.id));
  });

  it('PP-07, PP-09: a phone change or the portal turned off revokes the sessions that chose that patient, at once', async () => {
    const phone = number();
    const a = await patient(phone, { name: 'Anil Rao' });
    const b = await patient(phone, { name: 'Bina Rao' });
    const first = await signIn(phone);
    const second = await signIn(phone);
    await service.chooseProfile(first.principal, profileRef(first.principal.sessionId, a.id));
    await service.chooseProfile(second.principal, profileRef(second.principal.sessionId, b.id));

    await db.$transaction((tx) => syncPatientPhone(tx, a.id, number()));
    expect(await service.resolve(first.token)).toBeNull();
    expect(await service.resolve(second.token)).not.toBeNull();

    await new PatientPortalService(db as any).setPortalEnabled(b.id, 'A', false);
    expect(await service.resolve(second.token)).toBeNull();
    const reasons = (await db.portalSession.findMany({ where: { id: { in: [first.principal.sessionId, second.principal.sessionId] } } })).map((s) => s.revokeReason).sort();
    expect(reasons).toEqual(['phone-changed', 'portal-disabled']);
  });
});

export type { PortalIdentityPrincipal };
