import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  CreatePartnerDailySaleDto,
  QueryPartnerDailySalesDto,
  QueryPartnerMissingSalesDto,
} from './dto/pharmacy-partner-sales.dto';

type PartnerDailySaleStatus =
  | 'SUBMITTED'
  | 'STOCK_COMMITTED'
  | 'PARTIAL_STOCK_COMMITTED'
  | 'RECONCILIATION_REQUIRED'
  | 'CANCELLED';

type PartnerDiscrepancyFlag =
  | 'LATE_ENTRY'
  | 'UNMATCHED_BATCH'
  | 'INSUFFICIENT_STOCK';

type PartnerSalesAccess = {
  canViewAll: boolean;
  partnerOrganizationId?: string;
};

type CommitLineResult = {
  committedQuantity: number;
  matchedInventoryItemId?: string;
  matchedDrugId?: string;
  discrepancyFlag?: PartnerDiscrepancyFlag;
  discrepancyReason?: string;
};

@Injectable()
export class PharmacyPartnerSalesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePartnerDailySaleDto, user: any) {
    const branchId = this.requireBranchId(user);
    const access = this.getAccessContext(user);
    const partnerOrganization = await this.resolvePartnerOrganization(
      this.prisma as any,
      dto,
      branchId,
      access,
    );
    const date = this.normalizeDate(dto.date);
    const submittedById = this.getUserId(user);
    const lateEntry = this.isLateEntry(date, partnerOrganization.cutoffHour);
    const flags: PartnerDiscrepancyFlag[] = lateEntry ? ['LATE_ENTRY'] : [];
    const totals = this.calculateTotals(dto.items);

    const existing = await (this.prisma as any).partnerDailySale.findFirst({
      where: {
        branchId,
        partnerOrganizationId: partnerOrganization.id,
        date,
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'A partner daily sale already exists for this organization and date',
      );
    }

    const sale = await (this.prisma as any).partnerDailySale.create({
      data: {
        branchId,
        partnerOrganizationId: partnerOrganization.id,
        partnerOrganizationName: partnerOrganization.name,
        partnerUserId:
          dto.partnerUserId || (!access.canViewAll ? submittedById : undefined),
        partnerUserName: dto.partnerUserName || this.getUserDisplayName(user),
        date,
        submittedById,
        source: dto.source || 'MANUAL',
        status: lateEntry ? 'RECONCILIATION_REQUIRED' : 'SUBMITTED',
        missingEntry: false,
        lateEntry,
        hasDiscrepancy: flags.length > 0,
        discrepancyFlags: this.stringifyFlags(flags),
        totalQuantity: totals.totalQuantity,
        grossAmount: totals.grossAmount,
        totalDiscount: totals.totalDiscount,
        netAmount: totals.netAmount,
        paymentSummary: JSON.stringify(totals.paymentSummary),
        items: {
          create: dto.items.map((item) => ({
            medicineName: item.medicineName.trim(),
            batchNumber: item.batchNumber.trim(),
            quantitySold: item.quantitySold,
            mrp: this.money(item.mrp),
            discountGiven: this.money(item.discountGiven || 0),
            paymentMode: item.paymentMode,
          })),
        },
      },
      include: this.saleInclude(),
    });

    return this.formatSale(sale);
  }

