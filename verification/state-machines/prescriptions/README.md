# Prescriptions, refills and template review

`Prescriptions.tla` checks two machines from `backend/src/modules/prescriptions/prescriptions.service.ts` at commit `6416677`.

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

## Rules and verdicts at `6416677`

| Rule | Kind | Code | Sentence |
| --- | --- | --- | --- |
| `TypeOK` | invariant | holds | Every variable stays inside its type. |
| `AtMostOnePendingRefill` | invariant | holds | A prescription has at most one refill request waiting for the doctor. |
| `RefillsWithinAllowance` | invariant | holds | Approved refills never exceed the prescription's refill allowance. |
| `NoApprovalOnClosedPrescription` | invariant | holds | A refill is approved only while the prescription is active and in date. |
| `BillsWithinAllowance` | invariant | **breaks** | Pharmacy bills on a prescription never exceed the first fill plus its approved refills. |
| `CompletedStaysCompleted` | invariant | **breaks** | A completed prescription stays completed. |
| `CancelledStaysCancelled` | invariant | holds | A cancelled prescription stays cancelled. |
| `StrandedRequestsClose` | property | **breaks** | A refill request on a completed or cancelled prescription does not stay waiting forever. |
| `OneDecision` | invariant | **breaks** | A template version gets at most one review decision on record. |
| `DecidedStaysDecided` | invariant | **breaks** | Once a template version is approved or rejected, its status does not change. |
| `DecisionRecorded` | invariant | **breaks** | An approved or rejected template version has a review record that says so. |

The refill machine itself is correctly guarded. Every refill writer locks the prescription row and re-reads it, and the three refill rules hold. The census lead that an approved refill "uses quota forever" is not a bug on its own. An approved refill is an authorization, and counting it against `maxRefills` is right. The real gap is that nothing downstream reads the authorization. Pharmacy billing checks only `status` and `validUntil`, so a second full course can be billed against a prescription with no refills, or one whose refill the doctor rejected. `BillsWithinAllowance` states that domain rule. The code never states it. It is the clinic's call whether refills should gate dispensing.

`CompletedStaysCompleted` rests on the code's own reading of `COMPLETED`. `updatePrescription` refuses any edit to a completed prescription (`prescriptions.service.ts:472`), but `cancelPrescription` skips only an already cancelled row (`:516`).

No screen calls the refill endpoints, `DELETE /prescriptions/:id` or the template version endpoints today. `frontend/src/lib/api.ts:1056` to `:1064` wraps the version endpoints, but no component calls them. Every break is reachable through the API only.

## Model to code

| Model | Code |
| --- | --- |
| `Send` with `lock` | `lockPrescription`, `prescriptions.service.ts:437`. `SELECT ... FOR UPDATE OF r` at `:443`, then a re-read with refills. Pharmacy billing takes the same row lock in `requireEligiblePrescription`, `pharmacy-invoice.service.ts:1509`. |
| `Eligible` | `requireRefillEligibility`, `prescriptions.service.ts:450`. Status `ACTIVE`, `validUntil` not past, used (`APPROVED` or `COMPLETED`) below `maxRefills` at `:453`. |
| `DeskRequestsRefill` | `requestRefill`, `:533`. Eligibility, then no other `PENDING` at `:537`, then an insert. |
| `DoctorApprovesRefill` | `approveRefill`, `:546`. `PENDING` check at `:552`, eligibility re-checked under the lock, update by id at `:555`. |
| `DoctorRejectsRefill` | `rejectRefill`, `:562`. `PENDING` check at `:567`, update by id. |
| `DoctorCancels` | `cancelPrescription`, `:513`. Returns unchanged when already `CANCELLED` at `:516`. Otherwise `updateMany` of `PENDING` refills to `REJECTED` at `:518`, then `CANCELLED` at `:522`. Any other status passes. |
| `DoctorMarksCompleted` | `updatePrescription` with `status: COMPLETED`, `:468`. Refuses unless `DRAFT` or `ACTIVE` at `:472`. Writes the status at `:491`. Leaves refills alone. |
| `PharmacistPostsBill` | `checkout`, `pharmacy-invoice.service.ts:142`, posting `CONFIRMED` through `transitionInvoice`. Stock-deducting transitions call `requireEligiblePrescription` at `:1403`, which checks `ACTIVE` at `:1530` and `validUntil` at `:1532`. It never reads refills or earlier bills. |
| `ServerCommits` | The rest of each transaction after the lock: the checks on what was read, then the writes. |
| `ValidUntilPasses` | Time passing `validUntil`. No job writes `EXPIRED`. Readers compare dates. |
| `ReviewerApproves`, `ReviewerRejects` | `approveTemplateVersion`, `:1190`, and `rejectTemplateVersion`, `:1212`. `findFirst`, then the `PENDING` check at `:1201` and `:1223`. No transaction and no lock. |
| `ServerSavesDecision` | `prescriptionTemplateVersion.update` by id alone, `:1204` and `:1226`. |
| `ServerSavesReviewRecord` | `templateVersionApproval.create`, `:1206` and `:1228`, a second statement outside any transaction. |
| `ReviewRecordFails` | That insert throws after the status update has committed. |

