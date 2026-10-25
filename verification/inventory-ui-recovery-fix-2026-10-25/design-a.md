# Candidate A

Use an explicit delegated recovery command with purchase read, create, and review permissions. Preserve immutable branch and original actor ownership. Audit the authenticated recovering actor. Keep existing owner-scoped endpoints unchanged.

The handoff reference carries attemptId, originalActorId, optional invoiceId, and retained sourceDocumentIds. Existing attempts must match branch and supplied owner. An absent attempt requires that originalActorId names a user in the authenticated branch. Create a NO_STOCK_WRITTEN tombstone under that owner before reporting safety. An existing RUNNING attempt is fenced under the branch lock and existing row fence. A winning worker returns its exact saved invoice. Missing links reuse safe source rejection with historical stock UNVERIFIED.

The UI sets missing invoice identity on failed initial read, persists before recovery dispatch, and exposes safe recovery. A copied URL opens an explicit colleague recovery panel; it requires a reason. A permanent intake entry accepts recovery references.

Reject manager-only authorization because full purchase recovery permissions already permit equivalent branch invoice recovery. Reject transferring ownership or removing scope predicates. No new persisted schema is proposed.

Usage: recoverDelegated({branchId,userId}, {attemptId,originalActorId,invoiceId?,sourceDocumentIds,reason}). The recovery module owns one transaction with branch serialization, owner verification, final outcome, and audit.
