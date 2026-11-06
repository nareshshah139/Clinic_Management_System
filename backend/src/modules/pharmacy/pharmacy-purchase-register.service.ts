import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../shared/database/prisma.service';
import { PharmacyPurchaseLedgerService } from './pharmacy-purchase-ledger.service';
import {
  DistributorPosition,
  PurchaseEntry,
  PurchaseRegisterPage,
  PurchaseRegisterQuery,
  purchaseEntry,
  purchaseRegisterPage,
  purchaseRegisterRows,
  purchaseRegisterSheet,
} from './pharmacy-purchase-register';
import { splitByEffectiveDate } from './purchase-payment-balance';
import { clinicDay, clinicDayRange, financialYear, peopleById } from './register-utils';

export type PurchaseRegisterActor = { branchId: string };

export type PurchaseRegisterListing = PurchaseRegisterPage & {
  creditHeld: Record<string, number>;
  distributorPosition: DistributorPosition | null;
};

export type PurchaseRegisterFile = {
  data: Buffer;
  fileName: string;
  mimeType: string;
};

@Injectable()
export class PharmacyPurchaseRegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: PharmacyPurchaseLedgerService,
  ) {}

  async list(
    query: PurchaseRegisterQuery,
    actor: PurchaseRegisterActor,
    now = new Date(),
  ): Promise<PurchaseRegisterListing> {
    const page = purchaseRegisterPage(await this.entries(query, actor, now), query);
    const gstin = query.distributorGstin?.trim();
    const [held, distributorPosition] = await Promise.all([
      this.ledger.creditHeld(actor.branchId, now, [
        ...new Set(page.rows.map((row) => row.distributor.gstin.toUpperCase())),
      ]),
      gstin ? this.ledger.distributorPosition(actor.branchId, gstin, now) : null,
    ]);
    return {
      ...page,
      creditHeld: Object.fromEntries([...held].filter(([, amount]) => amount > 0)),
      distributorPosition,
    };
  }

  async toReviewCount(actor: PurchaseRegisterActor, now = new Date()): Promise<number> {
    const query: PurchaseRegisterQuery = {
      ...financialYear(clinicDay(now)),
      paymentState: 'NOT_POSTED',
      sortBy: 'srNo',
      sortDir: 'asc',
      page: 1,
      limit: 1,
    };
    return (await this.list(query, actor, now)).total;
  }

  async export(
    query: PurchaseRegisterQuery,
    actor: PurchaseRegisterActor,
    now = new Date(),
  ): Promise<PurchaseRegisterFile> {
    const rows = purchaseRegisterRows(await this.entries(query, actor, now), query);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.json_to_sheet(purchaseRegisterSheet(rows)),
      'Purchase bills',
    );
    return {
      data: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }),
      fileName: `purchase-bills-${query.from}-${query.to}.xlsx`,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  private async entries(
    query: PurchaseRegisterQuery,
    actor: PurchaseRegisterActor,
    now: Date,
  ): Promise<PurchaseEntry[]> {
    const invoices = await this.prisma.pharmacyPurchaseInvoice.findMany({
      where: {
        branchId: actor.branchId,
        invoiceDate: clinicDayRange(query.from, query.to),
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        createdAt: true,
        createdBy: true,
        source: true,
        status: true,
        distributorName: true,
        distributorGstin: true,
        netPayable: true,
        creditApplied: true,
        paymentAllocations: {
          where: { payment: { reversedAt: null } },
          select: { amount: true, payment: { select: { paymentDate: true } } },
        },
        documents: {
          select: { id: true, fileName: true, mimeType: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    const people = await peopleById(this.prisma, invoices.map((invoice) => invoice.createdBy));
    const today = clinicDay(now);
    return invoices.map(({ paymentAllocations, ...invoice }) => {
      const { inEffect, scheduled } = splitByEffectiveDate(paymentAllocations, now);
      return purchaseEntry(
        {
          ...invoice,
          paymentAllocations: inEffect,
          scheduledAllocations: scheduled,
        },
        invoice.createdBy ? (people.get(invoice.createdBy) ?? null) : null,
        today,
      );
    });
  }
}
