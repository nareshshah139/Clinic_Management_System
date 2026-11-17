import { applySpokenPrescriptionItems, resolveSpokenDrug, spokenPrescriptionDraftLines, spokenRowPatch, spokenStrength, suggestSpokenDrug, withStrength } from '@/lib/voice-fill-prescription';
import { applyRegimenSuggestion, beginRegimenSelection, type RegimenRow } from '@/lib/medicine-regimen-defaults';
import type { VoiceFillRow } from '@/lib/voice-fill';

jest.mock('@/lib/api', () => ({ apiClient: {} }));

describe('resolveSpokenDrug', () => {
  it('leaves the name unresolved when the catalog has no candidates', () => {
    expect(resolveSpokenDrug('Augmentin', [])).toBeNull();
  });

  it('resolves one exact match even when other names start with it', () => {
    const candidates = [{ id: 'd1', name: 'Augmentin' }, { id: 'd2', name: 'Augmentin Duo' }];
    expect(resolveSpokenDrug(' augmentin ', candidates)).toEqual({ id: 'd1', name: 'Augmentin' });
  });

  it('does not pick between two exact matches, including recorded names', () => {
    const candidates = [{ id: 'd1', name: 'Crocin' }, { id: 'd2', name: 'Paracetamol 500', knownNames: ['Crocin'] }];
    expect(resolveSpokenDrug('Crocin', candidates)).toBeNull();
  });

  it('resolves the only candidate that starts with the spoken name', () => {
    const candidates = [{ id: 'd3', name: 'Cetirizine 10 mg' }, { id: 'd4', name: 'Levocetirizine' }];
    expect(resolveSpokenDrug('cetirizine', candidates)).toEqual({ id: 'd3', name: 'Cetirizine 10 mg' });
  });

  it('does not pick between two prefix matches', () => {
    expect(resolveSpokenDrug('Azithral', [{ id: 'd5', name: 'Azithral 250' }, { id: 'd6', name: 'Azithral 500' }])).toBeNull();
  });
});

describe('resolveSpokenDrug against /prescriptions/drugs/autocomplete rows', () => {
  // The shape searchClinicInventory returns: stocked items under their standard name ("Cap. <name> <strength>").
  const stocked = (inventoryItemId: string, name: string, totalStock: number) => ({
    id: `drug-${inventoryItemId}`, inventoryItemId, name, genericName: 'Doxycycline', price: 12, gstRate: 12,
    manufacturerName: 'Acme', manufacturer: 'Acme', dosageForm: 'CAPSULE', form: 'CAPSULE', strengthMissing: false,
    knownNames: [], packSizeLabel: '10 capsule', unit: 'STRIPS', packSize: 10, packUnit: 'capsule', totalStock, brandNames: [],
    searchMatch: { score: 90 },
  });
  const doxy100 = stocked('inv-doxy-100', 'Cap. Doxycycline 100 mg', 40);
  const doxy200 = stocked('inv-doxy-200', 'Cap. Doxycycline 200 mg', 15);

  it('reads past the form prefix of a standard name', () => {
    expect(resolveSpokenDrug('doxycycline', [doxy100])?.inventoryItemId).toBe('inv-doxy-100');
    expect(resolveSpokenDrug('Doxycycline', [doxy100], '100 mg')?.inventoryItemId).toBe('inv-doxy-100');
    expect(resolveSpokenDrug('zimba', [{ name: 'Zimba 2% cream' }])).toEqual({ name: 'Zimba 2% cream' });
  });

  it('uses the spoken strength to choose between strengths and never substitutes another', () => {
    expect(resolveSpokenDrug('doxycycline', [doxy100, doxy200])).toBeNull();
    expect(resolveSpokenDrug('doxycycline', [doxy100, doxy200], '100 mg')?.inventoryItemId).toBe('inv-doxy-100');
    expect(resolveSpokenDrug('doxycycline', [doxy200], '100 mg')).toBeNull();
  });

  it('stays unresolved when the medicine is only in the catalog, which the picker never returns', () => {
    expect(resolveSpokenDrug('doxycycline', [], '100 mg')).toBeNull();
  });
});

