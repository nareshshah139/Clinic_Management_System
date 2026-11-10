/**
 * The clinic's standard medicine name format (CR-11).
 * Kept byte-identical with frontend/src/lib/medicine-names.ts; both are tested against
 * shared-types/cases/medicine-names.json.
 */

export type MedicineFormKey =
  | 'TABLET'
  | 'CAPSULE'
  | 'SYRUP'
  | 'CREAM'
  | 'OINTMENT'
  | 'SOLUTION'
  | 'LOTION'
  | 'GEL'
  | 'SHAMPOO'
  | 'FACE_WASH'
  | 'SERUM'
  | 'SUNSCREEN'
  | 'OTHER';

type FormRule = { label: string; prefix?: string; word?: string; words: string[]; strengthRequired: boolean };

/** One row per form: how it prints, the words that name it on packs and bills, and whether a strength is required. */
export const MEDICINE_FORMS: Record<MedicineFormKey, FormRule> = {
  TABLET: { label: 'Tablet', prefix: 'Tab.', words: ['tab', 'tabs', 'tablet', 'tablets'], strengthRequired: true },
  CAPSULE: { label: 'Capsule', prefix: 'Cap.', words: ['cap', 'caps', 'capsule', 'capsules'], strengthRequired: true },
  SYRUP: { label: 'Syrup', prefix: 'Syp.', words: ['syp', 'syr', 'syrup'], strengthRequired: true },
  CREAM: { label: 'Cream', word: 'cream', words: ['cream', 'crm'], strengthRequired: false },
  OINTMENT: { label: 'Ointment', word: 'ointment', words: ['oin', 'oint', 'ointment'], strengthRequired: false },
  SOLUTION: { label: 'Solution', word: 'solution', words: ['solution', 'soln'], strengthRequired: false },
  LOTION: { label: 'Lotion', word: 'lotion', words: ['lotion'], strengthRequired: false },
  GEL: { label: 'Gel', word: 'gel', words: ['gel'], strengthRequired: false },
  SHAMPOO: { label: 'Shampoo', word: 'shampoo', words: ['shampoo'], strengthRequired: false },
  FACE_WASH: { label: 'Face wash', word: 'face wash', words: ['face wash', 'facewash', 'face-wash'], strengthRequired: false },
  SERUM: { label: 'Serum', word: 'serum', words: ['serum'], strengthRequired: false },
  SUNSCREEN: { label: 'Sunscreen', word: 'sunscreen', words: ['sunscreen', 'sun screen'], strengthRequired: false },
  OTHER: { label: 'Other', words: [], strengthRequired: false },
};

export const MEDICINE_FORM_KEYS = Object.keys(MEDICINE_FORMS) as MedicineFormKey[];
export const STRENGTH_REQUIRED_FORMS = MEDICINE_FORM_KEYS.filter((key) => MEDICINE_FORMS[key].strengthRequired);

export type MedicineNameFields = {
  form?: string | null;
  name?: string | null;
  strength?: string | null;
  isCombination?: boolean | null;
};

const tidy = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ruleFor = (form: unknown): FormRule | undefined =>
  typeof form === 'string' && Object.prototype.hasOwnProperty.call(MEDICINE_FORMS, form)
    ? MEDICINE_FORMS[form as MedicineFormKey]
    : undefined;

const unit = (raw: string) => {
  const u = raw.toLowerCase().replace('µ', 'mc');
  return u === 'iu' ? 'IU' : u;
};

/** "150Mg" -> "150 mg", "150" -> "150 mg" (tablets, capsules, syrups), "2.5 MG / 5 ML" -> "2.5mg/5ml". */
export function normalizeStrength(raw: unknown, form?: string | null): string {
  const text = tidy(raw);
  if (!text) return '';
  const num = '(\\d+(?:\\.\\d+)?)';
  const ratio = text.match(new RegExp(`^${num}\\s*(mg|mcg|µg|g)?\\s*\\/\\s*${num}\\s*(ml)$`, 'i'));
  if (ratio) return `${ratio[1]}${unit(ratio[2] || 'mg')}/${ratio[3]}ml`;
  const single = text.match(new RegExp(`^${num}\\s*(mg|mcg|µg|g|iu|%)?$`, 'i'));
  if (single) {
    const u = single[2] ? unit(single[2]) : ruleFor(form)?.strengthRequired ? 'mg' : '';
    return u === '%' ? `${single[1]}%` : u ? `${single[1]} ${u}` : single[1];
  }
  return text;
}

/** The printed name: "Tab. Flutas 150 mg", "Cap. Antoxid-HC", "Zimba cream", "Syp. Teczine 2.5mg/5ml". */
export function standardMedicineName(fields: MedicineNameFields): string {
  const rule = ruleFor(fields.form);
  let name = tidy(fields.name);
  if (!rule) return name;
  const strength = fields.isCombination ? '' : normalizeStrength(fields.strength, fields.form);
  const words = rule.words.map(escape).join('|');
  if (rule.prefix) {
    name = name.replace(new RegExp(`^(?:${words})\\.?\\s+`, 'i'), '');
    return [rule.prefix, name, strength].filter(Boolean).join(' ');
  }
  if (rule.word) {
    name = name.replace(new RegExp(`\\s+(?:${words})\\.?$`, 'i'), '');
    return [name, strength, rule.word].filter(Boolean).join(' ');
  }
  return [name, strength].filter(Boolean).join(' ');
}

export function strengthRequired(fields: MedicineNameFields): boolean {
  return Boolean(ruleFor(fields.form)?.strengthRequired && !fields.isCombination);
}

/** Q17: an unknown strength is allowed and listed, never blocked from prescribing. */
export function strengthMissing(fields: MedicineNameFields): boolean {
  return strengthRequired(fields) && !normalizeStrength(fields.strength, fields.form);
}

export type MedicineNameProblem = { field: 'form' | 'name' | 'strength'; message: string };

/** What the new-item and edit forms refuse to save. */
export function medicineNameProblems(fields: MedicineNameFields & { type?: string | null }): MedicineNameProblem[] {
  const problems: MedicineNameProblem[] = [];
  if (fields.type === 'MEDICINE' && !ruleFor(fields.form))
    problems.push({ field: 'form', message: 'Choose the form: tablet, capsule, syrup, cream and so on.' });
  if (!tidy(fields.name)) problems.push({ field: 'name', message: 'Enter the medicine name.' });
  if (strengthMissing(fields))
    problems.push({ field: 'strength', message: 'Enter the strength, for example 150 mg, or tick Combination product.' });
  return problems;
}

/**
 * Cleans a saved prescription line for printing: removes a leading catalogue code, pack sizes and
 * dispensing notes. It never changes the strength or the words of the name.
 */
export function printedMedicineName(drugName: unknown): string {
  return tidy(
    String(drugName ?? '')
      .replace(/^\s*\d[\d ]*\|\s*/, '')
      .replace(/^\s*\d{1,4}\s+(?=[A-Za-z][A-Za-z-]{2,})/, '')
      .replace(/\s*\((?:loose\s+[a-z]+|pc|pcs|strip|strips)\)/gi, ' ')
      .replace(/(?<![\w./])\d+\s*['’]?s\b/gi, ' ')
      .replace(/(?<![\w./])\d+\s*[x×]\s*\d+\b/gi, ' ')
      .replace(/(?<![\w./])\d+(?:\.\d+)?\s*(?:ml|gm)\b/gi, ' ')
      .replace(/[\s,|]+$/, ''),
  );
}
