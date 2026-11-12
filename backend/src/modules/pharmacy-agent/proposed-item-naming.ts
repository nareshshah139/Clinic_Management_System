import { parseRecordedName } from '../inventory/medicine-name-parser';
import { MEDICINE_FORM_KEYS, MEDICINE_FORMS, medicineNameProblems } from '../inventory/medicine-names';

/** The standard-name fields the model fills for a new item, beside the free-form inputJson. */
export type ProposedItemNaming = { form: string; medicineName: string; strength: string; isCombination: boolean };

export const ITEM_NAMING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    form: { type: 'string', enum: [...MEDICINE_FORM_KEYS, ''] },
    medicineName: { type: 'string' },
    strength: { type: 'string' },
    isCombination: { type: 'boolean' },
  },
  required: ['form', 'medicineName', 'strength', 'isCombination'],
};

const FORM_WORDS = MEDICINE_FORM_KEYS.filter((key) => key !== 'OTHER').map((key) => MEDICINE_FORMS[key].label.toLowerCase());

export const ITEM_NAMING_INSTRUCTIONS = [
  'For create_inventory_item, put the item fields (name, type, unit, packSize, packUnit, sellingPrice and so on) in inputJson and fill itemNaming.',
  `For a medicine (type MEDICINE), itemNaming.form is one of ${MEDICINE_FORM_KEYS.join(', ')}; medicineName is the name without the form or strength, for example Telma; strength is the single strength, for example 40 mg, or empty for a combination product, with isCombination true.`,
  'If you cannot tell a medicine\'s form, ask the user for it instead of guessing. For every other action and for non-medicines, leave itemNaming.form, medicineName and strength empty and isCombination false.',
].join(' ');

const QUESTIONS: Record<'form' | 'name' | 'strength', string> = {
  form: `which form is it: ${FORM_WORDS.slice(0, -1).join(', ')} or ${FORM_WORDS[FORM_WORDS.length - 1]}?`,
  name: 'what is the medicine called?',
  strength: 'what is its strength, for example 40 mg, or is it a combination product?',
};

/**
 * @cc [owner:nareshshah139,label:product] agent-new-item-standard-name
 * A medicine the pharmacy agent proposes to add MUST reach item creation with a form, a name and a
 * strength where the standard format prints one: the model's itemNaming first, else what the
 * recorded-name parser reads from the proposed name. When neither gives them, the proposal MUST
 * NOT be staged and the agent MUST ask the user for what is missing instead.
 */
export function nameProposedItem(
  input: Record<string, any>,
  naming?: Partial<ProposedItemNaming> | null,
): { input: Record<string, any> } | { question: string } {
  const named = { ...input };
  if (naming?.form) {
    named.form = naming.form;
    named.isCombination = Boolean(naming.isCombination);
    if (naming.medicineName) named.brandName = naming.medicineName;
    if (naming.strength) named.strength = naming.strength;
  }
  if (named.type === 'MEDICINE' && !named.form) {
    const parsed = parseRecordedName(String(named.brandName || named.name || ''), {
      unit: named.unit,
      packUnit: named.packUnit,
      genericName: named.genericName,
    });
    if (parsed.ok)
      Object.assign(named, {
        form: parsed.form,
        brandName: parsed.name,
        strength: named.strength || parsed.strength,
        isCombination: named.isCombination ?? parsed.isCombination,
        ...(parsed.itemCode && !named.itemCode && { itemCode: parsed.itemCode }),
      });
  }
  const problems = medicineNameProblems({ ...named, name: named.brandName || named.name });
  if (!problems.length) return { input: named };
  const label = String(input.name || input.brandName || '').trim() || 'this item';
  return { question: `Before I can add "${label}" to inventory: ${problems.map((p) => QUESTIONS[p.field]).join(' Also, ')}` };
}
