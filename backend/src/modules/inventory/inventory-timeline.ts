import { BadRequestException } from '@nestjs/common';
import { jsonObject, movementDelta } from './inventory-stock';

export const LEDGER_CHANNELS = {
  PURCHASE_INVOICE: 'Purchase invoice',
  PRESCRIPTION: 'Prescription dispensed',
  PHARMACY_BILL: 'Pharmacy bill',
  COUNTER_SALE: 'Counter sale',
  PARTNER_SALE: 'Partner daily sale',
  CUSTOMER_RETURN: 'Customer return',
  SUPPLIER_RETURN: 'Supplier return',
  LOSS: 'Loss or breakage',
  HOLD: 'Blocked stock',
  STOCK_COUNT: 'Stock count',
  CORRECTION: 'Movement correction',
  OPENING_STOCK: 'Opening stock',
  APPROVED_EDIT: 'Approved stock edit',
  TRANSFER: 'Location transfer',
  INVENTORY_DOCUMENT: 'Inventory document',
  MANUAL: 'Manual entry',
} as const;
export type LedgerChannel = keyof typeof LEDGER_CHANNELS;
export type LedgerDirection = 'IN' | 'OUT' | 'UNKNOWN';

const WORKFLOW_CHANNEL: Record<string, LedgerChannel> = {
  COUNTER_SALE: 'COUNTER_SALE',
  SALES_RETURN: 'CUSTOMER_RETURN',
  CREDIT_NOTE: 'CUSTOMER_RETURN',
  SUPPLIER_RETURN: 'SUPPLIER_RETURN',
  LOSS: 'LOSS',
  HOLD: 'HOLD',
  COUNT: 'STOCK_COUNT',
  CORRECTION: 'CORRECTION',
  OPENING_STOCK: 'OPENING_STOCK',
  INWARD_CHALLAN: 'PURCHASE_INVOICE',
};

export type LedgerDocument =
  | { type: 'PURCHASE_INVOICE'; id: string; number: string; status: string }
  | { type: 'PHARMACY_INVOICE'; id: string; number: string; status: string; prescriptionId: string | null }
  | { type: 'WORKFLOW'; id: string; kind: string; number: string; status: string }
  | { type: 'IMPORT'; id: string; row: string | null }
  | { type: 'APPROVAL'; id: string }
  | { type: 'PARTNER_SALE'; id: string };

export type LedgerSource = {
  channel: LedgerChannel;
  label: string;
  document: LedgerDocument | null;
  counterparty: string | null;
};

type Movement = {
  id: string; type: string; reference: string | null; reason: string | null; notes: string | null;
  quantity: number; quantityDelta: number | null; supplier: string | null; customer: string | null;
};
type PurchaseRef = { id: string; invoiceNumber: string; stockCommitReference: string | null; status: string; distributorName: string };
type SaleRef = { id: string; invoiceNumber: string; status: string; prescriptionId: string | null; billingName: string };
type DocRef = { id: string; kind: string; reference: string; status: string };
export type SourceContext = {
  workflowByMovement: Map<string, DocRef>;
  purchaseByReference: Map<string, PurchaseRef>;
  saleByNumber: Map<string, SaleRef>;
};

const after = (reference: string, prefix: string) => reference.slice(prefix.length);
const source = (channel: LedgerChannel, document: LedgerDocument | null = null, counterparty: string | null = null): LedgerSource =>
  ({ channel, label: LEDGER_CHANNELS[channel], document, counterparty });

/**
 * @cc [owner:nareshshah139,label:product] inventory-timeline-source-attribution
 * Every stock movement MUST resolve to exactly one ledger channel. A posted inventory document
 * owns its movement before any reference prefix; a pharmacy bill linked to a prescription MUST be
 * reported as prescription dispensing. Unrecognised references MUST fall back to manual entry,
 * never to a guessed invoice or prescription.
 */
