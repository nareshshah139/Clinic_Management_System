import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { 
  CreatePharmacyInvoiceDto, 
  UpdatePharmacyInvoiceDto, 
  QueryPharmacyInvoiceDto,
  PharmacyPaymentDto,
  PharmacyInvoiceItemDto 
} from './dto/pharmacy-invoice.dto';
import { Prisma } from '@prisma/client';
import { InvoiceNumbersService } from '../../shared/numbering/invoice-numbers.service';

@Injectable()
export class PharmacyInvoiceService {
  constructor(private prisma: PrismaService, private invoiceNumbers: InvoiceNumbersService) {}

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

      // Validate that all PACKAGE items reference a loaded/active package
      this.validatePackageConsistency(createInvoiceDto.items as unknown as PharmacyInvoiceItemDto[], packages);

      // Calculate totals
      const { subtotal, totalDiscount, totalTax, grandTotal } = this.calculateInvoiceTotals(createInvoiceDto, packages);

      // Retry-on-unique invoice number generation to avoid race collisions
      const MAX_ATTEMPTS = 5;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const invoiceNumber = await this.generateInvoiceNumber(branchId);
        try {
          return await prismaAny.$transaction(async (tx: any) => {
            // Precompute inventory mapping by drugId using relations
            const allDrugIds = new Set<string>();
            for (const item of createInvoiceDto.items) {
              if ((item.itemType === 'DRUG' || !item.itemType) && item.drugId) allDrugIds.add(item.drugId);
            }
            for (const pkg of packages as any[]) {
              for (const pkgItem of pkg.items) {
                if (pkgItem.drug?.id) allDrugIds.add(pkgItem.drug.id);
              }
            }
            const drugIdList = Array.from(allDrugIds);
            const inventoryItems = drugIdList.length > 0
              ? await tx.inventoryItem.findMany({
                  where: { branchId, drugs: { some: { id: { in: drugIdList } } } },
                  include: { drugs: { select: { id: true } } },
                })
              : [];
            const drugIdToInventory = new Map<string, any>();
            for (const inv of inventoryItems) {
              for (const d of inv.drugs) {
                if (!drugIdToInventory.has(d.id)) drugIdToInventory.set(d.id, inv);
              }
            }

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
                patient: { select: { id: true, name: true, phone: true } },
                doctor: { select: { id: true, firstName: true, lastName: true } },
              },
            });

