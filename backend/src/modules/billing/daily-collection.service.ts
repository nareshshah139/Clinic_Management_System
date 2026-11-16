import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';

export type CollectionEntry = {
  id: string;
  source: 'CLINIC' | 'PHARMACY';
  invoiceId: string;
  invoiceNumber: string;
  patientName: string;
  billType: string | null;
  paidAt: Date;
  method: string;
  amount: number;
};

/**
 * @cc [owner:nareshshah139,label:product] collection-clinic-day
 * A valid YYYY-MM-DD date MUST select [00:00 IST, next 00:00 IST).
 * Invalid calendar dates MUST fail rather than roll into another day.
 */
export function collectionDay(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new BadRequestException('Choose a date in YYYY-MM-DD format.');
  const midnight = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== date) throw new BadRequestException('Choose a valid calendar date.');
  const start = new Date(midnight.getTime() - 330 * 60_000);
  return { gte: start, lt: new Date(start.getTime() + 86_400_000) };
}

/**
 * @cc [owner:nareshshah139,label:product] collection-signed-payments
 * Totals MUST sum rounded paise for each payment exactly once. Negative payments
 * count as refunds. Net MUST equal receipts minus refunds and method subtotals.
 */
export function collectionTotals(entries: Pick<CollectionEntry, 'amount' | 'method'>[]) {
  let received = 0, refunded = 0;
  const methods = new Map<string, number>();
  for (const entry of entries) {
    if (!Number.isFinite(entry.amount)) throw new BadRequestException('A payment has an invalid amount.');
    const paise = Math.round(entry.amount * 100);
    if (!Number.isSafeInteger(paise)) throw new BadRequestException('A payment amount is too large.');
    if (paise >= 0) received += paise;
    else refunded -= paise;
    if (!Number.isSafeInteger(received) || !Number.isSafeInteger(refunded)) throw new BadRequestException('Collection totals are too large.');
    methods.set(entry.method, (methods.get(entry.method) || 0) + paise);
  }
  return {
    received: received / 100, refunded: refunded / 100, net: (received - refunded) / 100,
    paymentCount: entries.length,
    methods: [...methods].map(([method, amount]) => ({ method, amount: amount / 100 })),
  };
}

/**
 * @cc [owner:nareshshah139,label:security] collection-scope-and-completion
 * Reports MUST read only completed payments for the authenticated branch and
 * selected receipt day, using a consistent database snapshot. Unpaid invoices
 * and failed or pending payments MUST NOT count as collections.
 */
@Injectable()
export class DailyCollectionService {
  constructor(private readonly prisma: PrismaService) {}

  async read(branchId: string, date: string) {
    const range = collectionDay(date);
    const [clinic, pharmacy] = await this.prisma.$transaction([
      this.prisma.newPayment.findMany({
        where: { invoice: { branchId }, reconStatus: 'COMPLETED', createdAt: range },
        include: { invoice: { select: { id: true, invoiceNo: true, billType: true, patient: { select: { name: true } } } } },
      }),
      this.prisma.pharmacyPayment.findMany({
        where: { invoice: { branchId }, status: 'COMPLETED', paymentDate: range },
        include: { invoice: { select: { id: true, invoiceNumber: true, patient: { select: { name: true } } } } },
      }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const entries: CollectionEntry[] = [
      ...clinic.map(p => ({ id: `clinic:${p.id}`, source: 'CLINIC' as const, invoiceId: p.invoiceId, invoiceNumber: p.invoice.invoiceNo, patientName: p.invoice.patient.name, billType: p.invoice.billType, paidAt: p.createdAt, method: p.mode as string, amount: p.amount })),
      ...pharmacy.map(p => ({ id: `pharmacy:${p.id}`, source: 'PHARMACY' as const, invoiceId: p.invoiceId, invoiceNumber: p.invoice.invoiceNumber, patientName: p.invoice.patient?.name || 'Walk-in', billType: null, paidAt: p.paymentDate, method: p.method as string, amount: p.amount })),
    ].sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime() || a.id.localeCompare(b.id));
    return { date, timeZone: 'Asia/Kolkata', ...collectionTotals(entries), entries };
  }
}
