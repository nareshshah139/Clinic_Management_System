import { UserRole } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { roleMeetsRoles } from '../../shared/guards/roles.guard';
import { ROLES_KEY } from '../../shared/decorators/roles.decorator';
import { PERMISSIONS_KEY, PermissionRequirement } from '../../shared/decorators/permissions.decorator';
import { grantsForRole, parsePermissionList, permissionGrants, PermissionGrants } from '../../shared/access/permission-grants';
import { BillingController } from './billing.controller';

type RoutePolicy = { roles: readonly UserRole[]; permissions: readonly PermissionRequirement[] };

/** Read from the route's own decorators, so a screen can never offer what the route refuses. */
const policyOf = (handler: (...args: any[]) => unknown): RoutePolicy => ({
  roles: Reflect.getMetadata(ROLES_KEY, handler) ?? [],
  permissions: Reflect.getMetadata(PERMISSIONS_KEY, handler) ?? [],
});

const ROUTES = {
  read: policyOf(BillingController.prototype.findAllInvoices),
  create: policyOf(BillingController.prototype.createInvoice),
  pay: policyOf(BillingController.prototype.processPayment),
};

export type ClinicBillAccess = { read: boolean; createBill: boolean; takePayment: boolean };
export const NO_CLINIC_BILL_ACCESS: ClinicBillAccess = { read: false, createBill: false, takePayment: false };

const holds = (grants: PermissionGrants, requirement: PermissionRequirement) =>
  typeof requirement === 'string' ? grants.has(requirement) : requirement.some((p) => grants.has(p));

/**
 * @cc [owner:nareshshah139,label:security] clinic-bill-access
 * A screen MUST show clinic bill amounts, offer Create bill, or offer Record payment only to a
 * user the matching billing route (invoice list, invoice create, payment) admits: its role list,
 * then OWNER from the token, ADMIN or DOCTOR from the stored role, or the stored grants of any other role.
 */
export async function clinicBillAccess(
  prisma: PrismaService,
  viewer: { id: string; role: string },
): Promise<ClinicBillAccess> {
  if (!roleMeetsRoles(viewer.role, ROUTES.read.roles)) return NO_CLINIC_BILL_ACCESS;
  const user = await prisma.user.findUnique({ where: { id: viewer.id }, select: { role: true, permissions: true } });
  if (!user) return NO_CLINIC_BILL_ACCESS;
  const record = await prisma.role.findFirst({ where: { name: user.role }, select: { permissions: true } }).catch(() => null);
  const grants = permissionGrants(
    grantsForRole(user.role, [...parsePermissionList(user.permissions), ...parsePermissionList(record?.permissions)]),
  );
  const admits = (route: RoutePolicy) =>
    roleMeetsRoles(viewer.role, route.roles) &&
    (viewer.role === UserRole.OWNER || route.permissions.every((requirement) => holds(grants, requirement)));
  return { read: admits(ROUTES.read), createBill: admits(ROUTES.create), takePayment: admits(ROUTES.pay) };
}
