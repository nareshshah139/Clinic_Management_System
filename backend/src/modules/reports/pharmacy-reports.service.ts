import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';

type ReportLine = { itemId: string | null; name: string; quantity: number; rate: number | null; taxable: number | null; tax: number | null; total: number | null; cost: number | null };
type ReportDocument = { kind: string; date: string; entry: string; number: string; party: string; phone: string; gross: number | null; discount: number | null; taxable: number | null; tax: number | null; cgst: number | null; sgst: number | null; igst: number | null; total: number; lines: ReportLine[] };
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const finite = (n: unknown): number | null => typeof n === 'number' && Number.isFinite(n) ? n : null;
const day = (date: Date) => new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 10);
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const notesObject = (value: string | null) => { try { return object(JSON.parse(value || '{}')); } catch { return {}; } };

/**
 * @cc [owner:nareshshah139,label:product] pharmacy-report-range
 * A report range uses inclusive India-local calendar dates, rejects invalid or reversed dates, and spans at most 366 days.
 */
export function pharmacyReportRange(start: string, end: string) {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new BadRequestException('Enter valid start and end dates');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('Enter valid start and end dates');
    return date.getTime();
  };
  const from = parse(start), through = parse(end);
  if (through < from || through - from >= 366 * 86_400_000) throw new BadRequestException('Choose an ordered range of at most 366 days');
  return { gte: new Date(from - 330 * 60_000), lt: new Date(through + 86_400_000 - 330 * 60_000) };
}

