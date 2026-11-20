# Prescriptions, refills and template review, fixed mode

TLC explored 1260 states and 2298 steps. The chart has 6 states and 8 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| AtMostOnePendingRefill | invariant | holds |
| RefillsWithinAllowance | invariant | holds |
| NoApprovalOnClosedPrescription | invariant | holds |
| BillsWithinAllowance | invariant | holds |
| CompletedStaysCompleted | invariant | holds |
| CancelledStaysCancelled | invariant | holds |
| StrandedRequestsClose | property | holds |
| OneDecision | invariant | holds |
| DecidedStaysDecided | invariant | holds |
| DecisionRecorded | invariant | holds |

Holds: TypeOK, AtMostOnePendingRefill, RefillsWithinAllowance, NoApprovalOnClosedPrescription, BillsWithinAllowance, CompletedStaysCompleted, CancelledStaysCancelled, StrandedRequestsClose, OneDecision, DecidedStaysDecided, DecisionRecorded.
