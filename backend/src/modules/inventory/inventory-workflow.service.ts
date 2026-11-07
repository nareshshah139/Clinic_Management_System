import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  COUNT_APPROVERS,
  DEFAULT_INVENTORY_SETTINGS,
  INVENTORY_APPROVERS,
  LEGACY_COUNT_SETTINGS,
  mayApproveDocument,
  SaveWorkflowDocumentDto,
  SELF_APPROVERS,
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
import { clinicDay, clinicDayOf, isCalendarDay } from '../pharmacy/register-utils';
import { EVERY_ALLOCATION, creditBalance } from '../pharmacy/supplier-credit-balance';
import {
  CREDIT_NOTE_NUMBER_MAX,
  creditNoteNumberOf,
  displayDay,
  isCreditNoteNumberClash,
  returnMovementReason,
  rupees,
  supplierReturnReason,
} from './supplier-return';
import {
  grantsForRole,
  parsePermissionList,
  permissionGrants,
  PermissionGrants,
} from '../../shared/access/permission-grants';
import {
  parseReconciliationInput,
  readReconciliation,
} from './reconciliation/reconciliation-cycle';

const FINAL = new Set([
  'POSTED',
  'RECEIVED',
  'RELEASED',
  'REVERSED',
  'CANCELLED',
  'REJECTED',
]);
const FINANCIAL = new Set(['CREDIT_NOTE']);
const SALES = new Set(['COUNTER_SALE', 'QUOTATION', 'SALES_RETURN']);
const REORDER = new Set(['SHORTBOOK', 'PURCHASE_ORDER', 'TARGET_REVIEW']);
const clean = (v: unknown) => String(v ?? '').trim();
const fingerprintOf = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const RETURN_KINDS = ['SUPPLIER_RETURN', 'CREDIT_NOTE'];
const OPEN_COUNT = ['DRAFT', 'AWAITING_APPROVAL'];
type OpenCount = { id: string; status: string; reference: string; createdBy: string; payload: any };
const batchLabel = (line: Pick<WorkflowLine, 'name' | 'batchNumber'>) => `${line.name || 'Selected batch'}, batch ${line.batchNumber || 'not recorded'}`;
const batches = (n: number) => `${n} more ${n === 1 ? 'batch' : 'batches'}`;
/**
 * A counted line compares the shelf with the system figure taken when the count was typed. That
 * comparison is out of date when it has no capture time (saved before capture times were kept) or
 * when another count of the batch was posted at or after it, because that count already put the
 * shelf quantity into the stock.
 */
