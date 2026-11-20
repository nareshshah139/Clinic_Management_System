import { StockPredictionController } from './stock-prediction.controller';
import { StockPredictionService } from './stock-prediction.service';

const BRANCH = 'branch-1';

// Three drugs, each with one month of sales at 30 units (1 unit/day), so the
// similar-items path yields daysUntilStockout === currentStock.
function buildPrisma(stockByName: Record<string, number | null>) {
  const drugs = [
    { id: 'd-ten', name: 'TenDays', price: 2, category: 'Oral', minStockLevel: null },
    { id: 'd-three', name: 'ThreeDays', price: 2, category: 'Oral', minStockLevel: null },
    { id: 'd-zero', name: 'OutOfStock', price: 2, category: 'Oral', minStockLevel: null },
  ];
  return {
    $queryRaw: jest.fn().mockResolvedValue(
      drugs.map((d) => ({ drugId: d.id, totalQuantity: BigInt(30), lastSaleDate: new Date() })),
    ),
    drug: {
      findMany: jest.fn().mockResolvedValue(drugs),
      findUnique: jest.fn().mockResolvedValue({ price: 2 }),
    },
    pharmacyInvoiceItem: {
      findMany: jest.fn().mockResolvedValue(
        drugs.map((d) => ({ drugId: d.id, quantity: 30, invoice: { invoiceDate: new Date() } })),
      ),
    },
    inventoryItem: {
      findFirst: jest.fn(async ({ where }: any) => {
        const stock = stockByName[where.name];
        return stock === null ? null : { currentStock: stock, reorderLevel: null };
      }),
    },
  };
}

describe('StockPredictionController.getPredictions out-of-stock handling', () => {
  const req = { user: { branchId: BRANCH } };

  it('ranks an item with 0 days of stock first and counts it as critical', async () => {
    const prisma = buildPrisma({ TenDays: 10, ThreeDays: 3, OutOfStock: 0 });
    const controller = new StockPredictionController(new StockPredictionService(prisma as any));

    const result = await controller.getPredictions(req);

    expect(result.predictions.map((p) => [p.drugName, p.daysUntilStockout])).toEqual([
      ['OutOfStock', 0],
      ['ThreeDays', 3],
      ['TenDays', 10],
    ]);
    expect(result.summary).toEqual({
      totalPredictedOrders: 104,
      estimatedCost: 0,
      criticalItems: 2,
    });
  });

  it('treats a drug with no inventory row as out of stock', async () => {
    const prisma = buildPrisma({ TenDays: 10, ThreeDays: 3, OutOfStock: null });
    const controller = new StockPredictionController(new StockPredictionService(prisma as any));

    const result = await controller.getPredictions(req);

    expect(result.predictions[0]).toMatchObject({ drugName: 'OutOfStock', daysUntilStockout: 0 });
    expect(result.summary.criticalItems).toBe(2);
  });
});

describe('StockPredictionService.generateBulkOrderSuggestion out-of-stock priority', () => {
  it('marks 0 days until stockout CRITICAL and orders it before HIGH items', async () => {
    const prisma = buildPrisma({});
    const service = new StockPredictionService(prisma as any);
    const base = { predictedQuantity: 39, currentStock: 0, trend: 0 } as any;

    const result = await service.generateBulkOrderSuggestion(BRANCH, [
      { ...base, drugId: 'high', drugName: 'High', currentStock: 12, daysUntilStockout: 12 },
      { ...base, drugId: 'zero', drugName: 'Zero', daysUntilStockout: 0 },
    ]);

    expect(result.items.map((i) => [i.drugName, i.priority])).toEqual([
      ['Zero', 'CRITICAL'],
      ['High', 'HIGH'],
    ]);
  });
});
