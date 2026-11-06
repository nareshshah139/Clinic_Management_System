import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  RETURN_KINDS,
  purchaseReturnEntry,
  purchaseReturnsPage,
  type PurchaseReturnEntry,
  type PurchaseReturnsPage,
  type PurchaseReturnsQuery,
} from './pharmacy-purchase-returns-register';
import { peopleById } from './register-utils';
import { SUPPLIER_CREDIT_BALANCE_SELECT } from './supplier-credit-balance';

export type PurchaseReturnsActor = { branchId: string };

@Injectable()
export class PharmacyPurchaseReturnsRegisterService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PurchaseReturnsQuery, actor: PurchaseReturnsActor, now = new Date()): Promise<PurchaseReturnsPage> {
    return purchaseReturnsPage(await this.entries(actor, now), query);
  }

  private async entries(actor: PurchaseReturnsActor, now: Date): Promise<PurchaseReturnEntry[]> {
    const docs = await this.prisma.inventoryWorkflowDocument.findMany({
      where: { branchId: actor.branchId, kind: { in: [...RETURN_KINDS] } },
      select: {
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
      },
    });
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
