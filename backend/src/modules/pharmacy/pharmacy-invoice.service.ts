import { createHash } from 'node:crypto';
import { resolvePrescriptionInventory } from './pharmacy-stock-identity';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { RefundPharmacyBillDto, ReviseBillDiscountDto } from './dto/pharmacy-invoice.dto';
import { jsonObject, money } from '../inventory/inventory-stock';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  CheckoutPharmacyInvoiceDto,
  CreatePharmacyInvoiceDto,
  UpdatePharmacyInvoiceDto,
  QueryPharmacyInvoiceDto,
  QueryPharmacyInvoicePrintDto,
  PharmacyPaymentDto,
  PharmacyInvoiceItemDto,
} from './dto/pharmacy-invoice.dto';

import { PharmacyPaymentMethod, PharmacyPaymentStatus, Prisma } from '@prisma/client';
import { InvoiceNumbersService } from '../../shared/numbering/invoice-numbers.service';
import {
  BillDiscount,
  BillPrice,
  BillPricingError,
  PricedLine,
  priceBill,
} from './bill-pricing';
import { draftBillNumber, isIssuedBillNumber } from './bill-number';

type DraftFence = { checkoutRequestKey: string; checkoutPayloadHash: string };

const COLLECTED_AT_COUNTER = new Set<PharmacyPaymentMethod>([
  'CASH',
  'CARD',
  'UPI',
  'NETBANKING',
  'WALLET',
]);

const LEDGER_STATUSES: PharmacyPaymentStatus[] = ['COMPLETED', 'REFUNDED'];
const POSTED_STATUSES = ['CONFIRMED', 'DISPENSED', 'COMPLETED'];
const SETTLED_RETURN_STATUSES = ['CANCELLED', 'REJECTED', 'REVERSED'];

const settlement = (total: number, paid: number) => ({
  paidAmount: paid,
  balanceAmount: money(total - paid),
  paymentStatus:
    paid >= total
      ? ('COMPLETED' as const)
      : paid > 0
        ? ('PARTIALLY_PAID' as const)
        : ('PENDING' as const),
});

type InvoiceItemType = 'DRUG' | 'PACKAGE';

const lineMoney = (line: PricedLine) => ({
  discountAmount: line.lineDiscount,
  billDiscountAmount: line.billDiscount,
  taxAmount: line.tax,
  totalAmount: line.total,
});

const billTotals = (price: BillPrice, discount?: BillDiscount | null) => ({
  subtotal: price.subtotal,
  discountAmount: price.discount,
  billDiscountKind: discount?.value ? discount.kind : null,
  billDiscountValue: discount?.value ? discount.value : 0,
  billDiscountAmount: price.billDiscount,
  taxAmount: price.tax,
  totalAmount: price.total,
});

type StockDeductionOp = {
  inventoryItemId: string;
  drugName: string;
  quantity: number;
  unitPrice: number;
  batchNumber?: string | null;
  expiryDate?: Date | null;
  notes: string;
};

