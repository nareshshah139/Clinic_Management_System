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
| Clinical forms | Explicit empty/null values survive save and reload. Conflicts preserve drafts and require explicit reconciliation. | Field regressions, normal-auth browser clearing, fresh-context reload and idle-save checks. Shared conflict-path review passed; actual conflict and recovery UI checks passed. |
| Queue reads | GET performs no task creation or timestamp changes; filtering precedes pagination. Staff actions create tasks explicitly. | Full-population comparisons and real HTTP checks. Duplicate-line regressions and normal-auth HTTP checks passed; final complete-regimen review passed. |
| Stock reads | PostgreSQL handles exact filtering, aggregation and paging. Fuzzy/name ordering preserves existing matching using slim candidate scans. | Fourteen complete-response comparisons across 2,500 batches. |

## Evidence recorded so far

- Full backend suite passed 771 tests; three existing tests were skipped.
- Full frontend suite passed 458 tests across 57 suites.
- Twenty-six billing database scenarios passed on PostgreSQL 17.
- All five additive migrations applied against a local copy of the production schema and migration history. A second deployment applied nothing. Invalid-index checks passed. Six pre-existing constraint/index naming differences remain explicitly allowlisted.
- Contract syntax and discoverability passed for 68 changed TypeScript files, followed by rechecking all five files in the final regimen/snapshot correction. SQL, CONTRACTS discovery and CommonJS scripts were reviewed manually where the CLI does not support them.
- Actual Chrome UI saved an empty heart rate as null, preserved weight, reopened in a fresh login session and made no idle write. A competing save returned 409, retained local edits and stopped retries; explicit discard reloaded the authoritative value. An independent reviewer repeated this with a separate synthetic visit and browser.
- The real billing UI survived a dropped response after backend commit, replayed the same checkout after reload, then cleared context and successfully billed a second patient. A probe initially pressed Escape while focus was inside the PDF iframe; closing the visible dialog through its Close button proved the reset handler.
- The production smoke workflow passed locally, including exact cleanup and unchanged fingerprints across 18 tables.

## Performance scope

The synthetic repeated-read queue benchmark with 1,000 prescriptions improved from 7,005 queries and 1,000 writes to 11 queries and zero writes. Measured runs were about 518–565 ms before and 14–24 ms after. Stock reads over 2,500 batches improved from 97 ms to 25 ms; fuzzy search improved from 101 ms to 60 ms. These are local fixture measurements, not production latency guarantees. Fuzzy/name sorting still scales with branch candidate count.

## Release gates

The final source-bound frontend/backend rebuild, complete backend/frontend suites, 11 authenticated HTTP checks, clinical/browser recovery, billing response-loss/reset checks and exact-cleanup smoke rehearsal all passed on application source `0fbd340`. The source hash is `62187b285213ec81b26842c1ef70d0b0fa6eb4623e9a93f7928b0983a98e860f`. All four implementation areas have independent passing scope reviews. Final per-PR verification and deployed-revision checks remain pending. No deployment is claimed by this document yet.

A Railway-native snapshot was verified before release. Backup ID `fabe7078-b03c-45de-9063-8c0938c48877` was created at `2026-10-05T10:07:13.489Z`. Backend writes must be drained during migration to avoid old financial writers and the appointment/visit migration lock-order conflict.

## Limits and review

Whole-backend TypeScript checking retains 58 pre-existing diagnostics outside the corrected lifecycle modules; the production SWC build is the existing repository build path. External Codex/OCR services and unrelated workflows are outside this acceptance scope.

Independent reviewers inspected actual diffs, contracts, unchanged consumers and test artifacts. They used inherited models; model-family diversity was not established. Their initial failures drove the additional release corrections. Deslop is unavailable; direct whitespace, dead-code, comment and actual-diff cleanup checks provide the documented fallback. Obscura could not reliably navigate or dispatch the required controls, so the isolated Chrome fallback supplied actual UI evidence.

## Decisions that changed the implementation

Model the Domain led to durable visit/prescription states and explicit clinical clear intent. Make Operations Idempotent led to durable checkout/payment request keys. Separate Before Serializing Shared State led to four managed implementation worktrees. Build the Lever led to rerunnable real-database, HTTP, browser and migration checks. Prove It Works required the actual frontend proxy and normal login. Attack the Premise expanded conflict and medicine-line identity fixes across every participating caller instead of stopping at the first symptom.

## Reproduction commands

Run from this checkout with isolated PostgreSQL 17 on `127.0.0.1:55457`. Tests create disposable schemas or databases. Do not substitute a production database URL.

```sh
INVENTORY_READ_TEST_DATABASE_URL=postgresql://nshah@127.0.0.1:55457/postgres VISIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://nshah@127.0.0.1:55457/postgres PURCHASE_AUTOMATION_TEST_DATABASE_URL=postgresql://nshah@127.0.0.1:55457/postgres npm test --workspace=backend -- --runInBand
npm test --workspace=frontend -- --runInBand
node scripts/diagnostics/inventory-visits-build.cjs
node scripts/diagnostics/inventory-visits-local.cjs
```

With the generated synthetic app running, use a separate terminal for each sequential check. The local session file contains synthetic credentials and must remain uncommitted. The browser scripts launch and close their own isolated Chrome processes.

```sh
node scripts/diagnostics/inventory-visits-http-acceptance.cjs
node scripts/diagnostics/inventory-visits-browser-acceptance.cjs
node scripts/diagnostics/inventory-visits-billing-browser.cjs
node scripts/diagnostics/inventory-visits-production-smoke.cjs --local-rehearsal
```

Production snapshot, preservation and smoke tools are scoped to the configured clinic Railway project. `inventory-visits-railway-snapshot.cjs` without `--create` verifies the existing backup. Capture preservation only after backend writes stop; verify after migration. The production smoke requires `--run` and a verified snapshot, creates only a uniquely named synthetic branch, and checks exact cleanup.
