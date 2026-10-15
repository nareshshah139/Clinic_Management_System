import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { writeStockMovement } from '../inventory/inventory-stock';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  CreatePartnerDailySaleDto,
  CommitPartnerSaleStockDto,
  ReconcilePartnerSaleLineDto,
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
      data: data.map((sale: any) => this.formatSale(sale, access.canViewAll)),
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
      stockCommittedCount: sales.filter(
        (sale: any) => sale.status === 'STOCK_COMMITTED',
      ).length,
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

  /**
   * @cc [owner:nareshshah139,label:product] partner-outstanding-stock-only
   * A commit MUST deduct only each line's sold quantity minus its cumulative committed quantity.
   * Legacy partial commits remain retryable; completed deductions and sold snapshots stay unchanged.
   */
  /**
   * @cc [owner:nareshshah139,label:product] partner-stock-revision-atomic
   * The sale revision, cumulative line progress and held-stock-safe movements MUST commit atomically.
   * A stale revision or concurrent stock change MUST prevent new deductions for that attempt.
   */
  async commitStock(id: string, user: any, dto: CommitPartnerSaleStockDto) {
    const branchId = this.requireBranchId(user);
    const userId = this.requireUserId(user);
    const access = this.getAccessContext(user);
    this.requireVersion(dto?.expectedVersion);
    try {
      return await (this.prisma as any).$transaction(
        async (tx: any) => {
          const sale = await tx.partnerDailySale.findFirst({
            where: { id, branchId, ...this.accessWhere(access) },
            include: this.saleInclude(),
          });
          if (!sale)
            throw new NotFoundException('Partner daily sale not found');
          if (sale.status === 'CANCELLED')
            throw new BadRequestException(
              'Cancelled partner sales cannot commit stock',
            );
          for (const item of sale.items || []) {
            if (
              !Number.isSafeInteger(item.quantitySold) ||
              !Number.isSafeInteger(item.committedQuantity ?? 0) ||
              item.quantitySold < 0 ||
              (item.committedQuantity ?? 0) < 0 ||
              (item.committedQuantity ?? 0) > item.quantitySold
            ) {
              throw new ConflictException(
                'Partner sale quantities require reconciliation before retrying',
              );
            }
          }
          if (
            (sale.items || []).every(
              (item: any) =>
                Number(item.committedQuantity || 0) >= item.quantitySold,
            )
          ) {
            return this.formatSale(sale, access.canViewAll);
          }
          if ((sale.version ?? 0) !== dto.expectedVersion)
            throw new ConflictException(
              'Partner sale changed. Refresh before retrying outstanding stock.',
            );
          const claim = await tx.partnerDailySale.updateMany({
            where: { id, branchId, version: dto.expectedVersion },
            data: {
              version: { increment: 1 },
              stockCommittedAt: sale.stockCommittedAt || new Date(),
              stockCommittedBy: sale.stockCommittedBy || userId,
            },
          });
          if (claim.count !== 1)
            throw new ConflictException(
              'Partner sale changed. Refresh before retrying outstanding stock.',
            );
          const itemResults: CommitLineResult[] = [];
          for (const item of sale.items || [])
            itemResults.push(
              await this.commitSaleItem(tx, sale, item, branchId, userId),
            );
          const totalSold = sale.items.reduce(
            (sum: number, item: any) => sum + item.quantitySold,
            0,
          );
          const totalCommitted = itemResults.reduce(
            (sum, item) => sum + item.committedQuantity,
            0,
          );
          const flags = Array.from(
            new Set<PartnerDiscrepancyFlag>([
              ...(sale.lateEntry ? ['LATE_ENTRY' as const] : []),
              ...itemResults
                .map((item) => item.discrepancyFlag)
                .filter((flag): flag is PartnerDiscrepancyFlag =>
                  Boolean(flag),
                ),
            ]),
          );
          const hasDiscrepancy = flags.length > 0;
          const updated = await tx.partnerDailySale.update({
            where: { id },
            data: {
              status: this.deriveCommittedStatus(
                totalSold,
                totalCommitted,
                hasDiscrepancy,
              ),
              hasDiscrepancy,
              discrepancyFlags: this.stringifyFlags(flags),
            },
            include: this.saleInclude(),
          });
          return this.formatSale(updated, access.canViewAll);
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (error?.code === 'P2034')
        throw new ConflictException(
          'Stock changed. Refresh the submission before retrying.',
        );
      throw error;
    }
  }

  /**
   * @cc [owner:nareshshah139,label:security] partner-recovery-staff-scope
   * Only branch staff may search recovery batches for an outstanding line belonging to their branch.
   * Results MUST omit prices, supplier details and other branches' inventory.
   */
  async recoveryMatches(
    id: string,
    lineId: string,
    search: string | undefined,
    user: any,
  ) {
    const branchId = this.requireBranchId(user);
    this.requireRecoveryStaff(user);
    const sale = await (this.prisma as any).partnerDailySale.findFirst({
      where: { id, branchId },
      include: this.saleInclude(),
    });
    const line = this.requireOutstandingLine(sale, lineId);
    if (search !== undefined && typeof search !== 'string')
      throw new BadRequestException('Enter one product name or batch');
    const query = (search ?? line.medicineName).trim();
    if (!query || query.length > 100)
      throw new BadRequestException(
        'Enter a product name or batch of at most 100 characters',
      );
    const rows = await this.prisma.inventoryItem.findMany({
      where: {
        branchId,
        status: 'ACTIVE',
        AND: [this.unexpiredWhere()],
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { batchNumber: { contains: query, mode: 'insensitive' } },
          {
            drugs: { some: { name: { contains: query, mode: 'insensitive' } } },
          },
        ],
      },
      take: 25,
      orderBy: [{ name: 'asc' }, { batchNumber: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        batchNumber: true,
        currentStock: true,
        heldStock: true,
        unit: true,
        expiryDate: true,
      },
    });
    return {
      matches: rows.map((row) => ({
        id: row.id,
        name: row.name,
        batchNumber: row.batchNumber,
        availableQuantity: Math.max(0, row.currentStock - row.heldStock),
        unit: row.unit,
        expiryDate: row.expiryDate,
      })),
    };
  }

  /**
   * @cc [owner:nareshshah139,label:product] partner-recovery-selection-audited
   * A staff-selected active branch batch and reason MUST be recorded atomically under the sale revision.
   * Selection MUST NOT alter sold snapshots, prior matched identities, committed quantities or stock.
   */
  async reconcileLine(
    id: string,
    lineId: string,
    dto: ReconcilePartnerSaleLineDto,
    user: any,
  ) {
    const branchId = this.requireBranchId(user);
    const userId = this.requireUserId(user);
    this.requireRecoveryStaff(user);
    this.requireVersion(dto?.expectedVersion);
    if (
      !dto.reason?.trim() ||
      dto.reason.trim().length > 500 ||
      !dto.inventoryItemId?.trim()
    )
      throw new BadRequestException(
        'Choose a batch and enter a reason of at most 500 characters',
      );
    return (this.prisma as any).$transaction(async (tx: any) => {
      const sale = await tx.partnerDailySale.findFirst({
        where: { id, branchId },
        include: this.saleInclude(),
      });
      const line = this.requireOutstandingLine(sale, lineId);
      if ((sale.version ?? 0) !== dto.expectedVersion)
        throw new ConflictException(
          'Partner sale changed. Refresh before correcting the match.',
        );
      const batch = await tx.inventoryItem.findFirst({
        where: {
          id: dto.inventoryItemId,
          branchId,
          status: 'ACTIVE',
          ...this.unexpiredWhere(),
        },
        select: { id: true },
      });
      if (!batch)
        throw new BadRequestException(
          'Choose an active, unexpired batch in this branch',
        );
      const claim = await tx.partnerDailySale.updateMany({
        where: { id, branchId, version: dto.expectedVersion },
        data: { version: { increment: 1 } },
      });
      if (claim.count !== 1)
        throw new ConflictException(
          'Partner sale changed. Refresh before correcting the match.',
        );
      await tx.partnerDailySaleItem.update({
        where: { id: line.id },
        data: { recoveryInventoryItemId: batch.id },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'PARTNER_SALE_LINE_MATCHED',
          entity: 'PartnerDailySaleItem',
          entityId: line.id,
          oldValues: JSON.stringify({
            branchId,
            saleId: id,
            recoveryInventoryItemId: line.recoveryInventoryItemId || null,
          }),
          newValues: JSON.stringify({
            branchId,
            saleId: id,
            recoveryInventoryItemId: batch.id,
            reason: dto.reason.trim(),
          }),
        },
      });
      return this.formatSale(
        await tx.partnerDailySale.findFirst({
          where: { id, branchId },
          include: this.saleInclude(),
        }),
        true,
      );
    });
  }

  private requireRecoveryStaff(user: any) {
    if (!this.getAccessContext(user).canViewAll)
      throw new ForbiddenException(
        'Only branch pharmacy staff can correct inventory matches',
      );
  }

  private requireVersion(version: number) {
    if (!Number.isSafeInteger(version) || version < 0)
      throw new BadRequestException('Refresh the submission before retrying');
  }

  private requireOutstandingLine(sale: any, lineId: string) {
    if (!sale) throw new NotFoundException('Partner daily sale not found');
    const line = sale.items?.find((item: any) => item.id === lineId);
    if (!line) throw new NotFoundException('Partner sale line not found');
    if (
      sale.status === 'CANCELLED' ||
      Number(line.committedQuantity || 0) >= line.quantitySold
    )
      throw new BadRequestException(
        'Only outstanding sale lines can be matched',
      );
    return line;
  }

  private unexpiredWhere() {
    return {
      OR: [
        { expiryDate: null },
        {
          expiryDate: {
            gte: new Date(
              new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z',
            ),
          },
        },
      ],
    };
  }

  private async commitSaleItem(
    tx: any,
    sale: any,
    item: any,
    branchId: string,
    userId: string,
  ): Promise<CommitLineResult> {
    const previouslyCommitted = Number(item.committedQuantity || 0);
    let committedQuantity = previouslyCommitted;
    let matchedInventoryItemId = item.matchedInventoryItemId;
    let matchedDrugId = item.matchedDrugId;
    const remaining = item.quantitySold - previouslyCommitted;
    const candidates =
      remaining > 0 ? await this.findCandidateBatches(tx, branchId, item) : [];
    if (remaining > 0 && candidates.length === 1) {
      const candidate = candidates[0];
      const quantity = Math.min(
        remaining,
        Math.max(0, candidate.currentStock - Number(candidate.heldStock || 0)),
      );
      if (quantity > 0) {
        const movement = await writeStockMovement(tx, {
          branchId,
          userId,
          itemId: candidate.id,
          delta: -quantity,
          type: 'SALE',
          unitPrice: this.effectiveUnitPrice(item),
          reference: `PARTNER-SALE-${sale.id}`,
          reason: 'PARTNER_DAILY_SYNC',
          metadata: {
            partnerSaleId: sale.id,
            partnerSaleLineId: item.id,
            previousCommittedQuantity: previouslyCommitted,
          },
        });
        await tx.stockTransaction.update({
          where: { id: movement.id },
          data: { customer: sale.partnerOrganizationName },
        });
        committedQuantity += quantity;
        matchedInventoryItemId ||= candidate.id;
        matchedDrugId ||= candidate.drugs?.[0]?.id;
      }
    }
    const result: CommitLineResult = {
      committedQuantity,
      matchedInventoryItemId,
      matchedDrugId,
    };
    if (committedQuantity < item.quantitySold) {
      result.discrepancyFlag =
        candidates.length === 1 ? 'INSUFFICIENT_STOCK' : 'UNMATCHED_BATCH';
      result.discrepancyReason =
        candidates.length === 1
          ? `${item.quantitySold - committedQuantity} units remain. Receive stock and retry; held units are reserved.`
          : 'Choose an exact product and batch for the outstanding quantity.';
    }
    await tx.partnerDailySaleItem.update({
      where: { id: item.id },
      data: {
        matchedInventoryItemId,
        matchedDrugId,
        committedQuantity,
        discrepancyFlag: result.discrepancyFlag || null,
        discrepancyReason: result.discrepancyReason || null,
      },
    });
    return result;
  }

  /**
   * @cc [owner:nareshshah139,label:product] partner-exact-or-explicit-batch
   * Automatic matching MUST require one active, unexpired branch batch with an exact product identity
   * and batch number. Ambiguous or fuzzy matches MUST leave stock untouched until staff choose a batch.
   */
  private async findCandidateBatches(tx: any, branchId: string, item: any) {
    if (
      !item.recoveryInventoryItemId &&
      (!String(item.medicineName || '').trim() ||
        !String(item.batchNumber || '').trim())
    )
      return [];
    const identity = item.recoveryInventoryItemId
      ? { id: item.recoveryInventoryItemId }
      : {
          batchNumber: {
            equals: String(item.batchNumber || '').trim(),
            mode: 'insensitive',
          },
          OR: [
            {
              name: {
                equals: String(item.medicineName || '').trim(),
                mode: 'insensitive',
              },
            },
            {
              drugs: {
                some: {
                  name: {
                    equals: String(item.medicineName || '').trim(),
                    mode: 'insensitive',
                  },
                },
              },
            },
          ],
        };
    return tx.inventoryItem.findMany({
      where: {
        branchId,
        status: 'ACTIVE',
        AND: [this.unexpiredWhere(), identity],
      },
      include: { drugs: { select: { id: true, name: true } } },
      take: 2,
      orderBy: { id: 'asc' },
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

  private formatSale(sale: any, canReconcile = false) {
    return {
      ...sale,
      version: sale.version ?? 0,
      canReconcile,
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
