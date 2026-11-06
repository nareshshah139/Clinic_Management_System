import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import * as bcrypt from 'bcrypt';
import { PasswordResetService, RESET_CODE_TTL_MS } from '../password-reset.service';

const databaseTests = process.env.PASSWORD_RESET_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Admin-issued password reset codes on PostgreSQL', () => {
  const schema = `password_reset_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let service: PasswordResetService;
  let created = false;
  const as = (role: string) => ({ id: role.toLowerCase(), branchId: 'branch', role });
  const passwordOf = async (id: string) => (await db.user.findUniqueOrThrow({ where: { id } })).password;

  beforeAll(async () => {
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
    await db.branch.createMany({ data: [{ id: 'branch', name: 'Branch', address: 'Synthetic' }, { id: 'other', name: 'Other', address: 'Synthetic' }] });
    const password = await bcrypt.hash('old-password', 4);
    const user = (id: string, role: string, extra: object = {}) =>
      db.user.create({ data: { id, firstName: id, lastName: 'Staff', email: `${id}@example.test`, password, role: role as any, branchId: 'branch', ...extra } });
    for (const role of ['OWNER', 'ADMIN', 'DOCTOR', 'RECEPTION']) await user(role.toLowerCase(), role);
    await user('gone', 'RECEPTION', { isActive: false, status: 'INACTIVE' });
    await user('elsewhere', 'RECEPTION', { branchId: 'other' });
    service = new PasswordResetService(db as any);
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('issues a one-time code that is typed by hand to set a new password', async () => {
    const { code, expiresAt } = await service.issueResetCode(as('ADMIN'), 'reception');
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(RESET_CODE_TTL_MS - 60_000);
    expect((await db.user.findUniqueOrThrow({ where: { id: 'reception' } })).resetToken).not.toContain(code.replace('-', ''));
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'PASSWORD_RESET_CODE_ISSUED', entityId: 'reception' } });
    expect(audit.userId).toBe('admin');
    expect(JSON.stringify(audit)).not.toContain(code.replace('-', ''));

    await service.resetPassword(` ${code.toLowerCase().replace('-', ' ')} `, 'from-code-pass', 'from-code-pass');
    expect(await bcrypt.compare('from-code-pass', await passwordOf('reception'))).toBe(true);
    await expect(service.resetPassword(code, 'again-pass-1', 'again-pass-1')).rejects.toThrow('invalid or has expired');
  });

  it('only the newest code works', async () => {
    const first = await service.issueResetCode(as('ADMIN'), 'reception');
    const second = await service.issueResetCode(as('ADMIN'), 'reception');
    await expect(service.resetPassword(first.code, 'first-code-pass', 'first-code-pass')).rejects.toThrow('invalid or has expired');
    await service.resetPassword(second.code, 'second-code-pass', 'second-code-pass');
  });

  it('rejects an expired code', async () => {
    const { code } = await service.issueResetCode(as('ADMIN'), 'reception');
    await db.user.update({ where: { id: 'reception' }, data: { resetTokenExpiry: new Date(Date.now() - 1000) } });
    await expect(service.resetPassword(code, 'too-late-pass', 'too-late-pass')).rejects.toThrow('invalid or has expired');
  });

  it('rejects a mismatched confirmation without using the code', async () => {
    const { code } = await service.issueResetCode(as('ADMIN'), 'reception');
    await expect(service.resetPassword(code, 'mismatch-one', 'mismatch-two')).rejects.toThrow('do not match');
    await service.resetPassword(code, 'matching-pass', 'matching-pass');
  });

  it('never lets someone reset a user at or above their role', async () => {
    await expect(service.issueResetCode(as('DOCTOR'), 'admin')).rejects.toThrow('at or above your role');
    await expect(service.issueResetCode(as('DOCTOR'), 'doctor')).rejects.toThrow('at or above your role');
    await expect(service.issueResetCode(as('ADMIN'), 'owner')).rejects.toThrow('at or above your role');
    await expect(service.issueResetCode(as('RECEPTION'), 'reception')).rejects.toThrow('at or above your role');
    await expect(service.issueResetCode(as('OWNER'), 'admin')).resolves.toHaveProperty('code');
    await expect(service.issueResetCode(as('OWNER'), 'owner')).resolves.toHaveProperty('code');
    await expect(service.issueResetCode(as('DOCTOR'), 'reception')).resolves.toHaveProperty('code');
  });

  it('only reaches active staff in the issuer\'s branch', async () => {
    await expect(service.issueResetCode(as('OWNER'), 'elsewhere')).rejects.toThrow('User not found');
    await expect(service.issueResetCode(as('OWNER'), 'gone')).rejects.toThrow('User not found');
  });

  it('lets the server operator issue a code for a locked-out owner', async () => {
    const { code } = await service.issueResetCodeAsOperator('OWNER@example.test');
    const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: 'owner', userId: null }, orderBy: { timestamp: 'desc' } });
    expect(audit.newValues).toContain('server-script');
    await service.resetPassword(code, 'owner-new-pass', 'owner-new-pass');
    expect(await bcrypt.compare('owner-new-pass', await passwordOf('owner'))).toBe(true);
    await expect(service.issueResetCodeAsOperator('nobody@example.test')).rejects.toThrow('No active user');
  });
});
