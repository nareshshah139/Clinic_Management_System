import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { clinicDayRange, money } from '../pharmacy/register-utils';
import { clinicBillActions } from './billing-access';
import {
  BILL_ROW_INCLUDE,
  STATUS_WHERE,
  VOID,
  billRow,
  orderBy,
  paise,
  receiptClinic,
  refundableOf,
  rupees,
  searchWhere,
  type ClinicBillQuery,
  type ClinicBillRegister,
  type ClinicReceipt,
} from './clinic-bill-register';

const BRANCH_IDENTITY = {
  select: {
    name: true,
    address: true,
    city: true,
    state: true,
    pincode: true,
    phone: true,
    gstNumber: true,
    licenseNumber: true,
  },
} as const;

@Injectable()
export class ClinicBillRegisterService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @cc [owner:nareshshah139,label:calculation;security] clinic-bill-register
   * The register MUST list only the branch's clinic bills dated in the clinic-time range and
   * matching the search and status filter. Its totals MUST cover every matching bill, not only the
   * page: billed, collected and outstanding over bills that are not void, and the void count apart.
   */
  async list(
    query: ClinicBillQuery,
    viewer: { id: string; role: string },
    branchId: string,
  ): Promise<ClinicBillRegister> {
    const where: Prisma.NewInvoiceWhereInput = {
      branchId,
      createdAt: clinicDayRange(query.from, query.to),
      ...searchWhere(query.field, query.q),
      ...(query.status ? STATUS_WHERE[query.status] : {}),
    };
    const live = { AND: [where, { status: { not: VOID } }] };
    const [bills, total, sums, voided, actions] = await Promise.all([
      this.prisma.newInvoice.findMany({
        where,
        include: {
          ...BILL_ROW_INCLUDE,
          payments: {
            where: { reconStatus: 'COMPLETED', amount: { lt: 0 } },
            select: { amount: true },
          },
        },
        orderBy: orderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.newInvoice.count({ where }),
      this.prisma.newInvoice.aggregate({
        where: live,
        _sum: { total: true, received: true, balance: true },
        _count: { _all: true },
      }),
      this.prisma.newInvoice.count({
        where: { AND: [where, { status: VOID }] },
      }),
      clinicBillActions(this.prisma, viewer),
    ]);
    return {
      rows: bills.map(billRow),
      total,
      page: query.page,
      limit: query.limit,
      totals: {
        count: sums._count._all,
        billed: money(sums._sum.total ?? 0),
        collected: money(sums._sum.received ?? 0),
        outstanding: money(sums._sum.balance ?? 0),
        voided,
      },
      actions,
    };
  }

  async receipt(id: string, branchId: string): Promise<ClinicReceipt> {
    const bill = await this.prisma.newInvoice.findFirst({
      where: { id, branchId },
      include: {
        ...BILL_ROW_INCLUDE,
        branch: BRANCH_IDENTITY,
        items: { orderBy: { createdAt: 'asc' } },
        payments: {
          where: { reconStatus: 'COMPLETED' },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!bill) throw new NotFoundException('Bill not found');
    return {
      bill: billRow(bill),
      clinic: receiptClinic(bill.branch),
      notes: bill.notes,
      items: bill.items.map((item) => ({
        id: item.id,
        name: item.name,
        qty: item.qty,
        unitPrice: money(item.unitPrice),
        discount: item.discount,
        gstRate: item.gstRate,
        total: money(item.total),
      })),
      payments: bill.payments.map((payment) => ({
        id: payment.id,
        amount: rupees(paise(payment.amount)),
        mode: payment.mode,
        reference: payment.reference,
        paidAt: payment.createdAt.toISOString(),
        refundable: refundableOf(payment, bill.payments, bill.received),
      })),
    };
  }
}
