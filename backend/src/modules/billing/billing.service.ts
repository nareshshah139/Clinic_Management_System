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
    try {
      console.log('🔧 BillingService.createInvoice called with:', {
        patientId: createInvoiceDto.patientId,
        itemsCount: createInvoiceDto.items?.length,
        branchId,
        discount: createInvoiceDto.discount
      });

      const { patientId, visitId, items, discount, discountReason, notes, dueDate, metadata, mode, gstin, hsn } = createInvoiceDto as any;

      if (!items || items.length === 0) {
        console.error('❌ No items provided for invoice');
        throw new BadRequestException('Invoice must have at least one item');
      }

      console.log('📋 Invoice items:', items);

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

    // Calculate totals with overall discount
    const { subtotal, discount: calculatedDiscount, gstAmount, totalAmount } = this.calculateInvoiceTotals(items, discount || 0);

    // Prepare services for items and build invoice items create payload
    const invoiceItemsData = [] as Array<{ 
      serviceId: string; 
      name: string;
      description?: string;
      qty: number; 
      unitPrice: number; 
      discount: number;
      gstRate: number; 
      total: number;
    }>;
    
    for (const it of items) {
      const qty: number = (it.qty ?? it.quantity ?? 1) as number;
      const unitPrice: number = Number(it.unitPrice ?? 0);
      const itemDiscount: number = Number(it.discount ?? 0);
      const gstRate: number = Number(it.gstRate ?? 0);
      const name: string = (it.name || it.description || 'Service') as string;
      const description: string = it.description || it.name || '';
      
      // Create a simple Service if not provided
      let serviceId: string = it.serviceId as string;
      if (!serviceId) {
        console.log('🔧 Creating new service:', { name, unitPrice, gstRate, branchId });
        try {
          const createdService = await this.prisma.service.create({
            data: {
              name,
              type: 'Consult',
              taxable: gstRate > 0,
              gstRate: gstRate,
              priceMrp: unitPrice,
              priceNet: unitPrice,
              branchId,
            },
          });
          serviceId = createdService.id;
          console.log('✅ Service created:', serviceId);
        } catch (serviceError) {
          console.error('❌ Failed to create service:', serviceError);
          throw new BadRequestException(`Failed to create service: ${serviceError.message}`);
        }
      }
      
      // Calculate item total with discount
      const baseTotal = qty * unitPrice;
      const itemDiscountAmount = (itemDiscount / 100) * baseTotal;
      const itemTotal = baseTotal - itemDiscountAmount;
      
      invoiceItemsData.push({
        serviceId,
        name,
        description,
        qty,
        unitPrice,
        discount: itemDiscount,
        gstRate,
        total: itemTotal,
      });
    }

    const data: any = {
      patientId,
      total: totalAmount,
      balance: totalAmount,
      invoiceNo: invoiceNumber,
      discount: discount || 0,
      discountReason: discountReason || null,
      notes: notes || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      items: { create: invoiceItemsData },
    };
    
    if (visitId) data.visitId = visitId;
    if (mode) data.mode = mode;
    if (gstin) data.gstin = gstin;
    if (hsn) data.hsn = hsn;

    console.log('🔧 Creating invoice with data:', {
      patientId: data.patientId,
      branchId: data.branchId,
      total: data.total,
      itemsCount: invoiceItemsData.length,
      invoiceNo: data.invoiceNo
    });

    console.log('📋 Invoice items data:', invoiceItemsData);

    const invoice = await this.prisma.newInvoice.create({
      data: {
        ...data,
        branchId, // Add branchId to the data
      },
      include: {
        patient: {
          select: { id: true, name: true, phone: true, email: true },
        },
        items: {
          include: {
            service: {
              select: { id: true, name: true, type: true }
            }
          }
        },
        payments: true,
      },
    });

    console.log('✅ Invoice created successfully in service:', invoice.id);
    return invoice;
    
    } catch (error) {
      console.error('❌ Error in BillingService.createInvoice:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      // Re-throw the error so it can be handled by the controller
      throw error;
    }
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
      branchId,
      ...(patientId && { patientId }),
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
      this.prisma.newInvoice.findMany({
        where,
        include: {
          patient: {
            select: { id: true, name: true, phone: true },
          },
          items: {
            select: {
              id: true,
              name: true,
              description: true,
              qty: true,
              unitPrice: true,
              discount: true,
              gstRate: true,
              total: true,
            },
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
      this.prisma.newInvoice.count({ where }),
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
    const invoice = await this.prisma.newInvoice.findFirst({
      where: {
        id,
        branchId,
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

    const updated = await this.prisma.newInvoice.update({
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
    const payment = await this.prisma.newPayment.create({
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
    await this.prisma.newInvoice.update({
      where: { id: invoiceId },
      data: { received: newReceived, balance: newBalance },
    });

    return payment;
  }

  async confirmPayment(paymentId: string, branchId: string, _gatewayResponse?: Record<string, any>) {
    const payment = await this.prisma.newPayment.findFirst({
      where: {
        id: paymentId,
        invoice: { branchId },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const confirmed = await this.prisma.newPayment.update({
      where: { id: paymentId },
      data: { reconStatus: 'COMPLETED' },
    });

    return confirmed;
  }

  async processRefund(refundDto: RefundDto, branchId: string) {
    const { paymentId, amount, reason, notes, gatewayResponse } = refundDto as any;

    // Fetch payment and validate branch via invoice → patient.branchId
    const payment = await this.prisma.newPayment.findFirst({
      where: {
        id: paymentId,
        invoice: { patient: { branchId } },
      },
      include: { invoice: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // In current schema, we use reconStatus to track completion
    if (payment.reconStatus !== 'COMPLETED') {
      throw new BadRequestException('Can only refund completed payments');
    }

    if (amount <= 0) {
      throw new BadRequestException('Refund amount must be greater than 0');
    }

    if (amount > payment.amount) {
      throw new BadRequestException('Refund amount exceeds original payment amount');
    }

    // Represent refund as a negative payment (cash refund)
    const refundPayment = await this.prisma.newPayment.create({
      data: {
        invoiceId: payment.invoiceId,
        amount: -amount,
        mode: payment.mode,
        reference: (notes ? `REFUND: ${notes}` : 'REFUND') as any,
        gateway: null,
        reconStatus: 'COMPLETED',
      },
      include: {
        invoice: { select: { id: true, invoiceNo: true, total: true } },
      },
    });

    // Update invoice received/balance (subtract refunded amount)
    const invoice = await this.prisma.newInvoice.findFirst({ where: { id: payment.invoiceId, branchId } });
    const newReceived = Math.max(0, (invoice?.received ?? 0) - amount);
    const newBalance = Math.max((invoice?.total ?? 0) - newReceived, 0);

    await this.prisma.newInvoice.update({
      where: { id: payment.invoiceId },
      data: { received: newReceived, balance: newBalance },
    });

    return refundPayment;
  }

  async processBulkPayment(bulkPaymentDto: BulkPaymentDto, branchId: string) {
    const { invoiceIds, totalAmount, method, transactionId, reference, notes } = bulkPaymentDto;

    // Verify all invoices exist and belong to the branch
    const invoices = await this.prisma.newInvoice.findMany({
      where: {
        id: { in: invoiceIds },
        branchId,
      },
      include: { payments: true },
    });

    if (invoices.length !== invoiceIds.length) {
      throw new NotFoundException('One or more invoices not found');
    }

    // Calculate total amount for all invoices based on current balance
    const calculatedTotal = invoices.reduce((sum, invoice) => {
      const balance = Math.max((invoice.total ?? 0) - (invoice.received ?? 0), 0);
      return sum + balance;
    }, 0);

    if (totalAmount !== calculatedTotal) {
      throw new BadRequestException(`Total amount mismatch. Expected: ${calculatedTotal}, Provided: ${totalAmount}`);
    }

    // Process payments for each invoice
    const payments = [] as any[];
    for (const invoice of invoices) {
      const remainingAmount = Math.max((invoice.total ?? 0) - (invoice.received ?? 0), 0);

      if (remainingAmount > 0) {
        const payment = await this.processPayment(
          {
            invoiceId: invoice.id,
            amount: remainingAmount,
            method,
            transactionId,
            reference,
            notes,
          } as any,
          branchId,
        );
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
              this.prisma.newPayment.findMany({
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
      this.prisma.newPayment.count({ where }),
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
      this.prisma.newPayment.aggregate({ where, _sum: { amount: true } }),
      this.prisma.newPayment.count({ where }),
      this.prisma.newPayment.groupBy({ by: ['mode'], where, _sum: { amount: true }, _count: { id: true } }),
      this.prisma.newPayment.groupBy({ by: ['createdAt'], where, _sum: { amount: true }, _count: { id: true } }),
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

    const payments = await this.prisma.newPayment.findMany({ where, orderBy: { createdAt: 'asc' } });

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
      branchId,
      ...(patientId && { patientId }),
      balance: { gt: 0 },
    };

    const invoices = await this.prisma.newInvoice.findMany({
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

    const lastInvoice = await this.prisma.newInvoice.findFirst({
      where: {
        branchId,
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

  // Helper to generate invoice number for a specific date (used for sample/backdated invoices)
  private async generateInvoiceNumberForDate(branchId: string, forDate: Date): Promise<string> {
    const year = forDate.getFullYear();
    const month = String(forDate.getMonth() + 1).padStart(2, '0');
    const date = String(forDate.getDate()).padStart(2, '0');

    const start = new Date(forDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(forDate);
    end.setHours(23, 59, 59, 999);

    const lastInvoice = await this.prisma.newInvoice.findFirst({
      where: {
        branchId,
        createdAt: { gte: start, lte: end },
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

  // Generate sample invoices for existing patients with dermatology offers/packages
  async generateSampleInvoices(
    options: { maxPatients?: number; perPatient?: number } = {},
    branchId: string,
  ) {
    const maxPatients = Math.max(1, Math.min(options.maxPatients ?? 5, 50));
    const perPatient = Math.max(1, Math.min(options.perPatient ?? 2, 5));

    // Fetch patients from this branch
    const patients = await this.prisma.patient.findMany({
      where: { branchId },
      take: maxPatients,
      orderBy: { createdAt: 'desc' },
    });

    if (patients.length === 0) {
      throw new NotFoundException('No patients found to generate invoices for');
    }

    // Dermatology offers / packages
    const offers: Array<{ name: string; type: string; unitPrice: number; gstRate: number }> = [
      { name: 'Dermatology Consultation', type: 'Consult', unitPrice: 500, gstRate: 0 },
      { name: 'Acne Treatment Package (4 sessions)', type: 'Package', unitPrice: 8000, gstRate: 18 },
      { name: 'Chemical Peel', type: 'Procedure', unitPrice: 2500, gstRate: 18 },
      { name: 'Laser Hair Removal - Underarms (1 session)', type: 'Aesthetic', unitPrice: 1500, gstRate: 18 },
      { name: 'PRP Therapy - Scalp', type: 'Procedure', unitPrice: 6000, gstRate: 18 },
      { name: 'Skin Glow Facial', type: 'Aesthetic', unitPrice: 2000, gstRate: 18 },
      { name: 'Wart Removal', type: 'Procedure', unitPrice: 3000, gstRate: 18 },
    ];

    // Ensure a Service exists per offer for this branch, reuse if present
    const serviceCache = new Map<string, string>();
    for (const offer of offers) {
      const existing = await this.prisma.service.findFirst({ where: { branchId, name: offer.name } });
      if (existing) {
        serviceCache.set(offer.name, existing.id);
      } else {
        const created = await this.prisma.service.create({
          data: {
            name: offer.name,
            type: offer.type,
            taxable: offer.gstRate > 0,
            gstRate: offer.gstRate,
            priceMrp: offer.unitPrice,
            priceNet: offer.unitPrice,
            branchId,
          },
        });
        serviceCache.set(offer.name, created.id);
      }
    }

    const createdInvoices: any[] = [];

    // Helper to pick random int in range
    const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

    for (const patient of patients) {
      const toCreate = randInt(1, perPatient);
      for (let i = 0; i < toCreate; i++) {
        // Random past date within last 120 days
        const daysAgo = randInt(5, 120);
        const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
        createdAt.setHours(randInt(9, 19), randInt(0, 59), randInt(0, 59), randInt(0, 999));

        // Select 1-2 random offers
        const itemsSample = Array.from({ length: randInt(1, 2) }).map(() => offers[randInt(0, offers.length - 1)]);
        const itemsForTotals = itemsSample.map((it) => ({ quantity: 1, unitPrice: it.unitPrice, gstRate: it.gstRate, discount: 0 }));
        const { totalAmount } = this.calculateInvoiceTotals(itemsForTotals);

        const invoiceNo = await this.generateInvoiceNumberForDate(branchId, createdAt);

        const invoiceItemsData = itemsSample.map((it) => ({
          serviceId: serviceCache.get(it.name)!,
          name: it.name,
          description: it.name,
          qty: 1,
          unitPrice: it.unitPrice,
          discount: 0,
          gstRate: it.gstRate,
          total: it.unitPrice,
        }));

        const invoice = await this.prisma.newInvoice.create({
          data: {
            patientId: patient.id,
            branchId,
            total: totalAmount,
            received: 0,
            balance: totalAmount,
            invoiceNo,
            createdAt,
            items: { create: invoiceItemsData },
          },
          include: {
            patient: { select: { id: true, name: true, phone: true } },
            items: true,
            payments: true,
          },
        });

        // Randomly add payment: 50% full, 30% partial, 20% none
        const paymentRoll = Math.random();
        if (paymentRoll < 0.5) {
          // Full payment
          const paymentDate = new Date(createdAt.getTime() + randInt(1, 7) * 24 * 60 * 60 * 1000);
          await this.prisma.newPayment.create({
            data: {
              invoiceId: invoice.id,
              amount: invoice.total,
              mode: PaymentMethod.CASH as any,
              reference: 'SAMPLE',
              createdAt: paymentDate,
              reconStatus: 'COMPLETED',
            },
          });
          await this.prisma.newInvoice.update({ where: { id: invoice.id }, data: { received: invoice.total, balance: 0 } });
        } else if (paymentRoll < 0.8) {
          // Partial payment 30-70%
          const part = Math.round(invoice.total * (randInt(30, 70) / 100));
          const paymentDate = new Date(createdAt.getTime() + randInt(1, 10) * 24 * 60 * 60 * 1000);
          await this.prisma.newPayment.create({
            data: {
              invoiceId: invoice.id,
              amount: part,
              mode: PaymentMethod.UPI as any,
              reference: 'SAMPLE',
              createdAt: paymentDate,
              reconStatus: 'COMPLETED',
            },
          });
          await this.prisma.newInvoice.update({ where: { id: invoice.id }, data: { received: part, balance: Math.max(invoice.total - part, 0) } });
        }

        createdInvoices.push(invoice);
      }
    }

    // Return a summary and created count
    return {
      createdCount: createdInvoices.length,
      patientsProcessed: patients.length,
      invoices: createdInvoices,
    };
  }
}
