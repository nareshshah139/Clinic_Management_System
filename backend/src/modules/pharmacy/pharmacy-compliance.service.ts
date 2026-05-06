import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  ApplyPharmacyAuditAdjustmentsDto,
  CreatePharmacyAuditDto,
  ExpiryReturnWindowDto,
  PharmacyGstSummaryQueryDto,
  PharmacyMonthlyReportQueryDto,
} from './dto/pharmacy-compliance.dto';

type GstSlab = {
  slabPercent: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  grossAmount: number;
};

@Injectable()
export class PharmacyComplianceService {
  private readonly auditStatusPrefix = 'AUDIT_SESSION';

  constructor(private prisma: PrismaService) {}

  async getGstSummary(
    query: PharmacyGstSummaryQueryDto,
    branchId: string,
  ) {
    const { start, end } = this.dateRange(query.startDate, query.endDate);
    const [purchaseInvoices, salesInvoices] = await Promise.all([
      (this.prisma as any).pharmacyPurchaseInvoice.findMany({
        where: {
          branchId,
          invoiceDate: { gte: start, lte: end },
          status: { not: 'CANCELLED' },
        },
        include: { items: true },
      }),
      (this.prisma as any).pharmacyInvoice.findMany({
        where: {
          branchId,
          invoiceDate: { gte: start, lte: end },
          status: { not: 'CANCELLED' },
        },
        include: { items: true },
      }),
    ]);

    const purchaseSlabs = new Map<number, GstSlab>();
    for (const invoice of purchaseInvoices) {
      for (const item of invoice.items || []) {
        const slabPercent = this.money(
          (Number(item.cgstPercent) || 0) +
            (Number(item.sgstPercent) || 0) +
            (Number(item.igstPercent) || 0),
        );
        this.addSlab(purchaseSlabs, slabPercent, {
          taxableAmount: item.taxableAmount,
          cgst: this.percentAmount(item.taxableAmount, item.cgstPercent),
          sgst: this.percentAmount(item.taxableAmount, item.sgstPercent),
          igst: this.percentAmount(item.taxableAmount, item.igstPercent),
          totalGst: item.gstAmount,
          grossAmount: item.lineTotal,
        });
      }
    }

    const salesSlabs = new Map<number, GstSlab>();
    for (const invoice of salesInvoices) {
      for (const item of invoice.items || []) {
        const taxableAmount = this.money(
          Number(item.totalAmount || 0) - Number(item.taxAmount || 0),
        );
        const totalGst = this.money(item.taxAmount);
        const localTax = this.money(totalGst / 2);
        this.addSlab(salesSlabs, this.money(item.taxPercent), {
          taxableAmount,
          cgst: localTax,
          sgst: localTax,
          igst: 0,
          totalGst,
          grossAmount: item.totalAmount,
        });
      }
    }

    const purchaseInputGst = this.sumSlabs(purchaseSlabs).totalGst;
    const salesOutputGst = this.sumSlabs(salesSlabs).totalGst;

    return {
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      purchaseInputGst,
      salesOutputGst,
      netPayable: this.money(salesOutputGst - purchaseInputGst),
      purchases: {
        invoiceCount: purchaseInvoices.length,
        ...this.sumSlabs(purchaseSlabs),
        slabs: this.sortedSlabs(purchaseSlabs),
      },
      sales: {
        invoiceCount: salesInvoices.length,
        ...this.sumSlabs(salesSlabs),
        slabs: this.sortedSlabs(salesSlabs),
      },
    };
  }