describe('spoken strength', () => {
  it('is a weight or unit strength, not an amount such as one tablet', () => {
    expect([
      spokenStrength({ drugName: 'x', dosage: 100, dosageUnit: 'MG' }),
      spokenStrength({ drugName: 'x', dosage: 60000, dosageUnit: 'IU' }),
      spokenStrength({ drugName: 'x', dosage: 1, dosageUnit: 'TABLET' }),
      spokenStrength({ drugName: 'x', dosage: 100 }),
    ]).toEqual(['100 mg', '60000 IU', '', '']);
  });

  it('is added to a typed name once', () => {
    expect([withStrength('doxycycline', '100 mg'), withStrength('Doxycycline 100mg', '100 mg'), withStrength('doxycycline', '')])
      .toEqual(['doxycycline 100 mg', 'Doxycycline 100mg', 'doxycycline']);
  });
});

describe('spokenRowPatch', () => {
  const infer = (pattern: string) => (pattern === '1-0-1' ? 'TWICE_DAILY' : null);

  it('keeps a spoken frequency next to its dose pattern and infers one only when missing', () => {
    expect(spokenRowPatch({ frequency: 'THREE_TIMES_DAILY', dosePattern: '1-0-1' }, infer)).toEqual({ frequency: 'THREE_TIMES_DAILY', dosePattern: '1-0-1' });
    expect(spokenRowPatch({ dosePattern: '1-0-1', dosage: 10, dosageUnit: 'MG', route: 'oral', drugName: 'ignored' }, infer)).toEqual({ dosePattern: '1-0-1', frequency: 'TWICE_DAILY', route: 'oral' });
  });
});

type Row = RegimenRow & { drugName: string; dosage: number | ''; dosageUnit: string; applicationSite?: string };

const blank = (): Row => ({
  drugName: '', dosage: '', dosageUnit: 'TABLET', frequency: '', dosePattern: '', duration: '', durationUnit: 'DAYS', instructions: '', timing: '',
});

function setup(initial: Row[]) {
  const box = { items: initial };
  let finishKojicLookup: (error: Error) => void = () => {};
  const deps = {
    lookup: (name: string) => name === 'kojic cream'
      ? new Promise<never>((_, reject) => { finishKojicLookup = reject; })
      : name === 'doxycycline'
        ? Promise.resolve([])
        : Promise.resolve([{ id: 'drug-cet', inventoryItemId: 'inv-cet', name: 'Tab. Cetirizine 10 mg' }]),
    select: (row: Row, drug: { id: string; inventoryItemId: string; name: string }): Row => ({
      ...beginRegimenSelection(row, `sel-${drug.id}`), drugId: drug.id, inventoryItemId: drug.inventoryItemId, drugName: drug.name,
    }),
    createBlank: blank,
    inferFrequency: (pattern: string) => (pattern === '1-0-1' ? 'TWICE_DAILY' : null),
    setItems: (update: (previous: Row[]) => Row[]) => { box.items = update(box.items); },
  };
  return { box, deps, finishKojicLookup: (error: Error) => finishKojicLookup(error) };
}

const spoken: VoiceFillRow[] = [
  { drugName: 'kojic cream', applicationSite: 'face', timing: 'At night', duration: 4, durationUnit: 'WEEKS' },
  { drugName: 'cetirizine', dosage: 10, dosageUnit: 'MG', dosePattern: '1-0-1' },
];

