import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ReportsService } from './reports.service';

const testUrl = process.env.REPORT_TEST_DATABASE_URL;

(testUrl ? it : it.skip)('aggregates branch payments without ambiguous SQL columns', async () => {
  const target = new URL(testUrl!);
  if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname) || !target.pathname.startsWith('/codex_clinic_')) {
    throw new Error('Report integration tests require a dedicated local codex_clinic_ database');
  }
  const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
  const rollback = new Error('rollback synthetic fixtures');
  const suffix = randomUUID();
  try {
    await db.$transaction(async tx => {
      const branchA = await tx.branch.create({ data: { name: `A-${suffix}`, address: 'Synthetic' } });
      const branchB = await tx.branch.create({ data: { name: `B-${suffix}`, address: 'Synthetic' } });
      const patientA = await tx.patient.create({ data: { branchId: branchA.id, name: 'Patient A', phone: '1111111', gender: 'OTHER' } });
      const patientB = await tx.patient.create({ data: { branchId: branchB.id, name: 'Patient B', phone: '2222222', gender: 'OTHER' } });
      const invoiceA = await tx.invoice.create({ data: { patientId: patientA.id, invoiceNo: `A-${suffix}`, total: 100, balance: 0 } });
      const invoiceB = await tx.invoice.create({ data: { patientId: patientB.id, invoiceNo: `B-${suffix}`, total: 900, balance: 0 } });
      const now = new Date();
      await tx.payment.createMany({ data: [
        { invoiceId: invoiceA.id, amount: 30, mode: 'CASH', reconStatus: 'COMPLETED', createdAt: now },
        { invoiceId: invoiceA.id, amount: 70, mode: 'CASH', reconStatus: 'COMPLETED', createdAt: now },
        { invoiceId: invoiceB.id, amount: 900, mode: 'CASH', reconStatus: 'COMPLETED', createdAt: now },
      ] });
      const newInvoice = await tx.newInvoice.create({ data: { invoiceNo: `NEW-${suffix}`, patientId: patientA.id, branchId: branchA.id, total: 35, balance: 0 } });
      await tx.newPayment.create({ data: { invoiceId: newInvoice.id, amount: 35, mode: 'CASH', reconStatus: 'COMPLETED', createdAt: now } });
      const reports = new ReportsService(tx as any);

      const revenue = await reports.generateRevenueReport({ includePaymentBreakdown: true } as any, branchA.id);
      expect(revenue.totalRevenue).toBe(100);
      expect(revenue.paymentBreakdown[0].transactionCount).toBe(2);
      const payments = await reports.generatePaymentReport({} as any, branchA.id);
      expect(payments.totalPayments).toBe(2);
      expect(payments.totalAmount).toBe(100);
      const dashboard = await reports.generateDashboard({} as any, branchA.id);
      expect(dashboard.todayRevenue).toBe(35);
      expect(dashboard.revenueTrends[0].invoiceCount).toBe(1);
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await db.$disconnect();
  }
});
