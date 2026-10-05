# Billing integrity verification

The billing lane started at `2ec721a` in the isolated `billing-integrity` worktree. It changes invoice commands, payment receipts, package recipe creation, the active invoice builder, and the invoice list. It does not deploy or change production data.

## Runtime evidence

Four probes reproduced the old behavior against real local PostgreSQL tables.

| Scenario | Before | After |
| --- | --- | --- |
| Cancel a posted sale of 5 from stock of 20 | Invoice became CANCELLED; stock stayed 15 | Direct cancellation rejects with sales return instructions; invoice stays posted; stock stays 15 |
| Confirm while a draft edit changes quantity 1 to 10 | Billed 10; deducted 1 | Confirmation winning the lock rejects the edit; billed 1 and deducted 1. Edit winning the lock bills 10 and deducts 10 |
| Two concurrent payments of 80 on an invoice of 100 | Receipts totaled 160; cache showed paid 80 and balance 20 | One receipt of 80; second payment rejects; balance 20 |
| Create a package recipe with no stock | Fictitious PURCHASE of 10 | No purchase movement, inventory creation, mapping creation, or balance change |

`node scripts/diagnostics/billing-integrity.cjs` passes 26 database scenarios on PostgreSQL 17 at `127.0.0.1:55457`. It creates a unique synthetic schema and drops only that schema afterward. The scenarios also cover concurrent deletion, duplicate checkout and payment requests, changed-payload rejection, branch isolation, stock contention, transaction rollback, and cache reconciliation. The report is written to `/tmp/billing-integrity-after.json`.

The existing backend invoice suite passes 5 tests. The frontend `BillingIntegrity.test.tsx` and `PharmacyBilling.prescription-load.test.tsx` suites pass 20 tests in total. The frontend tests drive the actual components through uncertain responses and remounts. They verify that payment collection uses completed receipts to collect the remaining 20, and that retry remains available when the refreshed list already shows COMPLETED.

A live Chromium probe passed against the actual invoice builder with a synthetic API adapter. It lost the first checkout response, reloaded, clicked the recovery control, and observed two requests with exactly the same request key and payload. This is UI recovery evidence, not a full browser-to-database integration claim. Obscura was attempted first but timed out during reload recovery. The temporary probe route was removed.

Before the lifecycle/review follow-up, the backend production SWC build compiled 238 files. The frontend production build passed after building the local `shared-types` prerequisite, including its configured type check. The unrestricted backend TypeScript graph still reports existing unrelated errors such as missing app module imports and stale feature DTO references; it is not a clean typecheck claim.

## Lifecycle and review follow-up

Billing now requires an ACTIVE prescription whose explicit `validUntil` has not elapsed and whose visit is not deleted. A null `validUntil` remains unbounded. The guard runs on creation, relinking or changing linked patient/doctor details, and again immediately before the first stock posting. It locks the prescription before the visit, matching lifecycle command ordering. A cancellation that acquires the prescription lock first prevents posting; a posting that acquires it first commits before cancellation. Both orders use the actual prescription cancellation service in real PostgreSQL tests.

Checkout and status commands now use Serializable transactions and retry serialization/deadlock conflicts up to five attempts. Every retry reruns eligibility and allocation. Concurrent checkout retries also handle a request-key uniqueness collision from an earlier serializable snapshot. Four deterministic probes commit an actual inventory status or expiry edit after allocation and before posting, covering both checkout and saved-draft confirmation. Before the fix all four posted invalid stock; afterward all four reject with no sale and unchanged quantity. Six prescription probes previously accepted cancelled/expired/deleted-visit prescriptions; all now reject without invoice or stock side effects. Linked-patient ownership is also rechecked.

Starting a new invoice clears the confirmed attempt, all patient/doctor/prescription and billing fields, items, print state, search state, and billing URL parameters. It suppresses the previous parent prefill and invalidates pending loads. The regression completes prescription checkout and then bills a different patient without stale prescription, doctor, notes, or address data. Four additional tests resolve late prescription, visit, patient, and initial-data responses after reset. These five new regressions fail against the previous builder and pass with the fix. Existing prescription-loading tests now assert one atomic checkout request; they retain their queue-refresh, substitution, and failure behavior assertions.

The follow-up depends on the parent's prescription/visit lifecycle schema and adds no migration. Its final checks are 26 real-database scenarios, 5 invoice service tests, 20 frontend tests, and affected contract format/discoverability checks. Broad production builds were not repeated for this follow-up; the earlier build evidence above applies to the original billing patch. The parent owns the combined integration build and migration rehearsal.

## Command design

Invoice state is the boundary for edits, deletion, status transitions, and payments. Each command locks the branch-scoped invoice row before reading mutable state. Stock writes follow invoice locks and sort inventory IDs to keep a consistent order. `mutationVersion` remains the existing version field and advances on invoice writes; it no longer acts as a count of stock postings. The posted status transition determines whether stock must be deducted.

A compare-and-swap fence on every writer was considered. A transaction row lock was chosen because payment totals must be read after competing writers finish, and because edits replace child rows. This keeps the rule in the existing service and avoids separate orchestration layers.

Checkout creates and posts one invoice in one transaction. Its branch-scoped request key and SHA-256 payload hash identify the logical attempt. A transaction advisory lock serializes simultaneous attempts before an invoice exists. A matching retry returns the stored invoice; a changed payload conflicts. Payments use an invoice-scoped key and hash, serialize under the invoice lock, and update authoritative receipt totals in the same transaction as insertion.

The browser saves the exact attempt before sending it and retains it through uncertain failures and reloads. An unresolved checkout has a recovery action. Confirmed checkout attempts can be reopened or explicitly cleared to start a new invoice. Payments retain their key until a definite result arrives.

The Poteto principles changed concrete choices. Model the Domain kept the commands inside `PharmacyInvoiceService`. Make Operations Idempotent introduced durable receipt keys and hashes. Fix Root Causes moved the stale reads inside the transaction. Test Behavior, Not Implementation produced real-database race tests. Build the Lever kept those tests as a rerunnable script. Prove It Works required both database outcomes and live UI recovery.

## Migrations and integration

`20261005120000_billing_command_integrity` adds nullable invoice and payment request fields with unique indexes. Existing rows remain valid. `20261005123000_pharmacy_balance_reconciliation` rebuilds cached paid amount, balance, and payment status from COMPLETED receipts under invoice-then-payment table locks. It preserves payment rows, timestamps, and mutationVersion. Preserving mutationVersion prevents the old confirmation implementation from treating cache repair as an earlier stock posting during deployment. Overpaid invoices stop the migration with an explicit error before any caches are changed. The rehearsal verifies repair, an unchanged second run, and overpayment rollback.

`cc-check format` and `cc-check list` validate the affected TypeScript contracts. The reconciliation CONTRACTS file passes format validation; list does not support CONTRACTS or SQL as a source type, so its directory obligations were manually checked against the SQL and real-database tests. Applicable stock identity and unit contracts remain unchanged. Receipt records and direct posted-cancellation rules need parent review with the returns lane.

The invoice builder still dispatches `pharmacy-dashboard-refresh` and `pharmacy-invoices-refresh`. The parent should ensure the prescription queue consumes the integrated checkout result or those refresh events. This lane does not edit queue services. The patient deduplication service also rewrites invoice patient references through `updateMany`; it does not edit financial or stock state and was outside this lane.

The parent owns independent review, combined migration rehearsal, full integration, and deployment. Nested delegation and PR creation were skipped because the assigned scope prohibited them. The optional independent comment review was therefore not run in this lane. The deslop skill was unavailable; cleanup used direct diff, contract, build, and behavior checks.
