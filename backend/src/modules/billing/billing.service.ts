import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { 
  CreateInvoiceDto, 
  UpdateInvoiceDto, 
  PaymentDto, 
  RefundDto, 
  BulkPaymentDto,
  // InvoiceStatus,
  PaymentMethod,
  // PaymentStatus,
} from './dto/invoice.dto';
import { 
  QueryInvoicesDto, 
  QueryPaymentsDto, 
  PaymentSummaryDto, 
  RevenueReportDto,
  OutstandingInvoicesDto,
} from './dto/query-billing.dto';

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  async createInvoice(createInvoiceDto: CreateInvoiceDto, branchId: string) {
    const { patientId, visitId, items, mode, gstin, hsn, notes } = createInvoiceDto;

    // Verify patient exists and belongs to branch
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, branchId },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    // Verify visit exists and belongs to branch (if provided)
    if (visitId) {
      const visit = await this.prisma.visit.findFirst({
        where: { id: visitId, branchId },
      });

      if (!visit) {
        throw new NotFoundException('Visit not found');
      }
    }

    const invoiceNumber = await this.generateInvoiceNumber(branchId);

    // Calculate totals
    const { subtotal, discount, gstAmount, totalAmount } = this.calculateInvoiceTotals(items);

    const invoice = await this.prisma.invoice.create({
      data: {
        patientId,
        visitId,
        mode,
        total: totalAmount,
        balance: totalAmount,
        invoiceNo: invoiceNumber,
        gstin,
        hsn,
        // status: InvoiceStatus.DRAFT, // Commented out - field doesn't exist
        items: {
          create: items.map(item => ({
            serviceId: item.serviceId,
            qty: item.qty,
            unitPrice: item.unitPrice,
            gstRate: item.gstRate || 0,
            total: item.qty * item.unitPrice,
          })),
        },
      },
      include: {
        patient: {
          select: { id: true, name: true, phone: true },
        },
        items: true,
        payments: true,
      },
    });

    return invoice;
  }

  async findAllInvoices(query: QueryInvoicesDto, branchId: string) {
    const {
      patientId,
      visitId,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: any = {
      patient: {
        branchId,
        ...(patientId && { id: patientId }),
      },
    };

    // Apply filters (only fields that exist in schema)
    if (visitId) where.visitId = visitId;

    // Search filter (only in existing fields)
    if (search) {
      where.OR = [
        {
          invoiceNo: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          patient: {
            name: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
      ];
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          patient: {
            select: { id: true, name: true, phone: true },
          },
          payments: {
            select: {
              id: true,
              amount: true,
              mode: true,
              reconStatus: true,
              createdAt: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      invoices,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findInvoiceById(id: string, branchId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id,
        patient: { branchId },
      },
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        items: true,
        payments: {
          select: {
            id: true,
            amount: true,
            mode: true,
            reference: true,
            gateway: true,
            reconStatus: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  async updateInvoice(id: string, updateInvoiceDto: UpdateInvoiceDto, branchId: string) {
    const invoice = await this.findInvoiceById(id, branchId);

    const updateData: any = {};

    if (updateInvoiceDto.mode !== undefined) {
      updateData.mode = updateInvoiceDto.mode as any;
    }
    if (updateInvoiceDto.gstin !== undefined) {
      updateData.gstin = updateInvoiceDto.gstin;
    }
    if (updateInvoiceDto.hsn !== undefined) {
      updateData.hsn = updateInvoiceDto.hsn;
    }

    // If items supplied, replace existing items and recompute totals
    if (Array.isArray(updateInvoiceDto.items) && updateInvoiceDto.items.length > 0) {
      // Remove old items, then add new ones
      await this.prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });

      await this.prisma.invoiceItem.createMany({
        data: updateInvoiceDto.items.map((it: any) => ({
          invoiceId: id,
          serviceId: it.serviceId,
          qty: it.qty,
          unitPrice: it.unitPrice,
          gstRate: it.gstRate ?? 0,
          total: it.qty * it.unitPrice,
        })),
      });

      // Recompute totals
      const { totalAmount } = this.calculateInvoiceTotals(updateInvoiceDto.items);
      updateData.total = totalAmount;
      // Keep received as-is, recompute balance
      updateData.balance = Math.max(totalAmount - invoice.received, 0);
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: updateData,
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        items: true,
        payments: true,
      },
    });

    return updated;
  }

  async cancelInvoice(id: string, branchId: string, _reason?: string) {
    // Current schema has no status/cancel semantics; avoid destructive delete by returning a clear error
    throw new BadRequestException('Invoice cancellation is not supported in the current schema');
  }

  async processPayment(paymentDto: PaymentDto, branchId: string) {
    const { invoiceId, amount, method, reference, gateway } = paymentDto as any;

    const invoice = await this.findInvoiceById(invoiceId, branchId);

    // Create payment with supported fields
    const payment = await this.prisma.payment.create({
      data: {
        invoiceId,
        amount,
        mode: method as any,
        reference: reference ?? null,
        gateway: gateway ?? null,
      },
      include: {
        invoice: { select: { id: true, invoiceNo: true, total: true } },
      },
    });

    // Update invoice received/balance
    const newReceived = (invoice.received ?? 0) + amount;
    const newBalance = Math.max((invoice.total ?? 0) - newReceived, 0);
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { received: newReceived, balance: newBalance },
    });

    return payment;
  }

  async confirmPayment(paymentId: string, branchId: string, _gatewayResponse?: Record<string, any>) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        invoice: { patient: { branchId } },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const confirmed = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { reconStatus: 'COMPLETED' },
    });

    return confirmed;
  }

  async processRefund(_refundDto: RefundDto, _branchId: string) {
    throw new BadRequestException('Refunds are not supported in the current schema');
  }

  async processBulkPayment(bulkPaymentDto: BulkPaymentDto, branchId: string) {
    const { invoiceIds, totalAmount, method, transactionId, reference, notes } = bulkPaymentDto;

    // Verify all invoices exist and belong to the branch
    const invoices = await this.prisma.invoice.findMany({
      where: {
        id: { in: invoiceIds },
        branchId,
      },
    });

    if (invoices.length !== invoiceIds.length) {
      throw new NotFoundException('One or more invoices not found');
    }

    // Calculate total amount for all invoices
    const calculatedTotal = invoices.reduce((sum, invoice) => {
      const paidAmount = invoice.payments?.reduce((paidSum, payment) => {
        return payment.status === PaymentStatus.COMPLETED ? paidSum + payment.amount : paidSum;
      }, 0) || 0;
      return sum + (invoice.totalAmount - paidAmount);
    }, 0);

    if (totalAmount !== calculatedTotal) {
      throw new BadRequestException(`Total amount mismatch. Expected: ${calculatedTotal}, Provided: ${totalAmount}`);
    }

    // Process payments for each invoice
    const payments = [];
    for (const invoice of invoices) {
      const paidAmount = invoice.payments?.reduce((sum, payment) => {
        return payment.status === PaymentStatus.COMPLETED ? sum + payment.amount : sum;
      }, 0) || 0;
      const remainingAmount = invoice.totalAmount - paidAmount;

      if (remainingAmount > 0) {
        const payment = await this.processPayment({
          invoiceId: invoice.id,
          amount: remainingAmount,
          method,
          transactionId,
          reference,
          notes,
        }, branchId);
        payments.push(payment);
      }
    }

    return {
      payments,
      totalAmount,
      invoiceCount: invoices.length,
    };
  }

  async findAllPayments(query: QueryPaymentsDto, branchId: string) {
    const {
      invoiceId,
      patientId,
      method,
      status,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: any = {
      invoice: { patient: { branchId } },
    };

    if (invoiceId) where.invoiceId = invoiceId;
    if (method) where.mode = method;
    if (status) where.reconStatus = status;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { gateway: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (patientId) {
      where.invoice = { patientId };
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNo: true,
              total: true,
              patient: { select: { id: true, name: true, phone: true } },
            },
          },
        },
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      payments,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async getPaymentSummary(query: PaymentSummaryDto, branchId: string) {
    const { startDate, endDate, method, patientId } = query;

    const where: any = {
      invoice: { patient: { branchId } },
      reconStatus: 'COMPLETED',
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (method) where.mode = method;
    if (patientId) where.invoice = { patientId };

    const [sumAgg, count, methodBreakdown, dailyBreakdown] = await Promise.all([
      this.prisma.payment.aggregate({ where, _sum: { amount: true } }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.groupBy({ by: ['mode'], where, _sum: { amount: true }, _count: { id: true } }),
      this.prisma.payment.groupBy({ by: ['createdAt'], where, _sum: { amount: true }, _count: { id: true } }),
    ]);

    return {
      totalAmount: sumAgg._sum.amount ?? 0,
      paymentCount: count,
      methodBreakdown: methodBreakdown.map(m => ({ method: m.mode, amount: m._sum.amount ?? 0, count: m._count.id })),
      dailyBreakdown: dailyBreakdown.map(d => ({ date: d.createdAt, amount: d._sum.amount ?? 0, count: d._count.id })),
      period: { startDate: startDate || null, endDate: endDate || null },
    };
  }

  async getRevenueReport(query: RevenueReportDto, branchId: string) {
    const { startDate, endDate, groupBy = 'day' } = query as any;

    const where: any = {
      invoice: { patient: { branchId } },
      reconStatus: 'COMPLETED',
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const payments = await this.prisma.payment.findMany({ where, orderBy: { createdAt: 'asc' } });

    const grouped = this.groupPaymentsByPeriod(payments as any, groupBy);

    return {
      report: grouped,
      summary: {
        totalRevenue: payments.reduce((sum, p) => sum + p.amount, 0),
        totalTransactions: payments.length,
        averageTransactionValue: payments.length ? payments.reduce((s, p) => s + p.amount, 0) / payments.length : 0,
      },
      period: { startDate: startDate || null, endDate: endDate || null, groupBy },
    };
  }

  async getOutstandingInvoices(query: OutstandingInvoicesDto, branchId: string) {
    const { patientId, limit = 50 } = query;

    const where: any = {
      patient: { branchId, ...(patientId && { id: patientId }) },
      balance: { gt: 0 },
    };

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        payments: { select: { id: true, amount: true, mode: true, reconStatus: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    const result = invoices.map(inv => ({
      ...inv,
      paidAmount: inv.received ?? 0,
      outstandingAmount: Math.max((inv.total ?? 0) - (inv.received ?? 0), 0),
      isOverdue: false,
    }));

    return {
      invoices: result,
      totalOutstanding: result.reduce((sum, i) => sum + i.outstandingAmount, 0),
      overdueCount: 0,
    };
  }

  // Private helper methods
  private calculateInvoiceTotals(items: any[], discount: number = 0) {
    const subtotal = items.reduce((sum, item) => {
      const itemTotal = (item.qty ?? item.quantity) * item.unitPrice;
      const itemDiscount = (item.discount || 0) * itemTotal / 100;
      return sum + itemTotal - itemDiscount;
    }, 0);

    const discountAmount = (discount / 100) * subtotal;
    const discountedSubtotal = subtotal - discountAmount;

    const gstAmount = items.reduce((sum, item) => {
      const itemTotal = (item.qty ?? item.quantity) * item.unitPrice;
      const itemDiscount = (item.discount || 0) * itemTotal / 100;
      const discountedItemTotal = itemTotal - itemDiscount;
      const gstRate = item.gstRate || 18;
      return sum + (discountedItemTotal * gstRate / 100);
    }, 0);

    const totalAmount = discountedSubtotal + gstAmount;

    return { subtotal, discount: discountAmount, gstAmount, totalAmount };
  }

  private async generateInvoiceNumber(branchId: string): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const date = String(today.getDate()).padStart(2, '0');

    const lastInvoice = await this.prisma.invoice.findFirst({
      where: {
        patient: { branchId },
        createdAt: {
          gte: new Date(today.setHours(0, 0, 0, 0)),
          lte: new Date(today.setHours(23, 59, 59, 999)),
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let sequence = 1;
    if (lastInvoice?.invoiceNo) {
      const lastSequence = parseInt((lastInvoice.invoiceNo as any).split('-').pop() || '0');
      sequence = lastSequence + 1;
    }

    return `INV-${year}${month}${date}-${String(sequence).padStart(3, '0')}`;
  }

  // Removed updateInvoiceStatus since schema has no status; balances are updated in processPayment/updateInvoice

  private groupPaymentsByPeriod(payments: any[], groupBy: string) {
    const groups: Record<string, any> = {};

    payments.forEach(payment => {
      const date = new Date(payment.createdAt);
      let key: string;

      switch (groupBy) {
        case 'day':
          key = date.toISOString().split('T')[0];
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'year':
          key = String(date.getFullYear());
          break;
        default:
          key = date.toISOString().split('T')[0];
      }

      if (!groups[key]) {
        groups[key] = {
          period: key,
          revenue: 0,
          transactions: 0,
          averageValue: 0,
        };
      }

      groups[key].revenue += payment.amount;
      groups[key].transactions += 1;
    });

    // Calculate averages
    Object.values(groups).forEach((group: any) => {
      group.averageValue = group.transactions > 0 ? group.revenue / group.transactions : 0;
    });

    return Object.values(groups).sort((a: any, b: any) => a.period.localeCompare(b.period));
  }
}
