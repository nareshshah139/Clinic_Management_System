# Prescriptions, refills and template review, code mode

TLC explored 1417 states and 2577 steps. The chart has 7 states and 12 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| AtMostOnePendingRefill | invariant | holds |
| RefillsWithinAllowance | invariant | holds |
| NoApprovalOnClosedPrescription | invariant | holds |
| BillsWithinAllowance | invariant | breaks |
| CompletedStaysCompleted | invariant | holds |
| CancelledStaysCancelled | invariant | holds |
| StrandedRequestsClose | property | holds |
| OneDecision | invariant | holds |
| DecidedStaysDecided | invariant | holds |
| DecisionRecorded | invariant | holds |

Holds: TypeOK, AtMostOnePendingRefill, RefillsWithinAllowance, NoApprovalOnClosedPrescription, CompletedStaysCompleted, CancelledStaysCancelled, StrandedRequestsClose, OneDecision, DecidedStaysDecided, DecisionRecorded.

## BillsWithinAllowance breaks

Pharmacy bills on a prescription never exceed the first fill plus its approved refills.

1. Prescription active
2. the pharmacist posts a bill: Prescription active
3. the pharmacist's bill is posted: Prescription active
4. the pharmacist posts a bill: Prescription active
5. the pharmacist's bill is posted: Billed past what the doctor allowed
