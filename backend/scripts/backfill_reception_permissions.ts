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
    // Inventory access for reception
    'inventory:item:create',
    'inventory:item:read',
  ];

  try {
    const users = await prisma.user.findMany({
      where: { role: UserRole.RECEPTION },
      select: { id: true, firstName: true, lastName: true, permissions: true },
    });

    const updates: { id: string; name: string }[] = [];

    for (const u of users) {
      let parsed: unknown = null;
      if (u.permissions) {
        try {
          parsed = JSON.parse(u.permissions);
        } catch {
          parsed = null;
        }
      }

      const isArray = Array.isArray(parsed);
      const isEmpty = isArray && (parsed as unknown[]).length === 0;
      const shouldBackfill = !u.permissions || !isArray || isEmpty;

      if (shouldBackfill) {
        await prisma.user.update({
          where: { id: u.id },
          data: { permissions: JSON.stringify(RECEPTION_DEFAULTS) },
        });
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


