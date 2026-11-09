import { visitIdentity } from '@/lib/visit-identity';

describe('visitIdentity', () => {
  it('builds the full identity from patient, doctor and appointment', () => {
    expect(
      visitIdentity(
        { name: 'ABHILASH', age: 33, gender: 'FEMALE' },
        { firstName: 'Praneeta', lastName: 'Jain' },
        { slot: '16:00-16:30', visitType: 'OPD' },
      ),
    ).toEqual({
      name: 'ABHILASH',
      age: 33,
      sex: 'Female',
      doctorName: 'Dr. Praneeta Jain',
      slot: '16:00–16:30',
      visitType: 'OPD',
    });
  });

  it.each([
    ['M', 'Male'],
    ['MALE', 'Male'],
    ['female', 'Female'],
    ['O', 'Other'],
    ['OTHER', 'Other'],
  ])('formats sex %s as %s', (gender, expected) => {
    expect(visitIdentity({ name: 'A', gender }, null, null).sex).toBe(expected);
  });

  it('omits unknown sex values and missing parts as null', () => {
    expect(visitIdentity({ name: 'A', gender: 'xyz' }, null, null)).toEqual({
      name: 'A',
      age: null,
      sex: null,
      doctorName: null,
      slot: null,
      visitType: null,
    });
  });

  it('prefers the stored age over the date of birth', () => {
    expect(visitIdentity({ name: 'A', age: 40, dob: '1990-01-01' }, null, null).age).toBe(40);
  });

  it('falls back to the date of birth when age is absent', () => {
    const today = new Date();
    const dob = `${today.getFullYear() - 20}-01-01`;
    expect(visitIdentity({ name: 'A', dob }, null, null).age).toBe(20);
  });

  it('keeps a non-range slot as given', () => {
    expect(visitIdentity({ name: 'A' }, null, { slot: 'Walk-in' }).slot).toBe('Walk-in');
  });

  it('uses first and last name when the canonical name is missing', () => {
    expect(visitIdentity({ firstName: 'Asha', lastName: 'Rao' }, null, null).name).toBe('Asha Rao');
  });

  it('shows only the available part of the doctor name', () => {
    expect(visitIdentity({ name: 'A' }, { firstName: 'Praneeta', lastName: '' }, null).doctorName).toBe('Dr. Praneeta');
  });
});
