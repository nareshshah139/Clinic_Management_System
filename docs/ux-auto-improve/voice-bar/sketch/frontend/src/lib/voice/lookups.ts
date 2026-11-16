// Repo path: frontend/src/lib/voice/lookups.ts
// The only place a voice flow reads app records, and the only place ids get branded. Every lookup
// calls an endpoint the user can already call from the page; there is no voice-specific lookup
// route. The brand casts are private. Exports: the Lookups interface, createLookups, and three
// functions that build refs from API records. Tests build refs through lib/voice/testing.ts.

import type { Patient, User } from '@/lib/types';
import type { WorkingHours } from '@/lib/working-hours';
import type { DoctorRef, IstDate, PatientRef, StockRowRef } from './types';

export interface Lookups {
  /** apiClient.getPatients({ search, limit: 10 }), mapped like AppointmentsCalendar.tsx:285-289. */
  searchPatients(name: string, signal: AbortSignal): Promise<readonly PatientRef[]>;
  /** apiClient.getUser(doctor.id) -> workingHoursOn(metadata, date, fallback). */
  workingHours(doctor: DoctorRef, date: IstDate, fallback: WorkingHours, signal: AbortSignal): Promise<WorkingHours>;
  /** apiClient.get('/inventory/workspace/stock', { search, limit: 30 }), the list's own endpoint. */
  stockRows(search: string, signal: AbortSignal): Promise<readonly StockRowRef[]>;
}

export function createLookups(): Lookups { throw new Error('not implemented'); }

/**
 * @cc [owner:nareshshah139,label:security] voice-refs-from-records
 * Branded doctor, patient and stock-row ids MUST be built only from API records returned by the
 * app's own lookups; this module MUST NOT export a function that brands a plain string.
 */
export function doctorRef(record: User): DoctorRef { throw new Error('not implemented'); }
export function patientRef(record: Patient): PatientRef { throw new Error('not implemented'); }
/** `row` is one item of the workspace stock list response. */
export function stockRowRef(row: WorkspaceStockRow): StockRowRef { throw new Error('not implemented'); }

export interface WorkspaceStockRow {
  id: string; name: string; productName?: string; batchNumber?: string; expiryDate?: string;
  unit: string; currentStock: number; heldStock: number; sellingPrice: number; updatedAt: string;
}

// private: function brandId<B>(value: string): B { return value as B }   (not exported)
