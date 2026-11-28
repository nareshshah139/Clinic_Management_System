# Scanned purchase bill status machine

A second subject for the Quint kit. `spec/purchaseBill.qnt` models `PharmacyPurchaseInvoiceStatus` for one bill with one line. The TLA+ suite leaves review, rejection and reopening out (`verification/state-machines/purchase-import/README.md:93`). This spec covers them.

Every line number below is in `backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts` (S) at 09d2709 unless the file is named. The service file last changed at 57d67c0. Run everything from `verification/quint`. The `ocr:*` scripts are in `package.json`.

## Model to code

| Spec | Code | Cite |
| --- | --- | --- |
| `status` | `PharmacyPurchaseInvoiceStatus` | `schema.prisma:2206` |
| `committed` | `stockCommittedAt` is set | S:1471-1484 |
| `rev` | `updatedAt`. No transition checks a version number | S:1323, :1405-1411, :456 |
| `ocr`, `issues` | `unresolvedOcrFlags > 0`, `reconciliationIssues` not empty | S:2959 |
| `lowConf` | an OCR line under 98% confidence | S:594 |
| `posts` | PURCHASE rows in `stock_transactions` with reference `PINV-<invoice>-` | S:2295 |
| `reply` | HTTP 2xx is Ok, 4xx is Refused | |
| `edit` | `updateDraft`, `PATCH drafts/:id` | S:1082-1113 |
| `review` | `markReviewed`, `PATCH :id/review` | S:1308-1380 |
| `reopen` | `reopenReview`, `POST :id/reopen-review` | S:1389-1419 |
| `reject` | `rejectUnpostedInvoice`, `POST :id/reject` | S:449-463 |
| `commit` | `commitStock`, `POST :id/commit-stock` | S:1429, :1448 |
| `process` | `processInvoice`, `POST :id/process` | S:551, :555-653 |

The ghosts `content`, `editRev`, `approved` and `reopened` are not in the code. `approved` holds the content version on the screen of whoever last approved the bill. A `review` approves `content` when its `seen` revision is at or after `editRev`, and an older version otherwise. `process` approves the row it claimed.

## Commands

| Script | What it shows |
| --- | --- |
| `ocr:run` | the three declared invariants hold over 10000 random runs of 12 steps |
| `ocr:observe` | a reopened bill that posts is reachable, so the pass is not vacuous |
| `ocr:verify` | Apalache finds no violation of the three invariants in 12 steps |
| `ocr:design` | the design-question invariant `postedWhatWasSeen` fails |
| `ocr:design-verify` | Apalache finds the same failure in three steps |
| `ocr:client`, `ocr:client-verify` | the invariant holds when every review sends the revision, as the Workbench does |
| `ocr:traces` | 200 traces, seed 7, 12 steps, to `extras/ocr/traces` |
| `ocr:replay` | the in-memory port of the guards matches every trace |
| `ocr:replay:service` | the real NestJS service on an isolated Postgres schema matches every trace |

`MUTANT=<name>` removes one guard. The replay compares status, committed, flags, posts and reply after every step. It also compares `rev`, counted as the number of distinct `updatedAt` values the code has shown, so a write the spec does not expect is a divergence. The service adapter patches the real source in place and restores it on exit.

| Mutant | Guard removed | Result, stand-in and service alike |
| --- | --- | --- |
| `no-review-revision` | stale `expectedUpdatedAt` check, S:1323 | DIVERGED t_34 step 4 |
| `no-reject-revision` | `updatedAt` in the reject claim, S:456 | DIVERGED t_9 step 3 |
| `no-reopen-revision` | `updatedAt` in the reopen claim, S:1406 | DIVERGED t_32 step 2 |
| `reopen-any-status` | REVIEWED check and claim predicate, S:1402, :1406 | DIVERGED t_2 step 1 |
| `no-commit-status` | REVIEWED check and claim predicate, S:1666, :1475 | DIVERGED t_1 step 4 |
| `no-commit-idempotent` | return of a posted bill, S:1463 | DIVERGED t_3 step 2 |
| `no-lowconf-check` | confidence check, S:594 | DIVERGED t_12 step 8 |
| `reject-posted` | all three posted protections, S:455-457 | DIVERGED t_3 step 7 |
| `no-edit-guard` | editable status filter, S:1089 | DIVERGED t_0 step 6 |
| `no-review-flag-check` | OCR flag check, S:1343 | DIVERGED t_28 step 8 |
| `no-commit-precheck` | S:1666 alone | OK, the claim at S:1475 still refuses |
| `no-claim-status` | S:1475 alone | OK, the check at S:1666 still refuses |
| `no-reject-precheck` | S:455 alone | OK, the claim at S:456-457 still refuses |

The last three are redundant guards. A sequential replay cannot tell them apart from the pair. Only a race can, and the replay does not make one.

