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
