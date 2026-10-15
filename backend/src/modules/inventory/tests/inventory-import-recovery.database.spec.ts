import { Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { InventoryImportService } from '../inventory-import.service';
import { localDatabase } from '../../../shared/testing/local-database';

const databaseTests = process.env.OPENING_IMPORT_TEST_DATABASE_URL ? describe : describe.skip;
const workbook = (rows: unknown[][]) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Stock');
  return { originalname: 'opening.xlsx', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) } as Express.Multer.File;
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
    fixture = await localDatabase(process.env.OPENING_IMPORT_TEST_DATABASE_URL!);
    db = fixture.prisma;
    branchId = (await db.branch.create({ data: { name: 'Synthetic import recovery', address: 'test' } })).id;
    userId = (await db.user.create({ data: { branchId, firstName: 'Test', lastName: 'Import', email: 'import@example.invalid', password: 'no-login', role: 'ADMIN' } })).id;
    service = new InventoryImportService(db);
  }, 60000);
  afterAll(async () => { await fixture?.cleanup(); jest.restoreAllMocks(); });

  it('retries only failed rows after a database failure and preserves successful stock', async () => {
    const save = (service as any).upsertImportRow.bind(service);
    let fail = true;
    jest.spyOn(service as any, 'upsertImportRow').mockImplementation(async (row: any, ...args: any[]) => {
      if (row.name === 'Retry row' && fail) {
        fail = false;
        throw Object.assign(new Error('Synthetic transaction timeout'), { code: 'P2028' });
      }
      return save(row, ...args);
    });
    const uploaded = workbook([['Drug name', 'Current stock'], ['Saved row', 4], ['Retry row', 7]]);
    const first = await service.importStarterExcel(uploaded, branchId, userId);
    expect(first).toMatchObject({ created: 1, skipped: 1 });
    const retried = await (service as any).retryFailedRows(first.importId, branchId, userId);
    expect(retried).toMatchObject({ totalRows: 2, created: 2, skipped: 0, errors: [] });
    expect(await db.inventoryItem.findMany({ where: { branchId }, select: { name: true, currentStock: true }, orderBy: { name: 'asc' } })).toEqual([
      { name: 'Retry row', currentStock: 7 }, { name: 'Saved row', currentStock: 4 },
    ]);
    expect(await db.stockTransaction.count({ where: { branchId } })).toBe(2);
    await (service as any).retryFailedRows(first.importId, branchId, userId);
    expect(await db.stockTransaction.count({ where: { branchId } })).toBe(2);
  });
});
