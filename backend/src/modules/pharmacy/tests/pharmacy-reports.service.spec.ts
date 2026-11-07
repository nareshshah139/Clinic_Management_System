import { BadRequestException } from '@nestjs/common';
import { PharmacyComplianceService } from '../pharmacy-compliance.service';
import { PharmacyDayWiseTypeDto } from '../dto/pharmacy-compliance.dto';

type Row = Record<string, any>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === 'OR') return (condition as Row[]).some((branch) => matches(row, branch));
    const value = row[field];
    if (condition === null || typeof condition !== 'object' || condition instanceof Date) return value === condition;
    if ('in' in condition) return condition.in.includes(value);
    return (
      (condition.gte === undefined || value >= condition.gte) &&
      (condition.lte === undefined || value <= condition.lte) &&
      (condition.lt === undefined || value < condition.lt)
    );
  });
}

function table(rows: Row[]) {
  return {
    findMany: async (args: Row = {}) => {
      const found = rows.filter((row) => matches(row, args.where));
      if (args.orderBy?.invoiceDate === 'desc') found.sort((a, b) => b.invoiceDate - a.invoiceDate);
      return args.take ? found.slice(0, args.take) : found;
    },
  };
}

const branchId = 'branch-1';
const at = (iso: string) => new Date(iso);
const saleItem = (taxPercent: number, totalAmount: number, taxAmount: number) => ({ taxPercent, totalAmount, taxAmount });
const invoice = (invoiceNumber: string, invoiceDate: string, status: string, items: Row[] = []) => ({
  branchId, invoiceNumber, invoiceDate: at(invoiceDate), status, items,
});
const workflowDoc = (kind: string, reference: string, date: string, lines: Row[]) => ({
  id: `wf-${reference}`, branchId, kind, status: 'POSTED', reference, supplierGstin: null, payload: { date, lines },
});

