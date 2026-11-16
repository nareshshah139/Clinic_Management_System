type PrintSection = { title: string; text: string };

const parse = (value: any): any => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
};
const text = (value: any): string => typeof value === 'string' ? value.trim() : '';
const entries = (value: any, keys: string[]): string => {
  const parsed = parse(value);
  return (Array.isArray(parsed) ? parsed : [parsed]).map(item => typeof item === 'string' ? item.trim()
    : keys.map(key => text(item?.[key])).find(Boolean) || '').filter(Boolean).join('; ');
};

/**
 * @cc [owner:nareshshah139,label:product] clinical-pdf-sections
 * PDF clinical blocks MUST include saved nonempty clinical text without inventing empty defaults
 * or mutating the visit. Examination MUST follow complaints and precede diagnosis. Blank personal
 * history MUST remain omitted; follow-up instructions and the review date MUST remain visible.
 */
export function prescriptionClinicalPrint(prescription: any): { beforeMedicines: PrintSection[]; afterMedicines: PrintSection[] } {
  const visit = prescription.visit || {};
  const history = parse(visit.history) || {};
  const examination = parse(visit.exam) || {};
  const rawPlan = parse(visit.plan) || {};
  const plan = { ...rawPlan.dermatology, ...rawPlan };
  const beforeMedicines: PrintSection[] = [];
  const afterMedicines: PrintSection[] = [];
  const add = (target: PrintSection[], title: string, value: string) => { if (value) target.push({ title, text: value }); };
  add(beforeMedicines, 'Chief complaints', entries(visit.complaints, ['complaint', 'text']));
  add(beforeMedicines, 'Examination', typeof examination === 'string' ? examination : text(examination.generalAppearance));
  add(beforeMedicines, 'Diagnosis', entries(visit.diagnosis, ['diagnosis', 'text']));
  if (typeof history === 'string') add(beforeMedicines, 'History', history.trim());
  for (const [key, title] of Object.entries({ personalHistory: 'Personal history', pastHistory: 'Past history', medicationHistory: 'Medication history', menstrualHistory: 'Menstrual history', triggers: 'Triggers', priorTreatments: 'Prior treatments' })) {
    add(beforeMedicines, title, text(history[key]));
  }
  const family = history.familyHistory;
  const familyText = typeof family === 'string' ? family.trim() : [family?.dm === true ? 'Diabetes' : '', family?.htn === true ? 'Hypertension' : '', family?.thyroid === true ? 'Thyroid disease' : '', text(family?.others)].filter(Boolean).join('; ');
  add(beforeMedicines, 'Family history', familyText);
  add(afterMedicines, 'Investigations', entries(plan.investigations, ['name', 'test']));
  add(afterMedicines, 'Follow-up instructions', typeof plan.followUpInstructions === 'string' ? plan.followUpInstructions.trim() : text(prescription.instructions) || text(plan.followUp));
  const review = plan.followUpDate ?? visit.followUp;
  if (review) {
    const date = new Date(review);
    if (!Number.isNaN(date.getTime())) add(afterMedicines, 'Review date', date.toLocaleDateString('en-IN'));
  }
  return { beforeMedicines, afterMedicines };
}
