import { editRegimenRow, type RegimenRow } from '@/lib/medicine-regimen-defaults';
import { MEDICINE_FORMS, normalizeStrength } from '@/lib/medicine-names';
import { flashFilledElements, type VoiceFillApplyResult, type VoiceFillRow, type VoiceFillValue } from '@/lib/voice-fill';

/** A stocked item answers to its standard name and the names it was recorded under before. */
export const inventoryNamesOf = (drug: any): string[] =>
  [drug?.name, ...(Array.isArray(drug?.knownNames) ? drug.knownNames : [])].map((name) => String(name || '').trim().toLowerCase()).filter(Boolean);

const FORM_WORDS = Object.values(MEDICINE_FORMS).flatMap((rule) => rule.words).join('|');
const LEADING_FORM = new RegExp(`^(?:${FORM_WORDS})\\.?\\s+`);
const TRAILING_FORM = new RegExp(`\\s+(?:${FORM_WORDS})\\.?$`);

/** What a doctor would say for a stocked name: "Cap. Doxycycline 100 mg" -> "doxycycline 100mg", "Zimba 2% cream" -> "zimba 2%". */
export function spokenNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ').replace(LEADING_FORM, '').replace(TRAILING_FORM, '')
    .replace(/(\d)\s+(?=(?:mg|mcg|iu)\b)/g, '$1');
}

const strengthsIn = (name: string): string[] => spokenNameKey(name).match(/\d+(?:\.\d+)?(?:mg|mcg|iu)/g) ?? [];
const strengthToken = (strength: string) => strength.toLowerCase().replace(/\s+/g, '');

/**
 * A spoken name resolves only to a single unambiguous candidate: one exact name, else one name it begins. A spoken
 * strength must appear in that name, so another strength never stands in for the one the doctor said.
 */
export function resolveSpokenDrug<D>(spokenName: string, candidates: readonly D[], strength = ''): D | null {
  const name = spokenNameKey(spokenName);
  if (!name) return null;
  const token = strengthToken(strength);
  const keysOf = (drug: D) => inventoryNamesOf(drug).map(spokenNameKey).filter((key) => !token || strengthsIn(key).includes(token));
  const exact = candidates.filter((drug) => keysOf(drug).includes(name));
  if (exact.length > 0) return exact.length === 1 ? exact[0] : null;
  const prefixed = candidates.filter((drug) => keysOf(drug).some((key) => key.startsWith(name)));
  return prefixed.length === 1 ? prefixed[0] : null;
}

const STRENGTH_UNITS = new Set(['MG', 'MCG', 'IU']);

/** "100 mg" for a spoken 100 MG; amounts such as 1 TABLET are not a strength and the dose pattern carries them. */
export function spokenStrength(row: VoiceFillRow): string {
  const { dosage, dosageUnit } = row;
  if (typeof dosage !== 'number' || dosage <= 0 || typeof dosageUnit !== 'string' || !STRENGTH_UNITS.has(dosageUnit)) return '';
  return normalizeStrength(`${dosage} ${dosageUnit}`);
}

/** Rows have no dose control, so a typed medicine carries its strength in its name, as a doctor would type it. */
export function withStrength(drugName: string, strength: string): string {
  if (!strength || strengthsIn(drugName).includes(strengthToken(strength))) return drugName;
  return `${drugName} ${strength}`;
}

const SPOKEN_FIELDS = {
  frequency: 'string', dosePattern: 'string', duration: 'number', durationUnit: 'string', timing: 'string', route: 'string',
  applicationSite: 'string', instructions: 'string',
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
    deps.lookup(row.drugName.trim()).then((candidates) => resolveSpokenDrug(row.drugName, candidates, spokenStrength(row)), () => null)));
  const rows = spoken.map((row, index) => {
    // Spoken values go through editRegimenRow so they count as touched and regimen defaults cannot replace them.
    const patch = spokenRowPatch(row, deps.inferFrequency) as Partial<T>;
    const drug = drugs[index];
    return drug
      ? editRegimenRow(deps.select(deps.createBlank(), drug), patch)
      : editRegimenRow(deps.createBlank(), { ...patch, drugName: withStrength(row.drugName.trim(), spokenStrength(row)) });
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
