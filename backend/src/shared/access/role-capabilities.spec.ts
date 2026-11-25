import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_CAPABILITIES, ROLES, rolesWith, type Capability, type Role } from '../../../../frontend/src/lib/role-capabilities';
import { AuditLogsController } from '../../modules/audit-logs/audit-logs.controller';
import { AuthController } from '../../modules/auth/auth.controller';
import { AppointmentsController } from '../../modules/appointments/appointments.controller';
import { BillingController } from '../../modules/billing/billing.controller';
import { ClinicFeesController } from '../../modules/billing/clinic-fees.controller';
import { InventoryWorkflowController } from '../../modules/inventory/inventory-workflow.controller';
import { PatientsController } from '../../modules/patients/patients.controller';
import { PharmacyPartnerSalesController } from '../../modules/pharmacy/pharmacy-partner-sales.controller';
import { PharmacyPrescriptionQueueController } from '../../modules/pharmacy/pharmacy-prescription-queue.controller';
import { PharmacyReportsController } from '../../modules/pharmacy/pharmacy-reports.controller';
import { PharmacySalesRegisterController } from '../../modules/pharmacy/pharmacy-sales-register.controller';
import { ReportsController } from '../../modules/reports/reports.controller';
import { UsersController } from '../../modules/users/users.controller';
import { VisitsController } from '../../modules/visits/visits.controller';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RolesGuard } from '../guards/roles.guard';
import { ROLE_PERMISSIONS } from './role-permissions';
import { userGrants } from './permission-grants';

type FirstRead = { controller: Function; handler: string };
const read = (controller: Function, handler: string): FirstRead => ({ controller, handler });

const FIRST_READS: Record<Exclude<Capability, 'dashboard' | 'backup'>, FirstRead[]> = {
  patients: [read(PatientsController, 'findAll')],
  appointments: [read(AppointmentsController, 'findAll')],
  visits: [read(VisitsController, 'findAll')],
  procedures: [read(VisitsController, 'findAll'), read(UsersController, 'findAllUsers')],
  rooms: [read(AppointmentsController, 'getRooms')],
  'pharmacy-desk': [read(PharmacyPartnerSalesController, 'todaySummary')],
  'pharmacy-counter': [read(PharmacyPrescriptionQueueController, 'findAll')],
  'pharmacy-sales': [read(PharmacySalesRegisterController, 'list')],
  'pharmacy-reports': [read(PharmacyReportsController, 'report')],
  inventory: [read(InventoryWorkflowController, 'overview')],
  billing: [read(BillingController, 'findAllInvoices')],
  reports: [read(ReportsController, 'generateRevenueReport')],
  users: [read(UsersController, 'findAllUsers')],
  fees: [read(ClinicFeesController, 'list')],
  'audit-logs': [read(AuditLogsController, 'findAll'), read(AuditLogsController, 'getStatistics'), read(UsersController, 'findAllUsers')],
};

const reflector = new Reflector();

async function admits({ controller, handler }: FirstRead, role: Role) {
  const method = (controller.prototype as Record<string, Function>)[handler];
  expect(typeof method).toBe('function');
  const context = {
    getHandler: () => method,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 'staff-1', branchId: 'branch-1', role } }) }),
  } as unknown as ExecutionContext;
  const prisma = {
    user: { findUnique: async () => ({ role, permissions: null, revokedPermissions: null }) },
    role: { findFirst: async () => ({ permissions: JSON.stringify(ROLE_PERMISSIONS[role]) }) },
  };
  return new RolesGuard(reflector).canActivate(context) && (await new PermissionsGuard(reflector, prisma as never).canActivate(context));
}

const admittedRoles = async (capability: keyof typeof FIRST_READS) => {
  const decisions = await Promise.all(ROLES.map(async (role) => [role, (await Promise.all(FIRST_READS[capability].map((firstRead) => admits(firstRead, role)))).every(Boolean)] as const));
  return decisions.filter(([, admitted]) => admitted).map(([role]) => role);
};

describe('the role capability table the sidebar and the home dashboard read', () => {
  it('names every role the server knows with a grant list', () => {
    expect([...ROLES].sort()).toEqual(Object.keys(ROLE_PERMISSIONS).filter((role) => !['LAB_TECH', 'PATIENT'].includes(role)).sort());
    expect(Object.keys(ROLE_CAPABILITIES).sort()).toEqual([...ROLES].sort());
  });

  it.each(Object.keys(FIRST_READS) as (keyof typeof FIRST_READS)[])('offers %s only to roles whose first read the guards answer', async (capability) => {
    const admitted = await admittedRoles(capability);
    expect(rolesWith(capability).filter((role) => !admitted.includes(role))).toEqual([]);
  });

  it.each(['appointments', 'rooms', 'pharmacy-desk', 'pharmacy-counter', 'pharmacy-sales', 'pharmacy-reports', 'reports'] as const)(
    'offers %s to every role the guards admit, so no admitted role is left without the link',
    async (capability) => {
      expect(rolesWith(capability)).toEqual(await admittedRoles(capability));
    },
  );

  it('keeps the guards refusing the roles the audit found offered pages they cannot open', async () => {
    expect(await admits(read(PharmacySalesRegisterController, 'list'), 'MANAGER')).toBe(false);
    expect(await admits(read(BillingController, 'findAllInvoices'), 'ACCOUNTANT')).toBe(false);
    expect(await admits(read(AppointmentsController, 'getRooms'), 'MANAGER')).toBe(false);
  });

  it('offers the database backup to OWNER and ADMIN, the only roles the backup route accepts', async () => {
    expect(rolesWith('backup')).toEqual(['OWNER', 'ADMIN']);
    const controller = new AuthController(null as never, null as never, null as never);
    for (const role of ROLES.filter((name) => !rolesWith('backup').includes(name))) {
      await expect(controller.createBackup({ user: { id: 'staff-1', branchId: 'branch-1', role } })).rejects.toMatchObject({ status: 403 });
    }
  });

  it('offers inventory only to roles that hold the grant its workspace reads stock with', () => {
    const holders = ROLES.filter((role) => userGrants({ role, permissions: null, revokedPermissions: null }, JSON.stringify(ROLE_PERMISSIONS[role])).has('inventory:item:read'));
    expect(rolesWith('inventory').filter((role) => !holders.includes(role))).toEqual([]);
  });
});