describe('Day-wise summary', () => {
  const salesPrisma = () => ({
    pharmacyInvoice: table([
      invoice('PHI-2026-535', '2026-11-04T06:00:00.000Z', 'COMPLETED', [saleItem(12, 112, 12)]),
      invoice('PHI-2026-536', '2026-11-05T04:30:00.000Z', 'CONFIRMED', [saleItem(12, 246.4, 26.4)]),
      invoice('PHI-2026-537', '2026-11-05T10:00:00.000Z', 'DISPENSED', [saleItem(18, 660.8, 100.8)]),
      invoice('PHI-2026-538', '2026-11-05T11:00:00.000Z', 'DRAFT', [saleItem(12, 999, 99)]),
      invoice('PHI-2026-539', '2026-11-05T12:00:00.000Z', 'COMPLETED', [saleItem(12, 112, 12)]),
      invoice('PHI-2026-540', '2026-11-05T13:00:00.000Z', 'COMPLETED', [saleItem(5, 31.5, 1.5), saleItem(0, 3.65, 0)]),
      invoice('PHI-2026-542', '2026-11-06T20:00:00.000Z', 'CONFIRMED', [saleItem(12, 560, 60)]),
      invoice('PHI-2026-543', '2026-11-07T19:00:00.000Z', 'CONFIRMED', [saleItem(12, 1120, 120)]),
    ]),
    pharmacyPurchaseInvoice: table([]),
    inventoryWorkflowDocument: table([
      workflowDoc('COUNTER_SALE', 'CS-11', '2026-11-05', [{ name: 'Zinc', quantity: 1, gstRate: 5, taxable: 100, tax: 5, total: 105 }]),
      workflowDoc('SALES_RETURN', 'SR-2', '2026-11-07', [{ name: 'Adapalene', quantity: 1, gstRate: 12, taxable: 100, tax: 12, total: 112 }]),
    ]),
  });

  const slab = (slabPercent: number, taxableAmount = 0, half = 0) => ({
    slabPercent, taxableAmount, cgst: half, sgst: half, igst: 0, totalGst: half * 2, grossAmount: taxableAmount + half * 2,
  });

  it('collapses each clinic day into one row with its bill range, gaps and GST slabs', async () => {
    const service = new PharmacyComplianceService(salesPrisma() as any);
    const report = await service.getDayWiseSummary(
      { startDate: '2026-11-05', endDate: '2026-11-07', type: PharmacyDayWiseTypeDto.SALES },
      branchId,
    );

    expect(report.columns).toEqual([0, 5, 12, 18, 28, 40]);
    expect(report.rows.map((row) => row.date)).toEqual(['2026-11-05', '2026-11-06', '2026-11-07']);

    const [nov5, nov6, nov7] = report.rows;
    expect(nov5.bills).toEqual({
      billCount: 4,
      ranges: [{ prefix: 'PHI-2026-', from: 536, to: 540 }],
      missing: [{ invoiceNumber: 'PHI-2026-538', status: 'DRAFT' }],
      missingCount: 1,
      numbers: [],
      otherReferences: [{ kind: 'COUNTER_SALE', reference: 'CS-11' }],
    });
    expect(nov5.slabs).toEqual([
      slab(0, 3.65),
      slab(5, 130, 3.25),
      slab(12, 320, 19.2),
      slab(18, 560, 50.4),
      slab(28),
      slab(40),
    ]);
    expect(nov5.total).toEqual({ taxableAmount: 1013.65, cgst: 72.85, sgst: 72.85, igst: 0, totalGst: 145.7, grossAmount: 1159.35 });
    expect(nov5.amount).toBe(1159.35);

    expect(nov6).toMatchObject({ noBills: true, amount: 0, bills: { billCount: 0, ranges: [], missing: [] } });

    expect(nov7.noBills).toBe(false);
    expect(nov7.bills).toMatchObject({
      billCount: 1,
      ranges: [{ prefix: 'PHI-2026-', from: 542, to: 542 }],
      missing: [{ invoiceNumber: 'PHI-2026-541', status: null }],
      otherReferences: [{ kind: 'SALES_RETURN', reference: 'SR-2' }],
    });
    expect(nov7.slabs[2]).toEqual(slab(12, 400, 24));
    expect(nov7.amount).toBe(448);
  });

  it('adds the daily rows up to the totals row and the range total', async () => {
    const service = new PharmacyComplianceService(salesPrisma() as any);
    const report = await service.getDayWiseSummary(
      { startDate: '2026-11-05', endDate: '2026-11-07', type: PharmacyDayWiseTypeDto.SALES },
      branchId,
    );

    expect(report.totals.slabs[2]).toEqual(slab(12, 720, 43.2));
    expect(report.totals.total).toEqual({ taxableAmount: 1413.65, cgst: 96.85, sgst: 96.85, igst: 0, totalGst: 193.7, grossAmount: 1607.35 });
    expect(report.totals).toMatchObject({ amount: 1607.35, billCount: 5, missingCount: 2, noBillDays: 1 });
  });

  it('lists supplier bill numbers for purchases without gap detection', async () => {
    const service = new PharmacyComplianceService({
      pharmacyInvoice: table([]),
      inventoryWorkflowDocument: table([]),
      pharmacyPurchaseInvoice: table([
        { branchId, status: 'STOCK_COMMITTED', invoiceNumber: 'SUP/88', invoiceDate: at('2026-11-05T00:00:00.000Z'), items: [
          { taxableAmount: 900, cgstPercent: 6, sgstPercent: 6, igstPercent: 0, gstAmount: 108, lineTotal: 1008 },
        ] },
        { branchId, status: 'STOCK_COMMITTED', invoiceNumber: 'KA-771', invoiceDate: at('2026-11-05T00:00:00.000Z'), items: [
          { taxableAmount: 500, cgstPercent: 0, sgstPercent: 0, igstPercent: 18, gstAmount: 90, lineTotal: 590 },
        ] },
        { branchId, status: 'DRAFT', invoiceNumber: 'SUP/89', invoiceDate: at('2026-11-05T00:00:00.000Z'), items: [] },
      ]),
    } as any);

    const report = await service.getDayWiseSummary(
      { startDate: '2026-11-05', endDate: '2026-11-05', type: PharmacyDayWiseTypeDto.PURCHASE },
      branchId,
    );

    expect(report.rows[0].bills).toEqual({
      billCount: 2, ranges: [], missing: [], missingCount: 0, numbers: ['SUP/88', 'KA-771'], otherReferences: [],
    });
    expect(report.rows[0].slabs[2]).toEqual({ slabPercent: 12, taxableAmount: 900, cgst: 54, sgst: 54, igst: 0, totalGst: 108, grossAmount: 1008 });
    expect(report.rows[0].slabs[3]).toEqual({ slabPercent: 18, taxableAmount: 500, cgst: 0, sgst: 0, igst: 90, totalGst: 90, grossAmount: 590 });
    expect(report.totals.amount).toBe(1598);
  });

  it('rejects a reversed range and a range longer than a year', async () => {
    const service = new PharmacyComplianceService(salesPrisma() as any);
    await expect(
      service.getDayWiseSummary({ startDate: '2026-11-07', endDate: '2026-11-05', type: PharmacyDayWiseTypeDto.SALES }, branchId),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.getDayWiseSummary({ startDate: '2025-01-01', endDate: '2026-11-05', type: PharmacyDayWiseTypeDto.SALES }, branchId),
    ).rejects.toThrow('Choose a range of at most 366 days');
  });
});

