# Appointment and its visit

An appointment and the visit started from it are two rows that write each other. Starting a visit moves the appointment to `IN_PROGRESS`. Completing the visit writes the appointment `COMPLETED`. Deleting the visit moves the appointment back to `CHECKED_IN`. The desk changes the appointment through cancel (`DELETE /appointments/:id`), status edits (`PATCH /appointments/:id`, which the voice check-in also sends) and an admin's bulk update.

`AppointmentVisit.tla` models one appointment and its live visit with two actors, the doctor on the visit and the desk on the appointment. Calendar capacity is out of scope. `verification/appointment-calendars/` models it.

The model was checked at commit `6416677`.

## State

| Model variable | Code |
| --- | --- |
| `appt` | `Appointment.status`, all seven values |
| `visit` | the live visit linked to the appointment: `Visit.status` of the row with `appointmentId` set to this appointment and `deletedAt` null. `none` when there is no such row. A deleted visit has `deletedAt` set and its link moved to `deletedAppointmentId`, so it leaves the model. |
| `notes` | the visit's clinical columns (`complaints`, `diagnosis`, `plan` and the rest), as a count of edits |
| `signed` | model only. The value of `notes` when `complete` ran. The code keeps no copy. |
| `checkInPlanned` | the voice dialog has resolved a check-in from the appointment list it read (`voice-command.ts` `matchAppointment`) and waits for the desk to confirm |
| `cancelHeld` | model only. A cancel was applied and nobody looking at the cancelled appointment has undone it. In the code this intent lives only in `status`, which is why a later write can erase it without anyone noticing. |

The lifecycle is spread over two rows. `StatusesAgree` names the agreement the code depends on. The visit form shows `Visit.status` (`MedicalVisitForm.tsx:1786`). The appointment screens show `Appointment.status`.

## Rules

| Rule | Kind | Sentence | `code` |
| --- | --- | --- | --- |
| `TypeOK` | invariant | Every variable holds a value of its type. | holds |
| `StatusesAgree` | invariant | While a visit is open the appointment shows in progress, and once the visit is completed the appointment shows completed. | breaks |
| `NoResurrection` | invariant | A cancelled appointment stays cancelled until someone looking at it as cancelled brings it back. | breaks |
| `CompletedVisitFrozen` | invariant | A completed visit's clinical notes stay as they were when the doctor completed it. | breaks |
| `DisagreementHeals` | property | When the appointment and its visit disagree, the system brings them back into agreement by itself. | breaks |

`NoResurrection` allows a deliberate reactivation. `update` treats a status edit out of `CANCELLED` as a reactivation and runs the capacity check for it, and the model keeps that. The rule forbids a write by someone who never saw the cancel. Two such writers exist. The doctor completes the visit, or the desk confirms a voice check-in planned from a list read before the cancel.

## What TLC finds

`results/code.md` holds TLC's paths. In short:

- `StatusesAgree`. The doctor starts the visit. The desk edits the status to `SCHEDULED`. `update` compares only the status it read in the same request, so the edit lands. The visit stays open with its appointment back on the Scheduled calendar.
- `NoResurrection`. The doctor starts the visit. The desk edits the status to `CANCELLED`. The doctor completes the visit, and `complete` writes the appointment `COMPLETED` by id at `visits.service.ts:594` without reading its status.
- `CompletedVisitFrozen`. The doctor completes the visit, then saves a new diagnosis. `update` checks the version and `deletedAt` but never the status.
- `DisagreementHeals`. Once the rows disagree, no step in the code repairs them. Nothing reconciles the two statuses.

The `uiOnly` mode keeps only writes a screen sends. It drops the raw status edit, the bulk update and visit delete, which no screen calls. It still breaks every rule except `TypeOK`:

- A voice check-in planned while the appointment was waiting, confirmed after the doctor started the visit, moves the appointment to `CHECKED_IN` under an open visit. `matchAppointment` filters for `SCHEDULED` or `CONFIRMED` on the client, but the PATCH carries no expected status, and the server compares against its own fresh read.
- The same stale check-in, confirmed after another desk cancelled, brings the appointment back as `CHECKED_IN`.
- After that check-in under an open visit, the desk can cancel (`CHECKED_IN` is cancellable), and completing the visit then overwrites the cancel with `COMPLETED`.
- The visit form's Save Draft button (`MedicalVisitForm.tsx:1751`) stays enabled after completion, so the doctor can change a completed visit from the screen.

## The fixed protocol

`fixed` adds three guards. Each negative control removes one and names the real mistake it reproduces.

| Guard | Code it would change | Negative control | Breaks |
| --- | --- | --- | --- |
| While a live visit exists, a status edit may not change the appointment. The visit owns the status. | `update`, before `updateMany` at `appointments.service.ts:509` | `patchIgnoresVisit` | `StatusesAgree`, `NoResurrection`, `DisagreementHeals` |
| The same for the bulk update. | `bulkUpdate` at `appointments.service.ts:618` | `bulkIgnoresVisit` | `StatusesAgree`, `NoResurrection`, `DisagreementHeals` |
| A patient is checked in only from `SCHEDULED`, `CONFIRMED` or `NO_SHOW`. | `update` | `checkInFromAnyStatus` | `NoResurrection` |
| A completed visit refuses clinical edits. | `visits.service.ts` `update` at line 469 | `editAfterComplete` | `CompletedVisitFrozen` |

