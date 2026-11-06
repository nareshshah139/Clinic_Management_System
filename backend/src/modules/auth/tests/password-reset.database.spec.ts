import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import * as bcrypt from 'bcrypt';
import { FORGOT_PASSWORD_REPLY, PasswordResetService, RESET_TOKEN_TTL_MS } from '../password-reset.service';

const databaseTests = process.env.PASSWORD_RESET_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Password reset on PostgreSQL', () => {
  const schema = `password_reset_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let service: PasswordResetService;
  let created = false;
  const sent: { to: string; text: string }[] = [];
  const ORIGIN = 'http://localhost:3000';
  const tokenFrom = (text: string) => /reset-password\?token=([0-9a-f]+)/.exec(text)![1];
  const passwordOf = async (email: string) => (await db.user.findUniqueOrThrow({ where: { email } })).password;

  beforeAll(async () => {
    delete process.env.APP_BASE_URL;
    const url = new URL(process.env.PASSWORD_RESET_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')],
      { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url.toString() } });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    await db.branch.create({ data: { id: 'branch', name: 'Branch', address: 'Synthetic' } });
    const password = await bcrypt.hash('old-password', 4);
    await db.user.create({ data: { firstName: 'Asha', lastName: 'Rao', email: 'asha@example.test', password, role: 'RECEPTION', branchId: 'branch' } });
    await db.user.create({ data: { firstName: 'Gone', lastName: 'User', email: 'gone@example.test', password, role: 'RECEPTION', branchId: 'branch', isActive: false, status: 'INACTIVE' } });
    for (const role of ['OWNER', 'ADMIN', 'DOCTOR'] as const) {
      await db.user.create({ data: { id: role.toLowerCase(), firstName: role, lastName: 'Staff', email: `${role.toLowerCase()}@example.test`, password, role, branchId: 'branch' } });
    }
    await db.branch.create({ data: { id: 'other', name: 'Other', address: 'Synthetic' } });
    await db.user.create({ data: { id: 'elsewhere', firstName: 'Else', lastName: 'Where', email: 'elsewhere@example.test', password, role: 'RECEPTION', branchId: 'other' } });
    service = new PasswordResetService(db as any, { sendEmail: async (mail: any) => { sent.push(mail); } } as any);
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });
  beforeEach(() => { sent.length = 0; });

  it('emails a single-use link that sets a new password', async () => {
    expect(await service.requestReset('ASHA@example.test', ORIGIN)).toEqual(FORGOT_PASSWORD_REPLY);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('asha@example.test');
    expect(sent[0].text).toContain(`${ORIGIN}/reset-password?token=`);
    const token = tokenFrom(sent[0].text);
    const stored = await db.user.findUniqueOrThrow({ where: { email: 'asha@example.test' } });
    expect(stored.resetToken).not.toBe(token);
    expect(stored.resetTokenExpiry!.getTime() - Date.now()).toBeLessThanOrEqual(RESET_TOKEN_TTL_MS);

    await service.resetPassword(token, 'brand-new-pass', 'brand-new-pass');
    expect(await bcrypt.compare('brand-new-pass', await passwordOf('asha@example.test'))).toBe(true);
    await expect(service.resetPassword(token, 'another-pass', 'another-pass')).rejects.toThrow('invalid or has expired');
  });

  it('only the newest link works', async () => {
    await service.requestReset('asha@example.test', ORIGIN);
    await service.requestReset('asha@example.test', ORIGIN);
    const [first, second] = sent.map(m => tokenFrom(m.text));
    await expect(service.resetPassword(first, 'first-link-pass', 'first-link-pass')).rejects.toThrow('invalid or has expired');
    await service.resetPassword(second, 'second-link-pass', 'second-link-pass');
  });

  it('rejects an expired link', async () => {
    await service.requestReset('asha@example.test', ORIGIN);
    await db.user.update({ where: { email: 'asha@example.test' }, data: { resetTokenExpiry: new Date(Date.now() - 1000) } });
    await expect(service.resetPassword(tokenFrom(sent[0].text), 'too-late-pass', 'too-late-pass')).rejects.toThrow('invalid or has expired');
  });

  it('answers the same way for unknown and inactive accounts and sends nothing', async () => {
    expect(await service.requestReset('nobody@example.test', ORIGIN)).toEqual(FORGOT_PASSWORD_REPLY);
    expect(await service.requestReset('gone@example.test', ORIGIN)).toEqual(FORGOT_PASSWORD_REPLY);
    expect(sent).toHaveLength(0);
  });

  it('never builds a link to an origin outside the allowlist', async () => {
    expect(await service.requestReset('asha@example.test', 'https://attacker.example')).toEqual(FORGOT_PASSWORD_REPLY);
    expect(sent).toHaveLength(0);
    process.env.APP_BASE_URL = 'https://clinic.example/';
    try {
      await service.requestReset('asha@example.test', 'https://attacker.example');
      expect(sent[0].text).toContain('https://clinic.example/reset-password?token=');
    } finally {
      delete process.env.APP_BASE_URL;
    }
  });

  it('rejects a mismatched confirmation without using the link', async () => {
    await service.requestReset('asha@example.test', ORIGIN);
    const token = tokenFrom(sent[0].text);
    await expect(service.resetPassword(token, 'mismatch-one', 'mismatch-two')).rejects.toThrow('do not match');
    await service.resetPassword(token, 'matching-pass', 'matching-pass');
  });

  const as = (role: string) => ({ id: role.toLowerCase(), branchId: 'branch', role });
  const idOf = async (email: string) => (await db.user.findUniqueOrThrow({ where: { email } })).id;

  it('lets an admin issue a one-time code that is typed by hand to set a new password', async () => {
    const reception = await idOf('asha@example.test');
    const { code, expiresAt } = await service.issueResetCode(as('ADMIN'), reception);
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 3600_000);
    const stored = await db.user.findUniqueOrThrow({ where: { id: reception } });
    expect(stored.resetToken).not.toContain(code.replace('-', ''));
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'PASSWORD_RESET_CODE_ISSUED', entityId: reception } });
    expect(audit.userId).toBe('admin');
    expect(JSON.stringify(audit)).not.toContain(code.replace('-', ''));

    await service.resetPassword(` ${code.toLowerCase().replace('-', ' ')} `, 'from-code-pass', 'from-code-pass');
    expect(await bcrypt.compare('from-code-pass', await passwordOf('asha@example.test'))).toBe(true);
    await expect(service.resetPassword(code, 'again-pass-1', 'again-pass-1')).rejects.toThrow('invalid or has expired');
  });

  it('replaces any pending email link', async () => {
    await service.requestReset('asha@example.test', ORIGIN);
    const link = tokenFrom(sent[0].text);
    const { code } = await service.issueResetCode(as('ADMIN'), await idOf('asha@example.test'));
    await expect(service.resetPassword(link, 'link-pass-1', 'link-pass-1')).rejects.toThrow('invalid or has expired');
    await service.resetPassword(code, 'code-pass-1', 'code-pass-1');
  });

  it('never lets someone reset a user at or above their role', async () => {
    await expect(service.issueResetCode(as('DOCTOR'), 'admin')).rejects.toThrow('at or above your role');
    await expect(service.issueResetCode(as('DOCTOR'), 'doctor')).rejects.toThrow('at or above your role');
    await expect(service.issueResetCode(as('ADMIN'), 'owner')).rejects.toThrow('at or above your role');
    await expect(service.issueResetCode(as('RECEPTION'), await idOf('asha@example.test'))).rejects.toThrow('at or above your role');
    await expect(service.issueResetCode(as('OWNER'), 'admin')).resolves.toHaveProperty('code');
    await expect(service.issueResetCode(as('DOCTOR'), await idOf('asha@example.test'))).resolves.toHaveProperty('code');
  });

  it('only reaches staff in the issuer\'s branch', async () => {
    await expect(service.issueResetCode(as('OWNER'), 'elsewhere')).rejects.toThrow('User not found');
  });
});
