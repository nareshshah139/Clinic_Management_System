import { computeGridWindow } from '@/lib/calendar-window';

const work = { startHour: 9, endHour: 18 };

it('grows the grid to cover bookings after working hours and counts them', () => {
  expect(computeGridWindow(work, ['10:00-10:30', '18:30-19:00', '19:15-19:45'])).toEqual({ startHour: 9, endHour: 20, outsideCount: 2 });
});

it('grows the grid to cover an early booking', () => {
  expect(computeGridWindow(work, ['07:45-08:15'])).toEqual({ startHour: 7, endHour: 18, outsideCount: 1 });
});

it('counts a booking that straddles closing time and stops at midnight', () => {
  expect(computeGridWindow(work, ['17:30-18:30', '23:30-24:00'])).toEqual({ startHour: 9, endHour: 24, outsideCount: 2 });
});

it('keeps working hours when every booking fits and ignores malformed slots', () => {
  expect(computeGridWindow(work, ['09:00-09:30', 'soon', '12:00-11:00'])).toEqual({ startHour: 9, endHour: 18, outsideCount: 0 });
});
