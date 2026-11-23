# Prescription pad save with an idempotency key, code mode

TLC explored 3434 states and 7503 steps. The chart has 4 states and 5 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| OnePrescriptionPerIssue | invariant | holds |
| NoStaleReplay | invariant | holds |
| NoFailureStored | invariant | holds |
| BrowserLeavesSaving | property | holds |

Holds: TypeOK, OnePrescriptionPerIssue, NoStaleReplay, NoFailureStored, BrowserLeavesSaving.
