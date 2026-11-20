# A patient's day: desk, doctor, pharmacy, code mode

TLC explored 331 states and 1112 steps. The chart has 10 states and 30 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| CalendarFollowsVisit | invariant | breaks |
| CompletedOnlyAfterVisit | invariant | breaks |
| VisitStartsFromOpenBooking | invariant | holds |
| NoOrphanPrescription | invariant | holds |
| BillOnlyForActivePrescription | invariant | holds |
| BilledPrescriptionStaysActive | invariant | breaks |
| DispensedOnlyWhenBilled | invariant | holds |
| PatientLeavesServed | property | breaks |

Holds: TypeOK, VisitStartsFromOpenBooking, NoOrphanPrescription, BillOnlyForActivePrescription, DispensedOnlyWhenBilled.

## CalendarFollowsVisit breaks

While the doctor has the visit, the calendar shows the patient in consultation, and once the visit is completed it shows completed.

1. Booked for today
2. the doctor starts the visit: With the doctor
3. the desk checks the patient in: Calendar shows something else while the doctor has the visit

## CompletedOnlyAfterVisit breaks

The calendar shows an appointment completed only when its visit is completed.

1. Booked for today
2. the desk marks the appointment completed: Calendar says completed, patient never seen

## BilledPrescriptionStaysActive breaks

Once medicines are billed against a prescription, the prescription is not cancelled.

1. Booked for today
2. the doctor starts the visit: With the doctor
3. the doctor writes the prescription: With the doctor
4. the pharmacist bills the medicines: With the doctor
5. the doctor cancels the prescription: Medicines billed, then the prescription cancelled

## PatientLeavesServed breaks

A patient who has arrived either leaves with the visit completed and the medicines billed, or is turned away by a cancellation.

1. Booked for today
2. the desk checks the patient in: Checked in, waiting for the doctor
3. the doctor starts the visit: With the doctor
4. the doctor deletes the visit: Checked in, waiting for the doctor
5. the desk marks the appointment completed: Calendar says completed, patient never seen
From step 4 the system can repeat these steps, or stop here, forever.
