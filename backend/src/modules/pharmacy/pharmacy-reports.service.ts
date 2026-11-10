import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { CLINIC_TIME_ZONE } from './clinic-day';
import { money } from './gst-slabs';
import { PharmacyComplianceService } from './pharmacy-compliance.service';
import {
  CashCount,
  COLLECTION_MODES,
  CollectionBill,
  CollectionCounterSale,
  CollectionMode,
  CollectionReturn,
  DailyCollection,
  buildDailyCollection,
  dailyCollectionSections,
} from './pharmacy-daily-collection';
import {
  PurchaseDoc,
  ReportLine,
  SaleDoc,
  billLine,
  compositionReport,
  doctorWiseSales,
  gstr1,
  gstr2a,
  gstr2b,
  gstr3b,
  hsnSummary,
  placeOfSupply,
  purchaseLine,
  purchaseRegister,
  salesOfType,
  salesRegister,
  signedLine,
  slabBandColumns,
  slabBills,
  workflowLine,
} from './pharmacy-gst-reports';
import {
  CellValue,
  PharmacyReport,
  ReportFile,
  ReportFormat,
  ReportRow,
  reportFile,
  section,
} from './pharmacy-report-table';
import {
  PharmacyReportId,
  PharmacyReportQueryDto,
  RecordCashCountDto,
} from './dto/pharmacy-reports.dto';
import {
  clinicDay,
  clinicDayOf,
  clinicDayRange,
  isCalendarDay,
  peopleById,
} from './register-utils';

const SALE_STATUSES = ['CONFIRMED', 'DISPENSED', 'COMPLETED'] as const;
const POSTED = ['POSTED', 'RELEASED'];
const MAX_COUNT = 100_000_000;

export const REPORT_TITLES: Record<PharmacyReportId, string> = {
  'daily-collection': 'Daily Collection',
  'purchase-register': 'Purchase Register',
  'purchase-bills': 'Purchase Bills',
  'sales-register': 'Sales Register',
  'sales-bills': 'Sales Bills',
  'day-wise-summary': 'Day wise Summary',
  'gstr-1': 'GSTR-1',
  'gstr-3b': 'GSTR-3B',
  'gstr-2a': 'GSTR-2A (as per books)',
  'gstr-2b': 'GSTR-2B (as per books)',
  'hsn-wise': 'HSN wise GST',
  composition: 'Composition GST Report',
  'item-margin': 'Item Wise Margin Report',
  'expiring-stock': 'Expiring Stock',
  'doctor-wise-sales': 'Daily Sales Summary – Doctorwise',
};

/** Every figure is computed from these; the reports say so at the bottom of each export. */
const DATA_NOTE =
  'Figures come from posted pharmacy bills, counter sales, customer returns and stock-committed supplier bills. Drafts are excluded. They are only as accurate as the stock and purchase data behind them.';

type Period = { from: string; to: string };

export type DailyCollectionResponse = PharmacyReport & {
  collection: DailyCollection;
  canRecordCount: boolean;
};

