# Patient journey

One patient's day across three desks. The receptionist books and checks the patient in. The doctor runs the visit and writes the prescription. The pharmacist reviews the medicines, bills them and the queue marks them dispensed.

Each subsystem has its own model. `appointment-visit` covers the two rows that write each other and their races. `prescriptions` covers refills and template approval. `dispense-queue` covers the pharmacist's task workflow. This model checks only the hand-offs between them, and the states a person at the clinic would not expect.

## Charts

`results/code.mmd` is the clinic's day as the code runs it now. `results/before.mmd` is the same day as the code ran it before the fix, kept as a regression control. Red states break a rule. Amber dashed states are where a patient who has arrived can be left forever.

The chart folds "Booked, awaiting the confirmation call" and "Confirmed for today" into one state, "Booked for today", to stay within 30 arrows. The confirmation call is still an action in the model. `verification/appointment-calendars` charts the call itself.

## Domain

Every variable is one real status column.

| Variable | Column | Values in the model |
| --- | --- | --- |
| `appt` | `Appointment.status` | `SCHEDULED`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| `visit` | `Visit.status`, `none` before the doctor starts | `none`, `IN_PROGRESS`, `COMPLETED` |
| `visitDeleted` | `Visit.deletedAt` is set | `TRUE`, `FALSE` |
| `rx` | `Prescription.status`, `none` before the doctor writes it | `none`, `ACTIVE`, `CANCELLED` |
| `task` | `PharmacyDispenseTask.status` | `none`, `QUEUED`, `READY_TO_BILL`, `DISPENSED` |
| `bill` | `PharmacyInvoice.status` | `none`, `CONFIRMED` |
| `deletions` | bound | the doctor deletes a visit at most once |
| `startedFrom` | history | the appointment status the visit started from |
| `rxAtBill` | history | the prescription status when the bill posted |

A visit is live when it exists and `deletedAt` is null. The model holds one appointment, the visits started from it, one prescription and one bill. When the doctor restarts a deleted visit, the model reuses the visit variable, as the code moves the link from `appointmentId` to `deletedAppointmentId` and the new row takes `appointmentId`.

## Rules

| Rule | Kind | Before | Code | Fixed |
| --- | --- | --- | --- | --- |
| `TypeOK` | invariant | holds | holds | holds |
| `CalendarFollowsVisit` | invariant | breaks | holds | holds |
| `CompletedOnlyAfterVisit` | invariant | breaks | holds | holds |
| `VisitStartsFromOpenBooking` | invariant | holds | holds | holds |
| `NoOrphanPrescription` | invariant | holds | holds | holds |
| `BillOnlyForActivePrescription` | invariant | holds | holds | holds |
| `BilledPrescriptionStaysActive` | invariant | breaks | holds | holds |
| `DispensedOnlyWhenBilled` | invariant | holds | holds | holds |
| `PatientLeavesServed` | property | breaks | holds | holds |

`model.py` has each rule's sentence. What each break meant at the clinic before the fix:

- `CalendarFollowsVisit`. The voice check-in lists today's waiting patients, then sends `PATCH /appointments/:id {status: CHECKED_IN}` when the receptionist confirms. If the doctor had started the visit in between, the server still wrote `CHECKED_IN`. Its compare-and-set compares the status the server read, not the one the receptionist saw. The calendar showed the patient waiting while the doctor saw them, and the desk could then cancel the appointment, because `remove` accepts `CHECKED_IN`. `appointment-visit` checks the same agreement for a generic status edit. This model replays the voice check-in path.
- `CompletedOnlyAfterVisit`. `PATCH /appointments/:id` and `POST /appointments/bulk-update` accepted `COMPLETED` for an appointment with no visit. No screen sends this, so it needed a direct API call.
- `BilledPrescriptionStaysActive`. `cancelPrescription` checked only that the prescription was not already cancelled. After the pharmacist billed it, the doctor could still cancel it. The posted bill kept its stock deduction, and the prescription disappeared from the pharmacy queue, because the queue hides cancelled prescriptions. No screen cancels a prescription.
- `PatientLeavesServed`. A patient checks in, the doctor starts a visit and then deletes it, which returns the appointment to `CHECKED_IN`. If the desk then marked the appointment `COMPLETED`, `POST /visits` refused every new visit for it, and nothing moved it back. Every lasso TLC printed for this rule ends in the same state, "Calendar says completed, patient never seen".