`checkInFromAnyStatus` keeps the visit guard, so its only break is the stale voice check-in that undoes a cancel. `typeProbe` starts the appointment as `RESCHEDULED`, a value the frontend status registry lists and the enum lacks, and breaks `TypeOK`.

`complete` writing the appointment by id needs no guard of its own in `fixed`. With the visit guard, an appointment whose visit is open is always `IN_PROGRESS`, so the unconditional write is safe. A compare-and-set on `IN_PROGRESS` there would be a sound second line of defence.

## Model to code

| Model | Code |
| --- | --- |
| `DoctorStartsVisit` | `visits.service.ts:74` `create`. Row lock on the appointment at line 129, refuse `CANCELLED` and `COMPLETED` at line 133, refuse a second live visit at line 136, write `IN_PROGRESS` at line 187. |
| `DoctorEditsNotes` | `visits.service.ts:469` `update`. Version compare-and-set at line 527, no status check. The screen path is `MedicalVisitForm.tsx:1751`. |
| `DoctorCompletesVisit` | `visits.service.ts:572` `complete`. Row lock on the visit at line 574, return early when already `COMPLETED` at line 577, write the appointment `COMPLETED` by id at line 594. |
| `VisitIsDeleted` | `visits.service.ts:612` `remove`. Soft delete and detach at line 624, move `IN_PROGRESS` or `COMPLETED` back to `CHECKED_IN` at line 632. No screen calls it. |
| `DeskCancels` | `appointments.service.ts:632` `remove`, an `updateMany` to `CANCELLED` filtered by `notIn` `COMPLETED`, `IN_PROGRESS`, `CANCELLED` at line 637. |
| `DeskPlansCheckIn` | `frontend/src/lib/voice-command.ts:292`, the `WAITING` filter in `matchAppointment` |
| `DeskConfirmsCheckIn` | `frontend/src/components/voice/VoiceCommandDialog.tsx:209` sends `PATCH /appointments/:id` with `status: CHECKED_IN`, served by `appointments.service.ts:456` `update` |
| `DeskSetsStatus` | `appointments.service.ts:456` `update`. Compare-and-set on the status read in the same request at lines 493 and 509, capacity check only when the calendar changes at line 498. Roles ADMIN, DOCTOR, NURSE, RECEPTION. |
| `AdminBulkSets` | `appointments.service.ts:599` `bulkUpdate`. Refuses `SCHEDULED` and `CONFIRMED` targets at line 601, then `updateMany` by id with no status predicate at line 618. ADMIN only. |
| `PatchAllows`, `BulkAllows` | today accept every jump. In `fixed`, the guards above. |
| `EditAllowed` | today any live visit. In `fixed`, open visits only. |

## Concurrency

Every server write here is one transaction, guarded by a row lock (`create`, `complete`, `remove` on visits) or a compare-and-set on a read in the same request (`update`, `remove` on appointments). Two requests on these rows therefore serialize, and each server call is one atomic step in the model. The interleavings that matter are between requests, such as the desk acting between the doctor's start and complete. The voice check-in is the one real check-then-write across a gap. The dialog reads the list, the desk confirms later, and the PATCH does not say what the dialog saw. The model splits it into two steps for that reason.

## Fairness

None. No step in this lifecycle happens with nobody acting. No timer, cron or reconciler reads or writes either row, and every action is a person's. `Spec == Init /\ [][Next]_vars`. `DisagreementHeals` therefore asks whether the code repairs a disagreement on its own, and it cannot.

## Replays

`backend/src/modules/visits/tests/appointment-visit.formal-replay.database.spec.ts` drives the real `AppointmentsService` and `VisitsService` against a private PostgreSQL schema. Each rule has a `.failing` test that asserts the outcome the rule demands and a `today:` test that walks the same path and asserts what the code does now. The `(screens only)` tests replay the `uiOnly` paths. The voice dialog's client read is replayed as `findOne` returning `SCHEDULED`, the same check `matchAppointment` makes. Each test gets its own doctor so capacity never refuses a write.

The liveness replay has no timer to run. After the path it reads the appointment the way the screens do and asserts agreement.

The `DisagreementHeals` path in `results/code.md` is TLC's counterexample with its fingerprint index pinned by `tlc.py`. The doctor starts the visit, the desk changes the appointment's status, and the doctor edits the notes. Nothing then brings the two rows back into agreement. The replay drives exactly these steps.

## What the model leaves out

- Calendar capacity, rooms and the doctor-day lock. `verification/appointment-calendars/` covers them. The model assumes every capacity check passes.
- Reschedule and confirm. They only move between `SCHEDULED` and `CONFIRMED` and refuse every other status through `isMovable`.
- Review appointments booked through `review-booking.ts`. They are different appointments.
- Prescriptions and attachments, which block visit delete. The model lets every visit be deleted.
- Google Calendar sync. A status edit to `CANCELLED` patches the event instead of deleting it, which `DELETE` does.
- An appointment marked `COMPLETED` or `IN_PROGRESS` with no visit. The code allows it through a status edit. No rule here forbids it, because a desk can record a visit kept on paper.
- Visits with no appointment.
- Two doctors starting a visit at once. The appointment row lock serializes them, and `lifecycle.database.spec.ts` already proves at most one visit results.
