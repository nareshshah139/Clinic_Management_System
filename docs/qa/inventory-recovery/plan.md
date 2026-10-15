# Inventory recovery fixes

- [x] Read the Poteto Mode Principles index and applicable leaves.
- [x] Phase A. Frame the four user-specified recovery gaps.
- [x] Phase B. Ground two independent designs, cross-judge, and select transaction boundaries.
- [x] Phase C. Run each unit as a failing reproduction, smallest fix, and persisted-outcome verification.
  - [x] Partner sales. Retry outstanding quantities and correct unresolved matching without repeating deductions.
  - [x] Supplier payments. Reverse or reallocate atomically with an audit trail and restored balances.
  - [x] Opening stock. Persist row outcomes and retry failed rows without touching successful rows.
  - [x] Direct stock APIs. Require stable operation and row IDs, reject changed replays, and expose outcomes.
- [x] Phase D. Append evidence and decisions to decisions.tsv as each unit lands.
- [ ] Phase E. Review the integrated changes, verify UI recovery paths, and deliver the logic map and reviewable PRs.

## Definition of done

Each named recovery has an authorized API path, a UI action where the existing product exposes the workflow, and a test that proves preserved successful effects. Lost-response replay, changed-payload reuse, concurrent attempts, branch isolation, and atomic rollback are checked at the relevant boundary. A fresh local PostgreSQL database uses synthetic fixtures only. The map distinguishes confirmed recovery, unknown outcomes, and staff intervention. Production deployment is outside this change.

## Scope and rigor

Four domain units cover partner sales, supplier finance, opening imports, and direct stock movement APIs. These affect balances, so persisted-state checks supplement focused service and component tests. Existing broad TypeScript errors are recorded separately. The existing catalogue recovery PR remains a separate dependency.

## Throughput checkpoint

- Blocking first steps. Confirm the current schema, transaction boundaries, and smallest local database harness.
- Independent workstreams. Partner sales, supplier payments, and opening imports can use isolated worktrees; the parent owns direct stock retries and integration.
- Shared mutable state. Prisma schema, migrations, API client, and inventory controller changes are integrated by one writer. No worker generates into shared dependency symlinks.
- Smallest safe decomposition. One verifiable recovery unit at a time per owner, with independent review before integration.

## Capability fallbacks

The exact Poteto agent profile and a different model family are unavailable. Delegates use the full portable persona and the inherited model. No diversity claim is made. No installed deslop skill was found; a manual small-diff cleanup replaces that optional pass. Live UI reproduction applies to existing UI surfaces; exposed API-only paths use service and controller checks.
