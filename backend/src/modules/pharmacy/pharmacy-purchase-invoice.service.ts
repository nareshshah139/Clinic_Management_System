import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import type { Express } from 'express';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  ConfirmPharmacyPurchaseMasterDto,
  CreatePharmacyPurchaseInvoiceDto,
  CreatePharmacyPurchaseInvoiceItemDto,
  PharmacyPurchaseBillTypeDto,
  PharmacyPurchaseInvoiceSourceDto,
  PharmacyPurchaseMasterActionDto,
  QueryPharmacyPurchaseAnalyticsDto,
  QueryPharmacyPurchaseInvoiceDto,
  ReviewPharmacyPurchaseInvoiceDto,
} from './dto/pharmacy-purchase-invoice.dto';

type PurchaseInvoiceStatus =
  | 'DRAFT'
  | 'OCR_REVIEW_REQUIRED'
  | 'RECONCILIATION_FAILED'
  | 'REVIEWED'
  | 'STOCK_COMMITTED'
  | 'CANCELLED';

type PurchaseValidationResult = {
  status: PurchaseInvoiceStatus;
  unresolvedOcrFlags: number;
  reconciliationIssues: string[];
};

type PurchaseStockQuantities = {
  purchasedQuantity: number;
  freeQuantity: number;
  totalQuantity: number;
};

type AnalyticsLine = {
  invoice: any;
  item: any;
  discountPercent: number;
  purchasedQuantity: number;
  freeQuantity: number;
  totalQuantity: number;
  taxableAmount: number;
  gstAmount: number;
  lineTotal: number;
};

type MasterMatchDrug = {
  id: string;
  name: string;
  price: number;
  manufacturerName: string;
  packSizeLabel: string;
  composition1?: string | null;
  composition2?: string | null;
  category?: string | null;
  dosageForm?: string | null;
  strength?: string | null;
};

@Injectable()
export class PharmacyPurchaseInvoiceService {
  private readonly tolerance = 1;
  private readonly logger = new Logger(PharmacyPurchaseInvoiceService.name);

  constructor(private prisma: PrismaService) {}

  async extractDraftFromDocument(
    file: Express.Multer.File,
    branchId: string,
  ) {
    if (!file || !file.buffer || file.size <= 0) {
      throw new BadRequestException('No invoice file provided');
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'purchase-invoices/ocr/extract skipped: OPENAI_API_KEY is not configured',
      );
      throw new ServiceUnavailableException(
        'Invoice OCR is unavailable. Contact an administrator to configure OPENAI_API_KEY.',
      );
    }

    const document = await this.buildOcrImageDataUrls(file);
    const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
    const raw = await this.extractPurchaseInvoiceJson(
      document.imageDataUrls,
      apiKey,
      model,
    );
    const draft = this.normalizeExtractedPurchaseDraft(raw, document.flags);

