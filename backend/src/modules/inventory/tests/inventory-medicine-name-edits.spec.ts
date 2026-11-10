import { InventoryWorkspaceService } from '../inventory-workspace.service';

describe('editing a medicine into the standard name format', () => {
  const actor = { id: 'pharmacist', branchId: 'clinic' } as any;
  const recorded = {
    id: 'batch',
    branchId: 'clinic',
    name: '13 74 | Flutas 150Mg(Pc)',
    brandName: null,
    type: 'MEDICINE',
    form: null,
    strength: null,
    isCombination: false,
    itemCode: null,
    unit: 'STRIPS',
    packSize: 10,
    packUnit: 'tablets',
    currentStock: 30,
    heldStock: 0,
    costPrice: 40,
    sellingPrice: 60,
    updatedAt: new Date('2026-11-01'),
    metadata: null,
  };
  let tx: any, service: InventoryWorkspaceService;
  const load = (item: any) => {
    tx = {
      inventoryItem: {
        findFirst: jest.fn().mockResolvedValue(item),
        update: jest.fn().mockImplementation(async ({ data }) => ({ ...item, ...data })),
      },
      auditLog: { create: jest.fn() },
    };
    service = new InventoryWorkspaceService(
      {} as any,
      { permissions: async () => new Set(['inventory:item:update']), transaction: (run: any) => run(tx) } as any,
      {} as any,
    );
  };
  const edit = (item: any, input: Record<string, any>) =>
    service.saveItem(actor, item.id, { updatedAt: item.updatedAt.toISOString(), ...input });

  it('names the item from its form, name and strength and keeps the recorded name', async () => {
    load(recorded);
    const saved = await edit(recorded, { name: recorded.name, form: 'TABLET', brandName: 'Flutas', strength: '150Mg', itemCode: '13 74' });
    expect(saved).toMatchObject({ name: 'Tab. Flutas 150 mg', brandName: 'Flutas', form: 'TABLET', strength: '150 mg', itemCode: '13 74', currentStock: 30 });
    expect(JSON.parse(saved.metadata).nameNormalization).toEqual({
      version: 1,
      aliases: ['13 74 | Flutas 150Mg(Pc)'],
      recordedName: '13 74 | Flutas 150Mg(Pc)',
    });
    expect(JSON.parse(tx.auditLog.create.mock.calls[0][0].data.oldValues)).toMatchObject({ name: '13 74 | Flutas 150Mg(Pc)', form: null });
  });

  it('prints no strength once the combination box is ticked', async () => {
    const item = { ...recorded, name: 'Cap. Antoxid-HC 50 mg', brandName: 'Antoxid-HC', form: 'CAPSULE', strength: '50 mg' };
    load(item);
    expect((await edit(item, { isCombination: true })).name).toBe('Cap. Antoxid-HC');
  });

  it('refuses to clear a saved strength but lets an unknown strength stay blank', async () => {
    const named = { ...recorded, name: 'Tab. Flutas 150 mg', brandName: 'Flutas', form: 'TABLET', strength: '150 mg' };
    load(named);
    await expect(edit(named, { strength: '' })).rejects.toThrow('Enter the strength, for example 150 mg, or tick Combination product.');
    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
    const unknown = { ...recorded, name: 'Tab. Acnosis', brandName: 'Acnosis', form: 'TABLET', strength: null };
    load(unknown);
    expect((await edit(unknown, { storageLocation: 'A-1', brandName: 'Acnosis', strength: '' })).name).toBe('Tab. Acnosis');
  });

  it('keeps a typed name for an item without a form', async () => {
    load(recorded);
    expect((await edit(recorded, { name: 'Cotton roll' })).name).toBe('Cotton roll');
  });
});
