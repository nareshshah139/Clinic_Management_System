// Repo path: frontend/src/lib/voice/types.ts
// Domain types for the voice bar. Pure types, no runtime. Everything in lib/voice and
// components/voice derives from these. Page code imports only VoiceCapability, the Prefill
// types, Reviewed, the VisitNote apply types and VoiceBookingSummary.

import type { ParsedAppointment, VisitSectionKey, VoiceIntent } from '@cms/shared-types/voice';
import type { Patient, User } from '@/lib/types';
import type { WorkingHours } from '@/lib/working-hours';

export type { VoiceIntent, VisitSectionKey };

// ---------------------------------------------------------------------------------------------
// Brands. The minting casts are private to lookups.ts (ids) and spoken-time.ts (dates, times).
// lookups.ts exports only functions that build refs from API records. Tests mint through
// lib/voice/testing.ts. A parse response has no id field, so model output cannot reach a brand.

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type PatientId = Brand<string, 'PatientId'>;
export type DoctorId = Brand<string, 'DoctorId'>;
export type StockRowId = Brand<string, 'StockRowId'>;
/** YYYY-MM-DD on the Asia/Kolkata calendar. */
export type IstDate = Brand<string, 'IstDate'>;
/** HH:MM, 24-hour, Asia/Kolkata. */
export type ClockTime = Brand<string, 'ClockTime'>;

// ---------------------------------------------------------------------------------------------
// Records resolved through the app's own lookups. `record` is the untouched API row.

export interface DoctorRef { id: DoctorId; name: string; record: User }
export interface PatientRef {
  id: PatientId;
  name: string;                       // formatPatientName(record)
  identity: string;                   // "Meera Iyer · P-00231 · 34 F · 98xxxxxx12"
  record: Patient;
}
export interface StockDialogItem {
  id: string; name: string; productName?: string; batchNumber?: string; expiryDate?: string;
  unit: string; currentStock: number; heldStock: number; sellingPrice: number; updatedAt: string;
}
export interface StockRowRef {
  id: StockRowId;
  label: string;                      // "Paracetamol 500 mg tablets · Batch B12 · Exp Mar 2027"
  unit: string;
  currentStock: number;
  heldStock: number;
  record: StockDialogItem;            // exactly what StockEditDialog's `item` prop takes
}

// ---------------------------------------------------------------------------------------------
// Slot: the one representation of how far resolution got for one value.
//   resolved   usable as is
//   choose     the user picks one option in the bar; blocks Apply
//   unresolved fixed in the form, not in the bar; the prefill is partial or absent
// Zero matches and "not said" are `unresolved`; several matches are `choose`. Nothing defaults.

export type Slot<T> =
  | { state: 'resolved'; value: T; via: 'said' | 'chosen' | 'only-option' }
  | { state: 'choose'; prompt: string; options: readonly SlotOption<T>[] }
  | { state: 'unresolved'; message: string };

export interface SlotOption<T> { key: string; label: string; detail?: string; value: T }

// ---------------------------------------------------------------------------------------------
// Proposals: what the bar holds during review. One variant per intent.

interface ProposalBase<K extends VoiceIntent> { intent: K; heard: string }

export interface NoteItem {
  key: string;                        // `s${index}`, stable within the attempt
  text: string;                       // verbatim sentence from `heard`
  /** No 'discarded': unsorted lines are discarded only by Dismiss on the whole review. */
  place: VisitSectionKey | 'unsorted';
}
export interface VisitNoteProposal extends ProposalBase<'visit-note'> {
  items: readonly NoteItem[];
}

export interface BookingProposal extends ProposalBase<'book-appointment'> {
  /** Kept so a later choice (the doctor) can re-resolve the time against that doctor's hours. */
  said: ParsedAppointment['fields'];
  doctor: Slot<DoctorRef>;
  date: Slot<IstDate>;
  patient: Slot<PatientRef>;
  time: Slot<ClockTime>;
  /** Copied from the context at resolve time so toPrefill stays a pure function of the proposal. */
  slotMinutes: number;
}

export interface StockCountProposal extends ProposalBase<'stock-count'> {
  spokenProduct: string | null;
  spokenUnit: string | null;
  row: Slot<StockRowRef>;
  count: Slot<number>;
}

export type Proposal = VisitNoteProposal | BookingProposal | StockCountProposal;
export type ProposalOf<K extends VoiceIntent> = Extract<Proposal, { intent: K }>;

export type Choice =
  | { intent: 'book-appointment'; slot: 'doctor' | 'patient' | 'time'; optionKey: string }
  | { intent: 'stock-count'; slot: 'row'; optionKey: string };

// ---------------------------------------------------------------------------------------------
// Prefill: what a page's apply receives. Derived by toPrefill(); never stored.

export interface VisitNotePrefill {
  intent: 'visit-note';
  heard: string;
  /** Placed sentences per section in spoken order. Unsorted items are never here. */
  sections: Partial<Record<VisitSectionKey, readonly string[]>>;
}

