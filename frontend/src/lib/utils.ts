import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { TimeSlotConfig } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Patient name utilities
type MinimalPatient = { id?: string; name?: string; firstName?: string; lastName?: string } | null | undefined;
/**
 * @cc [owner:nareshshah139,label:product] patient-name-precedence
 * A truthy canonical name MUST be returned unchanged; otherwise use trimmed legacy
 * name parts. Missing patients MUST produce "Unknown Patient"; unnamed patients
 * MUST produce "Patient " followed by the final four ID characters or "Unknown".
 */
export function formatPatientName(patient: MinimalPatient): string {
  if (!patient) return 'Unknown Patient';
  
  // Use name if available, otherwise construct from firstName/lastName
  if (patient.name) return patient.name;
  
  const firstName = patient.firstName?.trim() || '';
  const lastName = patient.lastName?.trim() || '';
  
  if (firstName || lastName) {
    return `${firstName} ${lastName}`.trim();
  }
  
  return `Patient ${patient.id?.slice(-4) || 'Unknown'}`;
}

/**
 * Resolve age from the patient's `age` field or fallback to computing from `dob`.
 * Accepts an object with optional age/dob, or a raw dob string for backward compat.
 */
export function calculateAge(dobOrPatient: string | Date | { age?: number | null; dob?: string | Date | null } | null | undefined): number | null {
  if (!dobOrPatient) return null;

  if (typeof dobOrPatient === 'object' && !(dobOrPatient instanceof Date) && ('age' in dobOrPatient || 'dob' in dobOrPatient)) {
    if (dobOrPatient.age != null) return dobOrPatient.age;
    if (!dobOrPatient.dob) return null;
    return calculateAgeFromDob(dobOrPatient.dob);
  }

  return calculateAgeFromDob(dobOrPatient as string | Date);
}

function calculateAgeFromDob(dob: string | Date): number | null {
  if (!dob) return null;
  try {
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return null;

    const today = new Date();
    const isToday =
      birthDate.getFullYear() === today.getFullYear() &&
      birthDate.getMonth() === today.getMonth() &&
      birthDate.getDate() === today.getDate();

    if (isToday) return null;

    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 0 ? age : null;
  } catch {
    return null;
  }
}

export function formatAge(patient: { age?: number | null; dob?: string | Date | null } | null | undefined): string {
  if (!patient) return 'N/A';
  const age = calculateAge(patient);
  return age != null ? `${age} yrs` : 'N/A';
}

// Time slot utilities
export function generateTimeSlots(config: TimeSlotConfig = {
  startHour: 9,
  endHour: 18,
  stepMinutes: 30,
  timezone: 'Asia/Kolkata'
}): string[] {
  const { startHour, endHour, stepMinutes } = config;
  const slots: string[] = [];

  // Calculate using integer minutes to avoid floating rounding like ":60"
  const startMinutes = Math.max(0, Math.floor(startHour * 60));
  const endMinutes = Math.max(startMinutes, Math.floor(endHour * 60));
  const step = Math.max(1, Math.floor(stepMinutes));

  for (let m = startMinutes; m + step <= endMinutes; m += step) {
    const startHHMM = minutesToHHMM(m);
    const endHHMM = minutesToHHMM(m + step);
    slots.push(`${startHHMM}-${endHHMM}`);
  }

  return slots;
}

// Time parsing and overlap utilities for HH:MM-HH:MM slots
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function minutesToHHMM(totalMinutes: number): string {
  const normalized = Math.max(0, totalMinutes);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function addMinutesToHHMM(startHHMM: string, minutesToAdd: number): string {
  const start = hhmmToMinutes(startHHMM);
  const end = start + (Number.isFinite(minutesToAdd) ? minutesToAdd : 0);
  return minutesToHHMM(end);
}

export function getSlotDurationMinutes(slot: string): number {
  if (!/\d{2}:\d{2}-\d{2}:\d{2}/.test(slot)) return 0;
  const [start, end] = slot.split('-');
  return Math.max(0, hhmmToMinutes(end) - hhmmToMinutes(start));
}

export function doTimeSlotsOverlap(slot1: string, slot2: string): boolean {
  if (!/\d{2}:\d{2}-\d{2}:\d{2}/.test(slot1) || !/\d{2}:\d{2}-\d{2}:\d{2}/.test(slot2)) return false;
  const [s1, e1] = slot1.split('-');
  const [s2, e2] = slot2.split('-');
  const start1 = hhmmToMinutes(s1);
  const end1 = hhmmToMinutes(e1);
  const start2 = hhmmToMinutes(s2);
  const end2 = hhmmToMinutes(e2);
  return start1 < end2 && start2 < end1;
}

// IST timezone utilities
/**
 * @cc [owner:nareshshah139,label:product] clinic-calendar-day
 * A valid instant MUST produce its Asia/Kolkata calendar day as YYYY-MM-DD,
 * independent of the host timezone. An omitted instant MUST use the current time.
 */
export function getISTDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')!.value;
  const month = parts.find(part => part.type === 'month')!.value;
  const day = parts.find(part => part.type === 'day')!.value;
  return `${year}-${month}-${day}`;
}

