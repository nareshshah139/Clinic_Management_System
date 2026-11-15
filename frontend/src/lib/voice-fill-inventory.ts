import { applyVoiceFillRegistry, stateRegistry, type StateFieldSpec, type VoiceFillFields } from '@/lib/voice-fill';

export interface InventoryVoiceState {
  type: string;
  name: string;
  form: string;
  strength: string;
  genericName: string;
  description: string;
  category: string;
  subCategory: string;
  manufacturer: string;
  supplier: string;
  costPrice: string;
  sellingPrice: string;
  mrp: string;
  unit: string;
  packSize: string;
  packUnit: string;
  batchNumber: string;
  expiryDate: string;
  hsnCode: string;
  gstRate: string;
  storageLocation: string;
  storageConditions: string;
  requiresPrescription: boolean;
  reorderLevel: string;
  minStockLevel: string;
  defaultFrequency: string;
  defaultDuration: string;
  defaultDurationUnit: string;
  defaultInstructions: string;
}

type InventoryVoiceKey = keyof InventoryVoiceState;

const text = (label: string, elementId?: string): StateFieldSpec => ({ label, kind: 'text', elementId });
const num = (label: string, elementId?: string): StateFieldSpec => ({ label, kind: 'number', elementId });

const INVENTORY_FIELDS: Record<InventoryVoiceKey, StateFieldSpec> = {
  type: text('Type', 'type'),
  name: text('Name'),
  form: text('Form', 'medicine-form'),
  strength: text('Strength', 'medicine-strength'),
  genericName: text('Generic name', 'genericName'),
  description: text('Description', 'description'),
  category: text('Category', 'category'),
  subCategory: text('Sub-category', 'subCategory'),
  manufacturer: text('Manufacturer', 'manufacturer'),
  supplier: text('Supplier', 'supplier'),
  costPrice: num('Cost price', 'costPrice'),
  sellingPrice: num('Selling price', 'sellingPrice'),
  mrp: num('MRP', 'mrp'),
  unit: text('Unit', 'unit'),
  packSize: num('Pack size', 'packSize'),
  packUnit: text('Pack unit', 'packUnit'),
  batchNumber: text('Batch number', 'batchNumber'),
  expiryDate: text('Expiry date', 'expiryDate'),
  hsnCode: text('HSN code', 'hsnCode'),
  gstRate: num('GST rate', 'gstRate'),
  storageLocation: text('Storage location', 'storageLocation'),
  storageConditions: text('Storage conditions', 'storageConditions'),
  requiresPrescription: { label: 'Requires prescription', kind: 'boolean', elementId: 'requiresPrescription' },
  reorderLevel: num('Reorder level', 'reorderLevel'),
  minStockLevel: num('Minimum stock', 'minStockLevel'),
  defaultFrequency: text('Default frequency'),
  defaultDuration: num('Default duration'),
  defaultDurationUnit: text('Default duration unit'),
  defaultInstructions: text('Default instructions'),
};

// These inputs are not rendered unless the item is a medicine, so filling them would be invisible.
const MEDICINE_ONLY = new Set<InventoryVoiceKey>([
  'form', 'strength', 'defaultFrequency', 'defaultDuration', 'defaultDurationUnit', 'defaultInstructions',
]);

export function applyInventoryVoiceFill(
  fields: VoiceFillFields,
  current: InventoryVoiceState,
  update: (patch: Partial<InventoryVoiceState>) => void,
) {
  const nextType = typeof fields.type === 'string' ? fields.type : current.type;
  const isMedicine = nextType === 'MEDICINE';
  const spec = Object.fromEntries(
    (Object.keys(INVENTORY_FIELDS) as InventoryVoiceKey[])
      .filter((key) => isMedicine || !MEDICINE_ONLY.has(key))
      .map((key) => [key, key === 'name' ? { ...INVENTORY_FIELDS.name, elementId: isMedicine ? 'medicine-name' : 'name' } : INVENTORY_FIELDS[key]]),
  );
  return applyVoiceFillRegistry(stateRegistry(spec, current, update), fields);
}