@Injectable()
export class PharmacyReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @cc [owner:nareshshah139,label:security] pharmacy-reports-branch
   * Report documents and payment events are read only from the authenticated branch; a missing branch is rejected.
   */
  /**
   * @cc [owner:nareshshah139,label:product] pharmacy-reports-unknowns
   * Payment events use payment date, documents use invoice or posting date, and missing tax splits, historical costs and workflow settlements remain unknown.
   */
  /**
   * @cc [owner:nareshshah139,label:product] pharmacy-return-supplier
   * Supplier returns show the matching branch supplier name, or Unknown supplier when no supplier can be resolved.
   */
  async getReport(branchId: string, start: string, end: string) {
    if (!branchId) throw new BadRequestException('A branch is required');
    const range = pharmacyReportRange(start, end);
    const [invoices, purchases, workflows, payments, reversals] = await Promise.all([
      this.prisma.pharmacyInvoice.findMany({ where: { branchId, status: { in: ['CONFIRMED', 'DISPENSED', 'COMPLETED'] }, invoiceDate: range }, include: { items: { include: { drug: true, package: true } }, payments: true } }),
      this.prisma.pharmacyPurchaseInvoice.findMany({ where: { branchId, status: 'STOCK_COMMITTED', invoiceDate: range }, include: { items: true } }),
      this.prisma.inventoryWorkflowDocument.findMany({ where: { branchId, kind: { in: ['COUNTER_SALE', 'SALES_RETURN', 'SUPPLIER_RETURN'] }, status: { in: ['POSTED', 'RELEASED', 'REVERSED'] }, postedAt: range } }),
      this.prisma.pharmacyPayment.findMany({ where: { status: 'COMPLETED', paymentDate: range, invoice: { branchId } }, include: { invoice: { select: { invoiceNumber: true, status: true, paidAmount: true, payments: { select: { status: true, amount: true } } } } } }),
      this.prisma.inventoryWorkflowEvent.findMany({ where: { branchId, action: 'REVERSE', createdAt: range, document: { kind: { in: ['COUNTER_SALE', 'SALES_RETURN', 'SUPPLIER_RETURN'] } } }, include: { document: { select: { reference: true } } } }),
    ]);
    const supplierIds = Array.from(new Set(workflows.filter(doc => doc.kind === 'SUPPLIER_RETURN' && doc.supplierId).map(doc => doc.supplierId!)));
    const suppliers = supplierIds.length ? await this.prisma.supplier.findMany({ where: { branchId, id: { in: supplierIds } }, select: { id: true, name: true } }) : [];
    const supplierNames = new Map(suppliers.map(supplier => [supplier.id, supplier.name]));
    const refs = [...invoices.map(invoice => `INV-${invoice.invoiceNumber}`), ...workflows.filter(doc => doc.status === 'POSTED' || doc.status === 'RELEASED').map(doc => `WF-${doc.reference}`)];
    const movements = refs.length ? await this.prisma.stockTransaction.findMany({ where: { branchId, reference: { in: refs }, type: { in: ['SALE', 'RETURN'] } } }) : [];
    const snapshotCost = (reference: string, itemId: string | null, quantity: number, workflowId?: string, lineId?: string) => {
      if (!itemId || !quantity) return null;
      const relevant = movements.filter(movement => {
        if (movement.reference !== reference || movement.itemId !== itemId) return false;
        const metadata = notesObject(movement.notes);
        return workflowId ? metadata.workflowDocumentId === workflowId && metadata.workflowLineId === lineId : !metadata.workflowDocumentId;
      });
      if (!relevant.length || relevant.reduce((n, movement) => n + movement.quantity, 0) !== Math.abs(quantity)) return null;
      const costs = relevant.map(movement => finite(notesObject(movement.notes).costPerStockUnit));
      if (costs.some(cost => cost === null || cost < 0)) return null;
      return round(Math.sign(quantity) * relevant.reduce((n, movement, index) => n + movement.quantity * costs[index]!, 0));
    };
    const sales: ReportDocument[] = invoices.map(invoice => ({
      kind: 'Sale', date: day(invoice.invoiceDate), entry: invoice.createdAt.toISOString(), number: invoice.invoiceNumber, party: invoice.billingName, phone: invoice.billingPhone,
      gross: invoice.subtotal, discount: invoice.discountAmount, taxable: round(invoice.subtotal - invoice.discountAmount), tax: invoice.taxAmount, cgst: null, sgst: null, igst: null, total: invoice.totalAmount,
      lines: invoice.items.map(item => ({ itemId: item.inventoryItemId, name: item.drug?.name || item.package?.name || 'Unidentified item', quantity: item.quantity, rate: item.taxPercent, taxable: round(item.totalAmount - item.taxAmount), tax: item.taxAmount, total: item.totalAmount, cost: invoice.items.filter(other => other.inventoryItemId === item.inventoryItemId).length === 1 ? snapshotCost(`INV-${invoice.invoiceNumber}`, item.inventoryItemId, item.quantity) : null })),
    }));
    const purchaseDocs: ReportDocument[] = purchases.map(invoice => ({
      kind: 'Purchase', date: day(invoice.invoiceDate), entry: invoice.createdAt.toISOString(), number: invoice.invoiceNumber, party: invoice.distributorName, phone: '', gross: invoice.grossAmount,
      discount: round(invoice.tradeDiscount + invoice.specialDiscount + invoice.cashDiscount), taxable: invoice.taxableAmount, tax: invoice.totalGst, cgst: Math.abs(round(invoice.totalCgst + invoice.totalSgst + invoice.totalIgst - invoice.totalGst)) <= 0.01 ? invoice.totalCgst : null, sgst: Math.abs(round(invoice.totalCgst + invoice.totalSgst + invoice.totalIgst - invoice.totalGst)) <= 0.01 ? invoice.totalSgst : null, igst: Math.abs(round(invoice.totalCgst + invoice.totalSgst + invoice.totalIgst - invoice.totalGst)) <= 0.01 ? invoice.totalIgst : null, total: invoice.netPayable,
      lines: invoice.items.map(item => ({ itemId: item.inventoryItemId, name: item.productName, quantity: item.quantityPurchased, rate: round(item.cgstPercent + item.sgstPercent + item.igstPercent), taxable: item.taxableAmount, tax: item.gstAmount, total: item.lineTotal, cost: null })),
    }));
    for (const doc of workflows.filter(doc => doc.status === 'POSTED' || doc.status === 'RELEASED')) {
      const payload = object(doc.payload);
      const sign = doc.kind === 'COUNTER_SALE' ? 1 : -1;
      const lines: ReportLine[] = (Array.isArray(payload.lines) ? payload.lines : []).map((raw: unknown) => {
        const line = object(raw);
        const signed = (value: unknown) => { const n = finite(value); return n === null ? null : round(sign * n); };
        return { itemId: typeof line.inventoryId === 'string' ? line.inventoryId : null, name: String(line.name || 'Unidentified item'), quantity: sign * (finite(line.quantity) ?? 0), rate: finite(line.gstRate), taxable: signed(line.taxable), tax: signed(line.tax), total: signed(line.total), cost: snapshotCost(`WF-${doc.reference}`, typeof line.inventoryId === 'string' ? line.inventoryId : null, sign * (finite(line.quantity) ?? 0), doc.id, typeof line.id === 'string' ? line.id : undefined) };
      });
      const sum = (key: 'taxable' | 'tax') => lines.length && lines.every(line => line[key] !== null) ? round(lines.reduce((n, line) => n + (line[key] ?? 0), 0)) : null;
      const normalized: ReportDocument = { kind: doc.kind === 'COUNTER_SALE' ? 'Counter sale' : doc.kind === 'SALES_RETURN' ? 'Sales return' : 'Supplier return', date: day(doc.postedAt!), entry: doc.createdAt.toISOString(), number: doc.reference, party: doc.kind === 'SUPPLIER_RETURN' ? supplierNames.get(doc.supplierId || '') || 'Unknown supplier' : String(payload.customerName || ''), phone: String(payload.customerPhone || ''), gross: null, discount: null, taxable: sum('taxable'), tax: sum('tax'), cgst: null, sgst: null, igst: null, total: round(sign * Number(doc.totalAmount)), lines };
      (doc.kind === 'SUPPLIER_RETURN' ? purchaseDocs : sales).push(normalized);
    }
    const paymentEvents = payments.map(payment => ({ date: day(payment.paymentDate), number: payment.invoice.invoiceNumber, method: payment.method, amount: payment.amount, invoiceStatus: payment.invoice.status }));
    const gapCandidates = [...invoices, ...payments.map(payment => payment.invoice)];
    const paymentGaps = Array.from(new Set(gapCandidates.filter(invoice => Math.abs(round(invoice.paidAmount - invoice.payments.filter(payment => payment.status === 'COMPLETED').reduce((sum, payment) => sum + payment.amount, 0))) > 0.01).map(invoice => invoice.invoiceNumber)));
    const itemIds = Array.from(new Set(sales.flatMap(doc => doc.lines.map(line => line.itemId).filter((id): id is string => !!id))));
    const items = itemIds.length ? await this.prisma.inventoryItem.findMany({ where: { branchId, id: { in: itemIds } }, select: { id: true, category: true, manufacturer: true, unit: true, packSize: true, packUnit: true, currentStock: true, mrp: true, tags: true } }) : [];
    return { start, end, sales, purchases: purchaseDocs, payments: paymentEvents, paymentGaps, items, reversedDocuments: Array.from(new Set([...workflows.filter(doc => doc.status === 'REVERSED').map(doc => doc.reference), ...reversals.map(event => event.document.reference)])) };
  }
}
