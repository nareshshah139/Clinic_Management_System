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
  const admin = () => ({ id: userId, branchId, role: 'ADMIN' });
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

  const staffAndDoctor = async () => {
    const make = (role: string) =>
      db.user.create({
        data: {
          branchId,
          firstName: role,
          lastName: 'Synthetic',
          email: `${role.toLowerCase()}-${branchId}@example.invalid`,
          password: 'no-login',
          role,
        },
      });
    const [staff, doctor] = await Promise.all([make('RECEPTION'), make('DOCTOR')]);
    return {
      staff: { id: staff.id, branchId, role: 'RECEPTION' },
      doctor: { id: doctor.id, branchId, role: 'DOCTOR' },
    };
  };

  it('holds a staff workbook until a doctor approves it, then applies each row once with the same recovery', async () => {
    const { staff, doctor } = await staffAndDoctor();
    await service.importStarterExcel(
      workbook([
        ['Drug name', 'Batch number', 'Current stock'],
        ['Existing batch row', 'EB-1', 12],
      ]),
      admin(),
    );
    const before = await db.stockTransaction.count({ where: { branchId } });
    const held = await service.importStarterExcel(
      workbook([
        ['Drug name', 'Batch number', 'Current stock'],
        ['Approved new row', 'AN-1', 4],
        ['Retry new row', 'RN-1', 6],
        ['Existing batch row', 'EB-1', 12],
      ]),
      staff,
    );
    expect(held).toMatchObject({
      created: 0,
      updated: 0,
      skipped: 3,
      approval: { status: 'PENDING', requestedBy: { id: staff.id } },
    });
    const newRows = { name: { in: ['Approved new row', 'Retry new row'] } };
    expect({
      drugs: await db.drug.count({ where: { branchId, ...newRows } }),
      items: await db.inventoryItem.count({ where: { branchId, ...newRows } }),
      movements: (await db.stockTransaction.count({ where: { branchId } })) - before,
      rows: (
        await db.inventoryMigrationRow.findMany({
          where: { importId: held.importId },
          orderBy: { sourceRow: 'asc' },
        })
      ).map((row: { status: string }) => row.status),
    }).toEqual({ drugs: 0, items: 0, movements: 0, rows: ['PENDING', 'PENDING', 'PENDING'] });
    await expect(
      service.retryFailedRows(held.importId, branchId, staff.id),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await service.pendingImports(doctor))[0].rows.map((row: any) => [row.name, row.batch]),
    ).toEqual([
      ['Approved new row', 'NEW'],
      ['Retry new row', 'NEW'],
      ['Existing batch row', 'EXISTING'],
    ]);

    const marker = (service as any).saveRowSuccess.bind(service);
    let failMarker = true;
    jest
      .spyOn(service as any, 'saveRowSuccess')
      .mockImplementation(async (tx: any, row: any, outcome: any) => {
        if (row.name === 'Retry new row' && failMarker) {
          failMarker = false;
          throw new Error('Synthetic marker failure');
        }
        return marker(tx, row, outcome);
      });
    const [approved, raced] = await Promise.allSettled([
      service.approve(held.importId, doctor),
      service.approve(held.importId, doctor),
    ]);
    const outcomes = [approved, raced].map((r) => r.status).sort();
    expect(outcomes).toEqual(['fulfilled', 'rejected']);
    const winner = [approved, raced].find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>;
    const loser = [approved, raced].find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(winner.value).toMatchObject({
      created: 1,
      updated: 1,
      skipped: 1,
      retryableRows: 1,
      approval: { status: 'APPROVED', reviewedBy: { id: doctor.id } },
    });
    expect(loser.reason).toMatchObject({
      status: 409,
      response: { message: 'This import was already approved' },
    });
    expect({
      retryRowItems: await db.inventoryItem.count({ where: { branchId, name: 'Retry new row' } }),
      retryRowDrugs: await db.drug.count({ where: { branchId, name: 'Retry new row' } }),
      approvedMovers: (
        await db.stockTransaction.findMany({
          where: { branchId, item: { name: 'Approved new row' } },
          select: { userId: true, quantityDelta: true },
        })
      ),
    }).toEqual({
      retryRowItems: 0,
      retryRowDrugs: 0,
      approvedMovers: [{ userId: doctor.id, quantityDelta: 4 }],
    });

    expect(
      await service.retryFailedRows(held.importId, branchId, staff.id),
    ).toMatchObject({ created: 2, updated: 1, skipped: 0, retryableRows: 0 });
    await service.retryFailedRows(held.importId, branchId, staff.id);
    expect(
      await db.inventoryItem.findMany({
        where: { branchId },
        select: { name: true, currentStock: true },
        orderBy: { name: 'asc' },
      }),
    ).toEqual([
      { name: 'Approved new row', currentStock: 4 },
      { name: 'Existing batch row', currentStock: 12 },
      { name: 'Retry new row', currentStock: 6 },
    ]);
    expect((await db.stockTransaction.count({ where: { branchId } })) - before).toBe(2);
    expect(
      await db.auditLog.findMany({
        where: { entityId: held.importId },
        select: { action: true, userId: true },
      }),
    ).toEqual([{ action: 'INVENTORY_IMPORT_APPROVED', userId: doctor.id }]);
  });

  it('applies nothing from a rejected workbook and reopens it when staff upload it again', async () => {
    const { staff, doctor } = await staffAndDoctor();
    const file = workbook([
      ['Drug name', 'Current stock'],
      ['Rejected row', 9],
    ]);
    const held = await service.importStarterExcel(file, staff);
    await expect(service.reject(held.importId, doctor, '')).rejects.toMatchObject({ status: 400 });
    const rejected = await service.reject(held.importId, doctor, 'Last year counts');
    expect(rejected.approval).toMatchObject({ status: 'REJECTED', note: 'Last year counts' });
    await expect(
      service.retryFailedRows(held.importId, branchId, staff.id),
    ).rejects.toMatchObject({
      status: 409,
      response: { message: 'This import was rejected: Last year counts' },
    });
    const reopened = await service.importStarterExcel(file, staff);
    expect(reopened).toMatchObject({
      importId: held.importId,
      created: 0,
      approval: { status: 'PENDING', reviewedBy: null, reviewedAt: null, note: null },
    });
    expect(await db.inventoryItem.count({ where: { branchId } })).toBe(0);
    expect(await db.stockTransaction.count({ where: { branchId } })).toBe(0);
    expect(await service.approve(held.importId, doctor)).toMatchObject({ created: 1 });
    expect(
      await db.inventoryItem.findMany({ where: { branchId }, select: { name: true, currentStock: true } }),
    ).toEqual([{ name: 'Rejected row', currentStock: 9 }]);
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
    const first = await service.importStarterExcel(uploaded, admin());
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
      ]), admin());
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
      service.importStarterExcel(uploaded, admin()),
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
      await service.importStarterExcel(uploaded, admin()),
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
      metadataFile, admin());
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
      ]), admin());
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
    const first = await service.importStarterExcel(uploaded, admin());
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
      workbook([['Drug name'], ['Scoped row']]), admin());
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
      workbook([['Drug name'], [], ['Private medicine name']]), admin());
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
      ]), admin());
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
      ]), admin());
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
      ]), admin());
    readBarrier.mockRestore();
    // A concurrent sale invalidates the metadata revision too; the rejected row must be retryable
    // using a newly reviewed worksheet with the actual balance, without another stock receipt.
    expect(result).toMatchObject({ created: 0, updated: 0, skipped: 1 });
    const rejected = await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(rejected).toMatchObject({ currentStock: 9, description: item.description });
    const corrected = await service.importStarterExcel(workbook([
      ['Drug name', 'Current stock', 'Reorder level', 'Description'],
      ['Concurrent sale batch', 9, 9, 'Metadata correction'],
    ]), admin());
    expect(corrected).toMatchObject({ created: 0, updated: 1, skipped: 0 });
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