export interface VoiceBookingSummary {
  heard: string;
  patientIdentity: string;
  doctorName: string;
  whenText: string;                   // "Tue 17 Nov 2026, 16:30 to 17:00"
}

export type BookingPrefill =
  | {
      intent: 'book-appointment'; heard: string; complete: true;
      doctor: DoctorRef; date: IstDate; patient: { kind: 'chosen'; ref: PatientRef };
      slot: string;                   // 'HH:MM-HH:MM', the calendar's own slot format
      summary: VoiceBookingSummary;
    }
  | {
      intent: 'book-appointment'; heard: string; complete: false;
      doctor: DoctorRef | null; date: IstDate | null;
      patient: { kind: 'chosen'; ref: PatientRef } | { kind: 'search'; text: string } | { kind: 'none' };
      /** What the user still does in the form; a COPY string chosen in intents.ts. */
      remaining: string;
    };

export type StockCountPrefill =
  | { intent: 'stock-count'; heard: string; action: 'edit-count'; row: StockRowRef; count: number }
  | { intent: 'stock-count'; heard: string; action: 'search'; text: string };

export type Prefill = VisitNotePrefill | BookingPrefill | StockCountPrefill;
export type PrefillOf<K extends VoiceIntent> = Extract<Prefill, { intent: K }>;

/**
 * A prefill the user has reviewed. Only the machine's apply transition mints it. A page cannot
 * produce one without an explicit cast.
 */
declare const reviewed: unique symbol;
export type Reviewed<T> = T & { readonly [reviewed]: true };

// ---------------------------------------------------------------------------------------------
// Registration: the only thing a page provides.

export interface IntentContexts {
  'visit-note': Record<string, never>;
  'book-appointment': {
    doctors: readonly User[];
    /** Only labels that option "Shown on the calendar". Never selected for the user. */
    shownDoctorId: string | null;
    slotMinutes: number;
    /** The calendar's configured hours, used when a doctor has no working hours of their own. */
    defaultHours: WorkingHours;
  };
  'stock-count': Record<string, never>;
}

export interface VisitNoteUndone {
  restored: readonly VisitSectionKey[];
  /** Edited after apply, so left as they are. */
  kept: readonly VisitSectionKey[];
}
export interface VisitNoteApplied {
  written: readonly VisitSectionKey[];
  undo(): VisitNoteUndone;
}

/**
 * What each intent's apply returns. Only the visit note can be undone from the bar. Booking and
 * stock open a dialog whose Cancel is the undo, so their apply returns nothing.
 */
export interface IntentApplyResults {
  'visit-note': VisitNoteApplied;
  'book-appointment': void;
  'stock-count': void;
}

/** One object per page. A union over intents, so `apply`'s parameter narrows with `intent`. */
export type VoiceCapability = {
  [K in VoiceIntent]: {
    intent: K;
    context: IntentContexts[K];
    /**
     * Opaque. Identity of a registration is (registrant, intent, scope). A scope change while an
     * attempt or review is open discards it. The visit binding passes clinicalScopeKey.
     */
    scope?: string;
    apply(prefill: Reviewed<PrefillOf<K>>): IntentApplyResults[K];
  };
}[VoiceIntent];

// ---------------------------------------------------------------------------------------------
// What the bar reports after an apply. Data only; copy.ts turns it into words.

export type AppliedSummary =
  | { intent: 'visit-note'; added: readonly VisitSectionKey[]; leftOut: number }
  | { intent: 'book-appointment'; complete: true }
  | { intent: 'book-appointment'; complete: false; set: readonly ('doctor' | 'date' | 'patient')[]; remaining: string }
  | { intent: 'stock-count'; action: 'edit-count' }
  | { intent: 'stock-count'; action: 'search'; text: string };

// ---------------------------------------------------------------------------------------------
// Failures. `retry` names the one safe next step, or null for a permanent condition.

export type RetryStep = 'record' | 'transcribe' | 'interpret';

export type Failure =
  | { kind: 'not-configured'; retry: null }
  | { kind: 'forbidden'; retry: null }
  | { kind: 'unauthorised'; retry: null }
  | { kind: 'recording-unsupported'; retry: null }
  | { kind: 'mic-blocked'; retry: 'record' }
  | { kind: 'mic-missing'; retry: 'record' }
  | { kind: 'heard-nothing'; retry: 'record' }
  | { kind: 'recording-too-long'; retry: 'record' }
  | { kind: 'nothing-found'; retry: 'record' }
  /** The audio stays in the attempt; Try again re-sends it without re-speaking. */
  | { kind: 'transcribe-failed'; retry: 'transcribe' }
  /** The heard text is back in the composer; Try again re-sends it. */
  | { kind: 'understand-failed'; retry: 'interpret' }
  | { kind: 'rate-limited'; retry: 'transcribe' | 'interpret' }
  | { kind: 'offline'; retry: 'transcribe' | 'interpret' };

export type FailureKind = Failure['kind'];
