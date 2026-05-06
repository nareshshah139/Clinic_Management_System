import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  CreatePharmacyInvoiceDto,
  UpdatePharmacyInvoiceDto,
  QueryPharmacyInvoiceDto,
  QueryPharmacyInvoicePrintDto,
  PharmacyPaymentDto,
  PharmacyInvoiceItemDto,
} from './dto/pharmacy-invoice.dto';
import { Prisma } from '@prisma/client';
import { InvoiceNumbersService } from '../../shared/numbering/invoice-numbers.service';

type InvoiceItemType = 'DRUG' | 'PACKAGE';

type StockDeductionOp = {
  inventoryItemId: string;
  drugName: string;
  quantity: number;
  unitPrice: number;
  batchNumber?: string | null;
  expiryDate?: Date | null;
  notes: string;
};

type GstSlabSummary = {
  taxPercent: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  grossAmount: number;
};

@Injectable()
export class PharmacyInvoiceService {
  constructor(
    private prisma: PrismaService,
    private invoiceNumbers: InvoiceNumbersService,
  ) {}

  async create(
    createInvoiceDto: CreatePharmacyInvoiceDto,
    branchId: string,
    userId?: string,
  ) {
    this.validateInvoiceItemsInput(
      createInvoiceDto.items as unknown as PharmacyInvoiceItemDto[],
    );

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
        console.error(
          '❌ Patient not found:',
          createInvoiceDto.patientId,
          'in branch:',
          branchId,
        );
        throw new NotFoundException(
          `Patient not found: ${createInvoiceDto.patientId}`,
        );
      }

      // Validate doctor if provided
      if (createInvoiceDto.doctorId) {
        const doctor = await prismaAny.user.findFirst({
          where: { id: createInvoiceDto.doctorId, branchId },
        });

        if (!doctor) {
          console.error(
            '❌ Doctor not found:',
            createInvoiceDto.doctorId,
            'in branch:',
            branchId,
          );
          throw new NotFoundException(
            `Doctor not found: ${createInvoiceDto.doctorId}`,
          );
        }
        console.log('✅ Doctor found:', doctor.firstName, doctor.lastName);
      }

      // Validate prescription if provided
      if (createInvoiceDto.prescriptionId) {
        const prescription = await prismaAny.prescription.findFirst({
          where: { id: createInvoiceDto.prescriptionId },
          include: {
            visit: {
              include: {
                patient: {
                  select: {
                    id: true,
                    branchId: true,
                  },
                },
              },
            },
          },
        });
        if (!prescription) {
          throw new NotFoundException('Prescription not found');
        }
        if (
          prescription.visit?.patient?.branchId !== branchId ||
          prescription.visit?.patientId !== createInvoiceDto.patientId
        ) {
          throw new BadRequestException(
            'Prescription does not belong to the selected patient and branch',
          );
        }
        if (
          createInvoiceDto.doctorId &&
          prescription.visit?.doctorId !== createInvoiceDto.doctorId
        ) {
          throw new BadRequestException(
            'Prescription doctor does not match the selected doctor',
          );
        }
      }

