import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { validate } from 'class-validator';
import { PaymentMode } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { JwtStrategy } from '../../modules/auth/strategies/jwt.strategy';
import { UsersService } from '../../modules/users/users.service';
import { BillingService } from '../../modules/billing/billing.service';
import { InvoiceNumbersService } from '../numbering/invoice-numbers.service';
import { UpdateInvoiceDto } from '../../modules/billing/dto/invoice.dto';
import { ReportsService } from '../../modules/reports/reports.service';

describe('Backend build contract regressions', () => {
  it('rejects startup without a JWT secret and accepts an explicit secret', () => {
    const previous = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      expect(() => new JwtStrategy(new ConfigService({}))).toThrow('JWT_SECRET');
      expect(() => new JwtStrategy(new ConfigService({ JWT_SECRET: 'synthetic-test-secret' }))).not.toThrow();
    } finally {
      if (previous === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previous;
    }
  });

  it('applies permission filters and safe pagination when the query omits page and limit', async () => {
    const prisma = { permission: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
    const service = new UsersService(prisma as unknown as PrismaService, {} as JwtService);
    const result = await service.findAllPermissions({ resource: 'inventory', action: 'review', isActive: false });
    expect(prisma.permission.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { resource: 'inventory', action: 'review', isActive: false }, skip: 0, take: 10,
    }));
    expect(result.pagination).toEqual({ page: 1, limit: 10, total: 0, totalPages: 0 });
  });

  it('serializes permission arrays, preserves omitted permissions, and honors explicit clearing', async () => {
    const prisma = { role: {
      findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue({ id: 'role', name: 'Reviewer' }),
      create: jest.fn().mockImplementation(async ({ data }) => data), update: jest.fn().mockImplementation(async ({ data }) => data),
    } };
    const service = new UsersService(prisma as unknown as PrismaService, {} as JwtService);
    const created = await service.createRole({ name: 'Reviewer', permissions: ['inventory.review'] });
    expect(JSON.parse(created.permissions!)).toEqual(['inventory.review']);
    const unchanged = await service.updateRole('role', { description: 'updated' });
    expect(unchanged.permissions).toBeUndefined();
    const cleared = await service.updateRole('role', { permissions: [] });
    expect(JSON.parse(cleared.permissions!)).toEqual([]);
  });

  it.each(['getUserStatistics', 'getUserDashboard'] as const)('%s keeps every aggregate in the authenticated branch and date window', async (method) => {
    const prisma = { user: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) } };
    const service = new UsersService(prisma as unknown as PrismaService, {} as JwtService);
    await service[method]({ branchId: 'untrusted-branch', startDate: '2026-10-01', endDate: '2026-10-24' }, 'authenticated-branch');
    for (const mock of Object.values(prisma.user)) {
      expect(mock).toHaveBeenCalled();
      for (const [args] of mock.mock.calls) expect(args.where).toEqual(expect.objectContaining({
        branchId: 'authenticated-branch', createdAt: { gte: new Date('2026-10-01'), lte: new Date('2026-10-24') },
      }));
    }
  });

  it('rejects an invoice visit outside its patient and branch before writing', async () => {
    const prisma = {
      patient: { findFirst: jest.fn().mockResolvedValue({ id: 'patient' }) },
      visit: { findFirst: jest.fn().mockResolvedValue(null) }, invoice: { create: jest.fn() },
    };
    const service = new BillingService(prisma as unknown as PrismaService, {} as InvoiceNumbersService);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(service.createInvoice({ patientId: 'patient', visitId: 'other-visit', items: [{ name: 'Synthetic service', quantity: 1, unitPrice: 100 }] }, 'branch')).rejects.toThrow(NotFoundException);
      expect(prisma.visit.findFirst).toHaveBeenCalledWith({ where: { id: 'other-visit', patientId: 'patient', patient: { branchId: 'branch' } } });
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    } finally { log.mockRestore(); error.mockRestore(); }
  });

  it('validates invoice payment mode and tax fields without silently stripping valid updates', async () => {
    const valid = Object.assign(new UpdateInvoiceDto(), { mode: PaymentMode.CASH, gstin: 'synthetic-tax-id', hsn: '3004' });
    expect(await validate(valid, { whitelist: true })).toEqual([]);
    expect(valid).toMatchObject({ mode: 'CASH', gstin: 'synthetic-tax-id', hsn: '3004' });
    const invalid = Object.assign(new UpdateInvoiceDto(), { mode: 'UNKNOWN' });
    expect((await validate(invalid)).map(error => error.property)).toContain('mode');
  });

  it('allocates partial payments over relational service lines without duplicating revenue or service quantities', async () => {
    const items = [
      { id: 'consultation-line', total: 300, qty: 1, service: { type: 'CONSULTATION', name: 'Consultation' } },
      { id: 'procedure-line', total: 100, qty: 2, service: { type: 'PROCEDURE', name: 'Procedure' } },
    ];
    const prisma = { payment: { findMany: jest.fn().mockResolvedValue([
      { amount: 100, invoice: { items } }, { amount: 200, invoice: { items } },
      { amount: 0, invoice: { items: [] } },
    ]) } };
    const service = new ReportsService(prisma as unknown as PrismaService);
    const result = await service['getServiceRevenueBreakdown']({ status: 'COMPLETED' });
    expect(result).toEqual([
      { serviceType: 'CONSULTATION', revenue: 225, serviceCount: 1, averageServiceValue: 225 },
      { serviceType: 'PROCEDURE', revenue: 75, serviceCount: 2, averageServiceValue: 37.5 },
    ]);
    expect(result.reduce((sum, item) => sum + item.revenue, 0)).toBe(300);
  });
});
