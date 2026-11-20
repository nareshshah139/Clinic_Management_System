# Dispense queue

One prescription at the pharmacy counter. It has a dispense task with one medicine line, and it may get one pharmacy bill. The model covers the task status a pharmacist sets, the status the system recomputes from line reviews and bills, and the status the queue shows.

## The two statuses

The task status is stored in `PharmacyDispenseTask.status`. The queue never shows it as stored. Every read passes it through `syncedTaskStatus` together with the status derived from posted bills (`toQueueEntry`), and `mergeTask` recomputes Ready to bill from the line review. The spec holds the stored columns as variables and computes the shown values from them.

| Spec | Code field or function | Meaning |
| --- | --- | --- |
| `task` | `PharmacyDispenseTask.status`, `NONE` before the first pull | stored task status |
| `line` | `PharmacyDispenseTaskLine.action` | the one medicine's review |
| `bill` | `PharmacyInvoice.status` in CONFIRMED, DISPENSED or COMPLETED, covering the line | `posted` or `none` |
| `stamped` | `startedAt`, `pausedAt`, `readyToBillAt`, `paidAt`, `dispensedAt`, `cancelledAt` | which timestamps are set |
| `pending` | a status request that holds the task lock and has not saved yet | `none` when idle |
| `Shown` | `mergeTask(...).dispenseStatus` | the status the counter shows |
| `QueueShown` | `mergeTask(...).status`, and the SQL `queue_statuses` CTE | the queue filter: Waiting, Partial, Paused, Done |
| `seen` | none, a history variable | whether the counter has shown a finished status, and Dispensed |
| `screen` | none | `Shown` and `QueueShown` copied into the state for the chart labels |

## Model to code

All paths are under `backend/src/modules/pharmacy/` unless named otherwise. Line numbers are at the fix commit on `fix/dispense`. The `pharmacy-invoice.service.ts` lines are unchanged since base commit `6416677`.

| Model | Code |
| --- | --- |
| `YouOpenPrescription`, task absent | `pull` (`pharmacy-prescription-queue.service.ts:338`) to `ensureTaskForEntry` create (`:611-643`), status from `taskStatusFromQueue` (`:900`), stamped by `statusTimestampPatch` (`:622`) |
| `YouOpenPrescription`, task present | `ensureTaskForEntry` sync (`:670-685`): `syncedTaskStatus`, then `nextStatusAfterLineReview` when the result is Ready to bill |
| `YouReviewLine` | `updateTaskLine` / `saveTaskLine` (`:484-564`): line update (`:530`), then `nextStatusAfterLineReview` on the stored status (`:548-556`) |
| `YouRequestStatus`, `ServerSavesStatus` | `updateTaskStatus` / `saveTaskStatus` (`:402-482`). The checks are `statusRefusal` (`:439-445`) and the Ready to bill line check (`:447-458`). The write is `:462-475` |
| `Allowed`, `RepeatFinished` | `statusRefusal` (`:1025-1033`) |
| `Requestable` | the counter's Pause and Mark paid (`frontend/src/components/pharmacy/PharmacyCounterCockpit.tsx:1169` and `:1170`), Ready to bill (`:1155`), In Review on select (`:507`), and CANCELLED, which only an API caller sends. The More menu offers only what `allowedStatuses` lists (`:852-858`) |
| DISPENSED never requested | `updateTaskStatus` refuses DISPENSED (`:408`) |
| `Allowed`, Ready to bill | every current line reviewed and none unavailable (`:447-458`) |
| `DeskPostsBill` | `checkout` (`pharmacy-invoice.service.ts:142`) to `transitionInvoice` CONFIRMED (`:1358`). Billing never reads the dispense task |
| `Derived`, `bill` | `toQueueEntry` (`pharmacy-prescription-queue.service.ts:1152-1216`), with `billPosted` (`:1214`), and the SQL `derived` CTE (`pharmacy-prescription-queue-query.ts:204`) |
| `Synced` | `syncedTaskStatus` (`pharmacy-prescription-queue.service.ts:913-951`) and the SQL `synced` CTE (`pharmacy-prescription-queue-query.ts:211`) |
| `LineReview` | `nextStatusAfterLineReview` (`pharmacy-prescription-queue.service.ts:1040`) |
| `Shown`, `QueueShown` | `mergeTask` (`:751-801`) with `queueStatusFromTask` (`:958`) |
| `Stamp` | `statusTimestampPatch` (`:997`), applied when the status value changes (`:473`, `:555`, `:684`) and on create (`:622`) |
| `Free`, `Locked` | `lockDispenseTask` (`:577-582`) locks the prescription row, then the task row. `requireEligiblePrescription` (`pharmacy-invoice.service.ts:1496-1509`) locks the same prescription row for billing |

