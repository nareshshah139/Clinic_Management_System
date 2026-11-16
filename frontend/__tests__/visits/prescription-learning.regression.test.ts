import { buildLearnedMedicationSuggestion, buildLearnedPrescriptionPlan, scoreDiagnosisMatch } from '@/lib/prescription-learning';

const item = { drugName: 'Synthetic cream', dosage: 1, dosageUnit: 'MG', frequency: 'ONCE_DAILY', duration: 7, durationUnit: 'DAYS' };
const rx = (extra = {}) => ({ diagnosis: 'Acne vulgaris', items: [item], ...extra });

it.each(['AV', 'AD', 'SD', 'LP'])('accepts supported two-letter shorthand %s', diagnosis => {
  const names: Record<string, string> = { AV: 'Acne vulgaris', AD: 'Atopic dermatitis', SD: 'Seborrheic dermatitis', LP: 'Lichen planus' };
  expect(buildLearnedPrescriptionPlan({ diagnosis, doctorPrescriptions: [rx({ diagnosis: names[diagnosis] })] })).not.toBeNull();
});

it('reads legacy patient diagnosis from prescription notes', () => {
  const result = buildLearnedPrescriptionPlan({ diagnosis: 'Acne vulgaris', patientVisits: [{ id: 'past', diagnosis: [], prescriptionItems: [item], prescriptionMeta: { pharmacistNotes: 'Dx: Acne vulgaris' } }] });
  expect(result?.sourceKind).toBe('patient-last-plan');
});

it('excludes the current visit from the doctor history as well as patient history', () => {
  expect(buildLearnedPrescriptionPlan({ diagnosis: 'Acne vulgaris', currentVisitId: 'current', doctorPrescriptions: [rx({ visitId: 'current' })] })).toBeNull();
  expect(buildLearnedMedicationSuggestion({ drugName: item.drugName, diagnosis: 'Acne vulgaris', currentVisitId: 'current', doctorPrescriptions: [rx({ visit: { id: 'current' } })] })).toBeNull();
});

it('counts repeated complete regimens separately from a newer different dose', () => {
  const result = buildLearnedPrescriptionPlan({ diagnosis: 'Acne vulgaris', doctorPrescriptions: [
    rx({ id: '1', createdAt: '2026-09-10' }), rx({ id: '2', createdAt: '2026-09-11' }),
    rx({ id: '3', createdAt: '2026-09-12', items: [{ ...item, dosage: 2 }] }),
  ] });
  expect(result?.evidenceCount).toBe(2);
  expect(result?.items[0].dosage).toBe(1);
});

it('changes plan identity when dosage or application instructions change', () => {
  const suggest = (extra = {}) => buildLearnedPrescriptionPlan({ diagnosis: 'Acne vulgaris', doctorPrescriptions: [rx({ items: [{ ...item, ...extra }] })] });
  expect(suggest()?.signature).not.toBe(suggest({ dosage: 2 })?.signature);
  expect(suggest()?.signature).not.toBe(suggest({ applicationSite: 'Scalp', taperSchedule: 'Synthetic taper' })?.signature);
});

it('does not borrow investigations or follow-up from a different regimen', () => {
  const result = buildLearnedPrescriptionPlan({ diagnosis: 'Acne vulgaris', patientVisits: [{ id: 'past', diagnosis: 'Acne vulgaris', prescriptionItems: [item] }], templates: [{ name: 'Different plan', metadata: { diagnosis: 'Acne vulgaris', investigations: ['Synthetic test'], followUpInstructions: 'Review in 5 days' }, items: [{ drugName: 'Other synthetic cream' }] }] });
  expect(result?.investigations).toEqual([]);
  expect(result?.followUpInstructions).toBe('');
  expect(result?.supportingLabel).toBeUndefined();
});

it('does not copy a sig between drug strengths or similar name prefixes', () => {
  expect(buildLearnedMedicationSuggestion({ drugName: 'Synthetic cream', diagnosis: 'Acne vulgaris', doctorPrescriptions: [rx({ items: [{ ...item, drugName: 'Synthetic cream 2%' }] })] })).toBeNull();
});

it('requires review when only one diagnosis in a combined plan matches', () => {
  expect(scoreDiagnosisMatch('Acne vulgaris', 'Acne vulgaris, Psoriasis')).toBeLessThan(1);
  expect(scoreDiagnosisMatch('Acne vulgaris, Psoriasis', 'Acne vulgaris')).toBeLessThan(1);
  expect(buildLearnedPrescriptionPlan({ diagnosis: 'Acne vulgaris', templates: [{ metadata: { diagnosis: 'Acne vulgaris, Psoriasis' }, items: [item] }] })?.autoApplyEligible).toBe(false);
});

it('does not match negated diagnoses or erase severity for automatic application', () => {
  expect(buildLearnedPrescriptionPlan({ diagnosis: 'No acne', doctorPrescriptions: [rx()] })).toBeNull();
  expect(scoreDiagnosisMatch('Mild acne', 'Severe acne')).toBeLessThan(1);
  expect(buildLearnedPrescriptionPlan({ diagnosis: 'Mild acne', templates: [{ metadata: { diagnosis: 'Severe acne' }, items: [item] }] })?.autoApplyEligible).toBe(false);
});

it('does not count the same prescription twice as independent evidence', () => {
  const record = rx({ id: 'duplicate' });
  expect(buildLearnedPrescriptionPlan({ diagnosis: 'Acne vulgaris', doctorPrescriptions: [record, record] })?.evidenceCount).toBe(1);
});

it('infers review intervals only from explicit follow-up instructions, not treatment duration or expiry', () => {
  expect(buildLearnedPrescriptionPlan({ diagnosis: 'Acne', doctorPrescriptions: [rx({ instructions: 'Apply for 7 days', createdAt: '2026-09-01', validUntil: '2026-10-01' })] })?.reviewDays).toBeNull();
  expect(buildLearnedPrescriptionPlan({ diagnosis: 'Acne', doctorPrescriptions: [rx({ instructions: 'Apply for 7 days. Review in 2 weeks.' })] })?.reviewDays).toBe(14);
});
