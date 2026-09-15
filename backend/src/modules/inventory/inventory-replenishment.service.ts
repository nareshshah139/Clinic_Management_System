import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../shared/database/prisma.service';
import { InventoryWorkflowService } from './inventory-workflow.service';
import { WorkflowActor } from './inventory-workflow.types';
import { jsonObject, money, movementDelta, stockStatus } from './inventory-stock';

const MODEL = 'observed-demand-cover-v2';
const DAY = 86400000;
const linesOf = (doc: any): any[] => Array.isArray(doc?.payload?.lines) ? doc.payload.lines : [];
const manager = (actor: WorkflowActor) => {
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(actor.role)) throw new ForbiddenException('An inventory manager must approve this action');
};

@Injectable()
export class InventoryReplenishmentService {
  constructor(private readonly prisma: PrismaService, private readonly workflow: InventoryWorkflowService) {}

  async manualTargets(actor: WorkflowActor, input: Record<string, any> = {}) {
    await this.workflow.authorize(actor, 'TARGET_REVIEW');
    const settings = await this.workflow.settings(actor);
    const search = String(input.search || '').trim();
    const items = await this.prisma.inventoryItem.findMany({ where: { branchId: actor.branchId, status: 'ACTIVE', ...(search ? { OR: ['name', 'sku', 'barcode'].map(field => ({ [field]: { contains: search, mode: 'insensitive' } })) } : {}) }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
    const history = await this.prisma.auditLog.findMany({ where: { entity: 'InventoryItem', action: 'INVENTORY_TARGET_REVIEW', entityId: { in: items.map(item => item.id) } }, orderBy: { timestamp: 'desc' } });
    return { version: settings.version, branchId: actor.branchId, rows: items.map(item => ({ id: item.id, name: item.name, unit: item.unit, packSize: item.packSize, packUnit: item.packUnit,
      updatedAt: item.updatedAt, minStockLevel: item.minStockLevel, maxStockLevel: item.maxStockLevel, reorderLevel: item.reorderLevel,
      available: item.currentStock - item.heldStock, manualTargets: jsonObject(item.metadata).manualTargets === true, excluded: settings.excludedItemIds.includes(item.id),
      lastChangedBy: jsonObject(item.metadata).targetUpdatedBy || null, lastChangedAt: jsonObject(item.metadata).targetUpdatedAt || null,
      history: history.filter(event => event.entityId === item.id).map(event => ({ id: event.id, actorId: event.userId, at: event.timestamp, before: jsonObject(event.oldValues), after: jsonObject(event.newValues) })) })) };
  }

  /**
   * @cc [owner:nareshshah139,label:product] replenishment-manual-targets-reviewed-atomic
   * Manual target or exclusion changes MUST require an explicit reason and unchanged item/settings
   * revisions. Selected rows MUST validate nonnegative whole stock units and min/reorder <= max,
   * record actor and before/after values atomically, and never alter posted quantities or prices.
   */
  async saveManualTargets(actor: WorkflowActor, input: Record<string, any>) {
    await this.workflow.authorize(actor, 'TARGET_REVIEW', true); manager(actor);
    const reason = String(input.reason || '').trim();
    if (!reason || !Array.isArray(input.items) || !input.items.length || input.items.length > 1000) throw new BadRequestException('Select up to 1,000 items and give a reason for the reviewed changes');
    const ids = input.items.map((i: any) => i.id);
    if (ids.some((id: unknown) => typeof id !== 'string' || !id.trim())) throw new BadRequestException('Choose valid saved item identifiers');
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Choose each item once');
    const quantity = (value: unknown, label: string): number | null => {
      if (value === '' || value === null) return null;
      if (!['string', 'number'].includes(typeof value) || typeof value === 'string' && !value.trim() || !Number.isSafeInteger(Number(value)) || Number(value) < 0) throw new BadRequestException(`${label} must be a nonnegative whole stock quantity, or blank for unconfigured`);
      return Number(value);
    };
    return this.workflow.transaction(async tx => {
      const configuration = await tx.inventoryWorkflowSettings.findUnique({ where: { branchId: actor.branchId } });
      if ((configuration?.version || 0) !== input.settingsVersion) throw new ConflictException('Replenishment settings changed. Reload before reviewing these changes again.');
      const settings = jsonObject(configuration?.settings), exclusions = new Set<string>(settings.excludedItemIds || []);
      const items = await tx.inventoryItem.findMany({ where: { branchId: actor.branchId, id: { in: ids }, status: 'ACTIVE' } });
      if (items.length !== ids.length) throw new BadRequestException('An item is not active in this branch');
      const changedAt = new Date().toISOString();
      for (const item of items) {
        const change = input.items.find((i: any) => i.id === item.id);
        if (item.updatedAt.toISOString() !== change.updatedAt) throw new ConflictException(`${item.name}: details changed. Reload and review the new values.`);
        if (typeof change.manualTargets !== 'boolean' || typeof change.excluded !== 'boolean') throw new BadRequestException('Choose the manual override and exclusion state for every selected item');
        const values = { minStockLevel: quantity(change.minStockLevel, 'Minimum'), maxStockLevel: quantity(change.maxStockLevel, 'Maximum'), reorderLevel: quantity(change.reorderLevel, 'Reorder level') };
        if (values.maxStockLevel !== null && (values.minStockLevel !== null && values.minStockLevel > values.maxStockLevel || values.reorderLevel !== null && values.reorderLevel > values.maxStockLevel)) throw new BadRequestException(`${item.name}: minimum and reorder level cannot exceed maximum`);
        const metadata = jsonObject(item.metadata), before = { minStockLevel: item.minStockLevel, maxStockLevel: item.maxStockLevel, reorderLevel: item.reorderLevel, manualTargets: metadata.manualTargets === true, excluded: exclusions.has(item.id) };
        if (change.excluded) exclusions.add(item.id); else exclusions.delete(item.id);
        await tx.inventoryItem.update({ where: { id: item.id, branchId: actor.branchId, updatedAt: item.updatedAt }, data: { ...values, stockStatus: stockStatus({ ...item, ...values }),
          metadata: JSON.stringify({ ...metadata, manualTargets: change.manualTargets, targetSource: 'MANUAL_REVIEW', targetReason: reason, targetUpdatedBy: actor.id, targetUpdatedAt: changedAt }) } });
        await tx.auditLog.create({ data: { userId: actor.id, action: 'INVENTORY_TARGET_REVIEW', entity: 'InventoryItem', entityId: item.id,
          oldValues: JSON.stringify({ branchId: actor.branchId, unit: item.unit, ...before }),
          newValues: JSON.stringify({ branchId: actor.branchId, unit: item.unit, ...values, manualTargets: change.manualTargets, excluded: change.excluded, reason, at: changedAt }) } });
      }
      const nextSettings = { ...settings, excludedItemIds: [...exclusions] };
      const saved = configuration ? await tx.inventoryWorkflowSettings.update({ where: { branchId: actor.branchId, version: configuration.version }, data: { settings: nextSettings, version: { increment: 1 }, updatedBy: actor.id } })
        : await tx.inventoryWorkflowSettings.create({ data: { branchId: actor.branchId, settings: nextSettings, updatedBy: actor.id } });
      return { updated: items.length, settingsVersion: saved.version, reason, actorId: actor.id, at: changedAt };
    });
  }

  /**
   * @cc [owner:nareshshah139,label:product] replenishment-proposal-evidence
   * Proposals MUST cover every active branch item, identify exclusions and unconfigured cold starts,
   * and retain demand records and model inputs. Generating a proposal MUST NOT change active targets.
   */
  async proposeTargets(actor: WorkflowActor, input: Record<string, any> = {}) {
    await this.workflow.authorize(actor, 'TARGET_REVIEW', true);
    const settings = await this.workflow.settings(actor), now = new Date();
    const since = new Date(now.getTime() - settings.lookbackDays * DAY);
    const [items, sales, requests] = await Promise.all([
      this.prisma.inventoryItem.findMany({ where: { branchId: actor.branchId, status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
      this.prisma.stockTransaction.findMany({ where: { branchId: actor.branchId, type: 'SALE', createdAt: { gte: since, lte: now } } }),
      this.prisma.inventoryWorkflowDocument.findMany({ where: { branchId: actor.branchId, kind: 'QUOTATION', status: 'DRAFT', createdAt: { gte: since, lte: now } } }),
    ]);
    const evidence: Record<string, any> = {};
    for (const item of items) evidence[item.id] = { salesUnits: 0, bounceUnits: 0, refillUnits: 0, records: [], orders: new Set<string>() };
    for (const sale of sales) {
      const entry = evidence[sale.itemId], quantity = Math.max(0, -(movementDelta(sale) || 0));
      if (!entry || !quantity) continue;
      entry.salesUnits += quantity; entry.orders.add(sale.reference || sale.id);
      entry.records.push({ id: sale.id, kind: 'SALE', quantity, date: sale.createdAt });
    }
    for (const request of requests) {
      const source = jsonObject(request.payload).source;
      if (!(source === 'BOUNCE' && settings.includeBounce || source === 'REFILL' && settings.includeRefill)) continue;
      for (const line of linesOf(request)) {
        const entry = evidence[line.inventoryId]; if (!entry) continue;
        entry[source === 'BOUNCE' ? 'bounceUnits' : 'refillUnits'] += line.quantity;
        entry.orders.add(request.id); entry.records.push({ id: request.id, kind: source, quantity: line.quantity, date: request.createdAt });
      }
    }
    const excluded: any[] = [], proposals: any[] = [], summary: Record<string, any> = {};
    for (const item of items) {
      const demand = evidence[item.id], manual = jsonObject(item.metadata).manualTargets === true;
      const exclusion = settings.excludedItemIds.includes(item.id) ? 'Explicitly excluded' : manual ? 'Manual targets preserved' : null;
      const units = demand.salesUnits + demand.bounceUnits + demand.refillUnits;
      const qualified = demand.orders.size >= settings.minimumOrders;
      summary[item.id] = { ...demand, name: item.name, unit: item.unit, orders: demand.orders.size, units, averageDailyDemand: units / settings.lookbackDays,
        available: item.currentStock - item.heldStock, coldStart: !qualified, unconfigured: item.minStockLevel == null || item.maxStockLevel == null };
      if (exclusion) { excluded.push({ inventoryId: item.id, name: item.name, unit: item.unit, reason: exclusion, beforeMin: item.minStockLevel, beforeMax: item.maxStockLevel }); continue; }
      proposals.push({ id: randomUUID(), inventoryId: item.id, name: item.name, batchNumber: item.batchNumber || '', unit: item.unit, beforeMin: item.minStockLevel, beforeMax: item.maxStockLevel, quantity: 0, minStockLevel: qualified ? Math.ceil(units / settings.lookbackDays * settings.minCoverDays) : item.minStockLevel ?? 0,
        maxStockLevel: qualified ? Math.ceil(units / settings.lookbackDays * settings.maxCoverDays) : item.maxStockLevel ?? 0 });
    }
    // A proposal may contain zero eligible lines so the exclusion summary stays inspectable.
    const payload = {
      lines: proposals, reason: 'Review observed demand and stock cover', calculation: { model: MODEL, from: since.toISOString(), to: now.toISOString(),
        lookbackDays: settings.lookbackDays, minimumOrders: settings.minimumOrders, minCoverDays: settings.minCoverDays, maxCoverDays: settings.maxCoverDays,
        includeBounce: settings.includeBounce, includeRefill: settings.includeRefill, categories: 'Every active inventory category; all batches',
        assumptions: 'Posted SALE outflows plus enabled draft BOUNCE/REFILL quotations, in each item stock unit. Draft quotations are demand signals, not reservations. No supplier availability feed.',
        coldStart: 'Saved values remain unchanged below minimum history; unconfigured cold starts cannot be accepted as zero demand.', items: summary, excluded } };
    const requestKey = input.requestKey || randomUUID();
    return this.workflow.transaction(async tx => {
      const existing = await tx.inventoryWorkflowDocument.findUnique({ where: { branchId_requestKey: { branchId: actor.branchId, requestKey } } });
      if (existing) return existing;
      const created = await tx.inventoryWorkflowDocument.create({ data: { branchId: actor.branchId, createdBy: actor.id, kind: 'TARGET_REVIEW', reference: `TARGET-${now.toISOString().slice(0, 10)}`, requestKey,
        payload: JSON.parse(JSON.stringify(payload)) } });
      await this.event(tx, actor, created, 'CREATE', null, { model: MODEL, itemCount: items.length, eligibleCount: proposals.length, excludedCount: excluded.length });
      return created;
    });
  }

  /**
   * @cc [owner:nareshshah139,label:product] replenishment-reviewed-targets
   * Each accepted or rejected line MUST retain its actor and decision. Only selected eligible lines
   * with unchanged prior targets may update targets; exclusions, manual overrides and cold starts
   * without configured targets MUST remain unchanged. All selected changes are atomic.
   */
/**
 * @cc [owner:nareshshah139,label:product;target] inventory-auto-targets-review
 * Automatic min/max proposals MUST be previewed and accepted or rejected before replacing active
 * targets, and explicitly excluded manual items MUST remain unchanged.
 * Acceptance: INV-36. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
  async reviewTargets(actor: WorkflowActor, id: string, input: Record<string, any>) {
    await this.workflow.authorize(actor, 'TARGET_REVIEW', true); manager(actor);
    if (!['ACCEPT', 'REJECT'].includes(input.action) || !Array.isArray(input.lineIds) || !input.lineIds.length) throw new BadRequestException('Select proposal lines and Accept or Reject');
    const result = await this.workflow.transaction(async tx => {
      const configuration = await tx.inventoryWorkflowSettings.findUnique({ where: { branchId: actor.branchId } });
      const excludedItemIds = jsonObject(configuration?.settings).excludedItemIds || [];
      const doc = await this.find(tx, actor, id, 'TARGET_REVIEW');
      this.version(doc, input.version);
      if (!['DRAFT', 'PART_REVIEWED'].includes(doc.status)) throw new BadRequestException('This proposal is already reviewed');
      const payload = jsonObject(doc.payload), selected = new Set(input.lineIds), all = linesOf(doc);
      if (all.filter(l => selected.has(l.id)).length !== selected.size) throw new BadRequestException('A selected proposal line was not found');
      const decisions = { ...payload.decisions };
      for (const line of all.filter(l => selected.has(l.id))) {
        if (decisions[line.id]) throw new ConflictException('A selected line has already been reviewed. Reload the proposal.');
        if (input.action === 'ACCEPT') {
          const item = await tx.inventoryItem.findFirst({ where: { id: line.inventoryId, branchId: actor.branchId, status: 'ACTIVE' } });
          if (!item) throw new BadRequestException('An item is no longer active');
          if (excludedItemIds.includes(item.id) || jsonObject(item.metadata).manualTargets) throw new BadRequestException(`${item.name}: manual override is preserved`);
          const evidence = payload.calculation?.items?.[item.id];
          if (evidence?.coldStart && evidence.unconfigured) throw new BadRequestException(`${item.name}: configure manual targets until demand history is sufficient`);
          if (item.minStockLevel !== line.beforeMin || item.maxStockLevel !== line.beforeMax) throw new ConflictException(`${item.name}: targets changed since this proposal`);
          await tx.inventoryItem.update({ where: { id: item.id, updatedAt: item.updatedAt }, data: { minStockLevel: line.minStockLevel, maxStockLevel: line.maxStockLevel, reorderLevel: line.minStockLevel, stockStatus: stockStatus({ ...item, minStockLevel: line.minStockLevel, reorderLevel: line.minStockLevel }),
            metadata: JSON.stringify({ ...jsonObject(item.metadata), targetSource: 'ACCEPTED_PROPOSAL', targetProposalId: doc.id, targetUpdatedBy: actor.id, targetUpdatedAt: new Date().toISOString() }) } });
        }
        decisions[line.id] = { action: input.action, actorId: actor.id, at: new Date().toISOString() };
      }
      const done = all.every(l => decisions[l.id]);
      const status = done ? Object.values(decisions).some((d: any) => d.action === 'ACCEPT') ? 'POSTED' : 'REJECTED' : 'PART_REVIEWED';
      return this.update(tx, actor, doc, { status, payload: { ...payload, decisions } }, 'REVIEW_TARGETS', { lineIds: [...selected], action: input.action });
    });
    if (input.syncShortbook && input.action === 'ACCEPT') return { document: result, shortbook: await this.refreshShortbook(actor, { requestKey: `targets:${id}:${result.version}` }) };
    return { document: result };
  }

  /**
   * @cc [owner:nareshshah139,label:product] replenishment-demand-deduplication
   * Automatic shortage refresh MUST preserve open manual requests and defer already represented
   * items to their existing requests. Concurrent refreshes MUST NOT create duplicate shortages or change posted stock.
   */
  async refreshShortbook(actor: WorkflowActor, input: Record<string, any> = {}) {
    await this.workflow.authorize(actor, 'SHORTBOOK', true);
    return this.workflow.transaction(async tx => {
      const [items, active, suppliers] = await Promise.all([
        tx.inventoryItem.findMany({ where: { branchId: actor.branchId, status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
        tx.inventoryWorkflowDocument.findMany({ where: { branchId: actor.branchId, kind: 'SHORTBOOK', status: { in: ['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'ORDERED', 'PART_RECEIVED'] } } }),
        tx.supplier.findMany({ where: { branchId: actor.branchId, isActive: true } }),
      ]);
      const represented = new Set(active.flatMap((d: any) => linesOf(d).map(l => l.inventoryId)));
      const created: any[] = [];
      for (const item of items) {
        const available = item.currentStock - item.heldStock;
        if (represented.has(item.id) || item.maxStockLevel == null || (item.minStockLevel ?? item.reorderLevel) == null || available > (item.minStockLevel ?? item.reorderLevel) || item.maxStockLevel <= available) continue;
        const choice = jsonObject(item.metadata).replenishmentSupplierId;
        const supplier = suppliers.find((s: any) => choice ? s.id === choice : s.name.toLowerCase() === item.supplier?.toLowerCase());
        const line = { id: randomUUID(), inventoryId: item.id, name: item.name, unit: item.unit, batchNumber: item.batchNumber, quantity: item.maxStockLevel - available, freeQuantity: 0,
          unitPrice: item.costPrice, gstRate: item.gstRate || 0, total: money((item.maxStockLevel - available) * item.costPrice * (1 + (item.gstRate || 0) / 100)), minStockLevel: item.minStockLevel, currentStock: available };
        const doc = await tx.inventoryWorkflowDocument.create({ data: { branchId: actor.branchId, kind: 'SHORTBOOK', reference: `NEED-${new Date().toISOString().slice(0, 10)}-${item.name.slice(0, 40)}`,
          supplierId: supplier?.id || null, supplierGstin: supplier?.gstNumber?.trim().toUpperCase() || null, createdBy: actor.id, requestKey: `shortage:${input.requestKey || randomUUID()}:${item.id}`,
          totalAmount: line.total, payload: { lines: [line], source: 'LOW_STOCK', requester: actor.id, date: new Date().toISOString().slice(0, 10), priority: available <= 0 ? 'URGENT' : 'NORMAL',
            reason: 'Below configured minimum; replenish available stock to maximum', supplierChoice: supplier ? { source: choice ? 'SAVED_CHOICE' : 'ITEM_SUPPLIER', supplierId: supplier.id } : null } } });
        await this.event(tx, actor, doc, 'CREATE', null, { source: 'LOW_STOCK', available, min: item.minStockLevel, max: item.maxStockLevel }); created.push(doc);
      }
      return { created, message: created.length ? `${created.length} shortages added` : 'No new shortages. Existing requests and manual overrides are retained.' };
    });
  }

  async supplierSuggestions(actor: WorkflowActor, inventoryId: string) {
    await this.workflow.authorize(actor, 'SHORTBOOK');
    const item = await this.prisma.inventoryItem.findFirst({ where: { id: inventoryId, branchId: actor.branchId } });
    if (!item) throw new NotFoundException('Item not found');
    const [suppliers, history] = await Promise.all([
      this.prisma.supplier.findMany({ where: { branchId: actor.branchId, isActive: true }, orderBy: { name: 'asc' } }),
      this.prisma.pharmacyPurchaseInvoiceItem.findMany({ where: { inventoryItemId: inventoryId, purchaseInvoice: { branchId: actor.branchId, stockCommittedAt: { not: null }, status: { not: 'CANCELLED' } } }, include: { purchaseInvoice: true }, orderBy: { createdAt: 'desc' } }),
    ]);
    const chosenId = jsonObject(item.metadata).replenishmentSupplierId;
    return { inventoryId, item: item.name, unit: item.unit, chosenSupplierId: chosenId || suppliers.find(s => s.name.toLowerCase() === item.supplier?.toLowerCase())?.id || null,
      availability: 'Active saved suppliers; live supplier stock availability is not connected', suggestions: suppliers.map(supplier => {
        const records = history.filter(h => h.purchaseInvoice.supplierId === supplier.id || h.purchaseInvoice.distributorGstin === supplier.gstNumber).map(h => ({ invoiceId: h.purchaseInvoiceId, reference: h.purchaseInvoice.invoiceNumber,
          date: h.purchaseInvoice.invoiceDate, quantity: h.quantityPurchased, freeQuantity: h.freeQuantity, purchaseRate: h.purchaseRate, unit: h.packUnitType, pack: h.packSize,
          comparable: h.packUnitType === item.unit, priceBasis: 'Printed purchase rate per invoice unit, excluding GST; discounts and free goods shown separately', discountPercent: h.discountPercent }));
        return { id: supplier.id, name: supplier.name, gstNumber: supplier.gstNumber, email: supplier.email, chosen: supplier.id === chosenId, history: records, available: true };
      }) };
  }

  /**
   * @cc [owner:nareshshah139,label:product] replenishment-supplier-explicit-choice
   * Saving a supplier choice MUST be an explicit versioned draft action using an active saved branch
   * supplier. Suggestions MUST NOT silently replace the chosen supplier or compare unlike units.
   */
  async saveSupplierChoice(actor: WorkflowActor, id: string, input: Record<string, any>) {
    await this.workflow.authorize(actor, 'SHORTBOOK', true);
    return this.workflow.transaction(async tx => {
      const doc = await this.find(tx, actor, id, 'SHORTBOOK'); this.version(doc, input.version);
      if (doc.status !== 'DRAFT') throw new BadRequestException('Supplier changes require a draft Shortbook request');
      const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId || '', branchId: actor.branchId, isActive: true } });
      if (!supplier) throw new BadRequestException('Select an active saved supplier');
      for (const line of linesOf(doc)) {
        const item = await tx.inventoryItem.findFirst({ where: { id: line.inventoryId, branchId: actor.branchId } });
        if (item) await tx.inventoryItem.update({ where: { id: item.id, updatedAt: item.updatedAt }, data: { metadata: JSON.stringify({ ...jsonObject(item.metadata), replenishmentSupplierId: supplier.id }) } });
      }
      return this.update(tx, actor, doc, { supplierId: supplier.id, supplierGstin: supplier.gstNumber?.trim().toUpperCase() || null,
        payload: { ...jsonObject(doc.payload), supplierChoice: { supplierId: supplier.id, source: 'EXPLICIT_REVIEW', actorId: actor.id, at: new Date().toISOString() } } }, 'CHOOSE_SUPPLIER', { supplierId: supplier.id });
    });
  }

  async autoPo(actor: WorkflowActor, input: Record<string, any> = {}) {
    await this.workflow.authorize(actor, 'PURCHASE_ORDER', true);
    const refresh = await this.refreshShortbook(actor, input);
    const requests = await this.prisma.inventoryWorkflowDocument.findMany({ where: { branchId: actor.branchId, kind: 'SHORTBOOK', status: { in: ['DRAFT', 'APPROVED', 'AWAITING_APPROVAL'] } } });
    const outcomes: any[] = [];
    for (const doc of requests) {
      if (!doc.supplierId || !doc.supplierGstin) { outcomes.push({ status: 'PROPOSED', documentId: doc.id, kind: 'SHORTBOOK', message: 'Choose a saved supplier with GSTIN' }); continue; }
      try {
        let order: any = await this.workflow.transition(actor, doc.id, { version: doc.version, action: 'CREATE_PO' });
        if (order.status === 'DRAFT') order = await this.workflow.transition(actor, order.id, { version: order.version, action: 'SUBMIT' });
        outcomes.push({ status: 'CREATED', documentId: order.id, kind: 'PURCHASE_ORDER', message: 'Awaiting manager approval; no order sent' });
      } catch (e) { outcomes.push({ status: 'FAILED', documentId: doc.id, kind: 'SHORTBOOK', message: (e as Error).message }); }
    }
    return { created: refresh.created, outcomes };
  }

  async automationStatus(actor: WorkflowActor) {
    await this.workflow.authorize(actor, 'PURCHASE_ORDER');
    const settings: any = await this.workflow.settings(actor);
    const owner = settings.ownerId ? await this.prisma.user.findFirst({ where: { id: settings.ownerId, branchId: actor.branchId }, select: { id: true, firstName: true, lastName: true, isActive: true } }) : null;
    const enabled = settings.autoMinMaxEnabled || settings.autoPoEnabled || settings.auditEnabled;
    const nextTick = new Date(Math.ceil((Date.now() + 1) / 1800000) * 1800000).toISOString();
    return { settings, owner, model: MODEL, schedule: 'Every 30 minutes; target proposals follow the configured refresh-day cadence',
      nextRunAt: enabled && owner?.isActive ? nextTick : null, lastRunAt: settings.lastRunAt || null,
      nextTargetRunAt: settings.autoMinMaxEnabled && owner?.isActive ? settings.lastTargetRun ? new Date(Math.max(new Date(nextTick).getTime(), Math.ceil((new Date(settings.lastTargetRun).getTime() + settings.refreshDays * DAY) / 1800000) * 1800000)).toISOString() : nextTick : null,
      approvalPolicy: 'Automation creates drafts for a manager to approve. Sending always requires an explicit manager action.',
      transport: { status: 'SETUP_REQUIRED', message: 'Supplier PO delivery is not configured. Export the order for manual delivery; no automated success is recorded.' }, runs: settings.automationRuns || [] };
  }

  /**
   * @cc [owner:nareshshah139,label:product] replenishment-dispatch-truth
   * Sending MUST require an explicit authorized action and an approved order. Unconfigured transport
   * MUST persist SETUP_REQUIRED and a failed outcome, never SENT or a fabricated delivery receipt.
   */
  async dispatchOrder(actor: WorkflowActor, id: string, input: Record<string, any>) {
    await this.workflow.authorize(actor, 'PURCHASE_ORDER', true); manager(actor);
    if (!input.requestKey) throw new BadRequestException('Dispatch request key is required');
    return this.workflow.transaction(async tx => {
      const doc = await this.find(tx, actor, id, 'PURCHASE_ORDER'), payload = jsonObject(doc.payload);
      const previous = (payload.dispatchAttempts || []).find((a: any) => a.requestKey === input.requestKey);
      if (previous) return { document: doc, delivery: previous };
      this.version(doc, input.version);
      if (!['APPROVED', 'PART_RECEIVED'].includes(doc.status)) throw new BadRequestException('Approve the order before sending');
      const delivery = { requestKey: input.requestKey, status: 'SETUP_REQUIRED', outcome: 'FAILED', actorId: actor.id, at: new Date().toISOString(), message: 'Supplier mail transport is not configured. Export the order and deliver it manually.' };
      const updated = await this.update(tx, actor, doc, { payload: { ...payload, dispatchAttempts: [...(payload.dispatchAttempts || []), delivery] } }, 'DISPATCH_FAILED', delivery);
      return { document: updated, delivery };
    });
  }

  async receiptContext(actor: WorkflowActor, id: string) {
    await this.workflow.authorize(actor, 'PURCHASE_ORDER');
    const doc = await this.find(this.prisma, actor, id, 'PURCHASE_ORDER');
    const receipts = await this.prisma.inventoryWorkflowDocument.findMany({ where: { branchId: actor.branchId, kind: 'INWARD_CHALLAN', sourceId: id }, orderBy: { createdAt: 'asc' } });
    return this.receiptView(doc, receipts);
  }

  /**
   * @cc [owner:nareshshah139,label:product] replenishment-cancel-remainder
   * Cancelling a PO remainder MUST preserve receipt documents and posted stock, require a reason and
   * current revision, close its Shortbook request and prevent further receipts against that order.
   */
  async cancelRemaining(actor: WorkflowActor, id: string, input: Record<string, any>) {
    await this.workflow.authorize(actor, 'PURCHASE_ORDER', true); manager(actor);
    if (!String(input.reason || '').trim()) throw new BadRequestException('Explain why the remaining quantity is cancelled');
    return this.workflow.transaction(async tx => {
      const doc = await this.find(tx, actor, id, 'PURCHASE_ORDER'); this.version(doc, input.version);
      if (!['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'SENT', 'PART_RECEIVED'].includes(doc.status)) throw new BadRequestException('This order has no open remainder');
      const receipts = await tx.inventoryWorkflowDocument.findMany({ where: { branchId: actor.branchId, kind: 'INWARD_CHALLAN', sourceId: id } });
      const context = this.receiptView(doc, receipts), detail = { reason: input.reason.trim(), quantities: context.lines.map((l: any) => ({ lineId: l.id, quantity: l.remainingQuantity })), at: new Date().toISOString(), actorId: actor.id };
      const updated = await this.update(tx, actor, doc, { status: 'CANCELLED', payload: { ...jsonObject(doc.payload), cancelledRemaining: detail } }, 'CANCEL_REMAINING', detail);
      if (doc.sourceId) {
        const source = await tx.inventoryWorkflowDocument.findFirst({ where: { id: doc.sourceId, branchId: actor.branchId, kind: 'SHORTBOOK' } });
        if (source) await this.update(tx, actor, source, { status: 'CANCELLED' }, 'ORDER_REMAINDER_CANCELLED', { orderId: id, reason: detail.reason });
      }
      return updated;
    });
  }

  async monitor(actor: WorkflowActor, input: Record<string, any> = {}) {
    await this.workflow.authorize(actor, 'PURCHASE_ORDER');
    const from = input.from ? new Date(input.from) : new Date(Date.now() - 30 * DAY);
    const to = input.to ? new Date(`${input.to}T23:59:59.999Z`) : new Date();
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) throw new BadRequestException('Choose a valid monitor date range');
    const [documents, events, status, suppliers] = await Promise.all([
      this.prisma.inventoryWorkflowDocument.findMany({ where: { branchId: actor.branchId, kind: { in: ['SHORTBOOK', 'PURCHASE_ORDER', 'TARGET_REVIEW', 'INWARD_CHALLAN'] }, createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.inventoryWorkflowEvent.findMany({ where: { branchId: actor.branchId, createdAt: { gte: from, lte: to }, document: { kind: 'PURCHASE_ORDER' } }, orderBy: { createdAt: 'desc' } }),
      this.automationStatus(actor),
      this.prisma.supplier.findMany({ where: { branchId: actor.branchId }, select: { id: true, name: true } }),
    ]);
    const categories = ['CREATED', 'APPROVED', 'SENT', 'FAILED', 'PART_RECEIVED', 'RECEIVED'];
    const series = categories.map(name => ({ name, records: events.filter(e => name === 'CREATED' ? ['CREATE', 'CONVERT'].includes(e.action) : name === 'FAILED' ? e.action === 'DISPATCH_FAILED' : e.toStatus === name && e.fromStatus !== name).map(e => ({ id: e.id, documentId: e.documentId, at: e.createdAt, action: e.action, status: e.toStatus, detail: e.detail })) }));
    const latestProposal = documents.find(d => d.kind === 'TARGET_REVIEW');
    const coverage = Object.entries(jsonObject(latestProposal?.payload).calculation?.items || {}).map(([inventoryId, item]: [string, any]) => ({ inventoryId,
      ...item, proposalId: latestProposal?.id, daysCover: item.averageDailyDemand > 0 ? Math.round(item.available / item.averageDailyDemand * 10) / 10 : null }));
    const supplierChoices = suppliers.map(s => ({ ...s, orders: documents.filter(d => d.kind === 'PURCHASE_ORDER' && d.supplierId === s.id).map(d => ({ id: d.id, reference: d.reference, status: d.status, date: d.createdAt })) })).filter(s => s.orders.length);
    return { branchId: actor.branchId, from, to, documents, coverage, supplierChoices, series: series.map(s => ({ ...s, count: s.records.length })),
      runs: status.runs.filter((r: any) => new Date(r.at) >= from && new Date(r.at) <= to),
      basis: 'Order event counts in the selected dates. Receipt quantities count posted inward challans once; linked purchase bills add no second receipt.' };
  }

  private receiptView(doc: any, receipts: any[]) {
    const received = new Map<string, number>();
    for (const receipt of receipts.filter(r => r.status === 'POSTED')) for (const line of linesOf(receipt)) received.set(line.sourceLineId, (received.get(line.sourceLineId) || 0) + line.quantity + (line.freeQuantity || 0));
    return { ...doc, lines: linesOf(doc).map(l => ({ ...l, orderedQuantity: l.quantity + (l.freeQuantity || 0), receivedQuantity: received.get(l.id) || 0,
      remainingQuantity: Math.max(0, l.quantity + (l.freeQuantity || 0) - (received.get(l.id) || 0)) })), receipts,
      canReceive: ['APPROVED', 'SENT', 'PART_RECEIVED'].includes(doc.status) && !jsonObject(doc.payload).cancelledRemaining,
      policy: 'Receive in the declared stock unit. Paid plus free units consume the ordered quantity. Over-delivery is rejected; amend or create an approved order first. Cancelling remaining units retains prior stock receipts and bills.' };
  }
  private async find(tx: any, actor: WorkflowActor, id: string, kind: string) {
    const doc = await tx.inventoryWorkflowDocument.findFirst({ where: { id, branchId: actor.branchId, kind } });
    if (!doc) throw new NotFoundException('Replenishment document not found'); return doc;
  }
  private version(doc: any, version: any) { if (doc.version !== version) throw new ConflictException('This record changed. Reload before continuing.'); }
  private async event(tx: any, actor: WorkflowActor, doc: any, action: string, before: string | null, detail: any) {
    await tx.inventoryWorkflowEvent.create({ data: { documentId: doc.id, branchId: actor.branchId, actorId: actor.id, action, fromStatus: before, toStatus: doc.status, version: doc.version, detail } });
  }
  private async update(tx: any, actor: WorkflowActor, doc: any, data: any, action: string, detail: any) {
    const updated = await tx.inventoryWorkflowDocument.update({ where: { id: doc.id, version: doc.version }, data: { ...data, version: { increment: 1 } } });
    await this.event(tx, actor, updated, action, doc.status, detail); return updated;
  }
}
