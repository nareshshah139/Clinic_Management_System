import { DrugService } from '../drug.service';

it('creates multiple products without optional barcodes or SKUs', async () => {
  const identifiers = new Set<string>();
  const prisma = { drug: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }) => {
      for (const field of ['barcode', 'sku']) {
        if (data[field] != null) {
          const key = `${field}:${data[field]}`;
          if (identifiers.has(key)) throw new Error(`Unique constraint failed on ${field}`);
          identifiers.add(key);
        }
      }
      return data;
    }),
  } };
  const service = new DrugService(prisma as any);
  const product = { name: 'First', type: 'cosmetic', price: 10, manufacturerName: 'Maker', packSizeLabel: '1', category: 'Skin', barcode: '', sku: '' };

  await service.create(product as any, 'branch');
  await expect(service.create({ ...product, name: 'Second' } as any, 'branch')).resolves.toMatchObject({
    name: 'Second', barcode: null, sku: null,
  });
});

it('rejects a nonblank duplicate barcode before creating a drug', async () => {
  const prisma = { drug: {
    findFirst: jest.fn().mockResolvedValue({ barcode: '12345' }),
    create: jest.fn(),
  } };
  const service = new DrugService(prisma as any);
  const product = { name: 'Product', type: 'cosmetic', price: 10, manufacturerName: 'Maker', packSizeLabel: '1', category: 'Skin', barcode: ' 12345 ', sku: '' };

  await expect(service.create(product as any, 'branch')).rejects.toThrow('A drug with this barcode already exists');
  expect(prisma.drug.create).not.toHaveBeenCalled();
});
