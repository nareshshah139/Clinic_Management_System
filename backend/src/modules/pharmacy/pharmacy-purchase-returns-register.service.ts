import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../shared/database/prisma.service';
import { Prisma } from '@prisma/client';
import {
  DRAFT_STATUSES,
  RETURN_KINDS,
  purchaseReturnEntry,
  purchaseReturnRows,
  purchaseReturnsPage,
  purchaseReturnsSheet,
  type PurchaseReturnEntry,
  type PurchaseReturnsPage,
  type PurchaseReturnsQuery,
  type StandingCredit,
  returnCreditState,
} from './pharmacy-purchase-returns-register';
import { clinicDayStart, money, peopleById } from './register-utils';
import {
  EVERY_ALLOCATION,
  SUPPLIER_CREDIT_BALANCE_SELECT,
  creditBalance,
  creditHeldByDistributor,
  type SupplierCreditRecord,
} from './supplier-credit-balance';

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
} as const;

// Posting refuses a return dated more than a day ahead, and posting touches updatedAt, so a
// return dated inside the range was last updated no earlier than two days before it starts.
// Drafts and cancelled drafts never passed that check, so they are read whatever their date.
const RETURN_DATE_LEAD_DAYS = 2;

type CreditTotalsRow = Omit<SupplierCreditRecord, 'allocations'> & { allocated: unknown };
type OpenReturnRow = { status: string; totalAmount: Prisma.Decimal; credit: CreditTotalsRow | null };

const withOpenAllocations = (row: CreditTotalsRow) => ({
  ...row,
  allocations: [{ amount: row.allocated, createdAt: row.createdAt, reversedAt: null }],
});

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
    const gstin = distributorGstin?.trim().toUpperCase() || null;
    const [credits, open] = await Promise.all([
      this.prisma.$queryRaw<CreditTotalsRow[]>`
        SELECT c."supplierGstin", c."amount", c."applied", c."createdAt", c."reversedAt", c."creditNoteNumber", c."receivedAt",
               COALESCE(SUM(a."amount") FILTER (WHERE a."reversedAt" IS NULL), 0) AS "allocated"
        FROM "inventory_supplier_credits" c
        LEFT JOIN "inventory_credit_allocations" a ON a."creditId" = c."id"
        WHERE c."branchId" = ${actor.branchId} AND c."creditNoteNumber" IS NOT NULL AND c."reversedAt" IS NULL
          AND (${gstin}::text IS NULL OR c."supplierGstin" = ${gstin})
        GROUP BY c."id"`,
      this.prisma.$queryRaw<OpenReturnRow[]>`
        SELECT d."status", d."totalAmount",
               CASE WHEN c."id" IS NULL THEN NULL ELSE json_build_object(
                 'supplierGstin', c."supplierGstin", 'amount', c."amount", 'applied', c."applied", 'createdAt', c."createdAt",
                 'reversedAt', c."reversedAt", 'creditNoteNumber', c."creditNoteNumber", 'receivedAt', c."receivedAt",
                 'allocated', COALESCE(SUM(a."amount") FILTER (WHERE a."reversedAt" IS NULL), 0)) END AS "credit"
        FROM "inventory_workflow_documents" d
        LEFT JOIN "inventory_supplier_credits" c ON c."documentId" = d."id"
        LEFT JOIN "inventory_credit_allocations" a ON a."creditId" = c."id"
        WHERE d."branchId" = ${actor.branchId} AND d."kind" IN ('SUPPLIER_RETURN', 'CREDIT_NOTE') AND d."status" IN ('CHALLAN', 'POSTED')
          AND c."creditNoteNumber" IS NULL AND (${gstin}::text IS NULL OR d."supplierGstin" = ${gstin})
        GROUP BY d."id", c."id"`,
    ]);
    const held = [...creditHeldByDistributor(credits.map(withOpenAllocations), now).values()].reduce((total, amount) => total + amount, 0);
    const awaited = open.filter(
      (row) =>
        returnCreditState(
          row.status,
          row.credit ? { number: null, ...creditBalance(withOpenAllocations(row.credit), EVERY_ALLOCATION) } : null,
        ) === 'AWAITED',
    );
    return {
      held: money(held),
      awaited: { amount: money(awaited.reduce((total, row) => total + Number(row.totalAmount), 0)), count: awaited.length },
    };
  }

  private entries(actor: PurchaseReturnsActor, now: Date, from: string) {
    const earliest = new Date(clinicDayStart(from).getTime() - RETURN_DATE_LEAD_DAYS * 86400000);
    return this.build(actor, now, {
      branchId: actor.branchId,
      kind: { in: [...RETURN_KINDS] },
      OR: [{ updatedAt: { gte: earliest } }, { status: { in: [...DRAFT_STATUSES, 'CANCELLED'] } }],
    });
  }

  private async build(actor: PurchaseReturnsActor, now: Date, where: Record<string, unknown>): Promise<PurchaseReturnEntry[]> {
    const docs = await this.prisma.inventoryWorkflowDocument.findMany({ where, select: DOC_SELECT });
    const ids = (pick: (doc: (typeof docs)[number]) => string | null) => [
      ...new Set(docs.map(pick).filter((id): id is string => Boolean(id))),
    ];
    const [credits, suppliers, bills, people] = await Promise.all([
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
    ]);
    const creditOf = new Map(credits.map((credit) => [credit.documentId, credit]));
    const supplierName = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
    const billOf = new Map(bills.map((bill) => [bill.id, bill]));
    return docs.map((doc) => {
      const bill = doc.purchaseInvoiceId ? billOf.get(doc.purchaseInvoiceId) : undefined;
      return purchaseReturnEntry(
        {
          ...doc,
          distributorName: (doc.supplierId && supplierName.get(doc.supplierId)) || bill?.distributorName || null,
          sourceBillNo: bill?.invoiceNumber ?? null,
          credit: creditOf.get(doc.id) ?? null,
        },
        doc.createdBy ? (people.get(doc.createdBy) ?? null) : null,
        now,
      );
    });
  }
}
