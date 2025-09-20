import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { 
  CreatePharmacyInvoiceDto, 
  UpdatePharmacyInvoiceDto, 
  QueryPharmacyInvoiceDto,
  PharmacyPaymentDto 
} from './dto/pharmacy-invoice.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PharmacyInvoiceService {
  constructor(private prisma: PrismaService) {}

  async create(createInvoiceDto: CreatePharmacyInvoiceDto, branchId: string) {
    try {
      // Validate patient exists
      const patient = await this.prisma.patient.findFirst({
        where: { id: createInvoiceDto.patientId, branchId },
      });

      if (!patient) {
        throw new NotFoundException('Patient not found');
      }

      // Validate doctor if provided
      if (createInvoiceDto.doctorId) {
        const doctor = await this.prisma.user.findFirst({
          where: { id: createInvoiceDto.doctorId, branchId },
        });

        if (!doctor) {
          throw new NotFoundException('Doctor not found');
        }
      }

      // Validate drugs exist
      const drugIds = createInvoiceDto.items.map(item => item.drugId);
      const drugs = await this.prisma.drug.findMany({
        where: { id: { in: drugIds }, branchId, isActive: true },
      });

      if (drugs.length !== drugIds.length) {
        throw new BadRequestException('One or more drugs not found or inactive');
      }

      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber(branchId);

      // Calculate totals
      const { subtotal, totalDiscount, totalTax, grandTotal } = this.calculateInvoiceTotals(createInvoiceDto);

      return await this.prisma.$transaction(async (prisma) => {
        // Create invoice
        const invoice = await prisma.pharmacyInvoice.create({
          data: {
            invoiceNumber,
            patientId: createInvoiceDto.patientId,
            doctorId: createInvoiceDto.doctorId,
            prescriptionId: createInvoiceDto.prescriptionId,
            branchId,
            subtotal,
            discountAmount: totalDiscount,
            taxAmount: totalTax,
            totalAmount: grandTotal,
            paymentMethod: createInvoiceDto.paymentMethod,
            billingName: createInvoiceDto.billingName,
            billingPhone: createInvoiceDto.billingPhone,
            billingAddress: createInvoiceDto.billingAddress,
            billingCity: createInvoiceDto.billingCity,
            billingState: createInvoiceDto.billingState,
            billingPincode: createInvoiceDto.billingPincode,
            notes: createInvoiceDto.notes,
          },
          include: {
            patient: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
            doctor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        });

        // Create invoice items
        const invoiceItems = await Promise.all(
          createInvoiceDto.items.map(async (item) => {
            const drug = drugs.find(d => d.id === item.drugId)!;
            const discountAmount = (item.quantity * item.unitPrice * item.discountPercent) / 100;
            const discountedAmount = (item.quantity * item.unitPrice) - discountAmount;
            const taxAmount = (discountedAmount * item.taxPercent) / 100;
            const totalAmount = discountedAmount + taxAmount;

            return prisma.pharmacyInvoiceItem.create({
              data: {
                invoiceId: invoice.id,
                drugId: item.drugId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discountPercent: item.discountPercent,
                discountAmount,
                taxPercent: item.taxPercent,
                taxAmount,
                totalAmount,
                dosage: item.dosage,
                frequency: item.frequency,
                duration: item.duration,
                instructions: item.instructions,
              },
              include: {
                drug: {
                  select: {
                    id: true,
                    name: true,
                    manufacturerName: true,
                    packSizeLabel: true,
                  },
                },
              },
            });
          })
        );

        return {
          ...invoice,
          items: invoiceItems,
        };
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new Error(`Failed to create invoice: ${error.message}`);
    }
  }

  async findAll(query: QueryPharmacyInvoiceDto, branchId: string) {
    const {
      patientId,
      doctorId,
      status,
      paymentStatus,
      paymentMethod,
      search,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      page = 1,
      limit = 20,
      sortBy = 'invoiceDate',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.PharmacyInvoiceWhereInput = {
      branchId,
    };

    if (patientId) where.patientId = patientId;
    if (doctorId) where.doctorId = doctorId;
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (paymentMethod) where.paymentMethod = paymentMethod;

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { billingName: { contains: search, mode: 'insensitive' } },
        { billingPhone: { contains: search, mode: 'insensitive' } },
        { patient: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (startDate || endDate) {
      where.invoiceDate = {};
      if (startDate) where.invoiceDate.gte = new Date(startDate);
      if (endDate) where.invoiceDate.lte = new Date(endDate);
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      where.totalAmount = {};
      if (minAmount !== undefined) where.totalAmount.gte = minAmount;
      if (maxAmount !== undefined) where.totalAmount.lte = maxAmount;
    }

    // Build order clause
    const orderBy: Prisma.PharmacyInvoiceOrderByWithRelationInput = {};
    orderBy[sortBy] = sortOrder;

    try {
      const [invoices, total] = await Promise.all([
        this.prisma.pharmacyInvoice.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          include: {
            patient: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
            doctor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            items: {
              include: {
                drug: {
                  select: {
                    id: true,
                    name: true,
                    manufacturerName: true,
                    packSizeLabel: true,
                  },
                },
              },
            },
            _count: {
              select: {
                items: true,
                payments: true,
              },
            },
          },
        }),
        this.prisma.pharmacyInvoice.count({ where }),
      ]);

      return {
        data: invoices,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new Error(`Failed to fetch invoices: ${error.message}`);
    }
  }

  async findOne(id: string, branchId: string) {
    try {
      const invoice = await this.prisma.pharmacyInvoice.findFirst({
        where: { id, branchId },
        include: {
          patient: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              address: true,
              city: true,
              state: true,
              pincode: true,
            },
          },
          doctor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
            },
          },
          prescription: {
            select: {
              id: true,
              visitId: true,
            },
          },
          items: {
            include: {
              drug: {
                select: {
                  id: true,
                  name: true,
                  manufacturerName: true,
                  packSizeLabel: true,
                  composition1: true,
                  composition2: true,
                  strength: true,
                  dosageForm: true,
                },
              },
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
          payments: {
            orderBy: {
              createdAt: 'desc',
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
              address: true,
              phone: true,
              email: true,
            },
          },
        },
      });

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      return invoice;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to fetch invoice: ${error.message}`);
    }
  }

  async update(id: string, updateInvoiceDto: UpdatePharmacyInvoiceDto, branchId: string) {
    try {
      // Check if invoice exists
      const existingInvoice = await this.prisma.pharmacyInvoice.findFirst({
        where: { id, branchId },
        include: { items: true },
      });

      if (!existingInvoice) {
        throw new NotFoundException('Invoice not found');
      }

      // Only allow updates for DRAFT invoices
      if (existingInvoice.status !== 'DRAFT') {
        throw new BadRequestException('Only draft invoices can be updated');
      }

      return await this.prisma.$transaction(async (prisma) => {
        let updateData: any = { ...updateInvoiceDto };

        // If items are being updated, recalculate totals
        if (updateInvoiceDto.items) {
          const { subtotal, totalDiscount, totalTax, grandTotal } = this.calculateInvoiceTotals({
            ...updateInvoiceDto,
            items: updateInvoiceDto.items,
          } as any);

          updateData.subtotal = subtotal;
          updateData.discountAmount = totalDiscount;
          updateData.taxAmount = totalTax;
          updateData.totalAmount = grandTotal;

          // Delete existing items
          await prisma.pharmacyInvoiceItem.deleteMany({
            where: { invoiceId: id },
          });

          // Create new items
          await Promise.all(
            updateInvoiceDto.items.map(async (item) => {
              const discountAmount = (item.quantity * item.unitPrice * item.discountPercent) / 100;
              const discountedAmount = (item.quantity * item.unitPrice) - discountAmount;
              const taxAmount = (discountedAmount * item.taxPercent) / 100;
              const totalAmount = discountedAmount + taxAmount;

              return prisma.pharmacyInvoiceItem.create({
                data: {
                  invoiceId: id,
                  drugId: item.drugId,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  discountPercent: item.discountPercent,
                  discountAmount,
                  taxPercent: item.taxPercent,
                  taxAmount,
                  totalAmount,
                  dosage: item.dosage,
                  frequency: item.frequency,
                  duration: item.duration,
                  instructions: item.instructions,
                },
              });
            })
          );

          delete updateData.items;
        }

        const updatedInvoice = await prisma.pharmacyInvoice.update({
          where: { id },
          data: updateData,
          include: {
            patient: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
            doctor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            items: {
              include: {
                drug: {
                  select: {
                    id: true,
                    name: true,
                    manufacturerName: true,
                    packSizeLabel: true,
                  },
                },
              },
            },
          },
        });

        return updatedInvoice;
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new Error(`Failed to update invoice: ${error.message}`);
    }
  }

  async remove(id: string, branchId: string) {
    try {
      const existingInvoice = await this.prisma.pharmacyInvoice.findFirst({
        where: { id, branchId },
      });

      if (!existingInvoice) {
        throw new NotFoundException('Invoice not found');
      }

      // Only allow deletion of DRAFT invoices
      if (existingInvoice.status !== 'DRAFT') {
        throw new BadRequestException('Only draft invoices can be deleted');
      }

      await this.prisma.pharmacyInvoice.delete({
        where: { id },
      });

      return { message: 'Invoice deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new Error(`Failed to delete invoice: ${error.message}`);
    }
  }

  async addPayment(invoiceId: string, paymentDto: PharmacyPaymentDto, branchId: string) {
    try {
      const invoice = await this.prisma.pharmacyInvoice.findFirst({
        where: { id: invoiceId, branchId },
        include: { payments: true },
      });

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      const totalPaid = invoice.payments.reduce((sum, payment) => 
        payment.status === 'COMPLETED' ? sum + payment.amount : sum, 0
      );

      const remainingAmount = invoice.totalAmount - totalPaid;

      if (paymentDto.amount > remainingAmount) {
        throw new BadRequestException('Payment amount exceeds remaining balance');
      }

      const payment = await this.prisma.pharmacyPayment.create({
        data: {
          invoiceId,
          amount: paymentDto.amount,
          method: paymentDto.method,
          reference: paymentDto.reference,
          gateway: paymentDto.gateway,
          status: 'COMPLETED',
        },
      });

      // Update invoice payment status
      const newTotalPaid = totalPaid + paymentDto.amount;
      const newPaymentStatus = newTotalPaid >= invoice.totalAmount 
        ? 'COMPLETED' 
        : newTotalPaid > 0 
          ? 'PARTIALLY_PAID' 
          : 'PENDING';

      await this.prisma.pharmacyInvoice.update({
        where: { id: invoiceId },
        data: {
          paymentStatus: newPaymentStatus,
          paidAmount: newTotalPaid,
          balanceAmount: invoice.totalAmount - newTotalPaid,
        },
      });

      return payment;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new Error(`Failed to add payment: ${error.message}`);
    }
  }

  private calculateInvoiceTotals(invoiceDto: CreatePharmacyInvoiceDto) {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    for (const item of invoiceDto.items) {
      const itemSubtotal = item.quantity * item.unitPrice;
      const itemDiscount = (itemSubtotal * item.discountPercent) / 100;
      const discountedAmount = itemSubtotal - itemDiscount;
      const itemTax = (discountedAmount * item.taxPercent) / 100;

      subtotal += itemSubtotal;
      totalDiscount += itemDiscount;
      totalTax += itemTax;
    }

    const grandTotal = subtotal - totalDiscount + totalTax;

    return { subtotal, totalDiscount, totalTax, grandTotal };
  }

  private async generateInvoiceNumber(branchId: string): Promise<string> {
    const currentYear = new Date().getFullYear();
    const prefix = `PHI-${currentYear}`;

    // Get the latest invoice number for this year and branch
    const latestInvoice = await this.prisma.pharmacyInvoice.findFirst({
      where: {
        branchId,
        invoiceNumber: { startsWith: prefix },
      },
      orderBy: { createdAt: 'desc' },
    });

    let nextNumber = 1;
    if (latestInvoice) {
      const lastNumber = parseInt(latestInvoice.invoiceNumber.split('-').pop() || '0');
      nextNumber = lastNumber + 1;
    }

    return `${prefix}-${nextNumber.toString().padStart(3, '0')}`;
  }
} 