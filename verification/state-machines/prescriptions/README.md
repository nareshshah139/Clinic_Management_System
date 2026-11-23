# Prescriptions, refills and template review

`Prescriptions.tla` checks two machines from `backend/src/modules/prescriptions/prescriptions.service.ts`. It was first checked at commit `6416677`. `code` mode is the code now. `before` mode is the code as it was then, kept as a regression control, and `results/before.md` keeps TLC's paths to its breaks.

- **rx.** One prescription, its refill requests and the pharmacy bills posted against it. Two requests run at once. Each one is a refill request, a refill approval or rejection, a cancel, a PATCH to `COMPLETED`, or a pharmacy checkout.
- **tpl.** One submitted prescription template version and two reviewers who approve or reject it at the same time.

The two machines share no row. `Init` picks one of them per behaviour, and each machine's actions run only in its own scenario. Every rule reads one machine's variables, so checking them apart gives the same verdicts as running both together, with far fewer states.

## Domain

| Machine | Code field | Model |
| --- | --- | --- |
| Prescription | `Prescription.status`. Only `ACTIVE` (insert default), `COMPLETED` (PATCH) and `CANCELLED` (DELETE) are ever written. `DRAFT` and `EXPIRED` are never written. | `rxStatus` in `ACTIVE`, `COMPLETED`, `CANCELLED` |
| Validity | `Prescription.validUntil` compared with `new Date()` by every reader | `expired`, set once by `ValidUntilPasses` |
| Refill | `PrescriptionRefill.status`. `PENDING` (insert default), `APPROVED`, `REJECTED`. `NONE` and `COMPLETED` are never written. | `refill[f]`, with `ABSENT` for a row not yet created |
| Bills | Confirmed `PharmacyInvoice` rows whose `prescriptionId` is this prescription | `bills`, one per posted checkout |
| Template version | `PrescriptionTemplateVersion.status`, starting at `PENDING` after submit | `version` |
| Review record | `TemplateVersionApproval` rows for the version | `audit`, a sequence of decisions |

History variables hold what the rules need to remember: `everCompleted`, `everCancelled`, `approvedWhileClosed` and `firstDecision`.

## Rules and verdicts

| Rule | Kind | Before | Code | Sentence |
| --- | --- | --- | --- | --- |
| `TypeOK` | invariant | holds | holds | Every variable stays inside its type. |
| `AtMostOnePendingRefill` | invariant | holds | holds | A prescription has at most one refill request waiting for the doctor. |
| `RefillsWithinAllowance` | invariant | holds | holds | Approved refills never exceed the prescription's refill allowance. |
| `NoApprovalOnClosedPrescription` | invariant | holds | holds | A refill is approved only while the prescription is active and in date. |
| `BillsWithinAllowance` | invariant | **breaks** | **breaks** | Pharmacy bills on a prescription never exceed the first fill plus its approved refills. |
| `CompletedStaysCompleted` | invariant | **breaks** | holds | A completed prescription stays completed. |
| `CancelledStaysCancelled` | invariant | holds | holds | A cancelled prescription stays cancelled. |
| `StrandedRequestsClose` | property | **breaks** | holds | A refill request on a completed or cancelled prescription does not stay waiting forever. |
| `OneDecision` | invariant | **breaks** | holds | A template version gets at most one review decision on record. |
| `DecidedStaysDecided` | invariant | **breaks** | holds | Once a template version is approved or rejected, its status does not change. |
| `DecisionRecorded` | invariant | **breaks** | holds | An approved or rejected template version has a review record that says so. |

The refill machine itself is correctly guarded. Every refill writer locks the prescription row and re-reads it, and the three refill rules hold. The census lead that an approved refill "uses quota forever" is not a bug on its own. An approved refill is an authorization, and counting it against `maxRefills` is right. The real gap is that nothing downstream reads the authorization. Pharmacy billing checks only `status` and `validUntil`, so a second full course can be billed against a prescription with no refills, or one whose refill the doctor rejected. `BillsWithinAllowance` states that domain rule. The code never states it. It is the clinic's call whether refills should gate dispensing.

`CompletedStaysCompleted` rests on the code's own reading of `COMPLETED`. `updatePrescription` refuses any edit to a completed prescription (`prescriptions.service.ts:471`). Before the fix `cancelPrescription` skipped only an already cancelled row.

No screen calls the refill endpoints, `DELETE /prescriptions/:id` or the template version endpoints. `frontend/src/lib/api.ts` wraps the version endpoints, but no component calls them. Every break was reachable through the API only.

## Model to code

