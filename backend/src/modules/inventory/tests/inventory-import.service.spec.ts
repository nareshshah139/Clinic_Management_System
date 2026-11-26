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
      const result = await service.previewStarterExcel(
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
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        name: 'Example medicine',
        category: 'Topical',
        dosageForm: 'Cream',
        currentStock: 12,
        hasCurrentStock: true,
        mrp: 1031.2,
        gstRate: 5,
        expiryDate: '2027-05-31T23:59:59.999Z',
      });
    },
  );

  const U = undefined;
  it.each([
    ['1x10', 'PIECES', 1],
    ['1*10', 'PIECES', U],
    ['1 x 10', 'PIECES', 1],
    ['1×10', 'PIECES', U],
    ['1X15', 'PIECES', 1],
    ['2x10', 'PIECES', 2],
    ['3x10x1', 'PIECES', 3],
    ['10x1', 'PIECES', 10],
    ['10x10', 'PIECES', 10],
    ['1x1', 'PIECES', 1],
    ["10's", 'PIECES', U],
    ['Strip of 10', 'STRIPS', 10],
    ['10 tablets', 'STRIPS', 10],
    ['60 caps', 'PIECES', 60],
    ['100ml', 'BOTTLES', 100],
    ['15gm', 'TUBES', 15],
    ['1x15gm', 'PIECES', 1],
    ['1x100ml', 'PIECES', 1],
    ['5x2ml', 'PIECES', 5],
    ['1x10 tablets', 'STRIPS', 10],
    ['1 x 10 Tablets', 'STRIPS', 10],
    ['1×15 capsules', 'STRIPS', 15],
    ['1x10 strip', 'STRIPS', 10],
    ['2x10 strip', 'STRIPS', 10],
    ['10x10 tablets', 'STRIPS', 10],
    ['10x1 tablets', 'STRIPS', U],
    ['3x10x1 tablets', 'STRIPS', U],
    ['1x100ml strip', 'STRIPS', U],
    ['2x10 box', 'BOXES', 20],
    ['10x10 box', 'BOXES', 100],
    ['3x10x1 box', 'BOXES', U],
    ['5x2ml bottle', 'BOTTLES', 5],
    ['1x15gm tube', 'TUBES', 1],
  ])('imports pack size %s as %s with %s units per stock unit', async (packSize, unit, units) => {
    const service = new InventoryImportService({} as any);
    const result = await service.previewStarterExcel(
      file([
        ['Drug name', 'Pack Size', 'Current Stock(Loose)'],
        ['Tab. Example', packSize, 20],
      ]),
    );
    expect({ unit: result.rows[0].unit, packSize: result.rows[0].packSize }).toEqual({ unit, packSize: units });
  });

  it('does not guess that an arbitrary unnamed column contains medicine names', async () => {
    const service = new InventoryImportService({} as any);
    const result = await service.previewStarterExcel(
      file([
        ['', 'Price'],
        ['123', 10],
      ]),
    );
    expect(result.rows).toEqual([
      { sourceRow: 2, error: 'Product name is required' },
    ]);
  });

  it.each([
    ['02/28', '2028-02-29T23:59:59.999Z'],
    ['02/2029', '2029-02-28T23:59:59.999Z'],
  ])(
    'reads expiry month %s as the end of that month',
    async (expiry, expected) => {
      const service = new InventoryImportService({} as any);
      const result = await service.previewStarterExcel(
        file([
          ['Drug name', 'Expiry'],
          ['Example', expiry],
        ]),
      );
      expect(result.rows[0]).toMatchObject({ expiryDate: expected });
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
    const result = await service.previewStarterExcel(
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
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      composition1: 'Ingredient A\nIngredient B',
    });
    expect(result.rows[1]).toMatchObject({ composition1: 'Ingredient C' });
  });

  it('rejects both conflicting opening stocks before writing either one, while allowing other batches', async () => {
    const service = new InventoryImportService({} as any);
    const result = await service.previewStarterExcel(
      file([
        ['Drug name', 'SKU', 'Batch', 'Current stock'],
        ['Medicine', 'SKU1', 'B1', 12],
        ['Other name for same medicine', 'SKU1', 'B1', 11],
        ['Medicine', 'SKU1', 'B2', 5],
      ]),
    );
    expect(
      result.rows.filter((row) => 'error' in row).map((row) => row.sourceRow),
    ).toEqual([2, 3]);
    expect(result.rows[2]).toMatchObject({ batchNumber: 'B2' });
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
