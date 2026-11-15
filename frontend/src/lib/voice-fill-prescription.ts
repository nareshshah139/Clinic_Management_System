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
  const exact = candidates.filter((drug) => keysWithStrength(drug, strength).includes(name));
  if (exact.length > 0) return exact.length === 1 ? exact[0] : null;
  const prefixed = candidates.filter((drug) => keysWithStrength(drug, strength).some((key) => key.startsWith(name)));
  return prefixed.length === 1 ? prefixed[0] : null;
}

function keysWithStrength(drug: unknown, ...strengths: string[]): string[] {
  const tokens = strengths.map(strengthToken).filter(Boolean);
  return inventoryNamesOf(drug).map(spokenNameKey).filter((key) => tokens.every((token) => strengthsIn(key).includes(token)));
}

/** The letters of a name key without its strengths: "teczine 10mg" -> "teczine", "taxim-o 200mg" -> "taximo". */
const brandOf = (key: string) => key.replace(/\d+(?:\.\d+)?\s*(?:mg|mcg|iu|ml|g|%)?/g, '').replace(/[^a-z]/g, '');

function damerauLevenshtein(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const similarity = (a: string, b: string) => 1 - damerauLevenshtein(a, b) / Math.max(a.length, b.length, 1);

const CONSONANT_SOUND: Record<string, string> = {
  b: 'p', p: 'p', f: 'f', v: 'f', k: 'k', q: 'k', g: 'g', j: 'g', s: 's', z: 's', d: 't', t: 't', l: 'l', m: 'n', n: 'n', r: 'r',
};

/** Consonant sounds with vowels dropped and repeats merged, so "texine", "tekzin" and "teczine" all read "tksn". */
function soundKey(brand: string): string {
  const spelled = brand.replace(/ph/g, 'f').replace(/x/g, 'ks').replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k');
  let key = '';
  for (const letter of spelled) {
    const sound = CONSONANT_SOUND[letter];
    if (sound && sound !== key.slice(-1)) key += sound;
  }
  return key;
}

/** Spelling and sound weigh equally: transcription errors keep the sounds and lose the spelling. */
function spokenSimilarity(spoken: string, stocked: string): number {
  const [spokenSound, stockedSound] = [soundKey(spoken), soundKey(stocked)];
  // A different opening sound is a different medicine (Betnovate is not Tenovate), unless the transcript glued a
  // syllable in front of the name, as "Absotret" for "Sotret".
  if (spokenSound[0] !== stockedSound[0] && !spoken.endsWith(stocked)) return 0;
  return (similarity(spoken, stocked) + similarity(spokenSound, stockedSound)) / 2;
}

/** The weakest observed mishearing, "Texanin" for "Teczine", scores 0.71; distinct brands sharing an opening sound score below it (Telma and Triluma 0.66). */
const SUGGESTION_MIN_SIMILARITY = 0.7;
/** "Taxine" sits 0.05 closer to Taxim-O than to Teczine; a gap that small is a guess, not a suggestion. */
const SUGGESTION_MIN_MARGIN = 0.1;
const MIN_SPOKEN_BRAND = 4;

/**
 * The one stocked item a spoken name that did not resolve most likely meant, or null. It is only ever offered for the
 * doctor to accept: the best item must be similar enough and clearly ahead of the next, and an item whose name lacks
 * the spoken strength is never considered.
 */
export function suggestSpokenDrug<D>(spokenName: string, candidates: readonly D[], strength = ''): D | null {
  const spoken = brandOf(spokenNameKey(spokenName));
  if (spoken.length < MIN_SPOKEN_BRAND) return null;
  const ranked = candidates
    .map((drug) => ({
      drug,
      score: Math.max(0, ...keysWithStrength(drug, strength, ...strengthsIn(spokenName)).map(brandOf).filter(Boolean).map((brand) => spokenSimilarity(spoken, brand))),
    }))
    .sort((a, b) => b.score - a.score);
  const [best, runnerUp] = ranked;
  if (!best || best.score < SUGGESTION_MIN_SIMILARITY) return null;
  return !runnerUp || best.score - runnerUp.score >= SUGGESTION_MIN_MARGIN ? best.drug : null;
}

function identityOf(drug: unknown): string {
  const { inventoryItemId, id } = (drug ?? {}) as { inventoryItemId?: string; id?: string };
  return String(inventoryItemId || id || inventoryNamesOf(drug)[0] || '');
}

/**
 * Clinic stock search matches substrings and tolerates one or two typos, so a misheard name usually finds nothing by
 * itself. The first two and three letters usually survive the mishearing ("Texine", "Tekzin" -> "te"), so they fetch
 * the items to rank, alongside whatever the full name found.
 */
async function findSpokenDrugSuggestion<D>(
  spokenName: string,
  strength: string,
  alreadyFound: readonly D[],
  lookup: (query: string) => Promise<readonly D[]>,
): Promise<D | null> {
  const firstWord = spokenNameKey(spokenName).match(/[a-z]+/)?.[0] ?? '';
  if (brandOf(spokenNameKey(spokenName)).length < MIN_SPOKEN_BRAND) return null;
  const prefixes = [...new Set([firstWord.slice(0, 2), firstWord.slice(0, 3)])].filter((prefix) => prefix.length >= 2);
  const found = await Promise.all(prefixes.map((prefix) => lookup(prefix).catch(() => [] as readonly D[])));
  const unique = new Map<string, D>();
  for (const drug of [...alreadyFound, ...found.flat()]) {
    const identity = identityOf(drug);
    if (identity && !unique.has(identity)) unique.set(identity, drug);
  }
  return suggestSpokenDrug(spokenName, [...unique.values()], strength);
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
  /** Offers a stocked item for a row whose spoken name did not resolve, keyed by the name written on that row. */
  suggest?: (rowDrugName: string, drug: D) => void;
}

const isBlankRow = (row: RxRow | undefined) => row !== undefined && !(row.drugName || '').trim();

export async function applySpokenPrescriptionItems<T extends RxRow, D>(
  value: VoiceFillValue | undefined,
  deps: SpokenPrescriptionDeps<T, D>,
): Promise<VoiceFillApplyResult> {
  const spoken = spokenRows(value);
  if (spoken.length === 0) return { filled: [], undo: () => {} };

  const found = await Promise.all(spoken.map((row) => deps.lookup(row.drugName.trim()).catch(() => [] as readonly D[])));
  const drugs = spoken.map((row, index) => resolveSpokenDrug(row.drugName, found[index], spokenStrength(row)));
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
  const { suggest } = deps;
  if (suggest) {
    spoken.forEach((row, index) => {
      if (drugs[index]) return;
      void findSpokenDrugSuggestion(row.drugName, spokenStrength(row), found[index], deps.lookup)
        .then((drug) => { if (drug) suggest(rows[index].drugName, drug); });
    });
  }

  return {
    filled: [{ label: `${rows.length} ${rows.length === 1 ? 'medicine' : 'medicines'}` }],
    undo: () => {
      const restored = previous;
      if (restored) deps.setItems(() => restored);
    },
  };
}
