import { Controller, Get, INestApplication, SetMetadata } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../database/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { PermissionsGuard } from './permissions.guard';
import { InventoryController } from '../../modules/inventory/inventory.controller';
import { InventoryService } from '../../modules/inventory/inventory.service';
import { InventoryImportService } from '../../modules/inventory/inventory-import.service';
import { DrugController } from '../../modules/pharmacy/drug.controller';
import { DrugService } from '../../modules/pharmacy/drug.service';
import { PharmacyInvoiceController } from '../../modules/pharmacy/pharmacy-invoice.controller';
import { PharmacyInvoiceService } from '../../modules/pharmacy/pharmacy-invoice.service';

@Controller('policy-test')
class PolicyTestController {
  @Get('undeclared') unclassified() { return { ok: true }; }
  @Get('public') @SetMetadata('isPublic', true) publicRoute() { return { ok: true }; }
}

describe('HTTP access policies with pharmacy wildcard grants', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const auth = { canActivate: (ctx: any) => {
      const req = ctx.switchToHttp().getRequest();
      req.user = { id: 'synthetic', branchId: 'branch', role: req.headers['x-role'] || 'PHARMACIST' };
      return true;
    } };
    const db = {
      user: { findUnique: jest.fn().mockImplementation(async () => ({ role: 'PHARMACIST', permissions: null })) },
      role: { findFirst: jest.fn().mockResolvedValue({ permissions: JSON.stringify(['inventory:item:*', 'pharmacy:drug:*', 'pharmacy:invoice:*']) }) },
    };
    const module = await Test.createTestingModule({
      controllers: [PolicyTestController, InventoryController, DrugController, PharmacyInvoiceController],
      providers: [
        { provide: PrismaService, useValue: db },
        { provide: InventoryService, useValue: { findAllInventoryItems: jest.fn().mockResolvedValue({ data: [] }) } },
        { provide: InventoryImportService, useValue: {} },
        { provide: DrugService, useValue: { findAll: jest.fn().mockResolvedValue({ data: [] }) } },
        { provide: PharmacyInvoiceService, useValue: { findAll: jest.fn().mockResolvedValue({ data: [] }) } },
        { provide: APP_GUARD, useValue: auth },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    }).overrideGuard(JwtAuthGuard).useValue(auth).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  it.each(['/inventory/items', '/drugs', '/pharmacy/invoices'])('allows a pharmacist with seeded wildcard grants to GET %s', async url => {
    await request(app.getHttpServer()).get(url).set('x-role', 'PHARMACIST').expect(200);
  });
  it('denies an undeclared endpoint even to an owner and allows an explicitly public route', async () => {
    await request(app.getHttpServer()).get('/policy-test/undeclared').set('x-role', 'OWNER').expect(403);
    await request(app.getHttpServer()).get('/policy-test/public').expect(200);
  });
});
