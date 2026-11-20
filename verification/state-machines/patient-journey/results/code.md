# A patient's day: desk, doctor, pharmacy, code mode

TLC explored 80 states and 131 steps. The chart has 7 states and 13 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| CalendarFollowsVisit | invariant | holds |
| CompletedOnlyAfterVisit | invariant | holds |
| VisitStartsFromOpenBooking | invariant | holds |
| NoOrphanPrescription | invariant | holds |
| BillOnlyForActivePrescription | invariant | holds |
| BilledPrescriptionStaysActive | invariant | holds |
| DispensedOnlyWhenBilled | invariant | holds |
| PatientLeavesServed | property | holds |

Holds: TypeOK, CalendarFollowsVisit, CompletedOnlyAfterVisit, VisitStartsFromOpenBooking, NoOrphanPrescription, BillOnlyForActivePrescription, BilledPrescriptionStaysActive, DispensedOnlyWhenBilled, PatientLeavesServed.
