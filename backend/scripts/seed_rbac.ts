import { PrismaClient, UserRole } from '@prisma/client';
import { ROLE_PERMISSIONS } from '../src/shared/access/role-permissions';

const prisma = new PrismaClient();

async function upsertPermission(name: string) {
  const [resource, action = 'read'] = name.split(':');
  
  // Check if permission already exists
  const existing = await prisma.permission.findFirst({
    where: { name, resource, action }
  });
  
  if (existing) {
    return existing;
  }
  
  return prisma.permission.create({
    data: {
      name,
      description: `${resource} ${action}`,
      resource,
      action,
      isActive: true,
    },
  });
}

async function main() {
  // Create Permission records (flat list)
  const allPerms = new Set<string>();
  Object.values(ROLE_PERMISSIONS).forEach((perms) => perms.forEach((p) => allPerms.add(p)));
  for (const perm of allPerms) {
    if (perm === '*') continue;
    await upsertPermission(perm);
  }

  // Create Role records mapping to permissions
  for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: { permissions: JSON.stringify(permissions) },
      create: { name: roleName, permissions: JSON.stringify(permissions), isActive: true },
    });
  }

  // Backfill: assign default permissions for users by role if they don't have explicit permissions
  const users = await prisma.user.findMany({ select: { id: true, role: true, permissions: true } });
  for (const u of users) {
    if (!u.permissions) {
      const defaults = ROLE_PERMISSIONS[u.role as UserRole] || [];
      await prisma.user.update({ where: { id: u.id }, data: { permissions: JSON.stringify(defaults) } });
    }
  }

  console.log('RBAC roles/permissions seeded successfully');
}

main().finally(async () => {
  await prisma.$disconnect();
});
