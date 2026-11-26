# Appointment and its visit

An appointment and the visit started from it are two rows that write each other. Starting a visit moves the appointment to `IN_PROGRESS`. Completing the visit writes the appointment `COMPLETED`. Deleting the visit moves the appointment back to `CHECKED_IN`. The desk changes the appointment through cancel (`DELETE /appointments/:id`), status edits (`PATCH /appointments/:id`, which the voice check-in also sends) and an admin's bulk update.

`AppointmentVisit.tla` models one appointment and its live visit with two actors, the doctor on the visit and the desk on the appointment. Calendar capacity is out of scope. `verification/appointment-calendars/` models it.

The model was first checked at commit `6416677`. The bugs it found are fixed. `code` mode is the code now, and `before` mode is the code as it was at `be2b934`, kept as a regression control. `results/before.md` keeps TLC's paths to the old breaks.

The requirement for completed visits changed. An earlier rule, `CompletedVisitFrozen`, said a completed visit's notes never change, and the server refused every edit to one. Doctors need to correct a completed visit, so the product now lets them edit it through a deliberate Edit visit action, and `EditKeepsCompletion` replaces that rule. The edit must keep the visit completed and leave its appointment alone.

## State

| Model variable | Code |
| --- | --- |
| `appt` | `Appointment.status`, all seven values |
| `visit` | the live visit linked to the appointment: `Visit.status` of the row with `appointmentId` set to this appointment and `deletedAt` null. `none` when there is no such row. A deleted visit has `deletedAt` set and its link moved to `deletedAppointmentId`, so it leaves the model. |
| `notes` | the visit's clinical columns (`complaints`, `diagnosis`, `plan` and the rest), as a count of edits |
| `checkInPlanned` | the voice dialog has resolved a check-in from the appointment list it read (`voice-command.ts` `matchAppointment`) and waits for the desk to confirm |
| `cancelHeld` | model only. A cancel was applied and nobody looking at the cancelled appointment has undone it. In the code this intent lives only in `status`, which is why a later write can erase it without anyone noticing. |

The lifecycle is spread over two rows. `StatusesAgree` names the agreement the code depends on. The visit form shows `Visit.status` (`MedicalVisitForm.tsx:1786`). The appointment screens show `Appointment.status`.

## Rules

| Rule | Kind | Sentence | `before` | `code` |
| --- | --- | --- | --- | --- |
| `TypeOK` | invariant | Every variable holds a value of its type. | holds | holds |
| `StatusesAgree` | invariant | While a visit is open the appointment shows in progress, and once the visit is completed the appointment shows completed. | breaks | holds |
| `NoResurrection` | invariant | A cancelled appointment stays cancelled until someone looking at it as cancelled brings it back. | breaks | holds |
| `EditKeepsCompletion` | property | Editing a completed visit keeps the visit completed and does not move its appointment. | holds | holds |
| `DisagreementHeals` | property | When the appointment and its visit disagree, the system brings them back into agreement by itself. | breaks | holds |

`EditKeepsCompletion` is an action property, `[][...]_vars`. It looks at each step that changes `notes` on a completed visit without deleting it, and asks that the visit stay `done` and `appt` stay where it was. TLC reports its violation as "Action property ... is violated", which `tlc.py` reads as a break. It holds in `before` too, because `update` there never wrote a status either.

`NoResurrection` allows a deliberate reactivation. `update` treats a status edit out of `CANCELLED` as a reactivation and runs the capacity check for it, and the model keeps that. The rule forbids a write by someone who never saw the cancel. Two such writers exist. The doctor completes the visit, or the desk confirms a voice check-in planned from a list read before the cancel.

## What TLC found before the fix

`results/before.md` holds TLC's paths in `before` mode. In short:

- `StatusesAgree`. The doctor starts the visit. The desk edits the status to `SCHEDULED`. `update` compared only the status it read in the same request, so the edit landed. The visit stayed open with its appointment back on the Scheduled calendar.
- `NoResurrection`. The doctor starts the visit. The desk edits the status to `CANCELLED`. The doctor completes the visit, and `complete` writes the appointment `COMPLETED` by id without reading its status.
- `DisagreementHeals`. Once the rows disagreed, no step in the code repaired them. Nothing reconciles the two statuses.

The `uiOnly` mode is `before` restricted to writes a screen sends. It drops the raw status edit, the bulk update and visit delete, which no screen calls. It still breaks `StatusesAgree`, `NoResurrection` and `DisagreementHeals`:

- A voice check-in planned while the appointment was waiting, confirmed after the doctor started the visit, moved the appointment to `CHECKED_IN` under an open visit. `matchAppointment` filters for `SCHEDULED` or `CONFIRMED` on the client, but the PATCH carries no expected status, and the server compares against its own fresh read.
- The same stale check-in, confirmed after another desk cancelled, brought the appointment back as `CHECKED_IN`.
- After that check-in under an open visit, the desk could cancel (`CHECKED_IN` is cancellable), and completing the visit then overwrote the cancel with `COMPLETED`.