type SaleRequirement = {
  drugId: string;
  drugName: string;
  inventoryItemId?: string;
  quantity: number;
  fallbackUnitPrice: number;
  taxableAmount: number;
  taxAmount: number;
  sourceNames: string[];
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

  /**
   * @cc [owner:nareshshah139,label:product] draft-create-no-stock
   * Creating a draft MUST persist its items and outstanding balance atomically without stock movements.
   */
  async create(
    dto: CreatePharmacyInvoiceDto,
    branchId: string,
    userId?: string,
  ) {
    return this.prisma.$transaction((tx) =>
      this.createDraft(tx, dto, branchId, { createdById: userId }),
    );
  }

  /**
   * @cc [owner:nareshshah139,label:product] checkout-retry-atomic
   * A branch request key with the same payload MUST return the same posted invoice on retry.
   * Reusing the key with a changed payload MUST conflict without changing the original invoice.
   */
  /**
   * @cc [owner:nareshshah139,label:product] checkout-atomic-stock
   * Checkout MUST commit its invoice, items and validated stock deductions together, or leave
   * no invoice or stock movement. Batch eligibility MUST be checked within that serializable transaction.
   */
  async checkout(
    dto: CheckoutPharmacyInvoiceDto,
    branchId: string,
    userId: string,
  ) {
    this.assertRequestKey(dto.requestKey);
    if (dto.draftId) return this.finishDraft(dto, branchId, userId);
    const { requestKey, ...payload } = dto;
    const payloadHash = this.payloadHash(payload);
    return this.serializable(async (tx) => {
      const replay = await this.checkoutReplay(
        tx,
        branchId,
        requestKey,
        payloadHash,
      );
      if (replay) return replay;
      const invoice = await this.createDraft(tx, payload, branchId, {
        checkoutRequestKey: requestKey,
        checkoutPayloadHash: payloadHash,
        createdById: userId,
      });
      await this.transitionInvoice(
        tx,
        invoice.id,
        'CONFIRMED',
        branchId,
        userId,
      );
      return this.collectCheckoutPayment(tx, invoice.id, requestKey);
    });
  }

  /**
   * @cc [owner:nareshshah139,label:product] draft-finish-same-bill
   * Finishing a draft MUST save its edited lines and post that same invoice, issuing its bill number, in
   * one transaction, only from the draft's current version. A retry with the same request key and
   * payload MUST return that bill without posting stock again.
   */
  private async finishDraft(
    dto: CheckoutPharmacyInvoiceDto,
    branchId: string,
    userId: string,
  ) {
    const { requestKey, draftId, draftVersion, ...bill } = dto;
    if (draftVersion === undefined)
      throw new BadRequestException(
        'A draft version is required to finish a draft',
      );
    const payloadHash = this.payloadHash({ ...bill, draftId, draftVersion });
    return this.serializable(async (tx) => {
      const replay = await this.checkoutReplay(
        tx,
        branchId,
        requestKey,
        payloadHash,
      );
      if (replay) return replay;
      await this.writeDraft(
        tx,
        draftId!,
        { ...bill, expectedVersion: draftVersion },
        branchId,
        {
          checkoutRequestKey: requestKey,
          checkoutPayloadHash: payloadHash,
        },
      );
      await this.transitionInvoice(tx, draftId!, 'CONFIRMED', branchId, userId);
      return this.collectCheckoutPayment(tx, draftId!, requestKey);
    });
  }

  /**
   * @cc [owner:nareshshah139,label:product] checkout-collects-payment
   * A finished bill paid at the counter (cash, card, UPI, netbanking or wallet) MUST record one
   * completed payment of what its completed payments leave due, in the bill's payment method, within
   * the checkout transaction, so the ledger equals the total. An insurance bill MUST stay due. Paid,
   * balance and payment status MUST come from the ledger. A checkout replay MUST NOT collect again.
   */
  private async collectCheckoutPayment(
    tx: Prisma.TransactionClient,
    id: string,
    requestKey: string,
  ) {
    const invoice = await tx.pharmacyInvoice.findUniqueOrThrow({
      where: { id },
    });
    const total = money(invoice.totalAmount);
    const due = Math.max(0, money(total - (await this.paidOn(tx, id))));
    if (due > 0 && COLLECTED_AT_COUNTER.has(invoice.paymentMethod))
      await tx.pharmacyPayment.create({
        data: {
          invoiceId: id,
          requestKey: `checkout:${requestKey}`,
          amount: due,
          method: invoice.paymentMethod,
          status: 'COMPLETED',
        },
      });
    return tx.pharmacyInvoice.update({
      where: { id },
      data: {
        ...settlement(total, await this.paidOn(tx, id)),
        mutationVersion: { increment: 1 },
      },
      include: {
        items: { include: { drug: true, package: true } },
        patient: true,
        doctor: true,
      },
    });
  }

  private async paidOn(tx: Prisma.TransactionClient, invoiceId: string) {
    const paid = await tx.pharmacyPayment.aggregate({
      where: { invoiceId, status: { in: LEDGER_STATUSES } },
      _sum: { amount: true },
    });
    return money(paid._sum.amount || 0);
  }

  private async checkoutReplay(
    tx: Prisma.TransactionClient,
    branchId: string,
    requestKey: string,
    payloadHash: string,
  ) {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`pharmacy-checkout:${branchId}:${requestKey}`}, 0))`;
    const existing = await tx.pharmacyInvoice.findUnique({
      where: {
        branchId_checkoutRequestKey: {
          branchId,
          checkoutRequestKey: requestKey,
        },
      },
      include: {
        items: { include: { drug: true, package: true } },
        patient: true,
        doctor: true,
      },
    });
    if (existing && existing.checkoutPayloadHash !== payloadHash)
      throw new ConflictException(
        'Checkout request key was already used with different invoice details',
      );
    return existing;
  }

  private async serializable<T>(
    command: (tx: Prisma.TransactionClient) => Promise<T>,
    conflict = 'Invoice or stock changed concurrently. Retry this request with the same key.',
  ): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(command, {
          timeout: 15000,
          isolationLevel: 'Serializable',
        });
      } catch (error) {
        const duplicate =
          error?.code === 'P2002' &&
          /invoiceNumber|checkoutRequestKey/.test(String(error.meta?.target));
        if (!duplicate && !this.isSerializationFailure(error)) throw error;
      }
    }
    throw new ConflictException(conflict);
  }

  private async createDraft(
    tx: Prisma.TransactionClient,
    createInvoiceDto: CreatePharmacyInvoiceDto,
    branchId: string,
    operation: {
      checkoutRequestKey?: string;
      checkoutPayloadHash?: string;
      createdById?: string;
    } = {},
  ) {
    this.validateInvoiceItemsInput(createInvoiceDto.items);
    // Validate patient exists
    const patient = await tx.patient.findFirst({
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
      const doctor = await tx.user.findFirst({
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
    }

    if (createInvoiceDto.prescriptionId) {
      await this.requireEligiblePrescription(
        tx,
        {
          prescriptionId: createInvoiceDto.prescriptionId,
          patientId: createInvoiceDto.patientId,
          doctorId: createInvoiceDto.doctorId,
        },
        branchId,
      );
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
      drugs = await tx.drug.findMany({
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
    }

    // Validate packages
    let packages: Prisma.PharmacyPackageGetPayload<{
      include: { items: { include: { drug: true } } };
    }>[] = [];
    if (packageIds.length > 0) {
      packages = await tx.pharmacyPackage.findMany({
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

    const priced = this.priceItems(
      createInvoiceDto.items,
      packages,
      createInvoiceDto.billDiscount,
    );
    const invoice = await tx.pharmacyInvoice.create({
      data: {
        invoiceNumber: draftBillNumber(),
        ...operation,
        patientId: createInvoiceDto.patientId,
        doctorId: createInvoiceDto.doctorId || undefined,
        prescriptionId: createInvoiceDto.prescriptionId || undefined,
        branchId,
        ...priced.totals,
        balanceAmount: priced.totals.totalAmount,
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

    const invoiceItems: any[] = [];
    for (const [index, line] of priced.lines.entries()) {
      const item = createInvoiceDto.items[index];
      invoiceItems.push(
        await tx.pharmacyInvoiceItem.create({
          data: {
            invoiceId: invoice.id,
            ...line,
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
        }),
      );
    }

    return { ...invoice, items: invoiceItems };
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
                  description: true,
                  instructions: true,
                  category: true,
                  subcategory: true,
                  packagePrice: true,
                  originalPrice: true,
                  discountPercent: true,
                  items: {
                    select: {
                      id: true,
                      drugId: true,
                      quantity: true,
                      sequence: true,
                      drug: { select: { id: true, name: true } },
                    },
                  },
                },
              },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
          payments: {
            orderBy: {
              createdAt: 'desc',
            },
          },
          revisions: {
            orderBy: { createdAt: 'desc' },
            include: {
              revisedBy: { select: { id: true, firstName: true, lastName: true } },
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
      if (['DRAFT', 'PENDING'].includes(invoice.status))
        throw new ConflictException(
          'Finish this bill before printing it. A draft is not a tax invoice and has no bill number yet.',
        );

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
          .filter((payment: any) => LEDGER_STATUSES.includes(payment.status))
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
          lineDiscountAmount: this.money(
            invoice.discountAmount - invoice.billDiscountAmount,
          ),
          billDiscountKind: invoice.billDiscountKind,
          billDiscountValue: invoice.billDiscountValue,
          billDiscountAmount: this.money(invoice.billDiscountAmount),
          revisedAt: invoice.revisedAt,
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
      if (error instanceof HttpException) throw error;
      console.error('❌ PharmacyInvoiceService.getPrintData error:', error);
      throw new InternalServerErrorException(
        `Failed to build invoice print data: ${error.message}`,
      );
    }
  }

  /**
   * @cc [owner:nareshshah139,label:product] draft-edit-fence
   * Invoice edits MUST lock the invoice before reading its state and replacing items.
   * Posted invoices MUST reject edits, and so MUST an edit made from an older draft version;
   * a draft total MUST NOT fall below completed payments.
   */
  async update(
    id: string,
    updateInvoiceDto: UpdatePharmacyInvoiceDto,
    branchId: string,
  ) {
    try {
      return await this.prisma.$transaction((tx) =>
        this.writeDraft(tx, id, updateInvoiceDto, branchId),
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error('❌ PharmacyInvoiceService.update error:', error);
      throw new InternalServerErrorException(
        `Failed to update invoice: ${error.message}`,
      );
    }
  }

  private async writeDraft(
    prisma: Prisma.TransactionClient,
    id: string,
    { expectedVersion, billDiscount, ...updateInvoiceDto }: UpdatePharmacyInvoiceDto,
    branchId: string,
    fence?: DraftFence,
  ) {
    await this.lockInvoice(prisma, id, branchId);
    const existingInvoice = await prisma.pharmacyInvoice.findFirst({
      where: { id, branchId },
      include: { items: true },
    });

    if (!existingInvoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (
      existingInvoice.status !== 'DRAFT' ||
      existingInvoice.checkoutRequestKey
    ) {
      throw new ConflictException(
        'This bill was already finished. It can no longer be edited.',
      );
    }

    if (existingInvoice.mutationVersion !== expectedVersion) {
      throw new ConflictException(
        'This draft was changed after you opened it. Reload it to see the latest version.',
      );
    }

    if (
      updateInvoiceDto.status &&
      updateInvoiceDto.status !== existingInvoice.status
    ) {
      throw new BadRequestException(
        'Use the invoice status endpoint to change invoice status',
      );
    }

    if (updateInvoiceDto.paymentStatus !== undefined) {
      throw new BadRequestException(
        'Payment status is determined by recorded payments',
      );
    }
    const targetPatientId =
      updateInvoiceDto.patientId || existingInvoice.patientId;

    if (updateInvoiceDto.patientId) {
      const patient = await prisma.patient.findFirst({
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
      const doctor = await prisma.user.findFirst({
        where: { id: updateInvoiceDto.doctorId, branchId },
        select: { id: true },
      });
      if (!doctor) {
        throw new NotFoundException(
          `Doctor not found: ${updateInvoiceDto.doctorId}`,
        );
      }
    }

    const targetPrescriptionId =
      updateInvoiceDto.prescriptionId === undefined
        ? existingInvoice.prescriptionId
        : updateInvoiceDto.prescriptionId;
    if (targetPrescriptionId) {
      await this.requireEligiblePrescription(
        prisma,
        {
          prescriptionId: targetPrescriptionId,
          patientId: targetPatientId,
          doctorId:
            updateInvoiceDto.doctorId === undefined
              ? existingInvoice.doctorId
              : updateInvoiceDto.doctorId,
        },
        branchId,
      );
    }

    let updateData: any = {
      ...updateInvoiceDto,
      ...(updateInvoiceDto.doctorId === undefined
        ? {}
        : { doctorId: updateInvoiceDto.doctorId || null }),
      ...(updateInvoiceDto.prescriptionId === undefined
        ? {}
        : { prescriptionId: updateInvoiceDto.prescriptionId || null }),
      ...fence,
      mutationVersion: { increment: 1 },
    };

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
          const missingIds = drugIds.filter((drugId) => !foundIds.has(drugId));
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

      const priced = this.priceItems(
        updateInvoiceDto.items as unknown as PharmacyInvoiceItemDto[],
        packages,
        billDiscount === undefined
          ? this.storedBillDiscount(existingInvoice)
          : billDiscount,
      );
      const paidAmount = await this.paidOn(prisma, id);
      if (priced.totals.totalAmount < paidAmount)
        throw new BadRequestException(
          'Invoice total cannot be lower than payments already received',
        );
      Object.assign(
        updateData,
        priced.totals,
        settlement(priced.totals.totalAmount, paidAmount),
      );

      await prisma.pharmacyInvoiceItem.deleteMany({
        where: { invoiceId: id },
      });
      for (const [index, line] of priced.lines.entries()) {
        const original = updateInvoiceDto.items[index] as any;
        await prisma.pharmacyInvoiceItem.create({
          data: {
            invoiceId: id,
            ...line,
            dosage: original.dosage,
            frequency: original.frequency,
            duration: original.duration,
            instructions: original.instructions,
          },
        });
      }

      delete updateData.items;
    } else if (billDiscount !== undefined) {
      const { totals } = await this.repriceStoredItems(
        prisma,
        id,
        new Map(),
        billDiscount,
      );
      const paidAmount = await this.paidOn(prisma, id);
      if (totals.totalAmount < paidAmount)
        throw new BadRequestException(
          'Invoice total cannot be lower than payments already received',
        );
      Object.assign(
        updateData,
        totals,
        settlement(totals.totalAmount, paidAmount),
      );
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
  }

  /**
   * @cc [owner:nareshshah139,label:product] sales-pending-confirmation-stock
   * DRAFT or PENDING transitions to CONFIRMED, DISPENSED or COMPLETED MUST post stock exactly once
   * in the same transaction. All transitions MUST read invoice state after acquiring its row lock.
   * Posted invoices MUST reject direct cancellation and direct the caller to returns.
   */
  /**
   * @cc [owner:nareshshah139,label:product] stock-posting-serializable-eligibility
   * Stock posting MUST serialize eligibility reads with concurrent batch identity, status and expiry
   * changes. Serialization conflicts MUST roll back and retry all validation before any sale commits.
   */
  async updateStatus(
    id: string,
    status: string,
    branchId: string,
    userId?: string,
  ) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(
          (tx) => this.transitionInvoice(tx, id, status, branchId, userId),
          { timeout: 15000, isolationLevel: 'Serializable' },
        );
      } catch (error) {
        if (!this.isSerializationFailure(error)) throw error;
      }
    }
    throw new ConflictException(
      'Invoice or stock changed concurrently. Refresh and retry confirmation.',
    );
  }

  private isSerializationFailure(error: unknown): boolean {
    const failure = error as { code?: string; meta?: { code?: string } };
    return (
      failure?.code === 'P2034' ||
      (failure?.code === 'P2010' &&
        ['40001', '40P01'].includes(failure.meta?.code || ''))
    );
  }

  private async transitionInvoice(
    tx: Prisma.TransactionClient,
    id: string,
    status: string,
    branchId: string,
    userId?: string,
  ) {
    await this.lockInvoice(tx, id, branchId);
    const existingInvoice = await tx.pharmacyInvoice.findFirst({
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

    const oldStatus = existingInvoice.status;
    this.assertInvoiceStatusTransition(oldStatus, status);
    if (oldStatus === status) return existingInvoice;
    const shouldApplyStock =
      ['DRAFT', 'PENDING'].includes(oldStatus) &&
      ['CONFIRMED', 'COMPLETED', 'DISPENSED'].includes(status);

    if (shouldApplyStock && !userId) {
      throw new BadRequestException(
        'A user is required to confirm stock-deducting invoice statuses',
      );
    }

    if (shouldApplyStock && existingInvoice.prescriptionId) {
      await this.requireEligiblePrescription(
        tx,
        {
          prescriptionId: existingInvoice.prescriptionId,
          patientId: existingInvoice.patientId,
          doctorId: existingInvoice.doctorId,
        },
        branchId,
      );
    }

    const stockOps = shouldApplyStock
      ? await this.planConfirmedStockDeductions(
          tx,
          existingInvoice.items,
          branchId,
        )
      : [];
    const issued =
      shouldApplyStock && !isIssuedBillNumber(existingInvoice.invoiceNumber)
        ? {
            invoiceNumber: await this.issueBillNumber(tx, branchId),
            invoiceDate: new Date(),
          }
        : {};
    const invoiceNumber = issued.invoiceNumber ?? existingInvoice.invoiceNumber;

    const updatedInvoice = await tx.pharmacyInvoice.update({
      where: {
        id,
        branchId,
        status: oldStatus,
        updatedAt: existingInvoice.updatedAt,
      },
      data: {
        ...issued,
        status: status as any,
        mutationVersion: { increment: 1 },
      },
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

    if (shouldApplyStock && userId) {
      for (const op of stockOps.sort((a, b) =>
        a.inventoryItemId.localeCompare(b.inventoryItemId),
      )) {
        await tx.stockTransaction.create({
          data: {
            itemId: op.inventoryItemId,
            type: 'SALE',
            reason: 'Pharmacy bill saved and confirmed',
            quantity: op.quantity,
            quantityDelta: -op.quantity,
            unitPrice: op.unitPrice,
            totalAmount: money(op.unitPrice * op.quantity),
            reference: `INV-${invoiceNumber}`,
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
  }

  /**
   * @cc [owner:nareshshah139,label:product;security] prescription-billing-eligibility
   * Creating or relinking a prescription bill and every first stock posting MUST require an ACTIVE,
   * unexpired prescription on an undeleted visit belonging to the selected patient, doctor and branch.
   * Eligibility MUST be re-read under prescription then visit row locks retained through commit,
   * so a cancellation that wins the prescription lock prevents stock posting.
   */
  private async requireEligiblePrescription(
    tx: Prisma.TransactionClient,
    input: {
      prescriptionId: string;
      patientId: string;
      doctorId?: string | null;
    },
    branchId: string,
  ): Promise<void> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT r.id FROM prescriptions r JOIN visits v ON v.id = r."visitId"
      JOIN patients p ON p.id = v."patientId"
      WHERE r.id = ${input.prescriptionId} AND p."branchId" = ${branchId}
      FOR UPDATE OF r`;
    if (!locked.length)
      throw new NotFoundException('Prescription not found in this branch');
    const prescription = await tx.prescription.findUniqueOrThrow({
      where: { id: input.prescriptionId },
      select: { visitId: true, status: true, validUntil: true },
    });
    await tx.$queryRaw`SELECT id FROM visits WHERE id = ${prescription.visitId} FOR UPDATE`;
    const visit = await tx.visit.findFirst({
      where: {
        id: prescription.visitId,
        deletedAt: null,
        patient: { branchId },
      },
      select: { patientId: true, doctorId: true },
    });
    if (!visit)
      throw new BadRequestException(
        'Prescription visit is deleted or unavailable',
      );
    if (prescription.status !== 'ACTIVE')
      throw new BadRequestException('Only active prescriptions can be billed');
    if (prescription.validUntil && prescription.validUntil < new Date())
      throw new BadRequestException('Expired prescriptions cannot be billed');
    if (visit.patientId !== input.patientId)
      throw new BadRequestException(
        'Prescription does not belong to the selected patient and branch',
      );
    if (input.doctorId && visit.doctorId !== input.doctorId)
      throw new BadRequestException(
        'Prescription doctor does not match the selected doctor',
      );
  }

  /**
   * @cc [owner:nareshshah139,label:product] invoice-writer-lock
   * Every existing invoice command MUST acquire this branch-scoped row lock before reading mutable
   * invoice state and retain it through commit. Existing invoice locks precede prescription, visit
   * and inventory locks, in that order. Newly inserted invoices are private to their transaction.
   */
  private async lockInvoice(
    tx: Prisma.TransactionClient,
    id: string,
    branchId: string,
  ) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM pharmacy_invoices WHERE id = ${id} AND "branchId" = ${branchId} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Invoice not found');
  }

  private assertRequestKey(requestKey: string) {
    if (
      typeof requestKey !== 'string' ||
      !requestKey.trim() ||
      requestKey.length > 128
    )
      throw new BadRequestException(
        'A request key of 1 to 128 characters is required',
      );
  }

  private payloadHash(value: unknown): string {
    const canonical = (input: unknown): unknown => {
      if (Array.isArray(input)) return input.map(canonical);
      if (input && typeof input === 'object')
        return Object.fromEntries(
          Object.entries(input)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        );
      return input;
    };
    return createHash('sha256')
      .update(JSON.stringify(canonical(value)))
      .digest('hex');
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
    const billDiscountAmount = this.money(item.billDiscountAmount);
    const taxableAmount = this.money(
      grossAmount - discountAmount - billDiscountAmount,
    );
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
      inventoryItemId: item.inventoryItemId,
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
      billDiscountAmount,
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
    if (
      nextStatus === 'CANCELLED' &&
      ['CONFIRMED', 'DISPENSED', 'COMPLETED'].includes(oldStatus)
    ) {
      throw new BadRequestException(
        'Posted invoices cannot be cancelled. Use the sales return workflow to reverse dispensed stock.',
      );
    }
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
      CONFIRMED: new Set(['DISPENSED', 'COMPLETED']),
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

  /**
   * @cc [owner:nareshshah139,label:product] bill-stock-identity-and-units
   * Saved inventory identity MUST constrain bill deductions to its branch product, unit and pack.
   * Held or expired stock is unavailable; ambiguous links or mixed units MUST reject confirmation.
   * Repeated lines MUST share an allocation budget so a batch cannot be spent twice.
   */
  private saleRequirements(invoiceItems: any[]) {
    const requirements = new Map<string, SaleRequirement>();

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
          Number(item.totalAmount ?? item.quantity * item.unitPrice) - Number(item.taxAmount || 0),
          Number(item.taxAmount || 0),
          item.inventoryItemId,
        );
        continue;
      }

      if (!item.package?.items?.length) {
        throw new BadRequestException(
          'Invoice contains a package without package items',
        );
      }
      let packageWeightBefore=0;
      for (const packageItem of item.package.items) {
        if (!packageItem.drugId || !packageItem.drug) {
          throw new BadRequestException(
            `Package ${item.package.name} contains an inactive or missing drug`,
          );
        }
        const packageDrugQuantity = (packageItem.quantity || 1) * item.quantity;
        const weightedTotal = item.package.items.reduce((n:number,p:any)=>n+(p.quantity||1)*Number(p.drug?.price||0),0);
        const fraction = weightedTotal>0 ? (packageItem.quantity||1)*Number(packageItem.drug.price||0)/weightedTotal : (packageItem.quantity||1)/item.package.items.reduce((n:number,p:any)=>n+(p.quantity||1),0);
        const packageTaxable=Number(item.totalAmount ?? item.quantity*item.unitPrice)-Number(item.taxAmount||0),packageTax=Number(item.taxAmount||0);
        const allocatedTaxable=money((packageWeightBefore+fraction)*packageTaxable)-money(packageWeightBefore*packageTaxable);
        const allocatedTax=money((packageWeightBefore+fraction)*packageTax)-money(packageWeightBefore*packageTax);
        packageWeightBefore+=fraction;
        this.addStockRequirement(
          requirements,
          packageItem.drugId,
          packageItem.drug.name,
          packageDrugQuantity,
          packageItem.drug.price ?? item.unitPrice,
          `${item.package.name} - ${packageItem.drug.name}`,
          allocatedTaxable,
          allocatedTax,
        );
      }
    }

    return requirements;
  }

  private async planConfirmedStockDeductions(
    tx: any,
    invoiceItems: any[],
    branchId: string,
  ): Promise<StockDeductionOp[]> {
    const requirements = this.saleRequirements(invoiceItems);
    const now = new Date();
    const stockOps: StockDeductionOp[] = [];

    const allocated = new Map<string, number>();
    for (const requirement of requirements.values()) {
      const linked = requirement.inventoryItemId ? await resolvePrescriptionInventory(tx, {
        drugName: requirement.drugName, drugId: requirement.drugId, inventoryItemId: requirement.inventoryItemId,
      }, branchId) : null;
      if (requirement.inventoryItemId && (!linked || linked.drug?.id !== requirement.drugId))
        throw new BadRequestException('Invoice inventory identity changed. Reload the prescription before billing.');
      const batches = linked ? linked.batches : await tx.inventoryItem.findMany({
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
          heldStock: true,
          unit: true, packSize: true, packUnit: true,
          drugs: { select: { id: true } },
          costPrice: true,
          sellingPrice: true,
          minStockLevel: true,
          reorderLevel: true,
          expiryDate: true,
          batchNumber: true,
          stockStatus: true,
        },
      });

      if (batches.some((b: any) => b.drugs && b.drugs.length !== 1) || new Set(batches.map((b: any) => JSON.stringify([b.unit, b.packSize, b.packUnit]))).size > 1)
        throw new BadRequestException('Ambiguous stock units or product links. Select the inventory item before billing.');
      const eligibleBatches = batches
        .map((b: any) => ({ ...b, currentStock: b.currentStock - (allocated.get(b.id) || 0) }))
        .filter(
          (batch: any) =>
            batch.currentStock - (batch.heldStock || 0) > 0 &&
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
        (sum: number, batch: any) => sum + batch.currentStock - (batch.heldStock || 0),
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
        const quantity = Math.min(remaining, batch.currentStock - (batch.heldStock || 0));
        const unitPriceCandidate =
          batch.sellingPrice ??
          batch.costPrice ??
          requirement.fallbackUnitPrice;
        const unitPrice = Number.isFinite(Number(unitPriceCandidate))
          ? Number(unitPriceCandidate)
          : 0;
        const allocatedBefore=requirement.quantity-remaining;
        const taxableForBatch=money((allocatedBefore+quantity)*requirement.taxableAmount/requirement.quantity)-money(allocatedBefore*requirement.taxableAmount/requirement.quantity);
        const taxForBatch=money((allocatedBefore+quantity)*requirement.taxAmount/requirement.quantity)-money(allocatedBefore*requirement.taxAmount/requirement.quantity);
        allocated.set(batch.id, (allocated.get(batch.id) || 0) + quantity);
        stockOps.push({
          inventoryItemId: batch.id,
          drugName: requirement.drugName,
          quantity,
          unitPrice,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          notes: JSON.stringify({beforeStock:batch.currentStock,afterStock:batch.currentStock-quantity,quantityUnit:batch.unit,text:`Pharmacy invoice confirmed: ${requirement.sourceNames.join(', ')}`,costPerStockUnit:money(batch.costPrice),accountingCategory:'SALE',saleTerms:{unitPrice:requirement.taxableAmount/requirement.quantity,discountPercent:0,gstRate:requirement.taxableAmount>0?requirement.taxAmount/requirement.taxableAmount*100:0,schemePerUnit:0,taxablePerUnit:taxableForBatch/quantity,taxPerUnit:taxForBatch/quantity}}),
        });
        remaining -= quantity;
      }
    }

    return stockOps;
  }

  private addStockRequirement(
    requirements: Map<string, SaleRequirement>,
    drugId: string,
    drugName: string,
    quantity: number,
    fallbackUnitPrice: number,
    sourceName: string,
    taxableAmount = quantity*fallbackUnitPrice,
    taxAmount = 0,
    inventoryItemId?: string,
  ): void {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException(`Invalid quantity for ${drugName}`);
    }

    const requirementKey = `${drugId}:${inventoryItemId || ''}`;
    const existing = requirements.get(requirementKey);
    const safeFallbackUnitPrice = Number.isFinite(Number(fallbackUnitPrice))
      ? Number(fallbackUnitPrice)
      : 0;
    if (existing) {
      existing.quantity += quantity;
      existing.taxableAmount += taxableAmount;
      existing.taxAmount += taxAmount;
      existing.fallbackUnitPrice =
        existing.fallbackUnitPrice || safeFallbackUnitPrice;
      existing.sourceNames.push(sourceName);
      return;
    }

    requirements.set(requirementKey, {
      drugId, inventoryItemId,
      drugName,
      quantity,
      fallbackUnitPrice: safeFallbackUnitPrice,
      taxableAmount, taxAmount,
      sourceNames: [sourceName],
    });
  }

  private async applyInventorySale(
    tx: any,
    itemId: string,
    quantity: number,
    branchId: string,
  ): Promise<void> {
    const before = await tx.inventoryItem.findFirst({where:{id:itemId,branchId}});
    if (!before || before.currentStock-(before.heldStock||0)<quantity) throw new ConflictException('Available stock changed; held units cannot be dispensed.');
    const updated = await tx.inventoryItem.updateMany({
      where: {
        id: itemId,
        branchId,
        currentStock: before.currentStock,
        heldStock: before.heldStock||0,
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
    return new Date(expiryDate).getTime() < new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z').getTime();
  }

  /**
   * @cc [owner:nareshshah139,label:product] draft-delete-fence
   * Deletion MUST lock and recheck the invoice. Only drafts without completed payments may be
   * deleted; confirmation winning the lock MUST prevent deletion of its invoice and items. A
   * discard naming a draft version MUST be refused when the draft has changed since.
   */
  async remove(id: string, branchId: string, version?: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockInvoice(tx, id, branchId);
      const invoice = await tx.pharmacyInvoice.findUniqueOrThrow({
        where: { id },
        include: { payments: true },
      });
      if (invoice.status !== 'DRAFT' || invoice.checkoutRequestKey)
        throw new ConflictException(
          'This bill was already finished. It can no longer be discarded.',
        );
      if (version !== undefined && invoice.mutationVersion !== version)
        throw new ConflictException(
          'This draft was changed after you opened it. Reload it before discarding.',
        );
      if (invoice.payments.some((payment) => payment.status === 'COMPLETED'))
        throw new BadRequestException(
          'Invoices with received payments cannot be deleted',
        );
      await tx.pharmacyInvoice.delete({ where: { id } });
      return { message: 'Invoice deleted successfully' };
    });
  }

  /**
   * @cc [owner:nareshshah139,label:product] finished-bill-discount-revision
   * A finished bill's bill discount and line discount % MAY change, and nothing else: items, quantities,
   * batches, prices, stock and the bill number MUST stay as they are. The change MUST name the bill version
   * it was made from and MUST be refused for drafts, cancelled bills and bills with a sales return. It MUST
   * record who, when, why and the old and new amounts, and later returns MUST refund the revised line value.
   * Paid, balance and status MUST come from the ledger, so money already taken above the new total shows as
   * a refund due rather than being kept or dropped.
   */
  async reviseDiscount(
    id: string,
    dto: ReviseBillDiscountDto,
    branchId: string,
    userId: string,
  ) {
    return this.serializable(async (tx) => {
      await this.lockInvoice(tx, id, branchId);
      const invoice = await tx.pharmacyInvoice.findUniqueOrThrow({
        where: { id },
      });
      if (invoice.status === 'CANCELLED')
        throw new ConflictException(
          'This bill was cancelled, so its discount cannot be changed.',
        );
      if (!POSTED_STATUSES.includes(invoice.status))
        throw new ConflictException(
          'This bill is not finished yet. Change its discount in the draft.',
        );
      if (invoice.mutationVersion !== dto.expectedVersion)
        throw new ConflictException(
          'This bill was changed after you opened it. Reload it to see the latest amounts.',
        );
      const returns = await this.salesReturnsAgainst(tx, invoice);
      if (returns.length)
        throw new ConflictException(
          `This bill has a sales return (${returns.join(', ')}), so its discount can no longer be changed. Correct it through the return.`,
        );
      const lineDiscounts = new Map(
        dto.lines.map((line) => [line.id, line.discountPercent]),
      );
      const discount =
        dto.billDiscount === undefined
          ? this.storedBillDiscount(invoice)
          : dto.billDiscount;
      const { items, price, totals } = await this.repriceStoredItems(
        tx,
        id,
        lineDiscounts,
        discount,
      );
      if (dto.lines.some((line) => !items.some((item) => item.id === line.id)))
        throw new BadRequestException(
          'A discounted line is not on this bill. Reload the bill and try again.',
        );
      const before = {
        billDiscount: this.storedBillDiscount(invoice),
        lines: items.map((item) => ({
          id: item.id,
          discountPercent: item.discountPercent,
          totalAmount: item.totalAmount,
        })),
        discountAmount: invoice.discountAmount,
        taxAmount: invoice.taxAmount,
        totalAmount: invoice.totalAmount,
      };
      const after = {
        billDiscount: discount?.value ? discount : null,
        lines: items.map((item, index) => ({
          id: item.id,
          discountPercent: lineDiscounts.get(item.id) ?? item.discountPercent,
          totalAmount: price.lines[index].total,
        })),
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
      };
      const inputs = (side: typeof before) =>
        JSON.stringify([
          side.billDiscount?.kind ?? null,
          side.billDiscount?.value ?? 0,
          ...side.lines.map((line) => line.discountPercent),
        ]);
      if (inputs(before) === inputs(after))
        throw new BadRequestException(
          'The discount is unchanged. Change a discount before saving.',
        );
      await this.reviseSaleTerms(tx, invoice.invoiceNumber, branchId);
      const revisedAt = new Date();
      await tx.pharmacyInvoiceRevision.create({
        data: {
          invoiceId: id,
          branchId,
          revisedById: userId,
          reason: dto.reason,
          previousTotal: invoice.totalAmount,
          revisedTotal: totals.totalAmount,
          before,
          after,
          createdAt: revisedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'PHARMACY_BILL_DISCOUNT_REVISED',
          entity: 'PharmacyInvoice',
          entityId: id,
          oldValues: JSON.stringify({ branchId, ...before }),
          newValues: JSON.stringify({ branchId, ...after, reason: dto.reason }),
        },
      });
      await tx.pharmacyInvoice.update({
        where: { id },
        data: {
          ...totals,
          ...settlement(totals.totalAmount, await this.paidOn(tx, id)),
          revisedAt,
          mutationVersion: { increment: 1 },
        },
      });
      return { id };
    }, 'This bill changed while saving. Reload it and try again.').then(() =>
      this.findOne(id, branchId),
    );
  }

  private async salesReturnsAgainst(
    tx: Prisma.TransactionClient,
    invoice: { id: string; branchId: string; invoiceNumber: string },
  ) {
    const rows = await tx.$queryRaw<{ reference: string }[]>`
      SELECT d.reference FROM inventory_workflow_documents d
      WHERE d."branchId" = ${invoice.branchId}
        AND d.kind = 'SALES_RETURN'
        AND d.status <> ALL(${SETTLED_RETURN_STATUSES})
        AND (
          d."salesInvoiceId" = ${invoice.id}
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(d.payload->'lines', '[]'::jsonb)) line
            JOIN stock_transactions sale ON sale.id = line->>'sourceLineId'
            WHERE sale."branchId" = ${invoice.branchId}
              AND sale.type = 'SALE'
              AND sale.reference = ${`INV-${invoice.invoiceNumber}`}
          )
        )
      ORDER BY d."createdAt"`;
    return rows.map((row) => row.reference);
  }

  private async reviseSaleTerms(
    tx: Prisma.TransactionClient,
    invoiceNumber: string,
    branchId: string,
  ) {
    const items = await tx.pharmacyInvoiceItem.findMany({
      where: { invoice: { invoiceNumber } },
      include: {
        drug: true,
        package: { include: { items: { include: { drug: true } } } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const byDrug = new Map<string, { taxable: number; tax: number }>();
    for (const requirement of this.saleRequirements(items).values()) {
      const group = byDrug.get(requirement.drugId) ?? { taxable: 0, tax: 0 };
      group.taxable += requirement.taxableAmount;
      group.tax += requirement.taxAmount;
      byDrug.set(requirement.drugId, group);
    }
    const movements = await tx.stockTransaction.findMany({
      where: { branchId, type: 'SALE', reference: `INV-${invoiceNumber}` },
      include: { item: { select: { drugs: { select: { id: true } } } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const groups = new Map<string, typeof movements>();
    for (const movement of movements) {
      const drugs = movement.item?.drugs ?? [];
      if (drugs.length !== 1 || !byDrug.has(drugs[0].id)) continue;
      groups.set(drugs[0].id, [...(groups.get(drugs[0].id) ?? []), movement]);
    }
    for (const [drugId, group] of groups) {
      const { taxable, tax } = byDrug.get(drugId)!;
      const quantity = group.reduce((sum, movement) => sum + movement.quantity, 0);
      let before = 0;
      for (const movement of group) {
        const notes = jsonObject(movement.notes);
        const share = (amount: number) =>
          money(((before + movement.quantity) * amount) / quantity) -
          money((before * amount) / quantity);
        if (notes.saleTerms)
          await tx.stockTransaction.update({
            where: { id: movement.id },
            data: {
              notes: JSON.stringify({
                ...notes,
                saleTerms: {
                  ...notes.saleTerms,
                  unitPrice: taxable / quantity,
                  gstRate: taxable > 0 ? (tax / taxable) * 100 : 0,
                  taxablePerUnit: share(taxable) / movement.quantity,
                  taxPerUnit: share(tax) / movement.quantity,
                },
              }),
            },
          });
        before += movement.quantity;
      }
    }
  }

  /**
   * @cc [owner:nareshshah139,label:product] refund-due-recorded-explicitly
   * Money taken above a bill's total MUST go back only through an explicit refund of at most that excess,
   * recorded as a REFUNDED ledger entry of minus the amount in the chosen method, with the bill's paid,
   * balance and status recomputed from the ledger in the same transaction. The same request key and
   * payload MUST return the original entry; a changed payload MUST conflict without refunding again.
   */
  async recordRefund(
    invoiceId: string,
    dto: RefundPharmacyBillDto,
    branchId: string,
  ) {
    this.assertRequestKey(dto.requestKey);
    const { requestKey, ...payload } = dto;
    const payloadHash = this.payloadHash(payload);
    return this.prisma.$transaction(async (tx) => {
      await this.lockInvoice(tx, invoiceId, branchId);
      const existing = await tx.pharmacyPayment.findUnique({
        where: { invoiceId_requestKey: { invoiceId, requestKey } },
      });
      if (existing) {
        if (existing.payloadHash !== payloadHash)
          throw new ConflictException(
            'Refund request key was already used with different refund details',
          );
        return existing;
      }
      const invoice = await tx.pharmacyInvoice.findUniqueOrThrow({
        where: { id: invoiceId },
      });
      const due = money((await this.paidOn(tx, invoiceId)) - invoice.totalAmount);
      if (due <= 0)
        throw new BadRequestException('Nothing is due back on this bill.');
      if (dto.amount > due)
        throw new BadRequestException(
          `Only ₹${due.toFixed(2)} is due back on this bill. Reload it to see the latest amounts.`,
        );
      const refund = await tx.pharmacyPayment.create({
        data: {
          invoiceId,
          requestKey,
          payloadHash,
          amount: -dto.amount,
          method: dto.method,
          reference: dto.reference,
          status: 'REFUNDED',
        },
      });
      await tx.pharmacyInvoice.update({
        where: { id: invoiceId },
        data: {
          ...settlement(
            money(invoice.totalAmount),
            await this.paidOn(tx, invoiceId),
          ),
          mutationVersion: { increment: 1 },
        },
      });
      return refund;
    });
  }

  /**
   * @cc [owner:nareshshah139,label:product] payment-atomic-retry
   * A payment MUST lock its invoice, reject overpayment using the ledger (receipts less refunds), and commit
   * its receipt and recomputed balance together. The same invoice request key and payload MUST
   * return the original receipt; a changed payload MUST conflict without collecting again. A draft
   * MUST NOT take payment; finishing it in Sales collects what is due.
   */
  async addPayment(
    invoiceId: string,
    dto: PharmacyPaymentDto,
    branchId: string,
  ) {
    this.assertRequestKey(dto.requestKey);
    if (
      !Number.isFinite(dto.amount) ||
      dto.amount <= 0 ||
      money(dto.amount) !== dto.amount
    )
      throw new BadRequestException(
        'Payment amount must be positive with at most two decimal places',
      );
    const { requestKey, ...payload } = dto;
    const payloadHash = this.payloadHash(payload);
    return this.prisma.$transaction(async (tx) => {
      await this.lockInvoice(tx, invoiceId, branchId);
      const existing = await tx.pharmacyPayment.findUnique({
        where: { invoiceId_requestKey: { invoiceId, requestKey } },
      });
      if (existing) {
        if (existing.payloadHash !== payloadHash)
          throw new ConflictException(
            'Payment request key was already used with different payment details',
          );
        return existing;
      }
      const invoice = await tx.pharmacyInvoice.findUniqueOrThrow({
        where: { id: invoiceId },
      });
      if (invoice.status === 'CANCELLED')
        throw new BadRequestException(
          'Cancelled invoices cannot receive payments',
        );
      if (invoice.status === 'DRAFT')
        throw new BadRequestException(
          'Finish the bill in Sales before taking payment',
        );
      const remaining = money(
        invoice.totalAmount - (await this.paidOn(tx, invoiceId)),
      );
      if (dto.amount > remaining)
        throw new BadRequestException(
          'Payment amount exceeds remaining balance',
        );
      const payment = await tx.pharmacyPayment.create({
        data: {
          invoiceId,
          requestKey,
          payloadHash,
          amount: dto.amount,
          method: dto.method,
          reference: dto.reference,
          gateway: dto.gateway,
          status: 'COMPLETED',
        },
      });
      await tx.pharmacyInvoice.update({
        where: { id: invoiceId },
        data: {
          ...settlement(
            money(invoice.totalAmount),
            await this.paidOn(tx, invoiceId),
          ),
          mutationVersion: { increment: 1 },
        },
      });
      return payment;
    });
  }

  private price(lines: Parameters<typeof priceBill>[0], discount?: BillDiscount | null) {
    try {
      return priceBill(lines, discount);
    } catch (error) {
      if (error instanceof BillPricingError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  private priceItems(
    items: PharmacyInvoiceItemDto[],
    packages: any[],
    discount?: BillDiscount | null,
  ) {
    const unitPrices = items.map((item) => this.resolveUnitPrice(item, packages));
    const price = this.price(
      items.map((item, index) => ({
        quantity: item.quantity,
        unitPrice: unitPrices[index],
        discountPercent: item.discountPercent || 0,
        taxPercent: item.taxPercent || 0,
      })),
      discount,
    );
    return {
      lines: items.map((item, index) => ({
        drugId: item.drugId,
        inventoryItemId: item.inventoryItemId,
        packageId: item.packageId,
        itemType: (item.itemType as InvoiceItemType) || 'DRUG',
        quantity: item.quantity,
        unitPrice: unitPrices[index],
        discountPercent: item.discountPercent || 0,
        taxPercent: item.taxPercent || 0,
        ...lineMoney(price.lines[index]),
      })),
      totals: billTotals(price, discount),
    };
  }

  private storedBillDiscount(invoice: {
    billDiscountKind: BillDiscount['kind'] | null;
    billDiscountValue: number;
  }): BillDiscount | null {
    return invoice.billDiscountKind
      ? { kind: invoice.billDiscountKind, value: invoice.billDiscountValue }
      : null;
  }

  private async repriceStoredItems(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    lineDiscounts: Map<string, number>,
    discount: BillDiscount | null,
  ) {
    const items = await tx.pharmacyInvoiceItem.findMany({
      where: { invoiceId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const discountPercents = items.map(
      (item) => lineDiscounts.get(item.id) ?? item.discountPercent,
    );
    const price = this.price(
      items.map((item, index) => ({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPercent: discountPercents[index],
        taxPercent: item.taxPercent,
      })),
      discount,
    );
    for (const [index, item] of items.entries())
      await tx.pharmacyInvoiceItem.update({
        where: { id: item.id },
        data: {
          discountPercent: discountPercents[index],
          ...lineMoney(price.lines[index]),
        },
      });
    return { items, price, totals: billTotals(price, discount) };
  }

  /**
   * @cc [owner:nareshshah139,label:integrity] bill-number-issued-at-finish
   * A pharmacy bill MUST get its PHI number only when it is first posted, reserved on the posting
   * transaction, so drafts, discarded drafts and rolled-back or retried postings consume no number and
   * finished bills stay consecutive per series. A draft that already holds a number keeps it.
   */
  private async issueBillNumber(
    tx: Prisma.TransactionClient,
    branchId: string,
  ): Promise<string> {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const { sequence, periodKey } = await this.invoiceNumbers.reserve(
        { type: 'PHARMACY', branchId },
        tx,
      );
      const invoiceNumber = `PHI-${periodKey}-${String(sequence).padStart(3, '0')}`;
      const taken = await tx.pharmacyInvoice.findUnique({
        where: { invoiceNumber },
        select: { id: true },
      });
      if (!taken) return invoiceNumber;
    }
    throw new InternalServerErrorException(
      'Could not issue a free pharmacy bill number',
    );
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
}