@Injectable()
export class PharmacyReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: PharmacyComplianceService,
  ) {}

  private period(query: PharmacyReportQueryDto): Period {
    const from = query.from;
    const to = query.to ?? query.from;
    if (!isCalendarDay(from) || !isCalendarDay(to))
      throw new BadRequestException('Choose real calendar days');
    if (from > to)
      throw new BadRequestException(
        'The start date must be on or before the end date',
      );
    return { from, to };
  }

  private async clinic(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { name: true, gstNumber: true, state: true },
    });
    return {
      name: branch?.name ?? 'Clinic',
      gstin: branch?.gstNumber ?? null,
      state: branch?.state ?? null,
    };
  }

  private async hsnLookup(ids: (string | null | undefined)[]) {
    const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (!wanted.length)
      return new Map<
        string,
        { hsn: string | null; unit: string | null; name: string }
      >();
    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: wanted } },
      select: { id: true, hsnCode: true, unit: true, name: true },
    });
    return new Map(
      items.map((item) => [
        item.id,
        {
          hsn: item.hsnCode?.trim() || null,
          unit: item.unit ?? null,
          name: item.name,
        },
      ]),
    );
  }

  private async workflowDocuments(
    branchId: string,
    kinds: string[],
    period: Period,
  ) {
    const range = clinicDayRange(period.from, period.to);
    const documents = await this.prisma.inventoryWorkflowDocument.findMany({
      where: {
        branchId,
        kind: { in: kinds },
        status: { in: POSTED },
        OR: [
          { createdAt: range },
          { payload: { path: ['date'], gte: period.from, lte: period.to } },
        ],
      },
      select: {
        id: true,
        kind: true,
        reference: true,
        createdAt: true,
        postedAt: true,
        totalAmount: true,
        payload: true,
        supplierId: true,
        supplierGstin: true,
      },
    });
    return documents
      .map((doc) => ({
        ...doc,
        day:
          clinicDayOf((doc.payload as any)?.date) ?? clinicDay(doc.createdAt),
      }))
      .filter((doc) => doc.day >= period.from && doc.day <= period.to);
  }

  private payloadLines(payload: unknown): any[] {
    const lines = (payload as { lines?: unknown } | null)?.lines;
    return Array.isArray(lines) ? lines : [];
  }

  /** Posted pharmacy bills, counter sales and customer returns in the period, with bill numbers cancelled in it. */
  async salesDocuments(
    branchId: string,
    period: Period,
  ): Promise<{ docs: SaleDoc[]; cancelledBillNumbers: string[] }> {
    const range = clinicDayRange(period.from, period.to);
    const [bills, cancelled, workflow] = await Promise.all([
      this.prisma.pharmacyInvoice.findMany({
        where: {
          branchId,
          invoiceDate: range,
          status: { in: [...SALE_STATUSES] },
        },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          createdAt: true,
          billingName: true,
          billingPhone: true,
          patient: { select: { name: true, phone: true } },
          doctor: { select: { firstName: true, lastName: true } },
          items: {
            select: {
              inventoryItemId: true,
              quantity: true,
              unitPrice: true,
              discountAmount: true,
              taxPercent: true,
              taxAmount: true,
              totalAmount: true,
              drug: { select: { name: true } },
              package: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.pharmacyInvoice.findMany({
        where: { branchId, invoiceDate: range, status: 'CANCELLED' },
        select: { invoiceNumber: true },
      }),
      this.workflowDocuments(
        branchId,
        ['COUNTER_SALE', 'SALES_RETURN'],
        period,
      ),
    ]);
    const hsn = await this.hsnLookup([
      ...bills.flatMap((bill) =>
        bill.items.map((item) => item.inventoryItemId),
      ),
      ...workflow.flatMap((doc) =>
        this.payloadLines(doc.payload).map((line) => line?.inventoryId),
      ),
    ]);
    const docs: SaleDoc[] = [
      ...bills.map(
        (bill): SaleDoc => ({
          id: bill.id,
          kind: 'BILL',
          number: bill.invoiceNumber,
          day: clinicDay(bill.invoiceDate),
          entryAt: bill.createdAt.toISOString(),
          customer: bill.billingName?.trim() || bill.patient?.name || null,
          mobile: bill.billingPhone?.trim() || bill.patient?.phone || null,
          doctor: bill.doctor
            ? `${bill.doctor.firstName} ${bill.doctor.lastName}`.trim()
            : null,
          lines: bill.items.map((item) => {
            const known = item.inventoryItemId
              ? hsn.get(item.inventoryItemId)
              : undefined;
            return billLine({
              name:
                item.drug?.name || item.package?.name || known?.name || 'Item',
              hsn: known?.hsn ?? null,
              unit: known?.unit ?? null,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountAmount: item.discountAmount,
              taxPercent: item.taxPercent,
              taxAmount: item.taxAmount,
              totalAmount: item.totalAmount,
            });
          }),
        }),
      ),
      ...workflow.map((doc): SaleDoc => {
        const payload = (doc.payload ?? {}) as Record<string, any>;
        const sign = doc.kind === 'SALES_RETURN' ? -1 : 1;
        return {
          id: doc.id,
          kind: doc.kind === 'SALES_RETURN' ? 'SALES_RETURN' : 'COUNTER_SALE',
          number: doc.reference,
          day: doc.day,
          entryAt: doc.createdAt.toISOString(),
          customer: payload.customerName || null,
          mobile: payload.customerPhone || null,
          doctor: payload.doctorName || payload.doctor || null,
          lines: this.payloadLines(payload).map((line) => {
            const known = line?.inventoryId
              ? hsn.get(line.inventoryId)
              : undefined;
            return signedLine(
              workflowLine({
                name: line?.name || known?.name || 'Item',
                hsn: known?.hsn ?? null,
                unit: line?.unit || known?.unit || null,
                quantity: Number(line?.quantity || 0),
                unitPrice: Number(line?.unitPrice || 0),
                taxable: Number(line?.taxable || 0),
                tax: Number(line?.tax || 0),
                gstRate: Number(line?.gstRate || 0),
              }),
              sign,
            );
          }),
        };
      }),
    ];
    return {
      docs,
      cancelledBillNumbers: cancelled.map((bill) => bill.invoiceNumber),
    };
  }

  /** Stock-committed supplier bills, with posted supplier returns and credit notes as negative documents. */
  async purchaseDocuments(
    branchId: string,
    period: Period,
  ): Promise<PurchaseDoc[]> {
    const range = clinicDayRange(period.from, period.to);
    const [bills, workflow] = await Promise.all([
      this.prisma.pharmacyPurchaseInvoice.findMany({
        where: { branchId, invoiceDate: range, status: 'STOCK_COMMITTED' },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          createdAt: true,
          distributorName: true,
          distributorGstin: true,
          netPayable: true,
          items: {
            select: {
              productName: true,
              hsnCode: true,
              packUnitType: true,
              quantityPurchased: true,
              taxableAmount: true,
              cgstPercent: true,
              sgstPercent: true,
              igstPercent: true,
            },
          },
        },
      }),
      this.workflowDocuments(
        branchId,
        ['SUPPLIER_RETURN', 'CREDIT_NOTE'],
        period,
      ),
    ]);
    const supplierIds = [
      ...new Set(
        workflow
          .map((doc) => doc.supplierId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const [suppliers, hsn] = await Promise.all([
      supplierIds.length
        ? this.prisma.supplier.findMany({
            where: { id: { in: supplierIds } },
            select: { id: true, name: true, gstNumber: true },
          })
        : Promise.resolve(
            [] as { id: string; name: string; gstNumber: string | null }[],
          ),
      this.hsnLookup(
        workflow.flatMap((doc) =>
          this.payloadLines(doc.payload).map((line) => line?.inventoryId),
        ),
      ),
    ]);
    const supplier = new Map(suppliers.map((row) => [row.id, row]));
    return [
      ...bills.map(
        (bill): PurchaseDoc => ({
          id: bill.id,
          kind: 'PURCHASE_BILL',
          number: bill.invoiceNumber,
          day: clinicDay(bill.invoiceDate),
          entryAt: bill.createdAt.toISOString(),
          distributor: bill.distributorName,
          gstin: bill.distributorGstin?.trim().toUpperCase() || null,
          billAmount: money(bill.netPayable),
          lines: bill.items.map(purchaseLine),
        }),
      ),
      ...workflow.map((doc): PurchaseDoc => {
        const payload = (doc.payload ?? {}) as Record<string, any>;
        const party = doc.supplierId ? supplier.get(doc.supplierId) : undefined;
        const lines: ReportLine[] = this.payloadLines(payload).map((line) => {
          const known = line?.inventoryId
            ? hsn.get(line.inventoryId)
            : undefined;
          return signedLine(
            workflowLine({
              name: line?.name || known?.name || 'Item',
              hsn: known?.hsn ?? null,
              unit: line?.unit || known?.unit || null,
              quantity: Number(line?.quantity || 0),
              unitPrice: Number(line?.unitPrice || 0),
              taxable: Number(line?.taxable || 0),
              tax: Number(line?.tax || 0),
              gstRate: Number(line?.gstRate || 0),
            }),
            -1,
          );
        });
        const lineTotal = money(
          lines.reduce((sum, line) => sum + line.total, 0),
        );
        return {
          id: doc.id,
          kind: doc.kind === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'SUPPLIER_RETURN',
          number: payload.creditNoteNumber || doc.reference,
          day: doc.day,
          entryAt: doc.createdAt.toISOString(),
          distributor: party?.name || payload.supplierName || doc.reference,
          gstin:
            (doc.supplierGstin || party?.gstNumber || '')
              .trim()
              .toUpperCase() || null,
          billAmount: lines.length
            ? lineTotal
            : money(-Number(doc.totalAmount.toString())),
          lines,
        };
      }),
    ];
  }

  private envelope(
    id: PharmacyReportId,
    period: Period,
    parts: Partial<PharmacyReport> & Pick<PharmacyReport, 'sections'>,
    search?: string | null,
  ): PharmacyReport {
    return {
      id,
      title: REPORT_TITLES[id],
      period: {
        startDate: period.from,
        endDate: period.to,
        timeZone: CLINIC_TIME_ZONE,
      },
      headline: null,
      tiles: [],
      scope: {
        statuses: [
          'CONFIRMED',
          'DISPENSED',
          'COMPLETED',
          'STOCK_COMMITTED',
          ...POSTED,
        ],
        draftsExcluded: true,
        dateBasis: `Bill date, ${CLINIC_TIME_ZONE} calendar days`,
      },
      search: search?.trim() || null,
      ...parts,
      notes: [...(parts.notes ?? []), DATA_NOTE],
    };
  }

  async report(
    id: PharmacyReportId,
    query: PharmacyReportQueryDto,
    actor: { branchId: string; role?: string },
  ): Promise<PharmacyReport> {
    const period = this.period(query);
    const branchId = actor.branchId;
    switch (id) {
      case 'daily-collection':
        return this.dailyCollection(period.from, actor);
      case 'sales-register': {
        const { docs } = await this.salesDocuments(branchId, period);
        const type =
          query.type === 'RETURNS' || query.type === 'ALL'
            ? query.type
            : 'SALES';
        const result = salesRegister(docs, { type, search: query.q });
        return this.envelope(
          id,
          period,
          {
            headline: { label: 'Total for the period', value: result.total },
            sections: [result.section],
            notes: [
              'Taxable = Gross - Disc.; Total = Taxable + CESS + SGST + CGST + IGST. Customer returns show as negative rows.',
            ],
          },
          query.q,
        );
      }
      case 'sales-bills':
      case 'purchase-bills': {
        const type =
          query.type === 'SALES' || query.type === 'PURCHASE'
            ? query.type
            : id === 'sales-bills'
              ? 'SALES'
              : 'PURCHASE';
        const [sales, purchases] = await Promise.all([
          type === 'SALES'
            ? this.salesDocuments(branchId, period).then(
                (result) => result.docs,
              )
            : Promise.resolve([]),
          type === 'PURCHASE'
            ? this.purchaseDocuments(branchId, period)
            : Promise.resolve([]),
        ]);
        const result = slabBills({
          type,
          gst: query.gst ?? 'ALL',
          sales,
          purchases,
          search: query.q,
        });
        return this.envelope(
          type === 'SALES' ? 'sales-bills' : 'purchase-bills',
          period,
          {
            headline: { label: 'Total for the period', value: result.total },
            sections: [result.section],
            notes: [
              'Each bill is one row; its value falls in the GST slab of each line. The slab list follows the rates in use, with the standard rates always shown. No CESS is recorded on any item, so that band is zero.',
            ],
          },
          query.q,
        );
      }
      case 'purchase-register': {
        const result = purchaseRegister(
          await this.purchaseDocuments(branchId, period),
          query.q,
        );
        return this.envelope(
          id,
          period,
          {
            headline: { label: 'Total for the period', value: result.total },
            sections: [result.section],
            notes: [
              'Supplier returns and credit notes show as negative rows on the day they were posted.',
            ],
          },
          query.q,
        );
      }
      case 'hsn-wise': {
        const type = query.type === 'PURCHASE' ? 'PURCHASE' : 'SALES';
        const lines =
          type === 'SALES'
            ? (await this.salesDocuments(branchId, period)).docs.flatMap(
                (doc) => doc.lines,
              )
            : (await this.purchaseDocuments(branchId, period)).flatMap(
                (doc) => doc.lines,
              );
        const result = hsnSummary(
          lines,
          'hsn',
          type === 'SALES' ? 'HSN wise GST: sales' : 'HSN wise GST: purchases',
        );
        return this.envelope(id, period, {
          headline: {
            label: 'Total value',
            value: Number(result.section.totals!.value),
          },
          sections: [result.section],
          notes: result.missingHsnGroups
            ? [
                `${result.missingHsnGroups} row(s) have no HSN code on the inventory item. Add the HSN in Inventory before filing.`,
              ]
            : [],
        });
      }
      case 'gstr-1': {
        const [{ docs, cancelledBillNumbers }, clinic] = await Promise.all([
          this.salesDocuments(branchId, period),
          this.clinic(branchId),
        ]);
        const result = gstr1({
          sales: docs,
          cancelledBillNumbers,
          place: placeOfSupply(clinic.gstin, clinic.state),
        });
        return this.envelope(id, period, {
          headline: { label: 'Invoice value', value: result.total },
          tiles: result.tiles,
          sections: result.sections,
          notes: [
            'Pharmacy bills do not record a buyer GSTIN, so every sale is reported as B2C (Table 7) at the clinic’s place of supply, net of customer returns. B2B (Table 4) is empty.',
            ...(result.missingHsnGroups
              ? [`${result.missingHsnGroups} HSN row(s) have no HSN code.`]
              : []),
          ],
        });
      }
      case 'gstr-3b': {
        const [{ docs }, purchases] = await Promise.all([
          this.salesDocuments(branchId, period),
          this.purchaseDocuments(branchId, period),
        ]);
        const result = gstr3b({ sales: docs, purchases });
        return this.envelope(id, period, {
          headline: null,
          tiles: result.tiles,
          sections: result.sections,
          notes: [
            'Credit is set off as rule 88A requires: IGST credit first, against IGST and then CGST and SGST; then CGST and SGST credit against their own head and then IGST. CGST credit is never used for SGST. Within those rules the split keeps the tax paid in cash as low as possible.',
            'ITC is taken from the clinic’s books. Claim only what appears in the GST portal’s GSTR-2B for the month.',
          ],
        });
      }
      case 'gstr-2a':
      case 'gstr-2b': {
        const purchases = await this.purchaseDocuments(branchId, period);
        const result = id === 'gstr-2a' ? gstr2a(purchases) : gstr2b(purchases);
        return this.envelope(id, period, {
          sections: result.sections,
          notes: [
            `GSTR-2A and GSTR-2B are prepared by the GST portal from what suppliers file. This is the clinic’s side, from its own supplier bills, laid out the same way so the accountant can match it line by line against the portal download.`,
          ],
        });
      }
      case 'composition': {
        const rate = query.rate ?? 1;
        const { docs } = await this.salesDocuments(branchId, period);
        const result = compositionReport({ sales: docs, ratePercent: rate });
        return this.envelope(id, period, {
          headline: { label: 'Composition tax', value: result.total },
          sections: [result.section],
          notes: [
            `Applies only if the pharmacy is registered under the composition scheme (CMP-08, ${rate}% of turnover for a trader). A regular GSTIN files GSTR-1 and GSTR-3B instead.`,
          ],
        });
      }
      case 'doctor-wise-sales': {
        const { docs } = await this.salesDocuments(branchId, period);
        const result = doctorWiseSales(salesOfType(docs, 'ALL'));
        return this.envelope(id, period, {
          headline: { label: 'Total sales', value: result.total },
          sections: [result.section],
          notes: [
            'Pharmacy bills carry the prescribing doctor; counter sales carry the doctor typed on them. Returns net off against the doctor of the return.',
          ],
        });
      }
      case 'day-wise-summary':
        return this.dayWise(period, query, branchId);
      case 'item-margin':
        return this.itemMargin(period, query, branchId);
      case 'expiring-stock':
        return this.expiringStock(period, query, branchId);
    }
  }

  private async dayWise(
    period: Period,
    query: PharmacyReportQueryDto,
    branchId: string,
  ): Promise<PharmacyReport> {
    const type = query.type === 'PURCHASE' ? 'PURCHASE' : 'SALES';
    const data: any = await this.compliance.getDayWiseSummary(
      { startDate: period.from, endDate: period.to, type } as any,
      branchId,
    );
    const columns = [
      { key: 'date', label: 'Bill Date', kind: 'date' as const, frozen: true },
      { key: 'bills', label: 'Bill No.', kind: 'text' as const, frozen: true },
      { key: 'count', label: 'Bills', kind: 'number' as const, frozen: true },
      ...slabBandColumns(data.columns),
    ];
    const cells = (slabs: any[], total: any, amount: number) => {
      const out: Record<string, CellValue> = {
        'cess.taxable': 0,
        'cess.sgst': 0,
        'cess.cgst': 0,
        'cess.igst': 0,
      };
      for (const slab of slabs) {
        out[`r${slab.slabPercent}.taxable`] = slab.taxableAmount;
        out[`r${slab.slabPercent}.sgst`] = slab.sgst;
        out[`r${slab.slabPercent}.cgst`] = slab.cgst;
        out[`r${slab.slabPercent}.igst`] = slab.igst;
      }
      return {
        ...out,
        'total.taxable': total.taxableAmount,
        'total.sgst': total.sgst,
        'total.cgst': total.cgst,
        'total.igst': total.igst,
        'total.amount': amount,
      };
    };
    const billText = (row: any) => {
      if (row.noBills) return 'No bills';
      const ranges = row.bills.ranges.map((r: any) =>
        r.from === r.to ? `${r.from}` : `${r.from} - ${r.to}`,
      );
      const gap = row.bills.missingCount
        ? `gap: ${row.bills.missing.map((m: any) => m.invoiceNumber).join(', ')}`
        : '';
      const other = row.bills.otherReferences.length
        ? `+${row.bills.otherReferences.length} other`
        : '';
      return [[...ranges, ...row.bills.numbers].join(', '), gap, other]
        .filter(Boolean)
        .join(' · ');
    };
    const rows: ReportRow[] = data.rows.map((row: any) => ({
      key: row.date,
      tone: row.noBills
        ? 'muted'
        : row.bills.missingCount
          ? 'warning'
          : undefined,
      cells: {
        date: row.date,
        bills: billText(row),
        count: row.bills.billCount,
        ...cells(row.slabs, row.total, row.amount),
      },
    }));
    return this.envelope('day-wise-summary', period, {
      headline: { label: 'Total for the range', value: data.totals.amount },
      sections: [
        section({
          id: 'day-wise',
          title: `Day wise Summary: ${type === 'SALES' ? 'sales' : 'purchases'}`,
          columns,
          rows,
        }),
      ],
      notes: [
        'Days with no bills show as zero rows, so a missed day looks different from a closed one.',
      ],
    });
  }

  private async itemMargin(
    period: Period,
    query: PharmacyReportQueryDto,
    branchId: string,
  ): Promise<PharmacyReport> {
    const data: any = await this.compliance.getItemMargin(
      {
        startDate: period.from,
        endDate: period.to,
        search: query.q,
        type: query.marginType,
        searchField: query.field,
        tag: query.tag,
        category: query.category,
        manufacturer: query.manufacturer,
        itemType: query.itemType,
        costStatus: query.cost,
      },
      branchId,
    );
    const columns = [
      { key: 'name', label: 'Item Name', kind: 'text' as const, frozen: true },
      { key: 'category', label: 'Category', kind: 'text' as const },
      { key: 'unit', label: 'Unit', kind: 'text' as const },
      { key: 'manufacturer', label: 'Manufacturer', kind: 'text' as const },
      { key: 'qty', label: 'Sale (qty)', kind: 'number' as const },
      { key: 'stock', label: 'Stock', kind: 'number' as const, total: false },
      { key: 'mrp', label: 'MRP', kind: 'money' as const, total: false },
      { key: 'sales', label: 'Sales Amt.', kind: 'money' as const },
      { key: 'purchase', label: 'Purchase', kind: 'money' as const },
      { key: 'netGst', label: 'Net GST', kind: 'money' as const },
      { key: 'profit', label: 'Profit', kind: 'money' as const },
      { key: 'percent', label: 'Profit %', kind: 'percent' as const },
    ];
    const rows: ReportRow[] = [...data.rows]
      .sort(
        (a: any, b: any) =>
          (b.profitPercent ?? -Infinity) - (a.profitPercent ?? -Infinity),
      )
      .map((row: any) => ({
        key: row.key,
        tone: row.unknownCost.lineCount ? 'warning' : undefined,
        cells: {
          name: row.name,
          category: row.category,
          unit: row.unitLabel,
          manufacturer: row.manufacturer,
          qty: row.saleQuantity,
          stock: row.stock,
          mrp: row.mrp,
          sales: row.salesAmount,
          purchase: row.purchase,
          netGst: row.netGst,
          profit: row.profit,
          percent: row.profitPercent,
        },
      }));
    const totals = {
      ...section({ id: 'x', title: '', columns, rows }).totals!,
      sales: data.totals.salesAmount,
      purchase: data.totals.purchase,
      netGst: data.totals.netGst,
      profit: data.totals.profit,
      percent: data.totals.profitPercent,
    };
    return this.envelope(
      'item-margin',
      period,
      {
        tiles: [
          {
            label: 'Total Sale Amount',
            value: data.totals.salesAmount,
            kind: 'money',
          },
          {
            label: 'Total Purchase',
            value: data.totals.purchase,
            kind: 'money',
          },
          { label: 'Total Net GST', value: data.totals.netGst, kind: 'money' },
          { label: 'Total Profit', value: data.totals.profit, kind: 'money' },
        ],
        sections: [
          section({
            id: 'margin',
            title: 'Item Wise Margin',
            columns,
            rows,
            totals,
          }),
        ],
        notes: [
          'Profit = Sales Amt. - Purchase - Net GST. Purchase is the recorded cost of the units sold, including the GST paid on them. Rows without a recorded cost are left out of the totals.',
        ],
      },
      query.q,
    );
  }

  private async expiringStock(
    period: Period,
    query: PharmacyReportQueryDto,
    branchId: string,
  ): Promise<PharmacyReport> {
    const window = query.window ?? '3m';
    const data: any = await this.compliance.getExpiryReturns(
      window as any,
      branchId,
    );
    const columns = [
      { key: 'name', label: 'Item Name', kind: 'text' as const, frozen: true },
      { key: 'batch', label: 'Batch', kind: 'text' as const },
      { key: 'expiry', label: 'Expiry', kind: 'date' as const },
      { key: 'supplier', label: 'Supplier', kind: 'text' as const },
      { key: 'stock', label: 'Stock', kind: 'number' as const },
      { key: 'cost', label: 'Value at cost', kind: 'money' as const },
      { key: 'mrp', label: 'Value at MRP', kind: 'money' as const },
      { key: 'action', label: 'Action', kind: 'text' as const },
    ];
    const rows: ReportRow[] = data.batches.map((batch: any) => ({
      key: batch.inventoryId,
      tone:
        batch.suggestedAction === 'QUARANTINE_EXPIRED_STOCK'
          ? 'warning'
          : undefined,
      cells: {
        name: batch.name,
        batch: batch.batchNumber,
        expiry: batch.expiryDate
          ? new Date(batch.expiryDate).toISOString().slice(0, 10)
          : null,
        supplier: batch.supplier,
        stock: batch.currentStock,
        cost: batch.valueAtCost,
        mrp: batch.valueAtMrp,
        action:
          batch.suggestedAction === 'QUARANTINE_EXPIRED_STOCK'
            ? 'Expired: quarantine'
            : 'Return to distributor or move to expiry bin',
      },
    }));
    return this.envelope('expiring-stock', period, {
      headline: { label: 'Value at cost', value: data.totals.valueAtCost },
      sections: [
        section({
          id: 'expiring',
          title:
            window === 'expired'
              ? 'Expired stock'
              : `Expiring within ${window.replace('m', ' month(s)')}`,
          columns,
          rows,
          emptyText: 'No batches with stock in this window.',
        }),
      ],
      notes: [
        'Current stock, as of today; the date range does not apply to this report.',
      ],
    });
  }

  // ---- daily collection ----------------------------------------------------------------------------

  private async collectionInputs(branchId: string, day: string) {
    const range = clinicDayRange(day, day);
    const [bills, workflow, counts] = await Promise.all([
      this.prisma.pharmacyInvoice.findMany({
        where: {
          branchId,
          OR: [
            { invoiceDate: range, status: { in: [...SALE_STATUSES] } },
            { payments: { some: { status: 'COMPLETED', paymentDate: range } } },
          ],
        },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          createdAt: true,
          status: true,
          totalAmount: true,
          billingName: true,
          patient: { select: { name: true } },
          payments: {
            where: { status: 'COMPLETED' },
            select: { method: true, amount: true, paymentDate: true },
          },
        },
      }),
      this.workflowDocuments(branchId, ['COUNTER_SALE', 'SALES_RETURN'], {
        from: day,
        to: day,
      }),
      this.prisma.pharmacyCashCount.findMany({
        where: { branchId, day },
        orderBy: { sequence: 'desc' },
      }),
    ]);
    const people = await peopleById(
      this.prisma,
      counts.map((count) => count.countedById),
    );
    const state = (status: string): CollectionBill['state'] =>
      (SALE_STATUSES as readonly string[]).includes(status)
        ? 'FINAL'
        : status === 'CANCELLED'
          ? 'CANCELLED'
          : 'DRAFT';
    const collectionBills: CollectionBill[] = bills.map((bill) => ({
      id: bill.id,
      number: bill.invoiceNumber,
      day: clinicDay(bill.invoiceDate),
      entryAt: bill.createdAt.toISOString(),
      state: state(bill.status),
      customer: bill.billingName?.trim() || bill.patient?.name || null,
      total: money(bill.totalAmount),
      payments: bill.payments.map((payment) => ({
        mode: payment.method,
        amount: money(payment.amount),
        day: clinicDay(payment.paymentDate),
      })),
    }));
    const counterSales: CollectionCounterSale[] = workflow
      .filter((doc) => doc.kind === 'COUNTER_SALE')
      .map((doc) => ({
        id: doc.id,
        number: doc.reference,
        day: doc.day,
        entryAt: doc.createdAt.toISOString(),
        customer: (doc.payload as any)?.customerName || null,
        total: money(Number(doc.totalAmount.toString())),
        mode: String((doc.payload as any)?.paymentMode || 'CASH'),
      }));
    const returns: CollectionReturn[] = workflow
      .filter((doc) => doc.kind === 'SALES_RETURN')
      .map((doc) => ({
        id: doc.id,
        number: doc.reference,
        day: doc.day,
        entryAt: doc.createdAt.toISOString(),
        customer: (doc.payload as any)?.customerName || null,
        total: money(Number(doc.totalAmount.toString())),
        refundMode: String((doc.payload as any)?.refundMode || 'CREDIT'),
      }));
    const history: CashCount[] = counts.map((count) => ({
      id: count.id,
      sequence: count.sequence,
      counted: (count.counted ?? {}) as Partial<Record<CollectionMode, number>>,
      note: count.note,
      countedBy: people.get(count.countedById) ?? null,
      countedAt: count.createdAt.toISOString(),
    }));
    return { bills: collectionBills, counterSales, returns, history };
  }

  async dailyCollection(
    day: string,
    actor: { branchId: string; role?: string },
  ): Promise<DailyCollectionResponse> {
    if (!isCalendarDay(day))
      throw new BadRequestException('Choose a real calendar day');
    const inputs = await this.collectionInputs(actor.branchId, day);
    const collection = buildDailyCollection({ day, ...inputs });
    const { sections, tiles } = dailyCollectionSections(collection, inputs);
    const report = this.envelope(
      'daily-collection',
      { from: day, to: day },
      {
        headline: {
          label: 'Expected in hand',
          value: collection.expectedTotal,
        },
        tiles,
        sections,
        notes: [
          'Billed is bills dated this day. Received is payments dated this day, whichever day their bill is from. Refunds as store credit move no money.',
          collection.outsideBills.count
            ? `${collection.outsideBills.count} payment(s) of ${collection.outsideBills.amount.toFixed(2)} were received on bills that are not final (draft or cancelled); they are counted in the mode where the money came in.`
            : '',
        ].filter(Boolean),
      },
    );
    return {
      ...report,
      collection,
      canRecordCount: COUNT_ROLES.includes(actor.role ?? ''),
    };
  }

  /**
   * @cc [owner:nareshshah139,label:product] cash-count-append-only
   * A cash count MUST be appended with the next sequence after the count the user was looking at;
   * a stale basis or a racing recount MUST be refused with the latest count, never overwritten.
   */
  async recordCount(
    day: string,
    dto: RecordCashCountDto,
    actor: { branchId: string; id: string; role?: string },
    now = new Date(),
  ) {
    if (!isCalendarDay(day))
      throw new BadRequestException('Choose a real calendar day');
    if (day > clinicDay(now))
      throw new BadRequestException(
        'A day can only be counted once it has started',
      );
    const counted: Partial<Record<CollectionMode, number>> = {};
    for (const [key, raw] of Object.entries(dto.counted ?? {})) {
      const mode = key.trim().toUpperCase();
      if (!(COLLECTION_MODES as readonly string[]).includes(mode))
        throw new BadRequestException(`Unknown payment mode ${key}`);
      if (raw === null || raw === undefined || raw === '') continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > MAX_COUNT)
        throw new BadRequestException(
          `Enter the ${mode.toLowerCase()} counted as an amount of zero or more`,
        );
      counted[mode as CollectionMode] = money(value);
    }
    if (!Object.keys(counted).length)
      throw new BadRequestException('Enter at least one counted amount');
    const latest = await this.prisma.pharmacyCashCount.findFirst({
      where: { branchId: actor.branchId, day },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    const current = latest?.sequence ?? 0;
    if (current !== dto.basedOnSequence) throw this.staleCount(current);
    try {
      await this.prisma.pharmacyCashCount.create({
        data: {
          branchId: actor.branchId,
          day,
          sequence: dto.basedOnSequence + 1,
          counted,
          note: dto.note || null,
          countedById: actor.id,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw this.staleCount(dto.basedOnSequence + 1);
      throw error;
    }
    return this.dailyCollection(day, actor);
  }

  private staleCount(sequence: number) {
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: 'CASH_COUNT_CHANGED',
      latestSequence: sequence,
      message:
        'Someone else saved a count for this day while you were entering yours. Their count is now shown; check it and save again if yours differs.',
    });
  }

  async file(
    id: PharmacyReportId,
    query: PharmacyReportQueryDto,
    actor: { branchId: string; role?: string },
    format: ReportFormat,
  ): Promise<ReportFile> {
    const [report, clinic] = await Promise.all([
      this.report(id, query, actor),
      this.clinic(actor.branchId),
    ]);
    return reportFile(report, format, clinic.name);
  }
}

/** Roles that may record what was counted; anyone who can read the report can see the counts. */
export const COUNT_ROLES = [
  'OWNER',
  'ADMIN',
  'MANAGER',
  'DOCTOR',
  'PHARMACIST',
];