    return {
      draft,
      masterMatches: await this.suggestMasterMatches(draft.items, branchId),
      extraction: {
        source: PharmacyPurchaseInvoiceSourceDto.OCR,
        model,
        branchId,
        fileName: file.originalname || 'purchase-invoice',
        pageCount: document.pageCount,
        includedPageCount: document.imageDataUrls.length,
        flags: draft.ocrFlags || [],
        extractedAt: new Date().toISOString(),
      },
    };
  }

  async suggestMasterMatches(
    items: CreatePharmacyPurchaseInvoiceItemDto[],
    branchId: string,
  ) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException(
        'At least one purchase line is required for drug master matching',
      );
    }

    const matches = await Promise.all(
      items.map(async (item, index) => ({
        lineIndex: index,
        ocr: this.masterLineSummary(item),
        candidates: await this.findMasterMatchCandidates(item, branchId),
      })),
    );

    return {
      matches: matches.map((match) => {
        const best = match.candidates[0];
        return {
          ...match,
          recommendedAction:
            best && best.score >= 65 ? 'MATCH_EXISTING' : 'CREATE_NEW',
        };
      }),
    };
  }

  async confirmMasterRecord(
    dto: ConfirmPharmacyPurchaseMasterDto,
    branchId: string,
  ) {
    if (!dto?.item) {
      throw new BadRequestException(
        'Purchase line item is required to confirm a drug master record',
      );
    }
    const item = dto.item;

    if (dto.action === PharmacyPurchaseMasterActionDto.MATCH_EXISTING) {
      if (!dto.drugId) {
        throw new BadRequestException('drugId is required to confirm a match');
      }
      const existing = await this.prisma.drug.findFirst({
        where: {
          id: dto.drugId,
          branchId,
          isActive: true,
          isDiscontinued: false,
        },
      });
      if (!existing) {
        throw new NotFoundException('Drug master record not found');
      }

      const updateData: Record<string, unknown> = {};
      if (this.money(item.mrp) > 0) {
        updateData.price = this.money(item.mrp);
      }
      const updated =
        Object.keys(updateData).length > 0
          ? await this.prisma.drug.update({
              where: { id: existing.id },
              data: updateData,
            })
          : existing;

      return {
        action: PharmacyPurchaseMasterActionDto.MATCH_EXISTING,
        drug: this.masterDrugSummary(updated),
        linePatch: this.linePatchFromDrug(updated, item),
        message: `Matched ${item.productName} to ${updated.name}`,
      };
    }

    if (dto.action !== PharmacyPurchaseMasterActionDto.CREATE_NEW) {
      throw new BadRequestException('Unsupported drug master confirmation action');
    }

    const existingExact = await this.prisma.drug.findFirst({
      where: {
        branchId,
        isActive: true,
        name: {
          equals: item.productName.trim(),
          mode: 'insensitive',
        },
        manufacturerName: {
          equals: item.manufacturer.trim(),
          mode: 'insensitive',
        },
      },
    });
    if (existingExact) {
      throw new ConflictException(
        'A matching drug master record already exists. Confirm that match instead of creating a duplicate.',
      );
    }

    const created = await this.prisma.drug.create({
      data: {
        branchId,
        name: item.productName.trim(),
        price: this.money(item.mrp),
        manufacturerName: item.manufacturer.trim(),
        type: 'allopathy',
        packSizeLabel: item.packSize.trim(),
        composition1: this.inferComposition(item.productName),
        category: this.inferCategory(item),
        dosageForm: this.inferDosageForm(item),
        strength: this.inferStrength(item.productName),
        description:
          'Created from a pharmacist-confirmed purchase invoice OCR line. Review composition, category, dosage form, and strength before broad use.',
        minStockLevel: 10,
        maxStockLevel: 1000,
        isActive: true,
        isDiscontinued: false,
      },
    });

    return {
      action: PharmacyPurchaseMasterActionDto.CREATE_NEW,
      drug: this.masterDrugSummary(created),
      linePatch: this.linePatchFromDrug(created, item),
      message: `Created drug master ${created.name}`,
    };
  }

  async createDraft(
    dto: CreatePharmacyPurchaseInvoiceDto,
    branchId: string,
    userId?: string,
  ) {
    const prismaAny = this.prisma as any;
    this.validateHeader(dto);

    const validation = this.validatePurchaseInvoice(dto);

    try {
      const created = await prismaAny.pharmacyPurchaseInvoice.create({
        data: {
          branchId,
          createdBy: userId,
          distributorName: dto.distributorName.trim(),
          distributorAddress: this.emptyToUndefined(dto.distributorAddress),
          distributorGstin: dto.distributorGstin.trim().toUpperCase(),
          distributorDlNo: dto.distributorDlNo.trim(),
          distributorFoodLicense: this.emptyToUndefined(
            dto.distributorFoodLicense,
          ),
          invoiceNumber: dto.invoiceNumber.trim(),
          invoiceDate: new Date(dto.invoiceDate),
          goodsReceivedDate: dto.goodsReceivedDate
            ? new Date(dto.goodsReceivedDate)
            : undefined,
          billType: dto.billType,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          eWayBillNo: this.emptyToUndefined(dto.eWayBillNo),
          casesTransport: this.emptyToUndefined(dto.casesTransport),
          lrNo: this.emptyToUndefined(dto.lrNo),
          salesmanName: this.emptyToUndefined(dto.salesmanName),
          salesmanContact: this.emptyToUndefined(dto.salesmanContact),
          buyerCode: this.emptyToUndefined(dto.buyerCode),
          doctorNameOrRegNo: dto.doctorNameOrRegNo.trim(),
          urcCode: this.emptyToUndefined(dto.urcCode),
          handwrittenNotes: this.emptyToUndefined(dto.handwrittenNotes),
          source: dto.source || 'MANUAL',
          status: validation.status,
          grossAmount: this.money(dto.grossAmount),
          tradeDiscount: this.money(dto.tradeDiscount),
          specialDiscount: this.money(dto.specialDiscount),
          cashDiscount: this.money(dto.cashDiscount),
          damageAdjustment: this.money(dto.damageAdjustment),
          visibilityAmount: this.money(dto.visibilityAmount),
          creditDebitAdjustment: this.money(dto.creditDebitAdjustment),
          taxableAmount: this.money(dto.taxableAmount),
          totalCgst: this.money(dto.totalCgst),
          totalSgst: this.money(dto.totalSgst),
          totalIgst: this.money(dto.totalIgst),
          totalGst: this.money(dto.totalGst),
          tcsAmount: this.money(dto.tcsAmount),
          rounding: this.money(dto.rounding),
          netPayable: this.money(dto.netPayable),
          unresolvedOcrFlags: validation.unresolvedOcrFlags,
          reconciliationIssues: this.stringifyIssues(
            validation.reconciliationIssues,
          ),
          items: {
            create: dto.items.map((item, index) =>
              this.toPurchaseInvoiceItemCreate(item, index + 1),
            ),
          },
        },
        include: {
          items: {
            orderBy: { lineNumber: 'asc' },
          },
        },
      });

      return this.formatPurchaseInvoice(created);
    } catch (error: any) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Purchase invoice already exists for this distributor GSTIN and invoice number',
        );
      }
      throw error;
    }
  }

  async findAll(query: QueryPharmacyPurchaseInvoiceDto, branchId: string) {
    const prismaAny = this.prisma as any;
    const page = this.toPositiveInt(query.page, 1);
    const limit = Math.min(this.toPositiveInt(query.limit, 20), 100);
    const startDate = query.startDate
      ? this.parseDate(query.startDate, 'startDate')
      : undefined;
    const endDate = query.endDate
      ? this.parseDate(query.endDate, 'endDate')
      : undefined;

    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('startDate cannot be after endDate');
    }

    const where: any = { branchId };
    if (query.distributorGstin) {
      where.distributorGstin = query.distributorGstin.trim().toUpperCase();
    }
    if (query.status) {
      where.status = query.status;
    }
    if (startDate || endDate) {
      where.invoiceDate = {};
      if (startDate) where.invoiceDate.gte = startDate;
      if (endDate) where.invoiceDate.lte = endDate;
    }

    const orderBy: any = {
      [this.normalizeSortBy(query.sortBy)]:
        query.sortOrder === 'asc' ? 'asc' : 'desc',
    };

    const [data, total] = await Promise.all([
      prismaAny.pharmacyPurchaseInvoice.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        include: {
          items: {
            orderBy: { lineNumber: 'asc' },
          },
        },
      }),
      prismaAny.pharmacyPurchaseInvoice.count({ where }),
    ]);

    return {
      data: data.map((invoice: any) => this.formatPurchaseInvoice(invoice)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, branchId: string) {
    const prismaAny = this.prisma as any;
    const invoice = await prismaAny.pharmacyPurchaseInvoice.findFirst({
      where: { id, branchId },
      include: {
        items: {
          orderBy: { lineNumber: 'asc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Purchase invoice not found');
    }

    return this.formatPurchaseInvoice(invoice);
  }

  async getDistributorAnalytics(
    query: QueryPharmacyPurchaseAnalyticsDto,
    branchId: string,
  ) {
    const prismaAny = this.prisma as any;
    const startDate = query.startDate
      ? this.parseDate(query.startDate, 'startDate')
      : undefined;
    const endDate = query.endDate
      ? this.endOfDay(this.parseDate(query.endDate, 'endDate'))
      : undefined;

    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('startDate cannot be after endDate');
    }

    const itemWhere: any = {};
    if (query.productName?.trim()) {
      itemWhere.productName = {
        contains: query.productName.trim(),
        mode: 'insensitive',
      };
    }
    if (query.hsnCode?.trim()) {
      itemWhere.hsnCode = query.hsnCode.trim();
    }

    const where: any = {
      branchId,
      status: { in: ['REVIEWED', 'STOCK_COMMITTED'] },
    };
    if (query.distributorGstin?.trim()) {
      where.distributorGstin = query.distributorGstin.trim().toUpperCase();
    }
    if (startDate || endDate) {
      where.invoiceDate = {};
      if (startDate) where.invoiceDate.gte = startDate;
      if (endDate) where.invoiceDate.lte = endDate;
    }
    if (Object.keys(itemWhere).length > 0) {
      where.items = {
        some: itemWhere,
      };
    }

    const invoices = await prismaAny.pharmacyPurchaseInvoice.findMany({
      where,
      orderBy: [{ invoiceDate: 'asc' }, { invoiceNumber: 'asc' }],
      include: {
        items: {
          orderBy: { lineNumber: 'asc' },
        },
      },
    });

    const lines = this.toAnalyticsLines(invoices, itemWhere);
    const limit = Math.min(this.toPositiveInt(query.limit, 25), 100);
    const minDiscountDropPercent = this.money(
      query.minDiscountDropPercent ?? 5,
    );

    return {
      filters: {
        startDate,
        endDate,
        distributorGstin: query.distributorGstin?.trim().toUpperCase(),
        productName: query.productName?.trim(),
        hsnCode: query.hsnCode?.trim(),
        includedStatuses: ['REVIEWED', 'STOCK_COMMITTED'],
        minDiscountDropPercent,
      },
      totals: this.buildPurchaseAnalyticsTotals(lines),
      distributors: this.buildDistributorAnalytics(lines).slice(0, limit),
      products: this.buildProductDistributorAnalytics(lines).slice(0, limit),
      discountDropAlerts: this.buildDiscountDropAlerts(
        lines,
        minDiscountDropPercent,
      ).slice(0, limit),
    };
  }

  async markReviewed(
    id: string,
    dto: ReviewPharmacyPurchaseInvoiceDto,
    branchId: string,
  ) {
    const prismaAny = this.prisma as any;
    const invoice = await prismaAny.pharmacyPurchaseInvoice.findFirst({
      where: { id, branchId },
      include: { items: true },
    });

    if (!invoice) {
      throw new NotFoundException('Purchase invoice not found');
    }
    if (invoice.status === 'CANCELLED') {
      throw new BadRequestException(
        'Cancelled purchase invoices cannot be reviewed',
      );
    }

    const goodsReceivedDate = dto.goodsReceivedDate
      ? new Date(dto.goodsReceivedDate)
      : invoice.goodsReceivedDate;
    if (!goodsReceivedDate) {
      throw new BadRequestException(
        'Goods received date is required before a purchase invoice can be reviewed for stock intake',
      );
    }
    if (goodsReceivedDate < invoice.invoiceDate) {
      throw new BadRequestException(
        'Goods received date cannot be before invoice date',
      );
    }
    if (invoice.unresolvedOcrFlags > 0) {
      throw new BadRequestException(
        'Resolve OCR flags before reviewing this purchase invoice',
      );
    }

    const issues = this.parseIssues(invoice.reconciliationIssues);
    if (issues.length > 0) {
      throw new BadRequestException(
        `Resolve reconciliation issues before review: ${issues.join('; ')}`,
      );
    }

    const updated = await prismaAny.pharmacyPurchaseInvoice.update({
      where: { id },
      data: {
        goodsReceivedDate,
        handwrittenNotes:
          dto.handwrittenNotes !== undefined
            ? this.emptyToUndefined(dto.handwrittenNotes)
            : invoice.handwrittenNotes,
        status: 'REVIEWED',
      },
      include: {
        items: {
          orderBy: { lineNumber: 'asc' },
        },
      },
    });

    return this.formatPurchaseInvoice(updated);
  }

  async commitStock(id: string, branchId: string, userId?: string) {
    if (!userId) {
      throw new BadRequestException(
        'Authenticated user is required to commit purchase stock',
      );
    }

    const prismaAny = this.prisma as any;

    return prismaAny.$transaction(async (tx: any) => {
      const invoice = await tx.pharmacyPurchaseInvoice.findFirst({
        where: { id, branchId },
        include: {
          items: {
            orderBy: { lineNumber: 'asc' },
          },
        },
      });

      if (!invoice) {
        throw new NotFoundException('Purchase invoice not found');
      }
      if (invoice.status === 'STOCK_COMMITTED' || invoice.stockCommittedAt) {
        return this.formatPurchaseInvoice(invoice);
      }

      this.assertPurchaseInvoiceCanCommit(invoice);

      const stockCommittedAt = new Date();
      const stockCommitReference = this.buildStockCommitReference(invoice);
      const claim = await tx.pharmacyPurchaseInvoice.updateMany({
        where: {
          id,
          branchId,
          status: 'REVIEWED',
          stockCommittedAt: null,
        },
        data: {
          status: 'STOCK_COMMITTED',
          stockCommittedAt,
          stockCommittedBy: userId,
          stockCommitReference,
        },
      });

      if (claim.count !== 1) {
        const current = await tx.pharmacyPurchaseInvoice.findFirst({
          where: { id, branchId },
          include: {
            items: {
              orderBy: { lineNumber: 'asc' },
            },
          },
        });
        if (
          current &&
          (current.status === 'STOCK_COMMITTED' || current.stockCommittedAt)
        ) {
          return this.formatPurchaseInvoice(current);
        }
        throw new ConflictException(
          'Purchase invoice changed while committing stock. Refresh and retry.',
        );
      }

      const committedItems: Array<{
        lineNumber: number;
        productName: string;
        drugId: string;
        inventoryItemId: string;
        quantityCommitted: number;
        purchasedQuantity: number;
        freeQuantity: number;
        batchNumber: string;
        expiryDate: Date;
      }> = [];

      for (const item of invoice.items) {
        const drug = await this.resolvePurchaseLineDrug(tx, item, branchId);
        const inventoryItem = await this.applyPurchaseLineToInventory(
          tx,
          invoice,
          item,
          drug,
          branchId,
        );
        const quantities = this.getPurchaseStockQuantities(item);
        const expiryDate = this.getExpiryDate(item);

        await this.createPurchaseStockTransaction(
          tx,
          invoice,
          item,
          inventoryItem,
          quantities,
          expiryDate,
          userId,
          branchId,
          stockCommitReference,
        );

        committedItems.push({
          lineNumber: item.lineNumber,
          productName: item.productName,
          drugId: drug.id,
          inventoryItemId: inventoryItem.id,
          quantityCommitted: quantities.totalQuantity,
          purchasedQuantity: quantities.purchasedQuantity,
          freeQuantity: quantities.freeQuantity,
          batchNumber: item.batchNumber,
          expiryDate,
        });
      }

      const updated = await tx.pharmacyPurchaseInvoice.findFirst({
        where: { id, branchId },
        include: {
          items: {
            orderBy: { lineNumber: 'asc' },
          },
        },
      });

      if (!updated) {
        throw new ConflictException(
          'Purchase invoice disappeared while committing stock',
        );
      }

      return {
        ...this.formatPurchaseInvoice(updated),
        committedItems,
      };
    });
  }

  private assertPurchaseInvoiceCanCommit(invoice: any): void {
    if (invoice.status !== 'REVIEWED') {
      throw new BadRequestException(
        `Only reviewed purchase invoices can be committed to stock. Current status: ${invoice.status}`,
      );
    }
    if (!invoice.goodsReceivedDate) {
      throw new BadRequestException(
        'Goods received date is required before stock can be committed',
      );
    }
    if (invoice.unresolvedOcrFlags > 0) {
      throw new BadRequestException(
        'Resolve OCR flags before committing purchase stock',
      );
    }

    const issues = this.parseIssues(invoice.reconciliationIssues);
    if (issues.length > 0) {
      throw new BadRequestException(
        `Resolve reconciliation issues before stock commit: ${issues.join('; ')}`,
      );
    }
    if (!Array.isArray(invoice.items) || invoice.items.length === 0) {
      throw new BadRequestException(
        'Purchase invoice must contain at least one line item before stock commit',
      );
    }

    for (const item of invoice.items) {
      const lineLabel = this.lineLabel(item);
      const itemOcrFlags = this.parseIssues(item.ocrFlags);
      if (itemOcrFlags.length > 0) {
        throw new BadRequestException(
          `${lineLabel}: resolve OCR flags before stock commit`,
        );
      }

      this.getPurchaseStockQuantities(item);
      const expiryDate = this.getExpiryDate(item);
      if (this.isExpired(expiryDate)) {
        throw new BadRequestException(
          `${lineLabel}: expired batches cannot be committed to stock`,
        );
      }
    }
  }

  private toAnalyticsLines(invoices: any[], itemWhere: any): AnalyticsLine[] {
    const lines: AnalyticsLine[] = [];
    for (const invoice of invoices) {
      for (const item of invoice.items || []) {
        if (!this.matchesAnalyticsItemFilter(item, itemWhere)) continue;
        const purchasedQuantity = this.money(item.quantityPurchased);
        const freeQuantity = this.money(item.freeQuantity);
        const totalQuantity = this.money(purchasedQuantity + freeQuantity);
        lines.push({
          invoice,
          item,
          discountPercent: this.money(
            this.money(item.discountPercent) +
              this.money(item.specialDiscountPercent),
          ),
          purchasedQuantity,
          freeQuantity,
          totalQuantity,
          taxableAmount: this.money(item.taxableAmount),
          gstAmount: this.money(item.gstAmount),
          lineTotal: this.money(item.lineTotal),
        });
      }
    }
    return lines;
  }

  private matchesAnalyticsItemFilter(item: any, itemWhere: any): boolean {
    if (itemWhere.productName) {
      const needle = String(itemWhere.productName.contains).toLowerCase();
      if (!String(item.productName || '').toLowerCase().includes(needle)) {
        return false;
      }
    }
    if (itemWhere.hsnCode && item.hsnCode !== itemWhere.hsnCode) {
      return false;
    }
    return true;
  }

  private buildPurchaseAnalyticsTotals(lines: AnalyticsLine[]) {
    const invoiceIds = new Set(lines.map((line) => line.invoice.id));
    const taxableAmount = this.sum(lines, (line) => line.taxableAmount);
    const gstAmount = this.sum(lines, (line) => line.gstAmount);
    const purchasedQuantity = this.sum(lines, (line) => line.purchasedQuantity);
    const freeQuantity = this.sum(lines, (line) => line.freeQuantity);
    const totalQuantity = this.sum(lines, (line) => line.totalQuantity);

    return {
      invoiceCount: invoiceIds.size,
      lineCount: lines.length,
      taxableAmount,
      gstAmount,
      lineTotal: this.sum(lines, (line) => line.lineTotal),
      purchasedQuantity,
      freeQuantity,
      totalQuantity,
      freeQuantityRatioPercent: this.percent(freeQuantity, totalQuantity),
      effectiveUnitCost: this.unitCost(taxableAmount, totalQuantity),
      averageDiscountPercent: this.weightedAverage(
        lines,
        (line) => line.discountPercent,
        (line) => line.purchasedQuantity || line.totalQuantity,
      ),
    };
  }

  private buildDistributorAnalytics(lines: AnalyticsLine[]) {
    const groups = new Map<string, AnalyticsLine[]>();
    for (const line of lines) {
      const key = `${line.invoice.distributorGstin}|${line.invoice.distributorName}`;
      groups.set(key, [...(groups.get(key) || []), line]);
    }

    return Array.from(groups.values())
      .map((group) => {
        const sample = group[0].invoice;
        const totals = this.buildPurchaseAnalyticsTotals(group);
        const invoiceDates = group.map((line) =>
          new Date(line.invoice.invoiceDate).getTime(),
        );
        return {
          distributorName: sample.distributorName,
          distributorGstin: sample.distributorGstin,
          invoiceCount: totals.invoiceCount,
          lineCount: totals.lineCount,
          taxableAmount: totals.taxableAmount,
          gstAmount: totals.gstAmount,
          lineTotal: totals.lineTotal,
          purchasedQuantity: totals.purchasedQuantity,
          freeQuantity: totals.freeQuantity,
          totalQuantity: totals.totalQuantity,
          freeQuantityRatioPercent: totals.freeQuantityRatioPercent,
          effectiveUnitCost: totals.effectiveUnitCost,
          averageDiscountPercent: totals.averageDiscountPercent,
          lastInvoiceDate: new Date(Math.max(...invoiceDates)),
        };
      })
      .sort((a, b) => b.lineTotal - a.lineTotal);
  }

  private buildProductDistributorAnalytics(lines: AnalyticsLine[]) {
    const groups = new Map<string, AnalyticsLine[]>();
    for (const line of lines) {
      const key = [
        line.invoice.distributorGstin,
        line.item.productName,
        line.item.manufacturer,
        line.item.packSize,
        line.item.hsnCode,
      ].join('|');
      groups.set(key, [...(groups.get(key) || []), line]);
    }

    return Array.from(groups.values())
      .map((group) => {
        const sample = group[group.length - 1];
        const totals = this.buildPurchaseAnalyticsTotals(group);
        return {
          distributorName: sample.invoice.distributorName,
          distributorGstin: sample.invoice.distributorGstin,
          productName: sample.item.productName,
          manufacturer: sample.item.manufacturer,
          packSize: sample.item.packSize,
          hsnCode: sample.item.hsnCode,
          invoiceCount: totals.invoiceCount,
          purchasedQuantity: totals.purchasedQuantity,
          freeQuantity: totals.freeQuantity,
          totalQuantity: totals.totalQuantity,
          taxableAmount: totals.taxableAmount,
          gstAmount: totals.gstAmount,
          lineTotal: totals.lineTotal,
          effectiveUnitCost: totals.effectiveUnitCost,
          averageDiscountPercent: totals.averageDiscountPercent,
          latestPurchaseRate: this.money(sample.item.purchaseRate),
          latestDiscountPercent: sample.discountPercent,
          lastInvoiceDate: sample.invoice.invoiceDate,
        };
      })
      .sort((a, b) => b.lineTotal - a.lineTotal);
  }

  private buildDiscountDropAlerts(
    lines: AnalyticsLine[],
    minDropPercent: number,
  ) {
    const groups = new Map<string, AnalyticsLine[]>();
    for (const line of lines) {
      const key = [
        line.invoice.distributorGstin,
        line.item.productName,
        line.item.manufacturer,
        line.item.packSize,
      ].join('|');
      groups.set(key, [...(groups.get(key) || []), line]);
    }

    return Array.from(groups.values())
      .map((group) => {
        const sorted = [...group].sort((a, b) => {
          const dateDiff =
            new Date(a.invoice.invoiceDate).getTime() -
            new Date(b.invoice.invoiceDate).getTime();
          if (dateDiff !== 0) return dateDiff;
          return String(a.invoice.invoiceNumber).localeCompare(
            String(b.invoice.invoiceNumber),
          );
        });
        if (sorted.length < 2) return undefined;

        const previous = sorted[sorted.length - 2];
        const latest = sorted[sorted.length - 1];
        const dropPercent = this.money(
          previous.discountPercent - latest.discountPercent,
        );
        if (dropPercent < minDropPercent) return undefined;

        return {
          distributorName: latest.invoice.distributorName,
          distributorGstin: latest.invoice.distributorGstin,
          productName: latest.item.productName,
          manufacturer: latest.item.manufacturer,
          packSize: latest.item.packSize,
          previousInvoiceNumber: previous.invoice.invoiceNumber,
          latestInvoiceNumber: latest.invoice.invoiceNumber,
          previousInvoiceDate: previous.invoice.invoiceDate,
          latestInvoiceDate: latest.invoice.invoiceDate,
          previousDiscountPercent: previous.discountPercent,
          latestDiscountPercent: latest.discountPercent,
          dropPercent,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.dropPercent - a.dropPercent);
  }

  private async resolvePurchaseLineDrug(
    tx: any,
    item: any,
    branchId: string,
  ) {
    const candidates = await tx.drug.findMany({
      where: {
        branchId,
        isActive: true,
        isDiscontinued: false,
        name: {
          equals: item.productName.trim(),
          mode: 'insensitive',
        },
        manufacturerName: {
          equals: item.manufacturer.trim(),
          mode: 'insensitive',
        },
        packSizeLabel: {
          equals: item.packSize.trim(),
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        name: true,
        price: true,
        manufacturerName: true,
        packSizeLabel: true,
        composition1: true,
        category: true,
        dosageForm: true,
        strength: true,
        minStockLevel: true,
        maxStockLevel: true,
      },
    });

    if (candidates.length === 0) {
      throw new BadRequestException(
        `${this.lineLabel(item)}: product master is missing or inactive for ${item.productName}. Create a complete drug master before committing stock.`,
      );
    }
    if (candidates.length > 1) {
      throw new ConflictException(
        `${this.lineLabel(item)}: multiple active product master records match ${item.productName}. Resolve duplicates before committing stock.`,
      );
    }

    const drug = candidates[0];
    const missing = [
      ['composition1', drug.composition1],
      ['category', drug.category],
      ['dosageForm', drug.dosageForm],
      ['strength', drug.strength],
    ]
      .filter(([, value]) => !String(value ?? '').trim())
      .map(([field]) => field);

    if (missing.length > 0) {
      throw new BadRequestException(
        `${this.lineLabel(item)}: product master is incomplete for ${item.productName}; missing ${missing.join(', ')}`,
      );
    }

    return drug;
  }

  private async applyPurchaseLineToInventory(
    tx: any,
    invoice: any,
    item: any,
    drug: any,
    branchId: string,
  ) {
    const quantities = this.getPurchaseStockQuantities(item);
    const expiryDate = this.getExpiryDate(item);
    const gstRate = this.money(
      this.money(item.cgstPercent) +
        this.money(item.sgstPercent) +
        this.money(item.igstPercent),
    );

    const candidateBatches = await tx.inventoryItem.findMany({
      where: {
        branchId,
        batchNumber: item.batchNumber.trim(),
        drugs: {
          some: {
            id: drug.id,
          },
        },
      },
      select: {
        id: true,
        currentStock: true,
        minStockLevel: true,
        reorderLevel: true,
        expiryDate: true,
        mrp: true,
        status: true,
      },
    });

    const existingBatch = candidateBatches.find((candidate: any) =>
      this.isSamePurchaseBatch(candidate, item, expiryDate),
    );

    if (existingBatch) {
      if (existingBatch.status !== 'ACTIVE') {
        throw new BadRequestException(
          `${this.lineLabel(item)}: matching inventory batch is not active`,
        );
      }

      const newStock =
        Number(existingBatch.currentStock ?? 0) + quantities.totalQuantity;
      return tx.inventoryItem.update({
        where: { id: existingBatch.id },
        data: {
          currentStock: {
            increment: quantities.totalQuantity,
          },
          costPrice: this.money(item.purchaseRate),
          sellingPrice: this.money(item.mrp),
          mrp: this.money(item.mrp),
          supplier: invoice.distributorName,
          hsnCode: item.hsnCode.trim(),
          gstRate,
          packUnit: item.packUnitType.trim(),
          stockStatus: this.deriveIncomingStockStatus({
            currentStock: newStock,
            minStockLevel: existingBatch.minStockLevel,
            reorderLevel: existingBatch.reorderLevel,
            expiryDate,
          }),
        },
      });
    }

    const minStockLevel = this.toPositiveInt(drug.minStockLevel, 10);
    const currentStock = quantities.totalQuantity;
    return tx.inventoryItem.create({
      data: {
        branchId,
        name: drug.name,
        genericName: drug.composition1,
        brandName: drug.name,
        type: 'MEDICINE',
        category: drug.category,
        manufacturer: drug.manufacturerName,
        supplier: invoice.distributorName,
        costPrice: this.money(item.purchaseRate),
        sellingPrice: this.money(item.mrp),
        mrp: this.money(item.mrp),
        unit: this.mapUnitType(item.packUnitType, item.packSize),
        packSize: this.extractPackSize(item.packSize),
        packUnit: item.packUnitType.trim(),
        currentStock,
        minStockLevel,
        maxStockLevel:
          drug.maxStockLevel === null || drug.maxStockLevel === undefined
            ? undefined
            : this.toPositiveInt(drug.maxStockLevel, 1000),
        expiryDate,
        batchNumber: item.batchNumber.trim(),
        hsnCode: item.hsnCode.trim(),
        gstRate,
        requiresPrescription: true,
        status: 'ACTIVE',
        stockStatus: this.deriveIncomingStockStatus({
          currentStock,
          minStockLevel,
          expiryDate,
        }),
        drugs: {
          connect: {
            id: drug.id,
          },
        },
      },
    });
  }

  private async createPurchaseStockTransaction(
    tx: any,
    invoice: any,
    item: any,
    inventoryItem: any,
    quantities: PurchaseStockQuantities,
    expiryDate: Date,
    userId: string,
    branchId: string,
    stockCommitReference: string,
  ): Promise<void> {
    const taxableAmount = this.money(item.taxableAmount);
    const effectiveUnitCost =
      quantities.totalQuantity > 0
        ? taxableAmount / quantities.totalQuantity
        : 0;

    await tx.stockTransaction.create({
      data: {
        branchId,
        itemId: inventoryItem.id,
        userId,
        type: 'PURCHASE',
        quantity: quantities.totalQuantity,
        unitPrice: this.money(effectiveUnitCost),
        totalAmount: this.money(effectiveUnitCost * quantities.totalQuantity),
        reference: stockCommitReference,
        notes: `Purchase invoice ${invoice.invoiceNumber}, line ${item.lineNumber}: purchased ${quantities.purchasedQuantity}, free ${quantities.freeQuantity}; effective cost spread across total stock quantity`,
        batchNumber: item.batchNumber.trim(),
        expiryDate,
        supplier: invoice.distributorName,
      },
    });
  }

  private getPurchaseStockQuantities(item: any): PurchaseStockQuantities {
    const purchasedQuantity = this.money(item.quantityPurchased);
    const freeQuantity = this.money(item.freeQuantity);
    const totalQuantity = this.money(purchasedQuantity + freeQuantity);

    if (
      !Number.isInteger(purchasedQuantity) ||
      !Number.isInteger(freeQuantity) ||
      !Number.isInteger(totalQuantity)
    ) {
      throw new BadRequestException(
        `${this.lineLabel(item)}: purchase stock quantities must be whole numbers`,
      );
    }
    if (purchasedQuantity < 0 || freeQuantity < 0 || totalQuantity <= 0) {
      throw new BadRequestException(
        `${this.lineLabel(item)}: purchased quantity plus free quantity must be greater than zero`,
      );
    }

    return { purchasedQuantity, freeQuantity, totalQuantity };
  }

  private getExpiryDate(item: any): Date {
    const expiryMonth = Number(item.expiryMonth);
    const expiryYear = Number(item.expiryYear);
    if (
      !Number.isInteger(expiryMonth) ||
      expiryMonth < 1 ||
      expiryMonth > 12 ||
      !Number.isInteger(expiryYear) ||
      expiryYear < 2020
    ) {
      throw new BadRequestException(
        `${this.lineLabel(item)}: expiry month/year is invalid`,
      );
    }

    return new Date(expiryYear, expiryMonth, 0, 23, 59, 59, 999);
  }

  private isSamePurchaseBatch(
    candidate: any,
    item: any,
    expiryDate: Date,
  ): boolean {
    return (
      this.sameExpiryMonth(candidate.expiryDate, expiryDate) &&
      this.money(candidate.mrp) === this.money(item.mrp)
    );
  }

  private sameExpiryMonth(
    left?: Date | string | null,
    right?: Date | string | null,
  ): boolean {
    if (!left || !right) return false;
    const leftDate = new Date(left);
    const rightDate = new Date(right);
    return (
      leftDate.getFullYear() === rightDate.getFullYear() &&
      leftDate.getMonth() === rightDate.getMonth()
    );
  }

  private deriveIncomingStockStatus(item: {
    currentStock: number;
    minStockLevel?: number | null;
    reorderLevel?: number | null;
    expiryDate?: Date | string | null;
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

  private mapUnitType(packUnitType?: string, packSize?: string): string {
    const normalized = `${packUnitType ?? ''} ${packSize ?? ''}`.toLowerCase();
    if (normalized.includes('strip')) return 'STRIPS';
    if (normalized.includes('bottle') || normalized.includes('ml')) {
      return 'BOTTLES';
    }
    if (
      normalized.includes('tube') ||
      normalized.includes('gm') ||
      normalized.includes('gram')
    ) {
      return 'TUBES';
    }
    if (normalized.includes('vial')) return 'VIALS';
    if (normalized.includes('amp')) return 'AMPOULES';
    if (normalized.includes('syringe')) return 'SYRINGES';
    if (normalized.includes('kit')) return 'KITS';
    if (normalized.includes('box')) return 'BOXES';
    if (normalized.includes('pack')) return 'PACKS';
    return 'PIECES';
  }

  private extractPackSize(packSize?: string): number | undefined {
    const match = String(packSize ?? '').match(/\d+/);
    if (!match) return undefined;
    const parsed = Number(match[0]);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  private buildStockCommitReference(invoice: any): string {
    const invoiceNumber = String(invoice.invoiceNumber ?? invoice.id).trim();
    return `PINV-${invoiceNumber}-${String(invoice.id).slice(-8)}`;
  }

  private lineLabel(item: any): string {
    return `Line ${item.lineNumber ?? '?'}`;
  }

  private async findMasterMatchCandidates(
    item: CreatePharmacyPurchaseInvoiceItemDto,
    branchId: string,
  ) {
    const terms = this.matchTerms(item);
    const whereOr = terms.map((term) => ({
      OR: [
        { name: { contains: term, mode: 'insensitive' as const } },
        {
          manufacturerName: {
            contains: term,
            mode: 'insensitive' as const,
          },
        },
        { packSizeLabel: { contains: term, mode: 'insensitive' as const } },
        { composition1: { contains: term, mode: 'insensitive' as const } },
      ],
    }));

    const candidates = await this.prisma.drug.findMany({
      where: {
        branchId,
        isActive: true,
        isDiscontinued: false,
        ...(whereOr.length ? { OR: whereOr } : {}),
      },
      select: {
        id: true,
        name: true,
        price: true,
        manufacturerName: true,
        packSizeLabel: true,
        composition1: true,
        composition2: true,
        category: true,
        dosageForm: true,
        strength: true,
      },
      orderBy: { name: 'asc' },
      take: whereOr.length ? 200 : 50,
    });

    return candidates
      .map((drug) => this.scoreMasterCandidate(item, drug))
      .filter((candidate) => candidate.score >= 35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  private scoreMasterCandidate(
    item: CreatePharmacyPurchaseInvoiceItemDto,
    drug: MasterMatchDrug,
  ) {
    const nameScore = this.textSimilarity(item.productName, drug.name);
    const manufacturerScore = this.textSimilarity(
      item.manufacturer,
      drug.manufacturerName,
    );
    const packScore = this.textSimilarity(item.packSize, drug.packSizeLabel);
    const inferredStrength = this.inferStrength(item.productName);
    const strengthScore =
      drug.strength && inferredStrength !== 'Review strength'
        ? this.textSimilarity(inferredStrength, drug.strength)
      : 0;
    const dosageScore = drug.dosageForm
      ? this.textSimilarity(this.inferDosageForm(item), drug.dosageForm)
      : 0;

    const score = Math.min(
      100,
      this.money(
        nameScore * 58 +
          manufacturerScore * 18 +
          packScore * 14 +
          strengthScore * 6 +
          dosageScore * 4,
      ),
    );

    const reasons = [];
    if (nameScore >= 0.9) reasons.push('name exact/near match');
    else if (nameScore >= 0.65) reasons.push('name token overlap');
    if (manufacturerScore >= 0.8) reasons.push('manufacturer match');
    if (packScore >= 0.8) reasons.push('pack size match');
    if (strengthScore >= 0.8) reasons.push('strength match');

    return {
      drug: this.masterDrugSummary(drug),
      score,
      confidence: score >= 85 ? 'HIGH' : score >= 65 ? 'MEDIUM' : 'LOW',
      reasons,
    };
  }

  private matchTerms(item: CreatePharmacyPurchaseInvoiceItemDto): string[] {
    const inferredStrength = this.inferStrength(item.productName);
    const raw = [
      item.productName,
      item.manufacturer,
      item.packSize,
      inferredStrength === 'Review strength' ? '' : inferredStrength,
    ];
    const terms = new Set<string>();
    for (const value of raw) {
      for (const token of this.normalizeText(value).split(' ')) {
        if (token.length >= 4) terms.add(token);
      }
    }
    return [...terms].slice(0, 8);
  }

  private textSimilarity(a: unknown, b: unknown): number {
    const left = this.normalizeText(a);
    const right = this.normalizeText(b);
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) return 0.86;

    const leftTokens = new Set(left.split(' ').filter(Boolean));
    const rightTokens = new Set(right.split(' ').filter(Boolean));
    const intersection = [...leftTokens].filter((token) =>
      rightTokens.has(token),
    ).length;
    const union = new Set([...leftTokens, ...rightTokens]).size;
    const tokenScore = union ? intersection / union : 0;
    const editScore =
      1 -
      this.levenshtein(left, right) / Math.max(left.length, right.length, 1);
    return Math.max(tokenScore, editScore * 0.9);
  }

  private normalizeText(value: unknown): string {
    return this.cleanString(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|strip|strips|of|the)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private levenshtein(a: string, b: string): number {
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= b.length; j += 1) {
        current[j] =
          a[i - 1] === b[j - 1]
            ? previous[j - 1]
            : Math.min(previous[j - 1], previous[j], current[j - 1]) + 1;
      }
      for (let j = 0; j < current.length; j += 1) previous[j] = current[j];
    }
    return previous[b.length] ?? 0;
  }

  private masterLineSummary(item: CreatePharmacyPurchaseInvoiceItemDto) {
    return {
      productName: item.productName,
      manufacturer: item.manufacturer,
      packSize: item.packSize,
      packUnitType: item.packUnitType,
      hsnCode: item.hsnCode,
      batchNumber: item.batchNumber,
      mrp: this.money(item.mrp),
      purchaseRate: this.money(item.purchaseRate),
      expiryMonth: item.expiryMonth,
      expiryYear: item.expiryYear,
      ocrConfidence: item.ocrConfidence,
      ocrFlags: item.ocrFlags || [],
    };
  }

  private masterDrugSummary(drug: MasterMatchDrug | any) {
    return {
      id: drug.id,
      name: drug.name,
      price: this.money(drug.price),
      manufacturerName: drug.manufacturerName,
      packSizeLabel: drug.packSizeLabel,
      composition1: drug.composition1,
      composition2: drug.composition2,
      category: drug.category,
      dosageForm: drug.dosageForm,
      strength: drug.strength,
    };
  }

  private linePatchFromDrug(
    drug: MasterMatchDrug | any,
    item: CreatePharmacyPurchaseInvoiceItemDto,
  ) {
    return {
      productName: drug.name,
      manufacturer: drug.manufacturerName,
      packSize: drug.packSizeLabel,
      packUnitType: item.packUnitType,
      mrp: this.money(item.mrp || drug.price || 0),
      purchaseRate: this.money(item.purchaseRate),
    };
  }

  private inferComposition(productName: string): string {
    const name = this.cleanString(productName);
    return name || 'Review composition';
  }

  private inferCategory(_item: CreatePharmacyPurchaseInvoiceItemDto): string {
    return 'Uncategorized';
  }

  private inferDosageForm(item: CreatePharmacyPurchaseInvoiceItemDto): string {
    const text = `${item.productName || ''} ${item.packUnitType || ''}`.toLowerCase();
    if (/\b(cap|capsule)\b/.test(text)) return 'Capsule';
    if (/\b(cream|ointment|gel|lotion)\b/.test(text)) return 'Topical';
    if (/\b(syrup|suspension)\b/.test(text)) return 'Liquid';
    if (/\b(inj|injection)\b/.test(text)) return 'Injection';
    if (/\b(drop|drops)\b/.test(text)) return 'Drops';
    return 'Tablet';
  }

  private inferStrength(productName: string): string {
    const match = this.cleanString(productName).match(
      /\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|gm|ml|iu|%)\b/i,
    );
    return match?.[0] || 'Review strength';
  }

  private async buildOcrImageDataUrls(file: Express.Multer.File): Promise<{
    imageDataUrls: string[];
    pageCount: number;
    flags: string[];
  }> {
    const flags: string[] = [];
    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname?.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      const { pdf } = await import('pdf-to-img');
      const pageBuffers: Buffer[] = [];
      for await (const image of await pdf(file.buffer, { scale: 2 })) {
        pageBuffers.push(Buffer.from(image));
      }
      if (pageBuffers.length === 0) {
        throw new BadRequestException('PDF contains no pages');
      }

      const maxPages = this.toPositiveInt(
        Number(process.env.PHARMACY_PURCHASE_OCR_MAX_PAGES || 5),
        5,
      );
      if (pageBuffers.length > maxPages) {
        flags.push(`pdf_truncated_to_${maxPages}_pages`);
      }

      const selectedPages = pageBuffers.slice(0, maxPages);
      const imageDataUrls = await Promise.all(
        selectedPages.map((buffer) => this.bufferToVisionDataUrl(buffer)),
      );
      return {
        imageDataUrls,
        pageCount: pageBuffers.length,
        flags,
      };
    }

    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !detected.mime.startsWith('image/')) {
      throw new BadRequestException('Unsupported invoice image type');
    }

    return {
      imageDataUrls: [await this.bufferToVisionDataUrl(file.buffer)],
      pageCount: 1,
      flags,
    };
  }

  private async bufferToVisionDataUrl(buffer: Buffer): Promise<string> {
    const normalized = await sharp(buffer, { failOn: 'error' })
      .rotate()
      .resize({
        width: 1800,
        height: 1800,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    return `data:image/jpeg;base64,${normalized.toString('base64')}`;
  }

  private async extractPurchaseInvoiceJson(
    imageDataUrls: string[],
    apiKey: string,
    model: string,
  ): Promise<Record<string, any>> {
    const system =
      'You extract Indian pharmacy distributor purchase invoices for stock intake. ' +
      'Read invoice PDFs/images carefully, including headers, GSTIN/DL details, product rows, free quantity schemes, batch, expiry, HSN, MRP, purchase rate, discounts, GST, and invoice totals. ' +
      'Return STRICT JSON only with top-level key "draft". The draft object must use these keys: ' +
      'distributorName, distributorAddress, distributorGstin, distributorDlNo, distributorFoodLicense, invoiceNumber, invoiceDate, goodsReceivedDate, billType, dueDate, eWayBillNo, casesTransport, lrNo, salesmanName, salesmanContact, buyerCode, doctorNameOrRegNo, urcCode, handwrittenNotes, grossAmount, tradeDiscount, specialDiscount, cashDiscount, damageAdjustment, visibilityAmount, creditDebitAdjustment, taxableAmount, totalCgst, totalSgst, totalIgst, totalGst, tcsAmount, rounding, netPayable, ocrFlags, items. ' +
      'Dates must be YYYY-MM-DD. billType must be CASH or CREDIT. Use numbers for monetary and quantity fields. Use null for unknown values, not "N/A". ' +
      'Each item must use: serialNumber, productName, manufacturer, packSize, packUnitType, hsnCode, batchNumber, expiryMonth, expiryYear, quantityPurchased, freeQuantity, mrp, oldMrp, discountPercent, specialDiscountPercent, purchaseRate, taxableAmount, cgstPercent, sgstPercent, igstPercent, gstAmount, lineTotal, ocrConfidence, ocrFlags. ' +
      'Add ocrFlags for missing, uncertain, handwritten, cropped, or low-confidence fields. If no purchase invoice is visible, return {"draft":{"ocrFlags":["not_a_purchase_invoice"],"items":[]}}.';

    const content: Array<Record<string, any>> = [
      {
        type: 'text',
        text:
          'Extract the purchase invoice into the exact JSON schema. Keep every product row separate. Do not invent values.',
      },
      ...imageDataUrls.map((url) => ({
        type: 'image_url',
        image_url: { url },
      })),
    ];

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      this.logger.error(
        `purchase-invoices/ocr/extract OpenAI error: ${resp.status} ${errText}`,
      );
      throw new ServiceUnavailableException(
        'Failed to extract purchase invoice from the uploaded document',
      );
    }

    const data = (await resp.json()) as any;
    const contentText = data?.choices?.[0]?.message?.content || '{}';
    try {
      const parsed = this.parseJsonObject(contentText);
      return parsed?.draft ?? parsed?.purchaseInvoice ?? parsed?.invoice ?? parsed ?? {};
    } catch (error: any) {
      this.logger.error(
        `purchase-invoices/ocr/extract: failed to parse JSON response: ${error?.message || error}`,
      );
      throw new ServiceUnavailableException(
        'Invoice OCR returned an unreadable result. Try another scan or enter the bill manually.',
      );
    }
  }

  private parseJsonObject(content: string): any {
    const trimmed = String(content || '').trim();
    if (!trimmed) return {};
    try {
      return JSON.parse(trimmed);
    } catch {
      const first = trimmed.indexOf('{');
      const last = trimmed.lastIndexOf('}');
      if (first >= 0 && last > first) {
        return JSON.parse(trimmed.slice(first, last + 1));
      }
      throw new Error('No JSON object found');
    }
  }

  private normalizeExtractedPurchaseDraft(
    raw: Record<string, any>,
    documentFlags: string[],
  ): CreatePharmacyPurchaseInvoiceDto {
    const flags = [
      ...documentFlags,
      ...this.stringArray(raw?.ocrFlags),
    ];
    const itemsRaw = Array.isArray(raw?.items) ? raw.items : [];
    const items = itemsRaw.map((item, index) =>
      this.normalizeExtractedPurchaseLine(item, index + 1),
    );
    if (items.length === 0) flags.push('missing_items');

    const invoiceDate = this.normalizeDateString(raw?.invoiceDate);
    const goodsReceivedDate = this.normalizeDateString(raw?.goodsReceivedDate);
    const dueDate = this.normalizeDateString(raw?.dueDate);
    const billType = this.normalizeBillType(raw?.billType, dueDate);
    const distributorGstin = this.cleanString(raw?.distributorGstin).toUpperCase();

    const required: Array<[string, unknown]> = [
      ['distributorName', raw?.distributorName],
      ['distributorGstin', distributorGstin],
      ['distributorDlNo', raw?.distributorDlNo],
      ['invoiceNumber', raw?.invoiceNumber],
      ['invoiceDate', invoiceDate],
      ['doctorNameOrRegNo', raw?.doctorNameOrRegNo],
    ];
    for (const [field, value] of required) {
      if (!this.hasValue(value)) flags.push(`missing_${field}`);
    }
    if (distributorGstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(distributorGstin)) {
      flags.push('invalid_distributorGstin');
    }

    const lineTaxable = this.sum(items, (item) => item.taxableAmount || 0);
    const lineGst = this.sum(items, (item) => item.gstAmount || 0);
    const lineTotal = this.sum(items, (item) => item.lineTotal || 0);
    const totalCgst = this.optionalMoney(raw?.totalCgst);
    const totalSgst = this.optionalMoney(raw?.totalSgst);
    const totalIgst = this.optionalMoney(raw?.totalIgst);
    const totalGst =
      this.optionalMoney(raw?.totalGst) ??
      this.money((totalCgst || 0) + (totalSgst || 0) + (totalIgst || 0) || lineGst);
    const taxableAmount = this.optionalMoney(raw?.taxableAmount) ?? lineTaxable;
    const tcsAmount = this.optionalMoney(raw?.tcsAmount) ?? 0;
    const rounding = this.optionalMoney(raw?.rounding) ?? 0;
    const netPayable =
      this.optionalMoney(raw?.netPayable) ??
      this.optionalMoney(raw?.totalAmount) ??
      this.money(lineTotal + tcsAmount + rounding);
    const tradeDiscount = this.optionalMoney(raw?.tradeDiscount) ?? 0;
    const specialDiscount = this.optionalMoney(raw?.specialDiscount) ?? 0;
    const cashDiscount = this.optionalMoney(raw?.cashDiscount) ?? 0;
    const damageAdjustment = this.optionalMoney(raw?.damageAdjustment) ?? 0;
    const visibilityAmount = this.optionalMoney(raw?.visibilityAmount) ?? 0;
    const creditDebitAdjustment =
      this.optionalMoney(raw?.creditDebitAdjustment) ?? 0;
    const grossAmount =
      this.optionalMoney(raw?.grossAmount) ??
      this.money(
        taxableAmount +
          tradeDiscount +
          specialDiscount +
          cashDiscount +
          damageAdjustment +
          visibilityAmount +
          creditDebitAdjustment,
      );

    return {
      distributorName: this.cleanString(raw?.distributorName),
      distributorAddress: this.cleanString(raw?.distributorAddress),
      distributorGstin,
      distributorDlNo: this.cleanString(raw?.distributorDlNo),
      distributorFoodLicense: this.cleanString(raw?.distributorFoodLicense),
      invoiceNumber: this.cleanString(raw?.invoiceNumber),
      invoiceDate: invoiceDate || '',
      goodsReceivedDate,
      billType,
      dueDate,
      eWayBillNo: this.cleanString(raw?.eWayBillNo),
      casesTransport: this.cleanString(raw?.casesTransport),
      lrNo: this.cleanString(raw?.lrNo),
      salesmanName: this.cleanString(raw?.salesmanName),
      salesmanContact: this.cleanString(raw?.salesmanContact),
      buyerCode: this.cleanString(raw?.buyerCode),
      doctorNameOrRegNo: this.cleanString(raw?.doctorNameOrRegNo),
      urcCode: this.cleanString(raw?.urcCode),
      handwrittenNotes: this.cleanString(raw?.handwrittenNotes),
      source: PharmacyPurchaseInvoiceSourceDto.OCR,
      grossAmount,
      tradeDiscount,
      specialDiscount,
      cashDiscount,
      damageAdjustment,
      visibilityAmount,
      creditDebitAdjustment,
      taxableAmount,
      totalCgst: totalCgst || 0,
      totalSgst: totalSgst || 0,
      totalIgst: totalIgst || 0,
      totalGst,
      tcsAmount,
      rounding,
      netPayable,
      ocrFlags: Array.from(new Set(flags)).filter(Boolean),
      items,
    };
  }

  private normalizeExtractedPurchaseLine(
    raw: Record<string, any>,
    serialNumber: number,
  ): CreatePharmacyPurchaseInvoiceItemDto {
    const flags = this.stringArray(raw?.ocrFlags);
    const expiry = this.normalizeExpiry(raw);
    const productName = this.cleanString(
      raw?.productName ?? raw?.itemName ?? raw?.drugName ?? raw?.description,
    );
    const manufacturer = this.cleanString(
      raw?.manufacturer ?? raw?.manufacturerName ?? raw?.mfg,
    );
    const packSize = this.cleanString(raw?.packSize ?? raw?.pack);
    const packUnitType = this.cleanString(
      raw?.packUnitType ?? raw?.unitType ?? raw?.unit,
    );
    const hsnCode = this.cleanString(raw?.hsnCode ?? raw?.hsn);
    const batchNumber = this.cleanString(raw?.batchNumber ?? raw?.batchNo);
    const quantityPurchased =
      this.optionalMoney(
        raw?.quantityPurchased ?? raw?.paidQuantity ?? raw?.quantity ?? raw?.qty,
      ) ?? 0;
    const freeQuantity = this.optionalMoney(raw?.freeQuantity ?? raw?.freeQty) ?? 0;
    const taxableAmount =
      this.optionalMoney(raw?.taxableAmount ?? raw?.taxableValue) ?? 0;
    const gstPercent = this.optionalMoney(raw?.gstPercent ?? raw?.taxPercent);
    const explicitCgst = this.optionalMoney(raw?.cgstPercent);
    const explicitSgst = this.optionalMoney(raw?.sgstPercent);
    const explicitIgst = this.optionalMoney(raw?.igstPercent);
    const cgstPercent =
      explicitCgst ??
      (explicitIgst === undefined && explicitSgst === undefined && gstPercent
        ? this.money(gstPercent / 2)
        : 0);
    const sgstPercent =
      explicitSgst ??
      (explicitIgst === undefined && explicitCgst === undefined && gstPercent
        ? this.money(gstPercent / 2)
        : 0);
    const igstPercent = explicitIgst ?? 0;
    const gstAmount =
      this.optionalMoney(raw?.gstAmount ?? raw?.taxAmount) ??
      this.money((taxableAmount * (cgstPercent + sgstPercent + igstPercent)) / 100);
    const lineTotal =
      this.optionalMoney(raw?.lineTotal ?? raw?.totalAmount ?? raw?.amount) ??
      this.money(taxableAmount + gstAmount);
    const purchaseRate =
      this.optionalMoney(raw?.purchaseRate ?? raw?.rate ?? raw?.ptr) ??
      (quantityPurchased > 0 ? this.money(taxableAmount / quantityPurchased) : 0);
    const confidence = this.optionalMoney(raw?.ocrConfidence ?? raw?.confidence);

    for (const [field, value] of [
      ['productName', productName],
      ['manufacturer', manufacturer],
      ['packSize', packSize],
      ['packUnitType', packUnitType],
      ['hsnCode', hsnCode],
      ['batchNumber', batchNumber],
      ['expiry', expiry.month && expiry.year],
    ]) {
      if (!this.hasValue(value)) flags.push(`missing_${field}`);
    }
    if (confidence !== undefined && confidence < 0.9) {
      flags.push('low_confidence_line');
    }

    return {
      serialNumber:
        this.optionalInteger(raw?.serialNumber ?? raw?.srNo ?? raw?.lineNumber) ??
        serialNumber,
      productName,
      manufacturer,
      packSize,
      packUnitType,
      hsnCode,
      batchNumber,
      expiryMonth: expiry.month || 12,
      expiryYear: expiry.year || new Date().getFullYear() + 1,
      quantityPurchased,
      freeQuantity,
      mrp: this.optionalMoney(raw?.mrp) ?? 0,
      oldMrp: this.optionalMoney(raw?.oldMrp),
      discountPercent:
        this.optionalMoney(raw?.discountPercent ?? raw?.discount) ?? 0,
      specialDiscountPercent:
        this.optionalMoney(raw?.specialDiscountPercent) ?? 0,
      purchaseRate,
      taxableAmount,
      cgstPercent,
      sgstPercent,
      igstPercent,
      gstAmount,
      lineTotal,
      ocrConfidence: confidence,
      ocrFlags: Array.from(new Set(flags)).filter(Boolean),
    };
  }

  private normalizeBillType(
    value: unknown,
    dueDate?: string,
  ): PharmacyPurchaseBillTypeDto {
    const raw = this.cleanString(value).toUpperCase();
    if (raw.includes('CREDIT') || raw === 'CR' || dueDate) {
      return PharmacyPurchaseBillTypeDto.CREDIT;
    }
    return PharmacyPurchaseBillTypeDto.CASH;
  }

  private normalizeDateString(value: unknown): string | undefined {
    if (!this.hasValue(value)) return undefined;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    const raw = this.cleanString(value)
      .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, '$1')
      .replace(/\./g, '/');
    if (!raw) return undefined;
    const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (iso) return this.datePartsToInput(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (dmy) {
      const year = this.normalizeYear(Number(dmy[3]));
      return this.datePartsToInput(year, Number(dmy[2]), Number(dmy[1]));
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
  }

  private datePartsToInput(
    year: number,
    month: number,
    day: number,
  ): string | undefined {
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      !Number.isInteger(day) ||
      year < 1900 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {
      return undefined;
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return undefined;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private normalizeExpiry(raw: Record<string, any>): {
    month?: number;
    year?: number;
  } {
    const month = this.optionalInteger(raw?.expiryMonth);
    const year = this.optionalInteger(raw?.expiryYear);
    if (month && month >= 1 && month <= 12 && year) {
      return { month, year: this.normalizeYear(year) };
    }
    const combined = this.cleanString(
      raw?.expiry ?? raw?.expiryDate ?? raw?.exp ?? raw?.expDate,
    );
    const match = combined.match(/(\d{1,2})\s*[-/]\s*(\d{2,4})/);
    if (!match) return {};
    const parsedMonth = Number(match[1]);
    if (parsedMonth < 1 || parsedMonth > 12) return {};
    return {
      month: parsedMonth,
      year: this.normalizeYear(Number(match[2])),
    };
  }

  private normalizeYear(year: number): number {
    if (year < 100) return year >= 70 ? 1900 + year : 2000 + year;
    return year;
  }

  private cleanString(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim();
  }

  private stringArray(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map((item) => this.cleanString(item)).filter(Boolean);
    }
    return this.cleanString(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private optionalMoney(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'string') {
      const cleaned = value.replace(/[₹,\s]/g, '');
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? this.money(parsed) : undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? this.money(parsed) : undefined;
  }

  private optionalInteger(value: unknown): number | undefined {
    const parsed = this.optionalMoney(value);
    return parsed === undefined ? undefined : Math.trunc(parsed);
  }

  private hasValue(value: unknown): boolean {
    return value !== null && value !== undefined && String(value).trim() !== '';
  }

  private isExpired(
    expiryDate?: Date | string | null,
    now = new Date(),
  ): boolean {
    if (!expiryDate) return false;
    return new Date(expiryDate).getTime() < now.getTime();
  }

  private validateHeader(dto: CreatePharmacyPurchaseInvoiceDto): void {
    const invoiceDate = this.parseDate(dto.invoiceDate, 'invoiceDate');
    const goodsReceivedDate = dto.goodsReceivedDate
      ? this.parseDate(dto.goodsReceivedDate, 'goodsReceivedDate')
      : undefined;
    const dueDate = dto.dueDate
      ? this.parseDate(dto.dueDate, 'dueDate')
      : undefined;

    if (dto.billType === PharmacyPurchaseBillTypeDto.CREDIT && !dueDate) {
      throw new BadRequestException(
        'Due date is required for credit purchase bills',
      );
    }
    if (goodsReceivedDate && goodsReceivedDate < invoiceDate) {
      throw new BadRequestException(
        'Goods received date cannot be before invoice date',
      );
    }
    if (dueDate && dueDate < invoiceDate) {
      throw new BadRequestException('Due date cannot be before invoice date');
    }
    if (Math.abs(this.money(dto.rounding)) > 1) {
      throw new BadRequestException(
        'Rounding adjustment cannot exceed +/- Rs. 1',
      );
    }
  }

  private validatePurchaseInvoice(
    dto: CreatePharmacyPurchaseInvoiceDto,
  ): PurchaseValidationResult {
    const issues: string[] = [];
    let unresolvedOcrFlags = this.countOcrFlags(dto.ocrFlags);
    let lineTaxableSum = 0;
    let lineGstSum = 0;
    let lineTotalSum = 0;

    dto.items.forEach((item, index) => {
      const lineLabel = `Line ${index + 1}`;
      const itemFlags = this.validateLineItem(item, lineLabel);
      issues.push(...itemFlags);
      unresolvedOcrFlags += this.countOcrFlags(item.ocrFlags);
      if (item.ocrConfidence !== undefined && item.ocrConfidence < 0.9) {
        unresolvedOcrFlags += 1;
      }
      lineTaxableSum += this.money(item.taxableAmount);
      lineGstSum += this.money(item.gstAmount);
      lineTotalSum += this.money(item.lineTotal);
    });

    const totalDiscount =
      this.money(dto.tradeDiscount) +
      this.money(dto.specialDiscount) +
      this.money(dto.cashDiscount) +
      this.money(dto.damageAdjustment) +
      this.money(dto.visibilityAmount) +
      this.money(dto.creditDebitAdjustment);
    const expectedTaxable = this.money(dto.grossAmount) - totalDiscount;
    if (!this.withinTolerance(expectedTaxable, dto.taxableAmount)) {
      issues.push(
        `Header taxable mismatch: gross minus discounts is ${this.money(expectedTaxable)}, supplied taxable is ${this.money(dto.taxableAmount)}`,
      );
    }

    const expectedTotalGst =
      this.money(dto.totalCgst) +
      this.money(dto.totalSgst) +
      this.money(dto.totalIgst);
    if (!this.withinTolerance(expectedTotalGst, dto.totalGst)) {
      issues.push(
        `Header GST mismatch: CGST+SGST+IGST is ${this.money(expectedTotalGst)}, supplied total GST is ${this.money(dto.totalGst)}`,
      );
    }

    const expectedNetPayable =
      this.money(dto.taxableAmount) +
      this.money(dto.totalGst) +
      this.money(dto.tcsAmount) +
      this.money(dto.rounding);
    if (!this.withinTolerance(expectedNetPayable, dto.netPayable)) {
      issues.push(
        `Header net payable mismatch: taxable+GST+TCS+rounding is ${this.money(expectedNetPayable)}, supplied net payable is ${this.money(dto.netPayable)}`,
      );
    }

    if (!this.withinTolerance(lineTaxableSum, dto.taxableAmount)) {
      issues.push(
        `Line taxable sum ${this.money(lineTaxableSum)} does not match header taxable ${this.money(dto.taxableAmount)}`,
      );
    }
    if (!this.withinTolerance(lineGstSum, dto.totalGst)) {
      issues.push(
        `Line GST sum ${this.money(lineGstSum)} does not match header GST ${this.money(dto.totalGst)}`,
      );
    }
    if (
      !this.withinTolerance(
        lineTotalSum,
        dto.netPayable - this.money(dto.tcsAmount) - this.money(dto.rounding),
      )
    ) {
      issues.push(
        `Line total sum ${this.money(lineTotalSum)} does not match taxable+GST total`,
      );
    }

    const status =
      unresolvedOcrFlags > 0
        ? 'OCR_REVIEW_REQUIRED'
        : issues.length > 0
          ? 'RECONCILIATION_FAILED'
          : 'DRAFT';

    return { status, unresolvedOcrFlags, reconciliationIssues: issues };
  }

  private validateLineItem(
    item: CreatePharmacyPurchaseInvoiceItemDto,
    lineLabel: string,
  ): string[] {
    const issues: string[] = [];
    const quantityPurchased = this.money(item.quantityPurchased);
    const freeQuantity = this.money(item.freeQuantity);
    if (quantityPurchased + freeQuantity <= 0) {
      throw new BadRequestException(
        `${lineLabel}: purchased quantity plus free quantity must be greater than zero`,
      );
    }

    const expiryDate = new Date(
      item.expiryYear,
      item.expiryMonth,
      0,
      23,
      59,
      59,
    );
    if (expiryDate < new Date()) {
      issues.push(`${lineLabel}: batch is already expired`);
    }

    const gstPercent =
      this.money(item.cgstPercent) +
      this.money(item.sgstPercent) +
      this.money(item.igstPercent);
    const expectedGst = (this.money(item.taxableAmount) * gstPercent) / 100;
    if (!this.withinTolerance(expectedGst, item.gstAmount)) {
      issues.push(
        `${lineLabel}: GST mismatch, expected ${this.money(expectedGst)} from taxable and GST rate`,
      );
    }

    const expectedLineTotal =
      this.money(item.taxableAmount) + this.money(item.gstAmount);
    if (!this.withinTolerance(expectedLineTotal, item.lineTotal)) {
      issues.push(
        `${lineLabel}: line total mismatch, taxable plus GST is ${this.money(expectedLineTotal)}`,
      );
    }

    return issues;
  }

  private toPurchaseInvoiceItemCreate(
    item: CreatePharmacyPurchaseInvoiceItemDto,
    lineNumber: number,
  ) {
    return {
      lineNumber,
      serialNumber: item.serialNumber,
      productName: item.productName.trim(),
      manufacturer: item.manufacturer.trim(),
      packSize: item.packSize.trim(),
      packUnitType: item.packUnitType.trim(),
      hsnCode: item.hsnCode.trim(),
      batchNumber: item.batchNumber.trim(),
      expiryMonth: item.expiryMonth,
      expiryYear: item.expiryYear,
      quantityPurchased: this.money(item.quantityPurchased),
      freeQuantity: this.money(item.freeQuantity),
      mrp: this.money(item.mrp),
      oldMrp: item.oldMrp === undefined ? undefined : this.money(item.oldMrp),
      discountPercent: this.money(item.discountPercent),
      specialDiscountPercent: this.money(item.specialDiscountPercent),
      purchaseRate: this.money(item.purchaseRate),
      taxableAmount: this.money(item.taxableAmount),
      cgstPercent: this.money(item.cgstPercent),
      sgstPercent: this.money(item.sgstPercent),
      igstPercent: this.money(item.igstPercent),
      gstAmount: this.money(item.gstAmount),
      lineTotal: this.money(item.lineTotal),
      ocrConfidence: item.ocrConfidence,
      ocrFlags: item.ocrFlags?.length
        ? JSON.stringify(item.ocrFlags)
        : undefined,
    };
  }

  private formatPurchaseInvoice(invoice: any) {
    return {
      ...invoice,
      reconciliationIssues: this.parseIssues(invoice.reconciliationIssues),
      items: Array.isArray(invoice.items)
        ? invoice.items.map((item: any) => ({
            ...item,
            ocrFlags: this.parseIssues(item.ocrFlags),
          }))
        : undefined,
    };
  }

  private normalizeSortBy(sortBy?: string): string {
    const allowed = new Set([
      'invoiceDate',
      'createdAt',
      'updatedAt',
      'netPayable',
      'invoiceNumber',
      'status',
    ]);
    if (!sortBy) return 'invoiceDate';
    if (!allowed.has(sortBy)) {
      throw new BadRequestException(`Unsupported sortBy field: ${sortBy}`);
    }
    return sortBy;
  }

  private sum<T>(items: T[], pick: (item: T) => number): number {
    return this.money(items.reduce((total, item) => total + pick(item), 0));
  }

  private percent(numerator: number, denominator: number): number {
    if (!denominator) return 0;
    return this.money((numerator / denominator) * 100);
  }

  private unitCost(amount: number, quantity: number): number {
    if (!quantity) return 0;
    return this.money(amount / quantity);
  }

  private weightedAverage<T>(
    items: T[],
    value: (item: T) => number,
    weight: (item: T) => number,
  ): number {
    const totalWeight = items.reduce((total, item) => total + weight(item), 0);
    if (!totalWeight) return 0;
    const weightedTotal = items.reduce(
      (total, item) => total + value(item) * weight(item),
      0,
    );
    return this.money(weightedTotal / totalWeight);
  }

  private parseDate(value: string, fieldName: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid date`);
    }
    return parsed;
  }

  private endOfDay(date: Date): Date {
    const result = new Date(date);
    result.setUTCHours(23, 59, 59, 999);
    return result;
  }

  private countOcrFlags(flags?: string[]): number {
    return Array.isArray(flags)
      ? flags.filter((flag) => flag.trim()).length
      : 0;
  }

  private withinTolerance(expected: number, actual: number): boolean {
    return (
      Math.abs(this.money(expected) - this.money(actual)) <= this.tolerance
    );
  }

  private money(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
  }

  private toPositiveInt(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private emptyToUndefined(value?: string): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }

  private stringifyIssues(issues: string[]): string | undefined {
    return issues.length > 0 ? JSON.stringify(issues) : undefined;
  }

  private parseIssues(value?: string | null): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [String(value)];
    }
  }

  private isUniqueConstraintError(error: any): boolean {
    return error?.code === 'P2002';
  }
}
