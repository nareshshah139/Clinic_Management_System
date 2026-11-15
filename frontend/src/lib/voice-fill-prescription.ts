import { editRegimenRow, type RegimenRow } from '@/lib/medicine-regimen-defaults';
import { flashFilledElements, type VoiceFillApplyResult, type VoiceFillRow, type VoiceFillValue } from '@/lib/voice-fill';

/** A stocked item answers to its standard name and the names it was recorded under before. */
export const inventoryNamesOf = (drug: any): string[] =>
  [drug?.name, ...(Array.isArray(drug?.knownNames) ? drug.knownNames : [])].map((name) => String(name || '').trim().toLowerCase()).filter(Boolean);

/** A spoken name resolves only to a single unambiguous candidate: one exact name, else one name it begins. */
export function resolveSpokenDrug<D>(spokenName: string, candidates: readonly D[]): D | null {
  const name = spokenName.trim().toLowerCase();
  if (!name) return null;
  const exact = candidates.filter((drug) => inventoryNamesOf(drug).includes(name));
  if (exact.length > 0) return exact.length === 1 ? exact[0] : null;
  const prefixed = candidates.filter((drug) => inventoryNamesOf(drug).some((known) => known.startsWith(name)));
  return prefixed.length === 1 ? prefixed[0] : null;
}

const SPOKEN_FIELDS = {
  dosage: 'number', dosageUnit: 'string', frequency: 'string', dosePattern: 'string', duration: 'number',
  durationUnit: 'string', timing: 'string', route: 'string', applicationSite: 'string', instructions: 'string',
} as const;

type SpokenRow = VoiceFillRow & { drugName: string };

function spokenRows(value: VoiceFillValue | undefined): SpokenRow[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[]).filter((row): row is SpokenRow =>
    typeof row === 'object' && row !== null && typeof (row as VoiceFillRow).drugName === 'string' && String((row as VoiceFillRow).drugName).trim() !== '');
}

export function spokenRowPatch(row: VoiceFillRow, inferFrequency: (pattern: string) => string | null): Record<string, string | number> {
  const patch: Record<string, string | number> = {};
  for (const [key, type] of Object.entries(SPOKEN_FIELDS)) {
    if (typeof row[key] === type && row[key] !== '') patch[key] = row[key];
  }
  if (typeof patch.dosePattern === 'string' && patch.frequency === undefined) {
    patch.frequency = inferFrequency(patch.dosePattern) || patch.dosePattern;
  }
  return patch;
}

type RxRow = RegimenRow & { drugName: string };

export interface SpokenPrescriptionDeps<T extends RxRow, D> {
  lookup: (name: string) => Promise<readonly D[]>;
  /** Puts the drug on the row the way picking it from the dropdown does. */
  select: (row: T, drug: D) => T;
  createBlank: () => T;
  inferFrequency: (pattern: string) => string | null;
  /** Must commit synchronously (flushSync), so the new rows exist when they are flashed and undo has its snapshot. */
  setItems: (update: (previous: T[]) => T[]) => void;
}

const isBlankRow = (row: RxRow | undefined) => row !== undefined && !(row.drugName || '').trim();

export async function applySpokenPrescriptionItems<T extends RxRow, D>(
  value: VoiceFillValue | undefined,
  deps: SpokenPrescriptionDeps<T, D>,
): Promise<VoiceFillApplyResult> {
  const spoken = spokenRows(value);
  if (spoken.length === 0) return { filled: [], undo: () => {} };

  const drugs = await Promise.all(spoken.map((row) =>
    deps.lookup(row.drugName.trim()).then((candidates) => resolveSpokenDrug(row.drugName, candidates), () => null)));
  const rows = spoken.map((row, index) => {
    // Spoken values go through editRegimenRow so they count as touched and regimen defaults cannot replace them.
    const patch = spokenRowPatch(row, deps.inferFrequency) as Partial<T>;
    const drug = drugs[index];
    return drug
      ? editRegimenRow(deps.select(deps.createBlank(), drug), patch)
      : editRegimenRow(deps.createBlank(), { ...patch, drugName: row.drugName.trim() });
  });

  let previous: T[] | null = null;
  let firstIndex = 0;
  deps.setItems((items) => {
    previous = items;
    const trailing = items[items.length - 1];
    const keepTrailing = isBlankRow(trailing);
    firstIndex = keepTrailing ? items.length - 1 : items.length;
    return [...items.slice(0, firstIndex), ...rows, keepTrailing ? trailing : deps.createBlank()];
  });
  flashFilledElements(rows.map((_, offset) => `rx-row-${firstIndex + offset}-drug`));

  return {
    filled: [{ label: `${rows.length} ${rows.length === 1 ? 'medicine' : 'medicines'}` }],
    undo: () => {
      const restored = previous;
      if (restored) deps.setItems(() => restored);
    },
  };
}
