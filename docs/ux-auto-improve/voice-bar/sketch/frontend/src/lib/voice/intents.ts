// Repo path: frontend/src/lib/voice/intents.ts
// One table, one row per intent. Everything intent-specific the bar needs comes from here:
// transcription context, parsed -> proposal resolution, review choices, proposal -> prefill and
// the applied summary. No strings live here: every message is taken from components/voice/copy.ts.
// The mapped type forces a row for every VoiceIntent in @cms/shared-types/voice.

import type { ParsedByIntent, VoiceIntent } from '@cms/shared-types/voice';
import type {
  AppliedSummary, BookingPrefill, BookingProposal, Choice, IntentContexts, PrefillOf, ProposalOf,
  StockCountPrefill, StockCountProposal, VisitNotePrefill, VisitNoteProposal, VisitSectionKey,
} from './types';
import type { Lookups } from './lookups';
import type { IstClock } from './spoken-time';
import { COPY } from './copy';
void COPY;

export interface ResolveDeps { lookups: Lookups; clock: IstClock; signal: AbortSignal }

export interface IntentDef<K extends VoiceIntent> {
  /** Prompt the transcription route uses (multipart field `context`). */
  transcribeContext: 'clinical' | 'plain';
  /** Spoken fields -> proposal, or null when nothing usable was said (failure nothing-found).
   *  Reads only through deps.lookups; never writes. */
  resolve(parsed: ParsedByIntent[K], context: IntentContexts[K], deps: ResolveDeps): Promise<ProposalOf<K> | null>;
  /** Apply one review choice; may re-resolve dependent slots (doctor -> time). */
  refine(proposal: ProposalOf<K>, choice: Choice, context: IntentContexts[K], deps: ResolveDeps): Promise<ProposalOf<K>>;
  /** null while a choice is open or nothing can be applied. Apply is enabled iff non-null. */
  toPrefill(proposal: ProposalOf<K>): PrefillOf<K> | null;
  /** What the applied notice reports. Visit-note totals are merged across partial applies by step(). */
  summarize(prefill: PrefillOf<K>): AppliedSummary;
}

export type IntentTable = { [K in VoiceIntent]: IntentDef<K> };

/**
 * @cc [owner:nareshshah139,label:product] voice-intent-table-complete
 * Every intent MUST define its transcription context, resolution, refinement, prefill and summary
 * in this table; no other module may branch on intent to decide resolution or apply behaviour.
 */
export const INTENTS: IntentTable = {
  'visit-note': {
    transcribeContext: 'clinical',
    resolve: resolveVisitNote,
    refine: async (p) => p,           // visit-note review uses `place`, not choices
    toPrefill: visitNotePrefill,
    summarize: (p) => ({ intent: 'visit-note', added: sectionKeys(p), leftOut: 0 }),
  },
  'book-appointment': {
    transcribeContext: 'plain',
    resolve: resolveBooking,
    refine: refineBooking,
    toPrefill: bookingPrefill,
    summarize: summarizeBooking,
  },
  'stock-count': {
    transcribeContext: 'plain',
    resolve: resolveStockCount,
    refine: refineStockCount,
    toPrefill: stockCountPrefill,
    summarize: (p) => (p.action === 'edit-count'
      ? { intent: 'stock-count', action: 'edit-count' }
      : { intent: 'stock-count', action: 'search', text: p.text }),
  },
};

function sectionKeys(p: VisitNotePrefill): VisitSectionKey[] {
  throw new Error('not implemented'); // Object.keys(p.sections) in VISIT_NOTE_SECTIONS order
}

// ---- visit note -------------------------------------------------------------------------------

export async function resolveVisitNote(
  parsed: ParsedByIntent['visit-note'], _ctx: IntentContexts['visit-note'], _deps: ResolveDeps,
): Promise<VisitNoteProposal | null> {
  // parsed.items.length === 0 -> null
  // items = parsed.items.map((it, i) => ({ key: `s${i}`, text: it.text, place: it.section }))
  throw new Error('not implemented');
}

/**
 * @cc [owner:nareshshah139,label:product] visit-note-verbatim-sections
 * Section text in a visit-note prefill MUST be the transcript's own sentences in spoken order and
 * MUST contain only placed items; with no placed item there is no prefill.
 */
export function visitNotePrefill(p: VisitNoteProposal): VisitNotePrefill | null {
  // placed = p.items.filter(i => i.place !== 'unsorted'); placed.length === 0 -> null
  // sections = group placed texts by place, preserving spoken order
  // unsorted items are ignored here; step() keeps them in review after the apply
  throw new Error('not implemented');
}

// ---- booking ----------------------------------------------------------------------------------

/**
 * @cc [owner:nareshshah139,label:product] voice-booking-no-guess
 * Doctor, patient and time MUST resolve only from exactly one match; several matches, an ambiguous
 * time or an unspoken doctor MUST become a choice, and no value may default to the first record or
 * to the doctor shown on the calendar.
 */
export async function resolveBooking(
  parsed: ParsedByIntent['book-appointment'], ctx: IntentContexts['book-appointment'], deps: ResolveDeps,
): Promise<BookingProposal | null> {
  // every field of parsed.fields is null -> null
  // doctor = matchDoctor(fields.doctorName, ctx.doctors)
  //   one      -> resolved(via 'said')
  //   many     -> choose(COPY.booking.whichDoctor, matches)
  //   none     -> choose(COPY.booking.noDoctorCalled(name), all doctors)
  //   not-said -> ctx.doctors.length === 1 ? resolved(via 'only-option') : choose(COPY.booking.whichDoctor, all doctors)
  //   Option detail for ctx.shownDoctorId is COPY.booking.shownOnCalendar. It is never preselected.
  // date = resolveSpokenDate(fields, deps.clock.today())
  //   ok -> resolved; missing|past|invalid -> unresolved(COPY.booking.date[reason])
  // patient = name ? deps.lookups.searchPatients(name, signal)
  //   1 -> resolved; 2..10 -> choose(COPY.booking.whichPatient(name), rows with identity)
  //   0 -> unresolved(COPY.booking.noPatient(name)); not said -> unresolved(COPY.booking.patientNotSaid)
  // time = resolveTimeSlot({ said: fields, doctor, date }, ctx, deps)
  throw new Error('not implemented');
}

