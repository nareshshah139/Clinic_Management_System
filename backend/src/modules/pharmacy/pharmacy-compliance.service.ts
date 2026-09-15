import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { jsonObject, movementDelta } from '../inventory/inventory-stock';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  ApplyPharmacyAuditAdjustmentsDto,
  CreatePharmacyAuditDto,
  ExpiryReturnWindowDto,
  PharmacyGstSummaryQueryDto,
  PharmacyMonthlyReportQueryDto,
} from './dto/pharmacy-compliance.dto';

type GstSlab = {
  slabPercent: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  grossAmount: number;
};

@Injectable()
export class PharmacyComplianceService {
  private readonly auditStatusPrefix = 'AUDIT_SESSION';

  constructor(private prisma: PrismaService) {}

  /**
   * @cc [owner:nareshshah139,label:product;target] inventory-reports-posted-scope
   * Posted GST and financial reports MUST exclude unposted drafts and identify the document
   * statuses, date range and branch used; exports MUST reconcile with the same eligible records.
   * Acceptance: INV-42. Validation and open gaps:
   * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
   */
  async getGstSummary(
    query: PharmacyGstSummaryQueryDto,
    branchId: string,
  ) {
    const { start, end } = this.dateRange(query.startDate, query.endDate);
    const [purchaseInvoices, salesInvoices] = await Promise.all([
      (this.prisma as any).pharmacyPurchaseInvoice.findMany({
        where: {
          branchId,
          invoiceDate: { gte: start, lte: end },
          status: 'STOCK_COMMITTED',
        },
        include: { items: true },
      }),
      (this.prisma as any).pharmacyInvoice.findMany({
        where: {
          branchId,
          invoiceDate: { gte: start, lte: end },
          status: { in: ['CONFIRMED', 'DISPENSED', 'COMPLETED'] },
        },
        include: { items: true },
      }),
    ]);

    const workflowRows=await this.workflowReportRows(branchId,start,end);purchaseInvoices.push(...workflowRows.purchases);salesInvoices.push(...workflowRows.sales);
    const purchaseSlabs = new Map<number, GstSlab>();
    for (const invoice of purchaseInvoices) {
      for (const item of invoice.items || []) {
        const slabPercent = this.money(
          (Number(item.cgstPercent) || 0) +
            (Number(item.sgstPercent) || 0) +
            (Number(item.igstPercent) || 0),
        );
        this.addSlab(purchaseSlabs, slabPercent, {
          taxableAmount: item.taxableAmount,
          cgst: this.percentAmount(item.taxableAmount, item.cgstPercent),
          sgst: this.percentAmount(item.taxableAmount, item.sgstPercent),
          igst: this.percentAmount(item.taxableAmount, item.igstPercent),
          totalGst: item.gstAmount,
          grossAmount: item.lineTotal,
        });
      }
    }

    const salesSlabs = new Map<number, GstSlab>();
    for (const invoice of salesInvoices) {
      for (const item of invoice.items || []) {
        const taxableAmount = this.money(
          Number(item.totalAmount || 0) - Number(item.taxAmount || 0),
        );
        const totalGst = this.money(item.taxAmount);
        const localTax = this.money(totalGst / 2);
        this.addSlab(salesSlabs, this.money(item.taxPercent), {
          taxableAmount,
          cgst: localTax,
          sgst: this.money(totalGst-localTax),
          igst: 0,
          totalGst,
          grossAmount: item.totalAmount,
        });
      }
    }

    const purchaseInputGst = this.sumSlabs(purchaseSlabs).totalGst;
    const salesOutputGst = this.sumSlabs(salesSlabs).totalGst;

    return {
      scope: {branchId,statuses:['STOCK_COMMITTED','CONFIRMED','DISPENSED','COMPLETED','POSTED','RELEASED'],draftsExcluded:true,dateBasis:'Saved document date; inclusive UTC period',startDate:start.toISOString(),endDate:end.toISOString()},
      records:this.reportRecords(purchaseInvoices,salesInvoices),
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      purchaseInputGst,
      salesOutputGst,
      netPayable: this.money(salesOutputGst - purchaseInputGst),
      purchases: {
        invoiceCount: purchaseInvoices.length,
        ...this.sumSlabs(purchaseSlabs),
        slabs: this.sortedSlabs(purchaseSlabs),
      },
      sales: {
        invoiceCount: salesInvoices.length,
        ...this.sumSlabs(salesSlabs),
        slabs: this.sortedSlabs(salesSlabs),
      },
    };
  }

