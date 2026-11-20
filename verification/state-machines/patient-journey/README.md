# Patient journey

One patient's day across three desks. The receptionist books and checks the patient in. The doctor runs the visit and writes the prescription. The pharmacist reviews the medicines, bills them and the queue marks them dispensed.

Each subsystem has its own model. `appointment-visit` covers the two rows that write each other and their races. `prescriptions` covers refills and template approval. `dispense-queue` covers the pharmacist's task workflow. This model checks only the hand-offs between them, and the states a person at the clinic would not expect.

## Charts

`results/code.mmd` is the clinic's day as the code runs it. `results/fixed.mmd` is the same day with the fixes below. Red states break a rule. Amber dashed states are where a patient who has arrived can be left forever.

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

| Rule | Kind | Code | Fixed |
| --- | --- | --- | --- |
| `TypeOK` | invariant | holds | holds |
| `CalendarFollowsVisit` | invariant | breaks | holds |
| `CompletedOnlyAfterVisit` | invariant | breaks | holds |
| `VisitStartsFromOpenBooking` | invariant | holds | holds |
| `NoOrphanPrescription` | invariant | holds | holds |
| `BillOnlyForActivePrescription` | invariant | holds | holds |
| `BilledPrescriptionStaysActive` | invariant | breaks | holds |
| `DispensedOnlyWhenBilled` | invariant | holds | holds |
| `PatientLeavesServed` | property | breaks | holds |

`model.py` has each rule's sentence. What each break means at the clinic:

- `CalendarFollowsVisit`. The voice check-in lists today's waiting patients, then sends `PATCH /appointments/:id {status: CHECKED_IN}` when the receptionist confirms. If the doctor has started the visit in between, the server still writes `CHECKED_IN`. Its compare-and-set compares the status the server read, not the one the receptionist saw. The calendar shows the patient waiting while the doctor sees them, and the desk can now cancel the appointment, because `remove` accepts `CHECKED_IN`. `appointment-visit` checks the same agreement for a generic status edit. This model replays the voice check-in path.
- `CompletedOnlyAfterVisit`. `PATCH /appointments/:id` and `POST /appointments/bulk-update` accept `COMPLETED` for an appointment with no visit. No screen sends this today, so it needs a direct API call.
- `BilledPrescriptionStaysActive`. `cancelPrescription` checks only that the prescription is not already cancelled. After the pharmacist bills it, the doctor can still cancel it. The posted bill keeps its stock deduction, and the prescription disappears from the pharmacy queue, because the queue hides cancelled prescriptions. `updatePrescription` already refuses to change the medicines of a billed prescription. Cancelling is the larger change and has no such check. No screen cancels a prescription today.
- `PatientLeavesServed`. A patient checks in, the doctor starts a visit and then deletes it, which returns the appointment to `CHECKED_IN`. If the desk then marks the appointment `COMPLETED`, `POST /visits` refuses every new visit for it. Nothing in the system moves it back. Only a check-in sent by hand would, and the voice check-in does not list a completed appointment. TLC's lasso for this rule varies between runs (see Shared tool note). Every variant seen ends in the same state, "Calendar says completed, patient never seen".

The rules that hold are the hand-off guards that work today. Visit creation refuses a cancelled or completed appointment. Visit deletion refuses a visit with a prescription. Billing re-reads the prescription under a row lock and refuses one that is not active or whose visit is deleted. Manual `DISPENSED` is refused, so only a posted bill marks the queue dispensed.

## Fixed mode

The smallest set of guards that makes every rule hold:

1. `PATCH /appointments/:id` refuses to change an appointment that is `IN_PROGRESS` or `COMPLETED`. Those statuses belong to the visit.
2. `PATCH /appointments/:id` and bulk update refuse to set `COMPLETED`. Only `POST /visits/:id/complete` writes it.
3. `cancelPrescription` refuses a prescription with a posted bill, the same check `updatePrescription` makes for changed medicines. A sales return is the way back.

## Negative controls

Each control is `fixed` with one guard removed. Each must break the rule its guard protects.

