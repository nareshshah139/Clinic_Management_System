import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
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

  async create(createInvoiceDto: CreatePharmacyInvoiceDto, branchId: string, userId?: string) {
    console.log('🏥 PharmacyInvoiceService.create called with:', {
      patientId: createInvoiceDto.patientId,
      doctorId: createInvoiceDto.doctorId,
      prescriptionId: createInvoiceDto.prescriptionId,
      itemsCount: createInvoiceDto.items?.length,
      branchId,
      userId,
    });
    console.log('🔍 Full DTO:', JSON.stringify(createInvoiceDto, null, 2));
    
    try {
      const prismaAny = this.prisma as any;
      // Validate patient exists
      const patient = await prismaAny.patient.findFirst({
        where: { id: createInvoiceDto.patientId, branchId },
      });

      if (!patient) {
        console.error('❌ Patient not found:', createInvoiceDto.patientId, 'in branch:', branchId);
        throw new NotFoundException(`Patient not found: ${createInvoiceDto.patientId}`);
      }

      // Validate doctor if provided
      if (createInvoiceDto.doctorId) {
        const doctor = await prismaAny.user.findFirst({
          where: { id: createInvoiceDto.doctorId, branchId },
        });

        if (!doctor) {
          console.error('❌ Doctor not found:', createInvoiceDto.doctorId, 'in branch:', branchId);
          throw new NotFoundException(`Doctor not found: ${createInvoiceDto.doctorId}`);
        }
        console.log('✅ Doctor found:', doctor.firstName, doctor.lastName);
      }

      // Validate prescription if provided
      if (createInvoiceDto.prescriptionId) {
        const prescription = await prismaAny.prescription.findFirst({
          where: { id: createInvoiceDto.prescriptionId },
        });
        if (!prescription) {
          throw new NotFoundException('Prescription not found');
        }
      }

      // Validate items and get drug/package information
      const drugIds = createInvoiceDto.items
        .filter(item => item.itemType === 'DRUG' || !item.itemType)
        .map(item => item.drugId)
        .filter(id => id);
      
      const packageIds = createInvoiceDto.items
        .filter(item => item.itemType === 'PACKAGE')
        .map(item => item.packageId)
        .filter(id => id);

      // Validate drugs
      let drugs = [];
      if (drugIds.length > 0) {
        drugs = await prismaAny.drug.findMany({
          where: { id: { in: drugIds }, branchId, isActive: true },
        });

        if (drugs.length !== drugIds.length) {
          const foundIds = drugs.map((d: any) => d.id);
          const missingIds = drugIds.filter(id => !foundIds.includes(id));
          console.error('❌ Drugs not found or inactive:', missingIds);
          throw new BadRequestException(`Drugs not found or inactive: ${missingIds.join(', ')}`);
        }
        console.log('✅ All drugs validated:', drugs.length);
      }

      // Validate packages
      let packages = [];
      if (packageIds.length > 0) {
        packages = await prismaAny.pharmacyPackage.findMany({
          where: {
            id: { in: packageIds },
            branchId,
            isActive: true,
          },
          include: {
            items: {
              include: {
                drug: true
              }
            }
          }
        });

        if (packages.length !== packageIds.length) {
          throw new BadRequestException('One or more packages not found or inactive');
        }
      }

      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber(branchId);

      // Calculate totals
      const { subtotal, totalDiscount, totalTax, grandTotal } = this.calculateInvoiceTotals(createInvoiceDto, packages);

      return await prismaAny.$transaction(async (tx: any) => {
        // Create invoice
        const invoice = await tx.pharmacyInvoice.create({
          data: {
            invoiceNumber,
            patientId: createInvoiceDto.patientId,
            doctorId: createInvoiceDto.doctorId || undefined,
            prescriptionId: createInvoiceDto.prescriptionId || undefined,
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
            // Resolve unit price (fallback to package price for package items)
            let resolvedUnitPrice = item.unitPrice;
            if ((item.itemType === 'PACKAGE') && item.packageId && (resolvedUnitPrice === undefined || resolvedUnitPrice === null)) {
              const pkg = (packages as any[]).find((p: any) => p.id === item.packageId);
              if (pkg) {
                resolvedUnitPrice = pkg.packagePrice;
              }
            }

            const discountAmount = (item.quantity * resolvedUnitPrice * (item.discountPercent || 0)) / 100;
            const discountedAmount = (item.quantity * resolvedUnitPrice) - discountAmount;
            const taxAmount = (discountedAmount * (item.taxPercent || 0)) / 100;
            const totalAmount = discountedAmount + taxAmount;

            const createdItem = await tx.pharmacyInvoiceItem.create({
              data: {
                invoiceId: invoice.id,
                drugId: item.drugId,
                packageId: item.packageId,
                itemType: item.itemType || 'DRUG',
                quantity: item.quantity,
                unitPrice: resolvedUnitPrice,
                discountPercent: item.discountPercent || 0,
                discountAmount,
                taxPercent: item.taxPercent || 0,
                taxAmount,
                totalAmount,
                dosage: item.dosage,
                frequency: item.frequency,
                duration: item.duration,
                instructions: item.instructions,
              },
              include: {
                drug: item.drugId ? {
                  select: {
                    id: true,
                    name: true,
                    manufacturerName: true,
                    packSizeLabel: true,
                  },
                } : undefined,
                package: item.packageId ? {
                  select: {
                    id: true,
                    name: true,
                    category: true,
                    subcategory: true,
                    packagePrice: true,
                    originalPrice: true,
                    discountPercent: true,
                  },
                } : undefined,
              },
            });
            // Decrement inventory: for DRUG directly; for PACKAGE, decrement all package items proportionally
            if (createdItem.itemType === 'DRUG' && createdItem.drugId) {
              const drug = await tx.drug.findFirst({ where: { id: createdItem.drugId, branchId } });
              if (drug) {
                const invItem = await tx.inventoryItem.findFirst({ where: { branchId, name: drug.name } });
                if (invItem) {
                  const invPrice = (invItem.sellingPrice ?? invItem.costPrice);
                  const price = Number.isFinite(invPrice) && invPrice !== null && invPrice !== undefined
                    ? invPrice
                    : (Number.isFinite(createdItem.unitPrice) ? createdItem.unitPrice : 0);
                  if (Number.isFinite(price) && price > 0 && userId) {
                    await tx.stockTransaction.create({
                      data: {
                        itemId: invItem.id,
                        type: 'SALE',
                        quantity: createdItem.quantity,
                        unitPrice: price,
                        totalAmount: price * createdItem.quantity,
                        reference: `INV-${invoice.invoiceNumber}`,
                        notes: 'Pharmacy invoice sale',
                        branchId,
                        userId,
                      },
                    });
                  } else {
                    console.warn('⚠️ Skipping stock transaction for DRUG due to invalid price/userId', {
                      price,
                      hasUserId: Boolean(userId),
                      drugName: drug.name,
                    });
                  }
                }
              }
            } else if (createdItem.itemType === 'PACKAGE' && createdItem.packageId) {
              const pkg = (packages as any[]).find((p: any) => p.id === createdItem.packageId);
              if (pkg) {
                for (const pkgItem of pkg.items) {
                  const drug = pkgItem.drug;
                  const totalQty = (pkgItem.quantity || 1) * createdItem.quantity;
                  const invItem = await tx.inventoryItem.findFirst({ where: { branchId, name: drug.name } });
                  if (invItem) {
                    const invPrice = (invItem.sellingPrice ?? invItem.costPrice);
                    const price = Number.isFinite(invPrice) && invPrice !== null && invPrice !== undefined
                      ? invPrice
                      : (Number.isFinite(createdItem.unitPrice) ? createdItem.unitPrice : 0);
                    if (Number.isFinite(price) && price > 0 && userId) {
                      await tx.stockTransaction.create({
                        data: {
                          itemId: invItem.id,
                          type: 'SALE',
                          quantity: totalQty,
                          unitPrice: price,
                          totalAmount: price * totalQty,
                          reference: `INV-${invoice.invoiceNumber}`,
                          notes: `Package sale: ${pkg.name}`,
                          branchId,
                          userId,
                        },
                      });
                    } else {
                      console.warn('⚠️ Skipping stock transaction for PACKAGE item due to invalid price/userId', {
                        price,
                        hasUserId: Boolean(userId),
                        packageName: pkg.name,
                        drugName: drug.name,
                        totalQty,
                      });
                    }
                  }
                }
              }
            }

            return createdItem;
          })
        );

        return {
          ...invoice,
          items: invoiceItems,
        };
      });
    } catch (error) {
      console.error('❌ PharmacyInvoiceService.create error:', error);
      console.error('❌ Error stack:', error.stack);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to create invoice: ${error.message}`);
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
    const where: any = {
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
    const orderBy: any = {};
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
                package: {
                  select: {
                    id: true,
                    name: true,
                    category: true,
                    subcategory: true,
                    packagePrice: true,
                    originalPrice: true,
                    discountPercent: true,
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
      console.error('❌ PharmacyInvoiceService.findAll error:', error);
      throw new InternalServerErrorException(`Failed to fetch invoices: ${error.message}`);
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
                package: {
                  select: {
                    id: true,
                    name: true,
                    category: true,
                    subcategory: true,
                    packagePrice: true,
                    originalPrice: true,
                    discountPercent: true,
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
      console.error('❌ PharmacyInvoiceService.findOne error:', error);
      throw new InternalServerErrorException(`Failed to fetch invoice: ${error.message}`);
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
      console.error('❌ PharmacyInvoiceService.update error:', error);
      throw new InternalServerErrorException(`Failed to update invoice: ${error.message}`);
    }
  }

  async updateStatus(id: string, status: string, branchId: string) {
    try {
      const existingInvoice = await this.prisma.pharmacyInvoice.findFirst({
        where: { id, branchId },
      });

      if (!existingInvoice) {
        throw new NotFoundException('Invoice not found');
      }

      // Validate status transition
      const validStatuses = ['DRAFT', 'PENDING', 'CONFIRMED', 'DISPENSED', 'COMPLETED', 'CANCELLED'];
      if (!validStatuses.includes(status)) {
        throw new BadRequestException(`Invalid status: ${status}`);
      }

      const updatedInvoice = await this.prisma.pharmacyInvoice.update({
        where: { id },
        data: { status: status as any },
        include: {
          items: {
            include: {
              drug: true,
              package: true,
            },
          },
          patient: true,
          doctor: true,
        },
      });

      return updatedInvoice;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('❌ PharmacyInvoiceService.updateStatus error:', error);
      throw new InternalServerErrorException(`Failed to update invoice status: ${error.message}`);
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
      console.error('❌ PharmacyInvoiceService.remove error:', error);
      throw new InternalServerErrorException(`Failed to delete invoice: ${error.message}`);
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
      console.error('❌ PharmacyInvoiceService.addPayment error:', error);
      throw new InternalServerErrorException(`Failed to add payment: ${error.message}`);
    }
  }

  private calculateInvoiceTotals(invoiceDto: CreatePharmacyInvoiceDto, packages: any[] = []) {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    for (const item of invoiceDto.items) {
      // For packages, use the package price if not overridden
      let unitPrice = item.unitPrice;
      if (item.itemType === 'PACKAGE' && item.packageId) {
        const package_ = packages.find(p => p.id === item.packageId);
        if (package_ && !item.unitPrice) {
          unitPrice = package_.packagePrice;
        }
      }

      const itemSubtotal = item.quantity * unitPrice;
      const itemDiscount = (itemSubtotal * (item.discountPercent || 0)) / 100;
      const discountedAmount = itemSubtotal - itemDiscount;
      const itemTax = (discountedAmount * (item.taxPercent || 0)) / 100;

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