## Rules

| Rule | Kind | Before | Code | Fixed guard |
| --- | --- | --- | --- | --- |
| `TypeOK` | invariant | holds | holds | |
| `PaidNeedsBill` | invariant | breaks | holds | `saveTaskStatus` refuses PAID unless a posted bill exists |
| `FinishedStaysFinished` | invariant | breaks | holds | `saveTaskStatus` refuses any change when the synced status is PAID, DISPENSED or CANCELLED |
| `DispensedStaysDispensed` | invariant | breaks | holds | the same guard |
| `ReadyMeansReviewed` | invariant | holds | holds | the task lock before the check, already in the code |
| `StatusHasTimestamp` | invariant | breaks | holds | `ensureTaskForEntry` create stamps its initial status |
| `BillShowsDone` | property | breaks | holds | `syncedTaskStatus` and the SQL `synced` CTE let a covering posted bill outrank CANCELLED |

What broke before the fix, in the `before` mode:

- **PaidNeedsBill.** Mark paid saved PAID on a task with no bill. Nothing later reconciled it, because `syncedTaskStatus` keeps PAID as it is.
- **FinishedStaysFinished.** `saveTaskStatus` had no from-state check. A cancelled or paid task went back to In Review, Paused or Ready to bill. The counter's More menu offered Pause on Paid, Dispensed and Cancelled tasks, because it filtered only the current status and the primary next step.
- **DispensedStaysDispensed.** A dispensed prescription showed Paid after Mark paid and Cancelled after a cancel, because `syncedTaskStatus` kept PAID and CANCELLED ahead of a posted bill.
- **StatusHasTimestamp.** When the bill posted before anyone opened the prescription, the first pull created the task as DISPENSED with `dispensedAt` null. `statusTimestampPatch` ran only on updates.
- **BillShowsDone.** A cancelled task kept a billed prescription in the Paused filter forever, in both the TypeScript detail read and the SQL list. Line edits did not move it, because `nextStatusAfterLineReview` keeps CANCELLED.

`ReadyMeansReviewed` held before and holds now. The `checkBeforeLock` control shows why. If `saveTaskStatus` checked the lines before `lockDispenseTask`, a line reset could commit between the check and the write, and the task would save as Ready to bill with a pending medicine.

## The fix

`code` is the `fixed` protocol plus one allowance, `RepeatFinished`. A request that repeats the finished status a task already has is a no-op, not an error. The `task-status-timestamp-transition` contract says a repeated status keeps its timestamp, and a client that retries a cancel after a timeout should not see a refusal. The repeat writes the same status, so no rule sees a change.

- **Finished tasks refuse status changes.** `statusRefusal` (`pharmacy-prescription-queue.service.ts:1025-1033`) refuses any status other than the current one when the synced status is PAID, DISPENSED or CANCELLED. `saveTaskStatus` calls it under the task lock (`:439-445`) with `syncedTaskStatus`, so a stored CANCELLED that a posted bill now outranks counts as DISPENSED. The message is "This prescription is already cancelled. Its status can no longer change."
- **Mark paid needs a posted bill.** The same function refuses PAID unless `billPosted` (`:1214`) is true. `billPosted` counts only CONFIRMED, DISPENSED and COMPLETED invoices, so a prescription listed as Partial because its only bill was cancelled still refuses Mark paid. The message is "Post the pharmacy bill before marking this prescription paid."
- **A covering bill outranks CANCELLED.** `syncedTaskStatus` (`:917-927`) and the SQL `synced` CTE (`pharmacy-prescription-queue-query.ts:213-215`) check PAID first, then a dispensed derived status, then CANCELLED. PAID keeps its old place, as in `fixed`.
- **The create stamps its status.** `ensureTaskForEntry` writes `statusTimestampPatch` of the initial status (`:622`). DISPENSED gets `dispensedAt` and PAUSED gets `pausedAt`.
- **The counter offers only allowed moves.** `allowedStatuses` (`:1035-1038`) lists every status `statusRefusal` accepts, except DISPENSED. `mergeTask` puts it on every queue entry (`:754`, `:769`), and the counter's More menu shows Pause and Mark paid only when the list holds them (`PharmacyCounterCockpit.tsx:855`). The rule lives in one place. The frontend keeps no copy.