describe('applySpokenPrescriptionItems', () => {
  it('adds spoken rows in spoken order before the trailing blank, and undo restores the original array', async () => {
    const initial = [blank()];
    const { box, deps, finishKojicLookup } = setup(initial);

    const pending = applySpokenPrescriptionItems(spoken, deps);
    await Promise.resolve();
    finishKojicLookup(new Error('lookup failed'));
    const result = await pending;

    expect(box.items).toEqual([
      {
        ...blank(), drugName: 'kojic cream', applicationSite: 'face', timing: 'At night', duration: 4, durationUnit: 'WEEKS',
        regimenState: { touched: ['duration', 'timing'], suggested: [], loading: false, failed: false },
      },
      {
        ...blank(), drugName: 'Tab. Cetirizine 10 mg', drugId: 'drug-cet', inventoryItemId: 'inv-cet', dosePattern: '1-0-1', frequency: 'TWICE_DAILY',
        regimenState: { selection: 'sel-drug-cet', touched: ['frequency'], suggested: [], loading: true },
      },
      blank(),
    ]);
    expect(box.items[2]).toBe(initial[0]);
    expect(result.filled).toEqual([{ label: '2 medicines' }]);

    result.undo();
    expect(box.items).toBe(initial);
  });

  it('keeps spoken values when the usual-values suggestion arrives for the resolved row', async () => {
    const { box, deps, finishKojicLookup } = setup([blank()]);
    const pending = applySpokenPrescriptionItems(spoken, deps);
    await Promise.resolve();
    finishKojicLookup(new Error('lookup failed'));
    await pending;

    const suggested = applyRegimenSuggestion(box.items[1], { frequency: 'ONCE_DAILY', dosePattern: '0-0-1', duration: 5, durationUnit: 'DAYS' }, 'clinic');
    expect([suggested.frequency, suggested.dosePattern, suggested.duration, suggested.durationUnit]).toEqual(['TWICE_DAILY', '1-0-1', 5, 'DAYS']);
  });

  it('never replaces existing rows and adds a blank row when the list had none', async () => {
    const existing = { ...blank(), drugName: 'Doxycycline' };
    const { box, deps } = setup([existing]);
    await applySpokenPrescriptionItems([{ drugName: 'cetirizine' }], deps);
    expect(box.items.map((row) => row.drugName)).toEqual(['Doxycycline', 'Tab. Cetirizine 10 mg', '']);
    expect(box.items[0]).toBe(existing);
  });

  it('shows the spoken strength in the name of a medicine that is not stocked, and in no hidden field', async () => {
    const { box, deps } = setup([blank()]);
    await applySpokenPrescriptionItems([{ drugName: 'doxycycline', dosage: 100, dosageUnit: 'MG', dosePattern: '1-0-1' }], deps);
    expect(box.items[0]).toEqual({
      ...blank(), drugName: 'doxycycline 100 mg', dosePattern: '1-0-1', frequency: 'TWICE_DAILY',
      regimenState: { touched: ['frequency'], suggested: [], loading: false, failed: false },
    });
  });
});

describe('suggestSpokenDrug', () => {
  const item = (name: string) => ({ inventoryItemId: `inv-${name}`, name, knownNames: [] as string[] });
  const teczine = item('Tab. Teczine 10 mg');
  const stock = [
    teczine, item('Tab. Telma 40 mg'), item('Tab. Tecfix 200 mg'), item('Tab. Atarax 25 mg'), item('Tab. Levocet 5 mg'),
    item('Tenovate cream'), item('Cap. Sotret 20 mg'), item('Fucidin cream'), item('Fucibet cream'),
  ];
  const suggested = (spoken: string, candidates = stock, strength = '') => suggestSpokenDrug(spoken, candidates, strength)?.name ?? null;

  it('offers the stocked brand for each way the accent test transcribed "Teczine"', () => {
    expect(['Texine', 'Taxine', 'Texanin', 'Tekzin'].map((spoken) => suggested(spoken))).toEqual(Array(4).fill('Tab. Teczine 10 mg'));
  });

  it('offers Fucidin for "Fusidic cream": they share every consonant sound but the last, and Fucibet trails far behind', () => {
    expect(suggested('Fusidic cream')).toBe('Fucidin cream');
  });

  it('offers Sotret when the transcript glued a syllable in front of it', () => {
    expect(suggested('Absotret')).toBe('Cap. Sotret 20 mg');
  });

  it('offers nothing when a second stocked brand sounds about as close', () => {
    const withTaximO = [...stock, item('Tab. Taxim-O 200 mg')];
    expect([suggested('Taxine', withTaximO), suggested('Texine', withTaximO)]).toEqual([null, 'Tab. Teczine 10 mg']);
    expect([suggested('Texanin', [...stock, item('Tab. Texa 5 mg')]), suggested('Tekzin', [...stock, item('Tab. Texa 5 mg')])])
      .toEqual([null, 'Tab. Teczine 10 mg']);
  });

  it('offers nothing when two strengths of the brand are stocked and none was spoken', () => {
    const both = [...stock, item('Tab. Teczine 5 mg')];
    expect([suggested('Texine', both), suggested('Texine', both, '5 mg')]).toEqual([null, 'Tab. Teczine 5 mg']);
  });

  it('never offers an item whose strength contradicts the spoken one', () => {
    expect([suggested('Texine', stock, '20 mg'), suggested('Texine', stock, '10 mg'), suggested('Texine 20 mg')])
      .toEqual([null, 'Tab. Teczine 10 mg', null]);
  });

  it('does not offer a brand that opens with a different sound', () => {
    expect([suggested('Betnovate'), suggested('Cetzine'), suggested('Tenovat')]).toEqual([null, null, 'Tenovate cream']);
  });

  it('matches a recorded earlier name of an item', () => {
    const renamed = { inventoryItemId: 'inv-lc', name: 'Tab. Levocetirizine 5 mg', knownNames: ['Teczine 5 mg'] };
    expect(suggestSpokenDrug('Tekzin', [renamed, item('Tab. Telma 40 mg')])).toBe(renamed);
  });

  it('offers nothing for a short name or an empty stock list', () => {
    expect([suggested('Tex'), suggested('Texine', [])]).toEqual([null, null]);
  });
});

