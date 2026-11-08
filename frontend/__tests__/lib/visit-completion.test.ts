import { missingForCompletion } from '@/lib/visit-completion';

it('lets a diagnosed visit with a saved prescription complete without photos, labs or vitals', () => {
  expect(missingForCompletion({ diagnoses: ['Acne vulgaris'], hasPrescription: true, findings: [] })).toEqual([]);
});

it('lets a diagnosed visit with examination findings but no prescription complete', () => {
  expect(missingForCompletion({ diagnoses: ['Alopecia areata'], hasPrescription: false, findings: [{ dermatology: { morphology: ['Patch'] } }] })).toEqual([]);
});

it('names a missing diagnosis even when a prescription is saved', () => {
  expect(missingForCompletion({ diagnoses: ['  '], hasPrescription: true, findings: [] })).toEqual(['a diagnosis']);
});

it('names both gaps on an empty visit and ignores empty findings', () => {
  expect(missingForCompletion({ diagnoses: [], hasPrescription: false, findings: ['', new Set(), { generalAppearance: '', dermatology: { morphology: [] } }] }))
    .toEqual(['a diagnosis', 'a prescription, examination or notes']);
});
