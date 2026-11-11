import { PrismaService } from '../database/prisma.service';
import { grantsForRole, parsePermissionList, permissionGrants, PermissionGrants } from './permission-grants';

const NO_GRANTS = permissionGrants([]);

/** The grants the permission guard would apply to this user: stored role, user and role-record grants. */
export async function viewerGrants(prisma: PrismaService, viewer: { id?: string }): Promise<PermissionGrants> {
  if (!viewer.id) return NO_GRANTS;
  const user = await prisma.user.findUnique({ where: { id: viewer.id }, select: { role: true, permissions: true } });
  if (!user) return NO_GRANTS;
  const record = await prisma.role.findFirst({ where: { name: user.role }, select: { permissions: true } }).catch(() => null);
  return permissionGrants(grantsForRole(user.role, [...parsePermissionList(user.permissions), ...parsePermissionList(record?.permissions)]));
}
