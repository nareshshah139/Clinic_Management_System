import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../shared/database/prisma.service';
import { rupees } from '../inventory/supplier-return';
import { invoiceOutstanding, invoiceSettled, payableBalance, scheduledPayments, splitByEffectiveDate } from './purchase-payment-balance';
import { clinicDay, money } from './register-utils';
import { EVERY_ALLOCATION, SUPPLIER_CREDIT_BALANCE_SELECT, creditBalance } from './supplier-credit-balance';

export type SupplierCreditActor = { id: string; branchId: string };
type Scope = { creditId?: string; gstin?: string };
type Wanted = { purchaseInvoiceId: string; amount: number };

const TOLERANCE = 0.005;
const BILL_INCLUDE = {
  paymentAllocations: { where: { payment: { reversedAt: null } }, include: { payment: { select: { paymentDate: true } } } },
} as const;

function billPayable(invoice: any, now: Date) {
  const { inEffect, scheduled } = splitByEffectiveDate(invoice.paymentAllocations, now);
  const outstanding = invoiceOutstanding(invoice, invoiceSettled({ creditApplied: invoice.creditApplied, paymentAllocations: inEffect }));
  return payableBalance(outstanding, scheduledPayments(scheduled).scheduled);
}

const balanceChanged = (error: any) =>
  ['P2025', 'P2034'].includes(error?.code)
    ? new ConflictException({ code: 'BALANCE_CHANGED', message: 'The bill or credit balance changed while you were saving. Check the new amounts.' })
    : error;

