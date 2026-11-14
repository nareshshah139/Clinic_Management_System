import { PrismaClient } from '@prisma/client';
import { ReportsService } from '../reports.service';
import { InventoryWorkspaceService } from '../../inventory/inventory-workspace.service';
import { localDatabase } from '../../../shared/testing/local-database';

const databaseTests = process.env.REPORTS_TEST_DATABASE_URL ? describe : describe.skip;
databaseTests('Alerts use the Inventory stock rules', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let db: PrismaClient;
  let branchId: string;
  let pharmacistId: string;
  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);

  beforeAll(async () => {
    fixture = await localDatabase(process.env.REPORTS_TEST_DATABASE_URL!);
    db = fixture.prisma;
    branchId = (await db.branch.create({ data: { name: 'Synthetic alerts branch', address: 'test' } })).id;
    pharmacistId = (await db.user.create({ data: { branchId, firstName: 'Test', lastName: 'Pharmacist', email: 'alerts@example.invalid', password: 'no-login', role: 'PHARMACIST' } })).id;
    const batch = (id: string, fields: Record<string, unknown>) => ({ id, name: id, branchId, type: 'MEDICINE' as const, unit: 'PIECES' as const, costPrice: 10, sellingPrice: 20, expiryDate: inDays(400), ...fields });
    await db.inventoryItem.createMany({ data: [
      batch('Empty cream', { currentStock: 0, minStockLevel: 5 }),
      batch('Short gel', { currentStock: 3, minStockLevel: 8 }),
      batch('Held tablet', { currentStock: 6, heldStock: 4, minStockLevel: 2 }),
      batch('Reorder-only lotion', { currentStock: 2, reorderLevel: 3 }),
      batch('Full shampoo', { currentStock: 30, minStockLevel: 8 }),
      batch('No threshold soap', { currentStock: 1 }),
      batch('Soon serum', { currentStock: 9, expiryDate: inDays(40) }),
      batch('Later serum', { currentStock: 9, expiryDate: inDays(150) }),
      batch('Expired serum', { currentStock: 9, expiryDate: inDays(-3) }),
    ] });
  }, 120000);

  afterAll(async () => fixture?.cleanup());

  it('counts and names low stock and the 3-month expiry window exactly as the Inventory stock list does', async () => {
    const alerts = await new ReportsService(db as any).getSystemAlerts(branchId, { id: pharmacistId, role: 'PHARMACIST' });
    const workspace = new InventoryWorkspaceService(db as any, { permissions: async () => new Set(['inventory:item:read']) } as any, {} as any);
    const actor = { id: pharmacistId, branchId } as any;

    expect({
      low: alerts.lowStockAlerts.map((a: any) => a.itemName).sort(),
      expiring: alerts.expiryAlerts.map((a: any) => a.itemName),
      counts: [alerts.counts.lowStockAlerts, alerts.counts.expiryAlerts],
    }).toEqual({
      low: ['Empty cream', 'Held tablet', 'Reorder-only lotion', 'Short gel'],
      expiring: ['Soon serum'],
      counts: [4, 1],
    });
    expect([(await workspace.stock(actor, { stock: 'LOW' })).total, (await workspace.stock(actor, { expiryMonths: '3' })).total]).toEqual([4, 1]);
  });
});
