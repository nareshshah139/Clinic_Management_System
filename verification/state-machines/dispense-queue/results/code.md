# Pharmacy counter dispense task, code mode

TLC explored 290 states and 955 steps. The chart has 5 states and 6 arrows.

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
