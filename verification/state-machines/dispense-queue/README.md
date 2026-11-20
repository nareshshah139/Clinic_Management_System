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

All paths are under `backend/src/modules/pharmacy/` unless named otherwise. Line numbers are at base commit `6416677`. These files have not changed since.

| Model | Code |
| --- | --- |
| `YouOpenPrescription`, task absent | `pull` (`pharmacy-prescription-queue.service.ts:330`) to `ensureTaskForEntry` create (`:593-618`), status from `taskStatusFromQueue` (`:877`), no timestamp |
| `YouOpenPrescription`, task present | `ensureTaskForEntry` sync (`:653-667`): `syncedTaskStatus`, then `nextStatusAfterLineReview` when the result is Ready to bill |
| `YouReviewLine` | `updateTaskLine` / `saveTaskLine` (`:468-548`): line update (`:514`), then `nextStatusAfterLineReview` on the stored status (`:532-541`) |
| `YouRequestStatus`, `ServerSavesStatus` | `updateTaskStatus` / `saveTaskStatus` (`:394-466`). The check is `:432-443`, the write `:446-459` |
| `Requestable` | the counter's Pause and Mark paid (`frontend/src/components/pharmacy/PharmacyCounterCockpit.tsx:1166`), Ready to bill (`:1155`), In Review on select (`:506`), and CANCELLED, which only an API caller sends |
| DISPENSED never requested | `updateTaskStatus` refuses DISPENSED (`:400`) |
| `Allowed`, Ready to bill | every current line reviewed and none unavailable (`:432-443`) |
| `DeskPostsBill` | `checkout` (`pharmacy-invoice.service.ts:142`) to `transitionInvoice` CONFIRMED (`:1358`). Billing never reads the dispense task |
| `Derived` | `toQueueEntry` (`pharmacy-prescription-queue.service.ts:1140-1160`) and the SQL `derived` CTE (`pharmacy-prescription-queue-query.ts:204`) |
| `Synced` | `syncedTaskStatus` (`pharmacy-prescription-queue.service.ts:890-929`) and the SQL `synced` CTE (`pharmacy-prescription-queue-query.ts:211`) |
| `LineReview` | `nextStatusAfterLineReview` (`pharmacy-prescription-queue.service.ts:997`) |
| `Shown`, `QueueShown` | `mergeTask` (`:732-778`) with `queueStatusFromTask` (`:936`) |
| `Stamp` | `statusTimestampPatch` (`:975`), applied only when the status value changes (`:457`, `:539`, `:667`) |
| `Free`, `Locked` | `lockDispenseTask` (`:561-566`) locks the prescription row, then the task row. `requireEligiblePrescription` (`pharmacy-invoice.service.ts:1496-1509`) locks the same prescription row for billing |

## Rules

| Rule | Kind | Code | Fixed guard |
| --- | --- | --- | --- |
| `TypeOK` | invariant | holds | |
| `PaidNeedsBill` | invariant | breaks | `saveTaskStatus` refuses PAID unless a posted bill exists |
| `FinishedStaysFinished` | invariant | breaks | `saveTaskStatus` refuses any change when the synced status is PAID, DISPENSED or CANCELLED |
| `DispensedStaysDispensed` | invariant | breaks | the same guard |
| `ReadyMeansReviewed` | invariant | holds | the task lock before the check, already in the code |
| `StatusHasTimestamp` | invariant | breaks | `ensureTaskForEntry` create stamps its initial status |
| `BillShowsDone` | property | breaks | `syncedTaskStatus` and the SQL `synced` CTE let a covering posted bill outrank CANCELLED |

What breaks today, and how the replays show it:

- **PaidNeedsBill.** Mark paid saves PAID on a task with no bill. Nothing later reconciles it, because `syncedTaskStatus` keeps PAID as it is.
- **FinishedStaysFinished.** `saveTaskStatus` has no from-state check. A cancelled or paid task goes back to In Review, Paused or Ready to bill. The counter's More menu offers Pause on Paid, Dispensed and Cancelled tasks (`PharmacyCounterCockpit.tsx:850-856`), because it filters only the current status and the primary next step.
- **DispensedStaysDispensed.** A dispensed prescription shows Paid after Mark paid and Cancelled after a cancel, because `syncedTaskStatus` keeps PAID and CANCELLED ahead of a posted bill.
- **StatusHasTimestamp.** When the bill posts before anyone opens the prescription, the first pull creates the task as DISPENSED with `dispensedAt` null. `statusTimestampPatch` runs only on updates.
- **BillShowsDone.** A cancelled task keeps a billed prescription in the Paused filter forever, in both the TypeScript detail read and the SQL list. Line edits do not move it, because `nextStatusAfterLineReview` keeps CANCELLED.

