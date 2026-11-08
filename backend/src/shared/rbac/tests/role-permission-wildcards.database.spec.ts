import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { InventoryController } from '../../../modules/inventory/inventory.controller';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { ROLE_PERMISSIONS } from '../role-permissions';
import {
  LEGACY_ROLE_DEFAULTS,
  WILDCARD_MIGRATION,
  expand,
} from './role-permission-fixtures';

const databaseTests = process.env.ROLE_PERMISSIONS_TEST_DATABASE_URL
  ? describe
  : describe.skip;
databaseTests('Role permission wildcard migration on PostgreSQL', () => {
  const schema = `role_wildcards_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let url: URL;
  let created = false;

  const prisma = (...args: string[]) =>
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), ...args],
      { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url.toString() } },
    );
  const migrate = () =>
    prisma(
      'db',
      'execute',
      '--url',
      url.toString(),
      '--file',
      WILDCARD_MIGRATION,
    );
  const stored = async () =>
    Object.fromEntries(
      (
        await db.role.findMany({ select: { name: true, permissions: true } })
      ).map((r) => [r.name, r.permissions]),
    );
  const custom = {
    STOREKEEPER: [
      'inventory:item:read',
      'inventory:item:*',
      'rooms:*',
      '*',
      'inventory:item:read',
      'custom:thing',
    ],
    MIXED: [1, 'billing:*', null],
  };
  const untouched = {
    MALFORMED: 'inventory:* is not json',
    OBJECT: '{"grant":"inventory:*"}',
    EMPTY: '[]',
    NO_LIST: null,
  };

  beforeAll(async () => {
    url = new URL(process.env.ROLE_PERMISSIONS_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Tests require local PostgreSQL');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    prisma(
      'db',
      'push',
      '--skip-generate',
      '--schema',
      resolve('prisma/schema.prisma'),
    );
    db = new PrismaClient({ datasourceUrl: url.toString() });
    for (const name of Object.keys(ROLE_PERMISSIONS)) {
      const permissions =
        LEGACY_ROLE_DEFAULTS[name] ??
        ROLE_PERMISSIONS[name as keyof typeof ROLE_PERMISSIONS];
      await db.role.create({
        data: { name, permissions: JSON.stringify(permissions) },
      });
    }
    for (const [name, permissions] of Object.entries(custom))
      await db.role.create({
        data: { name, permissions: JSON.stringify(permissions) },
      });
    for (const [name, permissions] of Object.entries(untouched))
      await db.role.create({ data: { name, permissions } });
    await db.branch.create({
      data: { id: 'branch', name: 'Branch', address: 'Synthetic' },
    });
    await db.user.create({
      data: {
        id: 'pharmacist',
        firstName: 'Pharma',
        lastName: 'Cist',
        email: 'pharmacist@example.test',
        password: 'x',
        role: 'PHARMACIST',
        branchId: 'branch',
        permissions: null,
      },
    });
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (created)
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  const pharmacistMay = async (
    handler: 'createInventoryItem' | 'findAllInventoryItems',
  ) => {
    const context = {
      getHandler: () => InventoryController.prototype[handler],
      getClass: () => InventoryController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'pharmacist', role: 'PHARMACIST' } }),
      }),
    } as unknown as ExecutionContext;
    const reflector = new Reflector();
    return (
      new RolesGuard(reflector).canActivate(context) &&
      (await new PermissionsGuard(reflector, db as any).canActivate(context))
    );
  };

  it('starts with the PHARMACIST refused because the role row only holds wildcards', async () => {
    expect(await pharmacistMay('createInventoryItem')).toBe(false);
    expect(await pharmacistMay('findAllInventoryItems')).toBe(false);
  });

  it('rewrites the seeded role rows to the current defaults', async () => {
    migrate();
    const rows = await stored();
    for (const [name, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      expect(JSON.parse(rows[name]!)).toEqual(
        LEGACY_ROLE_DEFAULTS[name]
          ? expand(LEGACY_ROLE_DEFAULTS[name])
          : permissions,
      );
      expect([...JSON.parse(rows[name]!)].sort()).toEqual(
        [...permissions].sort(),
      );
    }
  });

  it('lets a PHARMACIST with no personal list add stock items and read the stock list', async () => {
    expect(await pharmacistMay('createInventoryItem')).toBe(true);
    expect(await pharmacistMay('findAllInventoryItems')).toBe(true);
  });

  it('keeps custom entries in place, drops duplicates and leaves * and unknown wildcards alone', async () => {
    const rows = await stored();
    expect(JSON.parse(rows.STOREKEEPER!)).toEqual([
      'inventory:item:read',
      'inventory:item:create',
      'inventory:item:update',
      'inventory:item:delete',
      'rooms:*',
      '*',
      'custom:thing',
    ]);
    expect(JSON.parse(rows.MIXED!)).toEqual([
      1,
      ...ROLE_PERMISSIONS.MANAGER.filter((p) => p.startsWith('billing:')),
      null,
    ]);
  });

  it('skips malformed, non-array and empty rows', async () => {
    const rows = await stored();
    for (const [name, permissions] of Object.entries(untouched))
      expect(rows[name]).toBe(permissions);
  });

  it('changes nothing when run again', async () => {
    const before = await db.role.findMany({ orderBy: { name: 'asc' } });
    migrate();
    expect(await db.role.findMany({ orderBy: { name: 'asc' } })).toEqual(
      before,
    );
  });
});