describe('Item-wise margin', () => {
  const batch = (id: string, fields: Row) => ({
    id, category: null, manufacturer: null, unit: 'TUBES', packSize: null, packUnit: null, mrp: null,
    currentStock: 0, gstRate: 12, createdAt: at('2026-10-01T00:00:00.000Z'), drugs: [], branchId, ...fields,
  });
  const adapaleneDrug = { id: 'drug-1', name: 'Adapalene 0.1% Gel', manufacturerName: 'Galderma', packSizeLabel: 'tube of 15 gm gel', category: 'Acne' };
  const sale = (id: string, itemId: string, quantity: number, reference: string, notes: Row) => ({
    id, branchId, itemId, type: 'SALE', quantity, reference, notes: JSON.stringify(notes),
  });
  const terms = (taxablePerUnit: number, taxPerUnit: number, gstRate: number) => ({ taxablePerUnit, taxPerUnit, gstRate });

  const marginPrisma = () => ({
    pharmacyInvoice: table([
      invoice('PHI-2026-536', '2026-11-05T04:30:00.000Z', 'CONFIRMED'),
      invoice('PHI-2026-537', '2026-11-05T09:00:00.000Z', 'COMPLETED'),
      invoice('PHI-2026-599', '2026-11-05T09:00:00.000Z', 'DRAFT'),
    ]),
    inventoryItem: table([
      batch('b1', { name: 'Adapalene Gel 15g', category: 'Acne', manufacturer: 'Galderma', packSize: 15, packUnit: 'g', mrp: 118, currentStock: 10, drugs: [adapaleneDrug] }),
      batch('b2', { name: 'Adapalene Gel 15g', category: 'Acne', manufacturer: 'Galderma', packSize: 15, packUnit: 'g', mrp: 120, currentStock: 5, createdAt: at('2026-11-01T00:00:00.000Z'), drugs: [adapaleneDrug] }),
      batch('b3', { name: 'Sunscreen SPF 50', category: 'Sun Care', manufacturer: 'Derma Co', unit: 'BOTTLES', packSize: 50, packUnit: 'ml', mrp: 590, currentStock: 3, gstRate: 18 }),
      batch('b4', { name: 'Calamine Lotion', category: 'Itch', unit: 'BOTTLES', packSize: 100, packUnit: 'ml', mrp: 95, currentStock: 26 }),
    ]),
    stockTransaction: table([
      sale('t1', 'b1', 2, 'INV-PHI-2026-536', { costPerStockUnit: 80, saleTerms: terms(100, 12, 12) }),
      sale('t2', 'b2', 1, 'INV-PHI-2026-536', { costPerStockUnit: 90, saleTerms: terms(100, 12, 12) }),
      sale('t3', 'b3', 1, 'INV-PHI-2026-537', { costPerStockUnit: 400, saleTerms: terms(500, 90, 18) }),
      sale('t4', 'b4', 2, 'INV-PHI-2026-537', { saleTerms: terms(50, 6, 12) }),
      sale('t9', 'b1', 7, 'INV-PHI-2026-599', { costPerStockUnit: 80, saleTerms: terms(100, 12, 12) }),
    ]),
    inventoryWorkflowDocument: table([
      workflowDoc('SALES_RETURN', 'SR-1', '2026-11-06', [
        { id: 'l1', inventoryId: 'b1', sourceLineId: 't1', name: 'Adapalene Gel 15g', quantity: 1, gstRate: 12, taxable: 100, tax: 12, total: 112 },
      ]),
    ]),
  });

  const run = (search?: string) =>
    new PharmacyComplianceService(marginPrisma() as any).getItemMargin({ startDate: '2026-11-01', endDate: '2026-11-30', search }, branchId);

  it('computes sales, purchase, net GST and profit per product, highest margin first', async () => {
    const report = await run();

    expect(report.rows.map((row) => row.name)).toEqual(['Sunscreen SPF 50', 'Adapalene 0.1% Gel', 'Calamine Lotion']);
    expect(report.rows[0]).toMatchObject({
      category: 'Sun Care', unitLabel: '50 ml', manufacturer: 'Derma Co', stock: 3, mrp: 590, itemId: 'b3',
      saleQuantity: 1, averageSalePrice: 590, salesAmount: 590, purchase: 472, netGst: 18, profit: 100, profitPercent: 20,
      unknownCost: { lineCount: 0, quantity: 0, salesAmount: 0 },
    });
  });

  it('groups two batches of one product into one row and nets the customer return at its original cost', async () => {
    const adapalene = (await run()).rows[1];

    expect(adapalene).toMatchObject({
      key: 'drug:drug-1', unitLabel: '15 g', manufacturer: 'Galderma', stock: 15, mrp: 120, itemId: 'b2',
      saleQuantity: 2, averageSalePrice: 112, salesAmount: 224, purchase: 190.4, netGst: 3.6, profit: 30, profitPercent: 15,
      knownTaxableSales: 200,
    });
  });

  it('flags a sale line without a recorded cost instead of counting it as free stock', async () => {
    const calamine = (await run()).rows[2];

    expect(calamine).toMatchObject({
      saleQuantity: 2, salesAmount: 112, purchase: null, netGst: null, profit: null, profitPercent: null,
      unknownCost: { lineCount: 1, quantity: 2, salesAmount: 112 },
    });
  });

  it('adds the rows up to the summary tiles', async () => {
    const { totals } = await run();

    expect(totals).toEqual({
      salesAmount: 926, purchase: 662.4, netGst: 21.6, profit: 130, profitPercent: 18.57, itemCount: 3,
      unknownCost: { lineCount: 1, itemCount: 1, salesAmount: 112 },
    });
  });

  it('filters by name, category or manufacturer and recomputes the tiles', async () => {
    const report = await run('  Derma   CO ');

    expect(report.rows.map((row) => row.name)).toEqual(['Sunscreen SPF 50']);
    expect(report.totals).toMatchObject({ salesAmount: 590, purchase: 472, netGst: 18, profit: 100, profitPercent: 20 });
  });
});