The rules that held before the fix are the hand-off guards that already worked. Visit creation refuses a cancelled or completed appointment. Visit deletion refuses a visit with a prescription. Billing re-reads the prescription under a row lock and refuses one that is not active or whose visit is deleted. Manual `DISPENSED` is refused, so only a posted bill marks the queue dispensed.

## Fixed mode

`fixed` is the design the fix started from. The smallest set of guards that makes every rule hold:

1. `PATCH /appointments/:id` refuses to change an appointment that is `IN_PROGRESS` or `COMPLETED`. Those statuses belong to the visit.
2. `PATCH /appointments/:id` and bulk update refuse to set `COMPLETED`. Only `POST /visits/:id/complete` writes it.
3. `cancelPrescription` refuses a prescription with a posted bill, the same check `updatePrescription` makes for changed medicines. A sales return is the way back.

## The fix

`code` is `fixed` plus one more check-in guard, shared with `appointment-visit`.

| Guard | Code | Rules |
| --- | --- | --- |
| A status edit, through `PATCH` or bulk update, never changes an appointment that is `IN_PROGRESS` or `COMPLETED`. Fix 1. | `backend/src/modules/appointments/appointments.service.ts:83` | `CalendarFollowsVisit` |
| A status edit never sets `IN_PROGRESS` or `COMPLETED`. Fix 2. | `backend/src/modules/appointments/appointments.service.ts:86` | `CompletedOnlyAfterVisit`, `PatientLeavesServed` |
| A check-in starts only from `SCHEDULED`, `CONFIRMED` or `NO_SHOW`. This model's rules do not need it. `appointment-visit` needs it for `NoResurrection`. | `backend/src/modules/appointments/appointments.service.ts:89` | none here |
| `cancelPrescription` refuses a prescription with a posted pharmacy bill, under the prescription row lock that billing takes. Fix 3. | `backend/src/modules/prescriptions/prescriptions.service.ts:525` | `BilledPrescriptionStaysActive` |

`update` runs the status guards at `appointments.service.ts:518` and `bulkUpdate` at `:636`.

## Negative controls

Each control is `fixed` with one guard removed. Each must break the rule its guard protects.

| Mode | Guard removed | The real mistake | Breaks |
| --- | --- | --- | --- |
| `checkInOverVisit` | fix 1 | the PATCH before the fix | `CalendarFollowsVisit` |
| `cancelAnyStatus` | the status filter in `remove` | cancelling with a plain update, as `remove` once did | `CalendarFollowsVisit` |
| `patchCompletes` | fix 2 | the PATCH and bulk update before the fix | `CompletedOnlyAfterVisit`, `PatientLeavesServed` |
| `visitFromClosedBooking` | the status check in `VisitsService.create` | starting a visit from any appointment | `VisitStartsFromOpenBooking` |
| `deleteWithRx` | the prescription check in `VisitsService.remove` | deleting a visit that has a prescription | `NoOrphanPrescription` |
| `billWithoutEligibility` | `requireEligiblePrescription` at posting | posting a bill without re-reading the prescription | `BillOnlyForActivePrescription` |
| `cancelBilledRx` | fix 3 | `cancelPrescription` before the fix | `BilledPrescriptionStaysActive` |
| `manualDispense` | the `DISPENSED` refusal in `updateTaskStatus` | a pharmacist marking dispensed without a bill | `DispensedOnlyWhenBilled` |
| `typeProbe` | none, a bill starts as `LOST` | | `TypeOK` |

## Model to code

Paths are under `backend/src/modules/` unless they start with `frontend/`.

