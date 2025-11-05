import { PrismaClient, UserRole } from '@prisma/client';

/**
 * Backfills user.permissions for users with role RECEPTION only, leaving Role rows untouched.
 *
 * Behavior:
 * - Targets users where role === RECEPTION and permissions is NULL or invalid/empty.
 * - Sets user.permissions to the seeded RECEPTION defaults.
 * - Prints a summary of updated users.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();

  const RECEPTION_DEFAULTS: string[] = [
    'appointments:create',
    'appointments:read',
    'appointments:update',
    'appointments:reschedule',
    'appointments:delete',
    'rooms:read',
    'billing:invoice:create',
    'billing:invoice:read',
    'billing:payment:process',
    'billing:payment:confirm',
    'billing:payment:read',
    // Inventory - full control
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

  try {
    // Ensure RECEPTION role exists and union-add the defaults into its permissions
    const existingRole = await prisma.role.findUnique({ where: { name: 'RECEPTION' }, select: { permissions: true } });
    const mergePerms = (jsonString: string | null | undefined, toAdd: string[]): string[] => {
      try {
        const parsed = jsonString ? JSON.parse(jsonString) : [];
        const base = Array.isArray(parsed) ? parsed.filter((p) => typeof p === 'string') : [];
        const set = new Set<string>(base);
        for (const p of toAdd) set.add(p);
        return Array.from(set);
      } catch {
        return [...toAdd];
      }
    };

    const mergedRole = JSON.stringify(mergePerms(existingRole?.permissions ?? null, RECEPTION_DEFAULTS));
    await prisma.role.upsert({
      where: { name: 'RECEPTION' },
      update: { permissions: mergedRole, isActive: true },
      create: { name: 'RECEPTION', permissions: mergedRole, isActive: true },
    });

    const users = await prisma.user.findMany({
      where: { role: UserRole.RECEPTION },
      select: { id: true, firstName: true, lastName: true, permissions: true },
    });

    const updates: { id: string; name: string }[] = [];

    for (const u of users) {
      const mergedUser = JSON.stringify(mergePerms(u.permissions, RECEPTION_DEFAULTS));
      const current = (() => {
        try {
          return JSON.stringify(JSON.parse(u.permissions ?? '[]'));
        } catch {
          return '[]';
        }
      })();
      if (mergedUser !== current) {
        await prisma.user.update({ where: { id: u.id }, data: { permissions: mergedUser } });
        const fullName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.id;
        updates.push({ id: u.id, name: fullName });
      }
    }

    console.log('Backfill complete.');
    console.log(`Updated ${updates.length} RECEPTION users.`);
    for (const u of updates) {
      console.log(`- ${u.name} (${u.id})`);
    }
  } finally {
    await (prisma as PrismaClient).$disconnect();
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err?.message || err);
  process.exit(1);
});