      // Validate items and get drug/package information
      const drugIds = [
        ...new Set(
          createInvoiceDto.items
            .filter((item) => item.itemType === 'DRUG' || !item.itemType)
            .map((item) => item.drugId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      const packageIds = [
        ...new Set(
          createInvoiceDto.items
            .filter((item) => item.itemType === 'PACKAGE')
            .map((item) => item.packageId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      // Validate drugs
      let drugs = [];
      if (drugIds.length > 0) {
        drugs = await prismaAny.drug.findMany({
          where: { id: { in: drugIds }, branchId, isActive: true },
        });

        if (drugs.length !== drugIds.length) {
          const foundIds = drugs.map((d: any) => d.id);
          const missingIds = drugIds.filter((id) => !foundIds.includes(id));
          console.error('❌ Drugs not found or inactive:', missingIds);
          throw new BadRequestException(
            `Drugs not found or inactive: ${missingIds.join(', ')}`,
          );
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
                drug: true,
              },
            },
          },
        });

        if (packages.length !== packageIds.length) {
          throw new BadRequestException(
            'One or more packages not found or inactive',
          );
        }
      }

      // Validate that all PACKAGE items reference a loaded/active package
      this.validatePackageConsistency(
        createInvoiceDto.items as unknown as PharmacyInvoiceItemDto[],
        packages,
      );

      // Calculate totals
      const { subtotal, totalDiscount, totalTax, grandTotal } =
        this.calculateInvoiceTotals(createInvoiceDto, packages);

      // Retry-on-unique invoice number generation to avoid race collisions
      const MAX_ATTEMPTS = 5;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const invoiceNumber = await this.generateInvoiceNumber(branchId);
        try {
          return await prismaAny.$transaction(async (tx: any) => {
            // Precompute inventory mapping by drugId using relations
            const allDrugIds = new Set<string>();
            for (const item of createInvoiceDto.items) {
              if ((item.itemType === 'DRUG' || !item.itemType) && item.drugId)
                allDrugIds.add(item.drugId);
            }
            for (const pkg of packages as any[]) {
              for (const pkgItem of pkg.items) {
                if (pkgItem.drug?.id) allDrugIds.add(pkgItem.drug.id);
              }
            }
            const drugIdList = Array.from(allDrugIds);
            const inventoryItems =
              drugIdList.length > 0
                ? await tx.inventoryItem.findMany({
                    where: {
                      branchId,
                      drugs: { some: { id: { in: drugIdList } } },
                    },
                    include: { drugs: { select: { id: true } } },
                  })
                : [];
            const drugIdToInventory = new Map<string, any>();
            for (const inv of inventoryItems) {
              for (const d of inv.drugs) {
                if (!drugIdToInventory.has(d.id))
                  drugIdToInventory.set(d.id, inv);
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
                doctor: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            });

            // Create invoice items
            const invoiceItems = await Promise.all(
              createInvoiceDto.items.map(async (item) => {
                const resolvedUnitPrice = this.resolveUnitPrice(
                  item as unknown as PharmacyInvoiceItemDto,
                  packages,
                );
                const discountAmount =
                  (item.quantity *
                    resolvedUnitPrice *
                    (item.discountPercent || 0)) /
                  100;
                const discountedAmount =
                  item.quantity * resolvedUnitPrice - discountAmount;
                const taxAmount =
                  (discountedAmount * (item.taxPercent || 0)) / 100;
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
                    drug: item.drugId
                      ? {
                          select: {
                            id: true,
                            name: true,
                            manufacturerName: true,
                            packSizeLabel: true,
                          },
                        }
                      : undefined,
                    package: item.packageId
                      ? {
                          select: {
                            id: true,
                            name: true,
                            category: true,
                            subcategory: true,
                            packagePrice: true,
                            originalPrice: true,
                            discountPercent: true,
                          },
                        }
                      : undefined,
                  },
                });
              }),
            );

            // Do not apply stock mutations in create. Stock mutations are centralized in updateStatus with idempotency.

            return { ...invoice, items: invoiceItems };
          });
        } catch (e: any) {
          if (e?.code === 'P2002') {
            const t = e?.meta?.target;
            const hit = Array.isArray(t)
              ? t.join(',').includes('invoiceNumber')
              : typeof t === 'string'
                ? t.includes('invoiceNumber')
                : false;
            if (hit) {
              console.warn(
                `⚠️ Invoice number collision on attempt ${attempt}; retrying`,
              );
              if (attempt === MAX_ATTEMPTS)
                throw new InternalServerErrorException(
                  'Failed to generate unique invoice number after retries',
                );
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
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to create invoice: ${error.message}`,
      );
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

    const safePage = this.toPositiveInt(page, 1);
    const safeLimit = Math.min(this.toPositiveInt(limit, 20), 100);
    const skip = (safePage - 1) * safeLimit;

    if (
      minAmount !== undefined &&
      maxAmount !== undefined &&
      minAmount > maxAmount
    ) {
      throw new BadRequestException(
        'minAmount cannot be greater than maxAmount',
      );
    }

    const parsedStartDate = startDate
      ? this.parseQueryDate(startDate, 'startDate')
      : undefined;
    const parsedEndDate = endDate
      ? this.parseQueryDate(endDate, 'endDate')
      : undefined;
    if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
      throw new BadRequestException('startDate cannot be after endDate');
    }

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
      if (parsedStartDate) where.invoiceDate.gte = parsedStartDate;
      if (parsedEndDate) where.invoiceDate.lte = parsedEndDate;
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      where.totalAmount = {};
      if (minAmount !== undefined) where.totalAmount.gte = minAmount;
      if (maxAmount !== undefined) where.totalAmount.lte = maxAmount;
    }

    // Build order clause
    const orderBy: any = {};
    orderBy[this.normalizeInvoiceSortBy(sortBy)] =
      sortOrder === 'asc' ? 'asc' : 'desc';

    try {
      const [invoices, total] = await Promise.all([
        this.prisma.pharmacyInvoice.findMany({
          where,
          skip,
          take: safeLimit,
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
          page: safePage,
          limit: safeLimit,
          total,
          pages: Math.ceil(total / safeLimit),
        },
      };
    } catch (error) {
      console.error('❌ PharmacyInvoiceService.findAll error:', error);
      throw new InternalServerErrorException(
        `Failed to fetch invoices: ${error.message}`,
      );
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
      throw new InternalServerErrorException(
        `Failed to fetch invoice: ${error.message}`,
      );
    }
  }

  async getPrintData(
    id: string,
    branchId: string,
    query: QueryPharmacyInvoicePrintDto = {},
  ) {
    const format = query.format || 'A5';
    const copyType = query.copyType || 'ORIGINAL';
    if (!['A5', 'THERMAL_80MM'].includes(format)) {
      throw new BadRequestException(`Unsupported print format: ${format}`);
    }
    if (!['ORIGINAL', 'DUPLICATE'].includes(copyType)) {
      throw new BadRequestException(`Unsupported copy type: ${copyType}`);
    }

    try {
      const prismaAny = this.prisma as any;
      const invoice = await prismaAny.pharmacyInvoice.findFirst({
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
              metadata: true,
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
                  packagePrice: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          payments: {
            orderBy: { paymentDate: 'asc' },
          },
          branch: {
            select: {
              id: true,
              name: true,
              address: true,
              city: true,
              state: true,
              pincode: true,
              phone: true,
              email: true,
              gstNumber: true,
              licenseNumber: true,
            },
          },
        },
      });

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      const reference = `INV-${invoice.invoiceNumber}`;
      const stockTransactions = await prismaAny.stockTransaction.findMany({
        where: {
          branchId,
          reference,
          type: 'SALE',
        },
        orderBy: { createdAt: 'asc' },
        include: {
          item: {
            select: {
              id: true,
              name: true,
              mrp: true,
              hsnCode: true,
              batchNumber: true,
              expiryDate: true,
              drugs: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      });

      const lines = invoice.items.map((item: any, index: number) =>
        this.toPrintLineItem(item, index + 1, stockTransactions),
      );
      const gstSummary = this.buildGstSummary(lines);
      const paidAmount = this.money(
        invoice.payments
          .filter((payment: any) => payment.status === 'COMPLETED')
          .reduce((sum: number, payment: any) => sum + payment.amount, 0),
      );
      const totalAmount = this.money(invoice.totalAmount);
      const balanceAmount = this.money(totalAmount - paidAmount);

      return {
        format,
        copyType,
        generatedAt: new Date().toISOString(),
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          paymentStatus: invoice.paymentStatus,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          subtotal: this.money(invoice.subtotal),
          discountAmount: this.money(invoice.discountAmount),
          taxableAmount: this.money(invoice.subtotal - invoice.discountAmount),
          taxAmount: this.money(invoice.taxAmount),
          totalAmount,
          paidAmount,
          balanceAmount,
          amountInWords: this.amountInIndianRupees(totalAmount),
          notes: invoice.notes,
        },
        branch: {
          id: invoice.branch.id,
          name: invoice.branch.name,
          address: this.compactAddress(invoice.branch),
          phone: invoice.branch.phone,
          email: invoice.branch.email,
          gstNumber: invoice.branch.gstNumber,
          drugLicenseNumber: invoice.branch.licenseNumber,
        },
        patient: {
          id: invoice.patient.id,
          name: invoice.billingName || invoice.patient.name,
          phone: invoice.billingPhone || invoice.patient.phone,
          address:
            this.compactAddress({
              address: invoice.billingAddress || invoice.patient.address,
              city: invoice.billingCity || invoice.patient.city,
              state: invoice.billingState || invoice.patient.state,
              pincode: invoice.billingPincode || invoice.patient.pincode,
            }) || undefined,
        },
        doctor: invoice.doctor
          ? {
              id: invoice.doctor.id,
              name: this.formatDoctorName(invoice.doctor),
              registrationNumber: this.getDoctorRegistrationNumber(
                invoice.doctor,
              ),
              phone: invoice.doctor.phone,
              email: invoice.doctor.email,
            }
          : undefined,
        lines,
        gstSummary,
        payments: invoice.payments.map((payment: any) => ({
          id: payment.id,
          amount: this.money(payment.amount),
          method: payment.method,
          status: payment.status,
          reference: payment.reference,
          paymentDate: payment.paymentDate,
        })),
        stockAllocations: stockTransactions.map((transaction: any) => ({
          transactionId: transaction.id,
          inventoryItemId: transaction.itemId,
          itemName: transaction.item?.name,
          quantity: transaction.quantity,
          batchNumber: transaction.batchNumber || transaction.item?.batchNumber,
          expiryDate: transaction.expiryDate || transaction.item?.expiryDate,
          mrp: this.money(transaction.item?.mrp),
          hsnCode: transaction.item?.hsnCode,
        })),
        printProfiles: {
          A5: {
            pageSize: 'A5',
            orientation: 'portrait',
          },
          THERMAL_80MM: {
            width: '80mm',
            orientation: 'portrait',
          },
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('❌ PharmacyInvoiceService.getPrintData error:', error);
      throw new InternalServerErrorException(
        `Failed to build invoice print data: ${error.message}`,
      );
    }
  }

  async update(
    id: string,
    updateInvoiceDto: UpdatePharmacyInvoiceDto,
    branchId: string,
  ) {
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

      if (
        updateInvoiceDto.status &&
        updateInvoiceDto.status !== existingInvoice.status
      ) {
        throw new BadRequestException(
          'Use the invoice status endpoint to change invoice status',
        );
      }

      const prismaAny = this.prisma as any;
      const targetPatientId =
        updateInvoiceDto.patientId || existingInvoice.patientId;

      if (updateInvoiceDto.patientId) {
        const patient = await prismaAny.patient.findFirst({
          where: { id: updateInvoiceDto.patientId, branchId },
          select: { id: true },
        });
        if (!patient) {
          throw new NotFoundException(
            `Patient not found: ${updateInvoiceDto.patientId}`,
          );
        }
      }

      if (updateInvoiceDto.doctorId) {
        const doctor = await prismaAny.user.findFirst({
          where: { id: updateInvoiceDto.doctorId, branchId },
          select: { id: true },
        });
        if (!doctor) {
          throw new NotFoundException(
            `Doctor not found: ${updateInvoiceDto.doctorId}`,
          );
        }
      }

      if (updateInvoiceDto.prescriptionId) {
        const prescription = await prismaAny.prescription.findFirst({
          where: { id: updateInvoiceDto.prescriptionId },
          include: {
            visit: {
              include: {
                patient: {
                  select: {
                    id: true,
                    branchId: true,
                  },
                },
              },
            },
          },
        });
        if (!prescription) {
          throw new NotFoundException('Prescription not found');
        }
        if (
          prescription.visit?.patient?.branchId !== branchId ||
          prescription.visit?.patientId !== targetPatientId
        ) {
          throw new BadRequestException(
            'Prescription does not belong to the selected patient and branch',
          );
        }
        const targetDoctorId =
          updateInvoiceDto.doctorId || existingInvoice.doctorId;
        if (targetDoctorId && prescription.visit?.doctorId !== targetDoctorId) {
          throw new BadRequestException(
            'Prescription doctor does not match the selected doctor',
          );
        }
      }

      return await this.prisma.$transaction(async (prisma) => {
        let updateData: any = { ...updateInvoiceDto };

        // If items are being updated, recalculate totals
        if (updateInvoiceDto.items) {
          this.validateInvoiceItemsInput(
            updateInvoiceDto.items as unknown as PharmacyInvoiceItemDto[],
          );

          const drugIds = [
            ...new Set(
              updateInvoiceDto.items
                .filter((item) => item.itemType === 'DRUG' || !item.itemType)
                .map((item) => item.drugId)
                .filter((drugId): drugId is string => Boolean(drugId)),
            ),
          ];
          const packageIds = [
            ...new Set(
              updateInvoiceDto.items
                .filter((item) => item.itemType === 'PACKAGE')
                .map((item) => item.packageId)
                .filter((packageId): packageId is string => Boolean(packageId)),
            ),
          ];

          if (drugIds.length > 0) {
            const drugs = await prisma.drug.findMany({
              where: { id: { in: drugIds }, branchId, isActive: true },
              select: { id: true },
            });
            if (drugs.length !== drugIds.length) {
              const foundIds = new Set(drugs.map((drug: any) => drug.id));
              const missingIds = drugIds.filter(
                (drugId) => !foundIds.has(drugId),
              );
              throw new BadRequestException(
                `Drugs not found or inactive: ${missingIds.join(', ')}`,
              );
            }
          }

          const packages =
            packageIds.length > 0
              ? await prisma.pharmacyPackage.findMany({
                  where: { id: { in: packageIds }, branchId, isActive: true },
                  include: {
                    items: {
                      include: {
                        drug: true,
                      },
                    },
                  },
                })
              : [];

          if (packages.length !== packageIds.length) {
            const foundIds = new Set(packages.map((pkg: any) => pkg.id));
            const missingIds = packageIds.filter(
              (packageId) => !foundIds.has(packageId),
            );
            throw new BadRequestException(
              `Packages not found or inactive: ${missingIds.join(', ')}`,
            );
          }
          this.validatePackageConsistency(
            updateInvoiceDto.items as unknown as PharmacyInvoiceItemDto[],
            packages,
          );

          // For update flow, reuse our pure builder for consistency
          const builtItems = this.buildInvoiceItems(
            updateInvoiceDto.items as any,
            packages,
          );
          const recomputeTotals = builtItems.reduce(
            (acc, bi) => {
              const itemSubtotal = bi.quantity * bi.unitPrice;
              acc.subtotal += itemSubtotal;
              acc.totalDiscount += bi.discountAmount;
              acc.totalTax += bi.taxAmount;
              return acc;
            },
            { subtotal: 0, totalDiscount: 0, totalTax: 0 },
          );
          const grandTotal =
            recomputeTotals.subtotal -
            recomputeTotals.totalDiscount +
            recomputeTotals.totalTax;

          updateData.subtotal = recomputeTotals.subtotal;
          updateData.discountAmount = recomputeTotals.totalDiscount;
          updateData.taxAmount = recomputeTotals.totalTax;
          updateData.totalAmount = grandTotal;

          // Delete existing items
          await prisma.pharmacyInvoiceItem.deleteMany({
            where: { invoiceId: id },
          });

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
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('❌ PharmacyInvoiceService.update error:', error);
      throw new InternalServerErrorException(
        `Failed to update invoice: ${error.message}`,
      );
    }
  }

  async updateStatus(
    id: string,
    status: string,
    branchId: string,
    userId?: string,
  ) {
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
      const validStatuses = [
        'DRAFT',
        'PENDING',
        'CONFIRMED',
        'DISPENSED',
        'COMPLETED',
        'CANCELLED',
      ];
      if (!validStatuses.includes(status)) {
        throw new BadRequestException(`Invalid status: ${status}`);
      }

      const oldStatus = existingInvoice.status;
      this.assertInvoiceStatusTransition(oldStatus, status);

      // Use transaction to update status and create stock transactions
      return await this.prisma.$transaction(async (tx: any) => {
        const shouldApplyStock =
          oldStatus === 'DRAFT' &&
          ['CONFIRMED', 'COMPLETED', 'DISPENSED'].includes(status);

        if (shouldApplyStock && !userId) {
          throw new BadRequestException(
            'A user is required to confirm stock-deducting invoice statuses',
          );
        }

        const stockOps = shouldApplyStock
          ? await this.planConfirmedStockDeductions(
              tx,
              existingInvoice.items,
              branchId,
            )
          : [];

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

        // If transitioning FROM DRAFT TO CONFIRMED/COMPLETED/DISPENSED, create stock transactions (idempotent)
        if (shouldApplyStock && userId) {
          // Idempotency fence: bump mutationVersion and only execute mutations once per invoice
          const fresh = await tx.pharmacyInvoice.update({
            where: { id },
            data: { mutationVersion: { increment: 1 } },
            select: { mutationVersion: true, invoiceNumber: true },
          });
          if (fresh.mutationVersion > 1) {
            // Mutations already applied
            return updatedInvoice;
          }
          console.log(
            `✅ Creating stock transactions for invoice ${existingInvoice.invoiceNumber} (status: ${oldStatus} → ${status})`,
          );

          for (const op of stockOps) {
            await tx.stockTransaction.create({
              data: {
                itemId: op.inventoryItemId,
                type: 'SALE',
                quantity: op.quantity,
                unitPrice: op.unitPrice,
                totalAmount: op.unitPrice * op.quantity,
                reference: `INV-${existingInvoice.invoiceNumber}`,
                notes: op.notes,
                batchNumber: op.batchNumber || undefined,
                expiryDate: op.expiryDate || undefined,
                branchId,
                userId,
              },
            });
            await this.applyInventorySale(
              tx,
              op.inventoryItemId,
              op.quantity,
              branchId,
            );
          }
        }

        return updatedInvoice;
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      console.error('❌ PharmacyInvoiceService.updateStatus error:', error);
      throw new InternalServerErrorException(
        `Failed to update invoice status: ${error.message}`,
      );
    }
  }

  private validateInvoiceItemsInput(
    items: PharmacyInvoiceItemDto[] | undefined,
  ): void {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('At least one invoice item is required');
    }

    items.forEach((item, index) => {
      const label = `Invoice item ${index + 1}`;
      const itemType = this.normalizeInvoiceItemType(
        item.itemType as InvoiceItemType | undefined,
      );

      if (itemType === 'DRUG') {
        if (!item.drugId) {
          throw new BadRequestException(
            `${label}: drugId is required for DRUG items`,
          );
        }
        if (item.packageId) {
          throw new BadRequestException(
            `${label}: packageId is not allowed for DRUG items`,
          );
        }
      }

      if (itemType === 'PACKAGE') {
        if (!item.packageId) {
          throw new BadRequestException(
            `${label}: packageId is required for PACKAGE items`,
          );
        }
        if (item.drugId) {
          throw new BadRequestException(
            `${label}: drugId is not allowed for PACKAGE items`,
          );
        }
      }

      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new BadRequestException(
          `${label}: quantity must be a positive whole number`,
        );
      }

      if (
        item.unitPrice !== undefined &&
        item.unitPrice !== null &&
        !this.isFiniteNumberInRange(item.unitPrice, 0)
      ) {
        throw new BadRequestException(
          `${label}: unitPrice must be a non-negative number`,
        );
      }

      const discountPercent = item.discountPercent ?? 0;
      if (!this.isFiniteNumberInRange(discountPercent, 0, 100)) {
        throw new BadRequestException(
          `${label}: discountPercent must be between 0 and 100`,
        );
      }

      const taxPercent = item.taxPercent ?? 0;
      if (!this.isFiniteNumberInRange(taxPercent, 0, 100)) {
        throw new BadRequestException(
          `${label}: taxPercent must be between 0 and 100`,
        );
      }
    });
  }

  private toPrintLineItem(
    item: any,
    lineNumber: number,
    stockTransactions: any[],
  ) {
    const quantity = this.toPositiveInt(item.quantity, 0);
    const unitPrice = this.money(item.unitPrice);
    const grossAmount = this.money(quantity * unitPrice);
    const discountAmount = this.money(item.discountAmount);
    const taxableAmount = this.money(grossAmount - discountAmount);
    const taxPercent = this.money(item.taxPercent);
    const taxAmount = this.money(item.taxAmount);
    const totalAmount = this.money(item.totalAmount);
    const itemName =
      item.itemType === 'PACKAGE'
        ? item.package?.name
        : item.drug?.name || item.drug?.composition1;

    const matchingTransactions =
      item.itemType === 'DRUG' && item.drugId
        ? stockTransactions.filter((transaction: any) =>
            transaction.item?.drugs?.some((drug: any) => drug.id === item.drugId),
          )
        : [];

    const batchAllocations = matchingTransactions.map((transaction: any) => ({
      transactionId: transaction.id,
      inventoryItemId: transaction.itemId,
      quantity: transaction.quantity,
      batchNumber: transaction.batchNumber || transaction.item?.batchNumber,
      expiryDate: transaction.expiryDate || transaction.item?.expiryDate,
      mrp: this.money(transaction.item?.mrp),
      hsnCode: transaction.item?.hsnCode,
    }));

    return {
      lineNumber,
      itemType: item.itemType,
      drugId: item.drugId,
      packageId: item.packageId,
      name: itemName || 'Unnamed item',
      manufacturerName: item.drug?.manufacturerName,
      composition: [item.drug?.composition1, item.drug?.composition2]
        .filter(Boolean)
        .join(' + '),
      dosageForm: item.drug?.dosageForm,
      strength: item.drug?.strength,
      packSizeLabel: item.drug?.packSizeLabel,
      quantity,
      unitPrice,
      discountPercent: this.money(item.discountPercent),
      discountAmount,
      taxPercent,
      taxAmount,
      taxableAmount,
      grossAmount,
      totalAmount,
      dosage: item.dosage,
      frequency: item.frequency,
      duration: item.duration,
      instructions: item.instructions,
      batchAllocations,
      hsnCode: batchAllocations.find((batch: any) => batch.hsnCode)?.hsnCode,
      mrp: this.money(
        batchAllocations.find((batch: any) => batch.mrp > 0)?.mrp ?? unitPrice,
      ),
    };
  }

  private buildGstSummary(lines: any[]): GstSlabSummary[] {
    const slabs = new Map<number, GstSlabSummary>();

    for (const line of lines) {
      const taxPercent = this.money(line.taxPercent);
      const existing =
        slabs.get(taxPercent) ||
        ({
          taxPercent,
          taxableAmount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          totalTax: 0,
          grossAmount: 0,
        } satisfies GstSlabSummary);

      existing.taxableAmount = this.money(
        existing.taxableAmount + line.taxableAmount,
      );
      existing.totalTax = this.money(existing.totalTax + line.taxAmount);
      existing.cgst = this.money(existing.totalTax / 2);
      existing.sgst = this.money(existing.totalTax / 2);
      existing.igst = 0;
      existing.grossAmount = this.money(
        existing.taxableAmount + existing.totalTax,
      );
      slabs.set(taxPercent, existing);
    }

    return Array.from(slabs.values()).sort(
      (a, b) => a.taxPercent - b.taxPercent,
    );
  }

  private amountInIndianRupees(amount: number): string {
    const rounded = Math.round(this.money(amount));
    if (rounded === 0) return 'Zero rupees only';
    return `${this.numberToIndianWords(rounded)} rupees only`;
  }

  private numberToIndianWords(value: number): string {
    const ones = [
      '',
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      'nine',
      'ten',
      'eleven',
      'twelve',
      'thirteen',
      'fourteen',
      'fifteen',
      'sixteen',
      'seventeen',
      'eighteen',
      'nineteen',
    ];
    const tens = [
      '',
      '',
      'twenty',
      'thirty',
      'forty',
      'fifty',
      'sixty',
      'seventy',
      'eighty',
      'ninety',
    ];
    const belowThousand = (num: number): string => {
      const parts: string[] = [];
      if (num >= 100) {
        parts.push(`${ones[Math.floor(num / 100)]} hundred`);
        num %= 100;
      }
      if (num >= 20) {
        parts.push(tens[Math.floor(num / 10)]);
        num %= 10;
      }
      if (num > 0) {
        parts.push(ones[num]);
      }
      return parts.join(' ');
    };

    const groups = [
      { value: 10000000, label: 'crore' },
      { value: 100000, label: 'lakh' },
      { value: 1000, label: 'thousand' },
      { value: 1, label: '' },
    ];
    const parts: string[] = [];
    let remaining = value;

    for (const group of groups) {
      const count = Math.floor(remaining / group.value);
      if (count > 0) {
        const words = belowThousand(count);
        parts.push(group.label ? `${words} ${group.label}` : words);
        remaining %= group.value;
      }
    }

    return `${parts.join(' ').charAt(0).toUpperCase()}${parts
      .join(' ')
      .slice(1)}`;
  }

  private compactAddress(entity: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
  }): string {
    return [entity.address, entity.city, entity.state, entity.pincode]
      .map((part) => String(part ?? '').trim())
      .filter(Boolean)
      .join(', ');
  }

  private formatDoctorName(doctor: any): string {
    const name = [doctor.firstName, doctor.lastName]
      .map((part) => String(part ?? '').trim())
      .filter(Boolean)
      .join(' ');
    return name ? `Dr. ${name}` : 'Doctor';
  }

  private getDoctorRegistrationNumber(doctor: any): string | undefined {
    const metadata = this.parseMetadata(doctor.metadata);
    const value =
      metadata.registrationNumber ||
      metadata.medicalRegistrationNumber ||
      metadata.regNo ||
      metadata.doctorRegistrationNumber;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private parseMetadata(value?: string | null): Record<string, any> {
    if (!value) return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  private normalizeInvoiceItemType(
    itemType?: InvoiceItemType,
  ): InvoiceItemType {
    if (!itemType) return 'DRUG';
    if (itemType !== 'DRUG' && itemType !== 'PACKAGE') {
      throw new BadRequestException(`Invalid invoice item type: ${itemType}`);
    }
    return itemType;
  }

  private isFiniteNumberInRange(
    value: unknown,
    min: number,
    max = Number.POSITIVE_INFINITY,
  ): boolean {
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max
    );
  }

  private toPositiveInt(value: unknown, fallback: number): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return fallback;
    return parsed;
  }

  private money(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
  }

  private parseQueryDate(value: string, fieldName: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid date`);
    }
    return parsed;
  }

  private normalizeInvoiceSortBy(sortBy?: string): string {
    const allowed = new Set([
      'invoiceDate',
      'createdAt',
      'updatedAt',
      'totalAmount',
      'invoiceNumber',
      'status',
      'paymentStatus',
    ]);
    if (!sortBy) return 'invoiceDate';
    if (!allowed.has(sortBy)) {
      throw new BadRequestException(`Unsupported sortBy field: ${sortBy}`);
    }
    return sortBy;
  }

  private assertInvoiceStatusTransition(
    oldStatus: string,
    nextStatus: string,
  ): void {
    if (oldStatus === nextStatus) return;

    const allowedTransitions: Record<string, Set<string>> = {
      DRAFT: new Set([
        'PENDING',
        'CONFIRMED',
        'DISPENSED',
        'COMPLETED',
        'CANCELLED',
      ]),
      PENDING: new Set(['CONFIRMED', 'DISPENSED', 'COMPLETED', 'CANCELLED']),
      CONFIRMED: new Set(['DISPENSED', 'COMPLETED', 'CANCELLED']),
      DISPENSED: new Set(['COMPLETED']),
      COMPLETED: new Set(),
      CANCELLED: new Set(),
    };

    if (!allowedTransitions[oldStatus]?.has(nextStatus)) {
      throw new BadRequestException(
        `Invalid invoice status transition: ${oldStatus} to ${nextStatus}`,
      );
    }
  }

  private async planConfirmedStockDeductions(
    tx: any,
    invoiceItems: any[],
    branchId: string,
  ): Promise<StockDeductionOp[]> {
    const requirements = new Map<
      string,
      {
        drugId: string;
        drugName: string;
        quantity: number;
        fallbackUnitPrice: number;
        sourceNames: string[];
      }
    >();

    for (const item of invoiceItems) {
      const itemType = this.normalizeInvoiceItemType(
        item.itemType as InvoiceItemType | undefined,
      );
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new BadRequestException(
          'Invoice contains an item with an invalid quantity',
        );
      }

      if (itemType === 'DRUG') {
        if (!item.drugId || !item.drug) {
          throw new BadRequestException(
            'Invoice contains a drug item without an active drug',
          );
        }
        this.addStockRequirement(
          requirements,
          item.drugId,
          item.drug.name,
          item.quantity,
          item.unitPrice,
          item.drug.name,
        );
        continue;
      }

      if (!item.package?.items?.length) {
        throw new BadRequestException(
          'Invoice contains a package without package items',
        );
      }
      for (const packageItem of item.package.items) {
        if (!packageItem.drugId || !packageItem.drug) {
          throw new BadRequestException(
            `Package ${item.package.name} contains an inactive or missing drug`,
          );
        }
        const packageDrugQuantity = (packageItem.quantity || 1) * item.quantity;
        this.addStockRequirement(
          requirements,
          packageItem.drugId,
          packageItem.drug.name,
          packageDrugQuantity,
          packageItem.drug.price ?? item.unitPrice,
          `${item.package.name} - ${packageItem.drug.name}`,
        );
      }
    }

    const now = new Date();
    const stockOps: StockDeductionOp[] = [];

    for (const requirement of requirements.values()) {
      const batches = await tx.inventoryItem.findMany({
        where: {
          branchId,
          status: 'ACTIVE',
          drugs: {
            some: {
              id: requirement.drugId,
            },
          },
        },
        select: {
          id: true,
          name: true,
          currentStock: true,
          costPrice: true,
          sellingPrice: true,
          minStockLevel: true,
          reorderLevel: true,
          expiryDate: true,
          batchNumber: true,
          stockStatus: true,
        },
      });

      const eligibleBatches = batches
        .filter(
          (batch: any) =>
            batch.currentStock > 0 &&
            batch.stockStatus !== 'EXPIRED' &&
            !this.isExpired(batch.expiryDate, now),
        )
        .sort((a: any, b: any) => {
          const aExpiry = a.expiryDate
            ? new Date(a.expiryDate).getTime()
            : Number.MAX_SAFE_INTEGER;
          const bExpiry = b.expiryDate
            ? new Date(b.expiryDate).getTime()
            : Number.MAX_SAFE_INTEGER;
          if (aExpiry !== bExpiry) return aExpiry - bExpiry;
          return String(a.id).localeCompare(String(b.id));
        });

      const available = eligibleBatches.reduce(
        (sum: number, batch: any) => sum + batch.currentStock,
        0,
      );
      if (available < requirement.quantity) {
        throw new BadRequestException(
          `Insufficient non-expired stock for ${requirement.drugName}. Required ${requirement.quantity}, available ${available}.`,
        );
      }

      let remaining = requirement.quantity;
      for (const batch of eligibleBatches) {
        if (remaining <= 0) break;
        const quantity = Math.min(remaining, batch.currentStock);
        const unitPriceCandidate =
          batch.sellingPrice ??
          batch.costPrice ??
          requirement.fallbackUnitPrice;
        const unitPrice = Number.isFinite(Number(unitPriceCandidate))
          ? Number(unitPriceCandidate)
          : 0;
        stockOps.push({
          inventoryItemId: batch.id,
          drugName: requirement.drugName,
          quantity,
          unitPrice,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          notes: `Pharmacy invoice confirmed: ${requirement.sourceNames.join(', ')}`,
        });
        remaining -= quantity;
      }
    }

    return stockOps;
  }

  private addStockRequirement(
    requirements: Map<
      string,
      {
        drugId: string;
        drugName: string;
        quantity: number;
        fallbackUnitPrice: number;
        sourceNames: string[];
      }
    >,
    drugId: string,
    drugName: string,
    quantity: number,
    fallbackUnitPrice: number,
    sourceName: string,
  ): void {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException(`Invalid quantity for ${drugName}`);
    }

    const existing = requirements.get(drugId);
    const safeFallbackUnitPrice = Number.isFinite(Number(fallbackUnitPrice))
      ? Number(fallbackUnitPrice)
      : 0;
    if (existing) {
      existing.quantity += quantity;
      existing.fallbackUnitPrice =
        existing.fallbackUnitPrice || safeFallbackUnitPrice;
      existing.sourceNames.push(sourceName);
      return;
    }

    requirements.set(drugId, {
      drugId,
      drugName,
      quantity,
      fallbackUnitPrice: safeFallbackUnitPrice,
      sourceNames: [sourceName],
    });
  }

  private async applyInventorySale(
    tx: any,
    itemId: string,
    quantity: number,
    branchId: string,
  ): Promise<void> {
    const updated = await tx.inventoryItem.updateMany({
      where: {
        id: itemId,
        branchId,
        currentStock: {
          gte: quantity,
        },
      },
      data: {
        currentStock: {
          decrement: quantity,
        },
      },
    });

    if (updated.count !== 1) {
      throw new ConflictException(
        'Inventory changed while confirming the invoice. Refresh and retry.',
      );
    }

    const item = await tx.inventoryItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        currentStock: true,
        minStockLevel: true,
        reorderLevel: true,
        expiryDate: true,
      },
    });

    if (!item) {
      throw new ConflictException(
        'Inventory item disappeared while confirming the invoice',
      );
    }

    await tx.inventoryItem.update({
      where: { id: itemId },
      data: {
        stockStatus: this.deriveStockStatus(item),
      },
    });
  }

  private deriveStockStatus(item: {
    currentStock: number;
    minStockLevel?: number | null;
    reorderLevel?: number | null;
    expiryDate?: Date | null;
  }): string {
    if (this.isExpired(item.expiryDate)) return 'EXPIRED';
    if (item.currentStock <= 0) return 'OUT_OF_STOCK';
    const threshold = item.reorderLevel ?? item.minStockLevel;
    if (
      threshold !== null &&
      threshold !== undefined &&
      item.currentStock <= threshold
    ) {
      return 'LOW_STOCK';
    }
    return 'IN_STOCK';
  }

  private isExpired(
    expiryDate?: Date | string | null,
    now = new Date(),
  ): boolean {
    if (!expiryDate) return false;
    return new Date(expiryDate).getTime() < now.getTime();
  }

  // Helper method to update inventory stock
  private async updateInventoryStock(
    tx: any,
    itemId: string,
    quantity: number,
    type: 'SALE' | 'RETURN',
  ) {
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
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('❌ PharmacyInvoiceService.remove error:', error);
      throw new InternalServerErrorException(
        `Failed to delete invoice: ${error.message}`,
      );
    }
  }

  async addPayment(
    invoiceId: string,
    paymentDto: PharmacyPaymentDto,
    branchId: string,
  ) {
    try {
      const invoice = await this.prisma.pharmacyInvoice.findFirst({
        where: { id: invoiceId, branchId },
        include: { payments: true },
      });

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      const totalPaid = invoice.payments.reduce(
        (sum, payment) =>
          payment.status === 'COMPLETED' ? sum + payment.amount : sum,
        0,
      );

      const remainingAmount = invoice.totalAmount - totalPaid;

      if (paymentDto.amount > remainingAmount) {
        throw new BadRequestException(
          'Payment amount exceeds remaining balance',
        );
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
      const newPaymentStatus =
        newTotalPaid >= invoice.totalAmount
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
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('❌ PharmacyInvoiceService.addPayment error:', error);
      throw new InternalServerErrorException(
        `Failed to add payment: ${error.message}`,
      );
    }
  }

  private calculateInvoiceTotals(
    invoiceDto: CreatePharmacyInvoiceDto,
    packages: any[] = [],
  ) {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    for (const item of invoiceDto.items) {
      // For packages, use the package price if not overridden
      let unitPrice = item.unitPrice;
      if (item.itemType === 'PACKAGE' && item.packageId) {
        const package_ = packages.find((p) => p.id === item.packageId);
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
    const { sequence, periodKey } = await this.invoiceNumbers.reserve({
      type: 'PHARMACY',
      branchId,
    });
    const year = periodKey; // YYYY
    return `PHI-${year}-${String(sequence).padStart(3, '0')}`;
  }

  // ===== Extracted helpers (pure or side-effect free) =====
  private buildInvoiceItems(
    items: PharmacyInvoiceItemDto[],
    packages: any[],
  ): Array<{
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
  private resolveUnitPrice(
    item: PharmacyInvoiceItemDto,
    packages: any[],
  ): number {
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

  private validatePackageConsistency(
    items: PharmacyInvoiceItemDto[],
    packages: any[],
  ): void {
    const packageIdSet = new Set((packages as any[]).map((p: any) => p.id));
    for (const item of items) {
      if (item.itemType === 'PACKAGE') {
        if (!item.packageId || !packageIdSet.has(item.packageId)) {
          throw new BadRequestException(
            'One or more invoice items reference an invalid or inactive package',
          );
        }
      }
    }
  }

  private planStockMutations(
    builtItems: Array<{
      drugId?: string;
      packageId?: string;
      itemType: 'DRUG' | 'PACKAGE';
      quantity: number;
      unitPrice: number;
    }>,
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

    const result: Array<{
      inventoryItemName: string;
      quantity: number;
      unitPrice: number;
      reference: string;
      notes: string;
    }> = [];

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
        const pkg = (packages as any[]).find(
          (p: any) => p.id === item.packageId,
        );
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
    mutations: Array<{
      inventoryItemName: string;
      quantity: number;
      unitPrice: number;
      reference: string;
      notes: string;
    }>,
    branchId: string,
    userId: string,
  ): Promise<void> {
    for (const m of mutations) {
      if (!m.inventoryItemName) continue;
      const invItem = await tx.inventoryItem.findFirst({
        where: { branchId, name: m.inventoryItemName },
      });
      if (!invItem) continue;
      const invPrice = invItem.sellingPrice ?? invItem.costPrice;
      const price =
        Number.isFinite(invPrice) && invPrice !== null && invPrice !== undefined
          ? invPrice
          : Number.isFinite(m.unitPrice)
            ? m.unitPrice
            : 0;
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