function fingerprint(scope: Scope, wanted: Wanted[]) {
  const canonical = JSON.stringify({
    creditId: scope.creditId ?? null,
    gstin: scope.creditId ? null : (scope.gstin ?? null),
    allocations: [...wanted].sort((a, b) => a.purchaseInvoiceId.localeCompare(b.purchaseInvoiceId)).map((a) => [a.purchaseInvoiceId, a.amount.toFixed(2)]),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Owns supplier credit set-off: which credits a distributor holds, which bills they can settle,
 * and the allocations between them. Every path that applies or undoes a credit goes through here.
 */
@Injectable()
export class PharmacySupplierCreditService {
  constructor(private readonly prisma: PrismaService) {}

  private async transaction<T>(run: (tx: any) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(run, { isolationLevel: 'Serializable', timeout: 30000 });
      } catch (error) {
        if (['P2034', 'P2002'].includes((error as any)?.code) && attempt < 2) continue;
        throw error;
      }
    }
  }

  private async openBills(db: any, branchId: string, gstin: string, now: Date, ids?: string[]) {
    const invoices = await db.pharmacyPurchaseInvoice.findMany({
      where: { branchId, distributorGstin: gstin, status: 'STOCK_COMMITTED', ...(ids ? { id: { in: ids } } : {}) },
      include: BILL_INCLUDE,
    });
    return invoices
      .map((invoice: any) => ({ invoice, payable: billPayable(invoice, now) }))
      .sort(
        (a: any, b: any) =>
          new Date(a.invoice.dueDate ?? a.invoice.invoiceDate).getTime() - new Date(b.invoice.dueDate ?? b.invoice.invoiceDate).getTime() ||
          new Date(a.invoice.invoiceDate).getTime() - new Date(b.invoice.invoiceDate).getTime() ||
          a.invoice.id.localeCompare(b.invoice.id),
      );
  }

  private async heldCredits(db: any, branchId: string, scope: Scope) {
    const credits = await db.inventorySupplierCredit.findMany({
      where: {
        branchId,
        reversedAt: null,
        ...(scope.creditId ? { id: scope.creditId } : { supplierGstin: scope.gstin, creditNoteNumber: { not: null } }),
      },
      select: { ...SUPPLIER_CREDIT_BALANCE_SELECT, id: true, applied: true, reference: true, creditNoteDate: true },
      orderBy: [{ creditNoteDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    if (scope.creditId && !credits.length) throw new NotFoundException('This credit is no longer open');
    if (credits.some((credit: any) => !credit.creditNoteNumber))
      throw new BadRequestException("Record the distributor's credit note number before setting this credit off against bills");
    return credits.map((credit: any) => ({ credit, available: creditBalance(credit, EVERY_ALLOCATION).available }));
  }

  private scopeOf(input: Record<string, any>): Scope {
    const creditId = String(input?.creditId ?? '').trim() || undefined;
    const gstin = String(input?.distributorGstin ?? '').trim().toUpperCase() || undefined;
    if (!creditId && !gstin) throw new BadRequestException('Choose a distributor or a credit to set off');
    return { creditId, gstin };
  }

  async setOffOptions(actor: SupplierCreditActor, input: Record<string, any>, now = new Date()) {
    const scope = this.scopeOf(input);
    const credits = await this.heldCredits(this.prisma, actor.branchId, scope);
    const gstin = credits[0]?.credit.supplierGstin ?? scope.gstin!;
    const bills = (await this.openBills(this.prisma, actor.branchId, gstin, now)).filter((bill: any) => bill.payable > 0.01);
    const supplier = await this.prisma.supplier.findFirst({ where: { branchId: actor.branchId, gstNumber: gstin }, select: { name: true } });
    const open = credits.filter((entry: any) => entry.available > 0.01);
    return {
      distributor: { gstin, name: bills[0]?.invoice.distributorName ?? supplier?.name ?? gstin },
      available: money(open.reduce((sum: number, entry: any) => sum + entry.available, 0)),
      credits: open.map(({ credit, available }: any) => ({
        id: credit.id,
        number: credit.creditNoteNumber,
        date: credit.creditNoteDate ? credit.creditNoteDate.toISOString().slice(0, 10) : null,
        reference: credit.reference,
        available,
      })),
      bills: bills.map(({ invoice, payable }: any) => ({
        id: invoice.id,
        billNo: invoice.invoiceNumber,
        billDate: clinicDay(invoice.invoiceDate),
        dueDate: invoice.dueDate ? clinicDay(invoice.dueDate) : null,
        payable,
      })),
    };
  }

  async setOff(actor: SupplierCreditActor, input: Record<string, any>, now = new Date()) {
    const requestKey = String(input?.requestKey ?? '').trim();
    if (!requestKey || requestKey.length > 120) throw new BadRequestException('A request key is required');
    const scope = this.scopeOf(input);
    const wanted: Wanted[] = (Array.isArray(input?.allocations) ? input.allocations : []).map((allocation: any) => ({
      purchaseInvoiceId: String(allocation?.purchaseInvoiceId ?? ''),
      amount: money(Number(allocation?.amount)),
    }));
    if (!wanted.length || wanted.length > 100) throw new BadRequestException('Choose at least one bill to set the credit off against');
    if (wanted.some((allocation) => !allocation.purchaseInvoiceId || !Number.isFinite(allocation.amount) || allocation.amount <= 0))
      throw new BadRequestException('Each bill needs an amount of more than zero');
    if (new Set(wanted.map((allocation) => allocation.purchaseInvoiceId)).size !== wanted.length)
      throw new BadRequestException('Each bill can appear only once');
    const print = fingerprint(scope, wanted);
    return this.transaction(async (tx) => {
      const earlier = await tx.inventoryCreditSetOff.findUnique({
        where: { branchId_requestKey: { branchId: actor.branchId, requestKey } },
        include: { allocations: true },
      });
      if (earlier) {
        if (earlier.fingerprint !== print)
          throw new ConflictException({
            code: 'REQUEST_KEY_REUSED',
            message: 'This request was already used for a different set-off. Close the dialog and start again.',
          });
        if (earlier.allocations.some((allocation: any) => allocation.reversedAt))
          throw new ConflictException({ code: 'SET_OFF_UNDONE', message: 'This set-off was undone. Start a new set-off if you still need it.' });
        return this.outcome(tx, actor, earlier.id, earlier.allocations, now);
      }
      const credits = await this.heldCredits(tx, actor.branchId, scope);
      const gstin = credits[0]?.credit.supplierGstin ?? scope.gstin;
      const bills = await this.openBills(tx, actor.branchId, gstin, now, wanted.map((allocation) => allocation.purchaseInvoiceId));
      const billOf = new Map(bills.map((bill: any) => [bill.invoice.id, bill]));
      for (const allocation of wanted) {
        const bill: any = billOf.get(allocation.purchaseInvoiceId);
        if (!bill) throw new BadRequestException('Choose posted bills from the same distributor as the credit');
        if (allocation.amount > bill.payable + TOLERANCE)
          throw new ConflictException({
            code: 'BALANCE_CHANGED',
            message: `The balance of bill ${bill.invoice.invoiceNumber} changed: ${rupees(Math.max(bill.payable, 0))} is left to pay.`,
          });
      }
      const available = money(credits.reduce((sum: number, entry: any) => sum + entry.available, 0));
      const total = money(wanted.reduce((sum, allocation) => sum + allocation.amount, 0));
      if (total > available + TOLERANCE)
        throw new ConflictException({ code: 'BALANCE_CHANGED', message: `The credit available changed: ${rupees(available)} is left to set off.` });
      const setOff = await tx.inventoryCreditSetOff.create({
        data: { branchId: actor.branchId, requestKey, fingerprint: print, createdBy: actor.id },
      });
      const created: any[] = [];
      for (const allocation of wanted) {
        let remaining = allocation.amount;
        for (const entry of credits) {
          if (remaining <= TOLERANCE) break;
          const take = money(Math.min(entry.available, remaining));
          if (take <= 0) continue;
          entry.available = money(entry.available - take);
          remaining = money(remaining - take);
          created.push(
            await tx.inventoryCreditAllocation.create({
              data: {
                branchId: actor.branchId,
                creditId: entry.credit.id,
                purchaseInvoiceId: allocation.purchaseInvoiceId,
                amount: take,
                requestKey: `${requestKey}:${created.length + 1}`,
                setOffId: setOff.id,
                createdBy: actor.id,
              },
            }),
          );
        }
        const bill: any = billOf.get(allocation.purchaseInvoiceId);
        await tx.pharmacyPurchaseInvoice.update({
          where: { id: bill.invoice.id, updatedAt: bill.invoice.updatedAt },
          data: { creditApplied: { increment: allocation.amount } },
        });
      }
      const usedBy = new Map<string, number>();
      for (const allocation of created) usedBy.set(allocation.creditId, money((usedBy.get(allocation.creditId) ?? 0) + Number(allocation.amount)));
      for (const entry of credits) {
        const used = usedBy.get(entry.credit.id);
        if (used)
          await tx.inventorySupplierCredit.update({
            where: { id: entry.credit.id, applied: entry.credit.applied },
            data: { applied: { increment: used } },
          });
      }
      return this.outcome(tx, actor, setOff.id, created, now);
    }).catch((error) => {
      throw balanceChanged(error);
    });
  }

  allocate(actor: SupplierCreditActor, input: Record<string, any>) {
    return this.setOff(actor, {
      requestKey: input?.requestKey,
      creditId: input?.creditId,
      allocations: [{ purchaseInvoiceId: input?.purchaseInvoiceId, amount: input?.amount }],
    });
  }

  async reverseSetOff(actor: SupplierCreditActor, id: string, reason: string) {
    const why = String(reason ?? '').trim();
    if (!why) throw new BadRequestException('Enter a reversal reason');
    return this.transaction(async (tx) => {
      const setOff = await tx.inventoryCreditSetOff.findFirst({ where: { id, branchId: actor.branchId }, include: { allocations: true } });
      if (!setOff) throw new NotFoundException('Set-off not found');
      const open = setOff.allocations.filter((allocation: any) => !allocation.reversedAt);
      if (!open.length) throw new ConflictException({ code: 'SET_OFF_UNDONE', message: 'This set-off was already undone.' });
      for (const allocation of open) await this.reverseOne(tx, actor, allocation, why);
      return { id: setOff.id, reversed: open.map((allocation: any) => allocation.id) };
    }).catch((error) => {
      throw balanceChanged(error);
    });
  }

  async reverseAllocation(actor: SupplierCreditActor, id: string, reason: string) {
    const why = String(reason ?? '').trim();
    if (!why) throw new BadRequestException('Enter a reversal reason');
    return this.transaction(async (tx) => {
      const allocation = await tx.inventoryCreditAllocation.findFirst({ where: { id, branchId: actor.branchId } });
      if (!allocation) throw new NotFoundException('Allocation not found');
      if (allocation.reversedAt) return allocation;
      return this.reverseOne(tx, actor, allocation, why);
    });
  }

  private async reverseOne(tx: any, actor: SupplierCreditActor, allocation: any, reason: string) {
    await tx.inventorySupplierCredit.update({ where: { id: allocation.creditId }, data: { applied: { decrement: allocation.amount } } });
    await tx.pharmacyPurchaseInvoice.update({
      where: { id: allocation.purchaseInvoiceId, branchId: actor.branchId },
      data: { creditApplied: { decrement: Number(allocation.amount) } },
    });
    return tx.inventoryCreditAllocation.update({
      where: { id: allocation.id, reversedAt: null },
      data: { reversedAt: new Date(), reversedBy: actor.id, reversalReason: reason },
    });
  }

  private async outcome(tx: any, actor: SupplierCreditActor, setOffId: string, allocations: any[], now: Date) {
    const billIds = [...new Set(allocations.map((allocation) => allocation.purchaseInvoiceId))];
    const creditIds = [...new Set(allocations.map((allocation) => allocation.creditId))];
    const [invoices, credits] = await Promise.all([
      tx.pharmacyPurchaseInvoice.findMany({ where: { branchId: actor.branchId, id: { in: billIds } }, include: BILL_INCLUDE }),
      tx.inventorySupplierCredit.findMany({
        where: { branchId: actor.branchId, id: { in: creditIds } },
        select: { ...SUPPLIER_CREDIT_BALANCE_SELECT, id: true },
      }),
    ]);
    const creditOf = new Map(credits.map((credit: any) => [credit.id, credit]));
    return {
      setOffId,
      allocations: allocations.map((allocation) => ({
        id: allocation.id,
        creditId: allocation.creditId,
        creditNoteNumber: (creditOf.get(allocation.creditId) as any)?.creditNoteNumber ?? null,
        purchaseInvoiceId: allocation.purchaseInvoiceId,
        amount: Number(allocation.amount),
      })),
      bills: invoices.map((invoice: any) => ({ id: invoice.id, billNo: invoice.invoiceNumber, payableAfter: billPayable(invoice, now) })),
      credits: credits.map((credit: any) => ({ id: credit.id, number: credit.creditNoteNumber, available: creditBalance(credit, EVERY_ALLOCATION).available })),
    };
  }
}
