// Repo path: frontend/src/lib/voice/machine.ts
// The bar's whole lifecycle as one pure transition function. No React, no fetch, no timers.
// The store (components/voice/voice-bar-store.ts) runs the returned commands and feeds results
// back as events tagged with the attempt id.
//
// Why the Strict Mode bug class (useSpeechToTextRecorder.ts:32,61-66) cannot recur:
//  - There is no mounted flag. Async work reports back as an event carrying its attempt id, and
//    step() drops any event whose id is not the live attempt.
//  - Escape, Dismiss, navigation, a capability or scope change and unmount all leave the busy
//    phase, so earlier in-flight results are stale by construction.
//  - Abort controllers stop the mic and the upload; correctness does not depend on them.

import { VOICE_TEXT_LIMITS } from '@cms/shared-types/voice';
import type {
  AppliedSummary, Choice, Failure, NoteItem, Prefill, Proposal, Reviewed, VisitNoteUndone,
  VisitSectionKey, VoiceIntent,
} from './types';

// ---------------------------------------------------------------------------------------------
// Registration identity. RegistrantId is minted by the registry (VoiceBarProvider.tsx), one per
// mounted useVoiceCapability call. The key adds intent and scope, read live from the registrant.

export type RegistrantId = number & { readonly __registrant: true };
export type AttemptId = number & { readonly __attempt: true };

export interface RegistrationKey {
  registrant: RegistrantId;
  intent: VoiceIntent;
  scope: string | null;
}

/** Equal registrant, intent and scope. null equals only null. */
export function sameRegistration(a: RegistrationKey | null, b: RegistrationKey | null): boolean {
  throw new Error('not implemented');
}

/** What the attempt was started against. Apply and undo go to this key or nowhere. */
export interface Attempt { id: AttemptId; key: RegistrationKey }

/** What an apply reported back. Functions (undo) stay in the store, never in the model. */
export type ApplyOutcome =
  | { intent: 'visit-note'; written: readonly VisitSectionKey[] }
  | { intent: 'book-appointment' }
  | { intent: 'stock-count' };

export type Notice =
  | { kind: 'applied'; summary: AppliedSummary; canUndo: boolean }
  | { kind: 'undone'; result: VisitNoteUndone }
  | { kind: 'discarded' }
  | { kind: 'page-changed' }
  | { kind: 'too-long'; limit: number }
  /** `attempt` is kept only when failure.retry === 'transcribe' (the store keeps its audio). */
  | { kind: 'failed'; failure: Failure; attempt: Attempt | null };

/**
 * The phases. Every busy phase and review carry the attempt they belong to; idle carries the
 * composer text and one notice. A proposal while listening, a transcript without an attempt, or
 * two attempts at once have no representation.
 */
export type BarPhase =
  | { phase: 'idle'; text: string; notice: Notice | null }
  | { phase: 'listening'; attempt: Attempt; since: number | null }   // null until the mic opens
  | { phase: 'transcribing'; attempt: Attempt }
  | { phase: 'interpreting'; attempt: Attempt; heard: string }        // parse + resolve
  | {
      phase: 'review'; attempt: Attempt; proposal: Proposal;
      /** Sections already written earlier in this attempt (visit note partial apply). */
      added: readonly VisitSectionKey[];
      applyFailed: boolean;
    }
  | { phase: 'refining'; attempt: Attempt; proposal: Proposal; added: readonly VisitSectionKey[] }
  | {
      phase: 'applying'; attempt: Attempt; proposal: Proposal;
      added: readonly VisitSectionKey[]; prefill: Reviewed<Prefill>;
    };

export interface BarModel {
  /** Monotonic; the next attempt gets seq + 1. */
  seq: number;
  /** The registration the bar serves, or null (bar hidden). Mirrored from the registry. */
  active: RegistrationKey | null;
  /** From GET /voice/status once per page load, or false after any not-configured failure.
   *  false is sticky: no retry, no polling. null = not known yet. */
  configured: boolean | null;
  statusRequested: boolean;
  /** Whether MediaRecorder and getUserMedia exist. Typing works without them. */
  micSupported: boolean;
  /** The visit-note attempt whose writes Undo reverts. Dropped on the next attempt or any
   *  registration change, so Undo can never write into another patient's visit. */
  lastUndo: { key: RegistrationKey; attempt: AttemptId } | null;
  phase: BarPhase;
}

