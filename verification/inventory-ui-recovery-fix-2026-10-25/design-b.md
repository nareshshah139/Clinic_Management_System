# Candidate B

Use an explicit delegated recovery command with purchase read, create, and review permissions. Preserve immutable attempt ownership. Derive owner from the persisted branch-local row. Audit the authenticated recovering actor. Keep existing owner-scoped endpoints unchanged.

For absent-before-registration, add Prepare recovery handoff for the authenticated original operator, even after purchase permissions are revoked. It establishes an actor-scoped tombstone or fences the original RUNNING attempt and returns only an opaque recovery reference. The colleague cannot create a modern tombstone using client-supplied originalActorId. Delegated recovery requires the persisted same-branch record. Failed preparation retains retry UI and does not claim registration.

Usage: prepareHandoff(authenticatedActor,attemptId), then recover(authorizedActor,{kind:attempt,attemptId},reason). Legacy target carries recoveryId, invoiceId and sourceDocumentIds and never infers no-stock from a missing invoice.

The UI gains a permanent Recover an interrupted purchase entry and a copied recovery URL with attempt/source references. Fresh missing-invoice URL enters unknown recovery state. Clipboard failure keeps selectable text.

Use transaction-aware helpers, not nested independent public calls. Branch lock and row fence serialize recovery against worker claim/bind. Replays converge. Exact saved invoice is returned, otherwise retained source fencing and RETRY_REJECTED preserve UNVERIFIED history.

Reject manager-only authorization and owner transfer for the same reasons as candidate A. One new self-service preparation endpoint is the tradeoff.
