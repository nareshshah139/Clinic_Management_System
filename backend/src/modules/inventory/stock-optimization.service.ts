import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { clinicDay } from '../pharmacy/register-utils';
import { InventoryWorkflowService } from './inventory-workflow.service';
import { WorkflowActor } from './inventory-workflow.types';
import { readStockGaps } from './inventory-stock-query';
import { money } from './inventory-stock';
import { displayDay } from './supplier-return';
import { prescriptionNameKey, stockIdentityKey } from '../pharmacy/pharmacy-stock-identity';
import {
  classifyStock,
  draftLines,
  DistributorGroup,
  OpenReturn,
  OptimizationRules,
  parseOptimizationRules,
  StockBatch,
  storedOptimizationRules,
} from './stock-optimization';

const wholeRupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const OPEN_RETURN = ['DRAFT', 'AWAITING_APPROVAL', 'APPROVED'];
const SENT_RETURN = ['CHALLAN', 'POSTED'];
const gstinOf = (value: string | null | undefined) => (value ?? '').trim().toUpperCase();
/**
 * The product a batch belongs to, so a batch is judged on its product's sales: its linked drug, or for a batch with no
 * single linked drug, its standard name, stock unit and pack. Sales take the earliest expiry first, so a later batch of a
 * product that sells every day may itself never sell.
 */
const productKey = (item: { name: string; unit: string; packSize: number | null; packUnit: string | null; drugs: { id: string }[] }) =>
  item.drugs.length === 1 ? stockIdentityKey(item) : `name:${JSON.stringify([prescriptionNameKey(item.name), item.unit, item.packSize ?? null, item.packUnit ?? null])}`;

/** What is left to return of a purchase line. Returns that put free units under quantity are taken from the free units. */
function unreturnedOf(bought: { quantityPurchased: number; freeQuantity: number }, sent = { paid: 0, free: 0 }) {
  let paid = bought.quantityPurchased - sent.paid;
  let free = bought.freeQuantity - sent.free;
  if (paid < 0) [free, paid] = [free + paid, 0];
  if (free < 0) [paid, free] = [paid + free, 0];
  return { unreturnedPaid: Math.max(0, paid), unreturnedFree: Math.max(0, free) };
}

type Supplier = { id: string; name: string };
export type PresentedGroup = DistributorGroup & {
  supplier: Supplier | null;
  openReturns: OpenReturn[];
  draftable: boolean;
  blocker: string | null;
};

/**
 * @cc [owner:nareshshah139,label:product] stock-optimization-run
 * Running optimization MUST scan every branch batch with stock on hand against its product's sales and
 * its batch's purchase lines, split slow stock into returnable and non-returnable groups by distributor
 * under the branch's saved rules, and change no stock, document or setting.
 */
/**
 * @cc [owner:nareshshah139,label:product] stock-optimization-return-draft
 * A return draft from optimization MUST be built on the server from a fresh run, carry each line's
 * purchase line, batch, PTR and GST with free units at no value, refuse a group below the minimum
 * batch value counted on paid units, leave out batches already on an open return, and create one
 * document per request key. Concurrent presses for one distributor MUST create one draft.
 */