`ReadyMeansReviewed` holds today. The `checkBeforeLock` control shows why. If `saveTaskStatus` checked the lines before `lockDispenseTask`, a line reset could commit between the check and the write, and the task would save as Ready to bill with a pending medicine.

## Negative controls

Each is `fixed` with one guard removed.

| Mode | Mistake it reproduces | Breaks |
| --- | --- | --- |
| `typeProbe` | the bill takes a value outside its type | `TypeOK` |
| `paidWithoutBill` | Mark paid saved with no bill check, as today | `PaidNeedsBill` |
| `reopenFinished` | `saveTaskStatus` with no from-state check, as today | `FinishedStaysFinished`, `DispensedStaysDispensed` |
| `createUnstamped` | the task create writes a status without its timestamp, as today | `StatusHasTimestamp` |
| `checkBeforeLock` | the Ready to bill check reads lines before the task lock | `ReadyMeansReviewed` |
| `cancelSticky` | `syncedTaskStatus` keeps CANCELLED over a posted bill, as today | `BillShowsDone` |

In `fixed`, Mark paid is never reachable. A posted bill that covers the prescription makes it Dispensed, and the finished guard then refuses Mark paid. In the code, Paid may still matter for a bill that covers part of a prescription, which the model leaves out.

## Fairness

| Clause | Real-world reason |
| --- | --- |
| `WF_vars(ServerSavesStatus)` | an assumption, not a guarantee: the server finishes a status request it has started and commits |

No person's action has fairness. A pharmacist may close the tab, and a prescription may never be opened or billed. `BillShowsDone` therefore asks whether the queue shows Done once the bill posts with nobody acting. The queue is computed on every read, so in `fixed` it shows Done at once. In `code` it can stay in Paused forever.

## Replays

`backend/src/modules/pharmacy/tests/dispense-queue.formal-replay.database.spec.ts` drives the real `PharmacyPrescriptionQueueService` and `PharmacyInvoiceService` on a private PostgreSQL schema, one call per model step in `results/code.md`. Run it with

```sh
cd backend && FORMAL_REPLAY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/clinic_stack npx jest --ci --runInBand src/modules/pharmacy/tests/dispense-queue.formal-replay.database.spec.ts
```

Each rule has a `.failing` test that asserts the correct outcome and a `today:` test that asserts what the code does now. Each `.failing` assertion also holds when the whole `fixed` protocol lands, so it does not depend on which fix comes first.

## What the model leaves out

- **Partial bills.** The one bill covers the line, so the derived status is Waiting or Done. Partial coverage, the DISPENSED to PARTIALLY_FILLED fallback and QUEUED to PARTIALLY_FILLED in `syncedTaskStatus` are not modeled.
- **Cancelled bills.** A prescription whose only bill is CANCELLED is listed under Partial. `pharmacy-prescription-queue.service.spec.ts` asserts this on purpose, so it is not a rule here. The counter discards drafts with `DELETE`, which removes the bill.
- **The 24 hour clock and prescription eligibility.** Age expiry, inactive or expired prescriptions, the QUEUED to PAUSED sync and the view-only Paused overlay in `mergeTask` are out. The prescription stays ACTIVE throughout.
- **Line edits that drop a pause.** `saveTaskLine` recomputes the status from the lines, so editing a medicine on a paused task resumes it. Reviewing a medicine is a resume, so this is not a rule. `pausedAt` is kept, which the code comment at `:380-383` asks for.
- **Timestamps of earlier stages.** Old timestamps are never cleared. The comment at `:380-383` requires that, so only a missing timestamp for the current status is a rule.
- **Two lines, substitutes and edited quantities.** SUBSTITUTE and EDITED count as ACCEPTED in every status computation. Their companion fields are not validated, which is outside a status model.
- **Exception counts.** `persistStockCheck` and `saveTaskLine` count exceptions differently. That is a stored number, not a state.
- **Sales returns.** A return does not change the invoice status that the queue reads.
- **API-only QUEUED and PARTIALLY_FILLED requests.** The server accepts them. They add no path the other requests do not already show.
