import { COMPLETION_RULE, canCompleteVisit, completionSteps } from '@/lib/visit-completion';

const nothing = { complaint: false, diagnosis: false, plan: false, prescription: false, vitals: false, photos: false, labs: false };

it('completes a routine follow-up with a complaint and a prescription, without photos, labs or vitals', () => {
  expect(canCompleteVisit(completionSteps({ ...nothing, complaint: true, prescription: true }))).toBe(true);
});

it('completes with a diagnosis and a plan', () => {
  expect(canCompleteVisit(completionSteps({ ...nothing, diagnosis: true, plan: true }))).toBe(true);
});

it.each([
  ['photos, labs and vitals only', { photos: true, labs: true, vitals: true }],
  ['a complaint without a plan or prescription', { complaint: true }],
  ['a prescription without a complaint or diagnosis', { prescription: true }],
])('does not complete with %s', (_case, recorded) => {
  expect(canCompleteVisit(completionSteps({ ...nothing, ...recorded }))).toBe(false);
});

it('requires only the two clinical minimums and states them in one rule', () => {
  expect(completionSteps(nothing).map((step) => [step.label, step.required])).toEqual([
    ['Complaint or diagnosis', true],
    ['Plan or prescription', true],
    ['Vitals', false],
    ['Photos', false],
    ['Labs', false],
  ]);
  expect(COMPLETION_RULE).toBe('To complete, record a complaint or diagnosis, and a plan or prescription.');
});
