// Repo path: frontend/src/components/visits/visit-note-voice.ts  (package V)
// The visit page's side of the voice bar. PrescriptionBuilder passes its four section values and
// setters plus its clinicalScopeKey; this file owns how a reviewed draft is merged in and undone.
// All four sections are Textareas, so every append is multi-line.

import { useVoiceCapability } from '@/components/voice/VoiceBarProvider';
import type { Reviewed, VisitNoteApplied, VisitNotePrefill, VisitSectionKey } from '@/lib/voice/types';

export interface FieldBinding {
  value: string;
  set(next: string): void;
  /** Chief Complaints only: typing sets chiefComplaintsTouched (PrescriptionBuilder.tsx:4756). */
  markTouched?: () => void;
}

/** Mapped over the shared section list: a section added to the wire fails to compile here until bound. */
export type VisitNoteFields = { [S in VisitSectionKey]: FieldBinding };

/**
 * @cc [owner:nareshshah139,label:product] visit-note-preserves-existing-text
 * Applying a draft MUST keep every existing character of a field except trailing whitespace,
 * MUST mark Chief Complaints touched as typing does, and MUST NOT change the examination disclosure.
 */
export function appendDraftText(existing: string, sentences: readonly string[]): string {
  // base = existing.replace(/\s+$/, ''); addition = sentences.join(' ')
  // return base ? `${base}\n${addition}` : addition
  throw new Error('not implemented');
}

/**
 * @cc [owner:nareshshah139,label:product] visit-note-undo-only-untouched
 * Undo MUST restore a field's pre-apply text only if the field still holds exactly what apply
 * wrote; fields edited since MUST be left alone and reported as kept.
 */
export function applyVisitNote(
  latest: { readonly current: VisitNoteFields },
  prefill: Reviewed<VisitNotePrefill>,
): VisitNoteApplied {
  // const written: Array<{ key, before, after }> = []
  // compute every `after` first, then call the setters (nothing throws between setter calls)
  // for each [key, sentences] of prefill.sections (VISIT_NOTE_SECTIONS order):
  //   f = latest.current[key]; after = appendDraftText(f.value, sentences); f.set(after); f.markTouched?.()
  // return {
  //   written: written.map(w => w.key),
  //   undo: () => {   // reads current values, not values from apply time
  //     restored = written.filter(w => latest.current[w.key].value === w.after) -> set(before); markTouched stays set
  //     kept = the rest
  //     return { restored: keys(restored), kept: keys(kept) }
  //   },
  // }
  throw new Error('not implemented');
}

/**
 * @cc [owner:nareshshah139,label:security] visit-note-scope-bound
 * The visit binding MUST register with the builder's clinicalScopeKey as its scope, so a draft or
 * undo started for one patient, visit and doctor can never write into another.
 */
export function useVisitNoteVoice(fields: VisitNoteFields, scope: string): void {
  // const latest = useRef(fields); latest.current = fields;
  // useVoiceCapability({ intent: 'visit-note', context: {}, scope, apply: (p) => applyVisitNote(latest, p) });
  void useVoiceCapability;
  throw new Error('not implemented');
}
