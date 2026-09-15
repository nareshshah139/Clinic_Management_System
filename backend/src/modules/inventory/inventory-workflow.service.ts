import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  DEFAULT_INVENTORY_SETTINGS,
  SaveWorkflowDocumentDto,
  TransitionWorkflowDto,
  WORKFLOW_KINDS,
  WorkflowActor,
  WorkflowKind,
  WorkflowLine,
} from './inventory-workflow.types';
import {
  jsonObject,
  money,
  movementDelta,
  stockStatus,
  writeStockMovement,
} from './inventory-stock';

const FINAL = new Set([
  'POSTED',
  'RECEIVED',
  'RELEASED',
  'REVERSED',
  'CANCELLED',
  'REJECTED',
]);
const APPROVERS = new Set(['OWNER', 'ADMIN', 'MANAGER']);
const FINANCIAL = new Set(['CREDIT_NOTE']);
const SALES = new Set(['COUNTER_SALE', 'QUOTATION', 'SALES_RETURN']);
const REORDER = new Set(['SHORTBOOK', 'PURCHASE_ORDER', 'TARGET_REVIEW']);
const clean = (v: unknown) => String(v ?? '').trim();
const integer = (v: unknown, name: string, minimum = 0) => {
  if (
    v === '' ||
    v === null ||
    v === undefined ||
    !Number.isSafeInteger(Number(v)) ||
    Number(v) < minimum
  )
    throw new BadRequestException(
      `${name} must be a whole number of at least ${minimum}`,
    );
  return Number(v);
};
const amount = (v: unknown, name: string, fallback = 0) => {
  const n = v === undefined || v === '' ? fallback : Number(v);
  if (!Number.isFinite(n) || n < 0)
    throw new BadRequestException(`${name} must be a nonnegative number`);
  return money(n);
};

