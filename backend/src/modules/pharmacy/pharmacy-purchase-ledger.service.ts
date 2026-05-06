import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { CreatePharmacyPurchasePaymentDto } from './dto/pharmacy-purchase-ledger.dto';

type PurchasePaymentStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID';

type LedgerInvoice = {
  id: string;
  branchId: string;
  distributorName: string;
  distributorGstin: string;
  invoiceNumber: string;
  invoiceDate: Date | string;
  dueDate?: Date | string | null;
  netPayable: number;
  tcsAmount?: number | null;
  status?: string;
  paymentAllocations?: {
    amount: number;
    payment?: {
      id: string;
      paymentDate: Date | string;
      amount: number;
      mode: string;
      referenceNo?: string | null;
    } | null;
  }[];
};

const TCS_THRESHOLD_AMOUNT = 5000000;
const TCS_APPROACHING_RATIO = 0.9;
const MONEY_TOLERANCE = 0.01;

@Injectable()
export class PharmacyPurchaseLedgerService {
  constructor(private prisma: PrismaService) {}

  async createPayment(
    dto: CreatePharmacyPurchasePaymentDto,
    branchId: string,
    userId: string,
  ) {
    const distributorGstin = dto.distributorGstin.trim().toUpperCase();
    const distributorName = dto.distributorName.trim();
    const paidBy = (dto.paidBy || userId || '').trim();
    const allocations = this.normalizeAllocations(dto.allocations);
    const allocationTotal = this.money(
      allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
    );
    const amount = this.money(dto.amount);

    if (!paidBy) {
      throw new BadRequestException('paidBy is required');
    }
    if (Math.abs(allocationTotal - amount) > MONEY_TOLERANCE) {
      throw new BadRequestException(
        'Payment amount must equal the total allocated amount',
      );
    }

    return (this.prisma as any).$transaction(async (tx: any) => {
      const invoiceIds = allocations.map(
        (allocation) => allocation.purchaseInvoiceId,
      );
      const invoices: LedgerInvoice[] =
        await tx.pharmacyPurchaseInvoice.findMany({
          where: {
            branchId,
            id: { in: invoiceIds },
          },
          include: {
            paymentAllocations: true,
          },
        });

      this.validateAllocationInvoices({
        branchId,
        distributorGstin,
        invoices,
        allocations,
      });
      const invoiceById = new Map(
        invoices.map((invoice) => [invoice.id, invoice]),
      );

      const payment = await tx.pharmacyPurchasePayment.create({
        data: {
          branchId,
          distributorGstin,
          distributorName,
          paymentDate: new Date(dto.paymentDate),
          mode: dto.mode,
          paidBy,
          amount,
          referenceNo: dto.referenceNo?.trim() || undefined,
          notes: dto.notes?.trim() || undefined,
          allocations: {
            create: allocations.map((allocation) => ({
              purchaseInvoiceId: allocation.purchaseInvoiceId,
              amount: this.money(allocation.amount),
            })),
          },
        },
        include: {
          allocations: {
            include: {
              purchaseInvoice: true,
            },
          },
        },
      });

      return {
        ...payment,
        allocations: payment.allocations.map((allocation: any) => {
          const invoice = allocation.purchaseInvoice;
          const originalInvoice = invoiceById.get(allocation.purchaseInvoiceId);
          const existingPaid = this.sumAllocations(
            originalInvoice?.paymentAllocations,
          );
          const paidAfter = this.money(existingPaid + allocation.amount);
          const outstandingAfter = this.outstanding(invoice, paidAfter);

          return {
            id: allocation.id,
            purchaseInvoiceId: allocation.purchaseInvoiceId,
            amount: allocation.amount,
            invoiceNumber: invoice.invoiceNumber,
            invoiceTotal: this.money(invoice.netPayable),
            paidAfter,
            outstandingAfter,
            paymentStatus: this.paymentStatus(invoice.netPayable, paidAfter),
          };
        }),
      };
    });
  }

