# Prescriptions, refills and template review, code mode

TLC explored 1815 states and 3283 steps. The chart has 12 states and 24 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| AtMostOnePendingRefill | invariant | holds |
| RefillsWithinAllowance | invariant | holds |
| NoApprovalOnClosedPrescription | invariant | holds |
| BillsWithinAllowance | invariant | breaks |
| CompletedStaysCompleted | invariant | breaks |
| CancelledStaysCancelled | invariant | holds |
| StrandedRequestsClose | property | breaks |
| OneDecision | invariant | breaks |
| DecidedStaysDecided | invariant | breaks |
| DecisionRecorded | invariant | breaks |

Holds: TypeOK, AtMostOnePendingRefill, RefillsWithinAllowance, NoApprovalOnClosedPrescription, CancelledStaysCancelled.

## BillsWithinAllowance breaks

Pharmacy bills on a prescription never exceed the first fill plus its approved refills.

1. Prescription active
2. the pharmacist posts a bill: Prescription active
3. the pharmacist's bill is posted: Prescription active
4. the pharmacist posts a bill: Prescription active
5. the pharmacist's bill is posted: Billed past what the doctor allowed

## CompletedStaysCompleted breaks

A completed prescription stays completed.

1. Prescription active
2. the doctor marks it completed: Prescription active
3. the doctor's 'completed' is saved: Prescription closed
4. the doctor cancels the prescription: Prescription closed
5. the doctor's cancellation is saved: Cancelled after it was completed

## StrandedRequestsClose breaks

A refill request on a completed or cancelled prescription does not stay waiting forever.

1. Prescription active
2. the desk asks for a refill: Prescription active
3. the desk's refill request is saved: Refill request waiting for the doctor
4. the doctor marks it completed: Refill request waiting for the doctor
5. the doctor's 'completed' is saved: Closed, a refill request still waiting
6. the desk asks for a refill: Closed, a refill request still waiting
7. the server turns down the refill request: Closed, a refill request still waiting
8. the desk asks for a refill: Closed, a refill request still waiting
9. the server turns down the refill request: Closed, a refill request still waiting
10. the valid-until date passes: Closed, a refill request still waiting
11. the pharmacist posts a bill: Closed, a refill request still waiting
12. the server turns down the bill: Closed, a refill request still waiting
From step 12 the system can repeat these steps, or stop here, forever.

## OneDecision breaks

A template version gets at most one review decision on record.

1. Version waiting for review
2. a reviewer approves the version: Version waiting for review
3. a reviewer approves the version: Version waiting for review
4. a reviewer's approval is saved: Version decided
5. the review record is saved: Version decided
6. a reviewer's approval is saved: Version decided
7. the review record is saved: Version reviewed twice

## DecidedStaysDecided breaks

Once a template version is approved or rejected, its status does not change.

1. Version waiting for review
2. a reviewer approves the version: Version waiting for review
3. a reviewer rejects the version: Version waiting for review
4. a reviewer's approval is saved: Version decided
5. a reviewer's rejection is saved: Second reviewer overwrote the decision

## DecisionRecorded breaks

An approved or rejected template version has a review record that says so.

1. Version waiting for review
2. a reviewer approves the version: Version waiting for review
3. a reviewer's approval is saved: Version decided
4. saving the review record fails: Version decided with no review record
