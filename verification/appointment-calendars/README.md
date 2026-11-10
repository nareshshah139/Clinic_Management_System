# Scheduled and Confirmed calendars

A doctor's day has two calendars.

- **Scheduled** holds patients booked ahead who still need a confirmation call on the day.
- **Confirmed** holds patients confirmed for the day, walk-ins, and everyone whose visit has started.

The reception desk works down the Scheduled calendar on the morning of the visit. When a patient confirms on the call, one click moves them to Confirmed at the same time, or at a new time agreed on the call. The doctor's real day is the Confirmed calendar.

## Domain

The calendar is derived from the appointment status. There is no second field to keep in sync.

| Status | Calendar |
| --- | --- |
| `SCHEDULED` | Scheduled |
| `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, `NO_SHOW` | Confirmed |
| `CANCELLED` | none |

`backend/src/modules/appointments/appointment-calendar.ts` owns this table. The doctor-schedule endpoint returns each appointment's `calendar`, so the UI never re-derives it.

Each calendar has its own capacity. A booking or move counts only the appointments in its target calendar, under the doctor's `maxBookingsPerSlot` and the existing overbook rules. A patient waiting for a call therefore never blocks a confirmed patient's time. On the call, a confirmation into a taken time is refused like any other booking, and the receptionist picks another time or overbooks.

## Transitions

| Action | From | To | Capacity check | Endpoint |
| --- | --- | --- | --- | --- |
| Book | new | `SCHEDULED` or `CONFIRMED` | target calendar | `POST /appointments` with `calendar` |
| Confirm | `SCHEDULED` | `CONFIRMED` | Confirmed | `POST /appointments/:id/reschedule` with `calendar: CONFIRMED` |
| Move back to Scheduled | `CONFIRMED` | `SCHEDULED` | Scheduled | same, `calendar: SCHEDULED` |
| Change time | `SCHEDULED` or `CONFIRMED` | status of the target calendar | target calendar | same, new `slot` or `date` |
| Status edit | any | any | target calendar when the calendar changes or a cancelled appointment comes back | `PATCH /appointments/:id` |
| Start visit | `SCHEDULED` or `CONFIRMED` | `IN_PROGRESS` | none, the patient is present | visits |
| Cancel | not `COMPLETED`, `IN_PROGRESS` or `CANCELLED` | `CANCELLED` | none | `DELETE /appointments/:id` |

A reschedule without `calendar` lands in Scheduled, so a patient moved to another day needs a fresh confirmation call. Bulk updates may not set `SCHEDULED` or `CONFIRMED`, because those moves need the capacity check.

## What the model checks

`AppointmentCalendars.tla` runs two concurrent requests over every starting placement of three appointments in two slots and both calendars. Each request is a book, place (confirm, move back, change time), cancel, or arrival. TLC checks:

- `WithinLimit`. Booked patients never exceed the limit in either calendar. A scheduled patient who walks in and starts a visit is outside the count.
- `NoAccidentalOverbook`. Only a request that asked to overbook lands in an occupied slot.
- `NoResurrection`. A cancelled appointment stays cancelled, even when a confirm races the cancel.
- `NoDemotion`. Once a visit starts, the appointment never returns to Scheduled or Confirmed.
- `RetryIsHarmless`. Repeating a confirm or move that already took effect succeeds.
- `AllFinish`. Every request completes.

Run it:

```sh
python3 verification/appointment-calendars/verify.py --jar /path/to/tla2tools.jar
```

The runner accepts only tla2tools v1.7.4. The correct protocol passes at limits 1 and 2. Each negative control matches a real mistake and must fail:

| Mode | Mistake | Fails |
| --- | --- | --- |
| `noTargetCheck` | A status edit moves an appointment between calendars without a capacity check. `PATCH` did this before this change. | `WithinLimit`, or `NoAccidentalOverbook` at limit 2 |
| `countSourceCalendar` | The capacity check counts the calendar the appointment leaves instead of the one it enters. | `WithinLimit` |
| `countOutsideLock` | The count happens before the doctor-day lock. | `WithinLimit` |
| `noCAS` | The write does not compare the status and slot it read. `reschedule` and `remove` did this before this change. | `NoResurrection` or `NoDemotion`, whichever TLC reaches first. With `NoDemotion` removed, `NoResurrection` still fails. |
| `noNoop` | A request that already took effect is checked again. | `RetryIsHarmless` |

## Model to code

| Model | Code |
| --- | --- |
| `CalendarOf`, `EntryStatus` | `appointment-calendar.ts` |
| `lock`, `Acquire` | `lockSchedule`, the first statement of the transaction in `create`, `reschedule` and `update` |
| `Read`, `Observe` | the appointment re-read inside the transaction, and `checkSchedulingConflicts` restricted to the target calendar |
| `Satisfied`, the `done` branch of `Decide` | `reschedule` returns the appointment unchanged when it is already in the target calendar, date, slot and room |
| `Write` compare-and-set | `updateMany` filtered by the id, status, date and slot read in the transaction; zero rows is a 409 |
| cancel compare-and-set | `remove` uses `updateMany` filtered by the cancellable statuses |
| arrival | `visits.service.ts` sets `IN_PROGRESS` when a visit starts |

## Bounds and assumptions

- Two concurrent requests. Three-way races reduce to pairs here because every request takes the same doctor-day lock or writes one row with a compare-and-set.
- Slots are disjoint in the model. Overlap arithmetic is `SchedulingUtils.doTimeSlotsOverlap`, covered by its unit tests.
- Room locks are outside the model. Room conflicts follow the same calendar rule as doctor conflicts.
- `PATCH /appointments/:id` status edits are outside the model. They check capacity whenever the calendar changes, including a scheduled patient set to `CHECKED_IN`. They do not refuse a demotion such as `IN_PROGRESS` back to `SCHEDULED`. No screen sends one, and `main` allowed the same.
- `NO_SHOW` and later statuses cannot be moved. The UI offers Reschedule only for `SCHEDULED` and `CONFIRMED`. Rebooking a no-show is a new booking.
- `pg_advisory_xact_lock` gives mutual exclusion per key until commit or rollback.
