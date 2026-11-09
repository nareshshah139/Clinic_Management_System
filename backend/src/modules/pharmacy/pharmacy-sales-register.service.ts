import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  ClinicIdentity,
  SalesRegisterPage,
  SalesRegisterQuery,
  billEntry,
  clinicIdentity,
  linkedBillNos,
  returnSourceLineIds,
  salesRegisterPage,
  workflowEntry,
} from './pharmacy-sales-register';
import { clinicDayRange, peopleById } from './register-utils';

type PharmacyBills = Awaited<
  ReturnType<PharmacySalesRegisterService['pharmacyBills']>
>;

type ReturnLinks = {
  id: string;
  kind: string;
  salesInvoiceId: string | null;
  payload: unknown;
};

export type SalesRegisterResponse = SalesRegisterPage & {
  clinic: ClinicIdentity;
};

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
        },
      }),
      this.prisma.branch.findUniqueOrThrow({
        where: { id: branchId },
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
      }),
    ]);

    const [people, links] = await Promise.all([
      peopleById(this.prisma, [
        ...bills.map((bill) => bill.createdById),
        ...documents.map((doc) => doc.createdBy),
      ]),
      this.returnLinks(branchId, documents),
    ]);
    const person = (id: string | null) =>
      id ? (people.get(id) ?? null) : null;

    const entries = [
      ...bills.map((bill) => billEntry(bill, person(bill.createdById))),
      ...documents.map((doc) =>
        workflowEntry(doc, person(doc.createdBy), links.get(doc.id) ?? []),
      ),
    ];
    return {
      ...salesRegisterPage(entries, query),
      clinic: clinicIdentity(branch),
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
        revisedAt: true,
        billingName: true,
        billingPhone: true,
        createdById: true,
        patient: { select: { name: true, phone: true } },
        payments: {
          where: { status: { in: ['COMPLETED', 'REFUNDED'] } },
          select: { method: true, amount: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
  }

  private async returnLinks(branchId: string, documents: ReturnLinks[]) {
    const returns = documents.filter((doc) => doc.kind === 'SALES_RETURN');
    const invoiceIds = [
      ...new Set(returns.flatMap((doc) => doc.salesInvoiceId ?? [])),
    ];
    const lineIds = [
      ...new Set(returns.flatMap((doc) => returnSourceLineIds(doc.payload))),
    ];
    const [invoices, sales] = await Promise.all([
      invoiceIds.length
        ? this.prisma.pharmacyInvoice.findMany({
            where: { branchId, id: { in: invoiceIds } },
            select: { id: true, invoiceNumber: true },
          })
        : Promise.resolve([]),
      lineIds.length
        ? this.prisma.stockTransaction.findMany({
            where: { branchId, type: 'SALE', id: { in: lineIds } },
            select: { id: true, reference: true },
          })
        : Promise.resolve([]),
    ]);
    const invoiceNumbers = new Map(
      invoices.map((invoice) => [invoice.id, invoice.invoiceNumber]),
    );
    const saleReferences = new Map(
      sales.map((sale) => [sale.id, sale.reference]),
    );
    return new Map(
      returns.map((doc) => [
        doc.id,
        linkedBillNos(
          invoiceNumbers.get(doc.salesInvoiceId ?? '') ?? null,
          returnSourceLineIds(doc.payload).map(
            (id) => saleReferences.get(id) ?? null,
          ),
        ),
      ]),
    );
  }
}