@Injectable()
export class InventoryOptimizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: InventoryWorkflowService,
  ) {}

  async gaps(actor: WorkflowActor) {
    if (!(await this.workflow.permissions(actor)).has('inventory:item:read')) throw new ForbiddenException('This action requires inventory:item:read');
    return readStockGaps(this.prisma, actor.branchId);
  }

  async rules(actor: WorkflowActor) {
    const settings = await this.workflow.settings(actor);
    return { ...(settings.optimization as OptimizationRules), version: settings.version as number };
  }

  /** Who may raise a supplier return may also tune when one is suggested; other settings keep their approver rule. */
  async saveRules(actor: WorkflowActor, input: Record<string, unknown>) {
    await this.workflow.authorize(actor, 'SUPPLIER_RETURN', true);
    return this.workflow.transaction(async (tx) => {
      const row = await tx.inventoryWorkflowSettings.findUnique({ where: { branchId: actor.branchId } });
      const version = row?.version ?? 0;
      if (input.version !== version) throw new ConflictException('Settings changed. Reload before saving.');
      const stored = (row?.settings && typeof row.settings === 'object' ? row.settings : {}) as Record<string, unknown>;
      let optimization: OptimizationRules;
      try {
        optimization = parseOptimizationRules(input, storedOptimizationRules(stored.optimization));
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
      const settings = { ...stored, optimization };
      const saved = row
        ? await tx.inventoryWorkflowSettings.update({
            where: { branchId: actor.branchId, version },
            data: { settings, updatedBy: actor.id, version: { increment: 1 } },
          })
        : await tx.inventoryWorkflowSettings.create({ data: { branchId: actor.branchId, updatedBy: actor.id, settings } });
      await tx.auditLog.create({
        data: {
          userId: actor.id, action: 'INVENTORY_OPTIMIZATION_RULES', entity: 'InventoryWorkflowSettings', entityId: actor.branchId,
          oldValues: JSON.stringify({ branchId: actor.branchId, optimization: storedOptimizationRules(stored.optimization) }),
          newValues: JSON.stringify({ branchId: actor.branchId, optimization }),
        },
      });
      return { ...optimization, version: saved.version };
    });
  }

  async run(actor: WorkflowActor, now = new Date(), db: any = this.prisma) {
    await this.workflow.authorize(actor, 'SUPPLIER_RETURN');
    const { version: _version, ...rules } = await this.rules(actor);
    const result = classifyStock(await this.batches(db, actor.branchId), rules, now);
    const suppliers = await this.suppliers(db, actor.branchId);
    const present = (group: DistributorGroup): PresentedGroup => {
      const supplier = suppliers.get(group.gstin) ?? null;
      const openReturns = [...new Map(group.rows.filter((r) => r.openReturn).map((r) => [r.openReturn!.id, r.openReturn!])).values()];
      const pending = draftLines(group).length;
      const blocker = group.belowMinimum
        ? `Below ${wholeRupees.format(rules.minimumBatchValue)}, not worth returning`
        : !pending
          ? 'Every batch is already on a return draft'
          : !supplier
            ? `Add ${group.name} (GSTIN ${group.gstin}) in Purchases › Suppliers to raise a return`
            : null;
      return { ...group, supplier, openReturns, draftable: blocker === null, blocker };
    };
    return {
      ...result,
      returnable: result.returnable.map(present),
      nonReturnable: result.nonReturnable,
      totals: {
        returnable: money(result.returnable.reduce((n, g) => n + g.value, 0)),
        nonReturnable: money(result.nonReturnable.reduce((n, g) => n + g.value, 0)),
      },
    };
  }

  async createReturnDraft(actor: WorkflowActor, input: Record<string, unknown>) {
    await this.workflow.authorize(actor, 'SUPPLIER_RETURN', true);
    const requestKey = String(input.requestKey ?? '').trim();
    const gstin = gstinOf(String(input.distributorGstin ?? ''));
    if (!requestKey || requestKey.length > 150 || !gstin) throw new BadRequestException('A distributor and a request key are required');
    const today = clinicDay(new Date());
    const reference = `RET-SO-${today.replaceAll('-', '')}-${gstin.slice(2, 7)}`;
    await this.workflow.checkDocument(actor, { kind: 'SUPPLIER_RETURN', reference, requestKey, payload: {} } as any);
    return this.workflow.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`supplier-return:${actor.branchId}:${gstin}`}, 0))`;
      const replay = await tx.inventoryWorkflowDocument.findUnique({ where: { branchId_requestKey: { branchId: actor.branchId, requestKey } } });
      if (replay?.kind === 'SUPPLIER_RETURN') return { ...replay, totalAmount: Number(replay.totalAmount) };
      const run = await this.run(actor, new Date(), tx);
      const group = run.returnable.find((candidate) => candidate.gstin === gstin);
      if (!group) throw new NotFoundException('This distributor has no returnable slow-moving stock now. Run optimization again.');
      if (!group.draftable || !group.supplier) throw new BadRequestException(group.blocker);
      const bills = [...new Set(group.rows.filter((r) => !r.openReturn).map((r) => r.source!.invoiceId))];
      return this.workflow.writeDocument(tx, actor, {
        kind: 'SUPPLIER_RETURN',
        reference,
        requestKey,
        supplierId: group.supplier.id,
        ...(bills.length === 1 ? { purchaseInvoiceId: bills[0] } : {}),
        payload: {
          date: today,
          returnReason: 'OTHER',
          reason: `Slow-moving: no sale in ${run.rules.nonMovingDays} days (stock optimization ${displayDay(today)})`,
          lines: draftLines(group),
        },
      });
    });
  }

  private async suppliers(db: any, branchId: string) {
    const rows: { id: string; name: string; gstNumber: string | null }[] = await db.supplier.findMany({
      where: { branchId, isActive: true, gstNumber: { not: null } },
      select: { id: true, name: true, gstNumber: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const byGstin = new Map<string, Supplier>();
    for (const row of rows) if (!byGstin.has(gstinOf(row.gstNumber))) byGstin.set(gstinOf(row.gstNumber), { id: row.id, name: row.name });
    return byGstin;
  }

  private async batches(db: any, branchId: string): Promise<StockBatch[]> {
    const items: any[] = await db.inventoryItem.findMany({
      where: { branchId, currentStock: { gt: 0 } },
      select: {
        id: true, name: true, batchNumber: true, expiryDate: true, unit: true, packSize: true, packUnit: true, currentStock: true,
        heldStock: true, costPrice: true, gstRate: true, createdAt: true, drugs: { select: { id: true } },
      },
    });
    const ids = items.map((item) => item.id);
    const [sales, receipts, lines, returns]: any[][] = await Promise.all([
      db.stockTransaction.groupBy({ by: ['itemId'], where: { branchId, type: 'SALE' }, _max: { createdAt: true } }),
      db.stockTransaction.groupBy({ by: ['itemId'], where: { branchId, type: 'PURCHASE', itemId: { in: ids } }, _max: { createdAt: true } }),
      db.pharmacyPurchaseInvoiceItem.findMany({
        where: { inventoryItemId: { in: ids }, purchaseInvoice: { branchId, status: 'STOCK_COMMITTED' } },
        select: {
          id: true, inventoryItemId: true, quantityPurchased: true, freeQuantity: true, purchaseRate: true, cgstPercent: true, sgstPercent: true, igstPercent: true,
          purchaseInvoice: { select: { id: true, invoiceNumber: true, invoiceDate: true, distributorGstin: true, distributorName: true } },
        },
      }),
      db.inventoryWorkflowDocument.findMany({
        where: { branchId, kind: 'SUPPLIER_RETURN', status: { in: [...OPEN_RETURN, ...SENT_RETURN] } },
        select: { id: true, reference: true, status: true, payload: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const soldItems = sales.map((sale) => sale.itemId).filter((id) => !ids.includes(id));
    const siblings = soldItems.length
      ? await db.inventoryItem.findMany({
          where: { branchId, id: { in: soldItems } },
          select: { id: true, name: true, unit: true, packSize: true, packUnit: true, drugs: { select: { id: true } } },
        })
      : [];
    const keyOf = new Map([...items, ...siblings].map((item) => [item.id, productKey(item)]));
    const lastSale = new Map<string, Date>();
    for (const sale of sales) {
      const key = keyOf.get(sale.itemId);
      const at = sale._max.createdAt;
      const known = key ? lastSale.get(key) : undefined;
      if (key && at && (!known || known < at)) lastSale.set(key, at);
    }
    const received = new Map(receipts.map((receipt) => [receipt.itemId, receipt._max.createdAt]));
    const returned = new Map<string, { paid: number; free: number }>();
    const open = new Map<string, OpenReturn>();
    for (const doc of returns)
      for (const line of ((doc.payload as any)?.lines ?? []) as { inventoryId: string; sourceLineId?: string; quantity: number; freeQuantity?: number }[]) {
        if (SENT_RETURN.includes(doc.status) && line.sourceLineId) {
          const sent = returned.get(line.sourceLineId) ?? { paid: 0, free: 0 };
          returned.set(line.sourceLineId, { paid: sent.paid + line.quantity, free: sent.free + (line.freeQuantity ?? 0) });
        }
        if (OPEN_RETURN.includes(doc.status) && !open.has(line.inventoryId))
          open.set(line.inventoryId, { id: doc.id, reference: doc.reference, status: doc.status });
      }
    return items.map((item) => ({
      id: item.id,
      name: item.name,
      batchNumber: item.batchNumber,
      expiryDate: item.expiryDate,
      unit: item.unit,
      available: item.currentStock - item.heldStock,
      costPrice: item.costPrice,
      gstRate: item.gstRate,
      receivedAt: received.get(item.id) ?? item.createdAt,
      lastSaleAt: lastSale.get(keyOf.get(item.id)!) ?? null,
      openReturn: open.get(item.id) ?? null,
      purchases: lines
        .filter((line) => line.inventoryItemId === item.id)
        .map((line) => ({
          lineId: line.id,
          invoiceId: line.purchaseInvoice.id,
          invoiceNumber: line.purchaseInvoice.invoiceNumber,
          invoiceDate: line.purchaseInvoice.invoiceDate,
          distributorGstin: gstinOf(line.purchaseInvoice.distributorGstin),
          distributorName: line.purchaseInvoice.distributorName,
          ptr: line.purchaseRate,
          gstRate: line.cgstPercent + line.sgstPercent + line.igstPercent,
          ...unreturnedOf(line, returned.get(line.id)),
        })),
    }));
  }
}
