import { UserRole } from '@cms/shared-types';
import { foldedCalendarsFor } from './appointment-calendars';

describe('foldedCalendarsFor', () => {
  it.each([UserRole.DOCTOR, UserRole.OWNER, UserRole.ADMIN])('folds Scheduled for %s', (role) => {
    expect(foldedCalendarsFor(role)).toEqual(['SCHEDULED']);
  });

  it.each([UserRole.RECEPTION, UserRole.NURSE, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.ACCOUNTANT])('folds nothing for %s', (role) => {
    expect(foldedCalendarsFor(role)).toEqual([]);
  });

  it('folds nothing before the signed-in user is known', () => {
    expect(foldedCalendarsFor(undefined)).toEqual([]);
  });
});