            // Create invoice items
            const invoiceItems = await Promise.all(
              createInvoiceDto.items.map(async (item) => {
                const resolvedUnitPrice = this.resolveUnitPrice(item as unknown as PharmacyInvoiceItemDto, packages);
                const discountAmount = (item.quantity * resolvedUnitPrice * (item.discountPercent || 0)) / 100;
                const discountedAmount = (item.quantity * resolvedUnitPrice) - discountAmount;
                const taxAmount = (discountedAmount * (item.taxPercent || 0)) / 100;
                const totalAmount = discountedAmount + taxAmount;

                return tx.pharmacyInvoiceItem.create({
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
                    drug: item.drugId ? { select: { id: true, name: true, manufacturerName: true, packSizeLabel: true } } : undefined,
                    package: item.packageId ? { select: { id: true, name: true, category: true, subcategory: true, packagePrice: true, originalPrice: true, discountPercent: true } } : undefined,
                  },
                });
              })
            );

            // If confirming immediately, compute all stock ops first and then apply
            if (createInvoiceDto.status && ['CONFIRMED', 'COMPLETED', 'DISPENSED'].includes(createInvoiceDto.status) && userId) {
              type StockOp = { invItemId: string; qty: number; price: number; notes: string };
              const stockOps: StockOp[] = [];

              for (const item of invoiceItems) {
                if (item.itemType === 'DRUG' && item.drugId) {
                  const invItem = drugIdToInventory.get(item.drugId);
                  if (invItem) {
                    const invPrice = (invItem.sellingPrice ?? invItem.costPrice);
                    const price = Number.isFinite(invPrice) && invPrice !== null && invPrice !== undefined ? invPrice : (Number.isFinite(item.unitPrice) ? (item.unitPrice as any as number) : 0);
                    if (Number.isFinite(price) && price > 0) stockOps.push({ invItemId: invItem.id, qty: item.quantity, price, notes: 'Pharmacy invoice sale' });
                  }
                } else if (item.itemType === 'PACKAGE' && item.packageId) {
                  const pkg = (packages as any[]).find((p: any) => p.id === item.packageId);
                  if (pkg) {
                    for (const pkgItem of pkg.items) {
                      const dId = pkgItem.drug?.id;
                      if (!dId) continue;
                      const invItem = drugIdToInventory.get(dId);
                      if (!invItem) continue;
                      const totalQty = (pkgItem.quantity || 1) * item.quantity;
                      const invPrice = (invItem.sellingPrice ?? invItem.costPrice);
                      const price = Number.isFinite(invPrice) && invPrice !== null && invPrice !== undefined ? invPrice : (Number.isFinite(item.unitPrice) ? (item.unitPrice as any as number) : 0);
                      if (Number.isFinite(price) && price > 0) stockOps.push({ invItemId: invItem.id, qty: totalQty, price, notes: `Package sale: ${pkg.name}` });
                    }
                  }
                }
              }

              for (const op of stockOps) {
                await tx.stockTransaction.create({
                  data: {
                    itemId: op.invItemId,
                    type: 'SALE',
                    quantity: op.qty,
                    unitPrice: op.price,
                    totalAmount: op.price * op.qty,
                    reference: `INV-${invoice.invoiceNumber}`,
                    notes: op.notes,
                    branchId,
                    userId,
                  },
                });
                await this.updateInventoryStock(tx, op.invItemId, op.qty, 'SALE');
              }
            }

            return { ...invoice, items: invoiceItems };
          });
        } catch (e: any) {
          if (e?.code === 'P2002') {
            const t = e?.meta?.target;
            const hit = Array.isArray(t) ? t.join(',').includes('invoiceNumber') : (typeof t === 'string' ? t.includes('invoiceNumber') : false);
            if (hit) {
              console.warn(`⚠️ Invoice number collision on attempt ${attempt}; retrying`);
              if (attempt === MAX_ATTEMPTS) throw new InternalServerErrorException('Failed to generate unique invoice number after retries');
              continue;
            }
          }
          throw e;
        }
      }
      throw new InternalServerErrorException('Failed to create invoice');
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
          // For update flow, reuse our pure builder for consistency
          const builtItems = this.buildInvoiceItems(updateInvoiceDto.items as any, []);
          const recomputeTotals = builtItems.reduce((acc, bi) => {
            const itemSubtotal = bi.quantity * bi.unitPrice;
            acc.subtotal += itemSubtotal;
            acc.totalDiscount += bi.discountAmount;
            acc.totalTax += bi.taxAmount;
            return acc;
          }, { subtotal: 0, totalDiscount: 0, totalTax: 0 });
          const grandTotal = recomputeTotals.subtotal - recomputeTotals.totalDiscount + recomputeTotals.totalTax;

          updateData.subtotal = recomputeTotals.subtotal;
          updateData.discountAmount = recomputeTotals.totalDiscount;
          updateData.taxAmount = recomputeTotals.totalTax;
          updateData.totalAmount = grandTotal;

          // Delete existing items
          await prisma.pharmacyInvoiceItem.deleteMany({ where: { invoiceId: id } });

          // Create new items
          for (let idx = 0; idx < builtItems.length; idx++) {
            const bi = builtItems[idx];
            const original = updateInvoiceDto.items[idx] as any;
            await prisma.pharmacyInvoiceItem.create({
              data: {
                invoiceId: id,
                drugId: bi.drugId,
                packageId: bi.packageId,
                itemType: bi.itemType,
                quantity: bi.quantity,
                unitPrice: bi.unitPrice,
                discountPercent: bi.discountPercent,
                discountAmount: bi.discountAmount,
                taxPercent: bi.taxPercent,
                taxAmount: bi.taxAmount,
                totalAmount: bi.totalAmount,
                dosage: original.dosage,
                frequency: original.frequency,
                duration: original.duration,
                instructions: original.instructions,
              },
            });
          }

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

  async updateStatus(id: string, status: string, branchId: string, userId?: string) {
    try {
      const existingInvoice = await this.prisma.pharmacyInvoice.findFirst({
        where: { id, branchId },
        include: {
          items: {
            include: {
              drug: true,
              package: {
                include: {
                  items: {
                    include: {
                      drug: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!existingInvoice) {
        throw new NotFoundException('Invoice not found');
      }

      // Validate status transition
      const validStatuses = ['DRAFT', 'PENDING', 'CONFIRMED', 'DISPENSED', 'COMPLETED', 'CANCELLED'];
      if (!validStatuses.includes(status)) {
        throw new BadRequestException(`Invalid status: ${status}`);
      }

      const oldStatus = existingInvoice.status;

      // Use transaction to update status and create stock transactions
      return await this.prisma.$transaction(async (tx: any) => {
        const updatedInvoice = await tx.pharmacyInvoice.update({
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

        // If transitioning FROM DRAFT TO CONFIRMED/COMPLETED/DISPENSED, create stock transactions
        if (
          oldStatus === 'DRAFT' &&
          ['CONFIRMED', 'COMPLETED', 'DISPENSED'].includes(status) &&
          userId
        ) {
          console.log(`✅ Creating stock transactions for invoice ${existingInvoice.invoiceNumber} (status: ${oldStatus} → ${status})`);

          // Precompute inventory mapping by drugId
          const allDrugIds = new Set<string>();
          for (const item of existingInvoice.items) {
            if (item.itemType === 'DRUG' && item.drugId) {
              allDrugIds.add(item.drugId);
            } else if (item.itemType === 'PACKAGE' && item.packageId && item.package) {
              for (const pkgItem of item.package.items) {
                if (pkgItem.drug?.id) allDrugIds.add(pkgItem.drug.id);
              }
            }
          }

          const drugIdList = Array.from(allDrugIds);
          const inventoryItems = drugIdList.length > 0
            ? await tx.inventoryItem.findMany({
                where: { branchId, drugs: { some: { id: { in: drugIdList } } } },
                include: { drugs: { select: { id: true } } },
              })
            : [];
          const drugIdToInventory = new Map<string, any>();
          for (const inv of inventoryItems) {
            for (const d of inv.drugs) {
              if (!drugIdToInventory.has(d.id)) drugIdToInventory.set(d.id, inv);
            }
          }

          type StockOp = { invItemId: string; qty: number; price: number; notes: string };
          const stockOps: StockOp[] = [];

          for (const item of existingInvoice.items) {
            if (item.itemType === 'DRUG' && item.drugId && item.drug) {
              const invItem = drugIdToInventory.get(item.drugId);
              if (invItem) {
                const invPrice = invItem.sellingPrice ?? invItem.costPrice;
                const price = Number.isFinite(invPrice) && invPrice !== null && invPrice !== undefined
                  ? invPrice
                  : (Number.isFinite(item.unitPrice) ? item.unitPrice : 0);
                if (Number.isFinite(price) && price > 0) {
                  stockOps.push({
                    invItemId: invItem.id,
                    qty: item.quantity,
                    price,
                    notes: `Pharmacy invoice confirmed: ${item.drug.name}`,
                  });
                }
              }
            } else if (item.itemType === 'PACKAGE' && item.packageId && item.package) {
              for (const pkgItem of item.package.items) {
                const dId = pkgItem.drug?.id;
                if (!dId) continue;
                const invItem = drugIdToInventory.get(dId);
                if (!invItem) continue;
                const totalQty = (pkgItem.quantity || 1) * item.quantity;
                const invPrice = invItem.sellingPrice ?? invItem.costPrice;
                const price = Number.isFinite(invPrice) && invPrice !== null && invPrice !== undefined
                  ? invPrice
                  : (Number.isFinite(item.unitPrice) ? item.unitPrice : 0);
                if (Number.isFinite(price) && price > 0) {
                  stockOps.push({
                    invItemId: invItem.id,
                    qty: totalQty,
                    price,
                    notes: `Package confirmed: ${item.package.name} - ${pkgItem.drug?.name ?? ''}`,
                  });
                }
              }
            }
          }

          for (const op of stockOps) {
            await tx.stockTransaction.create({
              data: {
                itemId: op.invItemId,
                type: 'SALE',
                quantity: op.qty,
                unitPrice: op.price,
                totalAmount: op.price * op.qty,
                reference: `INV-${existingInvoice.invoiceNumber}`,
                notes: op.notes,
                branchId,
                userId,
              },
            });
            await this.updateInventoryStock(tx, op.invItemId, op.qty, 'SALE');
          }
        }

        return updatedInvoice;
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('❌ PharmacyInvoiceService.updateStatus error:', error);
      throw new InternalServerErrorException(`Failed to update invoice status: ${error.message}`);
    }
  }

  // Helper method to update inventory stock
  private async updateInventoryStock(tx: any, itemId: string, quantity: number, type: 'SALE' | 'RETURN') {
    const item = await tx.inventoryItem.findUnique({
      where: { id: itemId },
    });

    if (!item) return;

    let newStock = item.currentStock;

    if (type === 'SALE') {
      newStock -= quantity;
    } else if (type === 'RETURN') {
      newStock += quantity;
    }

    // Determine stock status
    let stockStatus = 'IN_STOCK';
    if (newStock <= 0) {
      stockStatus = 'OUT_OF_STOCK';
    } else if (item.reorderLevel && newStock <= item.reorderLevel) {
      stockStatus = 'LOW_STOCK';
    }

    // Check for expiry
    if (item.expiryDate && item.expiryDate < new Date()) {
      stockStatus = 'EXPIRED';
    }

    await tx.inventoryItem.update({
      where: { id: itemId },
      data: {
        currentStock: Math.max(0, newStock),
        stockStatus,
      },
    });
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
    const { sequence, periodKey } = await this.invoiceNumbers.reserve({ type: 'PHARMACY', branchId });
    const year = periodKey; // YYYY
    return `PHI-${year}-${String(sequence).padStart(3, '0')}`;
  }

  // ===== Extracted helpers (pure or side-effect free) =====
  private buildInvoiceItems(items: PharmacyInvoiceItemDto[], packages: any[]): Array<{
    drugId?: string;
    packageId?: string;
    itemType: 'DRUG' | 'PACKAGE';
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    discountAmount: number;
    taxPercent: number;
    taxAmount: number;
    totalAmount: number;
  }> {
    return items.map((item) => {
      const unitPrice = this.resolveUnitPrice(item, packages);
      const discountPercent = item.discountPercent || 0;
      const taxPercent = item.taxPercent || 0;
      const itemSubtotal = item.quantity * unitPrice;
      const discountAmount = (itemSubtotal * discountPercent) / 100;
      const discountedAmount = itemSubtotal - discountAmount;
      const taxAmount = (discountedAmount * taxPercent) / 100;
      const totalAmount = discountedAmount + taxAmount;
      return {
        drugId: item.drugId,
        packageId: item.packageId,
        itemType: (item.itemType as any) || 'DRUG',
        quantity: item.quantity,
        unitPrice,
        discountPercent,
        discountAmount,
        taxPercent,
        taxAmount,
        totalAmount,
      };
    });
  }
  private resolveUnitPrice(item: PharmacyInvoiceItemDto, packages: any[]): number {
    if (item.unitPrice !== undefined && item.unitPrice !== null) {
      return item.unitPrice;
    }
    if (item.itemType === 'PACKAGE' && item.packageId) {
      const pkg = (packages as any[]).find((p: any) => p.id === item.packageId);
      if (pkg && pkg.packagePrice !== undefined && pkg.packagePrice !== null) {
        return pkg.packagePrice;
      }
    }
    return 0;
  }

  private validatePackageConsistency(items: PharmacyInvoiceItemDto[], packages: any[]): void {
    const packageIdSet = new Set((packages as any[]).map((p: any) => p.id));
    for (const item of items) {
      if (item.itemType === 'PACKAGE') {
        if (!item.packageId || !packageIdSet.has(item.packageId)) {
          throw new BadRequestException('One or more invoice items reference an invalid or inactive package');
        }
      }
    }
  }

  private planStockMutations(
    builtItems: Array<{ drugId?: string; packageId?: string; itemType: 'DRUG' | 'PACKAGE'; quantity: number; unitPrice: number }>,
    drugs: any[],
    packages: any[],
    invoiceNumber: string,
  ): Array<{
    inventoryItemName: string;
    quantity: number;
    unitPrice: number;
    reference: string;
    notes: string;
  }> {
    const drugIdToDrug: Record<string, any> = {};
    for (const d of drugs) {
      drugIdToDrug[d.id] = d;
    }

    const result: Array<{ inventoryItemName: string; quantity: number; unitPrice: number; reference: string; notes: string }> = [];

    for (const item of builtItems) {
      if (item.itemType === 'DRUG' && item.drugId) {
        const drug = drugIdToDrug[item.drugId];
        if (drug) {
          result.push({
            inventoryItemName: drug.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            reference: `INV-${invoiceNumber}`,
            notes: 'Pharmacy invoice sale',
          });
        }
      } else if (item.itemType === 'PACKAGE' && item.packageId) {
        const pkg = (packages as any[]).find((p: any) => p.id === item.packageId);
        if (pkg && Array.isArray(pkg.items)) {
          for (const pkgItem of pkg.items) {
            const totalQty = (pkgItem.quantity || 1) * item.quantity;
            result.push({
              inventoryItemName: pkgItem.drug?.name,
              quantity: totalQty,
              unitPrice: item.unitPrice,
              reference: `INV-${invoiceNumber}`,
              notes: `Package sale: ${pkg.name}`,
            });
          }
        }
      }
    }

    return result;
  }

  private async applyStockMutations(
    tx: any,
    mutations: Array<{ inventoryItemName: string; quantity: number; unitPrice: number; reference: string; notes: string }>,
    branchId: string,
    userId: string,
  ): Promise<void> {
    for (const m of mutations) {
      if (!m.inventoryItemName) continue;
      const invItem = await tx.inventoryItem.findFirst({ where: { branchId, name: m.inventoryItemName } });
      if (!invItem) continue;
      const invPrice = invItem.sellingPrice ?? invItem.costPrice;
      const price = Number.isFinite(invPrice) && invPrice !== null && invPrice !== undefined
        ? invPrice
        : (Number.isFinite(m.unitPrice) ? m.unitPrice : 0);
      if (!(Number.isFinite(price) && price > 0)) continue;
      await tx.stockTransaction.create({
        data: {
          itemId: invItem.id,
          type: 'SALE',
          quantity: m.quantity,
          unitPrice: price,
          totalAmount: price * m.quantity,
          reference: m.reference,
          notes: m.notes,
          branchId,
          userId,
        },
      });
      await this.updateInventoryStock(tx, invItem.id, m.quantity, 'SALE');
    }
  }
} 