## Modes

`fixed` is the smallest change that makes every rule hold:

- Pharmacy billing refuses a bill once the prescription's bills reach one plus its approved refills.
- `cancelPrescription` cancels only an `ACTIVE` prescription.
- `updatePrescription` to `COMPLETED` rejects `PENDING` refills in the same transaction, as cancel already does.
- Template approve and reject update `where { id, status: 'PENDING' }`, return 409 on zero rows, and insert the review record in the same transaction.

Each negative control is `fixed` with one guard removed. Each must break the rule its guard protects.

| Mode | Real mistake | Breaks |
| --- | --- | --- |
| `noRowLock` | The refill commands read and write without `lockPrescription`. | `AtMostOnePendingRefill`, `RefillsWithinAllowance` |
| `noApproveRecheck` | `approveRefill` checks only that the request is `PENDING`, not `requireRefillEligibility`. | `NoApprovalOnClosedPrescription` |
| `billIgnoresRefills` | Billing checks status and validity only, as the code does today. | `BillsWithinAllowance` |
| `cancelAnyStatus` | Cancel skips only an already cancelled row, as the code does today. | `CompletedStaysCompleted` |
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

No user action has fairness, so a doctor may never come back to a request. `ValidUntilPasses` has no fairness because no rule depends on time passing. `StrandedRequestsClose` breaks in `code` because no server step, job or timer closes a `PENDING` request once the prescription is completed. `approveRefill` refuses it, because the prescription is no longer `ACTIVE`, and nothing else touches it. In `fixed` the completion closes it in the same transaction.

## Replays

`backend/src/modules/prescriptions/tests/prescriptions.formal-replay.database.spec.ts` drives the real `PrescriptionsService` and `PharmacyInvoiceService` against a private PostgreSQL schema. Each code break has an `it.failing` test asserting the right outcome and a `today:` test asserting what the code does now.

- **`BillsWithinAllowance`.** Two full `checkout` calls on a prescription with `maxRefills: 0`. Today the second posts and stock falls from 20 to 0.
- **`CompletedStaysCompleted`.** `updatePrescription` to `COMPLETED`, then `cancelPrescription`. Today the status ends `CANCELLED`.
- **`StrandedRequestsClose`.** `requestRefill`, then `updatePrescription` to `COMPLETED`. Today the refill stays `PENDING` and `approveRefill` refuses it. The module schedules nothing, so there is no timer to run before the assertion.
- **`OneDecision`.** `gate()` pauses one approval before its update. A second approval runs to completion, then the first resumes. Today both succeed and there are two `APPROVED` records.
- **`DecidedStaysDecided`.** A rejection paused before its update, then an approval paused after its update. Releasing the rejection overwrites `APPROVED` with `REJECTED`.
- **`DecisionRecorded`.** The `templateVersionApproval.create` call throws. This stands in for a crash or a database error between the two statements. Today the version stays `APPROVED` with no record.

The `StrandedRequestsClose` path in `results/code.md` is TLC's counterexample with its fingerprint index pinned by `tlc.py`. Its core is steps 1 to 5. A refill request is saved, then the prescription is saved as completed, and the request is left waiting. Steps 6 to 12 are unrelated requests, bills and the valid-until date passing, and none of them closes the request. The replay follows steps 1 to 5 and then checks that the request is still pending.

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

The bounds are two concurrent requests with a budget of five commands, two refill rows, `maxRefills = 1`, at most two bills, two reviewers. TLC explores 1815 states in `code` and 1260 in `fixed`. Each run takes about two seconds.