/** Re-run whenever doctor or date changes; needs that doctor's hours on that date. */
async function resolveTimeSlot(
  p: Pick<BookingProposal, 'said' | 'doctor' | 'date'>, ctx: IntentContexts['book-appointment'], deps: ResolveDeps,
): Promise<BookingProposal['time']> {
  // doctor or date not resolved -> unresolved(COPY.booking.doctorAndDateFirst)
  // hours = await deps.lookups.workingHours(doctor, date, ctx.defaultHours, signal)
  // r = resolveSpokenTime(said, hours, { date, today: clock.today(), minutesNow: clock.minutesNow() })
  //   ok            -> resolved
  //   ambiguous     -> choose(COPY.booking.morningOrNight(spoken), options labelled '9:30 am' / '9:30 pm')
  //   missing       -> unresolved(COPY.booking.pickSlot)
  //   outside-hours -> unresolved(COPY.booking.outsideHours(spoken, doctorName, hours))
  //   past          -> unresolved(COPY.booking.timePassed)
  throw new Error('not implemented');
}

export async function refineBooking(
  p: BookingProposal, c: Choice, ctx: IntentContexts['book-appointment'], deps: ResolveDeps,
): Promise<BookingProposal> {
  // c.intent !== 'book-appointment' or p[c.slot] not 'choose' or key unknown -> p
  // set that slot resolved(via 'chosen'); slot 'doctor' -> time = await resolveTimeSlot(...)
  throw new Error('not implemented');
}

export function bookingPrefill(p: BookingProposal): BookingPrefill | null {
  // any slot in 'choose' -> null
  // all four resolved -> complete: slot = slotFrom(time, p.slotMinutes)
  //   summary = { heard, patientIdentity, doctorName, whenText: `${formatIstDateLong(date)}, ${slotText}` }
  // else partial: doctor and date if resolved; patient chosen | search(spoken name) | none
  //   remaining = message of the first unresolved slot in the order patient, date, time
  // nothing resolved and no spoken patient name -> null
  throw new Error('not implemented');
}

function summarizeBooking(p: BookingPrefill): AppliedSummary {
  // complete -> { complete: true }
  // partial  -> { complete: false, set: which of doctor/date/patient were filled, remaining }
  throw new Error('not implemented');
}

// ---- stock count ------------------------------------------------------------------------------

/**
 * @cc [owner:nareshshah139,label:product] voice-count-exact-batch
 * A voice count MUST target exactly one stock row whose batch matches the spoken batch and whose
 * unit matches any spoken unit; otherwise the prefill MAY only fill the stock search.
 */
/**
 * @cc [owner:nareshshah139,label:product] voice-count-dialog-rules
 * A count equal to the shelf count, below the set-aside stock, or not a whole number MUST stay
 * unresolved with its reason and MUST NOT produce a prefill.
 */
export async function resolveStockCount(
  parsed: ParsedByIntent['stock-count'], _ctx: IntentContexts['stock-count'], deps: ResolveDeps,
): Promise<StockCountProposal | null> {
  // every field null -> null
  // missing product, batch or quantity -> row unresolved(COPY.stock.sayAll)
  // rows = await deps.lookups.stockRows(productName, signal)      // the list's own endpoint
  // keep rows with normalizeBatch(row.record.batchNumber) === normalizeBatch(batchNumber)
  //   0 -> row unresolved(COPY.stock.noBatch(batch, product))
  //   1 -> unit check: mismatch -> row unresolved(COPY.stock.unitMismatch(rowUnit, spokenUnit)); else resolved
  //   n -> row choose(COPY.stock.whichOne, rows with label)
  // count = checkCount(quantity, row)
  throw new Error('not implemented');
}

/** Count rules mirror StockEditDialog's own `valid` (StockEditDialog.tsx:26-27). */
export function checkCount(quantity: number | null, row: { currentStock: number; heldStock: number; unit: string } | null): StockCountProposal['count'] {
  // !Number.isSafeInteger(q) || q < 0           -> unresolved(COPY.stock.wholeNumber)
  // row === null                                -> resolved (re-checked by refine once a row is chosen)
  // q === row.currentStock                      -> unresolved(COPY.stock.matchesShelf)
  // q < row.heldStock                           -> unresolved(COPY.stock.belowHeld(row.heldStock, row.unit))
  // else                                        -> resolved
  throw new Error('not implemented');
}

export async function refineStockCount(
  p: StockCountProposal, c: Choice, _ctx: IntentContexts['stock-count'], _deps: ResolveDeps,
): Promise<StockCountProposal> {
  // chosen row goes through the unit check, then count = checkCount(quantity, chosen row)
  throw new Error('not implemented');
}

export function stockCountPrefill(p: StockCountProposal): StockCountPrefill | null {
  // row 'choose'                        -> null
  // row resolved, count resolved        -> edit-count
  // row resolved, count unresolved      -> null (nothing valid to submit; the message says why)
  // row unresolved and spokenProduct    -> search(spokenProduct)   label COPY.apply.showMatches
  // else                                -> null
  throw new Error('not implemented');
}
