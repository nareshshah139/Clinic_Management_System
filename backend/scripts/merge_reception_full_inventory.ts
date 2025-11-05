import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const INVENTORY_FULL: string[] = [
  'inventory:item:create',
  'inventory:item:read',
  'inventory:item:update',
  'inventory:item:delete',
  'inventory:transaction:create',
  'inventory:transaction:read',
  'inventory:transaction:update',
  'inventory:transaction:delete',
  'inventory:transaction:bulk',
  'inventory:adjustment:create',
  'inventory:transfer:create',
  'inventory:po:create',
  'inventory:po:read',
  'inventory:po:update',
  'inventory:po:delete',
  'inventory:supplier:create',
  'inventory:supplier:read',
  'inventory:supplier:update',
  'inventory:supplier:delete',
  'inventory:report:stock',
  'inventory:statistics:read',
  'inventory:alerts:lowStock',
  'inventory:alerts:expiry',
  'inventory:movement:read',
  'inventory:search:barcode',
  'inventory:search:sku',
  'inventory:catalog:categories',
  'inventory:catalog:manufacturers',
  'inventory:storage:read',
  'inventory:dashboard:read',
];

function mergePermissions(jsonString: string | null | undefined, toAdd: string[]): string[] {
  try {
    const parsed = jsonString ? JSON.parse(jsonString) : [];
    const base = Array.isArray(parsed) ? parsed.filter((p) => typeof p === 'string') : [];
    const set = new Set<string>(base);
    for (const p of toAdd) set.add(p);
    return Array.from(set);
  } catch {
    return [...toAdd];
  }
}

async function upsertReceptionRole(): Promise<void> {
  const existing = await prisma.role.findUnique({ where: { name: 'RECEPTION' } });
  const next = JSON.stringify(mergePermissions(existing?.permissions ?? null, INVENTORY_FULL));
  await prisma.role.upsert({
    where: { name: 'RECEPTION' },
    update: { permissions: next, isActive: true },
    create: { name: 'RECEPTION', permissions: next, isActive: true },
  });
}

async function mergeForReceptionUsers(): Promise<number> {
  const users = await prisma.user.findMany({
    where: { role: UserRole.RECEPTION },
    select: { id: true, permissions: true },
  });
  let updated = 0;
  for (const u of users) {
    const merged = JSON.stringify(mergePermissions(u.permissions, INVENTORY_FULL));
    const current = (() => {
      try {
        return JSON.stringify(JSON.parse(u.permissions ?? '[]'));
      } catch {
        return '[]';
      }
    })();
    if (merged !== current) {
      await prisma.user.update({ where: { id: u.id }, data: { permissions: merged } });
      updated++;
    }
  }
  return updated;
}

async function main(): Promise<void> {
  await upsertReceptionRole();
  const count = await mergeForReceptionUsers();
  console.log(`Merged full inventory permissions into RECEPTION role and ${count} users.`);
}

main()
  .catch((e) => {
    console.error('Merge failed:', e?.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


