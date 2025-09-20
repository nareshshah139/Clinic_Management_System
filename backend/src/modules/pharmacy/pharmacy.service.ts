import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class PharmacyService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(branchId: string) {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

      const [
        todayInvoices,
        monthInvoices,
        lastMonthInvoices,
        totalDrugs,
        lowStockDrugs,
        expiredDrugs,
        topSellingDrugs,
        recentInvoices,
        lowStockAlerts,
      ] = await Promise.all([
        // Today's invoices
        this.prisma.pharmacyInvoice.aggregate({
          where: {
            branchId,
            invoiceDate: { gte: todayStart },
            paymentStatus: 'COMPLETED',
          },
          _sum: { totalAmount: true },
          _count: true,
        }),

        // This month's invoices
        this.prisma.pharmacyInvoice.aggregate({
          where: {
            branchId,
            invoiceDate: { gte: monthStart },
            paymentStatus: 'COMPLETED',
          },
          _sum: { totalAmount: true },
          _count: true,
        }),

        // Last month's invoices for growth calculation
        this.prisma.pharmacyInvoice.aggregate({
          where: {
            branchId,
            invoiceDate: { gte: lastMonthStart, lte: lastMonthEnd },
            paymentStatus: 'COMPLETED',
          },
          _sum: { totalAmount: true },
        }),

        // Total drugs count
        this.prisma.drug.count({
          where: { branchId, isActive: true },
        }),

        // Low stock drugs (assuming we'll add stock tracking later)
        this.prisma.drug.count({
          where: { branchId, isActive: true, isDiscontinued: false },
        }),

        // Expired drugs (assuming we'll add expiry tracking later)
        this.prisma.drug.count({
          where: { branchId, isDiscontinued: true },
        }),

        // Top selling drugs this month
        this.prisma.pharmacyInvoiceItem.groupBy({
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
        this.prisma.pharmacyInvoice.findMany({
          where: { branchId },
          include: {
            patient: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),

        // Low stock alerts (mock data for now)
        this.prisma.drug.findMany({
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
      const drugIds = topSellingDrugs.map(item => item.drugId);
      const drugDetails = await this.prisma.drug.findMany({
        where: { id: { in: drugIds } },
        select: {
          id: true,
          name: true,
          manufacturerName: true,
        },
      });

      const topSellingWithDetails = topSellingDrugs.map(item => {
        const drug = drugDetails.find(d => d.id === item.drugId);
        return {
          id: item.drugId,
          name: drug?.name || 'Unknown',
          quantity: item._sum.quantity || 0,
          revenue: item._sum.totalAmount || 0,
        };
      });

      // Calculate growth percentages
      const todayGrowth = this.calculateGrowthPercentage(
        todayInvoices._sum.totalAmount || 0,
        monthInvoices._sum.totalAmount || 0
      );

      const monthGrowth = this.calculateGrowthPercentage(
        monthInvoices._sum.totalAmount || 0,
        lastMonthInvoices._sum.totalAmount || 0
      );

      return {
        todaySales: todayInvoices._sum.totalAmount || 0,
        todayGrowth,
        monthSales: monthInvoices._sum.totalAmount || 0,
        monthGrowth,
        totalInvoices: monthInvoices._count,
        pendingInvoices: 0, // TODO: Calculate pending invoices
        completedInvoices: monthInvoices._count,
        totalDrugs,
        lowStockDrugs: Math.floor(totalDrugs * 0.02), // Mock 2% as low stock
        expiredDrugs: expiredDrugs,
        topSellingDrugs: topSellingWithDetails,
        recentInvoices: recentInvoices.map(invoice => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          patientName: invoice.patient.name,
          amount: invoice.totalAmount,
          status: invoice.status,
          createdAt: invoice.createdAt.toISOString(),
        })),
        lowStockAlerts: lowStockAlerts.map(drug => ({
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
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [todaySales, weekSales, monthSales] = await Promise.all([
        this.prisma.pharmacyInvoice.aggregate({
          where: {
            branchId,
            invoiceDate: { gte: todayStart },
            paymentStatus: 'COMPLETED',
          },
          _sum: { totalAmount: true },
          _count: true,
        }),

        this.prisma.pharmacyInvoice.aggregate({
          where: {
            branchId,
            invoiceDate: { gte: weekStart },
            paymentStatus: 'COMPLETED',
          },
          _sum: { totalAmount: true },
          _count: true,
        }),

        this.prisma.pharmacyInvoice.aggregate({
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
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

      const topSelling = await this.prisma.pharmacyInvoiceItem.groupBy({
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
      const drugIds = topSelling.map(item => item.drugId);
      const drugDetails = await this.prisma.drug.findMany({
        where: { id: { in: drugIds } },
        select: {
          id: true,
          name: true,
          manufacturerName: true,
          packSizeLabel: true,
        },
      });

      return topSelling.map(item => {
        const drug = drugDetails.find(d => d.id === item.drugId);
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
      const invoices = await this.prisma.pharmacyInvoice.findMany({
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

      return invoices.map(invoice => ({
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
      const drugs = await this.prisma.drug.findMany({
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

      const lowStockAlerts = drugs.slice(0, 4).map(drug => ({
        id: drug.id,
        name: drug.name,
        currentStock: Math.floor(Math.random() * 20) + 1,
        minStock: Math.floor(Math.random() * 50) + 20,
        manufacturerName: drug.manufacturerName,
      }));

      const expiredDrugs = drugs.slice(4, 6).map(drug => ({
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