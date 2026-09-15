import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { PharmacyPurchaseInvoiceService } from '../pharmacy/pharmacy-purchase-invoice.service';
import { QueryPharmacyPurchaseInvoiceDto } from '../pharmacy/dto/pharmacy-purchase-invoice.dto';
import { InventoryWorkflowService } from './inventory-workflow.service';
import { WorkflowActor } from './inventory-workflow.types';

const scalar = (value: any): string | number | boolean => value == null ? '' : value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : value;
const label = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, s => s.toUpperCase());
const object = (value: any) => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * @cc [owner:nareshshah139,label:security] purchase-actions-branch-permissions
 * Every action MUST load the purchase through the authenticated branch and enforce its existing
 * purchase permission; stock metadata edits additionally require inventory:item:update.
 */
@Injectable()
export class InventoryPurchaseActionsService {
  constructor(private readonly prisma: PrismaService, private readonly workflow: InventoryWorkflowService,
    private readonly purchases: PharmacyPurchaseInvoiceService) {}

  private async access(actor: WorkflowActor, write = false) {
    const roles = write ? ['OWNER', 'ADMIN', 'PHARMACIST', 'RECEPTION'] : ['OWNER', 'ADMIN', 'DOCTOR', 'PHARMACIST', 'RECEPTION'];
    if (!roles.includes(actor.role)) throw new ForbiddenException('This role cannot perform this purchase document action');
    const permissions = await this.workflow.permissions(actor);
    const allowed = write ? ['pharmacy:purchase-invoice:create', 'inventory:po:create'] : ['pharmacy:purchase-invoice:read', 'inventory:po:read'];
    if (!permissions.has('*') && !allowed.some(key => permissions.has(key))) throw new ForbiddenException(`This action requires ${allowed.join(' or ')}`);
    return permissions;
  }

