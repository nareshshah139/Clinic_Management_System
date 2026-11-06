import { PrismaClient, UserRole } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

const rawUrl = process.env.RERUN_PROOF_DATABASE_URL;
if (!rawUrl)
  throw new Error('Set RERUN_PROOF_DATABASE_URL to a loopback PostgreSQL URL');
const base = new URL(rawUrl);
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
  throw new Error('Rerun proof requires local PostgreSQL');
}

const schema = `rerun_proof_${randomUUID().replaceAll('-', '')}`;
const scriptUrl = new URL(base);
scriptUrl.searchParams.set('schema', schema);
const adminUrl = new URL(base);
adminUrl.searchParams.set('schema', 'public');

const backendDir = path.resolve(__dirname, '..');
const tsNode = require.resolve('ts-node/dist/bin.js');

function runScript(file: string): void {
  execFileSync(
    process.execPath,
    [tsNode, '--transpile-only', path.join(__dirname, file)],
    {
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: scriptUrl.toString() },
      stdio: 'pipe',
    },
  );
}

async function snapshot(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = ${schema} AND table_type = 'BASE TABLE' ORDER BY table_name`;
  const counts: Record<string, number> = {};
  for (const { table_name } of tables) {
    const [row] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM "${schema}"."${table_name}"`,
    );
    counts[table_name] = Number(row.n);
  }
  const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } });
  const users = await prisma.user.findMany({ orderBy: { email: 'asc' } });
  const permissions = await prisma.permission.findMany({
    orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
  });
  return {
    counts,
    roles: Object.fromEntries(
      roles.map((r) => [
        r.name,
        { permissions: r.permissions, isActive: r.isActive },
      ]),
    ),
    users: Object.fromEntries(users.map((u) => [u.email, u.permissions])),
    permissionNames: permissions.map((p) => p.name),
  };
}

type Snapshot = Awaited<ReturnType<typeof snapshot>>;

function changedTables(a: Snapshot, b: Snapshot): string[] {
  return Object.keys(b.counts).filter((t) => a.counts[t] !== b.counts[t]);
}

async function seedFixture(prisma: PrismaClient) {
  const branch = await prisma.branch.create({
    data: { name: 'Proof', address: 'Proof' },
  });
  const user = (email: string, role: UserRole, permissions: string | null) =>
    prisma.user.create({
      data: {
        firstName: email,
        lastName: 'T',
        email,
        password: 'x',
        role,
        branchId: branch.id,
        permissions,
      },
    });
  await user('owner', UserRole.OWNER, null);
  await user('admin', UserRole.ADMIN, null);
  await user('doctor', UserRole.DOCTOR, null);
  await user(
    'pharmacist-custom',
    'PHARMACIST',
    JSON.stringify(['custom:only']),
  );
  await user('reception-null', UserRole.RECEPTION, null);
  await user(
    'reception-restricted',
    'RECEPTION',
    JSON.stringify(['appointments:read']),
  );
  await user('reception-garbage', UserRole.RECEPTION, 'not json');
  await user(
    'reception-revoked-delete',
    'RECEPTION',
    JSON.stringify(['appointments:read', 'inventory:item:read']),
  );
  await prisma.role.create({
    data: {
      name: 'RECEPTION',
      permissions: JSON.stringify(['custom:perm']),
      isActive: false,
    },
  });
  await prisma.role.create({
    data: {
      name: 'DOCTOR',
      permissions: JSON.stringify(['custom:doctor']),
      isActive: true,
    },
  });
}

async function prove(prisma: PrismaClient, file: string) {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "${schema}"."users", "${schema}"."roles", "${schema}"."permissions", "${schema}"."branches" CASCADE`,
  );
  await seedFixture(prisma);
  const before = await snapshot(prisma);
  runScript(file);
  const first = await snapshot(prisma);
  runScript(file);
  const second = await snapshot(prisma);
  const rerunChanged = JSON.stringify(first) !== JSON.stringify(second);
  console.log(`\n=== ${file} ===`);
  console.log(
    'tables with changed row counts on first run :',
    changedTables(before, first),
  );
  console.log(
    'tables with changed row counts on second run:',
    changedTables(first, second),
  );
  console.log(
    'second run left roles, users, permissions and counts identical:',
    !rerunChanged,
  );
  return { before, first, second, rerunChanged };
}

async function main() {
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  let created = false;
  let prisma: PrismaClient | undefined;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    execFileSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'db',
        'push',
        '--skip-generate',
        '--schema',
        path.join(backendDir, 'prisma/schema.prisma'),
      ],
      {
        cwd: backendDir,
        env: { ...process.env, DATABASE_URL: scriptUrl.toString() },
        stdio: 'pipe',
      },
    );
    prisma = new PrismaClient({ datasourceUrl: scriptUrl.toString() });

    const countOf = (json: string | null) =>
      (JSON.parse(json ?? '[]') as string[]).length;
    const seed = await prove(prisma, 'seed_rbac.ts');
    console.log('role RECEPTION before:', seed.before.roles.RECEPTION);
    console.log(
      'role RECEPTION after :',
      countOf(seed.first.roles.RECEPTION.permissions),
      'permissions, isActive',
      seed.first.roles.RECEPTION.isActive,
    );
    console.log('role DOCTOR after    :', seed.first.roles.DOCTOR.permissions);
    for (const email of [
      'owner',
      'admin',
      'doctor',
      'pharmacist-custom',
      'reception-null',
      'reception-restricted',
      'reception-garbage',
    ]) {
      console.log(
        `user ${email}: before=${seed.before.users[email]?.slice(0, 60)} after=${seed.first.users[email]?.slice(0, 60)}`,
      );
    }

    for (const file of [
      'backfill_reception_permissions.ts',
      'merge_reception_full_inventory.ts',
    ]) {
      const r = await prove(prisma, file);
      console.log(
        'role RECEPTION before:',
        r.before.roles.RECEPTION.permissions,
        'isActive',
        r.before.roles.RECEPTION.isActive,
      );
      console.log(
        'role RECEPTION after :',
        countOf(r.first.roles.RECEPTION.permissions),
        'permissions incl custom:perm =',
        r.first.roles.RECEPTION.permissions!.includes('custom:perm'),
        'isActive',
        r.first.roles.RECEPTION.isActive,
      );
      console.log(
        'role DOCTOR untouched:',
        r.first.roles.DOCTOR.permissions === r.before.roles.DOCTOR.permissions,
      );
      for (const email of ['owner', 'admin', 'doctor', 'pharmacist-custom']) {
        console.log(
          `user ${email} untouched:`,
          r.first.users[email] === r.before.users[email],
        );
      }
      for (const email of [
        'reception-null',
        'reception-restricted',
        'reception-garbage',
        'reception-revoked-delete',
      ]) {
        const after = JSON.parse(r.first.users[email]!) as string[];
        console.log(
          `user ${email}: ${r.before.users[email]?.slice(0, 40)} -> ${after.length} permissions, kept old=${
            (r.before.users[email] &&
              (() => {
                try {
                  return (JSON.parse(r.before.users[email]) as string[]).every(
                    (p) => after.includes(p),
                  );
                } catch {
                  return false;
                }
              })()) ??
            'n/a'
          }, has inventory:item:delete=${after.includes('inventory:item:delete')}`,
        );
      }
    }
  } finally {
    await prisma?.$disconnect();
    if (created)
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    const [left] = await admin.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*) AS n FROM information_schema.schemata WHERE schema_name = ${schema}`;
    console.log(`\ndisposable schema dropped: ${Number(left.n) === 0}`);
    await admin.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
