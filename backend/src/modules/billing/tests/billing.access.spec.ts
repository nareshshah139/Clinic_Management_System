import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { BillingController } from '../billing.controller';
import { BillingService } from '../billing.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';

type Method = 'get' | 'post' | 'patch' | 'delete';
type Route = [Method, string];

const adminOnly: Route[] = [
  ['patch', '/billing/invoices/inv-1'],
  ['delete', '/billing/invoices/inv-1'],
  ['post', '/billing/payments/bulk'],
  ['get', '/billing/payments/summary'],
  ['post', '/billing/refunds'],
  ['get', '/billing/reports/revenue'],
  ['get', '/billing/statistics'],
  ['post', '/billing/invoices/generate-samples'],
];
const frontDesk: Route[] = [
  ['post', '/billing/invoices'],
  ['get', '/billing/invoices/outstanding'],
  ['post', '/billing/payments'],
  ['post', '/billing/payments/pay-1/confirm'],
  ['get', '/billing/payments'],
];
const readInvoices: Route[] = [
  ['get', '/billing/invoices'],
  ['get', '/billing/invoices/inv-1'],
];

describe('/billing access control', () => {
  let app: INestApplication;
  const methods = [
    'createInvoice',
    'findAllInvoices',
    'getOutstandingInvoices',
    'findInvoiceById',
    'updateInvoice',
    'cancelInvoice',
    'processPayment',
    'processBulkPayment',
    'confirmPayment',
    'findAllPayments',
    'getPaymentSummary',
    'processRefund',
    'getRevenueReport',
    'generateSampleInvoices',
  ];
  const service: Record<string, jest.Mock> = Object.fromEntries(
    methods.map((name) => [name, jest.fn(async () => ({ ok: true }))]),
  );

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
      controllers: [BillingController],
      providers: [
        { provide: BillingService, useValue: service },
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

  const call = (method: Method, path: string, role?: string) => {
    const req = (request(app.getHttpServer()) as any)[method](path);
    if (role) req.set('x-role', role);
    return method === 'get' || method === 'delete' ? req : req.send({});
  };
  const allowed = (status: number) => status >= 200 && status < 300;

  describe.each(['OWNER', 'ADMIN', 'DOCTOR'])('%s', (role) => {
    it.each([...adminOnly, ...frontDesk, ...readInvoices])(
      'may %s %s',
      async (method, path) => {
        expect(allowed((await call(method, path, role)).status)).toBe(true);
      },
    );
  });

  describe.each(['RECEPTION'])('%s', (role) => {
    it.each([...frontDesk, ...readInvoices])(
      'may %s %s',
      async (method, path) => {
        expect(allowed((await call(method, path, role)).status)).toBe(true);
      },
    );

    it.each(adminOnly)('may not %s %s', async (method, path) => {
      expect((await call(method, path, role)).status).toBe(403);
    });
  });

  describe.each(['PHARMACIST', 'ACCOUNTANT', 'PATIENT'])('%s', (role) => {
    it.each([...adminOnly, ...frontDesk, ...readInvoices])(
      'may not %s %s',
      async (method, path) => {
        expect((await call(method, path, role)).status).toBe(403);
      },
    );
  });

  it('denies every billing route without authentication', async () => {
    for (const [method, path] of [
      ...adminOnly,
      ...frontDesk,
      ...readInvoices,
    ]) {
      expect((await call(method, path)).status).toBe(403);
    }
  });

  it('never reaches the service for a forbidden request', async () => {
    service.processRefund.mockClear();
    await call('post', '/billing/refunds', 'RECEPTION');
    expect(service.processRefund).not.toHaveBeenCalled();
    await call('post', '/billing/refunds', 'ADMIN');
    expect(service.processRefund).toHaveBeenCalledTimes(1);
  });
});
