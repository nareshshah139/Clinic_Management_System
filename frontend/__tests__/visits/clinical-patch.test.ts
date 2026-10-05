import { compactClinicalPatch, mergeClinicalPatch } from '@/lib/clinical-patch';

it('retains deliberate clears and zero while omitting only absent values', () => {
  expect(compactClinicalPatch({
    diagnosis: [], history: { pastHistory: '', personalHistory: '' },
    vitals: { heartRate: null, weight: undefined },
    treatmentPlan: { followUpDate: null, followUpInstructions: '', investigations: [] },
    examination: { dermatology: { itchScore: 0 } },
  })).toEqual({
    diagnosis: [], history: { pastHistory: '', personalHistory: '' },
    vitals: { heartRate: null },
    treatmentPlan: { followUpDate: null, followUpInstructions: '', investigations: [] },
    examination: { dermatology: { itchScore: 0 } },
  });
});

it('merges a clear without erasing untouched siblings or reviving a previous value', () => {
  expect(mergeClinicalPatch({ history: { pastHistory: 'Saved', medicationHistory: 'Keep' }, diagnosis: ['Saved'] },
    compactClinicalPatch({ history: { pastHistory: '', medicationHistory: undefined }, diagnosis: [] })))
    .toEqual({ history: { pastHistory: '', medicationHistory: 'Keep' }, diagnosis: [] });
});