export function observationOutdated(line: Pick<WorkflowLine, 'physicalStock' | 'capturedAt'>, metadata: Record<string, any>, documentId: string, fallback?: string) {
  if (line.physicalStock === undefined || line.physicalStock === null) return false;
  const at = line.capturedAt ?? fallback;
  if (!at) return true;
  return typeof metadata.lastCountAt === 'string' && metadata.lastCountDocumentId !== documentId && metadata.lastCountAt >= at;
}
export type CreditNoteInput = {
  requestKey: string;
  version: number;
  number: string;
  date: string;
  amount: number;
};
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

  async permissions(actor: WorkflowActor): Promise<PermissionGrants> {
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
    return this.grantsOf(user);
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
    if (!p.has(required))
      throw new ForbiddenException(`This action requires ${required}`);
  }
  async capabilities(actor: WorkflowActor) {
    const p = await this.permissions(actor),
      has = (key: string) => p.has(key);
    return {
      approve: INVENTORY_APPROVERS.has(actor.role),
      selfApprove: SELF_APPROVERS.has(actor.role),
      settings: INVENTORY_APPROVERS.has(actor.role),
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
    const stored = jsonObject(row?.settings);
    const value: Record<string, any> = {
      ...DEFAULT_INVENTORY_SETTINGS,
      ...stored,
      reconciliation: readReconciliation(stored, clinicDay(row?.updatedAt ?? new Date())),
      version: row?.version || 0,
    };
    for (const key of LEGACY_COUNT_SETTINGS) delete value[key];
    return value;
  }
  async grantsOf(user: { role: string; permissions: unknown }) {
    const role = await this.prisma.role.findFirst({
      where: { name: user.role as any },
      select: { permissions: true },
    });
    return permissionGrants(
      grantsForRole(user.role, [
        ...parsePermissionList(user.permissions),
        ...parsePermissionList(role?.permissions),
      ]),
    );
  }
  async countStaff(branchId: string) {
    const users = await this.prisma.user.findMany({
      where: { branchId, isActive: true },
      select: { id: true, firstName: true, lastName: true, role: true, permissions: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    const roles = new Map(
      (await this.prisma.role.findMany({ where: { name: { in: [...new Set(users.map((user) => user.role))] as any } }, select: { name: true, permissions: true } })).map((role) => [role.name as string, role.permissions]),
    );
    return users
      .filter((user) => permissionGrants(grantsForRole(user.role, [...parsePermissionList(user.permissions), ...parsePermissionList(roles.get(user.role))])).has(this.permissionFor('COUNT', true)))
      .map((user) => ({ id: user.id, name: `${user.firstName} ${user.lastName}`.trim(), role: user.role }));
  }
  async saveSettings(actor: WorkflowActor, input: Record<string, any>) {
    if (!INVENTORY_APPROVERS.has(actor.role))
      throw new ForbiddenException(
        'An inventory manager must configure automation and approvals',
      );
    const previous = await this.settings(actor);
    const value: Record<string, any> = { ...previous };
    for (const key of [
      'autoMinMaxEnabled',
      'autoPoEnabled',
      'includeBounce',
      'includeRefill',
    ])
      if (input[key] !== undefined) value[key] = input[key] === true;
    for (const key of [
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
      value.maxCoverDays > 730
    )
      throw new BadRequestException('Review target day ranges');
    if (input.reconciliation !== undefined) {
      value.reconciliation = parseReconciliationInput(
        input.reconciliation,
        previous.reconciliation,
        clinicDay(new Date()),
      );
      const staff = new Set((await this.countStaff(actor.branchId)).map((s) => s.id));
      if (value.reconciliation.assigneeIds.some((id: string) => !staff.has(id)))
        throw new BadRequestException(
          'Each person who counts must be an active member of this branch with stock reconciliation access',
        );
    }
    if (input.ownerId !== undefined) value.ownerId = clean(input.ownerId);
    if ((value.autoMinMaxEnabled || value.autoPoEnabled) && !value.ownerId)
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
  /**
   * @cc [owner:nareshshah139,label:product] count-input-recovery
   * Invalid physical counts MUST identify the batch and field, preserve blank as uncounted,
   * and reject the save without changing stock or retaining a partial draft.
   */
  /**
   * @cc [owner:nareshshah139,label:security] workflow-save-replay-access
   * A request-key replay MUST require read access to the stored document kind and match the
   * submitted kind before returning it. A different kind MUST fail without mutation or disclosure.
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
    if (!id && clean(dto.requestKey).startsWith('cycle:'))
      throw new BadRequestException('Request keys starting with "cycle:" are reserved for planned stock counts');
    return this.transaction(async (tx) => {
      const old = id
        ? await tx.inventoryWorkflowDocument.findFirst({
            where: { id, branchId: actor.branchId },
          })
        : null;
      if (id && !old) throw new NotFoundException('Document not found');
      if (old?.kind === 'COUNT')
        throw new BadRequestException('Enter counted quantities from Stock counts › My counts');
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
        if (duplicate) {
          await this.authorize(actor, duplicate.kind);
          if (duplicate.kind !== dto.kind)
            throw new ConflictException('This request key already identifies another document kind. Reload its saved outcome.');
          return this.plain(duplicate);
        }
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
      if (!old && dto.kind === 'COUNT')
        await this.refuseOpenCounts(tx, actor, payload.lines, await this.openCountHolders(tx, actor.branchId));
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
  async normalizePayload(
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
          const count = line.physicalStock === '' || line.physicalStock == null
            ? undefined : Number(line.physicalStock);
          if (count !== undefined && (!Number.isSafeInteger(count) || count < 0))
            throw new BadRequestException({
              code: 'INVENTORY_INVALID_COUNT',
              message: `${item?.name || 'Selected batch'}: physical count must be a whole number of at least 0. Enter the observed quantity; leave the field blank if this batch has not been counted.`,
              stockEffect: 'NONE',
              recovery: { action: 'CORRECT_FIELD', inventoryId, field: 'physicalStock' },
            });
          l.physicalStock = count;
          l.systemStock = oldById.get(id)?.systemStock ?? item?.currentStock;
          if (count !== undefined) l.capturedAt = new Date().toISOString();
          const note = clean(line.note).slice(0, 300);
          if (note) l.note = note;
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
    const date = clean(source.date);
    const payload: Record<string, any> = {
      lines,
      reason: clean(source.reason),
      notes: clean(source.notes),
      customerName: clean(source.customerName),
      customerPhone: clean(source.customerPhone),
      doctor: clean(source.doctorName || source.doctor),
      doctorName: clean(source.doctorName || source.doctor),
      returnBase: clean(source.returnBase || source.valuationBasis) || 'PTR',
      ...(kind === 'SUPPLIER_RETURN'
        ? { returnReason: supplierReturnReason(source) ?? 'OTHER' }
        : { returnType: clean(source.returnType) || 'OTHER' }),
      ...(kind === 'CREDIT_NOTE'
        ? { creditNoteNumber: creditNoteNumberOf(source.creditNoteNumber), creditNoteDate: clean(source.creditNoteDate) }
        : {}),
      paymentMode: clean(source.paymentMode) || 'CASH',
      date: date ? clinicDayOf(date) : clinicDay(new Date()),
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
      ...(kind === 'COUNT'
        ? {
            origin: old?.payload?.origin || 'ON_DEMAND',
            assigneeId: old?.payload?.assigneeId || actor.id,
            ...(old?.payload?.cycle ? { cycle: old.payload.cycle } : {}),
          }
        : {}),
    };
    if (
      ['COUNTER_SALE', 'QUOTATION'].includes(kind) &&
      !['PICKUP', 'DELIVERY', 'IN_CLINIC'].includes(payload.orderType)
    )
      throw new BadRequestException(
        'Choose pickup, delivery or in-clinic order type',
      );
    if (!payload.date)
      throw new BadRequestException(
        'Document date must be a calendar day such as 2026-04-01',
      );
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
      (k) => perms.has(this.permissionFor(k, false)),
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
  /**
   * @cc [owner:nareshshah139,label:product] workflow-request-recovery-lookup
   * Request-key lookup MUST resolve only the active branch and require read access to the saved
   * document's actual kind before returning history or effects. Absence never proves no write occurred.
   */
  async documentByRequest(actor: WorkflowActor, requestKey: string) {
    const found = await this.prisma.inventoryWorkflowDocument.findUnique({
      where: { branchId_requestKey: { branchId: actor.branchId, requestKey } },
      select: { id: true },
    });
    if (!found)
      throw new NotFoundException('No saved document is visible for this recovery reference. Its outcome remains unconfirmed; do not create another attempt.');
    return this.document(actor, found.id);
  }
  /**
   * @cc [owner:nareshshah139,label:product] workflow-pending-write-fence
   * Resolution MUST require read and write access to the saved kind. In one serializable
   * transaction, an unchanged expected revision MUST advance with a same-status recovery event
   * and no stock effects, fencing pending draft patches and stock-changing transitions that compare
   * that revision. It does not cancel creation of linked drafts such as RECOUNT. Advanced revisions
   * return their actual history unchanged; future expected revisions reject. Retrying the same revision
   * MUST not append another event or effect.
   */
  async resolveOutcome(actor: WorkflowActor, id: string, input: { version: number }) {
    if (!input || !Number.isSafeInteger(input.version) || input.version < 1)
      throw new BadRequestException('A positive whole-number document revision is required to resolve this attempt.');
    return this.transaction(async (tx) => {
      const doc = await tx.inventoryWorkflowDocument.findFirst({
        where: { id, branchId: actor.branchId },
        include: { events: { orderBy: { version: 'asc' } }, effects: true },
      });
      if (!doc) throw new NotFoundException('Document not found. The interrupted outcome remains unconfirmed.');
      await this.authorize(actor, doc.kind);
      await this.authorize(actor, doc.kind, true);
      if (doc.version < input.version)
        throw new ConflictException('The saved document revision is older than the recovery reference. Keep this reference and ask an inventory administrator to investigate.');
      if (doc.version > input.version) return this.plain(doc);
      const settled = await tx.inventoryWorkflowDocument.update({
        where: { id, branchId: actor.branchId, version: input.version },
        data: { version: { increment: 1 } },
      });
      await this.event(tx, settled, actor, 'RESOLVE_OUTCOME', doc.status, {
        reason: 'Checked the interrupted save or stock change before retrying.',
        fencedVersion: input.version,
        stockEffect: false,
      });
      return this.plain(await tx.inventoryWorkflowDocument.findFirst({
        where: { id, branchId: actor.branchId },
        include: { events: { orderBy: { version: 'asc' } }, effects: true },
      }));
    });
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
   * Concurrent or repeated transitions cannot repeat effects. Posted line data remains immutable;
   * recovery status changes MUST retain the original effects and append a versioned event.
   */
  /**
   * @cc [owner:nareshshah139,label:product;target] inventory-audit-approval-before-post
   * When an audit variance requires approval, applying the count MUST leave stock unchanged until
   * approval is recorded; a flag saying approvalRequired is not itself approval.
   * Acceptance: INV-31. Validation and open gaps:
   * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
   */
  /**
   * @cc [owner:nareshshah139] verified-count-ledger-checkpoint
   * Every posted physical count, including zero variance, MUST record its resulting quantity,
   * actor, document and covered movement identities atomically. Prior unknown history remains
   * unchanged; later ledger agreement MUST be measured against this checkpoint.
   */
  /**
   * @cc [owner:nareshshah139,label:product] workflow-rejection-recovery-evidence
   * Stale counts, source capacity errors and blocked reversals MUST identify affected batch or
   * source records and a safe correction action. A rejected transition MUST change no stock.
   */
  async transition(
    actor: WorkflowActor,
    id: string,
    dto: TransitionWorkflowDto,
  ): Promise<any> {
    const settings = await this.settings(actor);
    let creditNoteNumber = '';
    try {
      return await this.transaction(async (tx) => {
        const doc = await tx.inventoryWorkflowDocument.findFirst({
          where: { id, branchId: actor.branchId },
        });
        if (!doc) throw new NotFoundException('Document not found');
        await this.authorize(actor, doc.kind, true);
        if (doc.version !== dto.version)
          throw new ConflictException(
            'This document changed. Reload to confirm its current status.',
          );
        if (dto.action === 'RECOUNT') return this.restartCount(tx, actor, doc);
        if (doc.kind === 'COUNT' && dto.action === 'CANCEL') {
          if (doc.status !== 'DRAFT')
            throw new BadRequestException('A signed count cannot be cancelled. A doctor or administrator rejects it from Stock counts › Approvals.');
          if ((doc.payload?.assigneeId ?? doc.createdBy) !== actor.id && !COUNT_APPROVERS.has(actor.role))
            throw new ForbiddenException('Only the person this count is assigned to, or a doctor or administrator, can cancel it.');
        }
        if (
          doc.kind === 'COUNT' &&
          (['APPROVE', 'REJECT', 'SUBMIT'].includes(dto.action) ||
            (dto.action === 'POST' && doc.status !== 'APPROVED'))
        )
          throw new BadRequestException(
            'A stock count is signed off by the person who counted it, then approved or rejected from Stock counts › Approvals',
          );
        creditNoteNumber = creditNoteNumberOf(doc.payload?.creditNoteNumber);
        return this.move(tx, actor, doc, dto, settings);
      });
    } catch (error) {
      if (isCreditNoteNumberClash(error)) throw this.duplicateCreditNote(creditNoteNumber);
      throw error;
    }
  }
  private async move(
    tx: any,
    actor: WorkflowActor,
    doc: any,
    dto: TransitionWorkflowDto,
    settings: any,
  ): Promise<any> {
    const id = doc.id;
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
      if (!INVENTORY_APPROVERS.has(actor.role))
        throw new ForbiddenException('A manager must approve this document');
      if (!mayApproveDocument(actor, doc))
        throw new ForbiddenException(
          'Another approver must approve a document you created',
        );
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
          ...(doc.kind === 'CREDIT_NOTE'
            ? {
                creditNoteNumber: p.creditNoteNumber,
                creditNoteDate: new Date(`${p.creditNoteDate}T00:00:00.000Z`),
                receivedAt: new Date(),
                receivedById: actor.id,
              }
            : {}),
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
    if (next === 'POSTED' && doc.kind === 'COUNT')
      await this.recordCount(tx, actor, updated);
    await this.event(tx, updated, actor, dto.action, doc.status, {
      reason: clean(dto.reason) || p.reason,
      stockEffect: ['POSTED', 'CHALLAN'].includes(next),
    });
    return this.plain(updated);
  }
  private creditNoteInput(input: Record<string, any>): CreditNoteInput {
    const number = creditNoteNumberOf(input?.number);
    const date = clean(input?.date);
    const amount = money(Number(input?.amount));
    const version = Number(input?.version);
    if (!clean(input?.requestKey) || clean(input?.requestKey).length > 150)
      throw new BadRequestException('A request key is required');
    if (!Number.isSafeInteger(version) || version < 1)
      throw new BadRequestException('A document revision is required');
    if (!number) throw new BadRequestException('Enter the credit note number');
    if (number.length > CREDIT_NOTE_NUMBER_MAX)
      throw new BadRequestException(`The credit note number can have at most ${CREDIT_NOTE_NUMBER_MAX} characters`);
    if (!isCalendarDay(date))
      throw new BadRequestException('Enter the credit note date as a calendar day');
    if (date > clinicDay(new Date()))
      throw new BadRequestException('The credit note date cannot be after today');
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e10)
      throw new BadRequestException('Enter the credit note amount in rupees, more than zero');
    return { requestKey: clean(input.requestKey), version, number, date, amount };
  }
  private async validateStandaloneCreditNote(tx: any, actor: WorkflowActor, doc: any) {
    const number = creditNoteNumberOf(doc.payload.creditNoteNumber);
    const date = clean(doc.payload.creditNoteDate);
    if (!number) throw new BadRequestException("Enter the credit note number from the distributor's note");
    if (number.length > CREDIT_NOTE_NUMBER_MAX)
      throw new BadRequestException(`The credit note number can have at most ${CREDIT_NOTE_NUMBER_MAX} characters`);
    if (!isCalendarDay(date)) throw new BadRequestException('Enter the credit note date as a calendar day');
    if (date > clinicDay(new Date())) throw new BadRequestException('The credit note date cannot be after today');
    const creditDay = clinicDayOf(doc.payload.date) ?? clinicDay(doc.createdAt);
    if (date < creditDay)
      throw new BadRequestException(`The credit note date cannot be before the supplier credit date, ${displayDay(creditDay)}`);
    const taken = await tx.inventorySupplierCredit.findFirst({
      where: { branchId: actor.branchId, supplierGstin: doc.supplierGstin, creditNoteNumber: number, reversedAt: null },
      select: { reference: true },
    });
    if (taken) throw this.duplicateCreditNote(number, taken.reference);
  }
  private creditNoteFields(note: CreditNoteInput, actor: WorkflowActor) {
    return {
      creditNoteNumber: note.number,
      creditNoteDate: new Date(`${note.date}T00:00:00.000Z`),
      receivedAt: new Date(),
      receivedById: actor.id,
    };
  }
  private creditNotePayload(doc: any, note: CreditNoteInput) {
    return doc.kind === 'CREDIT_NOTE'
      ? { payload: { ...doc.payload, creditNoteNumber: note.number, creditNoteDate: note.date } }
      : {};
  }
  private creditNoteDetail(note: CreditNoteInput) {
    return { number: note.number, date: note.date, amount: note.amount };
  }
  private duplicateCreditNote(number: string, reference?: string) {
    return new ConflictException({
      code: 'CREDIT_NOTE_DUPLICATE',
      message: `Credit note ${number} is already recorded for this distributor${reference ? ` on return ${reference}` : ''}. Check the number on the distributor's credit note.`,
    });
  }
  private async creditWithBalance(tx: any, documentId: string) {
    const credit = await tx.inventorySupplierCredit.findUnique({
      where: { documentId },
      include: { allocations: { select: { amount: true, createdAt: true, reversedAt: true } } },
    });
    return credit ? { ...credit, balance: creditBalance(credit, EVERY_ALLOCATION) } : null;
  }
  private async creditNoteOutcome(tx: any, documentId: string) {
    const [document, credit] = await Promise.all([
      tx.inventoryWorkflowDocument.findUnique({ where: { id: documentId } }),
      this.creditWithBalance(tx, documentId),
    ]);
    return {
      document: this.plain(document),
      credit: {
        id: credit!.id,
        number: credit!.creditNoteNumber,
        date: credit!.creditNoteDate ? credit!.creditNoteDate.toISOString().slice(0, 10) : null,
        ...credit!.balance,
      },
    };
  }
  async recordCreditNote(actor: WorkflowActor, id: string, input: Record<string, any>) {
    const note = this.creditNoteInput(input);
    const correction = input?.correct === true ? clean(input?.reason) : null;
    if (correction === '') throw new BadRequestException('Enter why the credit note is being corrected');
    if (correction && correction.length > 500) throw new BadRequestException('Keep the correction reason under 500 characters');
    const settings = await this.settings(actor);
    try {
      return await this.transaction(async (tx) => {
        const doc = await tx.inventoryWorkflowDocument.findFirst({
          where: { id, branchId: actor.branchId },
        });
        if (!doc) throw new NotFoundException('Return not found');
        if (!RETURN_KINDS.includes(doc.kind))
          throw new BadRequestException('Credit notes are recorded against supplier returns and supplier credits');
        await this.authorize(actor, doc.kind, true);
        await this.authorize(actor, 'CREDIT_NOTE', true);
        const replay = await tx.inventoryWorkflowEvent.findFirst({
          where: {
            documentId: doc.id,
            action: { in: ['CREDIT_NOTE', 'CREDIT_NOTE_CORRECTED'] },
            detail: { path: ['requestKey'], equals: note.requestKey },
          },
        });
        if (replay) {
          const same =
            replay.action === (correction ? 'CREDIT_NOTE_CORRECTED' : 'CREDIT_NOTE') &&
            isDeepStrictEqual(replay.detail?.after, this.creditNoteDetail(note)) &&
            (replay.detail?.reason ?? null) === correction;
          if (!same)
            throw new ConflictException({
              code: 'REQUEST_KEY_REUSED',
              message: 'This request was already used for a different credit note. Close the dialog and start again.',
            });
          return this.creditNoteOutcome(tx, doc.id);
        }
        if (doc.version !== note.version)
          throw new ConflictException(`This ${doc.kind === 'CREDIT_NOTE' ? 'supplier credit' : 'return'} changed. Reload to see its latest status.`);
        const taken = await tx.inventorySupplierCredit.findFirst({
          where: {
            branchId: actor.branchId,
            supplierGstin: doc.supplierGstin,
            creditNoteNumber: note.number,
            reversedAt: null,
            documentId: { not: doc.id },
          },
          select: { reference: true },
        });
        if (taken) throw this.duplicateCreditNote(note.number, taken.reference);
        const returnDay = clinicDayOf((doc.payload as any)?.date) ?? clinicDay(doc.createdAt);
        if (note.date < returnDay)
          throw new BadRequestException(
            `The credit note date cannot be before the ${doc.kind === 'CREDIT_NOTE' ? 'supplier credit' : 'return'} date, ${displayDay(returnDay)}`,
          );
        if (correction) return this.correctCreditNote(tx, actor, doc, note, correction);
        if (doc.kind === 'SUPPLIER_RETURN' && doc.status === 'CHALLAN') {
          const posted = await this.move(tx, actor, doc, { action: 'POST', version: note.version }, settings);
          return this.receiveCreditNote(tx, actor, posted, posted.status, note);
        }
        if (doc.status !== 'POSTED')
          throw new BadRequestException(
            doc.kind === 'CREDIT_NOTE'
              ? 'Enter the credit note number and date on this supplier credit, then post it'
              : 'Send the goods on a return challan before recording the credit note',
          );
        return this.receiveCreditNote(tx, actor, doc, doc.status, note);
      });
    } catch (error) {
      if (isCreditNoteNumberClash(error)) throw this.duplicateCreditNote(note.number);
      throw error;
    }
  }
  private async receiveCreditNote(tx: any, actor: WorkflowActor, doc: any, fromStatus: string, note: CreditNoteInput) {
    const credit = await this.creditWithBalance(tx, doc.id);
    if (credit?.reversedAt) throw new BadRequestException('This return has no open supplier credit');
    if (credit?.creditNoteNumber)
      throw new ConflictException({
        code: 'CREDIT_NOTE_RECORDED',
        message: `Credit note ${credit.creditNoteNumber} is already recorded for this ${doc.kind === 'CREDIT_NOTE' ? 'supplier credit' : 'return'}.`,
      });
    const before = credit ? money(Number(credit.amount)) : null;
    if (credit && credit.balance.applied > 0 && before !== note.amount)
      throw new BadRequestException(
        `Part of this credit is already set off against bills, so its amount stays ${rupees(before!)}. Enter the number and date only.`,
      );
    if (credit)
      await tx.inventorySupplierCredit.update({
        where: { id: credit.id, applied: credit.applied },
        data: { amount: note.amount, ...this.creditNoteFields(note, actor) },
      });
    else
      await tx.inventorySupplierCredit.create({
        data: {
          branchId: actor.branchId,
          documentId: doc.id,
          supplierGstin: doc.supplierGstin,
          reference: doc.reference,
          amount: note.amount,
          ...this.creditNoteFields(note, actor),
        },
      });
    const updated = await tx.inventoryWorkflowDocument.update({
      where: { id: doc.id, version: doc.version },
      data: { version: { increment: 1 }, ...this.creditNotePayload(doc, note) },
    });
    await this.event(tx, updated, actor, 'CREDIT_NOTE', fromStatus, {
      requestKey: note.requestKey,
      stockEffect: false,
      before: { amount: before, number: null },
      after: this.creditNoteDetail(note),
    });
    return this.creditNoteOutcome(tx, doc.id);
  }
  private async correctCreditNote(tx: any, actor: WorkflowActor, doc: any, note: CreditNoteInput, reason: string) {
    const credit = doc.status === 'POSTED' ? await this.creditWithBalance(tx, doc.id) : null;
    if (!credit || credit.reversedAt || !credit.creditNoteNumber)
      throw new BadRequestException('Record the credit note before correcting it');
    const before = {
      number: credit.creditNoteNumber,
      date: credit.creditNoteDate ? credit.creditNoteDate.toISOString().slice(0, 10) : null,
      amount: money(Number(credit.amount)),
    };
    const applied = credit.balance.applied;
    if (applied > 0 && before.amount !== note.amount)
      throw new BadRequestException(
        `${rupees(applied)} of this credit is already set off against bills, so its amount stays ${rupees(before.amount)}. Correct the number and date only.`,
      );
    if (before.number === note.number && before.date === note.date && before.amount === note.amount)
      throw new BadRequestException('The credit note already reads this way. Change the number, date or amount to correct it.');
    const updated = await tx.inventoryWorkflowDocument.update({
      where: { id: doc.id, version: doc.version },
      data: { version: { increment: 1 }, ...this.creditNotePayload(doc, note) },
    });
    await tx.inventorySupplierCredit.update({
      where: { id: credit.id, applied: credit.applied },
      data: { amount: note.amount, creditNoteNumber: note.number, creditNoteDate: new Date(`${note.date}T00:00:00.000Z`) },
    });
    await this.event(tx, updated, actor, 'CREDIT_NOTE_CORRECTED', doc.status, {
      requestKey: note.requestKey,
      reason,
      stockEffect: false,
      before,
      after: this.creditNoteDetail(note),
    });
    return this.creditNoteOutcome(tx, doc.id);
  }
  /**
   * @cc [owner:nareshshah139,label:product] count-recovery-fresh-observation
   * Restarting a decided COUNT MUST create one linked draft per source version, capture current
   * batch balances, discard all previous physical observations, and change no stock. A count still
   * open on its batches is refused, so a batch is never on two undecided counts.
   */
  private async restartCount(tx: any, actor: WorkflowActor, doc: any) {
    if (doc.kind !== 'COUNT' || !['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'POSTED', 'REJECTED', 'CANCELLED', 'REVERSED'].includes(doc.status))
      throw new BadRequestException('Only a physical count can be restarted');
    const requestKey = `recount:${doc.id}:${doc.version}`;
    const existing = await tx.inventoryWorkflowDocument.findUnique({ where: { branchId_requestKey: { branchId: actor.branchId, requestKey } } });
    if (existing) return this.plain(existing);
    await this.refuseOpenCounts(tx, actor, doc.payload.lines, await this.openCountHolders(tx, actor.branchId));
    const payload = await this.normalizePayload(tx, actor, 'COUNT', {
      reason: doc.payload.reason,
      lines: doc.payload.lines.map((line: WorkflowLine) => ({ inventoryId: line.inventoryId, quantity: 0 })),
    });
    const created = await tx.inventoryWorkflowDocument.create({ data: {
      branchId: actor.branchId, kind: 'COUNT', status: 'DRAFT', sourceId: doc.id,
      reference: `Recount: ${doc.reference}`.slice(0, 160), requestKey, createdBy: actor.id,
      payload, totalAmount: 0,
    } });
    await this.event(tx, created, actor, 'RECOUNT', null, { sourceId: doc.id, sourceVersion: doc.version, observationsDiscarded: true });
    return this.plain(created);
  }
  private async recordCount(tx: any, actor: WorkflowActor, doc: any) {
    const p = doc.payload;
    const auditorId = p.signOff?.by || actor.id;
    for (const line of (p.lines as WorkflowLine[]).filter((l) => l.physicalStock !== undefined)) {
      const item = await tx.inventoryItem.findFirst({
        where: { id: line.inventoryId, branchId: actor.branchId },
      });
      const ledgerCheckpoint = {
        documentId: doc.id,
        quantity: item.currentStock,
        actorId: actor.id,
        recordedAt: new Date().toISOString(),
        coveredMovementIds: (await tx.stockTransaction.findMany({
          where: { branchId: actor.branchId, itemId: item.id }, select: { id: true },
        })).map((movement: any) => movement.id),
      };
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          metadata: JSON.stringify({
            ...jsonObject(item.metadata),
            lastCountAt: new Date().toISOString(),
            lastCountDocumentId: doc.id,
            ...(p.signOff?.at ? { lastSignedCountAt: p.signOff.at } : {}),
            ledgerCheckpoint,
          }),
        },
      });
      await tx.inventoryAudit.create({
        data: {
          branchId: actor.branchId,
          itemId: item.id,
          auditorId,
          physicalStock: line.physicalStock,
          systemStock: line.systemStock,
          variance: line.physicalStock! - line.systemStock!,
          status: 'ADJUSTED',
          notes: JSON.stringify({
            workflowDocumentId: doc.id,
            ledgerCheckpoint,
            reason: p.decision?.reason || p.reason,
            ...(p.decision ? { approvedBy: p.decision.by } : {}),
            ...(line.note ? { note: line.note } : {}),
          }),
        },
      });
    }
  }
  private async openCount(tx: any, actor: WorkflowActor, id: string) {
    const doc = await tx.inventoryWorkflowDocument.findFirst({
      where: { id, branchId: actor.branchId },
    });
    if (!doc || doc.kind !== 'COUNT') throw new NotFoundException('Stock count not found');
    return doc;
  }
  async openCountHolders(db: any, branchId: string, exceptId?: string) {
    const open: OpenCount[] = await db.inventoryWorkflowDocument.findMany({
      where: { branchId, kind: 'COUNT', status: { in: OPEN_COUNT } },
      select: { id: true, status: true, reference: true, createdBy: true, payload: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const holders = new Map<string, OpenCount>();
    for (const doc of open)
      if (doc.id !== exceptId)
        for (const line of doc.payload?.lines || []) if (!holders.has(line.inventoryId)) holders.set(line.inventoryId, doc);
    return holders;
  }
  /**
   * @cc [owner:nareshshah139,label:product] count-one-open-per-batch
   * A batch MUST be on at most one undecided count. Starting or recounting a count on a batch that
   * is on an unsigned or unapproved count is refused, naming that count, so two counts of one
   * shelf can never both adjust its stock.
   */
  private async refuseOpenCounts(tx: any, actor: WorkflowActor, lines: Pick<WorkflowLine, 'inventoryId' | 'name' | 'batchNumber'>[], holders: Map<string, OpenCount>) {
    const held = lines.filter((line) => holders.has(line.inventoryId));
    if (!held.length) return;
    const holder = holders.get(held[0].inventoryId)!;
    const same = held.filter((line) => holders.get(line.inventoryId)!.id === holder.id).length;
    const elsewhere = held.length - same;
    const assigneeId = holder.payload?.assigneeId ?? holder.createdBy;
    const person = assigneeId === actor.id ? null : await tx.user.findFirst({ where: { id: assigneeId }, select: { firstName: true, lastName: true } });
    const name = person ? `${person.firstName} ${person.lastName}`.trim() : 'a former staff member';
    const whose = assigneeId === actor.id ? 'your' : `${name}'s`;
    const day = holder.payload?.date ? displayDay(holder.payload.date) : 'an earlier day';
    const signed = holder.status === 'AWAITING_APPROVAL';
    const subject = same > 1 ? `${batchLabel(held[0])}, and ${batches(same - 1)} are` : `${batchLabel(held[0])}, is`;
    const others = elsewhere ? ` ${elsewhere} more ${elsewhere === 1 ? 'batch is' : 'batches are'} on other open counts.` : '';
    const next = signed
      ? 'Approve or reject that count first.'
      : assigneeId === actor.id
        ? `Count ${same > 1 ? 'them' : 'it'} there.`
        : `Count ${same > 1 ? 'them' : 'it'} there, or ask ${name} to sign it off first.`;
    throw new ConflictException({
      code: 'COUNT_BATCH_OPEN',
      message: `${subject} already on ${whose} count of ${day}, ${signed ? 'signed and waiting for approval' : 'not signed yet'}.${others} ${next}`,
      openCounts: [...new Set(held.map((line) => holders.get(line.inventoryId)!))].map((doc) => ({ id: doc.id, reference: doc.reference })),
      stockEffect: 'NONE',
    });
  }
  private async countAssigneeOnly(tx: any, actor: WorkflowActor, doc: any) {
    const assigneeId = doc.payload.assigneeId;
    if (!assigneeId || assigneeId === actor.id) return;
    const person = await tx.user.findFirst({ where: { id: assigneeId }, select: { firstName: true, lastName: true } });
    throw new ForbiddenException(
      `This count is assigned to ${person ? `${person.firstName} ${person.lastName}`.trim() : 'another person'}. Only they can enter and sign it off.`,
    );
  }
  private async countLines(
    tx: any,
    actor: WorkflowActor,
    doc: any,
    input: unknown,
    retyping: boolean,
  ): Promise<{ lines: WorkflowLine[]; outdated: WorkflowLine[] }> {
    const lines: WorkflowLine[] = doc.payload.lines || [];
    if (input !== undefined && !Array.isArray(input)) throw new BadRequestException('Send the counted lines as a list');
    const byId = new Map<string, any>();
    for (const entry of (input as any[]) ?? []) {
      const id = clean(entry?.id);
      if (!lines.some((l) => l.id === id))
        throw new BadRequestException('A counted line is not part of this count. Reload the count.');
      byId.set(id, entry);
    }
    const items = await tx.inventoryItem.findMany({
      where: { branchId: actor.branchId, id: { in: lines.map((l) => l.inventoryId) } },
      select: { id: true, currentStock: true, metadata: true },
    });
    const stock = new Map<string, number>(items.map((i: any) => [i.id, i.currentStock]));
    const marks = new Map<string, Record<string, any>>(items.map((i: any) => [i.id, jsonObject(i.metadata)]));
    const outdated = (line: WorkflowLine) => observationOutdated(line, marks.get(line.inventoryId) ?? {}, doc.id);
    const now = new Date().toISOString();
    const next = lines.map((line) => {
      const entry = byId.get(line.id);
      if (!entry) return line;
      const next: WorkflowLine = { ...line };
      if ('physicalStock' in entry) {
        const raw = entry.physicalStock;
        const count = raw === '' || raw === null || raw === undefined ? undefined : Number(raw);
        if (count !== undefined && (!Number.isSafeInteger(count) || count < 0))
          throw new BadRequestException({
            code: 'INVENTORY_INVALID_COUNT',
            message: `${line.name || 'Selected batch'}: the counted quantity must be a whole number of at least 0.`,
            stockEffect: 'NONE',
            recovery: { action: 'CORRECT_FIELD', inventoryId: line.inventoryId, field: 'physicalStock' },
          });
        if (count !== line.physicalStock || (retyping && outdated(line))) {
          next.systemStock = stock.get(line.inventoryId) ?? line.systemStock;
          next.capturedAt = count === undefined ? undefined : now;
        }
        next.physicalStock = count;
      }
      if ('note' in entry) next.note = clean(entry.note).slice(0, 300) || undefined;
      return JSON.parse(JSON.stringify(next));
    });
    return { lines: next, outdated: next.filter(outdated) };
  }
  /**
   * @cc [owner:nareshshah139,label:product] count-progress-capture
   * Saving counted quantities MUST capture the batch's stock at the moment each quantity is entered,
   * change no stock, and accept only the assignee of an unsigned count.
   */
  async saveCountProgress(actor: WorkflowActor, id: string, input: Record<string, any>) {
    await this.authorize(actor, 'COUNT', true);
    return this.transaction(async (tx) => {
      const doc = await this.openCount(tx, actor, id);
      if (doc.status !== 'DRAFT')
        throw new ConflictException('This count is already signed off. Reload to see the signed record.');
      await this.countAssigneeOnly(tx, actor, doc);
      if (doc.version !== Number(input?.version))
        throw new ConflictException('This count changed in another window. Reload to see the latest counts.');
      const { lines } = await this.countLines(tx, actor, doc, input.lines, true);
      return this.plain(
        await tx.inventoryWorkflowDocument.update({
          where: { id: doc.id, branchId: actor.branchId, version: doc.version },
          data: { payload: { ...doc.payload, lines }, version: { increment: 1 } },
        }),
      );
    });
  }
  private async requestKeyFree(tx: any, actor: WorkflowActor, documentId: string, key: string) {
    const elsewhere = await tx.inventoryWorkflowEvent.findFirst({
      where: { branchId: actor.branchId, documentId: { not: documentId }, action: { in: ['SIGN_OFF', 'APPROVE', 'REJECT'] }, detail: { path: ['requestKey'], equals: key } },
      select: { id: true },
    });
    if (elsewhere)
      throw new ConflictException({ code: 'COUNT_REQUEST_KEY_REUSED', message: 'This request was already used for another stock count. Reload and try again.' });
  }
  /**
   * @cc [owner:nareshshah139,label:product] count-sign-off-locks
   * Sign-off MUST record who, when, every batch's system and counted quantity, the variance and any
   * note, and lock the count. Every line must be counted and a difference needs a note. With no
   * difference the count posts without changing stock; any difference waits for an approver.
   * Replaying the same request key returns the signed record; the same key with other figures gets 409.
   */
  async signOffCount(actor: WorkflowActor, id: string, input: Record<string, any>) {
    await this.authorize(actor, 'COUNT', true);
    const key = clean(input?.requestKey);
    if (!key || key.length > 150) throw new BadRequestException('A request key is required');
    const note = clean(input?.note).slice(0, 1000);
    const print = fingerprintOf({
      note,
      lines: (Array.isArray(input?.lines) ? input.lines : [])
        .map((l: any) => [clean(l?.id), l?.physicalStock === '' || l?.physicalStock == null ? null : Number(l.physicalStock), clean(l?.note)])
        .sort((a: any[], b: any[]) => String(a[0]).localeCompare(String(b[0]))),
    });
    return this.transaction(async (tx) => {
      const doc = await this.openCount(tx, actor, id);
      if (doc.payload.signOff?.requestKey === key) {
        if (doc.payload.signOff.fingerprint !== print)
          throw new ConflictException({ code: 'COUNT_REQUEST_KEY_REUSED', message: 'This sign-off was already recorded with different figures. Reload to see the signed record.' });
        return this.plain(doc);
      }
      if (doc.status !== 'DRAFT')
        throw new ConflictException('This count was already signed off. Reload to see the signed record.');
      await this.countAssigneeOnly(tx, actor, doc);
      await this.requestKeyFree(tx, actor, doc.id, key);
      if (doc.version !== Number(input?.version))
        throw new ConflictException('This count changed in another window. Reload to see the latest counts.');
      const { lines, outdated } = await this.countLines(tx, actor, doc, input.lines, false);
      const missing = lines.filter((l) => l.physicalStock === undefined);
      if (missing.length)
        throw new BadRequestException({
          code: 'COUNT_INCOMPLETE',
          message: `Count every item before signing off. Not counted yet: ${missing.slice(0, 3).map((l) => l.name).join(', ')}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''}.`,
          lineIds: missing.map((l) => l.id),
        });
      if (outdated.length)
        throw new BadRequestException({
          code: 'COUNT_RETYPE',
          message: `Type these counts again before signing off: ${outdated.slice(0, 3).map((l) => l.name).join(', ')}${outdated.length > 3 ? ` and ${outdated.length - 3} more` : ''}. The system quantity they were compared with is out of date.`,
          lineIds: outdated.map((l) => l.id),
        });
      const signedElsewhere = new Map([...(await this.openCountHolders(tx, actor.branchId, doc.id))].filter(([, holder]) => holder.status === 'AWAITING_APPROVAL'));
      await this.refuseOpenCounts(tx, actor, lines, signedElsewhere);
      const differing = lines.filter((l) => l.physicalStock !== l.systemStock);
      if (differing.length && !note)
        throw new BadRequestException({ code: 'COUNT_NOTE_REQUIRED', message: 'Add a note explaining the differences before signing off.' });
      const at = new Date();
      const next = differing.length ? 'AWAITING_APPROVAL' : 'POSTED';
      const payload = { ...doc.payload, lines, signOff: { by: actor.id, at: at.toISOString(), note, requestKey: key, fingerprint: print } };
      const updated = await tx.inventoryWorkflowDocument.update({
        where: { id: doc.id, branchId: actor.branchId, version: doc.version },
        data: {
          payload,
          status: next,
          version: { increment: 1 },
          ...(next === 'POSTED' ? { postedAt: at, postedBy: actor.id } : {}),
        },
      });
      if (next === 'POSTED') await this.recordCount(tx, actor, updated);
      await this.event(tx, updated, actor, 'SIGN_OFF', doc.status, {
        requestKey: key,
        note,
        counted: lines.length,
        differences: differing.map((l) => ({ lineId: l.id, inventoryId: l.inventoryId, systemStock: l.systemStock, physicalStock: l.physicalStock, note: l.note })),
        stockEffect: false,
      });
      return this.plain(updated);
    });
  }
  /**
   * @cc [owner:nareshshah139,label:product] count-variance-approval
   * Only an inventory approver decides a signed count's differences, never the person who signed it
   * unless nobody else can, and then only after confirming. Approval applies each line's
   * counted-minus-system difference to the batch's current stock, so sales after the count do not
   * block it, and logs the reason and approver on the movement. Rejection changes no stock and leaves
   * the batches uncounted for the cycle. Replaying the same request key returns the decision; the
   * same key with another answer gets 409. A decrease larger than the stock left now is refused.
   */
  async decideCount(actor: WorkflowActor, id: string, decision: 'APPROVE' | 'REJECT', input: Record<string, any>) {
    await this.authorize(actor, 'COUNT');
    if (!COUNT_APPROVERS.has(actor.role))
      throw new ForbiddenException('A doctor or an administrator decides stock count differences');
    const key = clean(input?.requestKey);
    if (!key || key.length > 150) throw new BadRequestException('A request key is required');
    const reason = clean(input?.reason).slice(0, 500);
    if (!reason)
      throw new BadRequestException(decision === 'APPROVE' ? 'Give a reason for approving the stock change' : 'Give a reason for rejecting this count');
    const print = fingerprintOf({ decision, reason, selfApproval: input?.selfApproval === true });
    const settings = await this.settings(actor);
    return this.transaction(async (tx) => {
      const doc = await this.openCount(tx, actor, id);
      if (doc.payload.decision?.requestKey === key) {
        if (doc.payload.decision.fingerprint !== print)
          throw new ConflictException({ code: 'COUNT_REQUEST_KEY_REUSED', message: 'This count was already decided with a different answer. Reload to see its current status.' });
        return this.plain(doc);
      }
      if (doc.status !== 'AWAITING_APPROVAL')
        throw new ConflictException('This count is no longer waiting for approval. Reload to see its current status.');
      await this.requestKeyFree(tx, actor, doc.id, key);
      if (doc.version !== Number(input?.version))
        throw new ConflictException('This count changed in another window. Reload to see its current status.');
      const signer = doc.payload.signOff?.by || doc.createdBy;
      const self = signer === actor.id;
      if (self) {
        const others = await tx.user.findMany({
          where: { branchId: actor.branchId, isActive: true, role: { in: [...COUNT_APPROVERS] }, id: { not: actor.id } },
          select: { firstName: true, lastName: true },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        });
        if (others.length)
          throw new ForbiddenException({
            code: 'COUNT_SEPARATION_OF_DUTIES',
            message: `You signed this count, so someone else decides it. Ask ${others.map((o: any) => `${o.firstName} ${o.lastName}`.trim()).join(' or ')}.`,
          });
        if (input?.selfApproval !== true)
          throw new BadRequestException({
            code: 'COUNT_SELF_APPROVAL_CONFIRM',
            message: 'You are the only approver in this branch. Confirm that you are deciding your own count.',
          });
      }
      const lines: WorkflowLine[] = doc.payload.lines || [];
      if (decision === 'APPROVE') {
        const items = await tx.inventoryItem.findMany({
          where: { branchId: actor.branchId, id: { in: lines.map((l) => l.inventoryId) } },
          select: { id: true, name: true, unit: true, currentStock: true, metadata: true },
        });
        const byId = new Map<string, any>(items.map((i: any) => [i.id, i]));
        const superseded = lines.find((line) => byId.has(line.inventoryId) && observationOutdated(line, jsonObject(byId.get(line.inventoryId).metadata), doc.id, doc.payload.signOff?.at));
        if (superseded)
          throw new ConflictException({
            code: 'COUNT_SUPERSEDED',
            message: `${batchLabel(superseded)}, was counted again after this count and that count is already in the stock. Approving this one would apply the difference twice. Reject it instead.`,
            stockEffect: 'NONE',
          });
        for (const line of lines) {
          const item = byId.get(line.inventoryId);
          const delta = (line.physicalStock ?? 0) - (line.systemStock ?? 0);
          if (!item || item.currentStock + delta >= 0) continue;
          throw new ConflictException({
            code: 'COUNT_DELTA_BELOW_STOCK',
            message: `${item.name}: the count found ${-delta} fewer than the system had, but only ${item.currentStock} ${String(item.unit || 'units').toLowerCase()} are left now. The count cannot be right. Reject it and ask for a fresh count.`,
            stockEffect: 'NONE',
          });
        }
      }
      const at = new Date();
      const payload = { ...doc.payload, decision: { decision, by: actor.id, at: at.toISOString(), reason, requestKey: key, fingerprint: print, selfApproval: self } };
      const status = decision === 'APPROVE' ? 'POSTED' : 'REJECTED';
      const updated = await tx.inventoryWorkflowDocument.update({
        where: { id: doc.id, branchId: actor.branchId, version: doc.version },
        data: {
          payload,
          status,
          version: { increment: 1 },
          approvedBy: actor.id,
          ...(status === 'POSTED' ? { postedAt: at, postedBy: actor.id } : {}),
        },
      });
      if (status === 'POSTED') {
        await this.validatePosting(tx, actor, updated, settings);
        await this.applyStockDocument(tx, actor, updated, doc.status);
        await this.recordCount(tx, actor, updated);
      }
      await this.event(tx, updated, actor, decision, doc.status, {
        requestKey: key,
        reason,
        selfApproval: self,
        stockEffect: status === 'POSTED',
        ...(status === 'POSTED'
          ? { adjustments: lines.filter((l) => l.physicalStock !== l.systemStock).map((l) => ({ inventoryId: l.inventoryId, delta: l.physicalStock! - l.systemStock! })) }
          : {}),
      });
      return this.plain(updated);
    });
  }
  async createCycleCount(
    tx: any,
    assignee: WorkflowActor,
    input: { requestKey: string; reference: string; cycleStart: string; day: string; inventoryIds: string[]; plannedBy: string },
  ) {
    const existing = await tx.inventoryWorkflowDocument.findUnique({
      where: { branchId_requestKey: { branchId: assignee.branchId, requestKey: input.requestKey } },
    });
    if (existing) return null;
    const payload = await this.normalizePayload(tx, assignee, 'COUNT', {
      reason: 'Stock reconciliation cycle',
      date: input.day,
      lines: input.inventoryIds.map((inventoryId) => ({ inventoryId, quantity: 0 })),
    });
    const created = await tx.inventoryWorkflowDocument.create({
      data: {
        branchId: assignee.branchId,
        kind: 'COUNT',
        status: 'DRAFT',
        reference: input.reference,
        requestKey: input.requestKey,
        createdBy: assignee.id,
        payload: { ...payload, origin: 'CYCLE', assigneeId: assignee.id, cycle: { start: input.cycleStart, day: input.day } },
        totalAmount: 0,
      },
    });
    await this.event(tx, created, assignee, 'CREATE', null, { plannedBy: input.plannedBy, cycleStart: input.cycleStart });
    return created;
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
    if (doc.kind === 'CREDIT_NOTE') await this.validateStandaloneCreditNote(tx, actor, doc);
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
        !p.signOff &&
        line.physicalStock !== undefined &&
        line.systemStock !== item.currentStock
      )
        throw new ConflictException({
          code: 'INVENTORY_STALE_COUNT',
          message: `${item.name}: stock changed since the count started from ${line.systemStock} to ${item.currentStock} ${item.unit}. Choose Start fresh count and record a new physical observation. The earlier observation remains in this record.`,
          stockEffect: 'NONE',
          recovery: { action: 'START_FRESH_COUNT', inventoryId: item.id, quantities: { onHand: item.currentStock } },
        });
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
        reason:
          doc.kind === 'SUPPLIER_RETURN'
            ? returnMovementReason(doc.payload)
            : doc.kind === 'COUNT' && doc.payload.decision
              ? `Stock count approved: ${doc.payload.decision.reason}`
              : doc.payload.reason,
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
    if (doc.status === 'CANCELLED' && doc.payload.sourceHoldId && existing.some((e: any) => e.heldDelta < 0))
      await this.restoreHoldSource(tx, actor, doc);
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
        ) {
          const source = await tx.inventoryWorkflowDocument.findFirst({ where: { id: doc.payload.sourceHoldId, branchId: actor.branchId } });
          const remaining = sourceHold.get(line.inventoryId) || 0;
          throw new BadRequestException({
            code: 'INVENTORY_SOURCE_CAPACITY',
            message: `${line.name || 'Selected batch'}: quantity exceeds this source hold for the batch. This action requests ${heldByItem.get(line.inventoryId)} units; ${remaining} remain in ${source?.reference || 'the selected source'}. Open the source and its linked disposals or returns to verify the remaining goods before correcting the selected source or quantity. Another hold cannot cover this shortage.`,
            stockEffect: 'NONE',
            recovery: { action: 'REVIEW_SOURCE', inventoryId: line.inventoryId, sourceId: source?.id, sourceKind: source?.kind, quantities: { remaining, requested: heldByItem.get(line.inventoryId) } },
          });
        }
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
  /**
   * @cc [owner:nareshshah139,label:product] released-source-compensation
   * Compensation of a consumer of a released hold MUST reopen that same source atomically
   * with its inverse effects. It MUST NOT borrow another hold or erase the release history.
   * Reversed or missing source documents MUST reject the entire compensation.
   */
  private async restoreHoldSource(tx: any, actor: WorkflowActor, consumer: any) {
    const source = await tx.inventoryWorkflowDocument.findFirst({ where: {
      id: consumer.payload.sourceHoldId, branchId: actor.branchId, kind: { in: ['HOLD', 'SALES_RETURN'] },
    } });
    if (!source || !['POSTED', 'RELEASED'].includes(source.status))
      throw new BadRequestException('The original hold is unavailable for compensation');
    if (source.status === 'POSTED') return;
    const reopened = await tx.inventoryWorkflowDocument.update({
      where: { id: source.id, branchId: actor.branchId, status: 'RELEASED', version: source.version },
      data: { status: 'POSTED', version: { increment: 1 } },
    });
    await this.event(tx, reopened, actor, 'REOPEN_FOR_CORRECTION', 'RELEASED', { consumerId: consumer.id, reason: 'Restore original held units during linked compensation' });
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
      if (quantity < 0) {
        const consumers = await tx.inventoryWorkflowDocument.findMany({ where: {
          branchId: actor.branchId, status: { in: ['POSTED', 'CHALLAN'] },
          payload: { path: ['sourceHoldId'], equals: doc.id },
        }, select: { id: true, kind: true, reference: true } });
        throw new ConflictException({
          code: 'INVENTORY_SOURCE_INCONSISTENT',
          message: `The source hold has an inconsistent balance of ${quantity} units for batch ${inventoryId}. Open ${doc.reference} and review its linked disposals or returns with an inventory manager. Correct invalid downstream records before trying a release; do not release another hold to cover this difference.`,
          stockEffect: 'NONE',
          recovery: { action: 'REVIEW_SOURCE', inventoryId, sourceId: doc.id, sourceKind: doc.kind, quantities: { remaining: quantity }, documents: consumers.map(({ id, kind, reference }: any) => ({ id, kind, reference })) },
        });
      }
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
    if (!INVENTORY_APPROVERS.has(actor.role))
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
    const consumers = await tx.inventoryWorkflowDocument.findMany({
      where: {
        branchId: actor.branchId,
        status: { in: ['POSTED', 'CHALLAN'] },
        payload: { path: ['sourceHoldId'], equals: doc.id },
      },
      select: { id: true, kind: true, reference: true },
    });
    if (consumers.length)
      throw new BadRequestException({
        code: 'INVENTORY_REVERSAL_BLOCKED',
        message: 'Reverse the linked hold disposals or returns first only if their recorded outcome needs correction. Open the blocking records and ask an inventory manager to verify their effects before reversing; then retry this reversal.',
        stockEffect: 'NONE',
        recovery: { action: 'REVERSE_DEPENDENCIES', documents: consumers.map(({ id, kind, reference }: any) => ({ id, kind, reference })) },
      });
    if (doc.payload.sourceHoldId) {
      await this.restoreHoldSource(tx, actor, doc);
      await this.holdBalances(tx, actor, doc.payload.sourceHoldId, doc.id);
    }
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
    const credit = await this.creditWithBalance(tx, doc.id);
    if (credit && credit.balance.applied > 0)
      throw new BadRequestException(
        `${rupees(credit.balance.applied)} of this credit is set off against bills. Undo the set-off before reversing this return.`,
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
