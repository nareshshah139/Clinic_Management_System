import { resolveDefaultDoctorId } from '@/lib/default-visit-doctor';

describe('resolveDefaultDoctorId precedence', () => {
  it('prefers an explicit choice over everything', () => {
    expect(
      resolveDefaultDoctorId({ role: 'DOCTOR', userId: 'me', current: 'chosen', appointmentDoctorId: 'booked' }),
    ).toBe('chosen');
  });

  it('defaults a doctor to themselves over the appointment doctor', () => {
    expect(
      resolveDefaultDoctorId({ role: 'DOCTOR', userId: 'me', current: '', appointmentDoctorId: 'booked' }),
    ).toBe('me');
  });

  it('uses the appointment doctor for a non-doctor', () => {
    expect(
      resolveDefaultDoctorId({ role: 'RECEPTIONIST', userId: 'rec', current: '', appointmentDoctorId: 'booked' }),
    ).toBe('booked');
  });

  it('stays empty when nothing identifies a doctor', () => {
    expect(resolveDefaultDoctorId({ role: 'ADMIN', userId: 'a', current: '' })).toBe('');
  });

  it('gives the appointment doctor until the signed-in doctor is known, then the doctor themselves', () => {
    const appointmentDoctorId = 'booked';
    expect(resolveDefaultDoctorId({ role: undefined, userId: undefined, current: '', appointmentDoctorId })).toBe('booked');
    expect(resolveDefaultDoctorId({ role: 'DOCTOR', userId: 'me', current: '', appointmentDoctorId })).toBe('me');
  });
});