| Model | Code |
| --- | --- |
| `Send` with `lock` | `lockPrescription`, `prescriptions.service.ts:437`. `SELECT ... FOR UPDATE OF r` at `:443`, then a re-read with refills. Pharmacy billing takes the same row lock in `requireEligiblePrescription`, `pharmacy-invoice.service.ts:1509`. |
| `Eligible` | `requireRefillEligibility`, `prescriptions.service.ts:450`. Status `ACTIVE`, `validUntil` not past, used (`APPROVED` or `COMPLETED`) below `maxRefills` at `:453`. |
| `DeskRequestsRefill` | `requestRefill`, `:548`. Eligibility, then no other `PENDING` at `:552`, then an insert. |
| `DoctorApprovesRefill` | `approveRefill`, `:561`. `PENDING` check at `:567`, eligibility re-checked under the lock, update by id. |
| `DoctorRejectsRefill` | `rejectRefill`, `:577`. `PENDING` check, update by id. |
| `DoctorCancels` | `cancelPrescription`, `:518`. Returns unchanged when already `CANCELLED`. Refuses anything but `DRAFT` or `ACTIVE` at `:522`, and a prescription with a posted pharmacy bill at `:525`. Otherwise `updateMany` of `PENDING` refills to `REJECTED`, then `CANCELLED`. |
| `DoctorMarksCompleted` | `updatePrescription` with `status: COMPLETED`, `:468`. Refuses unless `DRAFT` or `ACTIVE` at `:471`. Rejects `PENDING` refills in the same transaction at `:492`. |
| `PharmacistPostsBill` | `checkout`, `pharmacy-invoice.service.ts:142`, posting `CONFIRMED` through `transitionInvoice`. Stock-deducting transitions call `requireEligiblePrescription` at `:1403`, which checks `ACTIVE` at `:1530` and `validUntil` at `:1532`. It never reads refills or earlier bills. |
| `ServerCommits` | The rest of each transaction after the lock: the checks on what was read, then the writes. |
| `ValidUntilPasses` | Time passing `validUntil`. No job writes `EXPIRED`. Readers compare dates. |
| `ReviewerApproves`, `ReviewerRejects` | `approveTemplateVersion`, `:1205`, and `rejectTemplateVersion`, `:1209`, both through `decideTemplateVersion`, `:1219`. `findFirst` inside a transaction. |
| `ServerSavesDecision` | `prescriptionTemplateVersion.updateMany` where the status is still `PENDING`, `:1232`. Zero rows is a 409 at `:1236`. In `before`, an `update` by id alone. |
| `ServerSavesReviewRecord` | `templateVersionApproval.create`, `:1239`, in the same transaction. In `before`, a second statement outside any transaction. |
| `ReviewRecordFails` | In `before`, that insert throws after the status update has committed. In `code` the transaction rolls back the decision with it. |

## Modes

`fixed` is the design the fix started from, the smallest change that makes every rule hold:

- Pharmacy billing refuses a bill once the prescription's bills reach one plus its approved refills.
- `cancelPrescription` cancels only an `ACTIVE` prescription.
- `updatePrescription` to `COMPLETED` rejects `PENDING` refills in the same transaction, as cancel already does.
- Template approve and reject update `where { id, status: 'PENDING' }`, return 409 on zero rows, and insert the review record in the same transaction.

Each negative control is `fixed` with one guard removed. Each must break the rule its guard protects.

| Mode | Real mistake | Breaks |
| --- | --- | --- |
| `noRowLock` | The refill commands read and write without `lockPrescription`. | `AtMostOnePendingRefill`, `RefillsWithinAllowance` |
| `noApproveRecheck` | `approveRefill` checks only that the request is `PENDING`, not `requireRefillEligibility`. | `NoApprovalOnClosedPrescription` |
| `billIgnoresRefills` | Billing checks status and validity only, as the code still does. | `BillsWithinAllowance` |
| `cancelAnyStatus` | Cancel skips only an already cancelled row, as the code did before the fix. | `CompletedStaysCompleted` |
| `patchIgnoresStatus` | `updatePrescription` drops its `DRAFT` or `ACTIVE` check. | `CancelledStaysCancelled` |
| `noStatusPredicate` | Template decisions update by id alone, with the record in the same transaction. | `OneDecision`, `DecidedStaysDecided` |
| `auditOutsideTransaction` | Template decisions use the status predicate but insert the record in a separate statement. | `DecisionRecorded` |
| `typeProbe` | A row stores `EXPIRED`, the value the code never writes. | `TypeOK` |

## Fairness

`Spec == Init /\ [][Next]_vars /\ Fairness`. Every fairness clause is about the server.

| Clause | Real-world reason |
| --- | --- |
| `WF_vars(ServerCommits(r))` | A prescription transaction that has started eventually commits or rolls back. This is an assumption about the database and the server. |
| `WF_vars(ServerSavesDecision(v))` | A review request that has read the version eventually runs its update. Same assumption. |
| `WF_vars(ServerSavesReviewRecord(v))` | The review record insert eventually runs. Same assumption. `ReviewRecordFails` has no fairness. |

No user action has fairness, so a doctor may never come back to a request. `ValidUntilPasses` has no fairness because no rule depends on time passing. `StrandedRequestsClose` broke in `before` because no server step, job or timer closed a `PENDING` request once the prescription was completed. `approveRefill` refused it, because the prescription was no longer `ACTIVE`, and nothing else touched it. In `code` and `fixed` the completion closes it in the same transaction.

## The fix

`code` is `fixed` without the billing allowance check.

