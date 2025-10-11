import { SchedulingUtils } from '../utils/scheduling.utils';
import { AppointmentStatus } from '@prisma/client';

describe('SchedulingUtils', () => {
  describe('parseTimeSlot', () => {
    it('should parse time slot correctly', () => {
      const result = SchedulingUtils.parseTimeSlot('10:00-10:30');
      expect(result).toEqual({
        start: '10:00',
        end: '10:30',
        duration: 30,
      });
    });

    it('should handle different durations', () => {
      const result = SchedulingUtils.parseTimeSlot('09:00-10:00');
      expect(result).toEqual({
        start: '09:00',
        end: '10:00',
        duration: 60,
      });
    });
  });

  describe('doTimeSlotsOverlap', () => {
    it('should detect overlapping slots', () => {
      const overlap1 = SchedulingUtils.doTimeSlotsOverlap('10:00-10:30', '10:15-10:45');
      expect(overlap1).toBe(true);

      const overlap2 = SchedulingUtils.doTimeSlotsOverlap('09:30-10:30', '10:00-11:00');
      expect(overlap2).toBe(true);
    });

    it('should detect non-overlapping slots', () => {
      const overlap1 = SchedulingUtils.doTimeSlotsOverlap('10:00-10:30', '10:30-11:00');
      expect(overlap1).toBe(false);

      const overlap2 = SchedulingUtils.doTimeSlotsOverlap('09:00-09:30', '10:00-10:30');
      expect(overlap2).toBe(false);
    });

    it('should handle adjacent slots correctly', () => {
      const overlap = SchedulingUtils.doTimeSlotsOverlap('10:00-10:30', '10:30-11:00');
      expect(overlap).toBe(false);
    });
  });

  describe('generateTimeSlots', () => {
    it('should generate time slots for default hours', () => {
      const slots = SchedulingUtils.generateTimeSlots(9, 11, 30);
      expect(slots).toEqual([
        '09:00-09:30',
        '09:30-10:00',
        '10:00-10:30',
        '10:30-11:00',
      ]);
    });

    it('should generate hourly slots', () => {
      const slots = SchedulingUtils.generateTimeSlots(9, 12, 60);
      expect(slots).toEqual([
        '09:00-10:00',
        '10:00-11:00',
        '11:00-12:00',
      ]);
    });

    it('should generate 15-minute slots', () => {
      const slots = SchedulingUtils.generateTimeSlots(9, 10, 15);
      expect(slots).toEqual([
        '09:00-09:15',
        '09:15-09:30',
        '09:30-09:45',
        '09:45-10:00',
      ]);
    });
  });

  describe('findNextAvailableSlot', () => {
    it('should return requested slot if available', () => {
      const requestedSlot = '10:00-10:30';
      const bookedSlots = ['09:00-09:30', '11:00-11:30'];
      
      const result = SchedulingUtils.findNextAvailableSlot(
        new Date('2024-12-25'),
        requestedSlot,
        bookedSlots,
      );
      
      expect(result).toBe(requestedSlot);
    });

    it('should find next available slot if requested is booked', () => {
      const requestedSlot = '10:00-10:30';
      const bookedSlots = ['10:00-10:30'];
      
      const result = SchedulingUtils.findNextAvailableSlot(
        new Date('2024-12-25'),
        requestedSlot,
        bookedSlots,
      );
      
      expect(result).toBe('10:30-11:00');
    });

    it('should return null if no slots available', () => {
      const requestedSlot = '17:30-18:00';
      const bookedSlots = ['17:00-17:30', '17:30-18:00'];
      
      const result = SchedulingUtils.findNextAvailableSlot(
        new Date('2024-12-25'),
        requestedSlot,
        bookedSlots,
        18, // Clinic ends at 6 PM
      );
      
      expect(result).toBeNull();
    });
  });

  describe('isValidTimeSlot', () => {
    it('should validate correct time slot format', () => {
      expect(SchedulingUtils.isValidTimeSlot('10:00-10:30')).toBe(true);
      expect(SchedulingUtils.isValidTimeSlot('09:15-10:45')).toBe(true);
      expect(SchedulingUtils.isValidTimeSlot('23:30-23:59')).toBe(true);
    });

    it('should reject invalid time slot formats', () => {
      expect(SchedulingUtils.isValidTimeSlot('10:00')).toBe(false);
      expect(SchedulingUtils.isValidTimeSlot('10-11')).toBe(false);
      expect(SchedulingUtils.isValidTimeSlot('25:00-26:00')).toBe(false);
      expect(SchedulingUtils.isValidTimeSlot('10:60-11:00')).toBe(false);
      expect(SchedulingUtils.isValidTimeSlot('invalid')).toBe(false);
    });
  });

  describe('getAppointmentPriority', () => {
    it('should return correct priority for each status', () => {
      expect(SchedulingUtils.getAppointmentPriority(AppointmentStatus.CONFIRMED)).toBe(3);
      expect(SchedulingUtils.getAppointmentPriority(AppointmentStatus.SCHEDULED)).toBe(2);
      expect(SchedulingUtils.getAppointmentPriority(AppointmentStatus.CHECKED_IN)).toBe(1);
      expect(SchedulingUtils.getAppointmentPriority(AppointmentStatus.IN_PROGRESS)).toBe(1);
      expect(SchedulingUtils.getAppointmentPriority(AppointmentStatus.COMPLETED)).toBe(0);
      expect(SchedulingUtils.getAppointmentPriority(AppointmentStatus.CANCELLED)).toBe(0);
      expect(SchedulingUtils.getAppointmentPriority(AppointmentStatus.NO_SHOW)).toBe(0);
    });
  });

  describe('suggestAlternativeSlots', () => {
    it('should suggest alternative slots', () => {
      const requestedSlot = '10:00-10:30';
      const bookedSlots = ['10:00-10:30', '11:00-11:30'];
      
      const suggestions = SchedulingUtils.suggestAlternativeSlots(
        requestedSlot,
        bookedSlots,
        3,
      );
      
      expect(suggestions).toHaveLength(3);
      expect(suggestions).toContain('09:00-09:30');
      expect(suggestions).toContain('09:30-10:00');
      expect(suggestions).toContain('10:30-11:00');
      expect(suggestions).not.toContain(requestedSlot);
      expect(suggestions).not.toContain('11:00-11:30');
    });

    it('should limit suggestions to requested count', () => {
      const requestedSlot = '10:00-10:30';
      const bookedSlots = ['10:00-10:30'];
      
      const suggestions = SchedulingUtils.suggestAlternativeSlots(
        requestedSlot,
        bookedSlots,
        2,
      );
      
      expect(suggestions).toHaveLength(2);
    });
  });

  describe('canRescheduleAppointment', () => {
    it('should allow rescheduling of scheduled appointment with enough advance time', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2); // 2 days from now
      
      const result = SchedulingUtils.canRescheduleAppointment(
        futureDate,
        AppointmentStatus.SCHEDULED,
        2,
      );
      
      expect(result.canReschedule).toBe(true);
    });

    it('should not allow rescheduling of completed appointment', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);
      
      const result = SchedulingUtils.canRescheduleAppointment(
        futureDate,
        AppointmentStatus.COMPLETED,
      );
      
      expect(result.canReschedule).toBe(false);
      expect(result.reason).toBe('Cannot reschedule completed appointment');
    });

    it('should not allow rescheduling of cancelled appointment', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);
      
      const result = SchedulingUtils.canRescheduleAppointment(
        futureDate,
        AppointmentStatus.CANCELLED,
      );
      
      expect(result.canReschedule).toBe(false);
      expect(result.reason).toBe('Cannot reschedule cancelled appointment');
    });

    it('should not allow rescheduling within minimum advance hours', () => {
      const nearFutureDate = new Date();
      nearFutureDate.setHours(nearFutureDate.getHours() + 1); // 1 hour from now
      
      const result = SchedulingUtils.canRescheduleAppointment(
        nearFutureDate,
        AppointmentStatus.SCHEDULED,
        2, // Requires 2 hours advance
      );
      
      expect(result.canReschedule).toBe(false);
      expect(result.reason).toBe('Cannot reschedule within 2 hours of appointment');
    });
  });

  describe('addBufferTime', () => {
    it('should add buffer time to slot', () => {
      const result = SchedulingUtils.addBufferTime('10:00-10:30', 5);
      expect(result).toBe('10:00-10:35');
    });

    it('should add default buffer time', () => {
      const result = SchedulingUtils.addBufferTime('10:00-10:30');
      expect(result).toBe('10:00-10:35'); // Default 5 minutes
    });

    it('should handle larger buffer times', () => {
      const result = SchedulingUtils.addBufferTime('10:00-10:30', 15);
      expect(result).toBe('10:00-10:45');
    });
  });
});