export function classifyMovement(m: Movement, ctx: SourceContext): LedgerSource {
  const ref = m.reference || '';
  const doc = ctx.workflowByMovement.get(m.id);
  if (doc)
    return source(WORKFLOW_CHANNEL[doc.kind] || 'INVENTORY_DOCUMENT',
      { type: 'WORKFLOW', id: doc.id, kind: doc.kind, number: doc.reference, status: doc.status }, m.customer || m.supplier);
  const purchase = ref ? ctx.purchaseByReference.get(ref) : undefined;
  if (purchase)
    return source('PURCHASE_INVOICE',
      { type: 'PURCHASE_INVOICE', id: purchase.id, number: purchase.invoiceNumber, status: purchase.status }, purchase.distributorName);
  if (ref.startsWith('INV-')) {
    const sale = ctx.saleByNumber.get(after(ref, 'INV-'));
    if (!sale) return source('PHARMACY_BILL', null, m.customer);
    return source(sale.prescriptionId ? 'PRESCRIPTION' : 'PHARMACY_BILL',
      { type: 'PHARMACY_INVOICE', id: sale.id, number: sale.invoiceNumber, status: sale.status, prescriptionId: sale.prescriptionId }, sale.billingName);
  }
  if (ref.startsWith('PINV-')) return source('PURCHASE_INVOICE', null, m.supplier);
  if (ref.startsWith('PARTNER-SALE-')) return source('PARTNER_SALE', { type: 'PARTNER_SALE', id: after(ref, 'PARTNER-SALE-') });
  if (ref.startsWith('OPEN-') || ref === 'Excel starter import') {
    const info = jsonObject(m.notes);
    return source('OPENING_STOCK', info.importId ? { type: 'IMPORT', id: String(info.importId), row: info.sourceRow == null ? null : String(info.sourceRow) } : null);
  }
  if (ref.startsWith('INVENTORY-APPROVAL-')) return source('APPROVED_EDIT', { type: 'APPROVAL', id: after(ref, 'INVENTORY-APPROVAL-') });
  if (m.type === 'TRANSFER') return source('TRANSFER');
  return source('MANUAL', null, m.customer || m.supplier);
}

export function movementDirection(delta: number | null): LedgerDirection {
  return delta === null ? 'UNKNOWN' : delta > 0 ? 'IN' : 'OUT';
}

export async function loadSourceContext(prisma: any, branchId: string, movements: Movement[]): Promise<SourceContext> {
  const ids = movements.map(m => m.id);
  const refs = [...new Set(movements.map(m => m.reference).filter((r): r is string => !!r))];
  const saleNumbers = refs.filter(r => r.startsWith('INV-')).map(r => after(r, 'INV-'));
  const documentIds = new Map<string, string>();
  for (const m of movements) {
    const id = jsonObject(m.notes).workflowDocumentId;
    if (typeof id === 'string') documentIds.set(m.id, id);
  }
  const [effects, notedDocs, purchases, sales] = await Promise.all([
    ids.length ? prisma.inventoryWorkflowEffect.findMany({
      where: { branchId, transactionId: { in: ids } },
      select: { transactionId: true, document: { select: { id: true, kind: true, reference: true, status: true } } },
    }) : [],
    documentIds.size ? prisma.inventoryWorkflowDocument.findMany({
      where: { branchId, id: { in: [...new Set(documentIds.values())] } },
      select: { id: true, kind: true, reference: true, status: true },
    }) : [],
    refs.length ? prisma.pharmacyPurchaseInvoice.findMany({
      where: { branchId, OR: [{ stockCommitReference: { in: refs } }, { invoiceNumber: { in: refs } }] },
      select: { id: true, invoiceNumber: true, stockCommitReference: true, status: true, distributorName: true },
    }) : [],
    saleNumbers.length ? prisma.pharmacyInvoice.findMany({
      where: { branchId, invoiceNumber: { in: saleNumbers } },
      select: { id: true, invoiceNumber: true, status: true, prescriptionId: true, billingName: true },
    }) : [],
  ]);
  const docsById = new Map<string, DocRef>(notedDocs.map((d: DocRef) => [d.id, d]));
  const workflowByMovement = new Map<string, DocRef>();
  for (const e of effects) if (e.transactionId && e.document) workflowByMovement.set(e.transactionId, e.document);
  for (const [movementId, docId] of documentIds) {
    const doc = docsById.get(docId);
    if (doc && !workflowByMovement.has(movementId)) workflowByMovement.set(movementId, doc);
  }
  const purchaseByReference = new Map<string, PurchaseRef>();
  for (const p of purchases as PurchaseRef[]) {
    if (p.stockCommitReference) purchaseByReference.set(p.stockCommitReference, p);
    if (!purchaseByReference.has(p.invoiceNumber)) purchaseByReference.set(p.invoiceNumber, p);
  }
  return { workflowByMovement, purchaseByReference, saleByNumber: new Map((sales as SaleRef[]).map(s => [s.invoiceNumber, s])) };
}

