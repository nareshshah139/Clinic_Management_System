import { AppointmentStatus } from '@prisma/client';
import { SchedulingUtils } from '../utils/scheduling.utils';

describe('slot-overlap-is-half-open-and-symmetric', () => {
  it.each([
    ['10:00-10:30', '10:30-11:00', false],
    ['10:30-11:00', '10:00-10:30', false],
    ['10:00-10:30', '10:29-10:59', true],
    ['10:00-10:30', '10:00-10:30', true],
    ['10:00-11:00', '10:15-10:45', true],
    ['10:15-10:45', '10:00-11:00', true],
    ['10:00-10:30', '09:45-10:15', true],
    ['09:00-09:30', '15:00-15:30', false],
    ['00:00-00:30', '23:30-23:59', false],
    ['23:30-23:59', '23:00-23:31', true],
    ['10:00-10:45', '10:30-11:15', true],
    ['10:00-10:45', '10:45-11:30', false],
  ])('%s vs %s overlap=%s in both orders', (a, b, expected) => {
    expect(SchedulingUtils.doTimeSlotsOverlap(a, b)).toBe(expected);
    expect(SchedulingUtils.doTimeSlotsOverlap(b, a)).toBe(expected);
  });
});

describe('generated-slots-tile-the-clinic-day', () => {
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };

  it.each([
    [9, 18, 30],
    [9, 18, 15],
    [9, 18, 20],
    [8, 20, 45],
    [0, 24, 60],
    [9, 10, 45],
  ])(
    'start %d end %d length %d is contiguous, padded and the right length',
    (startHour, endHour, length) => {
      const slots = SchedulingUtils.generateTimeSlots(
        startHour,
        endHour,
        length,
      );
      expect(slots.length).toBeGreaterThan(0);
      expect(
        slots[0].startsWith(`${String(startHour).padStart(2, '0')}:00-`),
      ).toBe(true);
      slots.forEach((slot, i) => {
        expect(slot).toMatch(/^\d{2}:[0-5]\d-\d{2}:[0-5]\d$/);
        const { start, end } = SchedulingUtils.parseTimeSlot(slot);
        expect(toMinutes(end) - toMinutes(start)).toBe(length);
        expect(toMinutes(start)).toBeLessThan(endHour * 60);
        if (i > 0) expect(start).toBe(slots[i - 1].split('-')[1]);
      });
    },
  );

  it('defaults to 09:00-18:00 in 30-minute slots', () => {
    const slots = SchedulingUtils.generateTimeSlots();
    expect(slots).toHaveLength(18);
    expect(slots[0]).toBe('09:00-09:30');
    expect(slots[17]).toBe('17:30-18:00');
  });

  it('lets the last slot run past the end hour when the length does not divide evenly', () => {
    expect(SchedulingUtils.generateTimeSlots(9, 10, 45)).toEqual([
      '09:00-09:45',
      '09:45-10:30',
    ]);
  });

  it('returns no slots when the start is not before the end', () => {
    expect(SchedulingUtils.generateTimeSlots(18, 9, 30)).toEqual([]);
    expect(SchedulingUtils.generateTimeSlots(9, 9, 30)).toEqual([]);
  });

  it('produces slots that never overlap one another', () => {
    const slots = SchedulingUtils.generateTimeSlots(9, 18, 20);
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        expect(SchedulingUtils.doTimeSlotsOverlap(slots[i], slots[j])).toBe(
          false,
        );
      }
    }
  });
});

describe('bookable-slot-is-comparable', () => {
  it.each(['09:00-09:30', '00:00-00:15', '23:00-23:59'])(
    'accepts well-formed %s',
    (slot) => {
      expect(SchedulingUtils.isValidTimeSlot(slot)).toBe(true);
    },
  );

  it.each([
    '',
    'abc',
    '10:00',
    '10:00-',
    '-10:30',
    '10:00 - 10:30',
    '24:00-25:00',
    '10:60-11:00',
    '10:00-10:30-11:00',
    '10-11',
    ' 10:00-10:30',
  ])('rejects malformed %j', (slot) => {
    expect(SchedulingUtils.isValidTimeSlot(slot)).toBe(false);
  });

  it.failing.each(['9:00-10:00', '10:30-10:00', '23:30-00:30', '10:00-10:00'])(
    'target: rejects %s because it cannot be compared for overlap',
    (slot) => {
      expect(SchedulingUtils.isValidTimeSlot(slot)).toBe(false);
    },
  );

  it.each([
    ['9:00-10:00', '09:30-10:30'],
    ['10:30-10:00', '10:10-10:20'],
  ])('pins the gap: accepted %s does not overlap %s today', (bad, other) => {
    expect(SchedulingUtils.isValidTimeSlot(bad)).toBe(true);
    expect(SchedulingUtils.doTimeSlotsOverlap(bad, other)).toBe(false);
  });
});

describe('completed-and-cancelled-cannot-reschedule', () => {
  const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);

  it.each([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED])(
    'refuses %s even far in the future',
    (status) => {
      const result = SchedulingUtils.canRescheduleAppointment(
        inHours(24 * 30),
        status,
      );
      expect(result.canReschedule).toBe(false);
      expect(result.reason).toMatch(/Cannot reschedule/);
    },
  );

  it.each([
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CHECKED_IN,
    AppointmentStatus.IN_PROGRESS,
    AppointmentStatus.NO_SHOW,
  ])('allows %s with no notice requirement', (status) => {
    expect(
      SchedulingUtils.canRescheduleAppointment(inHours(1), status),
    ).toEqual({ canReschedule: true });
  });

  it('allows a past appointment when no notice is required', () => {
    expect(
      SchedulingUtils.canRescheduleAppointment(
        inHours(-3),
        AppointmentStatus.SCHEDULED,
      ),
    ).toEqual({ canReschedule: true });
  });

  it('refuses inside the notice window and allows outside it', () => {
    const tooSoon = SchedulingUtils.canRescheduleAppointment(
      inHours(1),
      AppointmentStatus.SCHEDULED,
      2,
    );
    expect(tooSoon.canReschedule).toBe(false);
    expect(tooSoon.reason).toBe(
      'Cannot reschedule within 2 hours of appointment',
    );
    expect(
      SchedulingUtils.canRescheduleAppointment(
        inHours(3),
        AppointmentStatus.SCHEDULED,
        2,
      ),
    ).toEqual({ canReschedule: true });
  });
});