| Guard | Code | Rule |
| --- | --- | --- |
| `cancelPrescription` cancels only a `DRAFT` or `ACTIVE` prescription. | `backend/src/modules/prescriptions/prescriptions.service.ts:522` | `CompletedStaysCompleted` |
| `cancelPrescription` refuses a prescription with a posted pharmacy bill. `patient-journey` needs this one. | `backend/src/modules/prescriptions/prescriptions.service.ts:525` | `BilledPrescriptionStaysActive` in `patient-journey` |
| `updatePrescription` to `COMPLETED` rejects waiting refill requests in the same transaction. | `backend/src/modules/prescriptions/prescriptions.service.ts:492` | `StrandedRequestsClose` |
| A template decision compare-and-sets the status on `PENDING` and returns 409 when another review won. | `backend/src/modules/prescriptions/prescriptions.service.ts:1232` and `:1236` | `OneDecision`, `DecidedStaysDecided` |
| The review record is inserted in the same transaction as the decision. | `backend/src/modules/prescriptions/prescriptions.service.ts:1227` and `:1239` | `DecisionRecorded` |

`BillsWithinAllowance` still breaks in `code`, on purpose. Enforcing it would make pharmacy billing refuse any bill beyond the first fill plus approved refills. No screen can request or approve a refill today, so every repeat sale against a prescription would be refused. Whether refills gate dispensing is the clinic's decision, and it is deferred until the refill screens exist. Its `.failing` replay and its `today:` replay stay as they are.

## Replays

`backend/src/modules/prescriptions/tests/prescriptions.formal-replay.database.spec.ts` drives the real `PrescriptionsService` and `PharmacyInvoiceService` against a private PostgreSQL schema. Each `before` break has a test asserting the right outcome. `BillsWithinAllowance`, which still breaks in `code`, keeps an `it.failing` test and a `today:` test asserting what the code does now. The others pass on the fixed code.

- **`BillsWithinAllowance`.** Two full `checkout` calls on a prescription with `maxRefills: 0`. Today the second posts and stock falls from 20 to 0.
- **`CompletedStaysCompleted`.** `updatePrescription` to `COMPLETED`, then `cancelPrescription`. Before the fix the status ended `CANCELLED`. Now the cancel is refused.
- **`StrandedRequestsClose`.** `requestRefill`, then `updatePrescription` to `COMPLETED`. Before the fix the refill stayed `PENDING`. Now it is `REJECTED`. The module schedules nothing, so there is no timer to run before the assertion.
- **`OneDecision`.** `gate()` pauses one approval before its `updateMany`, after it read the version as `PENDING`. A second approval runs to completion, then the first resumes and is refused. Before the fix both succeeded and there were two `APPROVED` records.
- **`DecidedStaysDecided`.** A rejection paused before its `updateMany`. An approval runs to completion. Releasing the rejection is refused. Before the fix the replay paused the approval between its update and its record, and the rejection overwrote `APPROVED` with `REJECTED`. The decision and its record now commit together, so that pause point no longer exists.
- **`DecisionRecorded`.** The `templateVersionApproval.create` call throws inside the transaction. This stands in for a crash or a database error before commit. Before the fix the version stayed `APPROVED` with no record. Now it stays `PENDING`.

The `StrandedRequestsClose` path in `results/before.md` is TLC's counterexample with its fingerprint index pinned by `tlc.py`. Its core is steps 1 to 5. A refill request is saved, then the prescription is saved as completed, and the request is left waiting. Steps 6 to 12 are unrelated requests, bills and the valid-until date passing, and none of them closes the request. The replay follows steps 1 to 5 and then checks that the request is still pending.

## What the model leaves out

- Partial bills. A bill is one full course. A real fix would compare dispensed quantity per line with the prescribed quantity times one plus approved refills.
- `maxRefills` edits. `updatePrescription` refuses to lower it below pending plus approved refills (`:494`), under the same lock.
- Prescription creation and the one-per-visit check. The unique constraint on `visitId` is the real guard.
- Visit deletion. Every writer's lock query skips deleted visits.
- Template submit. It is a read-then-write too. A double submit racing an approval could put an approved version back to `PENDING`, but that needs three requests. The model starts at `PENDING`.
- Who may review. Any clinic staff role can approve, including the author. That is a permission question, not a state question.
- Approved template content is never applied to the template. Nothing reads `APPROVED`.
- A request still `PENDING` when the valid-until date passes also stays `PENDING` forever. `StrandedRequestsClose` covers completed and cancelled prescriptions only, because closing on expiry needs a scheduled job, not a guard.
- The clock does not pass inside a locked transaction. The check and the write run milliseconds apart.

## Run

```sh
export TLA2TOOLS=/path/to/tla2tools.jar
python3 verification/state-machines/verify.py prescriptions
python3 verification/state-machines/chart.py prescriptions
cd backend && FORMAL_REPLAY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/clinic_stack \
  npx jest --ci --runInBand src/modules/prescriptions/tests/prescriptions.formal-replay.database.spec.ts
```

The bounds are two concurrent requests with a budget of five commands, two refill rows, `maxRefills = 1`, at most two bills, two reviewers. TLC explores 1815 states in `before`, 1417 in `code` and 1260 in `fixed`. Each run takes about two seconds.
