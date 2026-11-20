# Pharmacy counter dispense task, fixed mode

TLC explored 266 states and 907 steps. The chart has 5 states and 6 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| PaidNeedsBill | invariant | holds |
| FinishedStaysFinished | invariant | holds |
| DispensedStaysDispensed | invariant | holds |
| ReadyMeansReviewed | invariant | holds |
| StatusHasTimestamp | invariant | holds |
| BillShowsDone | property | holds |

Holds: TypeOK, PaidNeedsBill, FinishedStaysFinished, DispensedStaysDispensed, ReadyMeansReviewed, StatusHasTimestamp, BillShowsDone.

## Steps the chart hides

YouRequestStatus
