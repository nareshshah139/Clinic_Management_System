# Pharmacy counter dispense task, before mode

TLC explored 4760 states and 11536 steps. The chart has 12 states and 28 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| PaidNeedsBill | invariant | breaks |
| FinishedStaysFinished | invariant | breaks |
| DispensedStaysDispensed | invariant | breaks |
| ReadyMeansReviewed | invariant | holds |
| StatusHasTimestamp | invariant | breaks |
| BillShowsDone | property | breaks |

Holds: TypeOK, ReadyMeansReviewed.

## PaidNeedsBill breaks

A task is saved as Paid only when a posted bill exists for its prescription.

1. Waiting in the queue
2. you open the prescription: Open at the counter
3. YouRequestStatus: Open at the counter
4. you mark paid: Paid, with no bill

## FinishedStaysFinished breaks

Once the counter shows a task as Paid, Dispensed or Cancelled, it never shows it open again.

1. Waiting in the queue
2. you open the prescription: Open at the counter
3. YouRequestStatus: Open at the counter
4. an API call cancels: Cancelled
5. YouRequestStatus: Cancelled
6. you open it for review: Open again after it was paid or cancelled

## DispensedStaysDispensed breaks

Once the counter shows a prescription as Dispensed, it keeps showing Dispensed.

1. Waiting in the queue
2. you open the prescription: Open at the counter
3. the bill posts: Dispensed
4. YouRequestStatus: Dispensed
5. an API call cancels: Billed, but the counter shows Cancelled

## StatusHasTimestamp breaks

A task in a status that has a timestamp column has that timestamp set.

1. Waiting in the queue
2. the bill posts: Billed before anyone opened it
3. you open the prescription: Dispensed, with no dispensed time

## BillShowsDone breaks

Once the bill posts, the queue lists the prescription under Done with nobody acting.

1. Waiting in the queue
2. you open the prescription: Open at the counter
3. you reset the medicine: Open at the counter
4. the bill posts: Dispensed
5. YouRequestStatus: Dispensed
6. you pause: Dispensed
7. YouRequestStatus: Dispensed
8. you mark paid: Billed, but the counter shows Paid
9. YouRequestStatus: Billed, but the counter shows Paid
10. an API call cancels: Billed, but the counter shows Cancelled
From step 10 the system can repeat these steps, or stop here, forever.

## Steps the chart hides

YouRequestStatus
