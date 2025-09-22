import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { TimeSlotConfig } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Patient name utilities
type MinimalPatient = { id?: string; name?: string; firstName?: string; lastName?: string } | null | undefined;
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

// Default time slot configuration for IST
export const DEFAULT_TIME_SLOT_CONFIG: TimeSlotConfig = {
  startHour: 9,
  endHour: 18,
  stepMinutes: 30,
  timezone: 'Asia/Kolkata'
};

// Time slot utilities
export function generateTimeSlots(config: TimeSlotConfig = {
  startHour: 9,
  endHour: 18,
  stepMinutes: 30,
  timezone: 'Asia/Kolkata'
}): string[] {
  const { startHour, endHour, stepMinutes } = config;
  const slots: string[] = [];
  
  for (let h = startHour; h < endHour; h += stepMinutes / 60) {
    const startH = Math.floor(h);
    const startM = Math.round((h - startH) * 60);
    const endH = Math.floor(h + stepMinutes / 60);
    const endM = Math.round(((h + stepMinutes / 60) - endH) * 60);
    
    const formatTime = (hour: number, minute: number) => 
      `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    
    slots.push(`${formatTime(startH, startM)}-${formatTime(endH, endM)}`);
  }
  
  return slots;
}

// IST timezone utilities
export function getISTDateString(date: Date = new Date()): string {
  // Convert to IST and return YYYY-MM-DD format
  const istDate = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const year = istDate.getFullYear();
  const month = String(istDate.getMonth() + 1).padStart(2, '0');
  const day = String(istDate.getDate()).padStart(2, '0');
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
export function getErrorMessage(error: any): string {
  if (error?.body?.message) return error.body.message;
  if (error?.message) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred';
}

export function isConflictError(error: any): boolean {
  return error?.status === 409;
}

export function getConflictSuggestions(error: any): string[] {
  if (!isConflictError(error)) return [];
  const suggestions = error?.body?.suggestions;
  return Array.isArray(suggestions) ? suggestions : [];
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

// Form validation utilities
export function validateAppointmentForm(data: {
  doctorId: string;
  patientId: string;
  date: string;
  slot: string;
  visitType: string;
}): string[] {
  const errors: string[] = [];
  
  if (!data.doctorId?.trim()) errors.push('Please select a doctor');
  if (!data.patientId?.trim()) errors.push('Please select a patient');
  if (!data.date?.trim()) errors.push('Please select a date');
  if (!data.slot?.trim()) errors.push('Please select a time slot');
  if (!data.visitType?.trim()) errors.push('Please select visit type');
  
  // Validate date is not in the past
  const today = getISTDateString();
  if (data.date && data.date < today) {
    errors.push('Cannot schedule appointments in the past');
  }
  
  // Validate slot format
  if (data.slot && !/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(data.slot)) {
    errors.push('Invalid time slot format');
  }
  
  return errors;
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

/**
 * Calculate relevance score for drug search results
 * Higher score = more relevant match
 * Heavily prioritizes prefix matches over contains matches
 */
export function calculateDrugRelevanceScore(drug: any, searchQuery: string): number {
  if (!searchQuery.trim()) return 0;
  
  const query = searchQuery.toLowerCase().trim();
  const drugName = (drug.name || '').toLowerCase();
  const genericName = (drug.genericName || '').toLowerCase();
  const manufacturerName = (drug.manufacturerName || '').toLowerCase();
  const composition = (drug.composition1 || '').toLowerCase();
  const category = (drug.category || '').toLowerCase();
  
  let score = 0;
  
  // TIER 1: Exact matches get highest priority (10000+ points)
  // Generic name gets equal priority to drug name for exact matches
  if (drugName === query) score += 10000;
  if (genericName === query) score += 10000; // Same as drug name
  
  // TIER 2: Full name/generic starts with query (8000+ points) 
  // Generic name gets equal priority to drug name for prefix matches
  if (drugName.startsWith(query)) score += 8000;
  if (genericName.startsWith(query)) score += 8000; // Same as drug name
  
  // TIER 3: Word boundary prefix matches (6000+ points)
  // Each word in the drug name or generic name that starts with the query gets equal score
  const queryWords = query.split(/\s+/);
  queryWords.forEach((word: string) => {
    if (word.length >= 2) {
      const drugWords: string[] = drugName.split(/\s+/);
      const genericWords: string[] = genericName.split(/\s+/);
      
      // Equal scores for word-level prefix matches
      drugWords.forEach((drugWord: string) => {
        if (drugWord.startsWith(word)) score += 6000;
      });
      
      genericWords.forEach((genericWord: string) => {
        if (genericWord.startsWith(word)) score += 6000; // Same as drug name
      });
    }
  });
  
  // TIER 4: Manufacturer starts with query (1000+ points)
  if (manufacturerName.startsWith(query)) score += 2000;
  
  // TIER 5: Contains matches get much lower priority (100-500 points)
  // This ensures prefix matches always rank higher than contains matches
  // Generic name gets equal priority to drug name for contains matches
  if (drugName.includes(query) && !drugName.startsWith(query)) score += 500;
  if (genericName.includes(query) && !genericName.startsWith(query)) score += 500; // Same as drug name
  if (composition.includes(query)) score += 300;
  if (manufacturerName.includes(query) && !manufacturerName.startsWith(query)) score += 200;
  if (category.includes(query)) score += 100;
  
  // TIER 6: Partial word contains matches (50-150 points)
  queryWords.forEach(word => {
    if (word.length >= 3) {
      // Only add points if it's not already a prefix match
      // Generic name gets equal priority to drug name for partial word matches
      if (drugName.includes(word) && !drugName.startsWith(word)) score += 150;
      if (genericName.includes(word) && !genericName.startsWith(word)) score += 150; // Same as drug name
      if (composition.includes(word)) score += 80;
      if (manufacturerName.includes(word) && !manufacturerName.startsWith(word)) score += 50;
    }
  });
  
  // Bonus factors (small bonuses to break ties)
  // Boost score for shorter drug names (more specific matches)
  if (drugName.length > 0) {
    const lengthBonus = Math.max(0, 50 - drugName.length);
    score += lengthBonus;
  }
  
  // Boost score for active drugs
  if (drug.isActive) score += 10;
  
  // Boost score for drugs with price (available in stock)
  if (drug.price && drug.price > 0) score += 20;
  
  return score;
}

/**
 * Sort drug search results by relevance
 */
export function sortDrugsByRelevance(drugs: any[], searchQuery: string): any[] {
  if (!searchQuery.trim() || !Array.isArray(drugs)) return drugs;
  
  return drugs
    .map(drug => ({
      ...drug,
      _relevanceScore: calculateDrugRelevanceScore(drug, searchQuery)
    }))
    .sort((a, b) => {
      // Primary sort: relevance score (descending)
      const scoreDiff = b._relevanceScore - a._relevanceScore;
      if (scoreDiff !== 0) return scoreDiff;
      
      // Secondary sort: alphabetical by name (ascending)
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    })
    .map(({ _relevanceScore, ...drug }) => drug); // Remove the temporary score field
}