  async getMonthlyReport(
    query: PharmacyMonthlyReportQueryDto,
    branchId: string,
  ) {
    const { start, end } = this.monthRange(query.month);
    const [
      purchaseInvoices,
      salesInvoices,
      inventoryItems,
      stockTransactions,
      writeOffAdjustments,
    ] = await Promise.all([
      (this.prisma as any).pharmacyPurchaseInvoice.findMany({
        where: {
          branchId,
          invoiceDate: { gte: start, lte: end },
          status: { not: 'CANCELLED' },
        },
        include: { items: true },
      }),
      (this.prisma as any).pharmacyInvoice.findMany({
        where: {
          branchId,
          invoiceDate: { gte: start, lte: end },
          status: { not: 'CANCELLED' },
        },
        include: { items: true },
      }),
      (this.prisma as any).inventoryItem.findMany({ where: { branchId } }),
      (this.prisma as any).stockTransaction.findMany({
        where: {
          branchId,
          createdAt: { gte: start, lte: end },
          type: { in: ['SALE', 'EXPIRED', 'DAMAGED'] },
        },
        include: { item: true },
      }),
      (this.prisma as any).stockAdjustment.findMany({
        where: {
          branchId,
          createdAt: { gte: start, lte: end },
          type: { in: ['EXPIRY', 'DAMAGE'] },
        },
        include: { item: true },
      }),
    ]);

    const procurementTotal = this.money(
      purchaseInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.netPayable || 0), 0),
    );
    const purchaseTaxable = this.money(
      purchaseInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.taxableAmount || 0), 0),
    );
    const salesTotal = this.money(
      salesInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.totalAmount || 0), 0),
    );
    const salesTax = this.money(
      salesInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.taxAmount || 0), 0),
    );
    const salesBeforeTax = this.money(salesTotal - salesTax);
    const saleStockTransactions = stockTransactions.filter(
      (tx: any) => tx.type === 'SALE',
    );
    const writeOffTransactions = stockTransactions.filter((tx: any) =>
      ['EXPIRED', 'DAMAGED'].includes(tx.type),
    );
    const estimatedCogs = this.money(
      saleStockTransactions.reduce(
        (sum: number, tx: any) =>
          sum +
          Number(tx.quantity || 0) *
            Number(tx.item?.costPrice ?? tx.unitPrice ?? 0),
        0,
      ),
    );
    const stockValueAtCost = this.money(
      inventoryItems.reduce(
        (sum: number, item: any) => sum + Number(item.currentStock || 0) * Number(item.costPrice || 0),
        0,
      ),
    );
    const stockValueAtMrp = this.money(
      inventoryItems.reduce(
        (sum: number, item: any) =>
          sum +
          Number(item.currentStock || 0) *
            Number(item.mrp ?? item.sellingPrice ?? item.costPrice ?? 0),
        0,
      ),
    );
    const writeOffValue = this.money(
      writeOffTransactions.reduce(
        (sum: number, tx: any) => sum + Number(tx.totalAmount || 0),
        0,
      ) +
        writeOffAdjustments.reduce(
          (sum: number, adj: any) =>
            sum +
            Math.abs(Number(adj.quantity || 0)) *
              Number(adj.item?.costPrice || 0),
          0,
        ),
    );

    return {
      month: query.month,
      period: { startDate: start.toISOString(), endDate: end.toISOString() },
      procurement: {
        invoiceCount: purchaseInvoices.length,
        lineCount: purchaseInvoices.reduce(
          (sum: number, invoice: any) => sum + (invoice.items?.length || 0),
          0,
        ),
        taxableAmount: purchaseTaxable,
        gstAmount: this.money(
          purchaseInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.totalGst || 0), 0),
        ),
        netPayable: procurementTotal,
      },
      sales: {
        invoiceCount: salesInvoices.length,
        lineCount: salesInvoices.reduce(
          (sum: number, invoice: any) => sum + (invoice.items?.length || 0),
          0,
        ),
        beforeTax: salesBeforeTax,
        gstAmount: salesTax,
        totalAmount: salesTotal,
      },
      profitAndLoss: {
        revenue: salesBeforeTax,
        estimatedCogs,
        grossProfit: this.money(salesBeforeTax - estimatedCogs),
        grossMarginPercent:
          salesBeforeTax > 0
            ? this.money(((salesBeforeTax - estimatedCogs) / salesBeforeTax) * 100)
            : 0,
        expiredDamagedWriteOff: writeOffValue,
        netAfterWriteOff: this.money(salesBeforeTax - estimatedCogs - writeOffValue),
      },
      stockValue: {
        itemCount: inventoryItems.length,
        atCost: stockValueAtCost,
        atMrp: stockValueAtMrp,
      },
      writeOffs: {
        transactionCount: writeOffTransactions.length,
        adjustmentCount: writeOffAdjustments.length,
        valueAtCost: writeOffValue,
      },
      distributorPerformance: this.distributorPerformance(purchaseInvoices),
    };
  }

  async getExpiryReturns(window: ExpiryReturnWindowDto, branchId: string) {
    const now = new Date();
    const upper = new Date(now);
    if (window === ExpiryReturnWindowDto.ONE_MONTH) {
      upper.setMonth(upper.getMonth() + 1);
    } else if (window === ExpiryReturnWindowDto.THREE_MONTHS) {
      upper.setMonth(upper.getMonth() + 3);
    }

    const expiryFilter =
      window === ExpiryReturnWindowDto.EXPIRED
        ? { lt: now }
        : { gte: now, lte: this.endOfDay(upper) };

    const items: any[] = await (this.prisma as any).inventoryItem.findMany({
      where: {
        branchId,
        currentStock: { gt: 0 },
        expiryDate: expiryFilter,
      },
      orderBy: { expiryDate: 'asc' },
      take: 200,
    });

    return {
      window,
      generatedAt: new Date().toISOString(),
      totals: {
        batchCount: items.length,
        stockQuantity: items.reduce((sum: number, item: any) => sum + Number(item.currentStock || 0), 0),
        valueAtCost: this.money(
          items.reduce(
            (sum: number, item: any) => sum + Number(item.currentStock || 0) * Number(item.costPrice || 0),
            0,
          ),
        ),
        valueAtMrp: this.money(
          items.reduce(
            (sum: number, item: any) =>
              sum +
              Number(item.currentStock || 0) *
                Number(item.mrp ?? item.sellingPrice ?? item.costPrice ?? 0),
            0,
          ),
        ),
      },
      batches: items.map((item: any) => ({
        inventoryId: item.id,
        name: item.name,
        batchNumber: item.batchNumber,
        manufacturer: item.manufacturer,
        supplier: item.supplier,
        expiryDate: item.expiryDate,
        currentStock: item.currentStock,
        valueAtCost: this.money(Number(item.currentStock || 0) * Number(item.costPrice || 0)),
        valueAtMrp: this.money(
          Number(item.currentStock || 0) *
            Number(item.mrp ?? item.sellingPrice ?? item.costPrice ?? 0),
        ),
        suggestedAction:
          item.expiryDate && new Date(item.expiryDate) < now
            ? 'QUARANTINE_EXPIRED_STOCK'
            : 'RETURN_TO_DISTRIBUTOR_OR_MOVE_TO_EXPIRY_BIN',
      })),
    };
  }

  async createAuditBatch(
    dto: CreatePharmacyAuditDto,
    branchId: string,
    userId: string,
  ) {
    const where: any = { branchId };
    if (dto.inventoryIds?.length) where.id = { in: dto.inventoryIds };
    if (dto.category) where.category = { equals: dto.category, mode: 'insensitive' };
    if (dto.manufacturer) {
      where.manufacturer = { contains: dto.manufacturer, mode: 'insensitive' };
    }
    if (dto.expiryFrom || dto.expiryTo) {
      where.expiryDate = {};
      if (dto.expiryFrom) where.expiryDate.gte = new Date(dto.expiryFrom);
      if (dto.expiryTo) where.expiryDate.lte = this.endOfDay(new Date(dto.expiryTo));
    }

    const items: any[] = await (this.prisma as any).inventoryItem.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 500,
    });

    if (items.length === 0) {
      throw new NotFoundException('No inventory items matched audit selection');
    }

    const auditId = `audit-${randomUUID()}`;
    const status = this.auditStatus(auditId, 'PENDING');
    const createdRows = await (this.prisma as any).$transaction(
      async (tx: any) =>
        Promise.all(
          items.map((item: any) =>
            tx.inventoryAudit.create({
              data: {
                branchId,
                itemId: item.id,
                auditorId: userId,
                auditDate: new Date(),
                physicalStock: item.currentStock,
                systemStock: item.currentStock,
                variance: 0,
                status,
                notes: JSON.stringify({
                  auditId,
                  state: 'PENDING',
                  source: 'pharmacy-compliance',
                  filters: dto,
                  itemSnapshot: {
                    name: item.name,
                    batchNumber: item.batchNumber,
                    expiryDate: item.expiryDate,
                  },
                }),
              },
              include: { item: true },
            }),
          ),
        ),
    );

    return {
      auditId,
      status,
      itemCount: createdRows.length,
      createdAt: new Date().toISOString(),
      rows: createdRows.map((row: any) => this.auditRowSummary(row)),
    };
  }

  async applyAuditAdjustments(
    auditId: string,
    dto: ApplyPharmacyAuditAdjustmentsDto,
    branchId: string,
    userId: string,
    userRole?: string,
  ) {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Adjustment reason is required');
    }

    return (this.prisma as any).$transaction(async (tx: any) => {
      const itemIds = [...new Set(dto.counts.map((count) => count.inventoryId))];
      const [auditRows, inventoryItems]: [any[], any[]] = await Promise.all([
        tx.inventoryAudit.findMany({
          where: {
            branchId,
            status: { startsWith: `${this.auditStatusPrefix}:${auditId}:` },
          },
          include: { item: true },
        }),
        tx.inventoryItem.findMany({
          where: { branchId, id: { in: itemIds } },
        }),
      ]);

      if (auditRows.length === 0) {
        throw new NotFoundException('Audit batch not found');
      }

      const auditById = new Map<string, any>(
        auditRows.map((row: any) => [row.id, row]),
      );
      const auditByItem = new Map<string, any>(
        auditRows.map((row: any) => [row.itemId, row]),
      );
      const itemById = new Map<string, any>(
        inventoryItems.map((item: any) => [item.id, item]),
      );
      const adjustments = [];

      for (const count of dto.counts) {
        const auditRow =
          (count.auditRowId && auditById.get(count.auditRowId)) ||
          auditByItem.get(count.inventoryId);
        const item = itemById.get(count.inventoryId);

        if (!auditRow || !item) {
          throw new NotFoundException(
            `Audit inventory row not found for ${count.inventoryId}`,
          );
        }
        if (count.physicalStock < 0) {
          throw new BadRequestException('Physical stock cannot be negative');
        }

        const beforeStock = Number(item.currentStock || 0);
        const afterStock = Number(count.physicalStock);
        const delta = afterStock - beforeStock;
        if (afterStock < 0) {
          throw new BadRequestException(
            `Adjustment would make stock negative for ${item.name}`,
          );
        }

        const approvalRequired = this.approvalRequired(delta, item, userRole);
        let stockAdjustment = null;
        let stockTransaction = null;
        if (delta !== 0) {
          const metadata = {
            auditId,
            auditRowId: auditRow.id,
            userId,
            reason,
            beforeStock,
            afterStock,
            delta,
            approvalRequired,
          };
          stockAdjustment = await tx.stockAdjustment.create({
            data: {
              branchId,
              itemId: item.id,
              userId,
              type: 'PHYSICAL_COUNT',
              quantity: delta,
              reason,
              notes: dto.notes,
              metadata: JSON.stringify(metadata),
            },
          });
          stockTransaction = await tx.stockTransaction.create({
            data: {
              branchId,
              itemId: item.id,
              userId,
              type: 'ADJUSTMENT',
              quantity: Math.abs(delta),
              unitPrice: this.money(item.costPrice),
              totalAmount: this.money(Math.abs(delta) * Number(item.costPrice || 0)),
              reference: `AUDIT-${auditId}`,
              reason,
              notes: JSON.stringify(metadata),
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate,
              supplier: item.supplier,
              location: item.storageLocation,
            },
          });
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: {
              currentStock: afterStock,
              stockStatus: this.stockStatus(afterStock, item),
            },
          });
        }

        const updatedAudit = await tx.inventoryAudit.update({
          where: { id: auditRow.id },
          data: {
            physicalStock: afterStock,
            systemStock: beforeStock,
            variance: delta,
            status: this.auditStatus(auditId, 'ADJUSTED'),
            notes: JSON.stringify({
              auditId,
              state: 'ADJUSTED',
              userId,
              reason,
              beforeStock,
              afterStock,
              delta,
              approvalRequired,
              stockAdjustmentId: stockAdjustment?.id || null,
              stockTransactionId: stockTransaction?.id || null,
            }),
          },
        });

        adjustments.push({
          auditRowId: updatedAudit.id,
          inventoryId: item.id,
          itemName: item.name,
          userId,
          reason,
          beforeCount: beforeStock,
          afterCount: afterStock,
          variance: delta,
          approvalRequired,
          stockAdjustmentId: stockAdjustment?.id || null,
          stockTransactionId: stockTransaction?.id || null,
          transactionReference: stockTransaction?.reference || `AUDIT-${auditId}`,
        });
      }

      return {
        auditId,
        userId,
        reason,
        adjustedAt: new Date().toISOString(),
        adjustmentCount: adjustments.length,
        adjustments,
      };
    });
  }

  private distributorPerformance(invoices: any[]) {
    const byDistributor = new Map<string, any>();
    for (const invoice of invoices) {
      const key = `${invoice.distributorGstin || ''}|${invoice.distributorName || ''}`;
      const row =
        byDistributor.get(key) ||
        {
          distributorName: invoice.distributorName,
          distributorGstin: invoice.distributorGstin,
          invoiceCount: 0,
          lineCount: 0,
          netPayable: 0,
          gstAmount: 0,
          purchasedQuantity: 0,
          freeQuantity: 0,
          lastInvoiceDate: invoice.invoiceDate,
        };
      row.invoiceCount += 1;
      row.lineCount += invoice.items?.length || 0;
      row.netPayable = this.money(row.netPayable + Number(invoice.netPayable || 0));
      row.gstAmount = this.money(row.gstAmount + Number(invoice.totalGst || 0));
      for (const item of invoice.items || []) {
        row.purchasedQuantity = this.money(
          row.purchasedQuantity + Number(item.quantityPurchased || 0),
        );
        row.freeQuantity = this.money(row.freeQuantity + Number(item.freeQuantity || 0));
      }
      if (new Date(invoice.invoiceDate) > new Date(row.lastInvoiceDate)) {
        row.lastInvoiceDate = invoice.invoiceDate;
      }
      byDistributor.set(key, row);
    }
    return Array.from(byDistributor.values())
      .sort((a, b) => b.netPayable - a.netPayable)
      .slice(0, 10);
  }

  private addSlab(
    slabs: Map<number, GstSlab>,
    slabPercent: number,
    amounts: Omit<GstSlab, 'slabPercent'>,
  ) {
    const existing =
      slabs.get(slabPercent) || {
        slabPercent,
        taxableAmount: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        totalGst: 0,
        grossAmount: 0,
      };
    existing.taxableAmount = this.money(existing.taxableAmount + Number(amounts.taxableAmount || 0));
    existing.cgst = this.money(existing.cgst + Number(amounts.cgst || 0));
    existing.sgst = this.money(existing.sgst + Number(amounts.sgst || 0));
    existing.igst = this.money(existing.igst + Number(amounts.igst || 0));
    existing.totalGst = this.money(existing.totalGst + Number(amounts.totalGst || 0));
    existing.grossAmount = this.money(existing.grossAmount + Number(amounts.grossAmount || 0));
    slabs.set(slabPercent, existing);
  }

  private sumSlabs(slabs: Map<number, GstSlab>) {
    return this.sortedSlabs(slabs).reduce(
      (sum, slab) => ({
        taxableAmount: this.money(sum.taxableAmount + slab.taxableAmount),
        cgst: this.money(sum.cgst + slab.cgst),
        sgst: this.money(sum.sgst + slab.sgst),
        igst: this.money(sum.igst + slab.igst),
        totalGst: this.money(sum.totalGst + slab.totalGst),
        grossAmount: this.money(sum.grossAmount + slab.grossAmount),
      }),
      { taxableAmount: 0, cgst: 0, sgst: 0, igst: 0, totalGst: 0, grossAmount: 0 },
    );
  }

  private sortedSlabs(slabs: Map<number, GstSlab>) {
    return Array.from(slabs.values()).sort((a, b) => a.slabPercent - b.slabPercent);
  }

  private dateRange(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = this.endOfDay(new Date(endDate));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new BadRequestException('Invalid date range');
    }
    return { start, end };
  }

  private monthRange(month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException('month must be in YYYY-MM format');
    }
    const [year, monthIndex] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, monthIndex - 1, 1));
    const end = this.endOfDay(new Date(Date.UTC(year, monthIndex, 0)));
    return { start, end };
  }

  private endOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(23, 59, 59, 999);
    return next;
  }

  private auditStatus(auditId: string, state: string) {
    return `${this.auditStatusPrefix}:${auditId}:${state}`;
  }

  private auditRowSummary(row: any) {
    return {
      auditRowId: row.id,
      inventoryId: row.itemId,
      name: row.item?.name,
      batchNumber: row.item?.batchNumber,
      expiryDate: row.item?.expiryDate,
      systemStock: row.systemStock,
      physicalStock: row.physicalStock,
      variance: row.variance,
      status: row.status,
    };
  }

  private approvalRequired(delta: number, item: any, userRole?: string) {
    const adjustmentValue = Math.abs(delta) * Number(item.costPrice || 0);
    const privileged = ['OWNER', 'ADMIN', 'MANAGER'].includes(userRole || '');
    return !privileged && (delta < 0 || adjustmentValue >= 5000);
  }

  private stockStatus(stock: number, item: any) {
    if (stock <= 0) return 'OUT_OF_STOCK';
    if (item.expiryDate && new Date(item.expiryDate) < new Date()) return 'EXPIRED';
    if (item.reorderLevel !== null && item.reorderLevel !== undefined && stock <= item.reorderLevel) {
      return 'LOW_STOCK';
    }
    if (item.minStockLevel !== null && item.minStockLevel !== undefined && stock <= item.minStockLevel) {
      return 'LOW_STOCK';
    }
    return 'IN_STOCK';
  }

  private percentAmount(amount: number, percent: number) {
    return this.money((Number(amount || 0) * Number(percent || 0)) / 100);
  }

  private money(value: number) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }
}
