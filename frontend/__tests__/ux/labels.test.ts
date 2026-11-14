import { enumLabel } from '@/lib/labels';

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
