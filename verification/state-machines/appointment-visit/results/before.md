# Appointment and its visit, before mode

TLC explored 130 states and 1693 steps. The chart has 7 states and 21 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| StatusesAgree | invariant | breaks |
| NoResurrection | invariant | breaks |
| EditKeepsCompletion | property | holds |
| DisagreementHeals | property | breaks |

Holds: TypeOK, EditKeepsCompletion.

## StatusesAgree breaks

While a visit is open the appointment shows in progress, and once the visit is completed the appointment shows completed.

1. Waiting, no visit
2. the doctor starts the visit: Visit open
3. the desk edits the status: Visit open, appointment shows otherwise

## NoResurrection breaks

A cancelled appointment stays cancelled until someone looking at it as cancelled brings it back.

1. Waiting, no visit
2. the doctor starts the visit: Visit open
3. the desk edits the status: Visit open, appointment shows otherwise
4. the doctor completes the visit: Cancelled appointment back in use

## DisagreementHeals breaks

When the appointment and its visit disagree, the system brings them back into agreement by itself.

1. Waiting, no visit
2. the doctor starts the visit: Visit open
3. the desk edits the status: Visit open, appointment shows otherwise
4. the doctor edits the notes: Visit open, appointment shows otherwise
From step 4 the system can repeat these steps, or stop here, forever.
