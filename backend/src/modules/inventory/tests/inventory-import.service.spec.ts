import { Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { InventoryImportService } from '../inventory-import.service';

const file = (rows: unknown[][]) => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    'Stock',
  );
  return {
    originalname: 'stock.xlsx',
    buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
  } as Express.Multer.File;
};

describe('Inventory import failure reporting', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports the actual worksheet row after empty rows and logs failures without workbook data', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('Private database details'), {
            code: 'P2028',
          }),
        ),
    };
    const service = new InventoryImportService(prisma as any);
    const result = await service.importStarterExcel(
      file([['Drug name'], [], ['Private medicine name']]),
      'branch',
      'user',
    );
    expect(result).toMatchObject({
      totalRows: 1,
      skipped: 1,
      errors: [{ row: 3, message: expect.any(String) }],
    });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'inventory_import_row_failed',
        row: 3,
        code: 'P2028',
      }),
    );
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'inventory_import_completed',
        skipped: 1,
      }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Private/);
  });
});

describe('Pharmacy stock export compatibility', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([null, ''])(
    'recognizes unnamed header %s and preserves stock, MRP and expiry',
    async (header) => {
      const service = new InventoryImportService({} as any);
      const save = jest
        .spyOn(service as any, 'upsertImportRow')
        .mockResolvedValue({
          status: 'created',
          drugCreated: true,
          stockAdjusted: true,
        });
      const result = await service.importStarterExcel(
        file([
          [
            header,
            'Manufacturer Name',
            'Item Category',
            'Pack Size',
            'Batch',
            'Expiry',
            'Item Gst',
            'Current Stock(Loose)',
            'Average MRP',
            'DOSSAGE FORM',
            'SELLING PRICE',
            'COST PRICE',
          ],
          [],
          [
            'Example medicine',
            'Example manufacturer',
            'Topical',
            '10 g',
            'B1',
            '05/27',
            5,
            12,
            1031.2,
            'Cream',
            1000,
            785.71,
          ],
        ]),
        'branch',
        'user',
      );
      expect(result).toMatchObject({ totalRows: 1, created: 1, skipped: 0 });
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Example medicine',
          category: 'Topical',
          dosageForm: 'Cream',
          currentStock: 12,
          hasCurrentStock: true,
          mrp: 1031.2,
          gstRate: 5,
          expiryDate: '2027-05-31T23:59:59.999Z',
        }),
        'branch',
        'user',
      );
    },
  );

  it('does not guess that an arbitrary unnamed column contains medicine names', async () => {
    const service = new InventoryImportService({} as any);
    const save = jest.spyOn(service as any, 'upsertImportRow');
    const result = await service.importStarterExcel(
      file([
        ['', 'Price'],
        ['123', 10],
      ]),
      'branch',
      'user',
    );
    expect(result.skipped).toBe(1);
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    ['02/28', '2028-02-29T23:59:59.999Z'],
    ['02/2029', '2029-02-28T23:59:59.999Z'],
  ])(
    'reads expiry month %s as the end of that month',
    async (expiry, expected) => {
      const service = new InventoryImportService({} as any);
      const save = jest
        .spyOn(service as any, 'upsertImportRow')
        .mockResolvedValue({ status: 'created' });
      await service.importStarterExcel(
        file([
          ['Drug name', 'Expiry'],
          ['Example', expiry],
        ]),
        'branch',
        'user',
      );
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ expiryDate: expected }),
        'branch',
        'user',
      );
    },
  );
});

describe('Stock import continuation and duplicate handling', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('appends composition-only export rows without creating extra stock rows', async () => {
    const service = new InventoryImportService({} as any);
    const save = jest
      .spyOn(service as any, 'upsertImportRow')
      .mockResolvedValue({ status: 'created' });
    const result = await service.importStarterExcel(
      file([
        [
          null,
          'Manufacturer Name',
          'Current Stock(Loose)',
          'Average MRP',
          'COMPOSITION',
        ],
        ['Medicine', 'Manufacturer', 10, 100, 'Ingredient A'],
        ['', '', '', '', 'Ingredient B'],
        [],
        ['Second medicine', 'Manufacturer', 2, 20, 'Ingredient C'],
      ]),
      'branch',
      'user',
    );
    expect(result).toMatchObject({ totalRows: 2, created: 2, skipped: 0 });
    expect(save.mock.calls[0][0].composition1).toBe(
      'Ingredient A\nIngredient B',
    );
    expect(save.mock.calls[1][0].composition1).toBe('Ingredient C');
  });

  it('rejects both conflicting opening stocks before writing either one, while allowing other batches', async () => {
    const service = new InventoryImportService({} as any);
    const save = jest
      .spyOn(service as any, 'upsertImportRow')
      .mockResolvedValue({ status: 'created' });
    const result = await service.importStarterExcel(
      file([
        ['Drug name', 'SKU', 'Batch', 'Current stock'],
        ['Medicine', 'SKU1', 'B1', 12],
        ['Other name for same medicine', 'SKU1', 'B1', 11],
        ['Medicine', 'SKU1', 'B2', 5],
      ]),
      'branch',
      'user',
    );
    expect(result).toMatchObject({ created: 1, skipped: 2 });
    expect(result.errors.map((error) => error.row)).toEqual([2, 3]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].batchNumber).toBe('B2');
  });

  it('does not match an inventory SKU from a different batch', async () => {
    const service = new InventoryImportService({} as any);
    const tx = {
      inventoryItem: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    await (service as any).findImportedInventoryItem(
      tx,
      { name: 'Medicine', sku: 'SKU1', batchNumber: 'B2' },
      'branch',
    );
    expect(tx.inventoryItem.findFirst.mock.calls[0][0].where).toEqual({
      branchId: 'branch',
      OR: [{ sku: 'SKU1' }],
      batchNumber: { equals: 'B2', mode: 'insensitive' },
    });
  });
});
