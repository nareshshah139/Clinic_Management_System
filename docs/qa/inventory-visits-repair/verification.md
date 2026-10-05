# Inventory and visits release verification

This release repairs the audited inventory, billing and visit behaviors on production base `2ec721a`. The primary checkout and its unrelated work are preserved. Integration occurs on `codex/inventory-visits-release` in the managed `inventory-visits-fixes` checkout.

## Behavior changes

| Area | Corrected behavior | Evidence |
| --- | --- | --- |
| Checkout | Creation and confirmation are atomic. A stable request key returns the original committed invoice after a lost response. | Real PostgreSQL races; normal-auth HTTP; browser response-drop and reload check. |
| Invoice edits and stock | Invoice writers serialize; posting rechecks prescription and batch eligibility with bounded serializable retries. | Twenty-six financial scenarios, including both cancellation race orders and concurrent batch status/expiry edits. |
| Payments | Completed receipts determine paid and outstanding amounts. Duplicate keys replay; overpayment fails. | Concurrent payment/retry assertions and explicit cache reconciliation. |
| Package setup | Creating a package creates no fictional inventory purchase. | Financial database regression. |
| Visits | Completion and deletion are durable fields. Deleted visits disappear from patient/appointment consumers; appointments can restart with preserved historical linkage. | Database lifecycle and real HTTP checks; additive migration rehearsal. |
| Draft photos | Every draft-photo route enforces the authenticated branch. | Normal-auth multipart upload, list, binary read and delete denial for a foreign branch. |
| Prescriptions and refills | Status, validity and refill decisions persist. Only clinicians approve/reject refills. | Real guards, lifecycle database tests and command eligibility checks. |
| Clinical forms | Explicit empty/null values survive save and reload. Conflicts preserve drafts and require explicit reconciliation. | Field regressions, normal-auth browser clearing, fresh-context reload and idle-save checks. Final shared conflict-path review is pending. |
| Queue reads | GET performs no task creation or timestamp changes; filtering precedes pagination. Staff actions create tasks explicitly. | Full-population comparisons and real HTTP checks. Final duplicate-line identity review is pending. |
| Stock reads | PostgreSQL handles exact filtering, aggregation and paging. Fuzzy/name ordering preserves existing matching using slim candidate scans. | Fourteen complete-response comparisons across 2,500 batches. |

## Evidence recorded so far

- Full backend suite passed 766 tests; three existing tests were skipped.
- Twenty-six billing database scenarios passed on PostgreSQL 17.
- All five additive migrations applied against a local copy of the production schema and migration history. A second deployment applied nothing. Invalid-index checks passed. Six pre-existing constraint/index naming differences remain explicitly allowlisted.
- Contract syntax and discoverability passed for 67 changed TypeScript files. SQL, CONTRACTS discovery and CommonJS scripts were reviewed manually where the CLI does not support them.
- Actual Chrome UI saved an empty heart rate as null, preserved weight, reopened in a fresh login session and made no idle write.
- The real billing UI survived a dropped response after backend commit, then replayed the same checkout after reload. Its previous reset behavior retained the old patient, reproducing the reported defect before the reset correction.
- The production smoke workflow passed locally, including exact cleanup and unchanged fingerprints across 18 tables.

## Performance scope

The synthetic repeated-read queue benchmark with 1,000 prescriptions improved from 7,005 queries and 1,000 writes to 11 queries and zero writes. Measured runs were about 518–565 ms before and 14–17 ms after. Stock reads over 2,500 batches improved from 97 ms to 25 ms; fuzzy search improved from 101 ms to 60 ms. These are local fixture measurements, not production latency guarantees. Fuzzy/name sorting still scales with branch candidate count.

## Release gates

The final source-bound frontend/backend rebuild, final integrated frontend and changed-path tests, authenticated HTTP/browser acceptance, independent final verdict and deployed-revision verification remain pending. No deployment is claimed by this document yet.

A Railway-native snapshot was verified before release. Backup ID `fabe7078-b03c-45de-9063-8c0938c48877` was created at `2026-10-05T10:07:13.489Z`. Backend writes must be drained during migration to avoid old financial writers and the appointment/visit migration lock-order conflict.

## Limits and review

Whole-backend TypeScript checking retains 58 pre-existing diagnostics outside the corrected lifecycle modules; the production SWC build is the existing repository build path. External Codex/OCR services and unrelated workflows are outside this acceptance scope.

Independent reviewers inspected actual diffs, contracts, unchanged consumers and test artifacts. They used inherited models; model-family diversity was not established. Their initial failures drove the additional release corrections. Deslop is unavailable; direct whitespace, dead-code, comment and actual-diff cleanup checks provide the documented fallback. Obscura could not reliably navigate or dispatch the required controls, so the isolated Chrome fallback supplied actual UI evidence.

## Decisions that changed the implementation

Model the Domain led to durable visit/prescription states and explicit clinical clear intent. Make Operations Idempotent led to durable checkout/payment request keys. Separate Before Serializing Shared State led to four managed implementation worktrees. Build the Lever led to rerunnable real-database, HTTP, browser and migration checks. Prove It Works required the actual frontend proxy and normal login. Attack the Premise expanded conflict and medicine-line identity fixes across every participating caller instead of stopping at the first symptom.