  private async workflowReportRows(branchId:string,start:Date,end:Date){
    const db=this.prisma as any;if(!db.inventoryWorkflowDocument)return {purchases:[],sales:[]};
    const documents=await db.inventoryWorkflowDocument.findMany({where:{branchId,status:{in:['POSTED','RELEASED']},kind:{in:['COUNTER_SALE','SALES_RETURN','SUPPLIER_RETURN','CREDIT_NOTE']}}});
    const purchases:any[]=[],sales:any[]=[];
    for(const doc of documents){const p=doc.payload;const date=new Date(p.date);if(date<start||date>end)continue;const sign=['SALES_RETURN','SUPPLIER_RETURN','CREDIT_NOTE'].includes(doc.kind)?-1:1;
      const items=p.lines.map((l:any)=>({taxableAmount:sign*l.taxable,cgstPercent:l.gstRate/2,sgstPercent:l.gstRate/2,igstPercent:0,gstAmount:sign*l.tax,lineTotal:sign*l.total,totalAmount:sign*l.total,taxAmount:sign*l.tax,taxPercent:l.gstRate,quantity:sign*l.quantity,freeQuantity:sign*(l.freeQuantity||0),productName:l.name,batchNumber:l.batchNumber,packUnitType:l.unit,unitPrice:l.unitPrice,discountPercent:l.discountPercent,schemeAmount:l.schemeAmount}));
      const total=items.reduce((n:number,l:any)=>n+l.totalAmount,0),tax=items.reduce((n:number,l:any)=>n+l.taxAmount,0);
      const record={id:doc.id,kind:doc.kind,status:doc.status,sourceType:'workflow',invoiceNumber:doc.reference,invoiceDate:date,distributorName:doc.reference,distributorGstin:doc.supplierGstin,totalAmount:total,taxAmount:tax,netPayable:total,taxableAmount:total-tax,totalGst:tax,items};
      (['COUNTER_SALE','SALES_RETURN'].includes(doc.kind)?sales:purchases).push(record);
    }return {purchases,sales};
  }

  /**
   * @cc [owner:nareshshah139,label:product] compliance-export-same-records
   * Report drilldown/export records MUST be derived from the exact eligible invoice collections
   * used by report totals, retaining source kind, units, tax and posted status without a page cap.
   */
  private reportRecords(purchases:any[],sales:any[]) {
    return [...purchases.map(row=>({row,type:'purchase'})),...sales.map(row=>({row,type:'sale'}))].map(({row,type})=>{
      const sourceType=row.sourceType||type,kind=row.kind||(type==='purchase'?'PURCHASE_INVOICE':'PHARMACY_INVOICE');
      return {id:row.id,sourceType,kind,invoiceNumber:row.invoiceNumber,status:row.status,invoiceDate:row.invoiceDate,party:type==='purchase'?row.distributorName:undefined,supplierGstin:row.distributorGstin||null,
        taxableAmount:this.money(type==='purchase'?row.taxableAmount:Number(row.totalAmount||0)-Number(row.taxAmount||0)),gstAmount:this.money(type==='purchase'?row.totalGst:row.taxAmount),totalAmount:this.money(type==='purchase'?row.netPayable:row.totalAmount),
        lines:(row.items||[]).map((l:any)=>({id:l.id,lineNumber:l.lineNumber,product:l.productName||l.itemName||l.name||l.drugName||'',batch:l.batchNumber||'',unit:l.packUnitType||l.unit||'Not recorded',pack:l.packSize||null,paidQuantity:l.quantityPurchased??l.quantity??0,freeQuantity:l.freeQuantity||0,MRP:l.mrp??null,PTR:l.purchaseRate??l.unitPrice??null,discountPercent:l.discountPercent||0,schemeAmount:l.schemeAmount||0,taxableAmount:this.money(l.taxableAmount??Number(l.totalAmount||0)-Number(l.taxAmount||0)),gstAmount:this.money(l.gstAmount??l.taxAmount??0),totalAmount:this.money(l.lineTotal??l.totalAmount??0)}))};
    });
  }

