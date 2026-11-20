# Prescription pad save with an idempotency key, code mode

TLC explored 28529 states and 75339 steps. The chart has 9 states and 15 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| OnePrescriptionPerIssue | invariant | breaks |
| NoStaleReplay | invariant | breaks |
| NoFailureStored | invariant | holds |
| BrowserLeavesSaving | property | holds |

Holds: TypeOK, NoFailureStored, BrowserLeavesSaving.

## OnePrescriptionPerIssue breaks

One prescription the doctor saves creates at most one visit and one prescription, however often the browser retries.

1. Doctor writing
2. the doctor saves a new prescription: Saving
3. the save times out after 30 seconds: Saving
4. the server checks the key: Saving
5. the server creates a visit and prescription: Saving
6. the server checks the key: Saving
7. the server creates a visit and prescription: Saving, two prescriptions for one save

## NoStaleReplay breaks

Saving a new prescription never answers with an earlier prescription.

1. Doctor writing
2. the doctor saves a new prescription: Saving
3. the server checks the key: Saving
4. the server creates a visit and prescription: Saving
5. the screen shows the server's answer: Saved
6. the doctor saves a new prescription: Saving
7. the server stores the response: Saving
8. the server checks the key: Saving
9. the screen shows the server's answer: Saved, an old prescription shown as new
