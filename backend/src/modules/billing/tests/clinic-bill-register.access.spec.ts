import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { ClinicBillRegisterController } from '../clinic-bill-register.controller';
import { ClinicBillRegisterService } from '../clinic-bill-register.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';

const routes = [
  '/billing/register?from=2026-04-01&to=2027-03-31',
  '/billing/invoices/inv-1/receipt',
];

describe('/billing register and receipt access control', () => {
  let app: INestApplication;
  const service = {
    list: jest.fn(async () => ({ rows: [] })),
    receipt: jest.fn(async () => ({ bill: {} })),
  };
  const authenticate = {
    canActivate: (context: any) => {
      const req = context.switchToHttp().getRequest();
      const role = req.headers['x-role'];
      if (!role) return false;
      req.user = { id: `user-${role}`, role, branchId: 'branch-a' };
      return true;
    },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ClinicBillRegisterController],
      providers: [
        { provide: ClinicBillRegisterService, useValue: service },
        { provide: APP_GUARD, useValue: authenticate },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authenticate)
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  const get = (path: string, role?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return role ? req.set('x-role', role) : req;
  };

  describe.each(['OWNER', 'ADMIN', 'DOCTOR', 'RECEPTION'])('%s', (role) => {
    it.each(routes)('may read %s', async (path) => {
      expect((await get(path, role)).status).toBe(200);
    });
  });

  describe.each(['PHARMACIST', 'ACCOUNTANT', 'MANAGER', 'PATIENT'])(
    '%s',
    (role) => {
      it.each(routes)('may not read %s', async (path) => {
        expect((await get(path, role)).status).toBe(403);
      });
    },
  );

  it('denies both routes without authentication and never reaches the service', async () => {
    service.list.mockClear();
    service.receipt.mockClear();
    for (const path of routes) expect((await get(path)).status).toBe(403);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.receipt).not.toHaveBeenCalled();
  });
});
