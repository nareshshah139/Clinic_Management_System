// Repo path: frontend/src/components/voice/ProposalReview.tsx
// Renders the Proposal union as the draft card. An exhaustive switch on `intent`; an intent
// without a view fails the build (the `never` default). All words come from lib/voice/copy.ts.

'use client';

import type { JSX } from 'react';
import type { Choice, Proposal, Slot, VisitSectionKey } from '@/lib/voice/types';

export interface ProposalReviewProps {
  proposal: Proposal;
  /** Sections written earlier in this attempt; non-empty only after a partial visit-note apply. */
  added: readonly VisitSectionKey[];
  busy: boolean;                                         // refining or applying: options disabled
  applyFailed: boolean;
  /** 'max-h-[45dvh]', or 'max-h-[30dvh]' while the text box has focus. */
  scrollClassName: string;
  onChoose(choice: Choice): void;
  onPlace(itemKey: string, place: VisitSectionKey | 'unsorted'): void;
  onApply(): void;                                       // enabled iff canApply(proposal)
  onEditHeard(): void;                                   // hidden when added is non-empty
  onDismiss(): void;
}

export function ProposalReview(props: ProposalReviewProps): JSX.Element {
  // <div className="rounded-lg border bg-background p-3">
  //   <div className={`${scrollClassName} overflow-auto`}>              // the only scroll area
  //     {COPY.heardPrefix} "{heard}" {added.length === 0 && <Button variant="link">{COPY.heardEdit}</Button>}
  //     switch (proposal.intent) {
  //       case 'visit-note': placed items grouped under SECTION_LABELS, label text-xs text-muted-foreground over
  //         value text-sm whitespace-pre-wrap; then COPY.visitNotPlacedHeading(n) in bg-warning-soft text-warning-text
  //         border-warning-border, each line quoted with a full-width native <select aria-label={COPY.visitPlaceLabel}>
  //         (min-h-11) over the four sections plus COPY.visitPlaceUnsorted. Every placed line has the same select.
  //       case 'book-appointment': <SlotRow> for Patient, Doctor, When (date + time)
  //       case 'stock-count': Medicine, Batch (with COPY.expires), On the shelf now (COPY.onShelfChange)
  //       default: assertNever(proposal)
  //     }
  //   </div>
  //   {applyFailed && <p role="alert">{COPY.applyFailed}</p>}
  //   {hint && <p className="text-sm text-muted-foreground">{hint}</p>}  // applyHint(proposal)
  //   <div className="flex gap-2 pt-2">                                    // outside the scroll area
  //     <Button disabled={!canApply(proposal) || busy} onClick={onApply}>{applyLabel(proposal)}</Button>
  //     <Button variant="outline" onClick={onDismiss}>{COPY.discard}</Button>
  //   </div>
  // </div>
  throw new Error('not implemented');
}

/**
 * One value's resolution. resolved -> text; unresolved -> message in the warning triple;
 * choose -> prompt and one radio row per option (min-h-11 rounded-md border; selected
 * border-primary bg-primary-soft), label plus detail such as patient ID, age and phone.
 */
export function SlotRow<T>(props: {
  label: string; slot: Slot<T>; render(value: T): string; onPick(optionKey: string): void; busy: boolean;
}): JSX.Element {
  throw new Error('not implemented');
}

/** Pure. Button text per proposal: COPY.apply.visitNote | bookingComplete | bookingPartial | stockEdit | showMatches. */
export function applyLabel(proposal: Proposal): string { throw new Error('not implemented'); }

/** Pure. Why Apply is disabled, or null: a choice is open -> COPY.applyDisabledNeedsYou;
 *  a visit note with nothing placed -> COPY.visitNothingPlaced; otherwise the first unresolved message when no prefill exists. */
export function applyHint(proposal: Proposal): string | null { throw new Error('not implemented'); }
