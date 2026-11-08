import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InventoryController } from '../../modules/inventory/inventory.controller';
import { DrugController } from '../../modules/pharmacy/drug.controller';
import { BillingController } from '../../modules/billing/billing.controller';
import { ROLE_PERMISSIONS } from '../rbac/role-permissions';
import { LEGACY_ROLE_DEFAULTS } from '../rbac/tests/role-permission-fixtures';
import { PermissionsGuard } from './permissions.guard';
import { RolesGuard } from './roles.guard';

type Controller = { prototype: object; name: string };

/** Runs the global RolesGuard and PermissionsGuard against a real route, for a user with no personal list. */
async function allowed(
  controller: Controller,
  handler: string,
  role: string,
  rolePermissions: string[] | null,
) {
  const prisma = {
    user: { findUnique: async () => ({ role, permissions: null }) },
    role: {
      findFirst: async () =>
        rolePermissions
          ? { permissions: JSON.stringify(rolePermissions) }
          : null,
    },
  };
  const method = (controller.prototype as Record<string, unknown>)[handler];
  if (typeof method !== 'function')
    throw new Error(`${controller.name}.${handler} not found`);
  const context = {
    getHandler: () => method,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: 'user-1', role } }),
    }),
  } as unknown as ExecutionContext;
  const reflector = new Reflector();
  return (
    new RolesGuard(reflector).canActivate(context) &&
    (await new PermissionsGuard(reflector, prisma as any).canActivate(context))
  );
}

describe('Role default permissions through the guards', () => {
  it('lets a PHARMACIST with no personal list add stock items and read the stock list', async () => {
    expect(
      await allowed(
        InventoryController,
        'createInventoryItem',
        'PHARMACIST',
        ROLE_PERMISSIONS.PHARMACIST,
      ),
    ).toBe(true);
    expect(
      await allowed(
        InventoryController,
        'findAllInventoryItems',
        'PHARMACIST',
        ROLE_PERMISSIONS.PHARMACIST,
      ),
    ).toBe(true);
  });

  it('refused the same PHARMACIST while the role row still held wildcards', async () => {
    expect(
      await allowed(
        InventoryController,
        'createInventoryItem',
        'PHARMACIST',
        LEGACY_ROLE_DEFAULTS.PHARMACIST,
      ),
    ).toBe(false);
    expect(
      await allowed(
        InventoryController,
        'findAllInventoryItems',
        'PHARMACIST',
        LEGACY_ROLE_DEFAULTS.PHARMACIST,
      ),
    ).toBe(false);
  });

  it('fails closed for a role without a role row', async () => {
    expect(
      await allowed(
        InventoryController,
        'findAllInventoryItems',
        'PHARMACIST',
        null,
      ),
    ).toBe(false);
  });

  it('does not let a PHARMACIST approve its own drug inventory change requests', async () => {
    expect(
      await allowed(
        DrugController,
        'approveInventoryChangeRequest',
        'PHARMACIST',
        ROLE_PERMISSIONS.PHARMACIST,
      ),
    ).toBe(false);
    expect(
      await allowed(
        DrugController,
        'createInventoryChangeRequests',
        'PHARMACIST',
        ROLE_PERMISSIONS.PHARMACIST,
      ),
    ).toBe(true);
  });

  it('keeps roles without inventory grants out of the stock list', async () => {
    for (const role of [
      'NURSE',
      'ACCOUNTANT',
      'LAB_TECH',
      'PATIENT',
    ] as const) {
      expect(
        await allowed(
          InventoryController,
          'findAllInventoryItems',
          role,
          ROLE_PERMISSIONS[role],
        ),
      ).toBe(false);
    }
  });

  it('does not give MANAGER the admin-only sample invoice generator', async () => {
    expect(
      await allowed(
        BillingController,
        'generateSamples',
        'MANAGER',
        ROLE_PERMISSIONS.MANAGER,
      ),
    ).toBe(false);
  });
});
