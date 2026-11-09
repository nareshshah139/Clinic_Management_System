import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  Type,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/guards/permissions.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { PrismaService } from '../../../shared/database/prisma.service';

export interface AccessUser {
  role: string;
  grants?: string[];
}

const everyInventoryGrant = [
  'inventory:item:read',
  'inventory:item:update',
  'inventory:item:delete',
  'inventory:transaction:create',
];

export const accessUsers: Record<string, AccessUser> = {
  owner: { role: 'OWNER' },
  admin: { role: 'ADMIN' },
  doctor: { role: 'DOCTOR' },
  pharmacist: { role: 'PHARMACIST' },
  receptionReader: { role: 'RECEPTION', grants: ['inventory:item:read'] },
  receptionDeleter: {
    role: 'RECEPTION',
    grants: ['inventory:item:read', 'inventory:item:delete'],
  },
  receptionStocker: {
    role: 'RECEPTION',
    grants: [
      'inventory:item:read',
      'inventory:transaction:create',
      'inventory:item:update',
    ],
  },
  receptionNoGrants: { role: 'RECEPTION' },
  nurseNoGrants: { role: 'NURSE' },
  patientNoGrants: { role: 'PATIENT' },
  nurse: { role: 'NURSE', grants: everyInventoryGrant },
  patient: { role: 'PATIENT', grants: everyInventoryGrant },
  accountant: { role: 'ACCOUNTANT', grants: everyInventoryGrant },
  manager: { role: 'MANAGER', grants: everyInventoryGrant },
};

@Injectable()
class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const user = accessUsers[req.headers['x-user']];
    if (!user) return false;
    req.user = {
      id: req.headers['x-user'],
      role: req.headers['x-token-role'] ?? user.role,
      branchId: req.headers['x-branch'] ?? 'branch',
    };
    return true;
  }
}

const database = {
  user: {
    findUnique: async ({ where }: any) => storedUser(where.id),
    findFirst: async ({ where }: any) =>
      where.branchId === 'branch' ? storedUser(where.id) : null,
  },
  role: { findFirst: async () => ({ permissions: '[]' }) },
  $transaction: async () => ({ items: [] }),
};

function storedUser(id: string) {
  const user = accessUsers[id];
  return user
    ? { role: user.role, permissions: JSON.stringify(user.grants ?? []) }
    : null;
}

export async function accessApp(
  controller: Type<unknown>,
  providers: unknown[],
): Promise<INestApplication> {
  const module = await Test.createTestingModule({
    controllers: [controller],
    providers: [
      ...(providers as any[]),
      { provide: PrismaService, useValue: database },
      { provide: APP_GUARD, useClass: HeaderAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: APP_GUARD, useClass: PermissionsGuard },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}
