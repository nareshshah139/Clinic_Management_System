import { applySpokenPrescriptionItems, resolveSpokenDrug, spokenRowPatch } from '@/lib/voice-fill-prescription';
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

describe('spokenRowPatch', () => {
  const infer = (pattern: string) => (pattern === '1-0-1' ? 'TWICE_DAILY' : null);

  it('keeps a spoken frequency next to its dose pattern and infers one only when missing', () => {
    expect(spokenRowPatch({ frequency: 'THREE_TIMES_DAILY', dosePattern: '1-0-1' }, infer)).toEqual({ frequency: 'THREE_TIMES_DAILY', dosePattern: '1-0-1' });
    expect(spokenRowPatch({ dosePattern: '1-0-1', dosage: 10, route: 'oral', drugName: 'ignored' }, infer)).toEqual({ dosePattern: '1-0-1', frequency: 'TWICE_DAILY', dosage: 10, route: 'oral' });
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
      : Promise.resolve([{ id: 'drug-cet', inventoryItemId: 'inv-cet', name: 'Cetirizine' }]),
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
        ...blank(), drugName: 'Cetirizine', drugId: 'drug-cet', inventoryItemId: 'inv-cet', dosage: 10, dosageUnit: 'MG', dosePattern: '1-0-1', frequency: 'TWICE_DAILY',
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
    expect(box.items.map((row) => row.drugName)).toEqual(['Doxycycline', 'Cetirizine', '']);
    expect(box.items[0]).toBe(existing);
  });
});