export type BarEvent =
  | { type: 'capability'; active: RegistrationKey | null }
  | { type: 'status'; configured: boolean }
  | { type: 'edit'; text: string }
  | { type: 'send' }                                             // Enter or the send button
  | { type: 'mic' }                                              // mic button when not listening
  | { type: 'mic-opened'; attempt: AttemptId; at: number }
  | { type: 'stop' }                                             // stop button, Enter while listening, 10-minute cap
  | { type: 'escape' }
  | { type: 'retry' }                                            // Try again on a failed notice
  | { type: 'transcribed'; attempt: AttemptId; text: string }
  /** null = parsed, but nothing usable in it (nothing-found). */
  | { type: 'proposed'; attempt: AttemptId; proposal: Proposal | null }
  | { type: 'failed'; attempt: AttemptId; failure: Failure }
  | { type: 'choose'; choice: Choice }
  | { type: 'place'; itemKey: string; place: VisitSectionKey | 'unsorted' }
  | { type: 'apply' }
  | { type: 'applied'; attempt: AttemptId; outcome: ApplyOutcome }
  | { type: 'apply-failed'; attempt: AttemptId; reason: 'page-changed' | 'threw' }
  | { type: 'undo' }
  | { type: 'undone'; result: VisitNoteUndone }
  | { type: 'edit-heard' }                                       // "Edit" beside "Heard:"
  | { type: 'dismiss' };                                         // Discard, Done

/** Side effects step() asks for. The store executes them. */
export type Command =
  | { do: 'fetch-status' }
  | { do: 'open-mic'; attempt: Attempt }
  | { do: 'finish-recording'; attempt: Attempt }                 // stop mic, keep audio, transcribe
  | { do: 'transcribe'; attempt: Attempt }                       // retry with the kept audio
  | { do: 'interpret'; attempt: Attempt; text: string }          // parse route + resolve
  | { do: 'refine'; attempt: Attempt; proposal: Proposal; choice: Choice }
  | { do: 'abort'; attempt: AttemptId }                          // mic off, fetch aborted
  | { do: 'release-audio'; attempt: AttemptId }
  | { do: 'apply'; attempt: Attempt; prefill: Reviewed<Prefill> }
  | { do: 'undo'; key: RegistrationKey; attempt: AttemptId }     // runs every undo of that attempt, newest first
  | { do: 'focus-composer' }
  | { do: 'restore-focus' };                                     // element focused before Ctrl/Cmd + /

export interface Step { model: BarModel; commands: readonly Command[] }

export function initialModel(micSupported: boolean): BarModel {
  return {
    seq: 0, active: null, configured: null, statusRequested: false, micSupported, lastUndo: null,
    phase: { phase: 'idle', text: '', notice: null },
  };
}

/**
 * @cc [owner:nareshshah139,label:product] voice-bar-stale-results-dropped
 * A transcript, proposal, failure or apply result MUST change the bar only if it carries the live
 * attempt id; results of discarded, cancelled, superseded or unmounted attempts MUST be ignored.
 */
/**
 * @cc [owner:nareshshah139,label:product] voice-bar-apply-needs-review
 * A prefill MUST reach a page only from review, with no choice open and at least one value placed
 * or resolved, and only to the registration key the attempt started with. Unsorted visit lines MUST
 * NOT be written, MUST stay in review until placed, and MUST be dropped only by Dismiss.
 */
/**
 * @cc [owner:nareshshah139,label:product] voice-bar-scope-bound
 * A change of registrant, intent or scope MUST discard an open attempt or review with the
 * page-changed notice and MUST drop any pending undo; no prefill or undo may cross it.
 */
/**
 * @cc [owner:nareshshah139,label:product] voice-bar-not-configured-sticky
 * When voice is not configured the bar MUST refuse spoken and typed input with one plain message
 * and MUST NOT retry or poll; a failure whose retry is null MUST NOT offer Try again.
 */