export function getISTTime(date: Date = new Date()): { hours: number; minutes: number } {
  const istDate = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return {
    hours: istDate.getHours(),
    minutes: istDate.getMinutes()
  };
}

export function isSlotInPast(slotTime: string, targetDate: string): boolean {
  const today = getISTDateString();
  
  // If target date is in the past, all slots are past
  if (targetDate < today) return true;
  
  // If target date is in the future, no slots are past
  if (targetDate > today) return false;
  
  // Same day: compare slot start time with current IST time
  const [startTime] = slotTime.split('-');
  const [slotHour, slotMinute] = startTime.split(':').map(Number);
  
  const currentTime = getISTTime();
  const slotMinutes = slotHour * 60 + slotMinute;
  const currentMinutes = currentTime.hours * 60 + currentTime.minutes;
  
  return slotMinutes <= currentMinutes;
}

// Error handling utilities
/**
 * @cc [owner:nareshshah139,label:observability] support-reference-message
 * Preserve all public validation messages and append a valid UUID support reference once
 * when available; arbitrary reference strings MUST NOT be rendered as diagnostic IDs.
 */
export function getErrorMessage(error: any): string {
  const messageText = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(messageText).filter(Boolean).join('; ');
    return '';
  };
  const message = messageText(error?.body?.message) || messageText(error?.message);
  if (message) {
    const reference = error?.requestId;
    const valid = typeof reference === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference);
    return valid && !message.includes(reference) ? `${message} (Reference: ${reference})` : message;
  }
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred';
}

const REFERENCE_SUFFIX = /\s*\(Reference: ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)\s*$/i;

/** Splits the "(Reference: <uuid>)" that API errors end with, so the sentence can lead and the reference sit apart. */
export function splitErrorReference(message: string): { text: string; reference?: string } {
  const match = REFERENCE_SUFFIX.exec(message);
  return match ? { text: message.slice(0, match.index), reference: match[1] } : { text: message };
}

export function isConflictError(error: any): boolean {
  return error?.status === 409;
}

// Cleanup utilities for component unmounting
export function createCleanupTimeouts(): {
  addTimeout: (id: NodeJS.Timeout) => void;
  clearAll: () => void;
} {
  const timeouts = new Set<NodeJS.Timeout>();
  
  return {
    addTimeout: (id: NodeJS.Timeout) => timeouts.add(id),
    clearAll: () => {
      timeouts.forEach(clearTimeout);
      timeouts.clear();
    }
  };
}

// Room filtering utilities
export function filterRoomsByVisitType(rooms: any[], visitType: string): any[] {
  if (!visitType || visitType === 'ALL') return rooms;
  
  return rooms.filter(room => {
    const roomTypeLower = room.type?.toLowerCase() || '';
    
    switch (visitType) {
      case 'PROCEDURE':
        return roomTypeLower.includes('procedure') || 
               roomTypeLower.includes('operation') ||
               roomTypeLower.includes('surgery');
      case 'TELEMED':
        return roomTypeLower.includes('telemed') || 
               roomTypeLower.includes('virtual') ||
               roomTypeLower.includes('online');
      case 'OPD':
      default:
        return roomTypeLower.includes('consultation') || 
               roomTypeLower.includes('consult') || 
               roomTypeLower.includes('opd') ||
               roomTypeLower.includes('clinic');
    }
  });
}