  async detail(actor: WorkflowActor, id: string) {
    const permissions = await this.access(actor);
    const canReadLedger = permissions.has('*') || permissions.has('pharmacy:purchase-ledger:read');
    const invoice = await this.purchases.findOne(id, actor.branchId);
    const [related, logs, payments, credits] = await Promise.all([
      this.prisma.inventoryWorkflowDocument.findMany({ where: { branchId: actor.branchId,
        OR: [{ purchaseInvoiceId: id }, ...(invoice.workflowReceiptId ? [{ id: invoice.workflowReceiptId }, { sourceId: invoice.workflowReceiptId }] : [])] },
        include: { events: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.auditLog.findMany({ where: { entity: 'PharmacyPurchaseInvoice', entityId: id }, orderBy: { timestamp: 'asc' } }),
      canReadLedger ? this.prisma.pharmacyPurchasePaymentAllocation.findMany({ where: { purchaseInvoiceId: id, payment: { branchId: actor.branchId } }, include: { payment: true } }) : Promise.resolve([]),
      canReadLedger ? this.prisma.inventoryCreditAllocation.findMany({ where: { purchaseInvoiceId: id, branchId: actor.branchId }, include: { credit: true } }) : Promise.resolve([]),
    ]);
    const relatedIds = new Set(related.map(d => d.id));
    let sourceIds = related.map(d => d.sourceId).filter((source): source is string => !!source && !relatedIds.has(source));
    while (sourceIds.length) {
      sourceIds.forEach(source => relatedIds.add(source));
      const parents = await this.prisma.inventoryWorkflowDocument.findMany({ where: { branchId: actor.branchId, id: { in: sourceIds } }, include: { events: { orderBy: { createdAt: 'asc' } } } });
      related.push(...parents);
      sourceIds = parents.map(parent => parent.sourceId).filter((source): source is string => !!source && !relatedIds.has(source));
    }
    // A gate pass may reference the same order as the physical receipt rather than the bill itself.
    if (relatedIds.size) related.push(...await this.prisma.inventoryWorkflowDocument.findMany({ where: { branchId: actor.branchId, kind: 'GATE_PASS', sourceId: { in: [...relatedIds] }, id: { notIn: [...relatedIds] } }, include: { events: { orderBy: { createdAt: 'asc' } } } }));
    const readableKinds = new Set<string>();
    for (const kind of new Set(related.map(doc => doc.kind))) {
      try { await this.workflow.authorize(actor, kind); readableKinds.add(kind); }
      catch (error) { if (!(error instanceof ForbiddenException)) throw error; }
    }
    related.splice(0, related.length, ...related.filter(doc => readableKinds.has(doc.kind)));
    const events: any[] = logs.map(log => ({ id: log.id, action: log.action, actorId: log.userId, at: log.timestamp,
      before: object(log.oldValues), after: object(log.newValues) }));
    // Legacy documents have no event table; preserve truthful original timestamps rather than inventing actors.
    if (!events.some(e => e.action === 'CREATED')) events.push({ id: `created:${id}`, action: 'CREATED', actorId: invoice.createdBy, at: invoice.createdAt, after: { status: 'Saved purchase', source: invoice.source } });
    for (const original of invoice.documents || []) events.push({ id: `source:${original.id}`, action: 'ORIGINAL_CAPTURED', actorId: original.uploadedBy, at: original.createdAt, after: { fileName: original.fileName, sha256: original.sha256 } });
    if (invoice.stockCommittedAt && !events.some(e => e.action === 'STOCK_COMMITTED')) events.push({ id: `posted:${id}`, action: 'STOCK_COMMITTED', actorId: invoice.stockCommittedBy, at: invoice.stockCommittedAt, after: { reference: invoice.stockCommitReference } });
    for (const doc of related) for (const event of doc.events) events.push({ id: event.id, action: `${doc.kind}: ${event.action}`, actorId: event.actorId, at: event.createdAt, documentId: doc.id, kind: doc.kind, after: event.detail });
    for (const allocation of payments) events.push({ id: `payment:${allocation.id}`, action: 'PAYMENT_ALLOCATED', actorId: allocation.payment.paidBy, at: allocation.createdAt, after: { amount: allocation.amount, reference: allocation.payment.referenceNo, mode: allocation.payment.mode } });
    for (const allocation of credits) {
      events.push({ id: `credit:${allocation.id}`, action: 'CREDIT_ALLOCATED', actorId: allocation.createdBy, at: allocation.createdAt, after: { amount: Number(allocation.amount), reference: allocation.credit.reference } });
      if (allocation.reversedAt) events.push({ id: `credit-reversed:${allocation.id}`, action: 'CREDIT_ALLOCATION_REVERSED', actorId: allocation.reversedBy, at: allocation.reversedAt, after: { amount: Number(allocation.amount), reason: allocation.reversalReason } });
    }
    const originals = invoice.documents || [];
    if (originals.length) {
      const sourceEvents = await this.prisma.auditLog.findMany({ where: { entity: 'PharmacyPurchaseInvoiceDocument', entityId: { in: originals.map((doc: any) => doc.id) } }, orderBy: { timestamp: 'asc' } });
      for (const log of sourceEvents) events.push({ id: log.id, action: log.action, actorId: log.userId, at: log.timestamp, before: object(log.oldValues), after: object(log.newValues) });
    }
    const actorIds = [...new Set(events.map(e => e.actorId).filter(Boolean))];
    const users = actorIds.length ? await this.prisma.user.findMany({ where: { id: { in: actorIds }, branchId: actor.branchId }, select: { id: true, firstName: true, lastName: true } }) : [];
    const names = new Map(users.map(user => [user.id, `${user.firstName} ${user.lastName}`.trim()]));
    const has = (...keys: string[]) => permissions.has('*') || keys.some(key => permissions.has(key));
    const canEdit = ['OWNER', 'ADMIN', 'PHARMACIST', 'RECEPTION'].includes(actor.role) && has('pharmacy:purchase-invoice:create', 'inventory:po:create');
    return { invoice, version: invoice.actionVersion || 1, metadata: invoice.actionMetadata || {},
      permissions: { attach: canEdit, metadata: canEdit && has('inventory:item:update'),
        return: has('inventory:transaction:create'), edit: canEdit, ledgerRead: canReadLedger,
        mayAllocate: canReadLedger && has('pharmacy:purchase-ledger:write') },
      related: related.map(doc => ({ id: doc.id, kind: doc.kind, reference: doc.reference, status: doc.status, totalAmount: Number(doc.totalAmount), postedAt: doc.postedAt })),
      events: events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()).map(event => ({ ...event, actor: names.get(event.actorId) || event.actorId || 'Actor not recorded' })) };
  }

  /**
   * @cc [owner:nareshshah139,label:product] purchase-supporting-original-append-only
   * Adding an original to any saved purchase MUST retain all earlier original bytes, leave stock
   * and invoice financials unchanged, and reject a source already owned by another purchase.
   */
  async attachOriginal(actor: WorkflowActor, id: string, file: Express.Multer.File) {
    await this.access(actor, true);
    await this.purchases.findOne(id, actor.branchId);
    const original = await this.purchases.archiveOriginal(file, actor.branchId, actor.id);
    return this.workflow.transaction(async tx => {
      const invoice = await tx.pharmacyPurchaseInvoice.findFirst({ where: { id, branchId: actor.branchId } });
      if (!invoice) throw new NotFoundException('Purchase invoice not found');
      if (original.purchaseInvoiceId === id) return original;
      const linked = await tx.pharmacyPurchaseInvoiceDocument.updateMany({ where: { id: original.id, branchId: actor.branchId, purchaseInvoiceId: null }, data: { purchaseInvoiceId: id } });
      if (linked.count !== 1) throw new ConflictException('This original is already attached to another purchase. Existing originals have been retained.');
      await tx.auditLog.create({ data: { userId: actor.id, action: 'SUPPORTING_ORIGINAL_ADDED', entity: 'PharmacyPurchaseInvoice', entityId: id,
        newValues: JSON.stringify({ branchId: actor.branchId, documentId: original.id, fileName: original.fileName, sha256: original.sha256, stockEffect: 0 }) } });
      return { ...original, purchaseInvoiceId: id };
    });
  }

  /**
   * @cc [owner:nareshshah139,label:product] purchase-metadata-no-retroactive-pricing
   * A versioned location or future-sale-discount edit MUST audit before/after values and MUST NOT
   * rewrite posted quantities, purchase rates, taxes, payable totals or historical sale discounts.
   */
  async saveMetadata(actor: WorkflowActor, id: string, input: Record<string, any>) {
    const permissions = await this.access(actor, true);
    if (!permissions.has('*') && !permissions.has('inventory:item:update')) throw new ForbiddenException('This action requires inventory:item:update');
    const reason = String(input.reason || '').trim(), location = String(input.location || '').trim();
    const discount = Number(input.futureSaleDiscountPercent);
    if (reason.length < 3 || reason.length > 500) throw new BadRequestException('Enter a reason between 3 and 500 characters');
    if (location.length > 160 || !Number.isFinite(discount) || discount < 0 || discount > 100 || !Number.isSafeInteger(input.version)) throw new BadRequestException('Enter a location up to 160 characters, a future sale discount from 0 to 100, and the saved version');
    const metadata = { location, futureSaleDiscountPercent: money(discount), reason, updatedBy: actor.id, updatedAt: new Date().toISOString(), discountBasis: 'Suggested future sale discount only; posted purchase and sales totals unchanged' };
    return this.workflow.transaction(async tx => {
      const invoice = await tx.pharmacyPurchaseInvoice.findFirst({ where: { id, branchId: actor.branchId }, include: { items: true } });
      if (!invoice) throw new NotFoundException('Purchase invoice not found');
      const changed = await tx.pharmacyPurchaseInvoice.updateMany({ where: { id, branchId: actor.branchId, actionVersion: input.version }, data: { actionMetadata: metadata, actionVersion: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException('Purchase actions changed. Reload the invoice before saving.');
      const batchChanges: any[] = [];
      for (const inventoryId of [...new Set(invoice.items.map((item: any) => item.inventoryItemId).filter(Boolean))]) {
        const item = await tx.inventoryItem.findFirst({ where: { id: inventoryId, branchId: actor.branchId } });
        if (!item) throw new ConflictException('A linked inventory batch is unavailable. Reload the invoice.');
        const before = object(item.metadata), after = { ...before, location, futureSaleDiscountPercent: money(discount) };
        await tx.inventoryItem.update({ where: { id: item.id }, data: { storageLocation: location || null, metadata: JSON.stringify(after) } });
        batchChanges.push({ inventoryId, before: { location: item.storageLocation, futureSaleDiscountPercent: before.futureSaleDiscountPercent }, after: { location, futureSaleDiscountPercent: money(discount) } });
      }
      await tx.auditLog.create({ data: { userId: actor.id, entity: 'PharmacyPurchaseInvoice', entityId: id, action: 'LOCATION_DISCOUNT_METADATA_UPDATED', oldValues: JSON.stringify({ metadata: invoice.actionMetadata }), newValues: JSON.stringify({ branchId: actor.branchId, metadata, batchChanges, stockEffect: 0, payableEffect: 0 }) } });
      return { version: input.version + 1, metadata };
    });
  }

  /**
   * @cc [owner:nareshshah139,label:product] purchase-export-complete-saved-record
   * PDF, CSV and XLSX MUST derive every header and line from the saved branch records, including
   * paid/free units, taxes, adjustments, rounding and status. Register export MUST include every
   * matching invoice regardless of the selected page. Exports MUST NOT change stock or financials.
   */
  async export(actor: WorkflowActor, format: string, id?: string, query: QueryPharmacyPurchaseInvoiceDto = {}) {
    await this.access(actor);
    if (!['pdf', 'csv', 'xlsx', 'qr'].includes(format)) throw new BadRequestException('Choose PDF, CSV, Excel or QR');
    if (format === 'qr' && !id) throw new BadRequestException('Open a purchase before printing its QR');
    let invoices: any[];
    if (id) invoices = [await this.purchases.findOne(id, actor.branchId)];
    else {
      invoices = [];
      // Stable ID order in a repeatable snapshot includes all matching rows without page drift.
      const where = this.purchases.purchaseRegisterWhere(query, actor.branchId);
      invoices = await this.prisma.$transaction(tx => tx.pharmacyPurchaseInvoice.findMany({ where, orderBy: [{ invoiceDate: 'desc' }, { id: 'asc' }], include: { items: { orderBy: { lineNumber: 'asc' } }, documents: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true, uploadedBy: true, createdAt: true } } } }), { isolationLevel: 'RepeatableRead' });
    }
    const name = (id ? `purchase-${invoices[0].invoiceNumber}` : 'purchase-register').replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 100);
    const headers = invoices.map(invoice => this.header(invoice));
    const rows: Record<string, any>[] = invoices.flatMap((invoice, index) =>
      (invoice.items.length ? invoice.items : [{}]).map((item: any) => ({
        ...headers[index], ...Object.fromEntries(Object.entries(item).map(([key, value]) => [`Line ${label(key)}`, scalar(value)])),
      })));
    if (format === 'csv') {
      const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
      const cell = (value: any) => { let text = String(scalar(value)); if (/^[\s]*[=+@-]/.test(text) && typeof value !== 'number') text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; };
      const csv = [keys.map(cell).join(','), ...rows.map(row => keys.map(key => cell(row[key])).join(','))].join('\r\n');
      return { data: Buffer.from(`\uFEFF${csv}`), mimeType: 'text/csv; charset=utf-8', fileName: `${name}.csv` };
    }
    if (format === 'xlsx') {
      const XLSX = require('xlsx'), book = XLSX.utils.book_new();
      const originals = invoices.flatMap(invoice => (invoice.documents || []).map((doc: any) => ({
        invoiceNumber: invoice.invoiceNumber, ...Object.fromEntries(Object.entries(doc).map(([key, value]) => [key, scalar(value)])),
      })));
      for (const [title, data] of [['Bills', headers], ['All purchase rows', rows], ['Originals', originals]] as const) {
        const sheet = XLSX.utils.json_to_sheet(data); sheet['!cols'] = Object.keys(data[0] || {}).map(() => ({ wch: 22 })); XLSX.utils.book_append_sheet(book, sheet, title);
      }
      return { data: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName: `${name}.xlsx` };
    }
    return { data: await this.pdf(invoices, format === 'qr'), mimeType: 'application/pdf', fileName: `${name}${format === 'qr' ? '-qr' : ''}.pdf` };
  }

  private header(invoice: any): Record<string, any> {
    const header = Object.fromEntries(Object.entries(invoice).filter(([key]) => !['items', 'documents', 'paymentAllocations'].includes(key)).map(([key, value]) => [label(key), scalar(value)]));
    return { ...header, 'Line count': invoice.items.length,
      'Paid quantity': invoice.items.reduce((n: number, item: any) => n + Number(item.quantityPurchased), 0),
      'Free quantity': invoice.items.reduce((n: number, item: any) => n + Number(item.freeQuantity), 0),
      'Quantity basis': 'Per line declared stock unit; mixed units are not interchangeable',
      'Stock effect': invoice.status === 'STOCK_COMMITTED' ? invoice.workflowReceiptId ? 'Already received on linked inward challan; bill adds zero stock' : 'Stock added once' : 'No stock added',
      Originals: (invoice.documents || []).map((doc: any) => `${doc.fileName} (${doc.sha256})`).join('; ') };
  }

  private async pdf(invoices: any[], qrOnly: boolean): Promise<Buffer> {
    const PDFDocument = require('pdfkit'), pdf = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true }), chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => { pdf.on('data', (chunk: Buffer) => chunks.push(chunk)); pdf.on('end', () => resolve(Buffer.concat(chunks))); pdf.on('error', reject); });
    const text = (value: any) => String(value ?? '').replace(/[\u2010-\u2015]/g, '-');
    const space = (height: number) => { if (pdf.y + height > 785) pdf.addPage(); };
    const fields = (entries: [string, any][]) => {
      for (let i = 0; i < entries.length; i += 2) {
        const row = entries.slice(i, i + 2).map(([key, value]) => `${key}: ${text(value)}`);
        pdf.font('Helvetica').fontSize(8.5);
        const height = Math.max(...row.map(value => pdf.heightOfString(value, { width: 248 }))) + 7;
        space(height); const y = pdf.y;
        row.forEach((value, column) => pdf.text(value, 36 + column * 267, y, { width: 248 }));
        pdf.y = y + height; pdf.x = 36;
      }
    };
    for (let index = 0; index < invoices.length; index++) {
      const invoice = invoices[index]; if (index) pdf.addPage();
      pdf.font('Helvetica-Bold').fontSize(18).text(`Purchase ${text(invoice.invoiceNumber)}`);
      pdf.font('Helvetica').fontSize(10).text(text(invoice.distributorName)).text(`${invoice.status} | ${invoice.distributorGstin}`); pdf.moveDown();
      if (qrOnly) {
        const code = `purchase:${invoice.id}`;
        const qr = await require('qrcode').toBuffer(code, { type: 'png', width: 420, margin: 2, errorCorrectionLevel: 'M' });
        pdf.image(qr, 36, pdf.y, { width: 160, height: 160 }); pdf.y += 172;
        pdf.text(code).text('Scan or paste this code into the purchase register search.');
        pdf.text(`Invoice date: ${new Date(invoice.invoiceDate).toISOString().slice(0, 10)} | Net: INR ${Number(invoice.netPayable).toFixed(2)}`);
        continue;
      }
      const header = this.header(invoice);
      const technical = new Set(['Id', 'Branch Id', 'Action Metadata', 'Action Version', 'Ocr Flags', 'Unresolved Ocr Flags', 'Reconciliation Issues', 'Originals', 'Quantity basis', 'Stock effect']);
      fields(Object.entries(header).filter(([key, value]) => !technical.has(key) && value !== '' && value !== '[]'));
      if (invoice.actionMetadata) fields(Object.entries(object(invoice.actionMetadata)).filter(([key]) => ['location', 'futureSaleDiscountPercent', 'discountBasis'].includes(key)).map(([key, value]) => [label(key), value]));
      space(44); pdf.fontSize(8.5).text(text(header['Stock effect']), { width: 523 }); pdf.moveDown();
      for (const item of invoice.items) {
        space(180); pdf.font('Helvetica-Bold').fontSize(11).text(`${item.lineNumber}. ${text(item.productName)}`);
        pdf.font('Helvetica').fontSize(9);
        const summary = `Batch ${text(item.batchNumber)} | Expiry ${String(item.expiryMonth).padStart(2, '0')}/${item.expiryYear} | Paid ${item.quantityPurchased} + free ${item.freeQuantity} ${text(item.packUnitType)} (${text(item.packSize)})`;
        pdf.text(summary).text(`MRP INR ${Number(item.mrp).toFixed(2)} | Rate INR ${Number(item.purchaseRate).toFixed(2)} | Taxable INR ${Number(item.taxableAmount).toFixed(2)} | GST INR ${Number(item.gstAmount).toFixed(2)} | Total INR ${Number(item.lineTotal).toFixed(2)}`);
        pdf.moveDown(.5);
        const listed = new Set(['productName', 'batchNumber', 'expiryMonth', 'expiryYear', 'quantityPurchased', 'freeQuantity', 'packUnitType', 'packSize', 'mrp', 'purchaseRate', 'taxableAmount', 'gstAmount', 'lineTotal', 'lineNumber', 'createdAt', 'updatedAt', 'purchaseInvoiceId']);
        fields(Object.entries(item).filter(([key, value]) => !listed.has(key) && value != null && value !== '' && value !== '[]' && !(Array.isArray(value) && !value.length)).map(([key, value]) => [label(key), scalar(value)]));
        pdf.moveDown();
      }
      space(60); pdf.font('Helvetica-Bold').fontSize(12).text(`Net payable: INR ${Number(invoice.netPayable).toFixed(2)}`);
      pdf.font('Helvetica').fontSize(9).text(`Taxable INR ${Number(invoice.taxableAmount).toFixed(2)} | GST INR ${Number(invoice.totalGst).toFixed(2)} | Rounding INR ${Number(invoice.rounding).toFixed(2)}`);
      pdf.moveDown();
      for (const original of invoice.documents || []) {
        const content = `Original: ${text(original.fileName)} | SHA-256 ${original.sha256}`;
        pdf.fontSize(8); space(pdf.heightOfString(content, { width: 523 }) + 5); pdf.text(content, { width: 523 });
      }
    }
    if (!invoices.length) pdf.fontSize(14).text('No purchases match these filters.');
    const pages = pdf.bufferedPageRange();
    for (let page = 0; page < pages.count; page++) { pdf.switchToPage(page); pdf.font('Helvetica').fontSize(8).text(`Purchase record | Page ${page + 1} of ${pages.count}`, 36, 804, { lineBreak: false }); }
    pdf.end(); return done;
  }
}
