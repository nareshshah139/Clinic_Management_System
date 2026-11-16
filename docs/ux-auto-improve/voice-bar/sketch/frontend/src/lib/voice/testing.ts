// Repo path: frontend/src/lib/voice/testing.ts
// Test-only helpers. Nothing under frontend/src may import this file;
// frontend/__tests__/lib/voice/testing-boundary.test.ts greps src and fails if anything does.

import type { Patient, User } from '@/lib/types';
import type {
  ClockTime, DoctorRef, IstDate, PatientRef, Prefill, Reviewed, StockRowRef,
} from './types';
import type { WorkspaceStockRow } from './lookups';
import type { IstClock } from './spoken-time';
import type { Transport } from './transport';
import type { Lookups } from './lookups';

/** The only Reviewed minting outside machine.ts. A cast, as the brand is a type brand. */
export function reviewed<T extends Prefill>(prefill: T): Reviewed<T> { return prefill as Reviewed<T>; }

/** Refs go through the real exported builders in lookups.ts, from fixture records. */
export function fakeDoctor(over?: Partial<User>): DoctorRef { throw new Error('not implemented'); }
export function fakePatient(over?: Partial<Patient>): PatientRef { throw new Error('not implemented'); }
export function fakeStockRow(over?: Partial<WorkspaceStockRow>): StockRowRef { throw new Error('not implemented'); }

export function istDate(ymd: string): IstDate { return ymd as IstDate; }
export function clockTime(hhmm: string): ClockTime { return hhmm as ClockTime; }

/** Today 2026-11-16 (a Monday) at the given IST minutes. */
export function fixedClock(today = '2026-11-16', minutesNow = 10 * 60): IstClock {
  throw new Error('not implemented');
}

/** Every method a jest.fn with a controllable deferred result. */
export function fakeTransport(): Transport & { calls: Record<keyof Transport, unknown[][]> } {
  throw new Error('not implemented');
}
export function fakeLookups(data?: Partial<{ patients: PatientRef[]; rows: StockRowRef[] }>): Lookups {
  throw new Error('not implemented');
}