@Injectable()
export class InventoryWorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  async permissions(actor: WorkflowActor): Promise<Set<string>> {
    if (!actor.id || !actor.branchId)
      throw new ForbiddenException('Authenticated branch and user required');
    const user = await this.prisma.user.findFirst({
      where: { id: actor.id, branchId: actor.branchId },
      select: { permissions: true, role: true },
    });
    if (!user || user.role !== actor.role)
      throw new ForbiddenException(
        'User is not in the active branch or role changed',
      );
    if (['OWNER', 'ADMIN', 'DOCTOR'].includes(user.role)) return new Set(['*']);
    const role = await this.prisma.role.findFirst({
      where: { name: user.role },
      select: { permissions: true },
    });
    const parse = (v: unknown): string[] => {
      try {
        const p = Array.isArray(v) ? v : JSON.parse(String(v || '[]'));
        return Array.isArray(p) ? p.filter((x) => typeof x === 'string') : [];
      } catch {
        return [];
      }
    };
    return new Set([...parse(user.permissions), ...parse(role?.permissions)]);
  }
  private permissionFor(kind: string, write: boolean) {
    if (FINANCIAL.has(kind))
      return `pharmacy:purchase-ledger:${write ? 'write' : 'read'}`;
    if (SALES.has(kind)) return `pharmacy:invoice:${write ? 'create' : 'read'}`;
    if (REORDER.has(kind)) return `inventory:po:${write ? 'create' : 'read'}`;
    if (kind === 'COUNT')
      return write ? 'pharmacy:compliance:audit' : 'inventory:item:read';
    return write ? 'inventory:transaction:create' : 'inventory:item:read';
  }
  async authorize(actor: WorkflowActor, kind: string, write = false) {
    const p = await this.permissions(actor);
    const required = this.permissionFor(kind, write);
    if (!p.has('*') && !p.has(required))
      throw new ForbiddenException(`This action requires ${required}`);
  }
  async capabilities(actor: WorkflowActor) {
    const p = await this.permissions(actor),
      has = (key: string) => p.has('*') || p.has(key);
    return {
      approve: APPROVERS.has(actor.role),
      settings: APPROVERS.has(actor.role),
      itemWrite: has('inventory:item:update'),
      itemCreate: has('inventory:item:create'),
      supplierWrite: has('inventory:supplier:create'),
      supplierUpdate: has('inventory:supplier:update'),
      ledger: has('pharmacy:purchase-ledger:read'),
      creditWrite: has('pharmacy:purchase-ledger:write'),
      kinds: Object.fromEntries(
        WORKFLOW_KINDS.map((kind) => [
          kind,
          {
            read: has(this.permissionFor(kind, false)),
            write: has(this.permissionFor(kind, true)),
          },
        ]),
      ),
    };
  }
  async transaction<T>(run: (tx: any) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(run, {
          isolationLevel: 'Serializable',
          timeout: 30000,
        });
      } catch (e) {
        if ((e as any)?.code === 'P2034' && attempt < 2) continue;
        throw e;
      }
    }
  }
  private plain(doc: any) {
    return {
      ...doc,
      ...(doc.kind === 'SALES_RETURN'
        ? {
            refundAccounting: {
              amount: Number(doc.totalAmount || 0),
              mode: doc.payload?.refundMode,
              status:
                doc.status === 'REVERSED'
                  ? 'REVERSED'
                  : ['POSTED', 'RELEASED'].includes(doc.status)
                    ? 'RECORDED'
                    : 'UNPOSTED',
            },
          }
        : {}),
      totalAmount: Number(doc.totalAmount || 0),
      effects: doc.effects?.map((e: any) => ({
        ...e,
        amount: Number(e.amount),
      })),
    };
  }
  async settings(actor: WorkflowActor) {
    await this.permissions(actor);
    const row = await this.prisma.inventoryWorkflowSettings.findUnique({
      where: { branchId: actor.branchId },
    });
    return {
      ...DEFAULT_INVENTORY_SETTINGS,
      ...jsonObject(row?.settings),
      version: row?.version || 0,
    };
  }
  async saveSettings(actor: WorkflowActor, input: Record<string, any>) {
    if (!APPROVERS.has(actor.role))
      throw new ForbiddenException(
        'An inventory manager must configure automation and approvals',
      );
    const previous = await this.settings(actor);
    const value: Record<string, any> = { ...previous };
    for (const key of [
      'auditEnabled',
      'autoMinMaxEnabled',
      'autoPoEnabled',
      'includeBounce',
      'includeRefill',
      'negativeCountNeedsApproval',
    ])
      if (input[key] !== undefined) value[key] = input[key] === true;
    for (const key of [
      'auditDailyCount',
      'lookbackDays',
      'minimumOrders',
      'minCoverDays',
      'maxCoverDays',
      'refreshDays',
    ])
      if (input[key] !== undefined) value[key] = integer(input[key], key, 1);
    if (
      value.minCoverDays > value.maxCoverDays ||
      value.lookbackDays > 730 ||
      value.maxCoverDays > 730 ||
      value.auditDailyCount > 1000
    )
      throw new BadRequestException(
        'Review target day ranges and daily count limit',
      );
    if (input.auditAdjustmentMode !== undefined) {
      if (!['APPROVAL', 'THRESHOLD'].includes(input.auditAdjustmentMode))
        throw new BadRequestException(
          'Choose approval or threshold count adjustment mode',
        );
      value.auditAdjustmentMode = input.auditAdjustmentMode;
    }
    if (input.approvalValue !== undefined)
      value.approvalValue = amount(input.approvalValue, 'Approval value');
    if (input.ownerId !== undefined) value.ownerId = clean(input.ownerId);
    if (
      (value.autoMinMaxEnabled || value.autoPoEnabled || value.auditEnabled) &&
      !value.ownerId
    )
      throw new BadRequestException(
        'Select an automation owner before enabling it',
      );
    if (
      value.ownerId &&
      !(await this.prisma.user.findFirst({
        where: { id: value.ownerId, branchId: actor.branchId, isActive: true },
      }))
    )
      throw new BadRequestException(
        'Automation owner must belong to this branch',
      );
    if (input.excludedItemIds !== undefined) {
      if (!Array.isArray(input.excludedItemIds))
        throw new BadRequestException('Excluded items must be a list');
      const ids = [...new Set(input.excludedItemIds.map(clean))];
      const found = await this.prisma.inventoryItem.count({
        where: { branchId: actor.branchId, id: { in: ids } },
      });
      if (found !== ids.length)
        throw new BadRequestException('An excluded item is not in this branch');
      value.excludedItemIds = ids;
    }
    delete value.version;
    if (input.version !== previous.version)
      throw new ConflictException('Settings changed. Reload before saving.');
    const row = previous.version
      ? await this.prisma.inventoryWorkflowSettings.update({
          where: { branchId: actor.branchId, version: previous.version },
          data: {
            settings: value,
            updatedBy: actor.id,
            version: { increment: 1 },
          },
        })
      : await this.prisma.inventoryWorkflowSettings.create({
          data: {
            branchId: actor.branchId,
            updatedBy: actor.id,
            settings: value,
          },
        });
    return { ...value, version: row.version };
  }

  /**
   * @cc [owner:nareshshah139,label:product] workflow-draft-no-effects
   * Creating or saving a draft MUST NOT post stock, holds or supplier credits; retries with the
   * same branch/request key return one document. An edited saved revision must match its version.
   */
  /**
   * @cc [owner:nareshshah139,label:product;target] inventory-po-no-stock
   * Creating a purchase order MUST persist an order only and MUST NOT change inventory quantities,
   * stock movements or supplier payable balances.
   * Acceptance: INV-38. Validation and open gaps:
   * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
   */
  async saveDocument(
    actor: WorkflowActor,
    dto: SaveWorkflowDocumentDto,
    id?: string,
  ) {
    if (!WORKFLOW_KINDS.includes(dto.kind))
      throw new BadRequestException('Unknown inventory document kind');
    await this.authorize(actor, dto.kind, true);
    if (!clean(dto.requestKey) || !clean(dto.reference))
      throw new BadRequestException('Reference and request key are required');
    return this.transaction(async (tx) => {
      const old = id
        ? await tx.inventoryWorkflowDocument.findFirst({
            where: { id, branchId: actor.branchId },
          })
        : null;
      if (id && !old) throw new NotFoundException('Document not found');
      if (
        old &&
        (old.kind !== dto.kind || !['DRAFT', 'CHALLAN'].includes(old.status))
      )
        throw new BadRequestException(
          'This document is locked. Use a linked correction.',
        );
      if (old && old.version !== dto.version)
        throw new ConflictException(
          'The document changed. Reload before saving.',
        );
      if (!old) {
        const duplicate = await tx.inventoryWorkflowDocument.findUnique({
          where: {
            branchId_requestKey: {
              branchId: actor.branchId,
              requestKey: dto.requestKey,
            },
          },
        });
        if (duplicate) return this.plain(duplicate);
      }
      const supplier = dto.supplierId
        ? await tx.supplier.findFirst({
            where: {
              id: dto.supplierId,
              branchId: actor.branchId,
              isActive: true,
            },
          })
        : null;
      if (dto.supplierId && !supplier)
        throw new BadRequestException(
          'Select an active supplier in this branch',
        );
      for (const [value, model] of [
        [dto.sourceId, 'inventoryWorkflowDocument'],
        [dto.purchaseInvoiceId, 'pharmacyPurchaseInvoice'],
        [dto.salesInvoiceId, 'pharmacyInvoice'],
      ] as const) {
        if (
          value &&
          !(await tx[model].findFirst({
            where: { id: value, branchId: actor.branchId },
          }))
        )
          throw new BadRequestException(
            'Linked document is not in this branch',
          );
      }
      const payload = await this.normalizePayload(
        tx,
        actor,
        dto.kind,
        dto.payload,
        old,
      );
      if (
        old?.status === 'CHALLAN' &&
        (old.supplierId !== (dto.supplierId || null) ||
          old.sourceId !== (dto.sourceId || null) ||
          old.purchaseInvoiceId !== (dto.purchaseInvoiceId || null) ||
          old.payload.sourceHoldId !== payload.sourceHoldId)
      )
        throw new BadRequestException('Posted challan identity cannot change');
      const data = {
        kind: dto.kind,
        reference: clean(dto.reference),
        supplierId: supplier?.id || null,
        supplierGstin: supplier?.gstNumber?.trim().toUpperCase() || null,
        sourceId: dto.sourceId || null,
        purchaseInvoiceId: dto.purchaseInvoiceId || null,
        salesInvoiceId: dto.salesInvoiceId || null,
        payload,
        totalAmount: money(
          payload.lines.reduce(
            (n: number, l: WorkflowLine) => n + (l.total || 0),
            0,
          ),
        ),
      };
      const saved = old
        ? await tx.inventoryWorkflowDocument.update({
            where: { id: old.id, version: dto.version },
            data: { ...data, version: { increment: 1 } },
          })
        : await tx.inventoryWorkflowDocument.create({
            data: {
              ...data,
              branchId: actor.branchId,
              createdBy: actor.id,
              requestKey: dto.requestKey,
            },
          });
      if (old?.status === 'CHALLAN') {
        await this.validatePosting(
          tx,
          actor,
          saved,
          await this.settings(actor),
        );
        await this.applyStockDocument(tx, actor, saved, old.status);
      }
      await this.event(
        tx,
        saved,
        actor,
        old ? 'SAVE' : 'CREATE',
        old?.status || null,
        { before: old?.payload || null, after: payload },
      );
      return this.plain(saved);
    });
  }
  private async normalizePayload(
    tx: any,
    actor: WorkflowActor,
    kind: WorkflowKind,
    source: any,
    old?: any,
  ) {
    if (
      !source ||
      typeof source !== 'object' ||
      !Array.isArray(source.lines) ||
      source.lines.length > 1000
    )
      throw new BadRequestException('Provide at most 1,000 document lines');
    const ids = source.lines
      .map((l: any) => clean(l.inventoryId))
      .filter(Boolean);
    const items = await tx.inventoryItem.findMany({
      where: { branchId: actor.branchId, id: { in: ids } },
    });
    const byId = new Map<string, any>(items.map((i: any) => [i.id, i]));
    const sourceSales =
      kind === 'SALES_RETURN'
        ? await tx.stockTransaction.findMany({
            where: {
              branchId: actor.branchId,
              type: 'SALE',
              id: {
                in: source.lines
                  .map((l: any) => clean(l.sourceLineId))
                  .filter(Boolean),
              },
            },
          })
        : [];
    const oldById = new Map<string, any>(
      (old?.payload?.lines || []).map((l: any) => [l.id, l]),
    );
    const lineIds = new Set<string>();
    if (kind === 'COUNT' && new Set(ids).size !== ids.length)
      throw new BadRequestException('A count may contain each batch only once');
    const lines: WorkflowLine[] = source.lines.map(
      (line: any, index: number) => {
        const id = clean(line.id) || randomUUID();
        if (lineIds.has(id))
          throw new BadRequestException('Duplicate line identifier');
        lineIds.add(id);
        const inventoryId = clean(line.inventoryId),
          item = byId.get(inventoryId);
        if (inventoryId && !item)
          throw new BadRequestException(
            `Line ${index + 1}: inventory batch not found in this branch`,
          );
        if (line.unit && item && line.unit !== item.unit)
          throw new BadRequestException(
            `Line ${index + 1}: quantity must use the batch stock unit ${item.unit}`,
          );
        if (
          old?.status === 'CHALLAN' &&
          oldById.get(id)?.inventoryId &&
          oldById.get(id).inventoryId !== inventoryId
        )
          throw new BadRequestException(
            'Remove the old challan line and add a new line to change its batch',
          );
        const quantity = integer(
            line.quantity ?? 0,
            `Line ${index + 1} quantity`,
          ),
          freeQuantity = integer(line.freeQuantity ?? 0, 'Free quantity');
        const sale = sourceSales.find(
          (row: any) =>
            row.id === line.sourceLineId && row.itemId === inventoryId,
        );
        const saleTerms = sale ? jsonObject(sale.notes).saleTerms : null;
        if (kind === 'SALES_RETURN' && !sale)
          throw new BadRequestException(
            'Select the original sale batch before entering a return',
          );
        const unitPrice = amount(
          sale ? (saleTerms?.unitPrice ?? sale.unitPrice) : line.unitPrice,
          'Unit price',
          ['COUNTER_SALE', 'QUOTATION'].includes(kind)
            ? item?.sellingPrice || 0
            : item?.costPrice || 0,
        );
        const discountPercent = amount(
          sale ? saleTerms?.discountPercent || 0 : line.discountPercent,
          'Discount',
        );
        if (discountPercent > 100)
          throw new BadRequestException('Discount cannot exceed 100%');
        const schemeAmount = amount(
            sale
              ? quantity * (saleTerms?.schemePerUnit || 0)
              : line.schemeAmount,
            'Scheme amount',
          ),
          gstRate = amount(
            sale ? saleTerms?.gstRate || 0 : line.gstRate,
            'GST rate',
            item?.gstRate || 0,
          );
        if (gstRate > 100)
          throw new BadRequestException('Tax rate cannot exceed 100%');
        const taxable = money(
          saleTerms?.taxablePerUnit != null
            ? (quantity + freeQuantity) * saleTerms.taxablePerUnit
            : quantity * unitPrice * (1 - discountPercent / 100) - schemeAmount,
        );
        if (taxable < 0)
          throw new BadRequestException(
            'Scheme exceeds the line taxable amount',
          );
        const tax = money(
          saleTerms?.taxPerUnit != null
            ? (quantity + freeQuantity) * saleTerms.taxPerUnit
            : (taxable * gstRate) / 100,
        );
        const l: WorkflowLine = {
          id,
          inventoryId,
          name: item?.name || clean(line.name),
          batchNumber: item?.batchNumber || '',
          expiryDate: item?.expiryDate?.toISOString() || '',
          unit: item?.unit || '',
          quantity,
          freeQuantity,
          unitPrice,
          mrp: item?.mrp || item?.sellingPrice || 0,
          discountPercent,
          schemeAmount,
          gstRate,
          taxable,
          tax,
          total: money(taxable + tax),
          sourceLineId: clean(line.sourceLineId),
          location: item?.storageLocation || '',
          fefoOverrideReason: clean(line.fefoOverrideReason),
        };
        if (kind === 'COUNT') {
          l.physicalStock =
            line.physicalStock === '' ||
            line.physicalStock === undefined ||
            line.physicalStock === null
              ? undefined
              : integer(line.physicalStock, 'Physical count');
          l.systemStock = oldById.get(id)?.systemStock ?? item?.currentStock;
        }
        if (kind === 'SALES_RETURN') {
          l.originalTerms = saleTerms || {
            unitPrice: sale.unitPrice,
            gstRate: 0,
            discountPercent: 0,
          };
          if (!['RESTOCK', 'QUARANTINE', 'LOSS'].includes(line.disposition))
            throw new BadRequestException(
              'Choose the returned goods disposition',
            );
          l.disposition = line.disposition;
        }
        if (kind === 'TARGET_REVIEW') {
          l.minStockLevel = integer(line.minStockLevel ?? 0, 'Minimum');
          l.maxStockLevel = integer(line.maxStockLevel ?? 0, 'Maximum');
          if (l.minStockLevel > l.maxStockLevel)
            throw new BadRequestException('Minimum cannot exceed maximum');
          l.beforeMin = oldById.get(id)?.beforeMin ?? item?.minStockLevel;
          l.beforeMax = oldById.get(id)?.beforeMax ?? item?.maxStockLevel;
          l.manual = line.manual === true;
        }
        return JSON.parse(JSON.stringify(l));
      },
    );
    const payload: Record<string, any> = {
      lines,
      reason: clean(source.reason),
      notes: clean(source.notes),
      customerName: clean(source.customerName),
      customerPhone: clean(source.customerPhone),
      doctor: clean(source.doctorName || source.doctor),
      doctorName: clean(source.doctorName || source.doctor),
      returnBase: clean(source.returnBase || source.valuationBasis) || 'PTR',
      returnType: clean(source.returnType) || 'OTHER',
      paymentMode: clean(source.paymentMode) || 'CASH',
      date: clean(source.date) || new Date().toISOString().slice(0, 10),
      expectedDate: clean(source.expectedDate),
      priority: ['NORMAL', 'HIGH', 'URGENT'].includes(source.priority)
        ? source.priority
        : 'NORMAL',
      source: clean(source.source) || 'MANUAL',
      requester: old?.payload?.requester || actor.id,
      valuationBasis: clean(source.valuationBasis) || 'PTR',
      orderType: clean(source.orderType) || 'PICKUP',
      refundMode: clean(source.refundMode) || 'CREDIT',
      sourceHoldId: clean(source.sourceHoldId),
      ...(source.calculation ? { calculation: source.calculation } : {}),
    };
    if (
      ['COUNTER_SALE', 'QUOTATION'].includes(kind) &&
      !['PICKUP', 'DELIVERY', 'IN_CLINIC'].includes(payload.orderType)
    )
      throw new BadRequestException(
        'Choose pickup, delivery or in-clinic order type',
      );
    if (!Number.isFinite(new Date(payload.date).getTime()))
      throw new BadRequestException('Invalid document date');
    if (source.evidence)
      payload.evidence = clean(source.evidence).slice(0, 4000);
    return payload;
  }
  async event(
    tx: any,
    doc: any,
    actor: WorkflowActor,
    action: string,
    from: string | null,
    detail: any,
  ) {
    await tx.inventoryWorkflowEvent.create({
      data: {
        documentId: doc.id,
        branchId: actor.branchId,
        actorId: actor.id,
        action,
        fromStatus: from,
        toStatus: doc.status,
        version: doc.version,
        detail: JSON.parse(JSON.stringify(detail)),
      },
    });
  }
  async documents(actor: WorkflowActor, query: Record<string, any> = {}) {
    const perms = await this.permissions(actor);
    const kinds = WORKFLOW_KINDS.filter(
      (k) => perms.has('*') || perms.has(this.permissionFor(k, false)),
    );
    const where: any = { branchId: actor.branchId, kind: { in: kinds } };
    if (query.kind) {
      if (!kinds.includes(query.kind))
        throw new ForbiddenException('Cannot read this workflow');
      where.kind = query.kind;
    }
    if (query.status)
      where.status =
        query.status === 'OPEN'
          ? {
              notIn: [
                'POSTED',
                'RECEIVED',
                'RELEASED',
                'REVERSED',
                'CANCELLED',
                'REJECTED',
                'CONVERTED',
              ],
            }
          : query.status;
    if (query.search)
      where.reference = { contains: String(query.search), mode: 'insensitive' };
    if (query.gstin)
      where.supplierGstin = {
        contains: String(query.gstin).trim().toUpperCase(),
      };
    if (query.sourceId) where.sourceId = String(query.sourceId);
    if (query.from || query.to)
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      };
    const page = Math.max(1, Number(query.page) || 1),
      limit = Math.min(100, Math.max(1, Number(query.limit) || 30));
    const [rows, total] = await Promise.all([
      this.prisma.inventoryWorkflowDocument.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        skip: (page - 1) * limit,
      }),
      this.prisma.inventoryWorkflowDocument.count({ where }),
    ]);
    return {
      rows: rows.map((d) => this.plain(d)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
  async document(actor: WorkflowActor, id: string) {
    const doc = await this.prisma.inventoryWorkflowDocument.findFirst({
      where: { id, branchId: actor.branchId },
      include: { events: { orderBy: { version: 'asc' } }, effects: true },
    });
    if (!doc) throw new NotFoundException('Document not found');
    await this.authorize(actor, doc.kind);
    return this.plain(doc);
  }

  /**
   * @cc [owner:nareshshah139,label:product] workflow-stage-atomic-effects
   * A document transition, its signed stock/hold effects and its event MUST commit together.
   * Concurrent or repeated transitions cannot repeat effects; final records remain immutable.
   */
  /**
   * @cc [owner:nareshshah139,label:product;target] inventory-audit-approval-before-post
   * When an audit variance requires approval, applying the count MUST leave stock unchanged until
   * approval is recorded; a flag saying approvalRequired is not itself approval.
   * Acceptance: INV-31. Validation and open gaps:
   * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
   */
  async transition(
    actor: WorkflowActor,
    id: string,
    dto: TransitionWorkflowDto,
  ): Promise<any> {
    const settings = await this.settings(actor);
    return this.transaction(async (tx) => {
      const doc = await tx.inventoryWorkflowDocument.findFirst({
        where: { id, branchId: actor.branchId },
      });
      if (!doc) throw new NotFoundException('Document not found');
      await this.authorize(actor, doc.kind, true);
      if (doc.version !== dto.version)
        throw new ConflictException(
          'This document changed. Reload to confirm its current status.',
        );
      const p = doc.payload as any,
        lines: WorkflowLine[] = p.lines;
      if (
        doc.kind === 'TARGET_REVIEW' &&
        ['ACCEPT', 'POST'].includes(dto.action)
      )
        throw new BadRequestException(
          'Review target proposal lines from Reorder target review',
        );
      if (dto.action === 'CREATE_PO' || dto.action === 'CONVERT_SALE')
        return this.convert(tx, actor, doc, dto.action);
      if (dto.action === 'REVERSE')
        return this.reverse(tx, actor, doc, clean(dto.reason));
      let next = doc.status;
      if (dto.action === 'CANCEL') {
        if (
          !['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'CHALLAN'].includes(
            doc.status,
          )
        )
          throw new BadRequestException(
            'Posted documents need a linked reversal',
          );
        if (
          doc.kind === 'PURCHASE_ORDER' &&
          (await tx.inventoryWorkflowDocument.count({
            where: {
              branchId: actor.branchId,
              sourceId: doc.id,
              status: { in: ['POSTED', 'CHALLAN'] },
            },
          }))
        )
          throw new BadRequestException(
            'An order with receipts cannot be cancelled',
          );
        next = 'CANCELLED';
      } else if (dto.action === 'REJECT') {
        if (!['DRAFT', 'AWAITING_APPROVAL'].includes(doc.status))
          throw new BadRequestException(
            'Only proposals awaiting review can be rejected',
          );
        next = 'REJECTED';
      } else if (dto.action === 'SUBMIT') {
        if (doc.status !== 'DRAFT')
          throw new BadRequestException('Only drafts can be submitted');
        next = 'AWAITING_APPROVAL';
      } else if (dto.action === 'APPROVE') {
        if (!APPROVERS.has(actor.role))
          throw new ForbiddenException('A manager must approve this document');
        if (doc.status !== 'AWAITING_APPROVAL')
          throw new BadRequestException('Document is not awaiting approval');
        next = 'APPROVED';
      } else if (dto.action === 'RELEASE') {
        if (
          !['HOLD', 'SALES_RETURN'].includes(doc.kind) ||
          doc.status !== 'POSTED'
        )
          throw new BadRequestException(
            'Only an active hold or quarantined return can be released',
          );
        next = 'RELEASED';
      } else if (dto.action === 'CHALLAN') {
        if (doc.kind !== 'SUPPLIER_RETURN' || doc.status !== 'DRAFT')
          throw new BadRequestException(
            'Only a draft supplier return can become a challan',
          );
        next = 'CHALLAN';
      } else if (dto.action === 'POST' || dto.action === 'ACCEPT') {
        if (!['DRAFT', 'APPROVED', 'CHALLAN'].includes(doc.status))
          throw new BadRequestException('Document is not ready for posting');
        if (
          ['PURCHASE_ORDER', 'SHORTBOOK', 'QUOTATION', 'CORRECTION'].includes(
            doc.kind,
          )
        )
          throw new BadRequestException(
            'Use the order/quotation action; this document does not post stock',
          );
        next = 'POSTED';
        if (
          doc.kind === 'COUNT' &&
          doc.status !== 'APPROVED' &&
          !APPROVERS.has(actor.role)
        ) {
          if (
            lines.some(
              (l) =>
                l.physicalStock !== undefined &&
                l.physicalStock !== (l.systemStock || 0) &&
                (settings.auditAdjustmentMode === 'APPROVAL' ||
                  (settings.negativeCountNeedsApproval &&
                    l.physicalStock < (l.systemStock || 0)) ||
                  Math.abs(l.physicalStock - (l.systemStock || 0)) *
                    (l.unitPrice || 0) >=
                    settings.approvalValue),
            )
          )
            next = 'AWAITING_APPROVAL';
        }
      }
      if (next === doc.status)
        throw new BadRequestException('No valid transition requested');
      if (!['CANCELLED', 'REJECTED', 'RELEASED'].includes(next))
        await this.validatePosting(tx, actor, doc, settings);
      if (doc.kind === 'SUPPLIER_RETURN' && next === 'POSTED')
        await this.authorize(actor, 'CREDIT_NOTE', true);
      const updated = await tx.inventoryWorkflowDocument.update({
        where: { id, branchId: actor.branchId, version: dto.version },
        data: {
          status: next,
          version: { increment: 1 },
          ...(dto.action === 'APPROVE' ? { approvedBy: actor.id } : {}),
          ...(next === 'POSTED'
            ? { postedAt: new Date(), postedBy: actor.id }
            : {}),
        },
      });
      if (next === 'RELEASED') await this.releaseHold(tx, actor, updated);
      else if (
        ['POSTED', 'CHALLAN'].includes(next) ||
        (next === 'CANCELLED' && doc.status === 'CHALLAN')
      )
        await this.applyStockDocument(tx, actor, updated, doc.status);
      if (
        next === 'POSTED' &&
        ['SUPPLIER_RETURN', 'CREDIT_NOTE'].includes(doc.kind)
      )
        await tx.inventorySupplierCredit.create({
          data: {
            branchId: actor.branchId,
            documentId: id,
            supplierGstin: doc.supplierGstin,
            reference: doc.reference,
            amount: doc.totalAmount,
          },
        });
      if (next === 'POSTED' && doc.kind === 'TARGET_REVIEW') {
        await this.applyTargets(tx, actor, updated, dto.lineIds);
        await tx.inventoryWorkflowDocument.update({
          where: { id },
          data: {
            payload: {
              ...p,
              acceptedLineIds: dto.lineIds || lines.map((l) => l.id),
            },
          },
        });
      }
      if (next === 'POSTED' && doc.kind === 'INWARD_CHALLAN' && doc.sourceId)
        await this.updateOrderReceipt(tx, actor, doc.sourceId);
      if (next === 'POSTED' && doc.kind === 'COUNT') {
        for (const line of lines.filter((l) => l.physicalStock !== undefined)) {
          const item = await tx.inventoryItem.findFirst({
            where: { id: line.inventoryId, branchId: actor.branchId },
          });
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: {
              metadata: JSON.stringify({
                ...jsonObject(item.metadata),
                lastCountAt: new Date().toISOString(),
                lastCountDocumentId: doc.id,
              }),
            },
          });
          await tx.inventoryAudit.create({
            data: {
              branchId: actor.branchId,
              itemId: item.id,
              auditorId: actor.id,
              physicalStock: line.physicalStock,
              systemStock: line.systemStock,
              variance: line.physicalStock! - line.systemStock!,
              status: 'ADJUSTED',
              notes: JSON.stringify({
                workflowDocumentId: doc.id,
                reason: p.reason,
              }),
            },
          });
        }
      }
      await this.event(tx, updated, actor, dto.action, doc.status, {
        reason: clean(dto.reason) || p.reason,
        stockEffect: ['POSTED', 'CHALLAN'].includes(next),
      });
      return this.plain(updated);
    });
  }
  /**
   * @cc [owner:nareshshah139,label:product;target] sales-return-original-batch
   * A customer return MUST reference its original sale line and batch, limit quantity to the
   * unreturned sold amount, and distinguish restockable goods from non-saleable returns.
   * Acceptance: INV-26. Validation and open gaps:
   * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
   */
  private async validatePosting(
    tx: any,
    actor: WorkflowActor,
    doc: any,
    settings: any,
  ) {
    const p = doc.payload,
      lines: WorkflowLine[] = p.lines || [];
    if (!lines.length) throw new BadRequestException('Add at least one line');
    if (
      [
        'SUPPLIER_RETURN',
        'PURCHASE_ORDER',
        'INWARD_CHALLAN',
        'CREDIT_NOTE',
      ].includes(doc.kind) &&
      !doc.supplierGstin
    )
      throw new BadRequestException(
        'Select a saved supplier with a verified GSTIN',
      );
    if (
      ['COUNT', 'LOSS', 'HOLD', 'CORRECTION', 'SALES_RETURN'].includes(
        doc.kind,
      ) &&
      !clean(p.reason)
    )
      throw new BadRequestException('Enter a reason before posting');
    if (new Date(p.date).getTime() > Date.now() + 86400000)
      throw new BadRequestException('Document date cannot be in the future');
    if (
      doc.kind === 'COUNT' &&
      !lines.some((l) => l.physicalStock !== undefined)
    )
      throw new BadRequestException(
        'Enter at least one physical count; blank means not counted',
      );
    for (const line of lines) {
      if (
        doc.kind !== 'CREDIT_NOTE' &&
        (!line.inventoryId ||
          (!['COUNT', 'TARGET_REVIEW', 'GATE_PASS'].includes(doc.kind) &&
            line.quantity + (line.freeQuantity || 0) <= 0))
      )
        throw new BadRequestException(
          'Each line needs a batch and a positive received/returned quantity',
        );
      const item = line.inventoryId
        ? await tx.inventoryItem.findFirst({
            where: { id: line.inventoryId, branchId: actor.branchId },
          })
        : null;
      if (line.inventoryId && !item)
        throw new BadRequestException(
          'A selected batch is no longer available',
        );
      if (
        item &&
        ['COUNTER_SALE', 'INWARD_CHALLAN'].includes(doc.kind) &&
        (item.status !== 'ACTIVE' ||
          (item.expiryDate &&
            item.expiryDate <
              new Date(
                new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z',
              )))
      )
        throw new BadRequestException(
          `${item.name}: expired/inactive stock cannot be sold or received`,
        );
      if (
        item &&
        doc.kind === 'COUNT' &&
        line.physicalStock !== undefined &&
        line.systemStock !== item.currentStock
      )
        throw new ConflictException(
          `${item.name}: stock changed since the count started. Recount using the current balance.`,
        );
      if (
        doc.kind === 'OPENING_STOCK' &&
        (item.currentStock !== 0 ||
          (await tx.stockTransaction.count({
            where: { branchId: actor.branchId, itemId: item.id },
          })))
      )
        throw new BadRequestException(
          'Opening stock is allowed only on a new batch with no movements. Use a reviewed physical count or correction.',
        );
      if (item && doc.kind === 'COUNTER_SALE' && item.expiryDate) {
        const identities = await tx.drug.findMany({
          where: { inventoryItems: { some: { id: item.id } } },
          select: { id: true },
        });
        const earlier = await tx.inventoryItem.findMany({
          where: {
            branchId: actor.branchId,
            ...(identities.length === 1
              ? {
                  drugs: {
                    some: { id: identities[0].id },
                    every: { id: identities[0].id },
                  },
                }
              : { id: item.id }),
            type: item.type,
            unit: item.unit,
            packSize: item.packSize,
            packUnit: item.packUnit,
            status: 'ACTIVE',
            expiryDate: {
              gte: new Date(
                new Date().toISOString().slice(0, 10) + 'T00:00:00Z',
              ),
              lt: item.expiryDate,
            },
          },
        });
        const bypassed = earlier.some(
          (batch: any) =>
            batch.currentStock -
              batch.heldStock -
              lines
                .filter((l) => l.inventoryId === batch.id)
                .reduce((n, l) => n + l.quantity + (l.freeQuantity || 0), 0) >
            0,
        );
        if (bypassed && !clean(line.fefoOverrideReason))
          throw new BadRequestException(
            `${item.name}: an earlier-expiry batch is available. Use it first or enter the batch-selection reason on this line.`,
          );
      }
      if (doc.kind === 'SALES_RETURN' && !line.sourceLineId)
        throw new BadRequestException(
          'Select the original sale movement for each return line',
        );
      if (doc.kind === 'SUPPLIER_RETURN' && doc.purchaseInvoiceId) {
        const original = await tx.pharmacyPurchaseInvoice.findFirst({
          where: {
            id: doc.purchaseInvoiceId,
            branchId: actor.branchId,
            status: 'STOCK_COMMITTED',
          },
          include: { items: true },
        });
        const bought = original?.items.find(
          (l: any) =>
            l.id === line.sourceLineId &&
            l.inventoryItemId === line.inventoryId,
        );
        if (!bought || original.distributorGstin !== doc.supplierGstin)
          throw new BadRequestException(
            'Return must match the original supplier and purchase batch',
          );
        const prior = await tx.inventoryWorkflowDocument.findMany({
          where: {
            branchId: actor.branchId,
            purchaseInvoiceId: doc.purchaseInvoiceId,
            kind: 'SUPPLIER_RETURN',
            status: { in: ['CHALLAN', 'POSTED'] },
            id: { not: doc.id },
          },
        });
        const returned = prior
          .flatMap((d: any) => d.payload.lines)
          .filter((l: any) => l.sourceLineId === line.sourceLineId)
          .reduce(
            (n: number, l: any) => n + l.quantity + (l.freeQuantity || 0),
            0,
          );
        const proposed = lines
          .filter((l) => l.sourceLineId === line.sourceLineId)
          .reduce((n, l) => n + l.quantity + (l.freeQuantity || 0), 0);
        if (
          returned + proposed >
          bought.quantityPurchased + bought.freeQuantity
        )
          throw new BadRequestException(
            'Return exceeds the unreturned purchase quantity',
          );
      }
      if (
        doc.kind === 'TARGET_REVIEW' &&
        settings.excludedItemIds.includes(line.inventoryId)
      )
        throw new BadRequestException(
          'This item has a manual replenishment override',
        );
    }
  }

  private async effect(
    tx: any,
    actor: WorkflowActor,
    doc: any,
    line: WorkflowLine,
    delta: number,
    options: {
      held?: number;
      sourceLineId?: string;
      returnedQuantity?: number;
      type?: string;
      movementMetadata?: Record<string, any>;
      amount?: number;
    } = {},
  ) {
    const item = await tx.inventoryItem.findFirst({
      where: { id: line.inventoryId, branchId: actor.branchId },
    });
    if (!item) throw new NotFoundException('Batch not found');
    let movement: any = null;
    const heldDelta = options.held || 0;
    const originalSale = options.sourceLineId
      ? await tx.stockTransaction.findFirst({
          where: {
            id: options.sourceLineId,
            branchId: actor.branchId,
            type: 'SALE',
          },
        })
      : null;
    const originalCost = originalSale
      ? (jsonObject(originalSale.notes).costPerStockUnit ?? null)
      : undefined;
    if (heldDelta < 0) {
      if ((item.heldStock || 0) + heldDelta < 0)
        throw new BadRequestException(
          'The held quantity has already been released',
        );
      await tx.inventoryItem.update({
        where: { id: item.id, heldStock: item.heldStock },
        data: { heldStock: item.heldStock + heldDelta },
      });
    }
    if (delta)
      movement = await writeStockMovement(tx, {
        branchId: actor.branchId,
        userId: actor.id,
        itemId: item.id,
        delta,
        type: options.type || (delta > 0 ? 'RETURN' : 'DAMAGED'),
        unitPrice: line.unitPrice,
        reference: `WF-${doc.reference}`,
        reason: doc.payload.reason,
        metadata: {
          workflowDocumentId: doc.id,
          workflowLineId: line.id,
          ...(originalSale
            ? {
                costPerStockUnit: originalCost,
                accountingCategory: 'SALE_RETURN',
              }
            : {}),
          ...(doc.kind === 'COUNTER_SALE'
            ? {
                accountingCategory: 'SALE',
                saleTerms: {
                  unitPrice: line.unitPrice,
                  discountPercent: line.discountPercent,
                  gstRate: line.gstRate,
                  schemePerUnit: line.quantity
                    ? (line.schemeAmount || 0) / line.quantity
                    : 0,
                  taxablePerUnit:
                    (line.taxable || 0) /
                    (line.quantity + (line.freeQuantity || 0)),
                  taxPerUnit:
                    (line.tax || 0) /
                    (line.quantity + (line.freeQuantity || 0)),
                },
              }
            : {}),
          ...options.movementMetadata,
        },
      });
    if (heldDelta > 0) {
      const fresh = await tx.inventoryItem.findFirst({
        where: { id: item.id, branchId: actor.branchId },
      });
      const held = (fresh.heldStock || 0) + heldDelta;
      if (held < 0 || held > fresh.currentStock)
        throw new BadRequestException('Hold exceeds available stock');
      await tx.inventoryItem.update({
        where: {
          id: item.id,
          currentStock: fresh.currentStock,
          heldStock: fresh.heldStock,
        },
        data: { heldStock: held },
      });
    }
    await tx.inventoryWorkflowEffect.create({
      data: {
        documentId: doc.id,
        branchId: actor.branchId,
        effectKey: `${doc.id}:${doc.version}:${line.id}`,
        lineId: line.id,
        inventoryId: item.id,
        transactionId: movement?.id,
        quantityDelta: delta,
        heldDelta,
        amount:
          options.amount ??
          (doc.kind === 'COUNTER_SALE'
            ? line.total || 0
            : doc.kind === 'SALES_RETURN'
              ? -(line.total || 0)
              : 0),
        sourceLineId: options.sourceLineId || null,
        sourceQuantity: options.returnedQuantity || 0,
      },
    });
  }
  /**
   * @cc [owner:nareshshah139,label:product;target] inventory-loss-no-supplier-credit
   * Posting breakage or loss MUST reduce the selected batch stock once and MUST NOT create a
   * supplier credit or change supplier dues.
   * Acceptance: INV-29. Validation and open gaps:
   * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
   */
  private async applyStockDocument(
    tx: any,
    actor: WorkflowActor,
    doc: any,
    fromStatus: string,
  ) {
    const lines: WorkflowLine[] = doc.payload.lines || [];
    // Finalising a challan adds its credit only; its last saved stock effects are authoritative.
    if (
      doc.kind === 'SUPPLIER_RETURN' &&
      doc.status === 'POSTED' &&
      fromStatus === 'CHALLAN'
    )
      return;
    const existing = await tx.inventoryWorkflowEffect.findMany({
      where: { documentId: doc.id },
    });
    const sourceHold = doc.payload.sourceHoldId
      ? await this.holdBalances(tx, actor, doc.payload.sourceHoldId, doc.id)
      : null;
    if (sourceHold && !['LOSS', 'SUPPLIER_RETURN'].includes(doc.kind))
      throw new BadRequestException(
        'Held stock can only be consumed by loss or supplier return',
      );
    const heldByItem = new Map<string, number>();
    const refundUsed = new Map<string, { taxable: number; tax: number }>();
    if (doc.kind === 'SALES_RETURN') {
      const priorReturns = await tx.inventoryWorkflowDocument.findMany({
        where: {
          branchId: actor.branchId,
          kind: 'SALES_RETURN',
          status: { in: ['POSTED', 'RELEASED'] },
          id: { not: doc.id },
        },
      });
      for (const returned of priorReturns)
        for (const l of returned.payload.lines) {
          const used = refundUsed.get(l.sourceLineId) || { taxable: 0, tax: 0 };
          used.taxable = money(used.taxable + (l.taxable || 0));
          used.tax = money(used.tax + (l.tax || 0));
          refundUsed.set(l.sourceLineId, used);
        }
    }
    const deltas = new Map<string, number>(),
      holds = new Map<string, number>();
    for (const e of existing) {
      deltas.set(e.lineId, (deltas.get(e.lineId) || 0) + e.quantityDelta);
      holds.set(e.lineId, (holds.get(e.lineId) || 0) + e.heldDelta);
    }
    const active = !['CANCELLED', 'RELEASED'].includes(doc.status);
    for (const line of lines) {
      let target = 0,
        held = 0,
        type = 'ADJUSTMENT';
      const qty = line.quantity + (line.freeQuantity || 0);
      if (doc.kind === 'SUPPLIER_RETURN') {
        target = active ? -qty : 0;
        type = 'RETURN';
      } else if (doc.kind === 'LOSS') {
        target = active ? -qty : 0;
        type = 'DAMAGED';
      } else if (doc.kind === 'OPENING_STOCK') {
        target = active ? qty : 0;
        type = 'PURCHASE';
      } else if (doc.kind === 'INWARD_CHALLAN') {
        target = active ? qty : 0;
        type = 'PURCHASE';
      } else if (doc.kind === 'COUNTER_SALE') {
        target = active ? -qty : 0;
        type = 'SALE';
      } else if (doc.kind === 'HOLD') held = active ? qty : 0;
      else if (doc.kind === 'COUNT') {
        if (line.physicalStock === undefined) continue;
        target = line.physicalStock - (line.systemStock || 0);
      } else if (doc.kind === 'SALES_RETURN') {
        const source = await tx.stockTransaction.findFirst({
          where: {
            id: line.sourceLineId,
            branchId: actor.branchId,
            itemId: line.inventoryId,
            type: 'SALE',
          },
        });
        if (!source)
          throw new BadRequestException(
            'Original sale batch movement not found',
          );
        const origin = jsonObject(source.notes);
        if (
          origin.workflowDocumentId &&
          !(await tx.inventoryWorkflowDocument.findFirst({
            where: {
              id: origin.workflowDocumentId,
              branchId: actor.branchId,
              status: 'POSTED',
            },
          }))
        )
          throw new BadRequestException('The original sale was reversed');
        if (
          await tx.inventoryWorkflowEffect.count({
            where: {
              branchId: actor.branchId,
              sourceLineId: source.id,
              sourceQuantity: 0,
              document: { kind: 'CORRECTION' },
            },
          })
        )
          throw new BadRequestException(
            'Use the corrected sale as the return source',
          );
        const used = await tx.inventoryWorkflowEffect.aggregate({
          where: { branchId: actor.branchId, sourceLineId: source.id },
          _sum: { sourceQuantity: true },
        });
        if (Number(used._sum.sourceQuantity || 0) + qty > source.quantity)
          throw new BadRequestException(
            'Return exceeds the unreturned quantity from this sale',
          );
        const returnedBefore = Number(used._sum.sourceQuantity || 0),
          terms = origin.saleTerms;
        if (terms?.taxablePerUnit != null && terms?.taxPerUnit != null) {
          const prior = refundUsed.get(source.id) || { taxable: 0, tax: 0 };
          const remainingTaxable = money(
              money(source.quantity * terms.taxablePerUnit) - prior.taxable,
            ),
            remainingTax = money(
              money(source.quantity * terms.taxPerUnit) - prior.tax,
            );
          const finalUnits = returnedBefore + qty === source.quantity;
          line.taxable = finalUnits
            ? remainingTaxable
            : Math.min(money(qty * terms.taxablePerUnit), remainingTaxable);
          line.tax = finalUnits
            ? remainingTax
            : Math.min(money(qty * terms.taxPerUnit), remainingTax);
          if (line.taxable < 0 || line.tax < 0)
            throw new ConflictException(
              'Previously recorded refunds exceed the original sale value; review the source history',
            );
          line.total = money(line.taxable + line.tax);
          refundUsed.set(source.id, {
            taxable: money(prior.taxable + line.taxable),
            tax: money(prior.tax + line.tax),
          });
        }
        target = line.disposition === 'LOSS' ? 0 : qty;
        held = line.disposition === 'QUARANTINE' ? qty : 0;
        type = 'RETURN';
        await this.effect(tx, actor, doc, line, target, {
          held,
          sourceLineId: source.id,
          returnedQuantity: qty,
          type,
        });
        continue;
      } else continue;
      if (sourceHold && active) {
        held = -qty;
        heldByItem.set(
          line.inventoryId,
          (heldByItem.get(line.inventoryId) || 0) + qty,
        );
        if (
          (heldByItem.get(line.inventoryId) || 0) >
          (sourceHold.get(line.inventoryId) || 0)
        )
          throw new BadRequestException(
            'Quantity exceeds this source hold for the batch',
          );
      }
      const delta = target - (deltas.get(line.id) || 0),
        heldDelta = held - (holds.get(line.id) || 0);
      if (delta || heldDelta)
        await this.effect(tx, actor, doc, line, delta, {
          held: heldDelta,
          type,
        });
    }
    if (doc.kind === 'SALES_RETURN') {
      doc.totalAmount = money(lines.reduce((n, l) => n + (l.total || 0), 0));
      await tx.inventoryWorkflowDocument.update({
        where: { id: doc.id, branchId: actor.branchId },
        data: { payload: doc.payload, totalAmount: doc.totalAmount },
      });
    }
    // Editing a challan may remove a line. Reverse that line's previous effect.
    const present = new Set(lines.map((l) => l.id));
    for (const e of existing)
      if (!present.has(e.lineId) && deltas.get(e.lineId)) {
        await this.effect(
          tx,
          actor,
          doc,
          { id: e.lineId, inventoryId: e.inventoryId, quantity: 0 },
          -deltas.get(e.lineId)!,
          { held: -(holds.get(e.lineId) || 0), type: 'RETURN' },
        );
        deltas.set(e.lineId, 0);
      }
  }

  /**
   * @cc [owner:nareshshah139,label:product] source-hold-ownership
   * Release, disposal and supplier return MUST consume only the selected source document's
   * remaining held units. A different hold on the same batch cannot cover a shortage.
   */
  private async holdBalances(
    tx: any,
    actor: WorkflowActor,
    sourceId: string,
    excludingId?: string,
    releasing = false,
  ) {
    const source = await tx.inventoryWorkflowDocument.findFirst({
      where: {
        id: sourceId,
        branchId: actor.branchId,
        kind: { in: ['HOLD', 'SALES_RETURN'] },
      },
    });
    if (!source || (!releasing && source.status !== 'POSTED'))
      throw new BadRequestException(
        'Select an active hold or quarantined return in this branch',
      );
    const effects = await tx.inventoryWorkflowEffect.findMany({
      where: { branchId: actor.branchId, documentId: sourceId },
    });
    const consumers = await tx.inventoryWorkflowDocument.findMany({
      where: {
        branchId: actor.branchId,
        id: { not: excludingId || sourceId },
        status: { in: ['POSTED', 'CHALLAN'] },
        payload: { path: ['sourceHoldId'], equals: sourceId },
      },
      include: { effects: true },
    });
    const balances = new Map<string, number>();
    for (const e of [...effects, ...consumers.flatMap((d: any) => d.effects)])
      balances.set(
        e.inventoryId,
        (balances.get(e.inventoryId) || 0) + e.heldDelta,
      );
    if (!effects.some((e: any) => e.heldDelta > 0))
      throw new BadRequestException(
        'The selected source has no quarantined units',
      );
    return balances;
  }
  private async releaseHold(tx: any, actor: WorkflowActor, doc: any) {
    const balances = await this.holdBalances(
      tx,
      actor,
      doc.id,
      undefined,
      true,
    );
    for (const [inventoryId, quantity] of balances) {
      if (quantity < 0)
        throw new ConflictException(
          'The source hold has an inconsistent balance',
        );
      if (quantity)
        await this.effect(
          tx,
          actor,
          doc,
          { id: `release:${inventoryId}`, inventoryId, quantity: 0 },
          0,
          { held: -quantity },
        );
    }
  }

  private async convert(
    tx: any,
    actor: WorkflowActor,
    doc: any,
    action: string,
  ) {
    const kind = action === 'CREATE_PO' ? 'PURCHASE_ORDER' : 'COUNTER_SALE';
    if (
      action === 'CREATE_PO'
        ? doc.kind !== 'SHORTBOOK'
        : doc.kind !== 'QUOTATION'
    )
      throw new BadRequestException(
        'This document cannot be converted by that action',
      );
    if (FINAL.has(doc.status))
      throw new BadRequestException('Document is already completed');
    await this.authorize(actor, kind, true);
    await this.validatePosting(tx, actor, doc, await this.settings(actor));
    const key = `convert:${doc.id}:${kind}`;
    const found = await tx.inventoryWorkflowDocument.findUnique({
      where: {
        branchId_requestKey: { branchId: actor.branchId, requestKey: key },
      },
    });
    if (found) return this.plain(found);
    const created = await tx.inventoryWorkflowDocument.create({
      data: {
        branchId: actor.branchId,
        kind,
        reference: `${kind === 'PURCHASE_ORDER' ? 'PO' : 'SALE'}-${doc.reference}`,
        supplierId: doc.supplierId,
        supplierGstin: doc.supplierGstin,
        sourceId: doc.id,
        payload: doc.payload,
        totalAmount: doc.totalAmount,
        requestKey: key,
        createdBy: actor.id,
      },
    });
    await this.event(tx, created, actor, 'CONVERT', null, { sourceId: doc.id });
    const source = await tx.inventoryWorkflowDocument.update({
      where: { id: doc.id, version: doc.version },
      data: {
        status: kind === 'PURCHASE_ORDER' ? 'ORDERED' : 'CONVERTED',
        version: { increment: 1 },
      },
    });
    await this.event(tx, source, actor, 'CONVERT', doc.status, {
      destinationId: created.id,
    });
    return this.plain(created);
  }
  /**
   * @cc [owner:nareshshah139,label:product] reversal-downstream-integrity
   * A reversal MUST retain the original and negate its recorded effects and costs. Active
   * downstream returns, hold dispositions, billed receipts and allocated credits block reversal.
   */
  private async reverse(
    tx: any,
    actor: WorkflowActor,
    doc: any,
    reason: string,
  ) {
    if (!APPROVERS.has(actor.role))
      throw new ForbiddenException('A manager must reverse posted documents');
    if (!reason) throw new BadRequestException('A reversal reason is required');
    if (['CORRECTION', 'TARGET_REVIEW'].includes(doc.kind))
      throw new BadRequestException(
        'Record a new reviewed correction instead of reversing this document',
      );
    if (
      ![
        'POSTED',
        'CHALLAN',
        ...(doc.kind === 'SALES_RETURN' ? ['RELEASED'] : []),
      ].includes(doc.status)
    )
      throw new BadRequestException('Only a posted document can be reversed');
    if (
      doc.kind === 'INWARD_CHALLAN' &&
      (await tx.pharmacyPurchaseInvoice.count({
        where: {
          branchId: actor.branchId,
          workflowReceiptId: doc.id,
          status: 'STOCK_COMMITTED',
        },
      }))
    )
      throw new BadRequestException(
        'This receipt is billed. Correct the linked purchase first.',
      );
    const consumers = await tx.inventoryWorkflowDocument.count({
      where: {
        branchId: actor.branchId,
        status: { in: ['POSTED', 'CHALLAN'] },
        payload: { path: ['sourceHoldId'], equals: doc.id },
      },
    });
    if (consumers)
      throw new BadRequestException(
        'Reverse the linked hold disposals or returns first',
      );
    if (doc.payload.sourceHoldId)
      await this.holdBalances(tx, actor, doc.payload.sourceHoldId, doc.id);
    const saleEffects = await tx.inventoryWorkflowEffect.findMany({
      where: { documentId: doc.id, transactionId: { not: null } },
    });
    if (doc.kind === 'COUNTER_SALE') {
      const returned = await tx.inventoryWorkflowEffect.aggregate({
        where: {
          branchId: actor.branchId,
          sourceLineId: { in: saleEffects.map((e: any) => e.transactionId) },
        },
        _sum: { sourceQuantity: true },
      });
      if (Number(returned._sum.sourceQuantity || 0) > 0)
        throw new BadRequestException(
          'Reverse linked customer returns before reversing this sale',
        );
    }
    const credit = await tx.inventorySupplierCredit.findUnique({
      where: { documentId: doc.id },
    });
    if (credit && Number(credit.applied) > 0)
      throw new BadRequestException(
        'Reverse credit allocations before reversing this return',
      );
    const previous = await tx.inventoryWorkflowEffect.findMany({
      where: { documentId: doc.id },
      orderBy: { createdAt: 'asc' },
    });
    const updated = await tx.inventoryWorkflowDocument.update({
      where: { id: doc.id, version: doc.version },
      data: { status: 'REVERSED', version: { increment: 1 } },
    });
    const correction = await tx.inventoryWorkflowDocument.create({
      data: {
        branchId: actor.branchId,
        kind: 'CORRECTION',
        status: 'POSTED',
        reference: `REV-${doc.reference}`,
        sourceId: doc.id,
        payload: { reason, lines: [], reversalOf: doc.id },
        totalAmount: 0,
        requestKey: `reverse:${doc.id}`,
        createdBy: actor.id,
        postedBy: actor.id,
        postedAt: new Date(),
      },
    });
    for (const e of [...previous].reverse()) {
      const originalMovement = e.transactionId
        ? await tx.stockTransaction.findUnique({
            where: { id: e.transactionId },
          })
        : null;
      const originalMetadata = jsonObject(originalMovement?.notes);
      await this.effect(
        tx,
        actor,
        correction,
        {
          id: e.id,
          inventoryId: e.inventoryId,
          quantity: 0,
          unitPrice: originalMovement?.unitPrice,
        },
        -e.quantityDelta,
        {
          held: -e.heldDelta,
          sourceLineId: e.sourceLineId,
          returnedQuantity: -Number(e.sourceQuantity),
          type: 'ADJUSTMENT',
          amount: -Number(e.amount || 0),
          movementMetadata: {
            costPerStockUnit: originalMetadata.costPerStockUnit ?? null,
            accountingCategory: originalMetadata.accountingCategory,
            reversalOf: originalMovement?.id,
          },
        },
      );
    }
    if (doc.kind === 'INWARD_CHALLAN' && doc.sourceId)
      await this.updateOrderReceipt(tx, actor, doc.sourceId, true);
    if (credit)
      await tx.inventorySupplierCredit.update({
        where: { id: credit.id },
        data: { reversedAt: new Date() },
      });
    await this.event(tx, updated, actor, 'REVERSE', doc.status, {
      reason,
      correctionId: correction.id,
    });
    await this.event(tx, correction, actor, 'POST', null, {
      reason,
      sourceId: doc.id,
    });
    return this.plain(updated);
  }
  private async applyTargets(
    tx: any,
    actor: WorkflowActor,
    doc: any,
    selected?: string[],
  ) {
    const lines: WorkflowLine[] = doc.payload.lines;
    if (selected && selected.some((id) => !lines.some((l) => l.id === id)))
      throw new BadRequestException('Unknown target proposal line');
    for (const line of lines.filter(
      (l) => !selected || selected.includes(l.id),
    )) {
      const item = await tx.inventoryItem.findFirst({
        where: { id: line.inventoryId, branchId: actor.branchId },
      });
      if (
        item.minStockLevel !== line.beforeMin ||
        item.maxStockLevel !== line.beforeMax
      )
        throw new ConflictException(
          `${item.name}: targets changed since this proposal`,
        );
      await tx.inventoryItem.update({
        where: { id: item.id, updatedAt: item.updatedAt },
        data: {
          minStockLevel: line.minStockLevel,
          maxStockLevel: line.maxStockLevel,
          reorderLevel: line.minStockLevel,
        },
      });
    }
  }
  private async updateOrderReceipt(
    tx: any,
    actor: WorkflowActor,
    id: string,
    reversing = false,
  ) {
    const order = await tx.inventoryWorkflowDocument.findFirst({
      where: { id, branchId: actor.branchId, kind: 'PURCHASE_ORDER' },
    });
    if (
      !order ||
      ![
        'APPROVED',
        'SENT',
        'PART_RECEIVED',
        ...(reversing ? ['RECEIVED', 'CANCELLED'] : []),
      ].includes(order.status)
    )
      throw new BadRequestException('Link an approved purchase order');
    const receipts = await tx.inventoryWorkflowDocument.findMany({
      where: {
        branchId: actor.branchId,
        sourceId: id,
        kind: 'INWARD_CHALLAN',
        status: 'POSTED',
      },
    });
    for (const receipt of receipts) {
      if (receipt.supplierId !== order.supplierId)
        throw new BadRequestException(
          'Receipt supplier differs from purchase order',
        );
      for (const line of receipt.payload.lines) {
        const source = order.payload.lines.find(
          (l: any) => l.id === line.sourceLineId,
        );
        if (
          !source ||
          source.name.toLowerCase() !== line.name.toLowerCase() ||
          source.unit !== line.unit
        )
          throw new BadRequestException(
            'Select the matching purchase-order line and stock unit for each received batch',
          );
      }
    }
    const received = new Map<string, number>();
    for (const receipt of receipts)
      for (const line of receipt.payload.lines)
        received.set(
          line.sourceLineId || line.inventoryId,
          (received.get(line.sourceLineId || line.inventoryId) || 0) +
            line.quantity +
            (line.freeQuantity || 0),
        );
    const ordered = new Map<string, number>();
    for (const l of order.payload.lines)
      ordered.set(
        l.id,
        (ordered.get(l.id) || 0) + l.quantity + (l.freeQuantity || 0),
      );
    for (const [item, qty] of received)
      if (qty > (ordered.get(item) || 0))
        throw new BadRequestException(
          'Receipt exceeds the remaining purchase-order quantity',
        );
    const complete = [...ordered].every(
      ([item, qty]) => (received.get(item) || 0) === qty,
    );
    const updated = await tx.inventoryWorkflowDocument.update({
      where: { id, version: order.version },
      data: {
        status:
          order.status === 'CANCELLED'
            ? 'CANCELLED'
            : complete
              ? 'RECEIVED'
              : receipts.length
                ? 'PART_RECEIVED'
                : 'APPROVED',
        version: { increment: 1 },
      },
    });
    await this.event(tx, updated, actor, 'RECEIVE', order.status, {
      received: Object.fromEntries(received),
    });
    if (order.sourceId) {
      const shortbook = await tx.inventoryWorkflowDocument.findFirst({
        where: {
          id: order.sourceId,
          branchId: actor.branchId,
          kind: 'SHORTBOOK',
        },
      });
      if (shortbook && !['CANCELLED', 'REJECTED'].includes(shortbook.status)) {
        const done = await tx.inventoryWorkflowDocument.update({
          where: { id: shortbook.id, version: shortbook.version },
          data: {
            status: complete
              ? 'RECEIVED'
              : receipts.length
                ? 'PART_RECEIVED'
                : 'ORDERED',
            version: { increment: 1 },
          },
        });
        await this.event(tx, done, actor, 'FULFILLED', shortbook.status, {
          orderId: id,
        });
      }
    }
  }
}