  async getDistributorSummaries(branchId: string, asOfDate = new Date()) {
    const invoices = await this.findLedgerInvoices(branchId);
    const groups = this.groupInvoicesByDistributor(invoices);
    const fiscalYearStart = this.fiscalYearStart(asOfDate);

    return {
      asOfDate: asOfDate.toISOString(),
      tcsThreshold: TCS_THRESHOLD_AMOUNT,
      distributors: Array.from(groups.values())
        .map((groupInvoices) =>
          this.buildDistributorSummary(
            groupInvoices,
            asOfDate,
            fiscalYearStart,
          ),
        )
        .sort((a, b) => b.outstanding - a.outstanding),
    };
  }

  async getDistributorLedger(
    branchId: string,
    distributorGstin: string,
    asOfDate = new Date(),
  ) {
    const gstin = distributorGstin.trim().toUpperCase();
    const invoices = await this.findLedgerInvoices(branchId, gstin);
    if (invoices.length === 0) {
      throw new NotFoundException('Distributor ledger not found');
    }

    const payments = await (
      this.prisma as any
    ).pharmacyPurchasePayment.findMany({
      where: {
        branchId,
        distributorGstin: gstin,
      },
      include: {
        allocations: {
          include: {
            purchaseInvoice: true,
          },
        },
      },
      orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }],
    });

    const invoiceRows = invoices
      .map((invoice) => this.invoiceLedgerRow(invoice, asOfDate))
      .sort(
        (a, b) =>
          new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime(),
      );

    let runningBalance = 0;
    const events = [
      ...invoiceRows.map((invoice) => ({
        eventDate: invoice.invoiceDate,
        type: 'INVOICE' as const,
        debit: invoice.netPayable,
        credit: 0,
        description: `Invoice ${invoice.invoiceNumber}`,
        invoiceId: invoice.id,
      })),
      ...payments.map((payment: any) => ({
        eventDate: payment.paymentDate,
        type: 'PAYMENT' as const,
        debit: 0,
        credit: this.money(payment.amount),
        description: `Payment ${payment.referenceNo || payment.mode}`,
        paymentId: payment.id,
      })),
    ]
      .sort((a, b) => {
        const byDate =
          new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
        if (byDate !== 0) return byDate;
        return a.type.localeCompare(b.type);
      })
      .map((event) => {
        runningBalance = this.money(
          runningBalance + event.debit - event.credit,
        );
        return {
          ...event,
          eventDate: new Date(event.eventDate).toISOString(),
          runningBalance,
        };
      });

    return {
      distributorGstin: gstin,
      distributorName: invoices[0].distributorName,
      asOfDate: asOfDate.toISOString(),
      invoices: invoiceRows,
      payments: payments.map((payment: any) => ({
        id: payment.id,
        paymentDate: payment.paymentDate,
        mode: payment.mode,
        paidBy: payment.paidBy,
        amount: this.money(payment.amount),
        referenceNo: payment.referenceNo,
        notes: payment.notes,
        allocations: payment.allocations.map((allocation: any) => ({
          id: allocation.id,
          purchaseInvoiceId: allocation.purchaseInvoiceId,
          invoiceNumber: allocation.purchaseInvoice.invoiceNumber,
          amount: this.money(allocation.amount),
        })),
      })),
      runningLedger: events,
    };
  }

  async getAging(branchId: string, asOfDate = new Date()) {
    const buckets = [
      this.emptyBucket('0-30'),
      this.emptyBucket('31-60'),
      this.emptyBucket('61-90'),
      this.emptyBucket('90+'),
    ];

    const invoices = await this.findLedgerInvoices(branchId);
    for (const invoice of invoices) {
      const paid = this.sumAllocations(invoice.paymentAllocations);
      const outstanding = this.outstanding(invoice, paid);
      if (outstanding <= MONEY_TOLERANCE) continue;

      const anchorDate = new Date(invoice.dueDate || invoice.invoiceDate);
      const days = Math.max(0, this.daysBetween(anchorDate, asOfDate));
      const bucket =
        days <= 30
          ? buckets[0]
          : days <= 60
            ? buckets[1]
            : days <= 90
              ? buckets[2]
              : buckets[3];

      bucket.count += 1;
      bucket.amount = this.money(bucket.amount + outstanding);
      bucket.invoices.push({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        distributorName: invoice.distributorName,
        distributorGstin: invoice.distributorGstin,
        dueDate: invoice.dueDate,
        outstanding,
        daysPastDue: days,
      });
    }

    return {
      asOfDate: asOfDate.toISOString(),
      buckets,
      totalOutstanding: this.money(
        buckets.reduce((sum, bucket) => sum + bucket.amount, 0),
      ),
    };
  }

  async getAlerts(branchId: string, asOfDate = new Date()) {
    const invoices = await this.findLedgerInvoices(branchId);
    const fiscalYearStart = this.fiscalYearStart(asOfDate);
    const groups = this.groupInvoicesByDistributor(invoices);
    const dueToday: any[] = [];
    const dueIn7Days: any[] = [];
    const overdue: any[] = [];
    const todayStart = this.startOfDay(asOfDate);
    const sevenDaysEnd = this.endOfDay(this.addDays(todayStart, 7));

    for (const invoice of invoices) {
      const paid = this.sumAllocations(invoice.paymentAllocations);
      const outstanding = this.outstanding(invoice, paid);
      if (outstanding <= MONEY_TOLERANCE || !invoice.dueDate) continue;

      const dueDate = new Date(invoice.dueDate);
      const alertRow = {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        distributorName: invoice.distributorName,
        distributorGstin: invoice.distributorGstin,
        dueDate,
        outstanding,
        daysPastDue: this.daysBetween(dueDate, asOfDate),
      };

      if (this.isSameDay(dueDate, todayStart)) {
        dueToday.push(alertRow);
      } else if (dueDate < todayStart) {
        overdue.push(alertRow);
      } else if (dueDate <= sevenDaysEnd) {
        dueIn7Days.push(alertRow);
      }
    }

    const tcsApproaching = Array.from(groups.values())
      .map((groupInvoices) =>
        this.buildDistributorSummary(groupInvoices, asOfDate, fiscalYearStart),
      )
      .filter((summary) => summary.tcsApproaching)
      .map((summary) => ({
        distributorName: summary.distributorName,
        distributorGstin: summary.distributorGstin,
        annualPurchaseTotal: summary.annualPurchaseTotal,
        tcsThreshold: summary.tcsThreshold,
        tcsRemaining: summary.tcsRemaining,
        tcsAmountTotal: summary.tcsAmountTotal,
      }));

    return {
      asOfDate: asOfDate.toISOString(),
      dueIn7Days,
      dueToday,
      overdue,
      tcsApproaching,
      counts: {
        dueIn7Days: dueIn7Days.length,
        dueToday: dueToday.length,
        overdue: overdue.length,
        tcsApproaching: tcsApproaching.length,
      },
    };
  }

  private normalizeAllocations(
    allocations: CreatePharmacyPurchasePaymentDto['allocations'],
  ) {
    const byInvoice = new Map<string, number>();
    for (const allocation of allocations || []) {
      const purchaseInvoiceId = allocation.purchaseInvoiceId?.trim();
      const amount = this.money(allocation.amount);
      if (!purchaseInvoiceId) {
        throw new BadRequestException('purchaseInvoiceId is required');
      }
      if (amount <= 0) {
        throw new BadRequestException('Allocation amounts must be positive');
      }
      byInvoice.set(
        purchaseInvoiceId,
        this.money((byInvoice.get(purchaseInvoiceId) || 0) + amount),
      );
    }

    return Array.from(byInvoice.entries()).map(
      ([purchaseInvoiceId, amount]) => ({
        purchaseInvoiceId,
        amount,
      }),
    );
  }

  private validateAllocationInvoices(params: {
    branchId: string;
    distributorGstin: string;
    invoices: LedgerInvoice[];
    allocations: { purchaseInvoiceId: string; amount: number }[];
  }) {
    const invoiceById = new Map(
      params.invoices.map((invoice) => [invoice.id, invoice]),
    );

    if (params.invoices.length !== params.allocations.length) {
      throw new NotFoundException(
        'One or more purchase invoices were not found for this branch',
      );
    }

    for (const allocation of params.allocations) {
      const invoice = invoiceById.get(allocation.purchaseInvoiceId);
      if (!invoice) {
        throw new NotFoundException(
          'One or more purchase invoices were not found for this branch',
        );
      }
      if (invoice.branchId !== params.branchId) {
        throw new BadRequestException(
          'Purchase invoice does not belong to this branch',
        );
      }
      if (
        invoice.distributorGstin.trim().toUpperCase() !==
        params.distributorGstin
      ) {
        throw new BadRequestException(
          'Payment distributor GSTIN must match every allocated invoice',
        );
      }

      const paid = this.sumAllocations(invoice.paymentAllocations);
      const outstanding = this.outstanding(invoice, paid);
      if (allocation.amount - outstanding > MONEY_TOLERANCE) {
        throw new BadRequestException(
          `Allocation exceeds outstanding balance for invoice ${invoice.invoiceNumber}`,
        );
      }
    }
  }

  private async findLedgerInvoices(
    branchId: string,
    distributorGstin?: string,
  ) {
    return (this.prisma as any).pharmacyPurchaseInvoice.findMany({
      where: {
        branchId,
        ...(distributorGstin
          ? { distributorGstin: distributorGstin.trim().toUpperCase() }
          : {}),
        status: { not: 'CANCELLED' },
      },
      include: {
        paymentAllocations: {
          include: {
            payment: true,
          },
        },
      },
      orderBy: [{ distributorName: 'asc' }, { invoiceDate: 'asc' }],
    });
  }

  private groupInvoicesByDistributor(invoices: LedgerInvoice[]) {
    const groups = new Map<string, LedgerInvoice[]>();
    for (const invoice of invoices) {
      const key = invoice.distributorGstin.trim().toUpperCase();
      groups.set(key, [...(groups.get(key) || []), invoice]);
    }
    return groups;
  }

  private buildDistributorSummary(
    invoices: LedgerInvoice[],
    asOfDate: Date,
    fiscalYearStart: Date,
  ) {
    let invoiceTotal = 0;
    let paid = 0;
    let pendingCount = 0;
    let partialCount = 0;
    let paidCount = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let dueSoonCount = 0;
    let dueSoonAmount = 0;
    let annualPurchaseTotal = 0;
    let tcsAmountTotal = 0;
    const paidCycleDays: number[] = [];
    const todayStart = this.startOfDay(asOfDate);
    const sevenDaysEnd = this.endOfDay(this.addDays(todayStart, 7));

    for (const invoice of invoices) {
      const invoiceAmount = this.money(invoice.netPayable);
      const invoicePaid = this.sumAllocations(invoice.paymentAllocations);
      const outstanding = this.outstanding(invoice, invoicePaid);
      const status = this.paymentStatus(invoiceAmount, invoicePaid);
      invoiceTotal = this.money(invoiceTotal + invoiceAmount);
      paid = this.money(paid + invoicePaid);

      if (status === 'PENDING') pendingCount += 1;
      if (status === 'PARTIALLY_PAID') partialCount += 1;
      if (status === 'PAID') {
        paidCount += 1;
        const lastPaymentDate = this.lastPaymentDate(invoice);
        if (lastPaymentDate) {
          paidCycleDays.push(
            Math.max(
              0,
              this.daysBetween(new Date(invoice.invoiceDate), lastPaymentDate),
            ),
          );
        }
      }

      if (outstanding > MONEY_TOLERANCE && invoice.dueDate) {
        const dueDate = new Date(invoice.dueDate);
        if (dueDate < todayStart) {
          overdueCount += 1;
          overdueAmount = this.money(overdueAmount + outstanding);
        } else if (dueDate <= sevenDaysEnd) {
          dueSoonCount += 1;
          dueSoonAmount = this.money(dueSoonAmount + outstanding);
        }
      }

      const invoiceDate = new Date(invoice.invoiceDate);
      if (invoiceDate >= fiscalYearStart && invoiceDate <= asOfDate) {
        annualPurchaseTotal = this.money(annualPurchaseTotal + invoiceAmount);
        tcsAmountTotal = this.money(tcsAmountTotal + (invoice.tcsAmount || 0));
      }
    }

    return {
      distributorGstin: invoices[0].distributorGstin,
      distributorName: invoices[0].distributorName,
      invoiceCount: invoices.length,
      invoiceTotal,
      paid,
      outstanding: this.money(invoiceTotal - paid),
      counts: {
        pending: pendingCount,
        partial: partialCount,
        paid: paidCount,
      },
      overdue: {
        count: overdueCount,
        amount: overdueAmount,
      },
      dueSoon: {
        count: dueSoonCount,
        amount: dueSoonAmount,
      },
      averagePaymentCycleDays:
        paidCycleDays.length === 0
          ? null
          : this.money(
              paidCycleDays.reduce((sum, days) => sum + days, 0) /
                paidCycleDays.length,
            ),
      annualPurchaseTotal,
      tcsAmountTotal,
      tcsThreshold: TCS_THRESHOLD_AMOUNT,
      tcsRemaining: this.money(
        Math.max(TCS_THRESHOLD_AMOUNT - annualPurchaseTotal, 0),
      ),
      tcsApproaching:
        annualPurchaseTotal >= TCS_THRESHOLD_AMOUNT * TCS_APPROACHING_RATIO,
    };
  }

  private invoiceLedgerRow(invoice: LedgerInvoice, asOfDate: Date) {
    const paid = this.sumAllocations(invoice.paymentAllocations);
    const outstanding = this.outstanding(invoice, paid);
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      netPayable: this.money(invoice.netPayable),
      paid,
      outstanding,
      paymentStatus: this.paymentStatus(invoice.netPayable, paid),
      daysPastDue:
        outstanding > MONEY_TOLERANCE && invoice.dueDate
          ? this.daysBetween(new Date(invoice.dueDate), asOfDate)
          : 0,
      payments: (invoice.paymentAllocations || []).map((allocation) => ({
        paymentId: allocation.payment?.id,
        paymentDate: allocation.payment?.paymentDate,
        mode: allocation.payment?.mode,
        referenceNo: allocation.payment?.referenceNo,
        amount: this.money(allocation.amount),
      })),
    };
  }

  private emptyBucket(label: string) {
    return {
      label,
      count: 0,
      amount: 0,
      invoices: [] as any[],
    };
  }

  private sumAllocations(allocations?: { amount: number }[]) {
    return this.money(
      (allocations || []).reduce(
        (sum, allocation) => sum + Number(allocation.amount || 0),
        0,
      ),
    );
  }

  private outstanding(invoice: { netPayable: number }, paid: number) {
    return this.money(Math.max(Number(invoice.netPayable || 0) - paid, 0));
  }

  private paymentStatus(total: number, paid: number): PurchasePaymentStatus {
    if (paid <= MONEY_TOLERANCE) return 'PENDING';
    if (Number(total || 0) - paid <= MONEY_TOLERANCE) return 'PAID';
    return 'PARTIALLY_PAID';
  }

  private lastPaymentDate(invoice: LedgerInvoice) {
    const dates = (invoice.paymentAllocations || [])
      .map((allocation) => allocation.payment?.paymentDate)
      .filter(Boolean)
      .map((date) => new Date(date as Date | string).getTime());
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates));
  }

  private fiscalYearStart(asOfDate: Date) {
    const year =
      asOfDate.getMonth() >= 3
        ? asOfDate.getFullYear()
        : asOfDate.getFullYear() - 1;
    return new Date(year, 3, 1);
  }

  private startOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  private endOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(23, 59, 59, 999);
    return next;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private isSameDay(a: Date, b: Date) {
    return this.startOfDay(a).getTime() === this.startOfDay(b).getTime();
  }

  private daysBetween(start: Date, end: Date) {
    const startTime = this.startOfDay(start).getTime();
    const endTime = this.startOfDay(end).getTime();
    return Math.floor((endTime - startTime) / 86400000);
  }

  private money(value: number) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }
}
