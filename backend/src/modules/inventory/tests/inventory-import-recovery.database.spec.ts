import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import { InventoryImportService } from '../inventory-import.service';
import { writeStockMovement } from '../inventory-stock';
import { localDatabase } from '../../../shared/testing/local-database';

const databaseTests = process.env.OPENING_IMPORT_TEST_DATABASE_URL
  ? describe
  : describe.skip;
const workbook = (rows: unknown[][]) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Stock');
  return {
    originalname: 'opening.xlsx',
    buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }),
  } as Express.Multer.File;
};

databaseTests('Opening import recovery with PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let db: any;
  let branchId: string;
  let userId: string;
  let service: InventoryImportService;
  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    fixture = await localDatabase(
      process.env.OPENING_IMPORT_TEST_DATABASE_URL!,
    );
    db = fixture.prisma;
    await db.$executeRawUnsafe('DROP TABLE inventory_migration_rows');
    await db.$executeRawUnsafe(
      'ALTER TABLE inventory_migrations DROP COLUMN "rowTrackingVersion", DROP COLUMN "legacyResult"',
    );
    const migrationUrl = new URL(process.env.OPENING_IMPORT_TEST_DATABASE_URL!);
    migrationUrl.searchParams.set('schema', fixture.schema);
    execFileSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'db',
        'execute',
        '--url',
        migrationUrl.toString(),
        '--file',
        path.resolve(
          'prisma/migrations/20261015172000_opening_import_recovery/migration.sql',
        ),
      ],
      { stdio: 'pipe' },
    );
  }, 60000);
  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    branchId = (
      await db.branch.create({
        data: { name: 'Synthetic import recovery', address: 'test' },
      })
    ).id;
    userId = (
      await db.user.create({
        data: {
          branchId,
          firstName: 'Test',
          lastName: 'Import',
          email: `import-${branchId}@example.invalid`,
          password: 'no-login',
          role: 'ADMIN',
        },
      })
    ).id;
    service = new InventoryImportService(db);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await fixture?.cleanup();
    jest.restoreAllMocks();
  });

  it('retries only failed rows after a database failure and preserves successful stock', async () => {
    const save = (service as any).upsertImportRow.bind(service);
    let fail = true;
    jest
      .spyOn(service as any, 'upsertImportRow')
      .mockImplementation(async (row: any, ...args: any[]) => {
        if (row.name === 'Retry row' && fail) {
          fail = false;
          throw Object.assign(new Error('Synthetic transaction timeout'), {
            code: 'P2028',
          });
        }
        return save(row, ...args);
      });
    const uploaded = workbook([
      ['Drug name', 'Current stock'],
      ['Saved row', 4],
      ['Retry row', 7],
    ]);
    const first = await service.importStarterExcel(uploaded, branchId, userId);
    expect(first).toMatchObject({ created: 1, skipped: 1 });
    const retried = await (service as any).retryFailedRows(
      first.importId,
      branchId,
      userId,
    );
    expect(retried).toMatchObject({
      totalRows: 2,
      created: 2,
      skipped: 0,
      errors: [],
    });
    expect(
      await db.inventoryItem.findMany({
        where: { branchId },
        select: { name: true, currentStock: true },
        orderBy: { name: 'asc' },
      }),
    ).toEqual([
      { name: 'Retry row', currentStock: 7 },
      { name: 'Saved row', currentStock: 4 },
    ]);
    expect(await db.stockTransaction.count({ where: { branchId } })).toBe(2);
    await (service as any).retryFailedRows(first.importId, branchId, userId);
    expect(await db.stockTransaction.count({ where: { branchId } })).toBe(2);
  });

  it('deduplicates concurrent retries of the same failed row', async () => {
    const save = (service as any).upsertImportRow.bind(service);
    const fault = jest
      .spyOn(service as any, 'upsertImportRow')
      .mockRejectedValueOnce(
        Object.assign(new Error('Temporary database failure'), {
          code: 'P2028',
        }),
      );
    fault.mockImplementationOnce(save);
    const first = await service.importStarterExcel(
      workbook([
        ['Drug name', 'Current stock'],
        ['Concurrent row', 9],
      ]),
      branchId,
      userId,
    );
    fault.mockRestore();
    const results = await Promise.all([
      service.retryFailedRows(first.importId, branchId, userId),
      service.retryFailedRows(first.importId, branchId, userId),
    ]);
    expect(results.map((result) => result.created)).toEqual([1, 1]);
    expect(
      await db.inventoryItem.findMany({
        where: { branchId },
        select: { currentStock: true },
      }),
    ).toEqual([{ currentStock: 9 }]);
    expect(await db.stockTransaction.count({ where: { branchId } })).toBe(1);
  });

  it('recovers a lost summary after successful zero-stock and metadata rows without reapplying them', async () => {
    const uploaded = workbook([
      ['Drug name', 'Current stock'],
      ['Zero row', 0],
    ]);
    const summaryWrite = jest
      .spyOn(db.inventoryMigration, 'update')
      .mockRejectedValueOnce(new Error('Synthetic lost summary'));
    await expect(
      service.importStarterExcel(uploaded, branchId, userId),
    ).rejects.toThrow('Synthetic lost summary');
    summaryWrite.mockRestore();
    const migration = await db.inventoryMigration.findFirstOrThrow({
      where: { branchId },
    });
    expect(await service.importOutcome(migration.id, branchId)).toMatchObject({
      created: 1,
      skipped: 0,
    });
    const item = await db.inventoryItem.findFirstOrThrow({
      where: { branchId },
    });
    await db.inventoryItem.update({
      where: { id: item.id },
      data: { currentStock: 5 },
    });
    expect(
      await service.importStarterExcel(uploaded, branchId, userId),
    ).toMatchObject({ created: 1, updated: 0, skipped: 0 });
    expect(
      (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
        .currentStock,
    ).toBe(5);
    expect(await db.stockTransaction.count({ where: { branchId } })).toBe(0);
    const metadataFile = workbook([
      ['Drug name', 'Description'],
      ['Zero row', 'Corrected description'],
    ]);
    const metadata = await service.importStarterExcel(
      metadataFile,
      branchId,
      userId,
    );
    expect(metadata).toMatchObject({ created: 0, updated: 1, skipped: 0 });
    await db.inventoryItem.update({
      where: { id: item.id },
      data: { description: 'Later staff edit' },
    });
    await service.retryFailedRows(metadata.importId, branchId, userId);
    expect(
      (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
        .description,
    ).toBe('Later staff edit');
    expect(
      await db.auditLog.count({
        where: { userId, action: 'OPENING_IMPORT_METADATA' },
      }),
    ).toBe(1);
  });

  it('rolls back stock and catalogue changes when the durable success marker cannot be written', async () => {
    const marker = jest
      .spyOn(service as any, 'saveRowSuccess')
      .mockRejectedValueOnce(new Error('Synthetic marker failure'));
    const first = await service.importStarterExcel(
      workbook([
        ['Drug name', 'Current stock'],
        ['Atomic row', 6],
      ]),
      branchId,
      userId,
    );
    expect(first).toMatchObject({ created: 0, skipped: 1, retryableRows: 1 });
    expect(await db.inventoryItem.count({ where: { branchId } })).toBe(0);
    expect(await db.drug.count({ where: { branchId } })).toBe(0);
    expect(await db.stockTransaction.count({ where: { branchId } })).toBe(0);
    marker.mockRestore();
    expect(
      await service.retryFailedRows(first.importId, branchId, userId),
    ).toMatchObject({ created: 1, skipped: 0 });
    expect(await db.stockTransaction.count({ where: { branchId } })).toBe(1);
  });

  it('reconciles a complete legacy aggregate and retries only its recorded database failure', async () => {
    const uploaded = workbook([
      ['Drug name', 'Current stock'],
      ['Legacy saved', 2],
      ['Legacy failed', 3],
    ]);
    const save = (service as any).upsertImportRow.bind(service);
    jest
      .spyOn(service as any, 'upsertImportRow')
      .mockImplementation(async (row: any, ...args: any[]) => {
        if (row.name === 'Legacy failed')
          throw Object.assign(new Error('Temporary'), { code: 'P2024' });
        return save(row, ...args);
      });
    const first = await service.importStarterExcel(uploaded, branchId, userId);
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await db.inventoryMigrationRow.deleteMany({
      where: { importId: first.importId },
    });
    await db.inventoryMigration.update({
      where: { id: first.importId },
      data: { rowTrackingVersion: 0 },
    });
    expect(
      await service.retryFailedRows(first.importId, branchId, userId),
    ).toMatchObject({ created: 2, skipped: 0 });
    expect(await db.stockTransaction.count({ where: { branchId } })).toBe(2);
    await service.retryFailedRows(first.importId, branchId, userId);
    expect(await db.stockTransaction.count({ where: { branchId } })).toBe(2);
  });

  it.each([
    {
      totalRows: 1,
      created: 0,
      updated: 0,
      skipped: 1,
      drugsCreated: 0,
      stockAdjusted: 0,
      errors: [
        {
          row: 2,
          message: 'Database could not finish saving this row (P2028).',
        },
      ],
    },
    null,
    {
      totalRows: 1,
      created: 0,
      updated: 0,
      skipped: 1,
      drugsCreated: 0,
      stockAdjusted: 0,
      errors: [],
    },
    {
      totalRows: 1,
      created: 0,
      updated: 0,
      skipped: 1,
      drugsCreated: 0,
      stockAdjusted: 0,
      errors: [null],
    },
  ])('does not replay uncertain legacy outcomes %j', async (result) => {
    const uploaded = workbook([
      ['Drug name', 'Current stock'],
      ['Unknown legacy', 8],
    ]);
    const migration = await db.inventoryMigration.create({
      data: {
        branchId,
        createdBy: userId,
        fileName: uploaded.originalname,
        sha256: 'legacy-unknown',
        data: uploaded.buffer,
        ...(result ? { result } : {}),
      },
    });
    const outcome = await service.retryFailedRows(
      migration.id,
      branchId,
      userId,
    );
    expect(outcome).toMatchObject({
      created: 0,
      skipped: 1,
      retryableRows: 0,
      reconciliationRequired: 1,
    });
    expect(await db.inventoryItem.count({ where: { branchId } })).toBe(0);
  });

  it('rejects lookup and retry from another branch', async () => {
    const first = await service.importStarterExcel(
      workbook([['Drug name'], ['Scoped row']]),
      branchId,
      userId,
    );
    await expect(
      service.importOutcome(first.importId, 'another-branch'),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.retryFailedRows(first.importId, 'another-branch', userId),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      await db.inventoryMigrationRow.count({
        where: { importId: first.importId },
      }),
    ).toBe(1);
  });

  it('preserves real worksheet failure rows, logs only safe codes and keeps validation failures out of retries', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const fault = jest
      .spyOn(service as any, 'upsertImportRow')
      .mockRejectedValue(
        Object.assign(new Error('Private database details'), { code: 'P2028' }),
      );
    const first = await service.importStarterExcel(
      workbook([['Drug name'], [], ['Private medicine name']]),
      branchId,
      userId,
    );
    expect(first).toMatchObject({ skipped: 1, errors: [{ row: 3 }] });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'inventory_import_row_failed',
        row: 3,
        code: 'P2028',
      }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Private/);
    fault.mockRestore();
    const invalid = await service.importStarterExcel(
      workbook([
        ['Drug name', 'SKU', 'Batch', 'Current stock'],
        ['Duplicate', 'SKU1', 'B1', 1],
        ['Duplicate', 'SKU1', 'B1', 2],
        ['Valid', 'SKU1', 'B2', 3],
      ]),
      branchId,
      userId,
    );
    expect(invalid).toMatchObject({ created: 1, skipped: 2, retryableRows: 0 });
    expect(invalid.errors.map((error) => error.row)).toEqual([2, 3]);
    expect(
      await service.retryFailedRows(invalid.importId, branchId, userId),
    ).toMatchObject({ created: 1, skipped: 2, retryableRows: 0 });
    expect(await db.stockTransaction.count({ where: { branchId } })).toBe(1);
  });

  it('does not overwrite a sale committed after an existing batch was read', async () => {
    await service.importStarterExcel(
      workbook([
        ['Drug name', 'Current stock', 'Reorder level'],
        ['Concurrent sale batch', 10, 9],
      ]),
      branchId,
      userId,
    );
    const item = await db.inventoryItem.findFirstOrThrow({
      where: { branchId },
    });
    const find = (service as any).findImportedInventoryItem.bind(service);
    const readBarrier = jest
      .spyOn(service as any, 'findImportedInventoryItem')
      .mockImplementation(async (tx: any, row: any, branch: string) => {
        const snapshot = await find(tx, row, branch);
        expect(snapshot.currentStock).toBe(10);
        await db.$transaction(async (sale: Prisma.TransactionClient) =>
          writeStockMovement(sale, {
            branchId,
            userId,
            itemId: item.id,
            delta: -1,
            type: 'SALE',
            reference: 'synthetic-concurrent-sale',
          }),
        );
        expect(
          (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
            .currentStock,
        ).toBe(9);
        return snapshot;
      });
    const result = await service.importStarterExcel(
      workbook([
        ['Drug name', 'Current stock', 'Reorder level', 'Description'],
        ['Concurrent sale batch', 10, 9, 'Metadata correction'],
      ]),
      branchId,
      userId,
    );
    readBarrier.mockRestore();
    expect(result).toMatchObject({ created: 0, updated: 1, skipped: 0 });
    const after = await db.inventoryItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(after).toMatchObject({
      currentStock: 9,
      stockStatus: 'LOW_STOCK',
      description: 'Metadata correction',
    });
    const movements = await db.stockTransaction.findMany({
      where: { itemId: item.id },
      select: { type: true, quantityDelta: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(movements).toEqual([
      { type: 'ADJUSTMENT', quantityDelta: 10 },
      { type: 'SALE', quantityDelta: -1 },
    ]);
    expect(
      movements.reduce(
        (balance: number, movement: { quantityDelta: number }) =>
          balance + movement.quantityDelta,
        0,
      ),
    ).toBe(after.currentStock);
  });
});