## Negative controls

`before` is the code before the fix, kept unchanged as a regression control. Each other control is `fixed` with one guard removed.

| Mode | Mistake it reproduces | Breaks |
| --- | --- | --- |
| `before` | the code before the fix | `PaidNeedsBill`, `FinishedStaysFinished`, `DispensedStaysDispensed`, `StatusHasTimestamp`, `BillShowsDone` |
| `typeProbe` | the bill takes a value outside its type | `TypeOK` |
| `paidWithoutBill` | Mark paid saved with no bill check, as before | `PaidNeedsBill` |
| `reopenFinished` | `saveTaskStatus` with no from-state check, as before | `FinishedStaysFinished`, `DispensedStaysDispensed` |
| `createUnstamped` | the task create writes a status without its timestamp, as before | `StatusHasTimestamp` |
| `checkBeforeLock` | the Ready to bill check reads lines before the task lock | `ReadyMeansReviewed` |
| `cancelSticky` | `syncedTaskStatus` keeps CANCELLED over a posted bill, as before | `BillShowsDone` |

In `fixed` and `code`, Mark paid is never reachable. A posted bill that covers the prescription makes it Dispensed, and the finished guard then refuses Mark paid. In the code, Paid may still matter for a bill that covers part of a prescription, which the model leaves out.

## Fairness

| Clause | Real-world reason |
| --- | --- |
| `WF_vars(ServerSavesStatus)` | an assumption, not a guarantee: the server finishes a status request it has started and commits |

No person's action has fairness. A pharmacist may close the tab, and a prescription may never be opened or billed. `BillShowsDone` therefore asks whether the queue shows Done once the bill posts with nobody acting. The queue is computed on every read, so in `fixed` it shows Done at once. In `before` it could stay in Paused forever.

## Replays

`backend/src/modules/pharmacy/tests/dispense-queue.formal-replay.database.spec.ts` drives the real `PharmacyPrescriptionQueueService` and `PharmacyInvoiceService` on a private PostgreSQL schema, one call per model step in `results/before.md`. Run it with

```sh
cd backend && FORMAL_REPLAY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/clinic_stack npx jest --ci --runInBand src/modules/pharmacy/tests/dispense-queue.formal-replay.database.spec.ts
```

Every rule that broke before the fix now has a plain test that asserts the correct outcome, and the `today:` tests that asserted the bugs are gone. Refusals are asserted by their message. Three tests go past the `before` paths: `BillShowsDone` with a cancel before the bill posts, which only the sync change fixes, `DispensedStaysDispensed` with Mark paid and Pause on a dispensed task, which only the finished guard fixes, and the queue entry's `allowedStatuses` in each refusal test. `pharmacy-prescription-queue.service.spec.ts` checks that Mark paid is offered for a posted partial bill and not for a cancelled one.

## What the model leaves out

- **Partial bills.** The one bill covers the line, so the derived status is Waiting or Done. Partial coverage, the DISPENSED to PARTIALLY_FILLED fallback and QUEUED to PARTIALLY_FILLED in `syncedTaskStatus` are not modeled.
- **Cancelled bills.** A prescription whose only bill is CANCELLED is listed under Partial. `pharmacy-prescription-queue.service.spec.ts` asserts this on purpose, so it is not a rule here. The counter discards drafts with `DELETE`, which removes the bill.
- **The 24 hour clock and prescription eligibility.** Age expiry, inactive or expired prescriptions, the QUEUED to PAUSED sync and the view-only Paused overlay in `mergeTask` are out. The prescription stays ACTIVE throughout.
- **Line edits that drop a pause.** `saveTaskLine` recomputes the status from the lines, so editing a medicine on a paused task resumes it. Reviewing a medicine is a resume, so this is not a rule. `pausedAt` is kept, which the `task-status-timestamp-transition` contract at `:387-390` asks for.
- **Timestamps of earlier stages.** Old timestamps are never cleared. That contract requires it, so only a missing timestamp for the current status is a rule.
- **Two lines, substitutes and edited quantities.** SUBSTITUTE and EDITED count as ACCEPTED in every status computation. Their companion fields are not validated, which is outside a status model.
- **Exception counts.** `persistStockCheck` and `saveTaskLine` count exceptions differently. That is a stored number, not a state.
- **Sales returns.** A return does not change the invoice status that the queue reads.
- **API-only QUEUED and PARTIALLY_FILLED requests.** The server accepts them. They add no path the other requests do not already show.
