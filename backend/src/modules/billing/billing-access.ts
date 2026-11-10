import { UserRole } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { roleMeetsRoles } from '../../shared/guards/roles.guard';
import { grantsForRole, parsePermissionList, permissionGrants } from '../../shared/access/permission-grants';

/** The policies of the clinic bill routes, shared by the routes and every screen that shows clinic bills. */
export const CLINIC_BILL_ROUTES = {
  read: { roles: [UserRole.ADMIN, UserRole.RECEPTION, UserRole.DOCTOR], permission: 'billing:invoice:read' },
  create: { roles: [UserRole.ADMIN, UserRole.RECEPTION], permission: 'billing:invoice:create' },
  pay: { roles: [UserRole.ADMIN, UserRole.RECEPTION], permission: 'billing:payment:process' },
} as const;

export type ClinicBillAccess = { read: boolean; createBill: boolean; takePayment: boolean };
export const NO_CLINIC_BILL_ACCESS: ClinicBillAccess = { read: false, createBill: false, takePayment: false };

/**
 * @cc [owner:nareshshah139,label:security] clinic-bill-access
 * A screen MUST show clinic bill amounts, offer Create bill, or offer Record payment only to a
 * user the matching billing route admits: its role list, then OWNER from the token, ADMIN or
 * DOCTOR from the stored role, or the stored grants of any other role.
 */
export async function clinicBillAccess(
  prisma: PrismaService,
  viewer: { id: string; role: string },
): Promise<ClinicBillAccess> {
  if (!roleMeetsRoles(viewer.role, CLINIC_BILL_ROUTES.read.roles)) return NO_CLINIC_BILL_ACCESS;
  const user = await prisma.user.findUnique({ where: { id: viewer.id }, select: { role: true, permissions: true } });
  if (!user) return NO_CLINIC_BILL_ACCESS;
  const record = await prisma.role.findFirst({ where: { name: user.role }, select: { permissions: true } }).catch(() => null);
  const grants = permissionGrants(
    grantsForRole(user.role, [...parsePermissionList(user.permissions), ...parsePermissionList(record?.permissions)]),
  );
  const admits = (route: { roles: readonly UserRole[]; permission: string }) =>
    roleMeetsRoles(viewer.role, route.roles) && (viewer.role === UserRole.OWNER || grants.has(route.permission));
  return {
    read: admits(CLINIC_BILL_ROUTES.read),
    createBill: admits(CLINIC_BILL_ROUTES.create),
    takePayment: admits(CLINIC_BILL_ROUTES.pay),
  };
}
