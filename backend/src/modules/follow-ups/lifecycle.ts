import { CheckInState, FollowUpTrackState } from '@prisma/client';

type Move<S> = { readonly from: readonly S[]; readonly to: S };

/** Every check-in state change, as the check-in model in verification/state-machines/check-in allows it. */
export const CHECK_IN_MOVES = {
  open: { from: [CheckInState.SCHEDULED], to: CheckInState.OPEN },
  answer: { from: [CheckInState.OPEN], to: CheckInState.ANSWERED },
  miss: { from: [CheckInState.OPEN], to: CheckInState.MISSED },
  cancel: { from: [CheckInState.SCHEDULED, CheckInState.OPEN], to: CheckInState.CANCELLED },
} as const satisfies Record<string, Move<CheckInState>>;

export const CHECK_IN_TERMINAL: readonly CheckInState[] = [CheckInState.ANSWERED, CheckInState.MISSED, CheckInState.CANCELLED];

/** A plan change stops a COMPLETED track too, so the visit keeps one track that is not STOPPED. */
export const TRACK_MOVES = {
  complete: { from: [FollowUpTrackState.ACTIVE], to: FollowUpTrackState.COMPLETED },
  stop: { from: [FollowUpTrackState.ACTIVE, FollowUpTrackState.COMPLETED], to: FollowUpTrackState.STOPPED },
} as const satisfies Record<string, Move<FollowUpTrackState>>;

export const STOP_REASONS = ['doctor-stopped', 'plan-changed', 'visit-deleted', 'patient-archived'] as const;
export type StopReason = (typeof STOP_REASONS)[number];

export function checkInCan(move: keyof typeof CHECK_IN_MOVES, from: CheckInState): boolean {
  return (CHECK_IN_MOVES[move].from as readonly CheckInState[]).includes(from);
}

export function trackCan(move: keyof typeof TRACK_MOVES, from: FollowUpTrackState): boolean {
  return (TRACK_MOVES[move].from as readonly FollowUpTrackState[]).includes(from);
}