## Measured

Seed 42 for `quint run`, seed 7 for the traces.

- `ocr:run` found no violation in 10000 runs. It reached `reopenedThenPosted` in 174, `lowConfPostedByHand` in 160 and `approvedUnseen` in 417.
- `ocr:design` fails at `postedWhatWasSeen` in the three-step run edit, review with no revision from a screen at revision 0, commit.
- `ocr:client` holds, and `approvedUnseen` is reached in 0 of 10000 runs.
- `ocr:verify` and `ocr:client-verify` report no violation. `ocr:design-verify` reports a counterexample. Each takes about 2 to 30 seconds.
- `ocr:replay` and `ocr:replay:service` both print `OK 200 traces, 2400 steps, code matched the spec after every step`. The service run takes about 60 seconds.
- Only 522 of the 2400 steps write. 176 of the 200 traces end cancelled or posted, and `reopen` succeeds in 8 steps. A bug that only the success path of a reopen shows has little cover. Both reopen mutants are caught where the spec refuses and the mutated code accepts.
- `quint verify` starts Apalache on a fixed port. Two runs within a few seconds of each other can fail with `Connection dropped`. Leave a gap.

## Finding

**A review that omits `expectedUpdatedAt` approves content the reviewer never saw.**

- `ReviewPharmacyPurchaseInvoiceDto` marks the field optional (`pharmacy-purchase-invoice.dto.ts:608`). S:1323 skips the check when it is absent. The write at S:1357 binds to the `updatedAt` it just read in the same transaction, so it cannot catch the gap either.
- The spec reaches it in three steps. In trace `t_148` the code does the same. A screen at revision 0, an edit, a review with no revision, and a commit leave the bill posted on content nobody approved with their eyes. The replay matched the spec after every step of that trace on the real service.
- A one-off probe on the real service, not kept in the repo, made it concrete. A reviewer held revision A. Someone else changed the free quantity from 2 to 5. The review with `expectedUpdatedAt` got 409 `PURCHASE_STALE_REVISION`. The review without it got 200, the commit got 201 and 15 units posted, where the reviewer saw 12.
- The browser cannot omit it. Both calls send `<invoice>.updatedAt` (`PurchaseInvoiceWorkbench.tsx:2584` and `:3052`). The TypeScript type is `updatedAt?: string` (`:220`), so a missing value would compile, but every server response carries it because `formatPurchaseInvoice` spreads the row (S:3087). The gap is open to API clients. By reading, and not by running, it is also open to the pharmacy agent. Its `review_purchase_invoice` action calls `markReviewed(targetId, input, branchId)` with the proposal payload (`pharmacy-agent.service.ts:1539-1545`), and `assertExpectedVersion` returns early when a proposal has no `expectedVersion` (`:1570`).
- `process` does not open the gap. It validates and posts the row it claims inside one serializable transaction (S:572-576, :632-639), so no reviewer's screen is involved. `ocr:client` and `ocr:client-verify` include `process` and hold.
- `process` does differ from review. It refuses a line under 98% confidence that a person can review and commit (`lowConfPostedByHand`). It can move a REVIEWED bill back to RECONCILIATION_FAILED or OCR_REVIEW_REQUIRED with no reopen (S:616-629). A failing run still moves `updatedAt`, so it makes every open screen stale.

**A lost race inside `markReviewed` answers 500, not 409.** S:1357 uses `update` with a non-unique `where`. When another write moves `updatedAt` between the read and the write, Prisma throws P2025 and the exception filter answers 500. A one-off probe held a row lock while a review ran. It got HTTP 500 with and without `expectedUpdatedAt`, the backend log showed `databaseCode P2025`, and the bill stayed DRAFT. By reading, `reopen`, `reject` and `commit` use `updateMany` and a count check, so they answer 409.

Corrections to the explorer notes. The confidence check is at S:594, not S:597. Reject starts at S:449. The table has an `actionVersion` column, but only `inventory-purchase-actions.service.ts:137` uses it, and no transition in S does.

## Left out

- Concurrency. The spec interleaves one actor at a time. The Serializable retry at S:642, the claims under a race and the swallowed conflict at S:645-651 are not modelled.
- The optional `expectedUpdatedAt` on `updateDraft` (S:1090). An edit without it overwrites a newer draft. The Workbench omits it when `draftServerRevision` is null (`PurchaseInvoiceWorkbench.tsx:2490`).
- `commit-stock` takes no revision. A person who commits from an old screen posts whatever was last approved. The ghost tracks the approver, not the committer.
- One line, one batch. Multi-line bills, catalogue and supplier checks (S:227, :1353), inward receipts (S:1356), historical holds (S:1096-1101), import recovery and audit rows are not modelled. Their effects reach the spec only as `ocr`, `issues` and `lowConf`.
