import { enumLabel, plural } from '@/lib/labels';

describe('enumLabel', () => {
  it('reads a known value whatever its case or spacing', () => {
    expect(['FEMALE', ' female ', 'f'].map((value) => enumLabel('gender', value))).toEqual(['Female', 'Female', 'Female']);
    expect(enumLabel('visitType', 'telemed')).toBe('Telemedicine');
  });

  it('turns a value the table does not name into words instead of showing the raw enum', () => {
    expect(enumLabel('role', 'FRONT_DESK')).toBe('Front desk');
    expect(enumLabel('role', undefined)).toBe('Unknown');
  });
});

it('names bill item types in words', () => {
  expect(['DRUG', 'PACKAGE'].map((value) => enumLabel('itemType', value))).toEqual(['Medicine', 'Package']);
});

it('counts with the right noun form', () => {
  expect([plural(1, 'medicine'), plural(2, 'medicine'), plural(0, 'batch', 'batches')]).toEqual(['1 medicine', '2 medicines', '0 batches']);
});
