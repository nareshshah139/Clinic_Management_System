import { applyPatientVoiceFill, type PatientVoiceState } from '@/lib/voice-fill-patient';
import { applyInventoryVoiceFill, type InventoryVoiceState } from '@/lib/voice-fill-inventory';
import { mergeCaseInsensitive, visitVoiceRegistry, type VisitVoiceBindings } from '@/lib/voice-fill-visit';
import { appendOnNewLine, applyVoiceFillRegistry } from '@/lib/voice-fill';

jest.mock('@/lib/api', () => ({ apiClient: {} }));

function stateHolder<T extends object>(initial: T) {
  const box = { state: initial };
  return { box, update: (patch: Partial<T>) => { box.state = { ...box.state, ...patch }; } };
}

describe('patient voice fill', () => {
  const QUICK_IDS = { firstName: 'quick-first', age: 'quick-age', gender: 'quick-gender' };
  const emptyQuick = { firstName: '', age: '', gender: 'OTHER', phone: '9876543210' };

  it('fills only the returned keys, stringifies age, and reports labels with element ids', () => {
    const { box, update } = stateHolder<Partial<PatientVoiceState>>({ ...emptyQuick });
    const result = applyPatientVoiceFill({ firstName: 'Ramesh', age: 42, gender: 'MALE' }, QUICK_IDS, box.state, update);

    expect(box.state).toEqual({ firstName: 'Ramesh', age: '42', gender: 'MALE', phone: '9876543210' });
    expect(result.filled).toEqual([
      { label: 'First name', elementId: 'quick-first' },
      { label: 'Age', elementId: 'quick-age' },
      { label: 'Gender', elementId: 'quick-gender' },
    ]);
  });

  it('undo restores the original values', () => {
    const { box, update } = stateHolder<Partial<PatientVoiceState>>({ ...emptyQuick });
    const result = applyPatientVoiceFill({ firstName: 'Ramesh', age: 42, gender: 'MALE' }, QUICK_IDS, box.state, update);
    result.undo();
    expect(box.state).toEqual(emptyQuick);
  });

  it('ignores keys the dialog does not have', () => {
    const { box, update } = stateHolder<Partial<PatientVoiceState>>({ ...emptyQuick });
    const result = applyPatientVoiceFill({ address: '12 MG Road', firstName: 'Asha' }, QUICK_IDS, box.state, update);
    expect(box.state).toEqual({ ...emptyQuick, firstName: 'Asha' });
    expect(result.filled).toEqual([{ label: 'First name', elementId: 'quick-first' }]);
  });

  it('fills nothing when the server returned no fields', () => {
    const { box, update } = stateHolder<Partial<PatientVoiceState>>({ ...emptyQuick });
    expect(applyPatientVoiceFill({}, QUICK_IDS, box.state, update).filled).toEqual([]);
    expect(box.state).toEqual(emptyQuick);
  });
});

describe('inventory voice fill', () => {
  const blank: InventoryVoiceState = {
    type: 'MEDICINE', name: '', form: '', strength: '', genericName: '', description: '', category: '', subCategory: '',
    manufacturer: '', supplier: '', costPrice: '', sellingPrice: '', mrp: '', unit: 'PIECES', packSize: '', packUnit: '',
    batchNumber: '', expiryDate: '', hsnCode: '', gstRate: '', storageLocation: '', storageConditions: '',
    requiresPrescription: false, reorderLevel: '', minStockLevel: '', defaultFrequency: '', defaultDuration: '',
    defaultDurationUnit: 'DAYS', defaultInstructions: '',
  };

  it('stores numbers as strings and booleans as booleans, and undo restores', () => {
    const { box, update } = stateHolder({ ...blank });
    const result = applyInventoryVoiceFill(
      { name: 'Augmentin', form: 'TABLET', strength: '625 mg', sellingPrice: 189.5, packSize: 10, requiresPrescription: true, expiryDate: '2027-03-31' },
      box.state, update,
    );
    expect(box.state).toEqual({
      ...blank, name: 'Augmentin', form: 'TABLET', strength: '625 mg', sellingPrice: '189.5', packSize: '10',
      requiresPrescription: true, expiryDate: '2027-03-31',
    });
    expect(result.filled.map((f) => f.label)).toEqual(['Name', 'Form', 'Strength', 'Selling price', 'Pack size', 'Requires prescription', 'Expiry date']);
    expect(result.filled[0].elementId).toBe('medicine-name');
    result.undo();
    expect(box.state).toEqual(blank);
  });

  it('skips medicine-only fields when the item is not a medicine', () => {
    const { box, update } = stateHolder({ ...blank, type: 'EQUIPMENT' });
    const result = applyInventoryVoiceFill({ name: 'BP monitor', form: 'TABLET', strength: '5 mg' }, box.state, update);
    expect(box.state).toEqual({ ...blank, type: 'EQUIPMENT', name: 'BP monitor' });
    expect(result.filled).toEqual([{ label: 'Name', elementId: 'name' }]);
  });
});

