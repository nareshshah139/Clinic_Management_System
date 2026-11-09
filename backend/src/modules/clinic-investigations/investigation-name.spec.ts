import { normalizeInvestigationName } from './investigation-name';

describe('normalizeInvestigationName', () => {
  it.each([
    ['MRI Brain', 'MRI Brain', 'mri brain'],
    ['  mri   BRAIN ', 'mri BRAIN', 'mri brain'],
    ['Vitamin\tD\n25-OH', 'Vitamin D 25-OH', 'vitamin d 25-oh'],
  ])('normalizes %j', (raw, name, normalizedName) => {
    expect(normalizeInvestigationName(raw)).toEqual({ name, normalizedName });
  });
});