## The fixed protocol

`fixed` is the design the fix started from. It adds three guards. Each negative control removes one and names the real mistake it reproduces.

| Guard | Code it would change | Negative control | Breaks |
| --- | --- | --- | --- |
| While a live visit exists, a status edit may not change the appointment. The visit owns the status. | `update`, before `updateMany` at `appointments.service.ts:509` | `patchIgnoresVisit` | `StatusesAgree`, `NoResurrection`, `DisagreementHeals` |
| The same for the bulk update. | `bulkUpdate` at `appointments.service.ts:618` | `bulkIgnoresVisit` | `StatusesAgree`, `NoResurrection`, `DisagreementHeals` |
| A patient is checked in only from `SCHEDULED`, `CONFIRMED` or `NO_SHOW`. | `update` | `checkInFromAnyStatus` | `NoResurrection` |
| An edit to a completed visit writes clinical columns only, never the visit status or the appointment. | `visits.service.ts` `update` at line 475 | `editReopens`, an edit to a completed visit that reopens the visit and its appointment | `EditKeepsCompletion` |

`checkInFromAnyStatus` keeps the visit guard, so its only break is the stale voice check-in that undoes a cancel. `editReopens` moves the appointment back to `IN_PROGRESS` with the visit, so `StatusesAgree` still holds and only `EditKeepsCompletion` breaks. `typeProbe` starts the appointment as `RESCHEDULED`, a value the frontend status registry lists and the enum lacks, and breaks `TypeOK`.

`complete` writing the appointment by id needs no guard of its own in `fixed` or in `code`. With the visit guard, an appointment whose visit is open is always `IN_PROGRESS`, so the unconditional write is safe. A compare-and-set on `IN_PROGRESS` there would be a sound second line of defence.

## Model to code

Paths are under `backend/src/modules/` unless they start with `frontend/`.

| Model | Code |
| --- | --- |
| `DoctorStartsVisit` | `visits/visits.service.ts:74` `create`. Row lock on the appointment at line 129, refuse `CANCELLED` and `COMPLETED` at line 132, refuse a second live visit at line 135, write `IN_PROGRESS` at line 187. |
| `DoctorEditsNotes` | `visits/visits.service.ts:475` `update`, on an open or completed visit. Version compare-and-set at line 533. The data it writes holds clinical columns and `version` only. No visit DTO carries a status. The screen path is the visit form's save in `frontend/src/components/visits/MedicalVisitForm.tsx`, and on a completed visit its Edit visit action. |
| `DoctorCompletesVisit` | `visits/visits.service.ts:578` `complete`. Row lock on the visit at line 580, return early when already `COMPLETED` at line 583, write the appointment `COMPLETED` by id at line 600. |
| `VisitIsDeleted` | `visits/visits.service.ts:618` `remove`. Soft delete and detach at line 630, move `IN_PROGRESS` or `COMPLETED` back to `CHECKED_IN` at line 639. No screen calls it. |
| `DeskCancels` | `appointments/appointments.service.ts:649` `remove`, an `updateMany` to `CANCELLED` filtered by `notIn` `COMPLETED`, `IN_PROGRESS`, `CANCELLED` at line 654. |
| `DeskPlansCheckIn` | `frontend/src/lib/voice-command.ts:292`, the `WAITING` filter in `matchAppointment` |
| `DeskConfirmsCheckIn` | `frontend/src/components/voice/VoiceCommandDialog.tsx:209` sends `PATCH /appointments/:id` with `status: CHECKED_IN`, served by `appointments/appointments.service.ts:478` `update` |
| `DeskSetsStatus` | `appointments/appointments.service.ts:478` `update`. Re-read and compare at line 515, `assertStatusEdit` at line 518, capacity check only when the calendar changes at line 519, compare-and-set on the status read at line 532. Roles ADMIN, DOCTOR, NURSE, RECEPTION. |
| `AdminBulkSets` | `appointments/appointments.service.ts:658` `bulkUpdate`. `assertStatusEdit` on every row at line 670, refuse a row whose new status belongs to a calendar it is not in at line 672, then one `updateMany` that compare-and-sets each row on the status it read at line 675, in a transaction that rolls back unless every row matched. ADMIN only. |
| `CodeAllows` | `appointments/appointments.service.ts:81` `assertStatusEdit` |
| `PatchAllows`, `BulkAllows` | `before` accepts every jump. `code` is `CodeAllows`. `fixed` and its controls use the visit guard. |
| `Reopens` | Only the `editReopens` control. No code reopens a visit. |

## The fix

`code` guards the desk's status writes by the appointment's own status, not by reading the visit. While a live visit exists the appointment is always `IN_PROGRESS` or `COMPLETED`, so the two guards accept the same writes on every reachable state, and TLC confirms `code` holds every rule.