const MAX_RANGE_DAYS = 366;
const SCAN_LIMIT = 10000;
const DAY = 86_400_000;

const CLINIC_OFFSET = '+05:30';
const clinicDay = (instant: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
const shiftDay = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY).toISOString().slice(0, 10);
const startOfClinicDay = (day: string) => new Date(`${day}T00:00:00.000${CLINIC_OFFSET}`);

export type TimelineQuery = {
  fromDay: string; toDay: string; from: Date; to: Date; channels: LedgerChannel[] | null; direction: LedgerDirection | null;
  itemId: string | null; search: string | null; page: number; limit: number;
};

/**
 * @cc [owner:nareshshah139,label:product] inventory-timeline-query-boundary
 * Timeline reads MUST stay inside the actor's branch and a bounded date range of at most 366 days.
 * Dates are YYYY-MM-DD Asia/Kolkata calendar days, inclusive at both ends, defaulting to the 30
 * clinic days ending today. Unknown channels or directions MUST be rejected, never widened.
 */
export function parseTimelineQuery(q: Record<string, any>, now = new Date()): TimelineQuery {
  const day = (value: unknown, label: string) => {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)))
      throw new BadRequestException(`${label} must be a YYYY-MM-DD date`);
    return value;
  };
  const toDay = day(q.to, 'To date') ?? clinicDay(now);
  const fromDay = day(q.from, 'From date') ?? shiftDay(toDay, -29);
  if (fromDay > toDay) throw new BadRequestException('From date must be on or before the to date');
  if (Date.parse(toDay) - Date.parse(fromDay) >= MAX_RANGE_DAYS * DAY) throw new BadRequestException(`Choose a range of at most ${MAX_RANGE_DAYS} days`);
  const from = startOfClinicDay(fromDay), to = startOfClinicDay(shiftDay(toDay, 1));
  const channels = q.channel ? String(q.channel).split(',').filter(Boolean) : null;
  if (channels?.some(c => !(c in LEDGER_CHANNELS))) throw new BadRequestException('Unknown ledger channel');
  if (q.direction && !['IN', 'OUT', 'UNKNOWN'].includes(q.direction)) throw new BadRequestException('Direction must be IN, OUT or UNKNOWN');
  const search = typeof q.search === 'string' && q.search.trim() ? q.search.trim().slice(0, 100) : null;
  return {
    fromDay, toDay, from, to, channels: channels as LedgerChannel[] | null, direction: q.direction || null,
    itemId: typeof q.itemId === 'string' && q.itemId ? q.itemId : null, search,
    page: Math.max(1, Number.parseInt(q.page, 10) || 1),
    limit: Math.min(100, Math.max(1, Number.parseInt(q.limit, 10) || 50)),
  };
}

export type TimelineEntry = {
  id: string; at: Date; type: string; delta: number | null; direction: LedgerDirection;
  balance: { before: number; after: number } | null; unit: string | null; unitPrice: number; value: number;
  reference: string | null; reason: string | null; note: string | null; batchNumber: string | null;
  item: { id: string; name: string } | null; actor: { id: string; name: string } | null; source: LedgerSource;
};

