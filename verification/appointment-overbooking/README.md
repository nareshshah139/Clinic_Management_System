# Appointment overbooking verification

A doctor can allow up to `maxBookingsPerSlot` patients (1 to 5) in one time slot. The default of 1 keeps one patient per slot. `Overbooking.tla` models receptionists who book the same slot at the same moment. TLC checks that the slot never holds more patients than the limit, and that a patient is booked into an occupied slot only after an explicit request to overbook.

Run the check:

```sh
python3 verification/appointment-overbooking/verify.py --jar /path/to/tla2tools.jar
```

The runner accepts only tla2tools v1.7.4 (it checks the SHA-256). It runs 9 cases. The correct protocol passes for limits 1, 2 and 3. Three broken variants, the negative controls, must fail on the expected property. A negative control that passes means the model no longer detects that bug, and the run fails. CI runs the same command in `.github/workflows/appointment-overbooking-formal.yml`.

## Model to code

Line numbers refer to `backend/src/modules/appointments/appointments.service.ts` at the time of this change. Search for the function name if they drift.

| Model | Code |
| --- | --- |
| `Requests` | Concurrent calls to `create` or `reschedule`. Each runs in its own `prisma.$transaction`. |
| `Acquire(r)` and the `lock` variable | `lockSchedule`. It takes `pg_advisory_xact_lock` on the doctor-day key, then on the room-day key when a room is set. In `create`, `reschedule` and `update` it is the first statement of the transaction. |
| `Count(r)` and `seen[r]` | `assertSlotBookable` calls `checkSchedulingConflicts` with the transaction client. `booked` is the number of the doctor's non-cancelled appointments that overlap the slot. A reschedule excludes the appointment being moved. |
| `Limit` | `tx.user.findUnique(... maxBookingsPerSlot)`, read inside the same transaction and parsed by `slotLimit` in `doctor-availability/availability.ts`. A value outside 1..5 reads as 1. |
| `AsksToOverbook` | The optional boolean `allowOverbook` on `CreateAppointmentDto` and `RescheduleAppointmentDto`. The UI sends it only after the user confirms the "book anyway" dialog. |
| `Accepts(r, count)` | `acceptsBooking`: `booked === 0 \|\| (booked < limit && allowOverbook)`. |
| `Decide(r)`, booked branch | `assertSlotBookable` returns and the transaction writes the appointment. |
| `Decide(r)`, refused branch | `ConflictException` with `overbook: { allowed, booked, limit }`. The transaction ends and Postgres releases the lock. |
| `WithinLimit` | Exercised against Postgres by `tests/appointments.overbooking.database.spec.ts`: six simultaneous requests at limit 2 leave exactly two bookings. |
| `NoAccidentalOverbook` | Exercised by `appointments.overbooking.spec.ts`: every combination of limit 1-3, 0-3 existing bookings and the flag, for create and reschedule. |

The negative controls match real mistakes:

- `nolock` drops `lockSchedule`. TLC reports `WithinLimit` violated.
- `countOutsideLock` counts before taking the lock. TLC reports `WithinLimit` violated.
- `ignoreFlag` books into an occupied slot without `allowOverbook`. TLC reports `NoAccidentalOverbook` violated for limit 2. With limit 1 nothing can overbook, so that case must pass.

The Postgres spec bites on the first two as well. With `lockSchedule` moved after the count, or removed, six simultaneous requests at limit 2 produce six or three bookings and the spec fails.

## Assumptions

- `pg_advisory_xact_lock` gives mutual exclusion per key and holds the lock until the transaction commits or rolls back. The model's single `lock` variable stands for the doctor-day key. Two requests for the same doctor and day always use the same key, because the key is built from the branch, doctor and date strings.
- Counting is conservative. Every booking that overlaps the requested slot counts, even if those bookings do not overlap each other. The model treats all requests as the same slot, so the count it checks is never lower than the code's count. The number of patients the doctor sees at one moment therefore never exceeds the limit.
- The limit is read inside the transaction, after the lock. A limit change that commits during a booking is seen either before or after it. Both values were valid at some point, so the booking is correct for one of them.
- Lowering the limit does not cancel appointments already booked. A slot can hold more patients than a new, lower limit until those appointments end or are cancelled. New bookings into that slot are refused.
- Postgres runs these transactions at its default isolation level, READ COMMITTED. Each statement takes a fresh snapshot, so the count, which runs after the lock is granted, sees every booking committed before the lock. Under REPEATABLE READ or SERIALIZABLE, the snapshot would date from the lock statement, taken before waiting, and the count could miss a booking. Changing the isolation level would invalidate this model.
- `update` re-checks the slot when an appointment changes room or leaves `CANCELLED`. Un-cancelling is checked like a new booking without `allowOverbook`, so it never overbooks. A room change on an active appointment leaves the doctor's load unchanged, so it checks only the room.
- Rooms are never overbooked. A room clash refuses the request with `overbook.allowed = false`, whatever the doctor's limit.
- The model has four requests and limits up to 3. It does not cover cancellation or token numbering. Un-cancelling and room changes are covered by `tests/appointments.overbooking.database.spec.ts`. A separate Postgres spec covers tokens (`tests/appointments.token.database.spec.ts`).