describe('visit voice fill', () => {
  it('appends narrative text on a new line and leaves empty fields without a leading newline', () => {
    expect(appendOnNewLine('Itchy rash for 3 days', 'Worse at night')).toBe('Itchy rash for 3 days\nWorse at night');
    expect(appendOnNewLine('Itchy rash  \n', 'Worse at night')).toBe('Itchy rash\nWorse at night');
    expect(appendOnNewLine('', 'Worse at night')).toBe('Worse at night');
  });

  it('merges investigations case-insensitively without duplicates', () => {
    expect(mergeCaseInsensitive(['CBC', 'TSH'], ['cbc', ' Vitamin D ', 'vitamin d', 'HbA1c'])).toEqual(['CBC', 'TSH', 'Vitamin D', 'HbA1c']);
  });

  function bindings() {
    const box = {
      chiefComplaints: 'Acne on face', diagnosis: 'Acne', heightCm: '' as number | '', dm: false,
      investigations: ['CBC'], skinConcerns: new Set(['Acne']), touched: [] as string[], extra: { temp: '' },
    };
    const b: VisitVoiceBindings = {
      heightCm: [box.heightCm, (v) => { box.heightCm = v; }],
      weightKg: ['', () => {}], bpSystolic: ['', () => {}], bpDiastolic: ['', () => {}], pulse: ['', () => {}],
      chiefComplaints: [box.chiefComplaints, (v) => { box.chiefComplaints = v; }],
      skinConcerns: [box.skinConcerns, (v) => { box.skinConcerns = v; }],
      diagnosis: [box.diagnosis, (v) => { box.diagnosis = v; }],
      pastHistory: ['', () => {}], medicationHistory: ['', () => {}], menstrualHistory: ['', () => {}],
      familyHistoryDiabetes: [box.dm, (v) => { box.dm = v; box.touched.push('dm'); }],
      familyHistoryHypertension: [false, () => {}], familyHistoryThyroid: [false, () => {}], familyHistoryOthers: ['', () => {}],
      examination: ['', () => {}], fitzpatrickSkinType: ['', () => {}], acneSeverity: ['', () => {}], itchScore: ['', () => {}],
      procedures: ['', () => {}], procedurePlanned: ['', () => {}], followUpInstructions: ['', () => {}],
      investigations: [box.investigations, (v) => { box.investigations = v; }],
      applyExtraVitals: (patch) => {
        const before = box.extra.temp;
        box.extra = { temp: String(patch.temperatureF) };
        return () => { box.extra = { temp: before }; };
      },
    };
    return { box, registry: visitVoiceRegistry(b) };
  }

  it('applies a mixed transcript and undo puts every touched field back', () => {
    const { box, registry } = bindings();
    const result = applyVoiceFillRegistry(registry, {
      chiefComplaints: 'Burning sensation', diagnosis: 'Acne vulgaris', heightCm: 168, familyHistoryDiabetes: true,
      investigations: ['cbc', 'LFT'], skinConcerns: ['Acne', 'Redness'], temperatureF: 99.1, bogusKey: 'ignored',
    });

    expect(box.chiefComplaints).toBe('Acne on face\nBurning sensation');
    expect(box.diagnosis).toBe('Acne vulgaris');
    expect(box.heightCm).toBe(168);
    expect(box.dm).toBe(true);
    expect(box.touched).toEqual(['dm']);
    expect(box.investigations).toEqual(['CBC', 'LFT']);
    expect([...box.skinConcerns]).toEqual(['Acne', 'Redness']);
    expect(box.extra.temp).toBe('99.1');
    expect(result.filled.map((f) => f.label).sort()).toEqual([
      'Chief complaints', 'Diagnosis', 'Family history: diabetes', 'Height', 'Investigations', 'Skin concerns', 'Temperature',
    ]);

    result.undo();
    expect(box.chiefComplaints).toBe('Acne on face');
    expect(box.diagnosis).toBe('Acne');
    expect(box.heightCm).toBe('');
    expect(box.dm).toBe(false);
    expect(box.investigations).toEqual(['CBC']);
    expect([...box.skinConcerns]).toEqual(['Acne']);
    expect(box.extra.temp).toBe('');
  });

  it('does not report investigations that are all duplicates as filled', () => {
    const { registry } = bindings();
    expect(applyVoiceFillRegistry(registry, { investigations: ['cbc'] }).filled).toEqual([]);
  });
});
