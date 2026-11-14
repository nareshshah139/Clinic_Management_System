import { prescriptionLabel } from '@/lib/prescription-labels';

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