| Model | Role | Code |
| --- | --- | --- |
| `Init` | receptionist | `appointments/appointments.service.ts:111` `create`, status from the booking's calendar at `:185` |
| `DeskConfirmsOnCall` | receptionist | `appointments/appointments.service.ts:548` `reschedule` with `calendar: CONFIRMED`, `isMovable` at `:591` |
| `DeskChecksIn` | receptionist | `appointments/appointments.service.ts:478` `update`, `assertStatusEdit` at `:518` on the server's own read, compare-and-set at `:532`. Sent by `frontend/src/components/voice/VoiceCommandDialog.tsx:209`, offered for `frontend/src/lib/voice-command.ts:280` waiting statuses |
| `DeskMarksCompleted` | receptionist | refused in `code`. `appointments/appointments.service.ts:478` `update` and `:622` `bulkUpdate` both run `assertStatusEdit`, which refuses a `COMPLETED` target at `:86` |
| `DeskCancels` | receptionist | `appointments/appointments.service.ts:649` `remove`, filter at `:654`. Sent by `frontend/src/components/appointments/DoctorDayCalendar.tsx:323` |
| `DoctorStartsVisit` | doctor | `visits/visits.service.ts:129` row lock, `:132` refuses `CANCELLED` and `COMPLETED`, `:187` writes `IN_PROGRESS` |
| `DoctorWritesPrescription` | doctor | `prescriptions/prescriptions.service.ts:83` live visit, `:99` one per visit, `:165` pulls into the queue, which creates the task `QUEUED` |
| `DoctorCompletesVisit` | doctor | `visits/visits.service.ts:580` `complete`, `:602` writes the appointment `COMPLETED` by id |
| `DoctorDeletesVisit` | doctor | `visits/visits.service.ts:620` `remove`, `:624` refuses a visit with a prescription, `:641` moves the appointment to `CHECKED_IN` |
| `DoctorCancelsPrescription` | doctor | `prescriptions/prescriptions.service.ts:518` `cancelPrescription`, `:522` refuses a completed or expired prescription, `:525` refuses a billed one |
| `PharmacistReviews` | pharmacist | `pharmacy/pharmacy-prescription-queue.service.ts:561` `lockDispenseTask`, `:555` requires an active prescription on a live visit |
| `PharmacistBills` | pharmacist | `pharmacy/pharmacy-invoice.service.ts:142` `checkout`, `:1404` and `:1496` `requireEligiblePrescription`, `:1530` refuses an inactive prescription |
| `PharmacistRefreshesQueue` | pharmacist | `pharmacy/pharmacy-prescription-queue.service.ts:330` `pull`, `:653` sets `DISPENSED` once a posted bill covers the prescription |
| `PharmacistMarksDispensed` | pharmacist | refused at `pharmacy/pharmacy-prescription-queue.service.ts:401` |
| queue hides a cancelled prescription | system | `pharmacy/pharmacy-prescription-queue-query.ts:130` |

## Fairness

`PatientLeavesServed` assumes the flow, not the code. Each clause is weak fairness on a forward step a person takes. None is on a timer, because no timer or cron touches these columns.

| Clause | Assumption |
| --- | --- |
| `WF_vars(DoctorStartsVisit)` | A doctor sees a checked-in patient. |
| `WF_vars(DoctorWritesPrescription)` | This patient needs medicine, and the doctor writes it. |
| `WF_vars(DoctorCompletesVisit)` | The doctor completes an open visit. |
| `WF_vars(PharmacistReviews)` | The pharmacist reviews a queued prescription. |
| `WF_vars(PharmacistBills)` | The pharmacist bills an active prescription. |
| `WF_vars(PharmacistRefreshesQueue)` | The pharmacist refreshes the queue after billing. |

No fairness is on a desk action, a deletion or a cancellation. Those can happen or not. The property asks whether a patient who has arrived can be stranded when everyone keeps doing their forward steps. "Turned away" counts as leaving: an appointment cancelled with no live visit. A prescription the doctor cancels before billing also counts, because the doctor chose it.

## What the model leaves out

- Races inside one subsystem. `appointment-visit`, `prescriptions` and `dispense-queue` model them.
- Capacity and the calendar split. `verification/appointment-calendars` models them.
- `NO_SHOW`. No screen and no cron writes it, so a patient who never comes stays booked.
- `Prescription.status = COMPLETED`, written only by a direct `PATCH /prescriptions/:id`. It would block billing the same way a cancellation does.
- Prescription validity. An expired `validUntil` blocks billing by design.
- The 24 hour rule that shows an unbilled prescription as Paused in the queue. It changes only the label, and billing still works.
- Draft bills, partial bills, payments and sales returns. The model has one bill, posted or not.
- Dispense task states `IN_REVIEW`, `PARTIALLY_FILLED`, `PAUSED`, `PAID`, `CANCELLED`. `dispense-queue` models them.
- Prescription pad visits, which have no appointment.
- The clinic consultation bill (`Invoice`), which is a separate ledger.

## Replays

`backend/src/modules/visits/tests/patient-journey.formal-replay.database.spec.ts` walks each `before` break through the real `AppointmentsService`, `VisitsService`, `PrescriptionsService`, `PharmacyPrescriptionQueueService` and `PharmacyInvoiceService` on a private PostgreSQL schema. Each test asserts the correct outcome and passes on the fixed code.

## The liveness path

The `PatientLeavesServed` path in `results/before.md` is TLC's counterexample with its fingerprint index pinned by `tlc.py`. The desk checks the patient in, the doctor starts the visit and deletes it, and the desk marks the appointment completed. The replay drives exactly these steps. The desk's completion is now refused, and the doctor can start the visit again.