type ChannelTotal = { channel: LedgerChannel; label: string; entries: number; unitsIn: number; unitsOut: number; unknown: number };

/**
 * @cc [owner:nareshshah139,label:product] inventory-timeline-ledger
 * The timeline MUST list movements newest first with each row's signed change, recorded balance
 * before and after, actor and source. Channel totals MUST cover every movement in the range that
 * matches the item and search filters, regardless of channel, direction or page; a movement of
 * unknown direction MUST be counted as unknown, never as an inflow or outflow. When the range holds
 * more movements than the scan limit, the response MUST say it is truncated.
 */
export async function readInventoryTimeline(prisma: any, branchId: string, q: TimelineQuery) {
  const where: Record<string, any> = { branchId, createdAt: { gte: q.from, lt: q.to } };
  if (q.itemId) where.itemId = q.itemId;
  if (q.search) where.OR = [
    { reference: { contains: q.search, mode: 'insensitive' } },
    { batchNumber: { contains: q.search, mode: 'insensitive' } },
    { item: { name: { contains: q.search, mode: 'insensitive' } } },
    { item: { genericName: { contains: q.search, mode: 'insensitive' } } },
  ];
  const scanned = await prisma.stockTransaction.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: SCAN_LIMIT + 1,
    include: {
      item: { select: { id: true, name: true, unit: true, batchNumber: true } },
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  const truncated = scanned.length > SCAN_LIMIT;
  const movements: any[] = truncated ?scanned.slice(0, SCAN_LIMIT) : scanned;
  const ctx = await loadSourceContext(prisma, branchId, movements);
  const totals = new Map<LedgerChannel, ChannelTotal>();
  const entries = movements.map((m: any): TimelineEntry => {
    const src = classifyMovement(m, ctx);
    const delta = movementDelta(m);
    const direction = movementDirection(delta);
    const total = totals.get(src.channel) ?? { channel: src.channel, label: src.label, entries: 0, unitsIn: 0, unitsOut: 0, unknown: 0 };
    total.entries++;
    if (direction === 'IN') total.unitsIn += delta!;
    else if (direction === 'OUT') total.unitsOut += -delta!;
    else total.unknown++;
    totals.set(src.channel, total);
    const info = jsonObject(m.notes);
    const before = Number.isFinite(info.beforeStock) ? info.beforeStock : null;
    const afterStock = Number.isFinite(info.afterStock) ? info.afterStock : null;
    return {
      id: m.id,
      at: m.createdAt,
      type: m.type,
      delta,
      direction,
      balance: before === null || afterStock === null ? null : { before, after: afterStock },
      unit: info.quantityUnit || m.item?.unit || null,
      unitPrice: m.unitPrice,
      value: m.totalAmount,
      reference: m.reference,
      reason: m.reason,
      note: typeof info.text === 'string' ? info.text : m.notes && !m.notes.trim().startsWith('{') ? m.notes : null,
      batchNumber: m.batchNumber ?? m.item?.batchNumber ?? null,
      item: m.item ? { id: m.item.id, name: m.item.name } : null,
      actor: m.user ? { id: m.user.id, name: `${m.user.firstName} ${m.user.lastName}`.trim() } : null,
      source: src,
    };
  });
  const visible = entries.filter((e: TimelineEntry) => (!q.channels || q.channels.includes(e.source.channel)) && (!q.direction || e.direction === q.direction));
  const pages = Math.max(1, Math.ceil(visible.length / q.limit));
  const page = Math.min(q.page, pages);
  return {
    range: { from: q.fromDay, to: q.toDay },
    truncated,
    scanLimit: SCAN_LIMIT,
    totals: [...totals.values()].sort((a, b) => b.entries - a.entries),
    rows: visible.slice((page - 1) * q.limit, page * q.limit),
    pagination: { page, limit: q.limit, total: visible.length, pages },
  };
}
