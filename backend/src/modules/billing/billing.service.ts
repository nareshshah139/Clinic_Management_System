import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { 
  CreateInvoiceDto, 
  UpdateInvoiceDto, 
  PaymentDto, 
  RefundDto, 
  BulkPaymentDto,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
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
    const {
      patientId,
      visitId,
      appointmentId,
      items,
      discount = 0,
      discountReason,
      notes,
      dueDate,
      isRecurring = false,
      recurringFrequency,
      metadata,
    } = createInvoiceDto;

    // Validate patient exists and belongs to branch
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, branchId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found in this branch');
    }

    // Validate visit if provided
    if (visitId) {
      const visit = await this.prisma.visit.findFirst({
        where: { id: visitId, branchId },
      });
      if (!visit) {
        throw new NotFoundException('Visit not found in this branch');
      }
    }

    // Validate appointment if provided
    if (appointmentId) {
      const appointment = await this.prisma.appointment.findFirst({
        where: { id: appointmentId, branchId },
      });
      if (!appointment) {
        throw new NotFoundException('Appointment not found in this branch');
      }
    }

    // Validate items
    if (!items || items.length === 0) {
      throw new BadRequestException('At least one item is required');
    }

    // Calculate totals
    const calculations = this.calculateInvoiceTotals(items, discount);

    // Generate invoice number
    const invoiceNumber = await this.generateInvoiceNumber(branchId);

    // Create invoice
    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        patientId,
        visitId,
        appointmentId,
        items: JSON.stringify(items),
        subtotal: calculations.subtotal,
        discount: calculations.discount,
        discountReason,
        gstAmount: calculations.gstAmount,
        totalAmount: calculations.totalAmount,
        dueDate: dueDate ? new Date(dueDate) : null,
        status: InvoiceStatus.DRAFT,
        notes,
        isRecurring,
        recurringFrequency,
        metadata: metadata ? JSON.stringify(metadata) : null,
        branchId,
      },
      include: {
        patient: {
          select: { 
            id: true, 
            name: true, 
            phone: true, 
            email: true,
            address: true,
          },
        },
        visit: {
          select: { 
            id: true, 
            createdAt: true,
            doctor: {
              select: { id: true, name: true },
            },
          },
        },
        appointment: {
          select: { 
            id: true, 
            date: true, 
            slot: true,
            doctor: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    return invoice;
  }

  async findAllInvoices(query: QueryInvoicesDto, branchId: string) {
    const {
      patientId,
      visitId,
      appointmentId,
      status,
      startDate,
      endDate,
      dueDate,
      search,
      category,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: any = {
      branchId,
    };

    // Apply filters
    if (patientId) where.patientId = patientId;
    if (visitId) where.visitId = visitId;
    if (appointmentId) where.appointmentId = appointmentId;
    if (status) where.status = status;

    // Date filters
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (dueDate) {
      where.dueDate = new Date(dueDate);
    }

    // Search filter
    if (search) {
      where.OR = [
        {
          invoiceNumber: {
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
        {
          notes: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    // Category filter (search in items JSON)
    if (category) {
      where.items = {
        contains: category,
        mode: 'insensitive',
      };
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          patient: {
            select: { id: true, name: true, phone: true },
          },
          visit: {
            select: { 
              id: true, 
              createdAt: true,
              doctor: { select: { id: true, name: true } },
            },
          },
          appointment: {
            select: { 
              id: true, 
              date: true, 
              slot: true,
              doctor: { select: { id: true, name: true } },
            },
          },
          payments: {
            select: {
              id: true,
              amount: true,
              status: true,
              method: true,
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
      where: { id, branchId },
      include: {
        patient: {
          select: { 
            id: true, 
            name: true, 
            phone: true, 
            email: true,
            address: true,
            gender: true,
            dob: true,
          },
        },
        visit: {
          select: { 
            id: true, 
            createdAt: true,
            complaints: true,
            diagnosis: true,
            doctor: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        appointment: {
          select: { 
            id: true, 
            date: true, 
            slot: true,
            status: true,
            doctor: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        payments: {
          select: {
            id: true,
            amount: true,
            method: true,
            status: true,
            transactionId: true,
            reference: true,
            notes: true,
            createdAt: true,
            gatewayResponse: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        refunds: {
          select: {
            id: true,
            amount: true,
            reason: true,
            notes: true,
            createdAt: true,
            payment: {
              select: {
                id: true,
                transactionId: true,
                method: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Parse JSON fields
    const parsedInvoice = {
      ...invoice,
      items: JSON.parse(invoice.items as string),
      metadata: invoice.metadata ? JSON.parse(invoice.metadata as string) : null,
    };

    return parsedInvoice;
  }

  async updateInvoice(id: string, updateInvoiceDto: UpdateInvoiceDto, branchId: string) {
    const invoice = await this.findInvoiceById(id, branchId);

    // Check if invoice can be updated
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Cannot update paid invoice');
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot update cancelled invoice');
    }

    // Prepare update data
    const updateData: any = {};

    if (updateInvoiceDto.items) {
      const calculations = this.calculateInvoiceTotals(updateInvoiceDto.items, updateInvoiceDto.discount || 0);
      updateData.items = JSON.stringify(updateInvoiceDto.items);
      updateData.subtotal = calculations.subtotal;
      updateData.discount = calculations.discount;
      updateData.gstAmount = calculations.gstAmount;
      updateData.totalAmount = calculations.totalAmount;
    }

    if (updateInvoiceDto.discount !== undefined) {
      updateData.discount = updateInvoiceDto.discount;
    }

    if (updateInvoiceDto.discountReason !== undefined) {
      updateData.discountReason = updateInvoiceDto.discountReason;
    }

    if (updateInvoiceDto.notes !== undefined) {
      updateData.notes = updateInvoiceDto.notes;
    }

    if (updateInvoiceDto.dueDate !== undefined) {
      updateData.dueDate = updateInvoiceDto.dueDate ? new Date(updateInvoiceDto.dueDate) : null;
    }

    if (updateInvoiceDto.status !== undefined) {
      updateData.status = updateInvoiceDto.status;
    }

    if (updateInvoiceDto.metadata !== undefined) {
      updateData.metadata = updateInvoiceDto.metadata ? JSON.stringify(updateInvoiceDto.metadata) : null;
    }

    const updatedInvoice = await this.prisma.invoice.update({
      where: { id },
      data: updateData,
      include: {
        patient: {
          select: { id: true, name: true, phone: true },
        },
        visit: {
          select: { id: true, createdAt: true },
        },
        appointment: {
          select: { id: true, date: true, slot: true },
        },
      },
    });

    return updatedInvoice;
  }

  async cancelInvoice(id: string, branchId: string, reason?: string) {
    const invoice = await this.findInvoiceById(id, branchId);

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Cannot cancel paid invoice. Process refund instead.');
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Invoice is already cancelled');
    }

    const cancelledInvoice = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.CANCELLED,
        notes: reason ? `${invoice.notes || ''}\nCancelled: ${reason}`.trim() : invoice.notes,
      },
    });

    return cancelledInvoice;
  }

  async processPayment(paymentDto: PaymentDto, branchId: string) {
    const { invoiceId, amount, method, transactionId, reference, notes, gatewayResponse, paymentDate } = paymentDto;

    const invoice = await this.findInvoiceById(invoiceId, branchId);

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot process payment for cancelled invoice');
    }

    // Check if payment amount exceeds remaining balance
    const paidAmount = invoice.payments.reduce((sum, payment) => {
      return payment.status === PaymentStatus.COMPLETED ? sum + payment.amount : sum;
    }, 0);

    const remainingBalance = invoice.totalAmount - paidAmount;

    if (amount > remainingBalance) {
      throw new BadRequestException(`Payment amount (${amount}) exceeds remaining balance (${remainingBalance})`);
    }

    // Create payment
    const payment = await this.prisma.payment.create({
      data: {
        invoiceId,
        amount,
        method,
        transactionId,
        reference,
        notes,
        status: PaymentStatus.PENDING,
        gatewayResponse: gatewayResponse ? JSON.stringify(gatewayResponse) : null,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        branchId,
      },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            patient: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    // Update invoice status based on payment
    await this.updateInvoiceStatus(invoiceId);

    return payment;
  }

  async confirmPayment(paymentId: string, branchId: string, gatewayResponse?: Record<string, any>) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, branchId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      throw new BadRequestException('Payment is already confirmed');
    }

    const confirmedPayment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.COMPLETED,
        gatewayResponse: gatewayResponse ? JSON.stringify(gatewayResponse) : payment.gatewayResponse,
      },
    });

    // Update invoice status
    await this.updateInvoiceStatus(payment.invoiceId);

    return confirmedPayment;
  }

  async processRefund(refundDto: RefundDto, branchId: string) {
    const { paymentId, amount, reason, notes, gatewayResponse } = refundDto;

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, branchId },
      include: {
        invoice: {
          select: { id: true, invoiceNumber: true },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException('Can only refund completed payments');
    }

    if (amount > payment.amount) {
      throw new BadRequestException('Refund amount cannot exceed payment amount');
    }

    // Create refund
    const refund = await this.prisma.refund.create({
      data: {
        paymentId,
        amount,
        reason,
        notes,
        gatewayResponse: gatewayResponse ? JSON.stringify(gatewayResponse) : null,
        branchId,
      },
      include: {
        payment: {
          select: {
            id: true,
            amount: true,
            method: true,
            transactionId: true,
            invoice: {
              select: { id: true, invoiceNumber: true },
            },
          },
        },
      },
    });

    // Update invoice status
    await this.updateInvoiceStatus(payment.invoiceId);

    return refund;
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
      branchId,
    };

    // Apply filters
    if (invoiceId) where.invoiceId = invoiceId;
    if (method) where.method = method;
    if (status) where.status = status;

    // Date filters
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Search filter
    if (search) {
      where.OR = [
        {
          transactionId: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          reference: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          notes: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    // Patient filter
    if (patientId) {
      where.invoice = {
        patientId,
      };
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              totalAmount: true,
              patient: {
                select: { id: true, name: true, phone: true },
              },
            },
          },
        },
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      payments,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getPaymentSummary(query: PaymentSummaryDto, branchId: string) {
    const { startDate, endDate, method, patientId } = query;

    const where: any = {
      branchId,
      status: PaymentStatus.COMPLETED,
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (method) where.method = method;

    if (patientId) {
      where.invoice = { patientId };
    }

    const [
      totalAmount,
      paymentCount,
      methodBreakdown,
      dailyBreakdown,
    ] = await Promise.all([
      this.prisma.payment.aggregate({
        where,
        _sum: { amount: true },
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.groupBy({
        by: ['method'],
        where,
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.payment.groupBy({
        by: ['createdAt'],
        where,
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    return {
      totalAmount: totalAmount._sum.amount || 0,
      paymentCount,
      methodBreakdown: methodBreakdown.map(item => ({
        method: item.method,
        amount: item._sum.amount || 0,
        count: item._count.id,
      })),
      dailyBreakdown: dailyBreakdown.map(item => ({
        date: item.createdAt,
        amount: item._sum.amount || 0,
        count: item._count.id,
      })),
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
    };
  }

  async getRevenueReport(query: RevenueReportDto, branchId: string) {
    const { startDate, endDate, groupBy = 'day', doctorId, category } = query;

    const where: any = {
      branchId,
      status: PaymentStatus.COMPLETED,
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (doctorId) {
      where.invoice = {
        OR: [
          { visit: { doctorId } },
          { appointment: { doctorId } },
        ],
      };
    }

    if (category) {
      where.invoice = {
        items: {
          contains: category,
          mode: 'insensitive',
        },
      };
    }

    const payments = await this.prisma.payment.findMany({
      where,
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            items: true,
            visit: {
              select: {
                doctor: { select: { id: true, name: true } },
              },
            },
            appointment: {
              select: {
                doctor: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Group by specified period
    const groupedData = this.groupPaymentsByPeriod(payments, groupBy);

    return {
      report: groupedData,
      summary: {
        totalRevenue: payments.reduce((sum, payment) => sum + payment.amount, 0),
        totalTransactions: payments.length,
        averageTransactionValue: payments.length > 0 ? payments.reduce((sum, payment) => sum + payment.amount, 0) / payments.length : 0,
      },
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
        groupBy,
      },
    };
  }

  async getOutstandingInvoices(query: OutstandingInvoicesDto, branchId: string) {
    const { patientId, overdueAfter, limit = 50 } = query;

    const where: any = {
      branchId,
      status: {
        in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE],
      },
    };

    if (patientId) where.patientId = patientId;

    if (overdueAfter) {
      where.dueDate = {
        lt: new Date(overdueAfter),
      };
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        patient: {
          select: { id: true, name: true, phone: true },
        },
        payments: {
          select: {
            id: true,
            amount: true,
            status: true,
          },
        },
      },
      orderBy: {
        dueDate: 'asc',
      },
      take: limit,
    });

    // Calculate outstanding amounts
    const outstandingInvoices = invoices.map(invoice => {
      const paidAmount = invoice.payments.reduce((sum, payment) => {
        return payment.status === PaymentStatus.COMPLETED ? sum + payment.amount : sum;
      }, 0);
      const outstandingAmount = invoice.totalAmount - paidAmount;

      return {
        ...invoice,
        paidAmount,
        outstandingAmount,
        isOverdue: invoice.dueDate && invoice.dueDate < new Date(),
      };
    });

    return {
      invoices: outstandingInvoices,
      totalOutstanding: outstandingInvoices.reduce((sum, invoice) => sum + invoice.outstandingAmount, 0),
      overdueCount: outstandingInvoices.filter(invoice => invoice.isOverdue).length,
    };
  }

  // Private helper methods
  private calculateInvoiceTotals(items: any[], discount: number = 0) {
    const subtotal = items.reduce((sum, item) => {
      const itemTotal = item.quantity * item.unitPrice;
      const itemDiscount = (item.discount || 0) * itemTotal / 100;
      return sum + itemTotal - itemDiscount;
    }, 0);

    const discountAmount = (discount / 100) * subtotal;
    const discountedSubtotal = subtotal - discountAmount;

    const gstAmount = items.reduce((sum, item) => {
      const itemTotal = item.quantity * item.unitPrice;
      const itemDiscount = (item.discount || 0) * itemTotal / 100;
      const discountedItemTotal = itemTotal - itemDiscount;
      const gstRate = item.gstRate || 18;
      return sum + (discountedItemTotal * gstRate / 100);
    }, 0);

    const totalAmount = discountedSubtotal + gstAmount;

    return {
      subtotal,
      discount: discountAmount,
      gstAmount,
      totalAmount,
    };
  }

  private async generateInvoiceNumber(branchId: string): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const date = String(today.getDate()).padStart(2, '0');

    // Get the last invoice number for today
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: {
        branchId,
        createdAt: {
          gte: new Date(today.setHours(0, 0, 0, 0)),
          lte: new Date(today.setHours(23, 59, 59, 999)),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    let sequence = 1;
    if (lastInvoice) {
      const lastSequence = parseInt(lastInvoice.invoiceNumber.split('-').pop() || '0');
      sequence = lastSequence + 1;
    }

    return `INV-${year}${month}${date}-${String(sequence).padStart(3, '0')}`;
  }

  private async updateInvoiceStatus(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        payments: {
          select: {
            amount: true,
            status: true,
          },
        },
      },
    });

    if (!invoice) return;

    const paidAmount = invoice.payments.reduce((sum, payment) => {
      return payment.status === PaymentStatus.COMPLETED ? sum + payment.amount : sum;
    }, 0);

    let newStatus: InvoiceStatus;
    if (paidAmount === 0) {
      newStatus = InvoiceStatus.PENDING;
    } else if (paidAmount >= invoice.totalAmount) {
      newStatus = InvoiceStatus.PAID;
    } else {
      newStatus = InvoiceStatus.PARTIALLY_PAID;
    }

    // Check if overdue
    if (invoice.dueDate && invoice.dueDate < new Date() && newStatus !== InvoiceStatus.PAID) {
      newStatus = InvoiceStatus.OVERDUE;
    }

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: newStatus },
    });
  }

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
