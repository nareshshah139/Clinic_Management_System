import { normalizeInvestigationName } from './investigation-name';

describe('normalizeInvestigationName', () => {
  it.each([
    ['MRI Brain', 'MRI Brain', 'mri brain'],
    ['  mri   BRAIN ', 'mri BRAIN', 'mri brain'],
    ['Vitamin\tD\n25-OH', 'Vitamin D 25-OH', 'vitamin d 25-oh'],
    ['MRI\u00a0 Brain', 'MRI Brain', 'mri brain'],
    ['ÉCHO Cardiogram', 'ÉCHO Cardiogram', 'écho cardiogram'],
    ['   ', '', ''],
  ])('normalizes %j', (raw, name, normalizedName) => {
    expect(normalizeInvestigationName(raw)).toEqual({ name, normalizedName });
  });
});

describe('investigation-name-normalization keys', () => {
  it.each([
    ['MRI Brain', ' mri   brain'],
    ['CBC', 'cbc\t'],
    ['Lipid  Profile', 'LIPID PROFILE'],
  ])('%j and %j share one key', (a, b) => {
    expect(normalizeInvestigationName(a).normalizedName).toBe(normalizeInvestigationName(b).normalizedName);
  });

  it.each([
    ['MRI Brain', 'MRI Brains'],
    ['CT Head', 'CTHead'],
  ])('%j and %j keep distinct keys', (a, b) => {
    expect(normalizeInvestigationName(a).normalizedName).not.toBe(normalizeInvestigationName(b).normalizedName);
  });
});
