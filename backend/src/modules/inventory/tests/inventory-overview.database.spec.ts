import { PrismaClient } from '@prisma/client';
import { InventoryWorkspaceService } from '../inventory-workspace.service';
import { localDatabase } from '../../../shared/testing/local-database';

const databaseTests = process.env.INVENTORY_READ_TEST_DATABASE_URL ? describe : describe.skip;
const DAY = 24 * 60 * 60 * 1000;

databaseTests('Inventory overview with PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let db: PrismaClient;
  let branchId: string;
  let workspace: InventoryWorkspaceService;
  const actor = () => ({ id: 'pharmacist', role: 'PHARMACIST', branchId }) as any;

  async function addBatches(from: number, count: number) {
    await db.inventoryItem.createMany({
      data: Array.from({ length: count }, (_, k) => {
        const n = from + k;
        return {
          id: `batch-${String(n).padStart(5, '0')}`,
          branchId,
          name: `Medicine ${n % 97}`,
          type: 'MEDICINE' as const,
          unit: 'PIECES' as const,
          costPrice: 10 + (n % 4),
          sellingPrice: 25,
          mrp: n % 13 === 0 ? null : 30,
          gstRate: n % 3 === 0 ? null : 12,
          currentStock: n % 9,
          heldStock: n % 9 > 2 ? 1 : 0,
          minStockLevel: n % 5 === 0 ? 4 : null,
          expiryDate: n % 7 === 0 ? new Date(Date.now() + 30 * DAY) : n % 11 === 0 ? new Date('2020-01-01') : new Date('2099-01-01'),
          category: n % 6 === 0 ? null : 'Tablet',
        };
      }),
    });
  }

  beforeAll(async () => {
    fixture = await localDatabase(process.env.INVENTORY_READ_TEST_DATABASE_URL!);
    db = fixture.prisma;
    branchId = (await db.branch.create({ data: { name: 'Synthetic overview branch', address: 'test' } })).id;
    workspace = new InventoryWorkspaceService(
      db as any,
      {
        permissions: async () => new Set(['inventory:item:read']),
        capabilities: async () => ({ kinds: {} }),
        documents: async () => ({ rows: [] }),
      } as any,
      {} as any,
    );
    await addBatches(0, 1200);
  }, 120000);
  afterAll(async () => {
    await fixture?.cleanup();
  });

  it('counts low stock and expiring batches and values stock exactly as the stock list does', async () => {
    const overview = await workspace.overview(actor());
    const [all, low, expiring] = await Promise.all([
      workspace.stock(actor()),
      workspace.stock(actor(), { stock: 'LOW' }),
      workspace.stock(actor(), { expiryMonths: '3' }),
    ]);

    expect(low.total).toBeGreaterThan(0);
    expect(expiring.total).toBeGreaterThan(0);
    expect({ lowStock: overview.lowStock, expiring: overview.expiring, stock: overview.stock }).toEqual({
      lowStock: low.total,
      expiring: expiring.total,
      stock: { total: all.total, quality: all.quality, valuation: all.valuation },
    });
  });

  it('asks the database the same number of queries however many batches the branch holds, and loads no batch rows', async () => {
    fixture.queries.length = 0;
    await workspace.overview(actor());
    const atTwelveHundred = [...fixture.queries];

    await addBatches(1200, 1300);
    fixture.queries.length = 0;
    const started = performance.now();
    await workspace.overview(actor());
    const ms = performance.now() - started;

    expect(fixture.queries.length).toBe(atTwelveHundred.length);
    expect(fixture.queries.filter((sql) => /FROM "\w+"\."inventory_items"/.test(sql))).toEqual([]);
    console.log(JSON.stringify({ fixture: '2500 batches / overview', ms: Math.round(ms), queries: fixture.queries.length }));
  });
});
