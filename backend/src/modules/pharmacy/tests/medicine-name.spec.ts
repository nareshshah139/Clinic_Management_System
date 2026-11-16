import { formatMedicineName, medicineNameParts, medicineNameIssues } from '@cms/shared-types/medicine-name';
import { medicinePresentationData } from '../medicine-presentation';
import { inventoryProductName } from '../../inventory/inventory-names';
import { CreateDrugDto, UpdateDrugDto } from '../dto/drug.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('CR-11 medicine names', () => {
  it.each([CreateDrugDto, UpdateDrugDto])('preserves boolean prescribing and dispensing choices through DTO whitelisting: %s', async Dto => {
    const input = plainToInstance(Dto as typeof CreateDrugDto, { requiresPrescription: false, dispenseLoose: false });
    expect(await validate(input, { whitelist: true, skipMissingProperties: true })).toEqual([]);
    expect(input).toMatchObject({ requiresPrescription: false, dispenseLoose: false });
    const invalid = plainToInstance(Dto as typeof CreateDrugDto, { requiresPrescription: 'false' });
    expect((await validate(invalid, { whitelist: true, skipMissingProperties: true })).some(error => error.property === 'requiresPrescription')).toBe(true);
  });
  it('honors an explicit false loose-dispensing choice when saving a legacy name', () => {
    const input = { name: 'Acnosis Tab (loose tablets)', dosageForm: 'tablet', strength: '10mg' };
    expect(medicinePresentationData({ ...input, dispenseLoose: false }).dispenseLoose).toBe(false);
    expect(medicinePresentationData({ ...input, dispenseLoose: true }).dispenseLoose).toBe(true);
    expect(medicinePresentationData(input).dispenseLoose).toBe(true);
  });
  it('flags an ambiguous legacy loose note for review without overriding the saved flag', () => {
    const { review } = require('../../../../../scripts/diagnostics/medicine-name-review.cjs');
    const input = { id: 'legacy', name: 'Acnosis Tab (loose tablets)', strength: '10mg', dispenseLoose: false };
    const result = review([input])[0];
    expect(result.proposed.dispenseLoose).toBe(false);
    expect(result.issues).toContain('Legacy loose-dispensing note conflicts with the saved flag; verify the intended setting');
    expect(input.dispenseLoose).toBe(false);
  });
  it.each(['Fucibet Cream 20g', 'Fucibet Ointment 20 g'])('keeps topical pack weight out of display and persisted strength: %s', name => {
    const fields = medicinePresentationData({ name });
    expect(fields.strength).toBe('');
    expect(formatMedicineName(name)).toBe(name.includes('Ointment') ? 'Fucibet ointment' : 'Fucibet cream');
  });
  it('retains explicit topical concentrations and liquid dose denominators', () => {
    expect(formatMedicineName('Synthetic cream 5% 20g')).toBe('Synthetic 5% cream');
    expect(formatMedicineName('Synthetic ointment 2mg/g 20g')).toBe('Synthetic 2 mg/g ointment');
    expect(formatMedicineName('Synthetic syrup 15mg/5ml 100ml')).toBe('Syp. Synthetic 15mg/5ml');
    expect(medicinePresentationData({ name: 'Fucibet Cream 20g', strength: '2 mg/g' }).strength).toBe('2 mg/g');
  });
  it('uses an explicitly reviewed inventory brand instead of an old structured brand', () => {
    expect(inventoryProductName({ name: 'Reviewed tablet 10 mg', brandName: 'Old', dosageForm: 'tablet', strength: '10 mg' }, { nameNormalization: { version: 1 } })).toBe('Tab. Reviewed 10 mg');
  });
  it.each([
    ['13 74 | Flutas 150Mg(Pc)', { dosageForm: 'tablet' }, 'Tab. Flutas 150 mg'],
    ['244 | Zimba Cream', {}, 'Zimba cream'],
    ['1-Bact Oin', {}, '1-Bact ointment'],
    ['293 | Cwin Lotion 30Ml', {}, 'Cwin lotion'],
    ['242 | Sotret 10Mg Cap', {}, 'Cap. Sotret 10 mg'],
    ['1 Antoxid-Hc Capsules 30S (loose capsules)', { combinationProduct: true }, 'Cap. Antoxid-HC'],
    ['199 | Acnosis Tab (loose tablets)', {}, 'Tab. Acnosis'],
    ['Moisturex Hydra Gel Cream, 50 ml', {}, 'Moisturex Hydra Gel cream'],
    ['Benzac AC gel wash 100 ml', {}, 'Benzac AC gel wash'],
    ['Teczine 2.5mg/5ml Syrup', {}, 'Syp. Teczine 2.5mg/5ml'],
    ['Brand 50 mg Tab', { brandName: 'Known brand', strength: '20 mg', combinationProduct: true }, 'Tab. Known Brand'],
  ])('formats %s without codes, packs or dispensing notes', (name, fields, expected) => {
    expect(formatMedicineName(name, fields)).toBe(expected);
  });
  it('retains identity inputs and separates loose dispensing', () => {
    const source = { name: '242 | Sotret 10Mg Cap (loose capsules)', id: 'stable', currentStock: 7 };
    expect(medicineNameParts(source.name)).toEqual({ brandName: 'Sotret', dosageForm: 'capsule', strength: '10Mg', combinationProduct: false, dispenseLoose: true, itemCode: '242' });
    expect(source).toEqual({ name: '242 | Sotret 10Mg Cap (loose capsules)', id: 'stable', currentStock: 7 });
  });
  it('requires a verified oral strength and exempts topicals and explicit combinations', () => {
    expect(() => medicinePresentationData({ name: 'Unknown Tab' })).toThrow('Strength is required');
    expect(medicineNameIssues({ brandName: 'Fucibet', dosageForm: 'cream' })).toEqual([]);
    expect(medicineNameIssues({ brandName: 'Antoxid', dosageForm: 'capsule', combinationProduct: true })).toEqual([]);
    expect(formatMedicineName('Mystery medicine')).toBe('Mystery medicine');
  });
});