  async findAll(query: QueryPartnerDailySalesDto, user: any) {
    const branchId = this.requireBranchId(user);
    const access = this.getAccessContext(user);
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
    const where: any = {
      branchId,
      ...this.accessWhere(access),
    };

    if (query.date) {
      const range = this.dateRange(query.date);
      where.date = { gte: range.start, lt: range.end };
    }
    if (query.status) {
      where.status = query.status;
    }
    const orgFilter = query.partnerOrganizationId || query.org;
    if (orgFilter && access.canViewAll) {
      where.OR = [
        { partnerOrganizationId: orgFilter },
        {
          partnerOrganizationName: {
            contains: orgFilter,
            mode: 'insensitive',
          },
        },
      ];
    }

    const prismaAny = this.prisma as any;
    const [data, total] = await Promise.all([
      prismaAny.partnerDailySale.findMany({
        where,
        include: this.saleInclude(),
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prismaAny.partnerDailySale.count({ where }),
    ]);

    return {
      data: data.map((sale: any) => this.formatSale(sale)),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async todaySummary(user: any) {
    const branchId = this.requireBranchId(user);
    const access = this.getAccessContext(user);
    const date = this.normalizeDate(new Date().toISOString().slice(0, 10));
    const range = this.rangeFromDate(date);
    const where = {
      branchId,
      date: { gte: range.start, lt: range.end },
      ...this.accessWhere(access),
    };

    const prismaAny = this.prisma as any;
    const [sales, partnerCount] = await Promise.all([
      prismaAny.partnerDailySale.findMany({
        where,
        include: { items: true, partnerOrganization: true },
      }),
      this.countVisiblePartners(prismaAny, branchId, access),
    ]);

    const submittedOrgIds = new Set(
      sales.map((sale: any) => sale.partnerOrganizationId),
    );
    const statusCounts = sales.reduce(
      (acc: Record<string, number>, sale: any) => {
        acc[sale.status] = (acc[sale.status] || 0) + 1;
        return acc;
      },
      {},
    );

    return {
      date: date.toISOString().slice(0, 10),
      partnerCount,
      submittedCount: sales.length,
      missingCount: Math.max(0, partnerCount - submittedOrgIds.size),
      totalQuantity: sales.reduce(
        (sum: number, sale: any) => sum + Number(sale.totalQuantity || 0),
        0,
      ),
      grossAmount: this.money(
        sales.reduce(
          (sum: number, sale: any) => sum + Number(sale.grossAmount || 0),
          0,
        ),
      ),
      netAmount: this.money(
        sales.reduce(
          (sum: number, sale: any) => sum + Number(sale.netAmount || 0),
          0,
        ),
      ),
      discrepancyCount: sales.filter((sale: any) => sale.hasDiscrepancy).length,
      stockCommittedCount: sales.filter((sale: any) => sale.stockCommittedAt)
        .length,
      statusCounts,
    };
  }

  async missing(query: QueryPartnerMissingSalesDto, user: any) {
    const branchId = this.requireBranchId(user);
    const access = this.getAccessContext(user);
    const date = this.normalizeDate(
      query.date || new Date().toISOString().slice(0, 10),
    );
    const range = this.rangeFromDate(date);
    const prismaAny = this.prisma as any;

    const [partners, sales] = await Promise.all([
      prismaAny.partnerOrganization.findMany({
        where: {
          branchId,
          isActive: true,
          ...(access.canViewAll
            ? {}
            : { id: access.partnerOrganizationId || '__none__' }),
        },
        orderBy: { name: 'asc' },
      }),
      prismaAny.partnerDailySale.findMany({
        where: {
          branchId,
          date: { gte: range.start, lt: range.end },
          ...this.accessWhere(access),
        },
        select: { partnerOrganizationId: true },
      }),
    ]);

    const submitted = new Set(
      sales.map((sale: any) => sale.partnerOrganizationId),
    );
    const now = new Date();

    return {
      date: date.toISOString().slice(0, 10),
      cutoffHour: query.cutoffHour ?? 22,
      missingPartners: partners
        .filter((partner: any) => !submitted.has(partner.id))
        .map((partner: any) => {
          const cutoffHour = query.cutoffHour ?? partner.cutoffHour ?? 22;
          const cutoffAt = new Date(date);
          cutoffAt.setUTCHours(cutoffHour, 0, 0, 0);
          return {
            partnerOrganizationId: partner.id,
            partnerOrganizationName: partner.name,
            cutoffHour,
            cutoffAt: cutoffAt.toISOString(),
            cutoffReached: now.getTime() >= cutoffAt.getTime(),
            late: now.getTime() >= cutoffAt.getTime(),
          };
        }),
    };
  }

  async commitStock(id: string, user: any) {
    const branchId = this.requireBranchId(user);
    const userId = this.requireUserId(user);
    const access = this.getAccessContext(user);
    const prismaAny = this.prisma as any;

    return prismaAny.$transaction(async (tx: any) => {
      const sale = await tx.partnerDailySale.findFirst({
        where: {
          id,
          branchId,
          ...this.accessWhere(access),
        },
        include: this.saleInclude(),
      });

      if (!sale) {
        throw new NotFoundException('Partner daily sale not found');
      }
      if (sale.status === 'CANCELLED') {
        throw new BadRequestException(
          'Cancelled partner sales cannot commit stock',
        );
      }
      if (sale.stockCommittedAt) {
        return this.formatSale(sale);
      }

      const claimedAt = new Date();
      const claim = await tx.partnerDailySale.updateMany({
        where: {
          id,
          branchId,
          stockCommittedAt: null,
        },
        data: {
          stockCommittedAt: claimedAt,
          stockCommittedBy: userId,
        },
      });

      if (claim.count !== 1) {
        const current = await tx.partnerDailySale.findFirst({
          where: { id, branchId },
          include: this.saleInclude(),
        });
        if (current?.stockCommittedAt) {
          return this.formatSale(current);
        }
        throw new ConflictException(
          'Partner sale changed while committing stock. Refresh and retry.',
        );
      }

      const itemResults: CommitLineResult[] = [];
      for (const item of sale.items || []) {
        itemResults.push(
          await this.commitSaleItem(tx, sale, item, branchId, userId),
        );
      }

      const totalSold = (sale.items || []).reduce(
        (sum: number, item: any) => sum + Number(item.quantitySold || 0),
        0,
      );
      const totalCommitted = itemResults.reduce(
        (sum, item) => sum + item.committedQuantity,
        0,
      );
      const flags = Array.from(
        new Set([
          ...(this.parseFlags(
            sale.discrepancyFlags,
          ) as PartnerDiscrepancyFlag[]),
          ...itemResults
            .map((result) => result.discrepancyFlag)
            .filter(Boolean),
        ]),
      ) as PartnerDiscrepancyFlag[];
      const hasDiscrepancy = Boolean(sale.lateEntry || flags.length > 0);
      const status = this.deriveCommittedStatus(
        totalSold,
        totalCommitted,
        hasDiscrepancy,
      );

      const updated = await tx.partnerDailySale.update({
        where: { id },
        data: {
          status,
          hasDiscrepancy,
          discrepancyFlags: this.stringifyFlags(flags),
        },
        include: this.saleInclude(),
      });

      return this.formatSale(updated);
    });
  }

  private async commitSaleItem(
    tx: any,
    sale: any,
    item: any,
    branchId: string,
    userId: string,
  ): Promise<CommitLineResult> {
    const candidates = await this.findCandidateBatches(tx, branchId, item);
    let remaining = Number(item.quantitySold || 0);
    let committedQuantity = 0;
    let matchedInventoryItemId: string | undefined;
    let matchedDrugId: string | undefined;

    for (const candidate of candidates) {
      if (remaining <= 0) break;
      const available = Math.max(0, Number(candidate.currentStock || 0));
      const quantity = Math.min(remaining, available);
      if (quantity <= 0) continue;

      await this.decrementInventory(tx, candidate.id, quantity, branchId);
      await tx.stockTransaction.create({
        data: {
          branchId,
          itemId: candidate.id,
          userId,
          type: 'SALE',
          quantity,
          unitPrice: this.effectiveUnitPrice(item),
          totalAmount: this.money(this.effectiveUnitPrice(item) * quantity),
          reference: `PARTNER-SALE-${sale.id}`,
          notes: `Partner daily sale ${sale.partnerOrganizationName}; source ${sale.source}; item ${item.medicineName}`,
          batchNumber: candidate.batchNumber || item.batchNumber,
          expiryDate: candidate.expiryDate || undefined,
          customer: sale.partnerOrganizationName,
          reason: 'PARTNER_DAILY_SYNC',
        },
      });

      committedQuantity += quantity;
      remaining -= quantity;
      matchedInventoryItemId = matchedInventoryItemId || candidate.id;
      matchedDrugId = matchedDrugId || candidate.drugs?.[0]?.id;
    }

    const result: CommitLineResult = {
      committedQuantity,
      matchedInventoryItemId,
      matchedDrugId,
    };

    if (committedQuantity === 0) {
      result.discrepancyFlag = 'UNMATCHED_BATCH';
      result.discrepancyReason = `No matching active stock found for ${item.medicineName} batch ${item.batchNumber}`;
    } else if (committedQuantity < Number(item.quantitySold || 0)) {
      result.discrepancyFlag = 'INSUFFICIENT_STOCK';
      result.discrepancyReason = `Sold ${item.quantitySold}, committed ${committedQuantity}; excess ${Number(item.quantitySold) - committedQuantity} left for reconciliation`;
    }

    await tx.partnerDailySaleItem.update({
      where: { id: item.id },
      data: {
        matchedInventoryItemId,
        matchedDrugId,
        committedQuantity,
        discrepancyFlag: result.discrepancyFlag,
        discrepancyReason: result.discrepancyReason,
      },
    });

    return result;
  }

  private async findCandidateBatches(tx: any, branchId: string, item: any) {
    const medicineName = String(item.medicineName || '').trim();
    const batchNumber = String(item.batchNumber || '').trim();
    const activeStockWhere = {
      branchId,
      status: 'ACTIVE',
      currentStock: { gt: 0 },
    };
    const include = { drugs: true };
    const byBatch = batchNumber
      ? await tx.inventoryItem.findMany({
          where: {
            ...activeStockWhere,
            batchNumber,
          },
          include,
          orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
        })
      : [];

    const byName = medicineName
      ? await tx.inventoryItem.findMany({
          where: {
            ...activeStockWhere,
            OR: this.nameMatchWhere(medicineName),
          },
          include,
          orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
        })
      : [];

    const combined = [...byBatch, ...byName];
    const seen = new Set<string>();
    return combined
      .filter((candidate: any) => {
        if (seen.has(candidate.id)) return false;
        seen.add(candidate.id);
        return true;
      })
      .sort((a: any, b: any) => {
        const aScore = this.matchScore(a, medicineName, batchNumber);
        const bScore = this.matchScore(b, medicineName, batchNumber);
        if (aScore !== bScore) return bScore - aScore;
        return (
          new Date(a.expiryDate || '9999-12-31').getTime() -
          new Date(b.expiryDate || '9999-12-31').getTime()
        );
      });
  }

  private nameMatchWhere(medicineName: string) {
    return [
      { name: { contains: medicineName, mode: 'insensitive' } },
      { brandName: { contains: medicineName, mode: 'insensitive' } },
      { genericName: { contains: medicineName, mode: 'insensitive' } },
      {
        drugs: {
          some: {
            name: { contains: medicineName, mode: 'insensitive' },
          },
        },
      },
    ];
  }

  private matchScore(
    candidate: any,
    medicineName: string,
    batchNumber: string,
  ) {
    let score = 0;
    if (
      batchNumber &&
      String(candidate.batchNumber || '').toLowerCase() ===
        batchNumber.toLowerCase()
    ) {
      score += 10;
    }
    const needle = medicineName.toLowerCase();
    const names = [
      candidate.name,
      candidate.brandName,
      candidate.genericName,
      ...(candidate.drugs || []).map((drug: any) => drug.name),
    ]
      .filter(Boolean)
      .map((value: string) => value.toLowerCase());
    if (needle && names.some((name: string) => name === needle)) score += 5;
    if (needle && names.some((name: string) => name.includes(needle)))
      score += 3;
    return score;
  }

  private async decrementInventory(
    tx: any,
    itemId: string,
    quantity: number,
    branchId: string,
  ) {
    const updated = await tx.inventoryItem.updateMany({
      where: {
        id: itemId,
        branchId,
        currentStock: { gte: quantity },
      },
      data: {
        currentStock: { decrement: quantity },
      },
    });

    if (updated.count !== 1) {
      throw new ConflictException(
        'Inventory changed while committing partner sale. Refresh and retry.',
      );
    }

    const item = await tx.inventoryItem.findUnique({
      where: { id: itemId },
      select: {
        currentStock: true,
        minStockLevel: true,
        reorderLevel: true,
        expiryDate: true,
      },
    });
    if (!item) {
      throw new ConflictException(
        'Inventory item disappeared while committing stock',
      );
    }
    await tx.inventoryItem.update({
      where: { id: itemId },
      data: { stockStatus: this.deriveStockStatus(item) },
    });
  }

  private deriveCommittedStatus(
    totalSold: number,
    totalCommitted: number,
    hasDiscrepancy: boolean,
  ): PartnerDailySaleStatus {
    if (totalCommitted >= totalSold && totalSold > 0) return 'STOCK_COMMITTED';
    if (totalCommitted > 0) return 'PARTIAL_STOCK_COMMITTED';
    return hasDiscrepancy ? 'RECONCILIATION_REQUIRED' : 'STOCK_COMMITTED';
  }

  private async resolvePartnerOrganization(
    prismaAny: any,
    dto: CreatePartnerDailySaleDto,
    branchId: string,
    access: PartnerSalesAccess,
  ) {
    let partnerOrganizationId = dto.partnerOrganizationId;
    if (!access.canViewAll) {
      if (!access.partnerOrganizationId) {
        throw new ForbiddenException(
          'Partner users must have metadata.partnerOrganizationId to submit sales',
        );
      }
      if (
        partnerOrganizationId &&
        partnerOrganizationId !== access.partnerOrganizationId
      ) {
        throw new ForbiddenException(
          'Partner users can only submit for their own organization',
        );
      }
      partnerOrganizationId = access.partnerOrganizationId;
    }

    if (partnerOrganizationId) {
      const partner = await prismaAny.partnerOrganization.findFirst({
        where: { id: partnerOrganizationId, branchId, isActive: true },
      });
      if (!partner)
        throw new NotFoundException('Partner organization not found');
      return partner;
    }

    const name = dto.partnerOrganizationName?.trim();
    if (!name) {
      throw new BadRequestException('partnerOrganizationName is required');
    }

    const existing = await prismaAny.partnerOrganization.findFirst({
      where: { branchId, name },
    });
    if (existing) return existing;

    return prismaAny.partnerOrganization.create({
      data: {
        branchId,
        name,
        partnerUserId: dto.partnerUserId,
      },
    });
  }

  private calculateTotals(items: CreatePartnerDailySaleDto['items']) {
    const paymentSummary: Record<string, number> = {};
    let totalQuantity = 0;
    let grossAmount = 0;
    let totalDiscount = 0;

    for (const item of items) {
      totalQuantity += item.quantitySold;
      grossAmount += item.quantitySold * Number(item.mrp || 0);
      totalDiscount += Number(item.discountGiven || 0);
      paymentSummary[item.paymentMode] =
        (paymentSummary[item.paymentMode] || 0) +
        this.money(
          item.quantitySold * Number(item.mrp || 0) -
            Number(item.discountGiven || 0),
        );
    }

    return {
      totalQuantity,
      grossAmount: this.money(grossAmount),
      totalDiscount: this.money(totalDiscount),
      netAmount: this.money(Math.max(0, grossAmount - totalDiscount)),
      paymentSummary,
    };
  }

  private effectiveUnitPrice(item: any) {
    const quantity = Math.max(1, Number(item.quantitySold || 1));
    return this.money(
      Math.max(
        0,
        Number(item.mrp || 0) - Number(item.discountGiven || 0) / quantity,
      ),
    );
  }

  private getAccessContext(user: any): PartnerSalesAccess {
    const role = String(user?.role || '').toUpperCase();
    const canViewAll = ['OWNER', 'ADMIN', 'PHARMACIST'].includes(role);
    const metadata = this.parseMetadata(user?.metadata);
    return {
      canViewAll,
      partnerOrganizationId:
        user?.partnerOrganizationId ||
        metadata?.partnerOrganizationId ||
        metadata?.partnerOrgId,
    };
  }

  private accessWhere(access: PartnerSalesAccess) {
    return access.canViewAll
      ? {}
      : { partnerOrganizationId: access.partnerOrganizationId || '__none__' };
  }

  private async countVisiblePartners(
    prismaAny: any,
    branchId: string,
    access: PartnerSalesAccess,
  ) {
    return prismaAny.partnerOrganization.count({
      where: {
        branchId,
        isActive: true,
        ...(access.canViewAll
          ? {}
          : { id: access.partnerOrganizationId || '__none__' }),
      },
    });
  }

  private saleInclude() {
    return {
      items: {
        orderBy: { createdAt: 'asc' },
      },
      partnerOrganization: true,
      submittedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
    };
  }

  private formatSale(sale: any) {
    return {
      ...sale,
      discrepancyFlags: this.parseFlags(sale.discrepancyFlags),
      paymentSummary: this.parseJsonObject(sale.paymentSummary),
    };
  }

  private normalizeDate(value: string) {
    if (!value) throw new BadRequestException('date is required');
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date');
    }
    return date;
  }

  private dateRange(value: string) {
    return this.rangeFromDate(this.normalizeDate(value));
  }

  private rangeFromDate(start: Date) {
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }

  private isLateEntry(date: Date, cutoffHour = 22) {
    const cutoffAt = new Date(date);
    cutoffAt.setUTCHours(cutoffHour, 0, 0, 0);
    return new Date().getTime() > cutoffAt.getTime();
  }

  private parseMetadata(metadata: unknown): Record<string, any> | null {
    if (!metadata) return null;
    if (typeof metadata === 'object') return metadata as Record<string, any>;
    try {
      return JSON.parse(String(metadata));
    } catch {
      return null;
    }
  }

  private parseFlags(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value))
      return value.filter((flag) => typeof flag === 'string');
    try {
      const parsed = JSON.parse(String(value));
      return Array.isArray(parsed)
        ? parsed.filter((flag) => typeof flag === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private stringifyFlags(flags: string[]) {
    return flags.length ? JSON.stringify(Array.from(new Set(flags))) : null;
  }

  private parseJsonObject(value: unknown) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private deriveStockStatus(item: {
    currentStock: number;
    minStockLevel?: number | null;
    reorderLevel?: number | null;
    expiryDate?: Date | null;
  }) {
    if (item.expiryDate && new Date(item.expiryDate).getTime() < Date.now()) {
      return 'EXPIRED';
    }
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

  private requireBranchId(user: any) {
    const branchId = user?.branchId;
    if (!branchId)
      throw new BadRequestException('Authenticated branch is required');
    return branchId;
  }

  private requireUserId(user: any) {
    const userId = this.getUserId(user);
    if (!userId)
      throw new BadRequestException('Authenticated user is required');
    return userId;
  }

  private getUserId(user: any) {
    return user?.id || user?.userId;
  }

  private getUserDisplayName(user: any) {
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
    return name || user?.name || user?.email || undefined;
  }

  private money(value: number) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }
}
