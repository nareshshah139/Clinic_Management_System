import { AppointmentStatus } from '@prisma/client';

export interface TimeSlot {
  start: string; // HH:MM format
  end: string; // HH:MM format
  duration: number; // minutes
}

export interface SchedulingConflict {
  type: 'doctor' | 'room' | 'resource';
  message: string;
  conflictingAppointment?: {
    id: string;
    patientName: string;
    slot: string;
  };
}

export class SchedulingUtils {
  /**
   * Parse time slot string (e.g., "10:00-10:30") into TimeSlot object
   */
  static parseTimeSlot(slot: string): TimeSlot {
    const [start, end] = slot.split('-');
    const startTime = new Date(`2000-01-01T${start}:00`);
    const endTime = new Date(`2000-01-01T${end}:00`);
    const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60);

    return {
      start,
      end,
      duration,
    };
  }

  /**
   * Check if two time slots overlap
   */
  static doTimeSlotsOverlap(slot1: string, slot2: string): boolean {
    const time1 = this.parseTimeSlot(slot1);
    const time2 = this.parseTimeSlot(slot2);

    const start1 = new Date(`2000-01-01T${time1.start}:00`);
    const end1 = new Date(`2000-01-01T${time1.end}:00`);
    const start2 = new Date(`2000-01-01T${time2.start}:00`);
    const end2 = new Date(`2000-01-01T${time2.end}:00`);

    return start1 < end2 && start2 < end1;
  }

  /**
   * Generate time slots for a day based on clinic hours
   */
  static generateTimeSlots(
    startHour: number = 9,
    endHour: number = 18,
    slotDuration: number = 30,
  ): string[] {
    const slots: string[] = [];
    const durationHours = slotDuration / 60;

    for (let hour = startHour; hour < endHour; hour += durationHours) {
      const startTime = this.formatTime(hour);
      const endTime = this.formatTime(hour + durationHours);
      slots.push(`${startTime}-${endTime}`);
    }

    return slots;
  }

  /**
   * Find the next available slot for a doctor or room
   */
  static findNextAvailableSlot(
    requestedDate: Date,
    requestedSlot: string,
    bookedSlots: string[],
    clinicEndHour: number = 18,
  ): string | null {
    const requestedTime = this.parseTimeSlot(requestedSlot);
    const requestedHour = parseInt(requestedTime.start.split(':')[0]);

    // If requested slot is available, return it
    if (!bookedSlots.includes(requestedSlot)) {
      return requestedSlot;
    }

    // Find next available slot
    const slots = this.generateTimeSlots(requestedHour, clinicEndHour);

    for (const slot of slots) {
      if (!bookedSlots.includes(slot)) {
        return slot;
      }
    }

    return null; // No available slots for the rest of the day
  }

  /**
   * Add buffer time between appointments
   */
  static addBufferTime(slot: string, bufferMinutes: number = 5): string {
    const timeSlot = this.parseTimeSlot(slot);
    const endTime = new Date(`2000-01-01T${timeSlot.end}:00`);
    endTime.setMinutes(endTime.getMinutes() + bufferMinutes);

    const newEnd = this.formatTime(
      endTime.getHours() + endTime.getMinutes() / 60,
    );

    return `${timeSlot.start}-${newEnd}`;
  }

  /**
   * Validate time slot format
   */
  static isValidTimeSlot(slot: string): boolean {
    const timeSlotRegex =
      /^([01]?[0-9]|2[0-3]):[0-5][0-9]-([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeSlotRegex.test(slot);
  }

  /**
   * Get appointment status priority for conflict resolution
   */
  static getAppointmentPriority(status: AppointmentStatus): number {
    const priorities = {
      [AppointmentStatus.CONFIRMED]: 3,
      [AppointmentStatus.SCHEDULED]: 2,
      [AppointmentStatus.CHECKED_IN]: 1,
      [AppointmentStatus.IN_PROGRESS]: 1,
      [AppointmentStatus.COMPLETED]: 0,
      [AppointmentStatus.CANCELLED]: 0,
      [AppointmentStatus.NO_SHOW]: 0,
    };

    return priorities[status] || 0;
  }

  /**
   * Suggest alternative slots when conflict occurs
   */
  static suggestAlternativeSlots(
    requestedSlot: string,
    bookedSlots: string[],
    maxSuggestions: number = 3,
  ): string[] {
    const suggestions: string[] = [];
    const requestedTime = this.parseTimeSlot(requestedSlot);
    const requestedHour = parseInt(requestedTime.start.split(':')[0]);

    // Generate slots around the requested time
    const slots = this.generateTimeSlots(
      Math.max(9, requestedHour - 2),
      Math.min(18, requestedHour + 3),
    );

    for (const slot of slots) {
      if (slot !== requestedSlot && !bookedSlots.includes(slot)) {
        suggestions.push(slot);
        if (suggestions.length >= maxSuggestions) break;
      }
    }

    return suggestions;
  }

  /**
   * Check if an appointment can be rescheduled based on business rules
   */
  static canRescheduleAppointment(
    appointmentDate: Date,
    status: AppointmentStatus,
    minAdvanceHours: number = 24,
  ): { canReschedule: boolean; reason?: string } {
    const now = new Date();
    const hoursUntilAppointment =
      (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (status === AppointmentStatus.COMPLETED) {
      return {
        canReschedule: false,
        reason: 'Cannot reschedule completed appointment',
      };
    }

    if (status === AppointmentStatus.CANCELLED) {
      return {
        canReschedule: false,
        reason: 'Cannot reschedule cancelled appointment',
      };
    }

    if (hoursUntilAppointment < minAdvanceHours) {
      return {
        canReschedule: false,
        reason: `Cannot reschedule within ${minAdvanceHours} hours of appointment`,
      };
    }

    return { canReschedule: true };
  }

  private static formatTime(hour: number): string {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }
}
