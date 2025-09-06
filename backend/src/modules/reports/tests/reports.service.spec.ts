import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from '../reports.service';
import { PrismaService } from '../../../shared/database/prisma.service';

const mockPrisma = {
  patient: { count: jest.fn() },
  appointment: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
  payment: { aggregate: jest.fn(), count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
  invoice: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
  inventoryItem: { count: jest.fn(), findMany: jest.fn() },
  stockTransaction: { findMany: jest.fn() },
  visit: { findMany: jest.fn() },
};

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);

    // reset mocks
    jest.clearAllMocks();
  });

  describe('getSystemStatistics', () => {
    it('returns aggregated statistics', async () => {
      mockPrisma.patient.count.mockResolvedValueOnce(100); // totalPatients
      mockPrisma.appointment.count
        .mockResolvedValueOnce(200) // totalAppointments
        .mockResolvedValueOnce(120) // completed
        .mockResolvedValueOnce(20) // cancelled
        .mockResolvedValueOnce(10) // no-show
        .mockResolvedValueOnce(15) // todayAppointments
        .mockResolvedValueOnce(12); // todayCompleted
      mockPrisma.payment.aggregate.mockResolvedValueOnce({ _sum: { amount: 50000 } });
      mockPrisma.payment.count.mockResolvedValueOnce(5); // pending payments
      mockPrisma.invoice.count.mockResolvedValueOnce(7); // outstanding invoices
      mockPrisma.inventoryItem.count
        .mockResolvedValueOnce(3) // low stock
        .mockResolvedValueOnce(1); // out of stock
      mockPrisma.user = { count: jest.fn().mockResolvedValueOnce(6) } as any; // active doctors

      const result = await service.getSystemStatistics('branch-1' as any);
      expect(result.totals.patients).toBe(100);
      expect(result.totals.revenueThisMonth).toBe(50000);
      expect(result.billing.pendingPayments).toBe(5);
      expect(result.inventory.lowStockItems).toBe(3);
      expect(result.doctors.activeDoctors).toBe(6);
    });
  });

  describe('getSystemAlerts', () => {
    it('returns counts and lists of alerts', async () => {
      mockPrisma.invoice.findMany.mockResolvedValueOnce([{ id: 'inv1' }]);
      mockPrisma.inventoryItem.findMany
        .mockResolvedValueOnce([{ id: 'it1', name: 'Item', currentStock: 0, minStockLevel: 5 }])
        .mockResolvedValueOnce([{ id: 'it2', name: 'Item2', expiryDate: new Date(Date.now() + 86400000), currentStock: 2 }]);
      mockPrisma.payment.findMany.mockResolvedValueOnce([{ id: 'pay1', amount: 100, method: 'CASH', createdAt: new Date(), invoice: { id: 'inv1', invoiceNumber: 'INV-1' } }]);
      mockPrisma.appointment.findMany.mockResolvedValueOnce([{ id: 'appt1', date: new Date(Date.now() + 3600000), status: 'SCHEDULED', visitType: 'OPD', patient: { name: 'P' }, doctor: { firstName: 'D', lastName: 'R' } }]);

      const result = await service.getSystemAlerts('branch-1' as any);
      expect(result.counts.overdueInvoices).toBe(1);
      expect(result.counts.lowStockAlerts).toBe(1);
      expect(result.counts.expiryAlerts).toBe(1);
      expect(result.counts.pendingPayments).toBe(1);
      expect(result.counts.upcomingAppointments).toBe(1);
    });
  });

  describe('exportReport', () => {
    it('exports JSON as data URL', async () => {
      // stub revenue report
      jest.spyOn(service, 'generateRevenueReport').mockResolvedValueOnce({ totalRevenue: 100, totalGst: 0, netRevenue: 100, totalInvoices: 1, averageInvoiceValue: 100, paymentBreakdown: [], dailyBreakdown: [], doctorBreakdown: [], serviceBreakdown: [], generatedAt: new Date(), period: 'today' } as any);

      const res = await service.exportReport({ reportType: 'REVENUE' as any, exportFormat: 'JSON' as any, parameters: {} as any }, 'branch-1');
      expect(res.fileUrl.startsWith('data:application/json;base64,')).toBe(true);
      expect(res.fileName.endsWith('.json')).toBe(true);
    });

    it('exports CSV as data URL', async () => {
      jest.spyOn(service, 'generatePaymentReport').mockResolvedValueOnce({ dailyTrends: [{ date: '2025-01-01', paymentCount: 1, totalAmount: 100, successfulPayments: 1, failedPayments: 0 }] } as any);
      const res = await service.exportReport({ reportType: 'PAYMENT' as any, exportFormat: 'CSV' as any, parameters: {} as any }, 'branch-1');
      expect(res.fileUrl.startsWith('data:text/csv;base64,')).toBe(true);
      expect(res.fileName.endsWith('.csv')).toBe(true);
    });

    it('exports PDF as data URL', async () => {
      jest.spyOn(service, 'generateAppointmentReport').mockResolvedValueOnce({ dailyTrends: [], statusBreakdown: [], visitTypeBreakdown: [], doctorBreakdown: [], roomUtilization: [], totalAppointments: 0, completedAppointments: 0, cancelledAppointments: 0, noShowAppointments: 0, completionRate: 0, cancellationRate: 0, noShowRate: 0, averageWaitTime: 0, peakHours: [], generatedAt: new Date(), period: 'today' } as any);
      const res = await service.exportReport({ reportType: 'APPOINTMENT' as any, exportFormat: 'PDF' as any, parameters: {} as any }, 'branch-1');
      expect(res.fileUrl.startsWith('data:application/pdf;base64,')).toBe(true);
      expect(res.fileName.endsWith('.pdf')).toBe(true);
    });

    it('exports Excel as data URL', async () => {
      jest.spyOn(service, 'generateInventoryReport').mockResolvedValueOnce({ topSellingItems: [], itemTypeBreakdown: [], categoryBreakdown: [], manufacturerBreakdown: [], lowStockAlerts: [], expiryAlerts: [], transactionSummary: { totalTransactions: 0, purchaseTransactions: 0, saleTransactions: 0, returnTransactions: 0, adjustmentTransactions: 0, totalPurchaseValue: 0, totalSaleValue: 0, profitMargin: 0 }, totalItems: 0, totalValue: 0, lowStockItems: 0, expiredItems: 0, outOfStockItems: 0, generatedAt: new Date(), period: 'today' } as any);
      const res = await service.exportReport({ reportType: 'INVENTORY' as any, exportFormat: 'EXCEL' as any, parameters: {} as any }, 'branch-1');
      expect(res.fileUrl.startsWith('data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,')).toBe(true);
      expect(res.fileName.endsWith('.xlsx')).toBe(true);
    });
  });

  describe('generatePaymentReport', () => {
    it('includes daily success/failed counts', async () => {
      const now = new Date();
      mockPrisma.payment.aggregate.mockResolvedValueOnce({ _sum: { amount: 100 } });
      mockPrisma.payment.count
        .mockResolvedValueOnce(3) // total
        .mockResolvedValueOnce(2) // success
        .mockResolvedValueOnce(1); // failed
      mockPrisma.payment.groupBy
        .mockResolvedValueOnce([]) // mode
        .mockResolvedValueOnce([]) // gateway
        .mockResolvedValueOnce([{ createdAt: now, _sum: { amount: 100 }, _count: { id: 3 } }]) // daily all
        .mockResolvedValueOnce([{ createdAt: now, _count: { id: 2 } }]) // daily success
        .mockResolvedValueOnce([{ createdAt: now, _count: { id: 1 } }]); // daily failed
      // stubs for refund path inside method when includeRefunds true
      mockPrisma.payment.count.mockResolvedValueOnce(0); // refunds count
      mockPrisma.payment.aggregate.mockResolvedValueOnce({ _sum: { amount: 0 } }); // refunds sum
      mockPrisma.payment.count.mockResolvedValueOnce(0); // refunds for rate
      mockPrisma.payment.findMany.mockResolvedValueOnce([]); // refund reasons

      const res = await service.generatePaymentReport({ includeReconciliation: true, includeRefunds: true } as any, 'branch-1');
      expect(res.dailyTrends[0].successfulPayments).toBe(2);
      expect(res.dailyTrends[0].failedPayments).toBe(1);
      expect(res.reconciliationSummary.totalTransactions).toBe(3);
    });

    it('includes refund reasons when requested', async () => {
      mockPrisma.payment.aggregate.mockResolvedValueOnce({ _sum: { amount: 0 } });
      mockPrisma.payment.count
        .mockResolvedValueOnce(0) // total
        .mockResolvedValueOnce(0) // success
        .mockResolvedValueOnce(0); // failed
      mockPrisma.payment.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.payment.count.mockResolvedValueOnce(2); // total refunds in summary
      mockPrisma.payment.aggregate.mockResolvedValueOnce({ _sum: { amount: 50 } }); // refund amount
      mockPrisma.payment.count.mockResolvedValueOnce(2); // for refundRate
      mockPrisma.payment.findMany.mockResolvedValueOnce([
        { amount: 20, notes: 'Duplicate charge' },
        { amount: 30, notes: 'Cancelled service' },
      ]);

      const res = await service.generatePaymentReport({ includeRefunds: true } as any, 'branch-1');
      expect(res.refundSummary.totalRefunds).toBe(2);
      expect(res.refundSummary.totalRefundAmount).toBe(50);
      expect(res.refundSummary.refundReasons.length).toBe(2);
    });
  });

  describe('generateInventoryReport', () => {
    it('includes supplier breakdown', async () => {
      mockPrisma.inventoryItem.findMany.mockResolvedValueOnce([
        { id: 'i1', type: 'MEDICINE', category: 'A', manufacturer: 'X', supplier: 'S1', currentStock: 5, sellingPrice: 10 },
        { id: 'i2', type: 'MEDICINE', category: 'A', manufacturer: 'X', supplier: 'S1', currentStock: 1, sellingPrice: 20 },
      ]);
      mockPrisma.stockTransaction.findMany.mockResolvedValueOnce([]);
      const res = await service.generateInventoryReport({ includeTransactionHistory: false } as any, 'branch-1');
      expect(res.supplierBreakdown?.length).toBeGreaterThan(0);
    });
  });

  describe('generateAppointmentReport', () => {
    it('aggregates cancellation reasons when requested', async () => {
      mockPrisma.appointment.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);
      mockPrisma.appointment.groupBy
        .mockResolvedValueOnce([{ status: 'COMPLETED', _count: { id: 1 } }, { status: 'CANCELLED', _count: { id: 1 } }])
        .mockResolvedValueOnce([{ visitType: 'OPD', _count: { id: 2 } }]);
      mockPrisma.appointment.findMany
        .mockResolvedValueOnce([ // appts
          { id: 'a1', date: new Date(), status: 'COMPLETED', doctorId: 'd1', roomId: 'r1', slot: '10:00' },
          { id: 'a2', date: new Date(), status: 'CANCELLED', doctorId: 'd1', roomId: 'r1', slot: '11:00' },
        ])
        .mockResolvedValueOnce([ // cancelled with notes
          { notes: 'Cancelled: Patient not available' },
          { notes: 'Cancelled: Doctor unavailable' },
        ]);
      mockPrisma.visit.findMany.mockResolvedValueOnce([]);
      const res = await service.generateAppointmentReport({ includeCancellationReasons: true } as any, 'branch-1');
      expect(res.cancellationReasons?.length).toBe(2);
    });
  });
});
