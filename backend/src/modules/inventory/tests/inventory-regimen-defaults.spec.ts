import { inventoryRegimenDefaults } from '../inventory-regimen-defaults';
import { InventoryService } from '../inventory.service';
import { InventoryWorkspaceService } from '../inventory-workspace.service';
import { CreateInventoryItemDto, UpdateInventoryItemDto } from '../dto/inventory.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
const defaults = { defaultDuration: 3, defaultDurationUnit: 'WEEKS', defaultFrequency: '1-0-1', defaultTiming: 'AM/PM', defaultInstructions: 'on the rash' };

it('normalizes optional defaults and allows clearing without a fixed replacement', () => {
  expect(inventoryRegimenDefaults({ ...defaults, defaultDuration: '3', defaultInstructions: ' on the rash ' })).toEqual(defaults);
  expect(inventoryRegimenDefaults({ defaultDuration: '', defaultFrequency: null }, defaults)).toEqual({ defaultDuration: null, defaultFrequency: null });
  expect(inventoryRegimenDefaults({})).toEqual({});
});
it.each([{ defaultDuration: 0 }, { defaultDuration: 1.5 }, { defaultDuration: 'oops' }, { defaultDuration: 2 }, { defaultDurationUnit: 'bad' }, { defaultTiming: 12 }])('rejects invalid values: %j', input => {
  expect(() => inventoryRegimenDefaults(input)).toThrow();
});
it('keeps all default fields through DTO whitelisting on create and update', async () => {
  for (const dto of [CreateInventoryItemDto, UpdateInventoryItemDto]) {
    const value = plainToInstance(dto as typeof CreateInventoryItemDto, defaults);
    await validate(value, { whitelist: true, skipMissingProperties: true });
    expect(value).toMatchObject(defaults);
  }
});
it('persists defaults through the inventory create and update services', async () => {
  const stored = { id: 'item', branchId: 'clinic', ...defaults };
  const db = { inventoryItem: { findFirst: jest.fn().mockResolvedValue(stored), create: jest.fn().mockResolvedValue(stored), update: jest.fn().mockResolvedValue(stored) } };
  const service = new InventoryService(db as any);
  await service.createInventoryItem({ ...defaults, name: 'Cream', type: 'MEDICINE', unit: 'TUBES', costPrice: 1, sellingPrice: 2 } as any, 'clinic');
  expect(db.inventoryItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining(defaults) }));
  await service.updateInventoryItem('item', { defaultDuration: null, defaultInstructions: '' }, 'clinic');
  expect(db.inventoryItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ defaultDuration: null, defaultInstructions: null }) }));
});
it('persists and audits defaults in product details without changing stock', async () => {
  const original = { id: 'item', branchId: 'clinic', updatedAt: new Date(), currentStock: 10, heldStock: 0, metadata: '{}' };
  const tx = { inventoryItem: { findFirst: jest.fn().mockResolvedValue(original), update: jest.fn().mockImplementation(({ data }) => ({ ...original, ...data })) }, auditLog: { create: jest.fn() } };
  const workflow = { permissions: async () => new Set(['inventory:item:update']), transaction: async (work: any) => work(tx) };
  const service = new InventoryWorkspaceService({} as any, workflow as any);
  const result = await service.saveItem({ id: 'user', branchId: 'clinic' } as any, 'item', { updatedAt: original.updatedAt.toISOString(), ...defaults });
  expect(result).toMatchObject({ ...defaults, currentStock: 10 });
  expect(tx.inventoryItem.update.mock.calls[0][0].data).not.toHaveProperty('currentStock');
  expect(JSON.parse(tx.auditLog.create.mock.calls[0][0].data.newValues)).toMatchObject(defaults);
});