| Guard | Code | Rules |
| --- | --- | --- |
| A status edit never sets `IN_PROGRESS` or `COMPLETED`. Only starting and completing the visit write them. | `backend/src/modules/appointments/appointments.service.ts:86` | `StatusesAgree`, `DisagreementHeals` |
| A status edit never changes an appointment that is `IN_PROGRESS` or `COMPLETED`. | `backend/src/modules/appointments/appointments.service.ts:83` | `StatusesAgree`, `NoResurrection`, `DisagreementHeals` |
| A check-in starts only from `SCHEDULED`, `CONFIRMED` or `NO_SHOW`. | `backend/src/modules/appointments/appointments.service.ts:89` | `NoResurrection` |
| `update` runs these on the status it re-read in the transaction. | `backend/src/modules/appointments/appointments.service.ts:518` | all three above |
| `bulkUpdate` runs them on every row and compare-and-sets each row on the status it read. | `backend/src/modules/appointments/appointments.service.ts:636` and `:639` | all three above |
| An edit to a completed visit writes clinical columns and `version` only, so the visit stays `COMPLETED` with its `completedAt` and the appointment is not written. Prescription saves that carry clinical fields go through the same `update`. | `backend/src/modules/visits/visits.service.ts:532` | `EditKeepsCompletion` |

The status guard also refuses a status edit on an `IN_PROGRESS` or `COMPLETED` appointment that has no visit, which only rows from before the fix can be. It is a product choice: a paper visit is no longer recorded by marking the appointment completed.

## Concurrency

Every server write here is one transaction, guarded by a row lock (`create`, `complete`, `remove` on visits) or a compare-and-set on a read in the same request (`update`, `remove` on appointments). Two requests on these rows therefore serialize, and each server call is one atomic step in the model. The interleavings that matter are between requests, such as the desk acting between the doctor's start and complete. `code` keeps this true. `assertStatusEdit` decides on the status read inside the transaction, and the write compare-and-sets on that status, so a visit that starts, completes or is deleted in between makes the write match no row and fail with 409. `update` on a visit refuses a completion that lands between its read and its write the same way, through the version compare-and-set. The voice check-in is the one real check-then-write across a gap. The dialog reads the list, the desk confirms later, and the PATCH does not say what the dialog saw. The model splits it into two steps for that reason.

## Fairness

None. No step in this lifecycle happens with nobody acting. No timer, cron or reconciler reads or writes either row, and every action is a person's. `Spec == Init /\ [][Next]_vars`. `DisagreementHeals` therefore asks whether the code repairs a disagreement on its own. In `before` it could not. In `code` it holds because no disagreement can arise, as `StatusesAgree` holds.

## Replays

`backend/src/modules/visits/tests/appointment-visit.formal-replay.database.spec.ts` drives the real `AppointmentsService` and `VisitsService` against a private PostgreSQL schema. Each rule that broke in `before` has a test that walks TLC's path and asserts the outcome the rule demands. They pass on the fixed code. The `(screens only)` tests replay the `uiOnly` paths. The voice dialog's client read is replayed as `findOne` returning `SCHEDULED`, the same check `matchAppointment` makes. Each test gets its own doctor so capacity never refuses a write.

`EditKeepsCompletion` never broke in `before`, so its test walks the `editReopens` counterexample instead. The doctor starts the visit, completes it and edits the diagnosis. The test asserts that the new diagnosis is saved, both rows stay `COMPLETED`, and `completedAt` is unchanged.

The liveness replay has no timer to run. After the path it reads the appointment the way the screens do and asserts agreement.

The `DisagreementHeals` path in `results/before.md` is TLC's counterexample with its fingerprint index pinned by `tlc.py`. The doctor starts the visit, the desk changes the appointment's status, and the doctor edits the notes. Before the fix nothing then brought the two rows back into agreement. The replay drives exactly these steps, and the desk's status edit is now refused.

## What the model leaves out

- Calendar capacity, rooms and the doctor-day lock. `verification/appointment-calendars/` covers them. The model assumes every capacity check passes.
- Reschedule and confirm. They only move between `SCHEDULED` and `CONFIRMED` and refuse every other status through `isMovable`.
- Review appointments booked through `review-booking.ts`. They are different appointments.
- Prescriptions and attachments, which block visit delete. The model lets every visit be deleted.
- Google Calendar sync. A status edit to `CANCELLED` patches the event instead of deleting it, which `DELETE` does.
- An appointment marked `COMPLETED` or `IN_PROGRESS` with no visit. A status edit can no longer set either. Rows written that way before the fix stay, and a status edit cannot change them.
- Visits with no appointment.
- Two doctors starting a visit at once. The appointment row lock serializes them, and `lifecycle.database.spec.ts` already proves at most one visit results.
