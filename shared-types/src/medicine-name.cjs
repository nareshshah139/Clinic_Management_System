const forms = {
  tablet: 'tablet', tablets: 'tablet', tab: 'tablet', capsule: 'capsule', capsules: 'capsule', cap: 'capsule', caps: 'capsule',
  syrup: 'syrup', syp: 'syrup', suspension: 'suspension', cream: 'cream', ointment: 'ointment', oin: 'ointment',
  solution: 'solution', lotion: 'lotion', gel: 'gel', shampoo: 'shampoo', serum: 'serum', sunscreen: 'sunscreen',
  'face wash': 'face wash', 'gel wash': 'gel wash', 'scalp solution': 'scalp solution', drops: 'drops', injection: 'injection', powder: 'powder', soap: 'soap',
};
const formPattern = /\b(face wash|gel wash|scalp solution|tablets?|tabs?\.?|capsules?|caps?\.?|syrup|syp\.?|suspension|cream|ointment|oin\.?|solution|lotion|gel|shampoo|serum|sunscreen|drops|injection|powder|soap)\b\.?/gi;
const strengthPattern = /\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|iu|%)\s*(?:\/\s*\d*(?:\.\d+)?\s*(?:ml|g))?/gi;
const topical = new Set(['cream','ointment','solution','scalp solution','lotion','gel','shampoo','serum','sunscreen','face wash','gel wash','soap','powder']);
const normalizeForm = value => forms[String(value || '').trim().toLowerCase().replace(/\.$/, '')] || '';
const clean = value => String(value || '').replace(/^\s*(?:\d+\s*)+\|\s*/, '').replace(/^\s*\d+\s+(?=[A-Za-z])/, '')
  .replace(/\(\s*loose\b[^)]*\)/gi, '').replace(/\(\s*pc\s*\)/gi, '')
  .replace(/\b\d+\s*(?:['’]?s|tablets|capsules)\b/gi, '').replace(/\b(?:pack|strip|box)\s+(?:of\s+)?\d+\b/gi, '').trim();
const brandCase = value => value.replace(/\b[A-Za-z][A-Za-z-]*/g, word => word.split('-').map((part, i) =>
  i > 0 && part.length <= 3 ? part.toUpperCase() : /^[A-Z]{1,3}$/.test(part) ? part : part[0].toUpperCase() + part.slice(1).toLowerCase()).join('-'));

/**
 * @cc [owner:nareshshah139,label:product] medicine-name-presentation-only
 * Display names MUST omit source codes, pack quantities and loose-dispensing notes. Explicit
 * form, brand, strength and loose-dispensing values take precedence; combination products omit strength. Unknown strength
 * MUST remain unknown. Formatting MUST NOT change product identity, stock or dispensing units.
 */
function medicineNameParts(name, fields = {}) {
  const raw = clean(name);
  const formMatches = [...raw.matchAll(formPattern)];
  const dosageForm = normalizeForm(fields.dosageForm) || normalizeForm(formMatches.at(-1)?.[0]);
  const parsedStrength = (raw.match(strengthPattern) || []).filter(value => !(topical.has(dosageForm) && /^\d+(?:\.\d+)?\s*g\s*$/i.test(value))).join(' / ');
  const strength = String(fields.strength || parsedStrength).trim();
  let brandName = clean(fields.brandName || raw);
  const trailingForm = [...brandName.matchAll(formPattern)].at(-1);
  if (trailingForm && normalizeForm(trailingForm[0]) === dosageForm) brandName = brandName.slice(0, trailingForm.index) + brandName.slice(trailingForm.index + trailingForm[0].length);
  brandName = brandName.replace(strengthPattern, ' ');
  brandName = brandName.replace(/\b\d+(?:\.\d+)?\s*ml\b/gi, ' ').replace(/\s+/g, ' ').replace(/^[,|\s]+|[,|\s]+$/g, '');
  return { brandName: brandCase(brandName), dosageForm, strength, combinationProduct: fields.combinationProduct === true,
    dispenseLoose: typeof fields.dispenseLoose === 'boolean' ? fields.dispenseLoose : /\(\s*loose\b/i.test(String(name || '')), itemCode: fields.itemCode || String(name || '').match(/^\s*((?:\d+\s*)+)\|/)?.[1]?.trim() || '' };
}

function formatMedicineName(name, fields = {}) {
  const p = medicineNameParts(name, fields);
  if (!p.dosageForm) return clean(name);
  const strength = p.combinationProduct ? '' : p.strength.toLowerCase().replace(/\s+/g, '').replace(/(\d)(mg|mcg|g|iu)\b/gi, '$1 $2');
  const dose = p.dosageForm === 'syrup' || p.dosageForm === 'suspension' ? strength.replace(/\s/g, '') : strength;
  if (p.dosageForm === 'tablet' || p.dosageForm === 'capsule') return [p.dosageForm === 'tablet' ? 'Tab.' : 'Cap.', p.brandName, dose].filter(Boolean).join(' ');
  if (p.dosageForm === 'syrup' || p.dosageForm === 'suspension') return ['Syp.', p.brandName, dose].filter(Boolean).join(' ');
  return [p.brandName, dose, p.dosageForm].filter(Boolean).join(' ');
}

function medicineNameIssues(fields) {
  const issues = [];
  if (!String(fields.brandName || '').trim()) issues.push('Brand name is required');
  const form = normalizeForm(fields.dosageForm);
  if (!form) issues.push('Choose a medicine form');
  if (form && !topical.has(form) && !fields.combinationProduct && !String(fields.strength || '').trim()) issues.push('Strength is required for this medicine');
  return issues;
}
module.exports = { formatMedicineName, medicineNameParts, medicineNameIssues, normalizeMedicineForm: normalizeForm };