export function step(model: BarModel, event: BarEvent): Step {
  // Every row not listed returns { model, commands: [] }. [live] means event.attempt === phase.attempt.id.
  //
  // capability(k):
  //   sameRegistration(model.active, k) -> active = k, nothing else
  //   otherwise:
  //     if k && configured === null && !statusRequested -> commands [fetch-status]; statusRequested = true
  //     if phase is listening|transcribing|interpreting|review|refining|applying:
  //        commands += [abort(attempt.id), release-audio(attempt.id)]
  //        phase = idle('', model.active && k ? { page-changed } : null)
  //     if phase is idle with notice failed{attempt}: commands += [release-audio]; notice = null
  //     lastUndo = null; active = k
  // status(c) -> configured = configured === false ? false : c
  //
  // idle(text, notice):
  //   edit(t)  -> text = t (notice kept)
  //   send     -> guards in order:
  //                 !active -> no change
  //                 configured === false -> notice failed{not-configured, attempt null}
  //                 text.trim() === '' -> no change
  //                 text.trim().length > VOICE_TEXT_LIMITS[active.intent] -> notice too-long{limit}, text kept
  //               attempt = next(); phase = interpreting(attempt, text.trim())
  //               commands [release-audio(old notice attempt) if any, interpret(attempt, text.trim())]; lastUndo = null
  //   mic      -> !active -> no change; configured === false -> notice failed{not-configured}
  //               !micSupported -> notice failed{recording-unsupported}
  //               attempt = next(); phase = listening(attempt, null); commands [release-audio(old) if any, open-mic]
  //               lastUndo = null
  //   retry    -> only when notice.kind === 'failed' && notice.failure.retry !== null:
  //                 'record'     -> as mic
  //                 'interpret'  -> as send (the heard text is in the composer)
  //                 'transcribe' -> notice.attempt && sameRegistration(notice.attempt.key, active)
  //                                   ? phase = transcribing(notice.attempt); commands [transcribe(notice.attempt)]
  //                                   : idle(text, page-changed); commands [release-audio]
  //   undo     -> lastUndo && sameRegistration(lastUndo.key, active) -> commands [undo(...)]; lastUndo = null
  //   undone(r)-> notice = { undone, r }
  //   dismiss  -> notice = null; release-audio if the notice held an attempt
  //   escape   -> as dismiss, plus commands [restore-focus]
  //
  // listening(attempt):
  //   mic-opened [live] -> since = at
  //   stop              -> transcribing(attempt); commands [finish-recording(attempt)]
  //   escape            -> idle('', discarded); commands [abort, release-audio, restore-focus]
  //   dismiss           -> idle('', discarded); commands [abort, release-audio]
  //   failed [live]     -> idle('', failed{f, null}); commands [release-audio]
  //
  // transcribing(attempt):
  //   transcribed [live] -> text.trim() === '' ? idle('', failed{heard-nothing}) : interpreting(attempt, text.trim())
  //                         commands [release-audio, interpret if non-empty]
  //   escape             -> idle('', discarded); commands [abort, release-audio, restore-focus]
  //   failed [live]      -> idle('', failed{f, f.retry === 'transcribe' ? attempt : null})
  //                         commands [release-audio] unless f.retry === 'transcribe'
  //
  // interpreting(attempt, heard):
  //   proposed [live] -> proposal === null ? idle(heard, failed{nothing-found})
  //                                        : review(attempt, proposal, added [], applyFailed false)
  //   escape          -> idle(heard, null); commands [abort, restore-focus]
  //   failed [live]   -> idle(heard, failed{f, null})            // heard text back in the composer
  //
  // review(attempt, proposal, added, applyFailed):
  //   choose(c) [c.intent === proposal.intent] -> refining(attempt, proposal, added); commands [refine]
  //   place(k, p) [visit-note]                 -> review(placeItem(proposal, k, p), applyFailed false)
  //   apply     -> prefill = INTENTS[proposal.intent].toPrefill(proposal); prefill === null -> no change
  //                !sameRegistration(attempt.key, active) -> idle('', page-changed)
  //                phase = applying(attempt, proposal, added, markReviewed(prefill)); commands [apply(attempt, prefill)]
  //   edit-heard [added.length === 0] -> idle(proposal.heard, null); commands [focus-composer]
  //   dismiss   -> added.length
  //                  ? idle('', applied{ visit-note, added, leftOut: unsortedCount(items) }, canUndo true)
  //                  : idle('', discarded)
  //   escape    -> as dismiss, plus commands [restore-focus]
  //
  // applying(attempt, proposal, added, prefill):
  //   applied [live], outcome visit-note:
  //       added2 = union(added, outcome.written); lastUndo = { key: attempt.key, attempt: attempt.id }
  //       rest = proposal.items.filter(i => i.place === 'unsorted')
  //       rest.length ? review(attempt, { ...proposal, items: rest }, added2, false)
  //                   : idle('', applied{ visit-note, added2, leftOut 0 }, canUndo true); commands [focus-composer]
  //   applied [live], booking or stock:
  //       idle('', applied{ INTENTS[intent].summarize(prefill) }, canUndo false); lastUndo = null
  //       (no focus command: the opened dialog takes focus)
  //   apply-failed [live] threw        -> review(attempt, proposal, added, applyFailed true)
  //   apply-failed [live] page-changed -> idle('', page-changed)
  //
  // refining(attempt, proposal, added):
  //   proposed [live] -> review(attempt, event.proposal ?? proposal, added, false)
  //   failed [live]   -> idle(proposal.heard, failed{f, null})
  //   escape          -> idle(proposal.heard, null); commands [abort, restore-focus]
  //
  // Any phase, failed [live] with kind not-configured -> also configured = false.
  void VOICE_TEXT_LIMITS;
  throw new Error('not implemented');
}

/** Pure: move one visit-note item. Unknown key or a non-visit proposal returns it unchanged. */
export function placeItem(proposal: Proposal, itemKey: string, place: VisitSectionKey | 'unsorted'): Proposal {
  throw new Error('not implemented');
}

/** Derived: the busy phases disable the composer and mic. */
export function isBusy(phase: BarPhase): boolean {
  // listening | transcribing | interpreting | refining | applying
  throw new Error('not implemented');
}

/** Derived: Apply is enabled iff toPrefill() is non-null. Single source: intents.ts. */
export function canApply(proposal: Proposal): boolean {
  throw new Error('not implemented');
}

export function unsortedCount(items: readonly NoteItem[]): number {
  throw new Error('not implemented');
}

/** Not exported. lib/voice/testing.ts mints Reviewed values for specs with its own cast. */
function markReviewed<T extends Prefill>(prefill: T): Reviewed<T> {
  return prefill as Reviewed<T>;
}
void markReviewed;