  /**
   * @cc [owner:nareshshah139,label:product] historical-movement-cost
   * Profit reports MUST use recorded movement costs and signed reversals/accepted returns.
   * Changing current batch cost cannot reprice history; unavailable historical costs are counted
   * as unknown and excluded from known-cost totals, never silently taken from today's batch.
   */
  async getMonthlyReport(
    query: PharmacyMonthlyReportQueryDto,
    branchId: string,
  ) {
    const { start, end } = this.monthRange(query.month);
    const [
      purchaseInvoices,
      salesInvoices,
      inventoryItems,
      stockTransactions,
      writeOffAdjustments,
    ] = await Promise.all([
      (this.prisma as any).pharmacyPurchaseInvoice.findMany({
        where: {
          branchId,
          invoiceDate: { gte: start, lte: end },
          status: 'STOCK_COMMITTED',
        },
        include: { items: true },
      }),
      (this.prisma as any).pharmacyInvoice.findMany({
        where: {
          branchId,
          invoiceDate: { gte: start, lte: end },
          status: { in: ['CONFIRMED', 'DISPENSED', 'COMPLETED'] },
        },
        include: { items: true },
      }),
      (this.prisma as any).inventoryItem.findMany({ where: { branchId } }),
      (this.prisma as any).stockTransaction.findMany({
        where: {
          branchId,
          createdAt: { gte: start, lte: end },
        },
        include: { item: true },
      }),
      (this.prisma as any).stockAdjustment.findMany({
        where: {
          branchId,
          createdAt: { gte: start, lte: end },
          type: { in: ['EXPIRY', 'DAMAGE'] },
        },
        include: { item: true },
      }),
    ]);

    const workflowRows=await this.workflowReportRows(branchId,start,end);purchaseInvoices.push(...workflowRows.purchases);salesInvoices.push(...workflowRows.sales);
    const procurementTotal = this.money(
      purchaseInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.netPayable || 0), 0),
    );
    const purchaseTaxable = this.money(
      purchaseInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.taxableAmount || 0), 0),
    );
    const salesTotal = this.money(
      salesInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.totalAmount || 0), 0),
    );
    const salesTax = this.money(
      salesInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.taxAmount || 0), 0),
    );
    const salesBeforeTax = this.money(salesTotal - salesTax);
    const saleStockTransactions = stockTransactions.filter((tx:any)=>['SALE','SALE_RETURN'].includes(jsonObject(tx.notes).accountingCategory) || tx.type === 'SALE');
    const writeOffTransactions = stockTransactions.filter((tx:any)=>jsonObject(tx.notes).accountingCategory === 'LOSS' || ['EXPIRED','DAMAGED'].includes(tx.type));
    const unknownCostMovements = [...saleStockTransactions,...writeOffTransactions].filter((tx:any)=>!Number.isFinite(jsonObject(tx.notes).costPerStockUnit));
    const movementCost = (tx:any) => {
      const cost = jsonObject(tx.notes).costPerStockUnit;
      return Number.isFinite(cost) ? -(movementDelta(tx)||0)*cost : 0;
    };
    const estimatedCogs = this.money(saleStockTransactions.reduce((sum:number,tx:any)=>sum+movementCost(tx),0));
    const stockValueAtCost = this.money(
      inventoryItems.reduce(
        (sum: number, item: any) => sum + Number(item.currentStock || 0) * Number(item.costPrice || 0),
        0,
      ),
    );
    const stockValueAtMrp = this.money(
      inventoryItems.reduce(
        (sum: number, item: any) =>
          sum +
          Number(item.currentStock || 0) *
            Number(item.mrp ?? item.sellingPrice ?? item.costPrice ?? 0),
        0,
      ),
    );
    const writeOffValue = this.money(
      writeOffTransactions.reduce(
        (sum: number, tx: any) => sum + movementCost(tx),
        0,
      ) +
        writeOffAdjustments.reduce(
          (sum: number, adj: any) =>
            sum +
            Math.abs(Number(adj.quantity || 0)) *
              (Number.isFinite(jsonObject(adj.metadata).costPerStockUnit) ? jsonObject(adj.metadata).costPerStockUnit : 0),
          0,
        ),
    );

    return {
      scope: {branchId,statuses:['STOCK_COMMITTED','CONFIRMED','DISPENSED','COMPLETED','POSTED','RELEASED'],draftsExcluded:true,dateBasis:'Saved document date; inclusive UTC period',startDate:start.toISOString(),endDate:end.toISOString()},
      records:this.reportRecords(purchaseInvoices,salesInvoices),
      month: query.month,
      period: { startDate: start.toISOString(), endDate: end.toISOString() },
      procurement: {
        invoiceCount: purchaseInvoices.length,
        lineCount: purchaseInvoices.reduce(
          (sum: number, invoice: any) => sum + (invoice.items?.length || 0),
          0,
        ),
        taxableAmount: purchaseTaxable,
        gstAmount: this.money(
          purchaseInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.totalGst || 0), 0),
        ),
        netPayable: procurementTotal,
      },
      sales: {
        invoiceCount: salesInvoices.length,
        lineCount: salesInvoices.reduce(
          (sum: number, invoice: any) => sum + (invoice.items?.length || 0),
          0,
        ),
        beforeTax: salesBeforeTax,
        gstAmount: salesTax,
        totalAmount: salesTotal,
      },
      profitAndLoss: {
        costBasis: 'Recorded movement cost per stock unit; missing historical costs excluded',
        unknownCostMovementCount: unknownCostMovements.length,
        unknownCostAdjustmentCount: writeOffAdjustments.filter((a:any)=>!Number.isFinite(jsonObject(a.metadata).costPerStockUnit)).length,
        revenue: salesBeforeTax,
        estimatedCogs,
        grossProfit: this.money(salesBeforeTax - estimatedCogs),
        grossMarginPercent:
          salesBeforeTax > 0
            ? this.money(((salesBeforeTax - estimatedCogs) / salesBeforeTax) * 100)
            : 0,
        expiredDamagedWriteOff: writeOffValue,
        netAfterWriteOff: this.money(salesBeforeTax - estimatedCogs - writeOffValue),
      },
      stockValue: {
        asOf:new Date().toISOString(),basis:'Current physical stock snapshot; not a historical month-end valuation',
        itemCount: inventoryItems.length,
        atCost: stockValueAtCost,
        atMrp: stockValueAtMrp,
      },
      writeOffs: {
        transactionCount: writeOffTransactions.length,
        adjustmentCount: writeOffAdjustments.length,
        valueAtCost: writeOffValue,
      },
      distributorPerformance: this.distributorPerformance(purchaseInvoices),
    };
  }


  async getExpiryReturns(window: ExpiryReturnWindowDto, branchId: string) {
    const now = new Date(), start = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())), upper = new Date(start);
    const months=({'1m':1,'2m':2,'3m':3,'6m':6,expired:0} as Record<string,number>)[window];
    if(months===undefined)throw new BadRequestException('Choose expired, 1, 2, 3 or 6 months');
    const day=upper.getUTCDate();upper.setUTCDate(1);upper.setUTCMonth(upper.getUTCMonth()+months);upper.setUTCDate(Math.min(day,new Date(Date.UTC(upper.getUTCFullYear(),upper.getUTCMonth()+1,0)).getUTCDate()));upper.setUTCHours(23,59,59,999);
    const expiryFilter = window === ExpiryReturnWindowDto.EXPIRED ? { lt: start } : { gte: start, lte: upper };

    const items: any[] = await (this.prisma as any).inventoryItem.findMany({
      where: {
        branchId,
        currentStock: { gt: 0 },
        expiryDate: expiryFilter,
      },
      orderBy: [{expiryDate:'asc'},{id:'asc'}],
    });

    return {
      window,
      scope:{branchId,expiryStart:start.toISOString(),expiryEnd:upper.toISOString(),expiryBoundary:'Valid through the entire UTC expiry day; clamped inclusive calendar-month window'},
      generatedAt: new Date().toISOString(),
      totals: {
        batchCount: items.length,
        stockQuantity: items.reduce((sum: number, item: any) => sum + Number(item.currentStock || 0), 0),
        valueAtCost: this.money(
          items.reduce(
            (sum: number, item: any) => sum + Number(item.currentStock || 0) * Number(item.costPrice || 0),
            0,
          ),
        ),
        valueAtMrp: this.money(
          items.reduce(
            (sum: number, item: any) =>
              sum +
              Number(item.currentStock || 0) *
                Number(item.mrp ?? item.sellingPrice ?? item.costPrice ?? 0),
            0,
          ),
        ),
      },
      batches: items.map((item: any) => ({
        inventoryId: item.id,
        name: item.name,
        batchNumber: item.batchNumber,
        manufacturer: item.manufacturer,
        supplier: item.supplier,
        expiryDate: item.expiryDate,
        currentStock: item.currentStock,unit:item.unit,packSize:item.packSize,packUnit:item.packUnit,location:item.storageLocation,heldStock:item.heldStock,available:item.currentStock-item.heldStock,
        valueAtCost: this.money(Number(item.currentStock || 0) * Number(item.costPrice || 0)),
        valueAtMrp: this.money(
          Number(item.currentStock || 0) *
            Number(item.mrp ?? item.sellingPrice ?? item.costPrice ?? 0),
        ),
        suggestedAction:
          item.expiryDate && new Date(item.expiryDate) < start
            ? 'QUARANTINE_EXPIRED_STOCK'
            : 'RETURN_TO_DISTRIBUTOR_OR_MOVE_TO_EXPIRY_BIN',
      })),
    };
  }

  async createAuditBatch(
    dto: CreatePharmacyAuditDto,
    branchId: string,
    userId: string,
  ) {
    const where: any = { branchId };
    if (dto.inventoryIds?.length) where.id = { in: dto.inventoryIds };
    if (dto.category) where.category = { equals: dto.category, mode: 'insensitive' };
    if (dto.manufacturer) {
      where.manufacturer = { contains: dto.manufacturer, mode: 'insensitive' };
    }
    if (dto.expiryFrom || dto.expiryTo) {
      where.expiryDate = {};
      if (dto.expiryFrom) where.expiryDate.gte = new Date(dto.expiryFrom);
      if (dto.expiryTo) where.expiryDate.lte = this.endOfDay(new Date(dto.expiryTo));
    }

    const items: any[] = await (this.prisma as any).inventoryItem.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 500,
    });

    if (items.length === 0) {
      throw new NotFoundException('No inventory items matched audit selection');
    }

    const auditId = `audit-${randomUUID()}`;
    const status = this.auditStatus(auditId, 'PENDING');
    const createdRows = await (this.prisma as any).$transaction(
      async (tx: any) =>
        Promise.all(
          items.map((item: any) =>
            tx.inventoryAudit.create({
              data: {
                branchId,
                itemId: item.id,
                auditorId: userId,
                auditDate: new Date(),
                physicalStock: item.currentStock,
                systemStock: item.currentStock,
                variance: 0,
                status,
                notes: JSON.stringify({
                  auditId,
                  state: 'PENDING',
                  source: 'pharmacy-compliance',
                  filters: dto,
                  itemSnapshot: {
                    name: item.name,
                    batchNumber: item.batchNumber,
                    expiryDate: item.expiryDate,
                  },
                }),
              },
              include: { item: true },
            }),
          ),
        ),
    );

    return {
      auditId,
      status,
      itemCount: createdRows.length,
      createdAt: new Date().toISOString(),
      rows: createdRows.map((row: any) => this.auditRowSummary(row)),
    };
  }


  /**
   * @cc [owner:nareshshah139,label:product] legacy-audit-no-policy-bypass
   * The retired direct audit-adjustment entry point MUST reject every caller before database
   * access and return the canonical Counts & audit destination. Only versioned workflow counts
   * may apply stock changes using the branch approval policy and stock CAS.
   */
  async applyAuditAdjustments(
    _auditId: string,
    _dto: ApplyPharmacyAuditAdjustmentsDto,
    _branchId: string,
    _userId: string,
    _userRole?: string,
  ): Promise<never> {
    throw new GoneException({
      statusCode: 410,
      error: 'Gone',
      message: 'This audit submission has been retired. Open Counts & audit and start a reviewed count; no stock was changed.',
      workflowUrl: '/dashboard/inventory?area=stock&view=COUNT',
    });
  }

  private distributorPerformance(invoices: any[]) {
    const byDistributor = new Map<string, any>();
    for (const invoice of invoices) {
      const key = `${invoice.distributorGstin || ''}|${invoice.distributorName || ''}`;
      const row =
        byDistributor.get(key) ||
        {
          distributorName: invoice.distributorName,
          distributorGstin: invoice.distributorGstin,
          invoiceCount: 0,
          lineCount: 0,
          netPayable: 0,
          gstAmount: 0,
          purchasedQuantity: 0,
          freeQuantity: 0,
          lastInvoiceDate: invoice.invoiceDate,
        };
      row.invoiceCount += 1;
      row.lineCount += invoice.items?.length || 0;
      row.netPayable = this.money(row.netPayable + Number(invoice.netPayable || 0));
      row.gstAmount = this.money(row.gstAmount + Number(invoice.totalGst || 0));
      for (const item of invoice.items || []) {
        row.purchasedQuantity = this.money(
          row.purchasedQuantity + Number(item.quantityPurchased || 0),
        );
        row.freeQuantity = this.money(row.freeQuantity + Number(item.freeQuantity || 0));
      }
      if (new Date(invoice.invoiceDate) > new Date(row.lastInvoiceDate)) {
        row.lastInvoiceDate = invoice.invoiceDate;
      }
      byDistributor.set(key, row);
    }
    return Array.from(byDistributor.values())
      .sort((a, b) => b.netPayable - a.netPayable)
      .slice(0, 10);
  }

  private addSlab(
    slabs: Map<number, GstSlab>,
    slabPercent: number,
    amounts: Omit<GstSlab, 'slabPercent'>,
  ) {
    const existing =
      slabs.get(slabPercent) || {
        slabPercent,
        taxableAmount: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        totalGst: 0,
        grossAmount: 0,
      };
    existing.taxableAmount = this.money(existing.taxableAmount + Number(amounts.taxableAmount || 0));
    existing.cgst = this.money(existing.cgst + Number(amounts.cgst || 0));
    existing.sgst = this.money(existing.sgst + Number(amounts.sgst || 0));
    existing.igst = this.money(existing.igst + Number(amounts.igst || 0));
    existing.totalGst = this.money(existing.totalGst + Number(amounts.totalGst || 0));
    existing.grossAmount = this.money(existing.grossAmount + Number(amounts.grossAmount || 0));
    slabs.set(slabPercent, existing);
  }

  private sumSlabs(slabs: Map<number, GstSlab>) {
    return this.sortedSlabs(slabs).reduce(
      (sum, slab) => ({
        taxableAmount: this.money(sum.taxableAmount + slab.taxableAmount),
        cgst: this.money(sum.cgst + slab.cgst),
        sgst: this.money(sum.sgst + slab.sgst),
        igst: this.money(sum.igst + slab.igst),
        totalGst: this.money(sum.totalGst + slab.totalGst),
        grossAmount: this.money(sum.grossAmount + slab.grossAmount),
      }),
      { taxableAmount: 0, cgst: 0, sgst: 0, igst: 0, totalGst: 0, grossAmount: 0 },
    );
  }

  private sortedSlabs(slabs: Map<number, GstSlab>) {
    return Array.from(slabs.values()).sort((a, b) => a.slabPercent - b.slabPercent);
  }

  private dateRange(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = this.endOfDay(new Date(endDate));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new BadRequestException('Invalid date range');
    }
    return { start, end };
  }

  private monthRange(month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException('month must be in YYYY-MM format');
    }
    const [year, monthIndex] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, monthIndex - 1, 1));
    const end = this.endOfDay(new Date(Date.UTC(year, monthIndex, 0)));
    return { start, end };
  }

  private endOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(23, 59, 59, 999);
    return next;
  }

  private auditStatus(auditId: string, state: string) {
    return `${this.auditStatusPrefix}:${auditId}:${state}`;
  }

  private auditRowSummary(row: any) {
    return {
      auditRowId: row.id,
      inventoryId: row.itemId,
      name: row.item?.name,
      batchNumber: row.item?.batchNumber,
      expiryDate: row.item?.expiryDate,
      systemStock: row.systemStock,
      physicalStock: row.physicalStock,
      variance: row.variance,
      status: row.status,
    };
  }

  private percentAmount(amount: number, percent: number) {
    return this.money((Number(amount || 0) * Number(percent || 0)) / 100);
  }

  private money(value: number) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }
}
