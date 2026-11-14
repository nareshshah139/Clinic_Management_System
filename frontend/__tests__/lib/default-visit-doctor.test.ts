import { resolveDefaultDoctorId } from '@/lib/default-visit-doctor';

describe('resolveDefaultDoctorId precedence', () => {
  const booked = 'booked';

  it('gives the appointment doctor over an explicit choice and over the signed-in doctor', () => {
    expect(
      resolveDefaultDoctorId({ role: 'DOCTOR', userId: 'me', current: 'chosen', appointmentDoctorId: booked }),
    ).toBe(booked);
  });

  it('uses an explicit choice when there is no appointment', () => {
    expect(resolveDefaultDoctorId({ role: 'DOCTOR', userId: 'me', current: 'chosen' })).toBe('chosen');
  });

  it('defaults a doctor to themselves when there is no appointment', () => {
    expect(resolveDefaultDoctorId({ role: 'DOCTOR', userId: 'me', current: '' })).toBe('me');
  });

  it('stays empty for a non-doctor without an appointment or choice', () => {
    expect(resolveDefaultDoctorId({ role: 'ADMIN', userId: 'a', current: '' })).toBe('');
  });

  it('gives the appointment doctor to a receptionist', () => {
    expect(
      resolveDefaultDoctorId({ role: 'RECEPTIONIST', userId: 'rec', current: '', appointmentDoctorId: booked }),
    ).toBe(booked);
  });

  it('is empty while the appointment is pending, even for a known doctor with a choice', () => {
    expect(
      resolveDefaultDoctorId({ role: 'DOCTOR', userId: 'me', current: 'chosen', appointmentPending: true }),
    ).toBe('');
  });

  it('gives the same doctor whichever of the user and the appointment arrives first', () => {
    const userFirst = [
      resolveDefaultDoctorId({ role: 'DOCTOR', userId: 'me', current: '', appointmentPending: true }),
      resolveDefaultDoctorId({ role: 'DOCTOR', userId: 'me', current: '', appointmentDoctorId: booked }),
    ];
    const appointmentFirst = [
      resolveDefaultDoctorId({ role: undefined, userId: undefined, current: '', appointmentDoctorId: booked }),
      resolveDefaultDoctorId({ role: 'DOCTOR', userId: 'me', current: '', appointmentDoctorId: booked }),
    ];
    expect(userFirst).toEqual(['', booked]);
    expect(appointmentFirst).toEqual([booked, booked]);
  });

  it('falls back to the signed-in doctor once a failed appointment is no longer pending', () => {
    expect(resolveDefaultDoctorId({ role: 'DOCTOR', userId: 'me', current: '', appointmentPending: false })).toBe('me');
  });
});
