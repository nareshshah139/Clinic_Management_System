import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class PharmacyService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(branchId: string) {
    try {
      const prisma = this.prisma as any;
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

      const [
        todayCompletedAgg,
        todayAllAgg,
        todayAllCount,
        todayCompletedCount,
        monthInvoices,
        lastMonthInvoices,
        totalDrugs,
        lowStockInventoryCount,
        expiredInventoryCount,
        packagesCount,
        topSellingDrugs,
        recentInvoices,
        lowStockAlerts,
      ] = await Promise.all([
        // Today's invoices
        prisma.pharmacyInvoice.aggregate({
          where: {
            branchId,
            invoiceDate: { gte: todayStart },
            paymentStatus: 'COMPLETED',
          },
          _sum: { totalAmount: true },
          _count: true,
        }),
        // Today's invoices (all) aggregate for totalAmount
        prisma.pharmacyInvoice.aggregate({
          where: {
            branchId,
            invoiceDate: { gte: todayStart },
          },
          _sum: { totalAmount: true },
        }),
        // Today's invoices (all statuses) count
        prisma.pharmacyInvoice.count({
          where: {
            branchId,
            invoiceDate: { gte: todayStart },
          },
        }),
        // Today's completed invoices count
        prisma.pharmacyInvoice.count({
          where: {
            branchId,
            invoiceDate: { gte: todayStart },
            paymentStatus: 'COMPLETED',
          },
        }),

        // This month's invoices
        prisma.pharmacyInvoice.aggregate({
          where: {
            branchId,
            invoiceDate: { gte: monthStart },
            paymentStatus: 'COMPLETED',
          },
          _sum: { totalAmount: true },
          _count: true,
        }),

        // Last month's invoices for growth calculation
        prisma.pharmacyInvoice.aggregate({
          where: {
            branchId,
            invoiceDate: { gte: lastMonthStart, lte: lastMonthEnd },
            paymentStatus: 'COMPLETED',
          },
          _sum: { totalAmount: true },
        }),

        // Total active drugs count
        prisma.drug.count({
          where: { branchId, isActive: true, isDiscontinued: false },
        }),

        // Low stock inventory items (LOW_STOCK or OUT_OF_STOCK)
        prisma.inventoryItem.count({
          where: {
            branchId,
            status: 'ACTIVE',
            OR: [
              { stockStatus: 'LOW_STOCK' },
              { stockStatus: 'OUT_OF_STOCK' },
            ],
          },
        }),

        // Expired inventory items
        prisma.inventoryItem.count({
          where: {
            branchId,
            status: 'ACTIVE',
            stockStatus: 'EXPIRED',
          },
        }),

        // Treatment packages count (active)
        prisma.pharmacyPackage.count({
          where: { branchId, isActive: true },
        }),

        // Top selling drugs this month
        prisma.pharmacyInvoiceItem.groupBy({
          by: ['drugId'],
          where: {
            invoice: {
              branchId,
              invoiceDate: { gte: monthStart },
              paymentStatus: 'COMPLETED',
            },
          },
          _sum: {
            quantity: true,
            totalAmount: true,
          },
          orderBy: {
            _sum: {
              totalAmount: 'desc',
            },
          },
          take: 5,
        }),

        // Recent invoices
        prisma.pharmacyInvoice.findMany({
          where: { branchId },
          include: {
            patient: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),

        // Low stock alerts (sample from low stock inventory items)
        prisma.drug.findMany({
          where: {
            branchId,
            isActive: true,
            isDiscontinued: false,
          },
          select: {
            id: true,
            name: true,
            manufacturerName: true,
          },
          take: 4,
        }),
      ]);

      // Get drug details for top selling
      const drugIds = topSellingDrugs.map((item: any) => item.drugId);
      const drugDetails = await prisma.drug.findMany({
        where: { id: { in: drugIds } },
        select: {
          id: true,
          name: true,
          manufacturerName: true,
        },
      });

      const topSellingWithDetails = topSellingDrugs.map((item: any) => {
        const drug = (drugDetails as any[]).find((d: any) => d.id === item.drugId);
        return {
          id: item.drugId,
          name: drug?.name || 'Unknown',
          quantity: item._sum.quantity || 0,
          revenue: item._sum.totalAmount || 0,
        };
      });

      // Calculate growth percentages
      const todayGrowth = this.calculateGrowthPercentage(
        todayCompletedAgg._sum.totalAmount || 0,
        monthInvoices._sum.totalAmount || 0
      );

      const monthGrowth = this.calculateGrowthPercentage(
        monthInvoices._sum.totalAmount || 0,
        lastMonthInvoices._sum.totalAmount || 0
      );

      return {
        todaySales: todayAllAgg._sum.totalAmount || 0,
        todaySalesCompleted: todayCompletedAgg._sum.totalAmount || 0,
        todayGrowth,
        monthSales: monthInvoices._sum.totalAmount || 0,
        monthGrowth,
        // New fields focused on 'today'
        todayInvoices: todayAllCount,
        todayCompletedInvoices: todayCompletedCount,
        todayPendingInvoices: Math.max(0, todayAllCount - todayCompletedCount),
        // Month-level counts
        totalInvoices: monthInvoices._count,
        completedInvoices: monthInvoices._count,
        pendingInvoices: 0,
        totalDrugs,
        lowStockDrugs: lowStockInventoryCount,
        expiredDrugs: expiredInventoryCount,
        packagesCount,
        topSellingDrugs: topSellingWithDetails,
        recentInvoices: recentInvoices.map((invoice: any) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          patientName: invoice.patient.name,
          amount: invoice.totalAmount,
          status: invoice.status,
          createdAt: invoice.createdAt.toISOString(),
        })),
        lowStockAlerts: lowStockAlerts.map((drug: any) => ({
          id: drug.id,
          name: drug.name,
          currentStock: Math.floor(Math.random() * 20) + 1, // Mock current stock
          minStock: Math.floor(Math.random() * 50) + 20, // Mock min stock
          manufacturerName: drug.manufacturerName,
        })),
      };
    } catch (error) {
      throw new Error(`Failed to get dashboard data: ${error.message}`);
    }
  }

  async getSalesStats(branchId: string) {
    try {
      const prisma = this.prisma as any;
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [todaySales, weekSales, monthSales] = await Promise.all([
        prisma.pharmacyInvoice.aggregate({
          where: {
            branchId,
            invoiceDate: { gte: todayStart },
            paymentStatus: 'COMPLETED',
          },
          _sum: { totalAmount: true },
          _count: true,
        }),

        prisma.pharmacyInvoice.aggregate({
          where: {
            branchId,
            invoiceDate: { gte: weekStart },
            paymentStatus: 'COMPLETED',
          },
          _sum: { totalAmount: true },
          _count: true,
        }),

        prisma.pharmacyInvoice.aggregate({
          where: {
            branchId,
            invoiceDate: { gte: monthStart },
            paymentStatus: 'COMPLETED',
          },
          _sum: { totalAmount: true },
          _count: true,
        }),
      ]);

      return {
        today: {
          amount: todaySales._sum.totalAmount || 0,
          count: todaySales._count,
        },
        week: {
          amount: weekSales._sum.totalAmount || 0,
          count: weekSales._count,
        },
        month: {
          amount: monthSales._sum.totalAmount || 0,
          count: monthSales._count,
        },
      };
    } catch (error) {
      throw new Error(`Failed to get sales stats: ${error.message}`);
    }
  }

  async getTopSellingDrugs(branchId: string, limit: number = 10) {
    try {
      const prisma = this.prisma as any;
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

      const topSelling = await prisma.pharmacyInvoiceItem.groupBy({
        by: ['drugId'],
        where: {
          invoice: {
            branchId,
            invoiceDate: { gte: monthStart },
            paymentStatus: 'COMPLETED',
          },
        },
        _sum: {
          quantity: true,
          totalAmount: true,
        },
        orderBy: {
          _sum: {
            totalAmount: 'desc',
          },
        },
        take: limit,
      });

      // Get drug details
      const drugIds = (topSelling as any[]).map((item: any) => item.drugId);
      const drugDetails = await prisma.drug.findMany({
        where: { id: { in: drugIds } },
        select: {
          id: true,
          name: true,
          manufacturerName: true,
          packSizeLabel: true,
        },
      });

      return (topSelling as any[]).map((item: any) => {
        const drug = (drugDetails as any[]).find((d: any) => d.id === item.drugId);
        return {
          id: item.drugId,
          name: drug?.name || 'Unknown',
          manufacturerName: drug?.manufacturerName || 'Unknown',
          packSizeLabel: drug?.packSizeLabel || 'Unknown',
          quantity: item._sum.quantity || 0,
          revenue: item._sum.totalAmount || 0,
        };
      });
    } catch (error) {
      throw new Error(`Failed to get top selling drugs: ${error.message}`);
    }
  }

  async getRecentInvoices(branchId: string, limit: number = 10) {
    try {
      const prisma = this.prisma as any;
      const invoices = await prisma.pharmacyInvoice.findMany({
        where: { branchId },
        include: {
          patient: {
            select: { id: true, name: true },
          },
          doctor: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return (invoices as any[]).map((invoice: any) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        patientName: invoice.patient.name,
        doctorName: invoice.doctor ? `${invoice.doctor.firstName} ${invoice.doctor.lastName}` : null,
        amount: invoice.totalAmount,
        status: invoice.status,
        paymentStatus: invoice.paymentStatus,
        createdAt: invoice.createdAt.toISOString(),
      }));
    } catch (error) {
      throw new Error(`Failed to get recent invoices: ${error.message}`);
    }
  }

  async getAlerts(branchId: string) {
    try {
      // Mock low stock alerts for now
      const prisma = this.prisma as any;
      const drugs = await prisma.drug.findMany({
        where: {
          branchId,
          isActive: true,
          isDiscontinued: false,
        },
        select: {
          id: true,
          name: true,
          manufacturerName: true,
        },
        take: 10,
      });

      const lowStockAlerts = (drugs as any[]).slice(0, 4).map((drug: any) => ({
        id: drug.id,
        name: drug.name,
        currentStock: Math.floor(Math.random() * 20) + 1,
        minStock: Math.floor(Math.random() * 50) + 20,
        manufacturerName: drug.manufacturerName,
      }));

      const expiredDrugs = (drugs as any[]).slice(4, 6).map((drug: any) => ({
        id: drug.id,
        name: drug.name,
        expiryDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        batchNumber: `BATCH${Math.floor(Math.random() * 10000)}`,
        manufacturerName: drug.manufacturerName,
      }));

      return {
        lowStock: lowStockAlerts,
        expired: expiredDrugs,
        nearExpiry: [],
      };
    } catch (error) {
      throw new Error(`Failed to get alerts: ${error.message}`);
    }
  }

  private calculateGrowthPercentage(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }
} 