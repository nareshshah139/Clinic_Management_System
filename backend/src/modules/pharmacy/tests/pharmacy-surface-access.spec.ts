import { readdirSync } from 'node:fs';
import * as path from 'node:path';
import { ExecutionContext, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ROLE_PERMISSIONS } from '../../../shared/access/role-permissions';
import { PermissionsGuard } from '../../../shared/guards/permissions.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';

const SURFACE_MODULES = ['pharmacy', 'inventory', 'pharmacy-agent'];

const PHARMACIST_EXCLUDED: Record<string, string> = {
  'DrugController.approveInventoryChangeRequest':
    'Separation of duties: pharmacists submit price and stock edits; doctors, admins and owners approve them.',
  'DrugController.rejectInventoryChangeRequest':
    'Separation of duties: rejecting is the same review decision as approving.',
};

type Route = { key: string; label: string; controller: Function; handler: Function };

function controllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : controllerFiles(full);
    return entry.name.endsWith('.controller.ts') ? [full] : [];
  });
}

function surfaceRoutes(): Route[] {
  const routes: Route[] = [];
  for (const file of SURFACE_MODULES.flatMap((name) => controllerFiles(path.resolve(__dirname, '../..', name)))) {
    for (const exported of Object.values(require(file) as Record<string, unknown>)) {
      if (typeof exported !== 'function') continue;
      const base = Reflect.getMetadata(PATH_METADATA, exported);
      if (base === undefined) continue;
      for (const name of Object.getOwnPropertyNames(exported.prototype)) {
        const handler = exported.prototype[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler);
        if (method === undefined) continue;
        routes.push({
          key: `${exported.name}.${name}`,
          label: `${RequestMethod[method]} /${base}/${Reflect.getMetadata(PATH_METADATA, handler)}`.replace(/\/+$/, ''),
          controller: exported,
          handler,
        });
      }
    }
  }
  return routes;
}

async function guardsAllow(route: Route, role: string, rolePermissions: readonly string[]) {
  const reflector = new Reflector();
  const context = {
    getHandler: () => route.handler,
    getClass: () => route.controller,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 'staff-1', branchId: 'branch-1', role } }) }),
  } as unknown as ExecutionContext;
  const prisma = {
    user: { findUnique: async () => ({ role, permissions: null }) },
    role: { findFirst: async () => ({ permissions: JSON.stringify(rolePermissions) }) },
  };
  return new RolesGuard(reflector).canActivate(context) && (await new PermissionsGuard(reflector, prisma as any).canActivate(context));
}

const routes = surfaceRoutes();

describe('Pharmacy surface access for pharmacists, doctors and admins', () => {
  it('discovers the pharmacy, inventory and agent controllers', () => {
    const keys = routes.map((route) => route.key);
    expect(keys).toEqual(expect.arrayContaining([
      'PharmacyPurchaseLedgerController.createPayment',
      'PharmacySalesRegisterController.list',
      'InventoryWorkflowController.capabilities',
      'InventoryPurchaseActionsController.detail',
      'DrugController.findAll',
      'PharmacyAgentController.createSession',
    ]));
    expect(Object.keys(PHARMACIST_EXCLUDED).filter((key) => !keys.includes(key))).toEqual([]);
  });

  it.each(routes.map((route) => [route.label, route] as const))('%s admits DOCTOR, ADMIN and the seeded PHARMACIST', async (_label, route) => {
    const decisions = {
      DOCTOR: await guardsAllow(route, 'DOCTOR', ROLE_PERMISSIONS.DOCTOR),
      ADMIN: await guardsAllow(route, 'ADMIN', ROLE_PERMISSIONS.ADMIN),
      PHARMACIST: await guardsAllow(route, 'PHARMACIST', ROLE_PERMISSIONS.PHARMACIST),
    };
    expect(decisions).toEqual({ DOCTOR: true, ADMIN: true, PHARMACIST: !(route.key in PHARMACIST_EXCLUDED) });
  });
});
