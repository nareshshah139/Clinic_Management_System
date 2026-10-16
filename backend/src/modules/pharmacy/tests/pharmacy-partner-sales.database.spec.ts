import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { PharmacyPartnerSalesService } from '../pharmacy-partner-sales.service';

const databaseTests = process.env.PARTNER_RECOVERY_TEST_DATABASE_URL
  ? describe
  : describe.skip;
const { PrismaClient } = require(
  process.env.PARTNER_TEST_PRISMA_CLIENT || '@prisma/client',
);

/**
 * @cc [owner:nareshshah139,label:testing] partner-recovery-local-database
 * Acceptance tests MUST require a loopback database URL and mutate only a disposable random schema.
 * Cleanup MUST remove only that schema; generated clients MUST remain outside shared dependencies.
 */
databaseTests('Partner stock recovery with PostgreSQL', () => {
  const schema = `partner_recovery_test_${randomUUID().replaceAll('-', '')}`;
  let admin: any;
  let prisma: any;
  let service: PharmacyPartnerSalesService;
  let actor: any;
  let legacy: any;
  let created = false;

  const fixture = async ({
    name = 'Synthetic Cream',
    batch = 'B-1',
    sold = 7,
    committed = 5,
    stock = 5,
    held = 1,
  }: any = {}) => {
    const inventory = await prisma.inventoryItem.create({
      data: {
        branchId: actor.branchId,
        name,
        batchNumber: batch,
        type: 'MEDICINE',
        costPrice: 5,
        sellingPrice: 10,
        unit: 'PIECES',
        currentStock: stock,
        heldStock: held,
        status: 'ACTIVE',
      },
    });
    const partner = await prisma.partnerOrganization.create({
      data: {
        branchId: actor.branchId,
        name: `Synthetic Partner ${randomUUID()}`,
      },
    });
    const sale = await prisma.partnerDailySale.create({
      data: {
        branchId: actor.branchId,
        partnerOrganizationId: partner.id,
        partnerOrganizationName: partner.name,
        date: new Date('2026-01-01'),
        status: committed ? 'PARTIAL_STOCK_COMMITTED' : 'SUBMITTED',
        stockCommittedAt: committed ? new Date('2026-01-01') : null,
        hasDiscrepancy: true,
        discrepancyFlags: JSON.stringify(['INSUFFICIENT_STOCK']),
        totalQuantity: sold,
        items: {
          create: [
            {
              medicineName: name,
              batchNumber: batch,
              quantitySold: sold,
              committedQuantity: committed,
              matchedInventoryItemId: committed ? inventory.id : null,
              mrp: 10,
              discountGiven: 0,
              paymentMode: 'CASH',
              discrepancyFlag: 'INSUFFICIENT_STOCK',
            },
          ],
        },
      },
      include: { items: true },
    });
    return { inventory, sale, line: sale.items[0], partner };
  };

  beforeAll(async () => {
    const url = new URL(process.env.PARTNER_RECOVERY_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Partner recovery tests require a local database');
    url.searchParams.set('schema', 'public');
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    execFileSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'db',
        'push',
        '--skip-generate',
        '--schema',
        path.resolve('prisma/schema.prisma'),
      ],
      { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' },
    );
    prisma = new PrismaClient({ datasourceUrl: url.toString() });
    const branch = await prisma.branch.create({
      data: { name: 'Synthetic Recovery Branch', address: 'Synthetic' },
    });
    const user = await prisma.user.create({
      data: {
        firstName: 'Synthetic',
        lastName: 'Staff',
        email: `${randomUUID()}@example.test`,
        password: 'synthetic-unused',
        role: 'PHARMACIST',
        branchId: branch.id,
      },
    });
    actor = { id: user.id, branchId: branch.id, role: user.role };
    legacy = await fixture();
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "partner_daily_sales" DROP COLUMN "version"',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "partner_daily_sale_items" DROP COLUMN "recoveryInventoryItemId"',
    );
    execFileSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'db',
        'execute',
        '--url',
        url.toString(),
        '--file',
        path.resolve(
          'prisma/migrations/20261015170000_partner_sale_recovery/migration.sql',
        ),
      ],
      { stdio: 'pipe' },
    );
    service = new PharmacyPartnerSalesService(prisma);
  }, 60000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (created)
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('migrates a legacy partial sale and adds only its two outstanding units', async () => {
    const before = await prisma.partnerDailySale.findUnique({
      where: { id: legacy.sale.id },
      include: { items: true },
    });
    expect([
      before.version,
      before.items[0].committedQuantity,
      Boolean(before.stockCommittedAt),
    ]).toEqual([0, 5, true]);
    const result = await service.commitStock(before.id, actor, {
      expectedVersion: 0,
    });
    const stock = await prisma.inventoryItem.findUnique({
      where: { id: legacy.inventory.id },
    });
    const movements = await prisma.stockTransaction.findMany({
      where: { reference: `PARTNER-SALE-${before.id}` },
    });
    expect([
      result.status,
      result.items[0].committedQuantity,
      stock.currentStock,
      stock.heldStock,
    ]).toEqual(['STOCK_COMMITTED', 7, 3, 1]);
    expect(
      movements.map((row: any) => [row.quantityDelta, row.customer]),
    ).toEqual([[-2, legacy.partner.name]]);
    expect([result.hasDiscrepancy, result.items[0].discrepancyFlag]).toEqual([
      false,
      null,
    ]);
  });

  it('deduplicates concurrent and lost-response retries', async () => {
    const { sale, inventory } = await fixture({
      batch: randomUUID(),
      stock: 10,
      held: 0,
    });
    const attempts = await Promise.allSettled([
      service.commitStock(sale.id, actor, { expectedVersion: 0 }),
      service.commitStock(sale.id, actor, { expectedVersion: 0 }),
    ]);
    expect(
      attempts.filter((row) => row.status === 'fulfilled').length,
    ).toBeGreaterThanOrEqual(1);
    for (const attempt of attempts)
      if (attempt.status === 'rejected')
        expect(attempt.reason.getStatus()).toBe(409);
    const repeated = await service.commitStock(sale.id, actor, {
      expectedVersion: 0,
    });
    const stock = await prisma.inventoryItem.findUnique({
      where: { id: inventory.id },
    });
    expect([
      repeated.items[0].committedQuantity,
      stock.currentStock,
      await prisma.stockTransaction.count({
        where: { reference: `PARTNER-SALE-${sale.id}` },
      }),
    ]).toEqual([7, 8, 1]);
  });

  it('leaves held units untouched and requires a fresh revision after a partial response is lost', async () => {
    const { sale, inventory } = await fixture({
      batch: randomUUID(),
      stock: 5,
      held: 4,
    });
    await service.commitStock(sale.id, actor, { expectedVersion: 0 });
    await expect(
      service.commitStock(sale.id, actor, { expectedVersion: 0 }),
    ).rejects.toThrow('Refresh');
    let stock = await prisma.inventoryItem.findUnique({
      where: { id: inventory.id },
    });
    expect([stock.currentStock, stock.heldStock]).toEqual([4, 4]);
    await prisma.inventoryItem.update({
      where: { id: inventory.id },
      data: { currentStock: 7 },
    });
    const result = await service.commitStock(sale.id, actor, {
      expectedVersion: 1,
    });
    stock = await prisma.inventoryItem.findUnique({
      where: { id: inventory.id },
    });
    expect([
      result.items[0].committedQuantity,
      stock.currentStock,
      stock.heldStock,
    ]).toEqual([7, 6, 4]);
    expect(
      (
        await prisma.stockTransaction.findMany({
          where: { reference: `PARTNER-SALE-${sale.id}` },
          orderBy: { createdAt: 'asc' },
        })
      ).map((row: any) => row.quantityDelta),
    ).toEqual([-1, -1]);
  });

  it('does not deduct a different medicine sharing a batch or the same medicine in a different batch', async () => {
    const { sale, line, inventory } = await fixture({
      batch: randomUUID(),
      committed: 0,
      sold: 2,
      held: 0,
    });
    await prisma.inventoryItem.update({
      where: { id: inventory.id },
      data: { name: 'A Different Medicine' },
    });
    const other = await prisma.inventoryItem.create({
      data: {
        branchId: actor.branchId,
        name: line.medicineName,
        batchNumber: 'other-batch',
        type: 'MEDICINE',
        costPrice: 5,
        sellingPrice: 10,
        unit: 'PIECES',
        currentStock: 9,
      },
    });
    const first = await service.commitStock(sale.id, actor, {
      expectedVersion: 0,
    });
    expect([
      first.status,
      first.items[0].committedQuantity,
      await prisma.stockTransaction.count({
        where: { reference: `PARTNER-SALE-${sale.id}` },
      }),
    ]).toEqual(['RECONCILIATION_REQUIRED', 0, 0]);
    const corrected = await service.reconcileLine(
      sale.id,
      line.id,
      {
        expectedVersion: 1,
        inventoryItemId: other.id,
        reason: 'Confirmed the actual sold batch',
      },
      actor,
    );
    expect([
      corrected.items[0].medicineName,
      corrected.items[0].batchNumber,
      corrected.items[0].quantitySold,
      corrected.items[0].committedQuantity,
    ]).toEqual([line.medicineName, line.batchNumber, 2, 0]);
    expect(
      await prisma.auditLog.count({
        where: { entityId: line.id, action: 'PARTNER_SALE_LINE_MATCHED' },
      }),
    ).toBe(1);
    await service.commitStock(sale.id, actor, { expectedVersion: 2 });
    const stocks = await prisma.inventoryItem.findMany({
      where: { id: { in: [inventory.id, other.id] } },
    });
    expect(
      stocks.find((row: any) => row.id === inventory.id).currentStock,
    ).toBe(5);
    expect(stocks.find((row: any) => row.id === other.id).currentStock).toBe(7);
  });

  it('requires explicit selection when exact identity and batch match multiple inventory rows', async () => {
    const { sale, inventory } = await fixture({
      batch: randomUUID(),
      committed: 0,
      sold: 2,
      held: 0,
    });
    await prisma.inventoryItem.create({
      data: {
        branchId: actor.branchId,
        name: inventory.name,
        batchNumber: inventory.batchNumber,
        type: 'MEDICINE',
        costPrice: 5,
        sellingPrice: 10,
        unit: 'PIECES',
        currentStock: 9,
      },
    });
    const result = await service.commitStock(sale.id, actor, {
      expectedVersion: 0,
    });
    expect([
      result.items[0].committedQuantity,
      result.status,
      await prisma.stockTransaction.count({
        where: { reference: `PARTNER-SALE-${sale.id}` },
      }),
    ]).toEqual([0, 'RECONCILIATION_REQUIRED', 0]);
  });

  it('keeps batch search and correction inside the staff branch and protects another partner sale', async () => {
    const { sale, line, inventory } = await fixture({
      batch: randomUUID(),
      committed: 0,
    });
    const otherBranch = await prisma.branch.create({
      data: { name: 'Other Synthetic Branch', address: 'Synthetic' },
    });
    const otherStock = await prisma.inventoryItem.create({
      data: {
        branchId: otherBranch.id,
        name: inventory.name,
        batchNumber: inventory.batchNumber,
        type: 'MEDICINE',
        costPrice: 5,
        sellingPrice: 10,
        unit: 'PIECES',
        currentStock: 9,
      },
    });
    const matches = await service.recoveryMatches(
      sale.id,
      line.id,
      inventory.batchNumber,
      actor,
    );
    expect(matches.matches.map((row: any) => row.id)).toEqual([inventory.id]);
    await expect(
      service.reconcileLine(
        sale.id,
        line.id,
        {
          expectedVersion: 0,
          inventoryItemId: otherStock.id,
          reason: 'Attempt wrong branch',
        },
        actor,
      ),
    ).rejects.toThrow('this branch');
    await expect(
      service.commitStock(
        sale.id,
        { ...actor, role: 'PATIENT', partnerOrganizationId: 'another-partner' },
        { expectedVersion: 0 },
      ),
    ).rejects.toThrow('not found');
    await expect(
      service.recoveryMatches(sale.id, line.id, inventory.batchNumber, {
        ...actor,
        role: 'PATIENT',
      }),
    ).rejects.toThrow('staff');
  });

  it('rolls back quantities, sale revision and line progress if a later movement write fails', async () => {
    const { sale, inventory } = await fixture({ batch: randomUUID() });
    const failing = new PharmacyPartnerSalesService({
      $transaction: (callback: any, options: any) =>
        prisma.$transaction(
          (tx: any) =>
            callback({
              ...tx,
              stockTransaction: {
                ...tx.stockTransaction,
                update: async () => {
                  throw new Error('synthetic persistence failure');
                },
              },
            }),
          options,
        ),
    } as any);
    await expect(
      failing.commitStock(sale.id, actor, { expectedVersion: 0 }),
    ).rejects.toThrow('synthetic persistence failure');
    const saved = await prisma.partnerDailySale.findUnique({
      where: { id: sale.id },
      include: { items: true },
    });
    const stock = await prisma.inventoryItem.findUnique({
      where: { id: inventory.id },
    });
    expect([
      saved.version,
      saved.items[0].committedQuantity,
      stock.currentStock,
      await prisma.stockTransaction.count({
        where: { reference: `PARTNER-SALE-${sale.id}` },
      }),
    ]).toEqual([0, 5, 5, 0]);
  });
  it('does not infer a product from generic-only names or a missing batch', async () => {
    const generic = await fixture({ batch: randomUUID(), committed: 0 });
    await prisma.inventoryItem.update({
      where: { id: generic.inventory.id },
      data: {
        name: 'Different Product',
        genericName: generic.line.medicineName,
      },
    });
    const result = await service.commitStock(generic.sale.id, actor, {
      expectedVersion: 0,
    });
    const missing = await fixture({
      name: 'Synthetic Unbatched',
      batch: '',
      committed: 0,
    });
    const missingResult = await service.commitStock(missing.sale.id, actor, {
      expectedVersion: 0,
    });
    expect([
      result.items[0].committedQuantity,
      missingResult.items[0].committedQuantity,
    ]).toEqual([0, 0]);
  });

  it('excludes expired batches from automatic matching, search and explicit selection', async () => {
    const { sale, line, inventory } = await fixture({
      batch: randomUUID(),
      committed: 0,
    });
    await prisma.inventoryItem.update({
      where: { id: inventory.id },
      data: { expiryDate: new Date('2000-01-01') },
    });
    expect(
      (
        await service.recoveryMatches(
          sale.id,
          line.id,
          inventory.batchNumber,
          actor,
        )
      ).matches,
    ).toEqual([]);
    await expect(
      service.reconcileLine(
        sale.id,
        line.id,
        {
          expectedVersion: 0,
          inventoryItemId: inventory.id,
          reason: 'Attempt expired batch',
        },
        actor,
      ),
    ).rejects.toThrow('unexpired');
    const result = await service.commitStock(sale.id, actor, {
      expectedVersion: 0,
    });
    expect(result.items[0].committedQuantity).toBe(0);
  });
});
