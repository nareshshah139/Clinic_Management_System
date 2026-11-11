import {
  MEDICINE_FORMS,
  MedicineFormKey,
  normalizeStrength,
  standardMedicineName,
  strengthMissing,
} from './medicine-names';

export type RecordedNameHints = {
  dosageForm?: string | null;
  packUnit?: string | null;
  unit?: string | null;
  genericName?: string | null;
  ingredients?: (string | null | undefined)[];
};

export type ParsedMedicineName =
  | {
      ok: true;
      form: MedicineFormKey;
      name: string;
      strength: string;
      isCombination: boolean;
      itemCode: string;
      standardName: string;
      strengthMissing: boolean;
      needsUnit: boolean;
    }
  | { ok: false; reason: 'form' | 'strength' | 'name'; message: string };

const DETECTION_ORDER: MedicineFormKey[] = [
  'SUNSCREEN', 'FACE_WASH', 'SHAMPOO', 'SERUM', 'OINTMENT', 'CREAM', 'LOTION', 'GEL', 'SOLUTION', 'SYRUP', 'CAPSULE', 'TABLET',
];
const UNIT_FORMS: Record<string, MedicineFormKey> = { TABLETS: 'TABLET', CAPSULES: 'CAPSULE' };
/** Forms where "1g" is the dose; on creams, gels and the rest "30g" is the pack. */
const GRAM_DOSE_FORMS: MedicineFormKey[] = ['TABLET', 'CAPSULE'];
/** A number that belongs to the brand ("Omega 3"); D3, B12 and Q10 are single words and never read as numbers. */
const BRAND_NUMBER = /\bomega[\s-]+\d+\b/gi;
const BARE_NUMBER = /(?<![\w.\/-])\d+(?:\.\d+)?(?![\w.%\/-])/;

/** A medicine with no strength whose name carries a number that may be one ("Thyronorm 50"): the pharmacist enters the unit. */
export function nameNeedsUnit(fields: { form?: string | null; name?: string | null; strength?: string | null; isCombination?: boolean | null }): boolean {
  return strengthMissing(fields) && !normalizeStrength(fields.strength) && BARE_NUMBER.test(String(fields.name ?? '').replace(BRAND_NUMBER, ' '));
}
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordPattern = (form: MedicineFormKey) =>
  new RegExp(`(?<![\\w-])(?:${MEDICINE_FORMS[form].words.map(escape).join('|')})\\.?(?![\\w-])`, 'gi');

function formIn(text: unknown): MedicineFormKey | null {
  const value = String(text ?? '');
  return DETECTION_ORDER.find((form) => wordPattern(form).test(value)) ?? null;
}

function tidyName(text: string): string {
  return text
    .replace(/[,|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-\s]+|[-\s]+$/g, '')
    .split(' ')
    .map((token) =>
      token
        .split('-')
        .map((part, index) =>
          index > 0 && /^[a-z]{1,2}$/i.test(part)
            ? part.toUpperCase()
            : /^[A-Z]{4,}$/.test(part)
              ? part[0] + part.slice(1).toLowerCase()
              : part,
        )
        .join('-'),
    )
    .join(' ');
}

function ingredientCount(hints: RecordedNameHints): number {
  const listed = (hints.ingredients || []).filter((v) => String(v ?? '').trim());
  const generic = String(hints.genericName ?? '')
    .split(/\s*(?:\+|,|\band\b)\s*/i)
    .filter((v) => v.trim());
  return Math.max(listed.length, generic.length);
}

/**
 * Reads a recorded inventory name such as "13 74 | Flutas 150Mg(Pc)" into the separate fields
 * of the standard format. Returns why it could not when the form, the name or a single strength
 * cannot be told apart; those items are listed for the clinic instead of guessed. A strength is read
 * only when the name states its unit: "Thyronorm 50 Tab" keeps 50 in the name, with no strength,
 * and is flagged needsUnit so the pharmacist can enter the unit.
 */
export function parseRecordedName(recorded: string, hints: RecordedNameHints = {}): ParsedMedicineName {
  let text = String(recorded ?? '').replace(/\s+/g, ' ').trim();
  let itemCode = '';
  const code = text.match(/^(\d[\d ]*?)\s*\|\s*/) || text.match(/^(\d{1,4})\s+(?=[A-Za-z][A-Za-z-]{2,})/);
  if (code) {
    itemCode = code[1].trim();
    text = text.slice(code[0].length);
  }
  let noteForm: MedicineFormKey | null = null;
  text = text
    .replace(/\(\s*loose\s+([a-z]+)\s*\)/gi, (_, word: string) => {
      noteForm = formIn(word);
      return ' ';
    })
    .replace(/\((?:pc|pcs|strip|strips)\)/gi, ' ')
    .replace(/(?<![\w./])\d+\s*['’]?s\b/gi, ' ')
    .replace(/(?<![\w./])\d+\s*[x×]\s*\d+\b/gi, ' ');
  const form =
    formIn(text) ??
    noteForm ??
    formIn(hints.dosageForm) ??
    formIn(hints.packUnit) ??
    UNIT_FORMS[String(hints.unit ?? '')] ??
    null;
  const gramDose = Boolean(form && GRAM_DOSE_FORMS.includes(form));
  text = text.replace(gramDose ? /(?<![\w./])\d+(?:\.\d+)?\s*ml\b(?!\s*\/)/gi : /(?<![\w./])\d+(?:\.\d+)?\s*(?:ml|gm|g)\b(?!\s*\/)/gi, ' ');
  const strengths: string[] = [];
  const read = (match: string) => {
    strengths.push(normalizeStrength(match));
    return ' ';
  };
  text = text
    .replace(/(?<![\w.])\d+(?:\.\d+)?\s*(?:mg|mcg|µg|gm|g)\s*\/\s*\d+(?:\.\d+)?\s*ml\b/gi, read)
    .replace(gramDose ? /(?<![\w./])\d+(?:\.\d+)?\s*(?:mg|mcg|µg|iu|%|gm|g)(?![\w/])/gi : /(?<![\w./])\d+(?:\.\d+)?\s*(?:mg|mcg|µg|iu|%)(?![\w/])/gi, read);
  for (const key of DETECTION_ORDER) text = text.replace(wordPattern(key), ' ');
  const name = tidyName(text);
  if (!name) return { ok: false, reason: 'name', message: 'Nothing is left of the name once codes, pack sizes and the form are removed' };
  if (!form) return { ok: false, reason: 'form', message: 'The form (tablet, capsule, cream and so on) is not in the name' };
  if (new Set(strengths).size > 1)
    return { ok: false, reason: 'strength', message: `More than one strength in the name: ${[...new Set(strengths)].join(', ')}` };
  const fields = { form, name, strength: strengths[0] || '', isCombination: ingredientCount(hints) > 1 };
  return {
    ok: true,
    ...fields,
    itemCode,
    standardName: standardMedicineName(fields),
    strengthMissing: strengthMissing(fields),
    needsUnit: nameNeedsUnit(fields),
  };
}