| Mode | Guard removed | The real mistake | Breaks |
| --- | --- | --- | --- |
| `checkInOverVisit` | fix 1 | the PATCH as it is today | `CalendarFollowsVisit` |
| `cancelAnyStatus` | the status filter in `remove` | cancelling with a plain update, as `remove` once did | `CalendarFollowsVisit` |
| `patchCompletes` | fix 2 | the PATCH and bulk update as they are today | `CompletedOnlyAfterVisit`, `PatientLeavesServed` |
| `visitFromClosedBooking` | the status check in `VisitsService.create` | starting a visit from any appointment | `VisitStartsFromOpenBooking` |
| `deleteWithRx` | the prescription check in `VisitsService.remove` | deleting a visit that has a prescription | `NoOrphanPrescription` |
| `billWithoutEligibility` | `requireEligiblePrescription` at posting | posting a bill without re-reading the prescription | `BillOnlyForActivePrescription` |
| `cancelBilledRx` | fix 3 | `cancelPrescription` as it is today | `BilledPrescriptionStaysActive` |
| `manualDispense` | the `DISPENSED` refusal in `updateTaskStatus` | a pharmacist marking dispensed without a bill | `DispensedOnlyWhenBilled` |
| `typeProbe` | none, a bill starts as `LOST` | | `TypeOK` |

## Model to code

Paths are under `backend/src/modules/` unless they start with `frontend/`.

| Model | Role | Code |
| --- | --- | --- |
| `Init` | receptionist | `appointments/appointments.service.ts:89` `create`, status from the booking's calendar at `:163` |
| `DeskConfirmsOnCall` | receptionist | `appointments/appointments.service.ts:525` `reschedule` with `calendar: CONFIRMED`, `isMovable` at `:568` |
| `DeskChecksIn` | receptionist | `appointments/appointments.service.ts:456` `update`, compare-and-set on the server's own read at `:509`. Sent by `frontend/src/components/voice/VoiceCommandDialog.tsx:208`, offered for `frontend/src/lib/voice-command.ts:280` waiting statuses |
| `DeskMarksCompleted` | receptionist | `appointments/appointments.service.ts:456` `update`, and `:599` `bulkUpdate`, whose only status guard at `:601` refuses `SCHEDULED` and `CONFIRMED` |
| `DeskCancels` | receptionist | `appointments/appointments.service.ts:632` `remove`, filter at `:637`. Sent by `frontend/src/components/appointments/DoctorDayCalendar.tsx:323` |
| `DoctorStartsVisit` | doctor | `visits/visits.service.ts:129` row lock, `:132` refuses `CANCELLED` and `COMPLETED`, `:187` writes `IN_PROGRESS` |
| `DoctorWritesPrescription` | doctor | `prescriptions/prescriptions.service.ts:83` live visit, `:99` one per visit, `:165` pulls into the queue, which creates the task `QUEUED` |
| `DoctorCompletesVisit` | doctor | `visits/visits.service.ts:572` `complete`, `:594` writes the appointment `COMPLETED` by id |
| `DoctorDeletesVisit` | doctor | `visits/visits.service.ts:612` `remove`, `:617` refuses a visit with a prescription, `:632` moves the appointment to `CHECKED_IN` |
| `DoctorCancelsPrescription` | doctor | `prescriptions/prescriptions.service.ts:513` `cancelPrescription`, `:516` its only status check |
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

`backend/src/modules/visits/tests/patient-journey.formal-replay.database.spec.ts` walks each code-mode break through the real `AppointmentsService`, `VisitsService`, `PrescriptionsService`, `PharmacyPrescriptionQueueService` and `PharmacyInvoiceService` on a private PostgreSQL schema. Each rule has a `.failing` test that asserts the correct outcome and a `today:` test that asserts what the code does now.

## The liveness path

The `PatientLeavesServed` path in `results/code.md` is TLC's counterexample with its fingerprint index pinned by `tlc.py`. The desk checks the patient in, the doctor starts the visit and deletes it, and the desk marks the appointment completed. The replay drives exactly these steps.