describe('suggestions while applying spoken medicines', () => {
  const teczine = { id: 'drug-teczine', inventoryItemId: 'inv-teczine', name: 'Tab. Teczine 10 mg', knownNames: [] };
  const telma = { id: 'drug-telma', inventoryItemId: 'inv-telma', name: 'Tab. Telma 40 mg', knownNames: [] };
  const cetirizine = { id: 'drug-cet', inventoryItemId: 'inv-cet', name: 'Tab. Cetirizine 10 mg', knownNames: [] };
  const stock = [teczine, telma, cetirizine];
  // Clinic stock search matches substrings of standard names.
  const lookup = async (q: string) => stock.filter((drug) => drug.name.toLowerCase().includes(q.toLowerCase()));

  it('offers a stocked item, found by the first letters of the name, for each unresolved row only', async () => {
    const { box, deps } = setup([blank()]);
    const offers: [string, string][] = [];
    await applySpokenPrescriptionItems(
      [{ drugName: 'texine', dosage: 10, dosageUnit: 'MG' }, { drugName: 'cetirizine' }, { drugName: 'kojic soap' }],
      { ...deps, lookup, suggest: (rowDrugName: string, drug: { name: string }) => offers.push([rowDrugName, drug.name]) },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(box.items.map((row) => row.drugName)).toEqual(['texine 10 mg', 'Tab. Cetirizine 10 mg', 'kojic soap', '']);
    expect(offers).toEqual([['texine 10 mg', 'Tab. Teczine 10 mg']]);
  });
});

describe('spokenPrescriptionDraftLines', () => {
  it('gives one line per spoken medicine with its dose, pattern and duration, and none for a row without a drug name', () => {
    const rows = [
      { drugName: 'telma', dosage: 40, dosageUnit: 'MG', frequency: 'ONCE_DAILY', duration: 2, durationUnit: 'WEEKS' },
      { drugName: '', duration: 3 },
      { drugName: 'kojic soap' },
    ];
    expect(spokenPrescriptionDraftLines(rows)).toEqual([
      { id: 'prescriptionItems:0', label: 'Medicine 1', value: 'telma, 40 mg, once daily, 2 weeks', fields: { prescriptionItems: [rows[0]] } },
      { id: 'prescriptionItems:1', label: 'Medicine 2', value: 'kojic soap', fields: { prescriptionItems: [rows[2]] } },
    ]);
    expect(spokenPrescriptionDraftLines(undefined)).toEqual([]);
  });
});
