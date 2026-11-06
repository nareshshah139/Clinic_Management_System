import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import * as path from 'path';
import { localDatabase } from '../../shared/testing/local-database';

const script = path.resolve(__dirname, '..', 'issue-reset-code.ts');
const run = (args: string[], env: NodeJS.ProcessEnv = {}) => {
  const { DATABASE_URL: _url, ...base } = process.env;
  const result = spawnSync(
    process.execPath,
    [require.resolve('ts-node/dist/bin-transpile.js'), script, ...args],
    {
      env: { ...base, ...env },
      encoding: 'utf8',
      timeout: 60_000,
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};
const hashCode = (code: string) =>
  createHash('sha256').update(code).digest('hex');

describe('issue-reset-code script without an email', () => {
  it.each([[[]], [['']]])(
    'exits 1 with usage and never connects for args %j',
    (args) => {
      expect(
        run(args, { DATABASE_URL: 'postgresql://unreachable.invalid:1/none' }),
      ).toEqual({
        status: 1,
        stdout: '',
        stderr: 'Usage: npm run reset-code -- <user email>\n',
      });
    },
    60_000,
  );
});

const databaseTests = process.env.RESET_CODE_SCRIPT_TEST_DATABASE_URL
  ? describe
  : describe.skip;
databaseTests('issue-reset-code script on PostgreSQL', () => {
  let db: PrismaClient;
  let cleanup: () => Promise<void>;
  let databaseUrl: string;
  const tokenOf = async (id: string) =>
    (await db.user.findUniqueOrThrow({ where: { id } })).resetToken;

  beforeAll(async () => {
    const local = await localDatabase(
      process.env.RESET_CODE_SCRIPT_TEST_DATABASE_URL!,
    );
    db = local.prisma;
    cleanup = local.cleanup;
    const url = new URL(process.env.RESET_CODE_SCRIPT_TEST_DATABASE_URL!);
    url.searchParams.set('schema', local.schema);
    databaseUrl = url.toString();
    await db.branch.create({
      data: { id: 'branch', name: 'Branch', address: 'Synthetic' },
    });
    const user = (id: string, extra: object = {}) =>
      db.user.create({
        data: {
          id,
          firstName: id,
          lastName: 'Staff',
          email: `${id}@example.test`,
          password: 'synthetic-hash',
          role: 'OWNER',
          branchId: 'branch',
          ...extra,
        },
      });
    await user('owner');
    await user('gone', { isActive: false, status: 'INACTIVE' });
  }, 120_000);
  afterAll(() => cleanup?.());

  it('issues a one-time code for an active user matched ignoring case and spaces, storing only its hash', async () => {
    const result = run(['  OWNER@Example.test '], {
      DATABASE_URL: databaseUrl,
    });
    expect(result.status).toBe(0);
    const code =
      /Reset code for .+: ([A-HJKMNP-Z2-9]{4})-([A-HJKMNP-Z2-9]{4})\n/.exec(
        result.stdout,
      );
    expect(code).not.toBeNull();
    expect(await tokenOf('owner')).toBe(hashCode(code![1] + code![2]));
    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId: 'owner', action: 'PASSWORD_RESET_CODE_ISSUED' },
    });
    expect(audit.userId).toBeNull();
    expect(audit.newValues).toContain('server-script');
    expect(JSON.stringify(audit)).not.toContain(code![1] + code![2]);
  }, 60_000);

  it.each(['gone@example.test', 'nobody@example.test'])(
    'exits 1 for %s without changing any user',
    async (email) => {
      const before = await db.user.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, resetToken: true, resetTokenExpiry: true },
      });
      const result = run([email], { DATABASE_URL: databaseUrl });
      expect(result).toMatchObject({
        status: 1,
        stdout: '',
        stderr: `No active user with email ${email}\n`,
      });
      expect(
        await db.user.findMany({
          orderBy: { id: 'asc' },
          select: { id: true, resetToken: true, resetTokenExpiry: true },
        }),
      ).toEqual(before);
      expect(await db.auditLog.count({ where: { entityId: 'gone' } })).toBe(0);
    },
    60_000,
  );
});
