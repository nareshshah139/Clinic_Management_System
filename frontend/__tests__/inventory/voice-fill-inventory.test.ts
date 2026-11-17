import { applyInventoryVoiceFill, inventoryVoiceDraftLines, type InventoryVoiceState } from '@/lib/voice-fill-inventory';

const blank = { type: 'MEDICINE' } as InventoryVoiceState;
const heard = { name: 'Paracetamol', form: 'TABLET', strength: '500 mg', batchNumber: 'B12', mrp: 30, unit: 'STRIPS', unknown: 'x' };

describe('inventoryVoiceDraftLines', () => {
  it('lists each fillable field with its label and readable value, in form order', () => {
    expect(inventoryVoiceDraftLines(heard).map(({ id, label, value }) => [id, label, value])).toEqual([
      ['name', 'Name', 'Paracetamol'],
      ['form', 'Form', 'TABLET'],
      ['strength', 'Strength', '500 mg'],
      ['mrp', 'MRP', '30'],
      ['unit', 'Unit', 'STRIPS'],
      ['batchNumber', 'Batch number', 'B12'],
    ]);
  });

  it('names exactly the labels applyInventoryVoiceFill reports as filled', () => {
    const update = jest.fn();
    const filled = applyInventoryVoiceFill(heard, blank, update).filled.map((entry) => entry.label);
    expect(inventoryVoiceDraftLines(heard).map((line) => line.label).sort()).toEqual([...filled].sort());
    expect([...filled].sort()).toEqual(['Batch number', 'Form', 'MRP', 'Name', 'Strength', 'Unit']);
  });

  it('drops a value of the wrong kind, as apply does', () => {
    const fields = { name: 'Gauze', mrp: 'thirty', requiresPrescription: 'yes' };
    expect(inventoryVoiceDraftLines(fields).map((line) => line.label)).toEqual(['Name']);
    expect(applyInventoryVoiceFill(fields, blank, jest.fn()).filled.map((entry) => entry.label)).toEqual(['Name']);
  });

  it('omits medicine-only fields for a non-medicine item, as apply does', () => {
    const fields = { type: 'EQUIPMENT', name: 'Cotton roll', form: 'TABLET', strength: '5 mg' };
    expect(inventoryVoiceDraftLines(fields).map((line) => line.label)).toEqual(['Type', 'Name']);
    expect(applyInventoryVoiceFill(fields, blank, jest.fn()).filled.map((entry) => entry.label).sort()).toEqual(['Name', 'Type']);
  });

  it('changes nothing when called', () => {
    const fields = Object.freeze({ ...heard });
    expect(() => inventoryVoiceDraftLines(fields)).not.toThrow();
  });
});
