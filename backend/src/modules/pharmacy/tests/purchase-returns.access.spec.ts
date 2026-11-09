import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/guards/permissions.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { PharmacyPurchaseReturnsRegisterController } from '../pharmacy-purchase-returns-register.controller';
import { PharmacyPurchaseReturnsRegisterService } from '../pharmacy-purchase-returns-register.service';
import { ROLE_PERMISSIONS } from '../../../shared/access/role-permissions';

describe('Purchase returns register access through HTTP', () => {
  let app: INestApplication;
  let role: UserRole;
  let userPermissions: readonly string[];
  const service = { list: jest.fn().mockResolvedValue({ rows: [], total: 0 }) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PharmacyPurchaseReturnsRegisterController],
      providers: [
        { provide: PharmacyPurchaseReturnsRegisterService, useValue: service },
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn(async () => ({ role, permissions: JSON.stringify(userPermissions) })) },
            role: { findFirst: jest.fn(async () => ({ permissions: '[]' })) },
          },
        },
        RolesGuard,
        PermissionsGuard,
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: any) {
          if (!context.switchToHttp().getRequest().user) throw new UnauthorizedException();
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      req.user = { id: 'staff-1', branchId: 'branch-1', role };
      next();
    });
    app.useGlobalGuards(module.get(RolesGuard), module.get(PermissionsGuard));
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    [UserRole.PHARMACIST, ROLE_PERMISSIONS.PHARMACIST],
    [UserRole.DOCTOR, ROLE_PERMISSIONS.DOCTOR],
    [UserRole.ADMIN, ROLE_PERMISSIONS.ADMIN],
  ])('returns the register to %s', async (who, permissions) => {
    role = who;
    userPermissions = permissions;
    service.list.mockClear();
    await request(app.getHttpServer()).get('/pharmacy/purchase-returns-register?from=2026-04-01&to=2027-03-31').expect(200);
    expect(service.list.mock.calls[0][1]).toEqual({ branchId: 'branch-1' });
  });

  it('refuses reception without purchase read access', async () => {
    role = UserRole.RECEPTION;
    userPermissions = [];
    await request(app.getHttpServer()).get('/pharmacy/purchase-returns-register?from=2026-04-01&to=2027-03-31').expect(403);
  });
});
