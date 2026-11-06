import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  Person,
  SalesRegisterPage,
  SalesRegisterQuery,
  billRow,
  clinicDayRange,
  salesRegisterPage,
  workflowRow,
} from './pharmacy-sales-register';

type PharmacyBills = Awaited<
  ReturnType<PharmacySalesRegisterService['pharmacyBills']>
>;

export type SalesRegisterResponse = SalesRegisterPage & { clinicName: string };

@Injectable()
export class PharmacySalesRegisterService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: SalesRegisterQuery,
    branchId: string,
  ): Promise<SalesRegisterResponse> {
    const range = clinicDayRange(query.from, query.to);
    const [bills, documents, branch] = await Promise.all([
      query.register === 'sales'
        ? this.pharmacyBills(branchId, range)
        : Promise.resolve<PharmacyBills>([]),
      this.prisma.inventoryWorkflowDocument.findMany({
        where: {
          branchId,
          kind: query.register === 'sales' ? 'COUNTER_SALE' : 'SALES_RETURN',
          OR: [
            { createdAt: range },
            { payload: { path: ['date'], gte: query.from, lte: query.to } },
          ],
        },
        select: {
          id: true,
          kind: true,
          status: true,
          reference: true,
          createdAt: true,
          totalAmount: true,
          payload: true,
          createdBy: true,
          salesInvoiceId: true,
          sourceId: true,
        },
      }),
      this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { name: true },
      }),
    ]);

    const legacyCreators = await this.legacyBillCreators(
      branchId,
      bills
        .filter((bill) => !bill.createdById)
        .map((bill) => bill.invoiceNumber),
    );
    const billCreator = (bill: (typeof bills)[number]) =>
      bill.createdById ?? legacyCreators.get(bill.invoiceNumber) ?? null;
    const [people, linkedBills] = await Promise.all([
      this.people([
        ...bills.map(billCreator),
        ...documents.map((doc) => doc.createdBy),
      ]),
      this.linkedBillNumbers(branchId, documents),
    ]);
    const person = (id: string | null) =>
      id ? (people.get(id) ?? null) : null;

    const rows = [
      ...bills.map((bill) => billRow(bill, person(billCreator(bill)))),
      ...documents.map((doc) =>
        workflowRow(
          doc,
          person(doc.createdBy),
          linkedBills.get(doc.salesInvoiceId ?? '') ??
            linkedBills.get(doc.sourceId ?? '') ??
            null,
        ),
      ),
    ];
    return {
      ...salesRegisterPage(rows, query),
      clinicName: branch?.name ?? '',
    };
  }

  private pharmacyBills(branchId: string, range: { gte: Date; lt: Date }) {
    return this.prisma.pharmacyInvoice.findMany({
      where: { branchId, invoiceDate: range },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        invoiceDate: true,
        createdAt: true,
        totalAmount: true,
        paymentMethod: true,
        billingName: true,
        billingPhone: true,
        createdById: true,
        patient: { select: { name: true, phone: true } },
        payments: {
          where: { status: 'COMPLETED' },
          select: { method: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
  }

  private async legacyBillCreators(branchId: string, invoiceNumbers: string[]) {
    if (!invoiceNumbers.length) return new Map<string, string>();
    const sales = await this.prisma.stockTransaction.findMany({
      where: {
        branchId,
        type: 'SALE',
        reference: { in: invoiceNumbers.map((n) => `INV-${n}`) },
      },
      select: { reference: true, userId: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const creators = new Map<string, string>();
    for (const sale of sales) {
      const invoiceNumber = sale.reference!.slice('INV-'.length);
      if (!creators.has(invoiceNumber))
        creators.set(invoiceNumber, sale.userId);
    }
    return creators;
  }

  private async people(ids: (string | null)[]) {
    const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (!wanted.length) return new Map<string, Person>();
    const users = await this.prisma.user.findMany({
      where: { id: { in: wanted } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(
      users.map((user) => [
        user.id,
        { id: user.id, name: `${user.firstName} ${user.lastName}`.trim() },
      ]),
    );
  }

  private async linkedBillNumbers(
    branchId: string,
    documents: { salesInvoiceId: string | null; sourceId: string | null }[],
  ) {
    const invoiceIds = documents.flatMap((doc) =>
      doc.salesInvoiceId ? [doc.salesInvoiceId] : [],
    );
    const sourceIds = documents.flatMap((doc) =>
      doc.sourceId ? [doc.sourceId] : [],
    );
    const [invoices, sources] = await Promise.all([
      invoiceIds.length
        ? this.prisma.pharmacyInvoice.findMany({
            where: { branchId, id: { in: invoiceIds } },
            select: { id: true, invoiceNumber: true },
          })
        : Promise.resolve([]),
      sourceIds.length
        ? this.prisma.inventoryWorkflowDocument.findMany({
            where: { branchId, id: { in: sourceIds } },
            select: { id: true, reference: true },
          })
        : Promise.resolve([]),
    ]);
    return new Map([
      ...invoices.map(
        (invoice) => [invoice.id, invoice.invoiceNumber] as const,
      ),
      ...sources.map((source) => [source.id, source.reference] as const),
    ]);
  }
}
