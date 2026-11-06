import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  RETURN_KINDS,
  awaitedTotals,
  purchaseReturnEntry,
  purchaseReturnRows,
  purchaseReturnsPage,
  purchaseReturnsSheet,
  type PurchaseReturnEntry,
  type PurchaseReturnsPage,
  type PurchaseReturnsQuery,
  type StandingCredit,
} from './pharmacy-purchase-returns-register';
import { clinicDayStart, peopleById } from './register-utils';
import { SUPPLIER_CREDIT_BALANCE_SELECT, creditHeldByDistributor } from './supplier-credit-balance';

export type PurchaseReturnsActor = { branchId: string };

const DOC_SELECT = {
  id: true,
  kind: true,
  status: true,
  reference: true,
  version: true,
  createdAt: true,
  createdBy: true,
  payload: true,
  totalAmount: true,
  supplierId: true,
  supplierGstin: true,
  purchaseInvoiceId: true,
  postedAt: true,
} as const;

// Posting refuses a return dated more than a day ahead, and posting touches updatedAt, so a
// return dated inside the range was last updated no earlier than two days before it starts.
const RETURN_DATE_LEAD_DAYS = 2;

@Injectable()
export class PharmacyPurchaseReturnsRegisterService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PurchaseReturnsQuery, actor: PurchaseReturnsActor, now = new Date()): Promise<PurchaseReturnsPage> {
    const [entries, standing] = await Promise.all([this.entries(actor, now, query.from), this.standing(actor, now, query.distributorGstin)]);
    return purchaseReturnsPage(entries, query, standing);
  }

  async awaitedCount(actor: PurchaseReturnsActor, now = new Date()) {
    return (await this.standing(actor, now)).awaited.count;
  }

  async export(query: PurchaseReturnsQuery, actor: PurchaseReturnsActor, now = new Date()) {
    const rows = purchaseReturnRows(await this.entries(actor, now, query.from), query);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(purchaseReturnsSheet(rows)), 'Purchase returns');
    return {
      data: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
      fileName: `purchase-returns-${query.from}-${query.to}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  private async standing(actor: PurchaseReturnsActor, now: Date, distributorGstin?: string): Promise<StandingCredit> {
    const gstin = distributorGstin?.trim().toUpperCase() || undefined;
    const [credits, open] = await Promise.all([
      this.prisma.inventorySupplierCredit.findMany({
        where: { branchId: actor.branchId, creditNoteNumber: { not: null }, reversedAt: null, ...(gstin ? { supplierGstin: gstin } : {}) },
        select: SUPPLIER_CREDIT_BALANCE_SELECT,
      }),
      this.build(actor, now, {
        branchId: actor.branchId,
        kind: 'SUPPLIER_RETURN',
        status: { in: ['CHALLAN', 'POSTED'] },
        ...(gstin ? { supplierGstin: gstin } : {}),
      }),
    ]);
    const held = [...creditHeldByDistributor(credits, now).values()].reduce((total, amount) => total + amount, 0);
    return { held: Math.round(held * 100) / 100, awaited: awaitedTotals(open) };
  }

  private entries(actor: PurchaseReturnsActor, now: Date, from: string) {
    const earliest = new Date(clinicDayStart(from).getTime() - RETURN_DATE_LEAD_DAYS * 86400000);
    return this.build(actor, now, { branchId: actor.branchId, kind: { in: [...RETURN_KINDS] }, updatedAt: { gte: earliest } });
  }

  private async build(actor: PurchaseReturnsActor, now: Date, where: Record<string, unknown>): Promise<PurchaseReturnEntry[]> {
    const docs = await this.prisma.inventoryWorkflowDocument.findMany({ where, select: DOC_SELECT });
    const ids = (pick: (doc: (typeof docs)[number]) => string | null) => [
      ...new Set(docs.map(pick).filter((id): id is string => Boolean(id))),
    ];
    const challans = docs.filter((doc) => doc.status === 'CHALLAN').map((doc) => doc.id);
    const [credits, suppliers, bills, people, sent] = await Promise.all([
      this.prisma.inventorySupplierCredit.findMany({
        where: { branchId: actor.branchId, documentId: { in: docs.map((doc) => doc.id) } },
        select: { ...SUPPLIER_CREDIT_BALANCE_SELECT, id: true, documentId: true, creditNoteDate: true },
      }),
      this.prisma.supplier.findMany({
        where: { branchId: actor.branchId, id: { in: ids((doc) => doc.supplierId) } },
        select: { id: true, name: true },
      }),
      this.prisma.pharmacyPurchaseInvoice.findMany({
        where: { branchId: actor.branchId, id: { in: ids((doc) => doc.purchaseInvoiceId) } },
        select: { id: true, invoiceNumber: true, distributorName: true },
      }),
      peopleById(this.prisma, docs.map((doc) => doc.createdBy)),
      challans.length
        ? this.prisma.inventoryWorkflowEvent.findMany({
            where: { branchId: actor.branchId, documentId: { in: challans }, action: 'CHALLAN' },
            select: { documentId: true, createdAt: true },
          })
        : [],
    ]);
    const creditOf = new Map(credits.map((credit) => [credit.documentId, credit]));
    const supplierName = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
    const billOf = new Map(bills.map((bill) => [bill.id, bill]));
    const sentAt = new Map(sent.map((event) => [event.documentId, event.createdAt]));
    return docs.map((doc) => {
      const bill = doc.purchaseInvoiceId ? billOf.get(doc.purchaseInvoiceId) : undefined;
      return purchaseReturnEntry(
        {
          ...doc,
          distributorName: (doc.supplierId && supplierName.get(doc.supplierId)) || bill?.distributorName || null,
          sourceBillNo: bill?.invoiceNumber ?? null,
          credit: creditOf.get(doc.id) ?? null,
          awaitedSince: sentAt.get(doc.id) ?? doc.postedAt ?? null,
        },
        doc.createdBy ? (people.get(doc.createdBy) ?? null) : null,
        now,
      );
    });
  }
}
