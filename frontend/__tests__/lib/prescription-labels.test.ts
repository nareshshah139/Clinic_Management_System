import { prescriptionAmount, prescriptionLabel } from '@/lib/prescription-labels';

it.each([
  ['frequency', 'TWICE_DAILY', 'Twice daily'],
  ['frequency', 'AS_NEEDED', 'As needed'],
  ['frequency', 'ALTERNATE_DAYS', 'Alternate days'],
  ['frequency', '1-0-1', '1-0-1'],
  ['frequency', 'stat', 'STAT'],
  ['dosageUnit', 'ML', 'ml'],
  ['dosageUnit', 'TABLET', 'tablet'],
  ['durationUnit', 'WEEKS', 'weeks'],
  ['durationUnit', 'CYCLES', 'cycles'],
  ['route', 'ORAL', 'Oral'],
  ['route', 'Topical', 'Topical'],
] as const)('labels %s %s as %s', (field, code, label) => {
  expect(prescriptionLabel(field, code)).toBe(label);
});

it('renders nothing for an empty value', () => {
  expect(prescriptionLabel('frequency', undefined)).toBe('');
});

it.each([
  ['dosageUnit', 1, 'CAPSULE', '1 capsule'],
  ['dosageUnit', 2, 'TABLET', '2 tablets'],
  ['dosageUnit', 5, 'ML', '5 ml'],
  ['dosageUnit', '', 'ML', ''],
  ['durationUnit', 30, 'DAYS', '30 days'],
  ['durationUnit', 1, 'WEEKS', '1 week'],
  ['durationUnit', 14, undefined, '14'],
] as const)('reads %s amount %s %s as %s', (field, amount, unit, text) => {
  expect(prescriptionAmount(field, amount, unit)).toBe(text);
});
