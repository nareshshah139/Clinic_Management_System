# Appointment and its visit, before mode

TLC explored 156 states and 2060 steps. The chart has 8 states and 27 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| StatusesAgree | invariant | breaks |
| NoResurrection | invariant | breaks |
| CompletedVisitFrozen | invariant | breaks |
| DisagreementHeals | property | breaks |

Holds: TypeOK.

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

## CompletedVisitFrozen breaks

A completed visit's clinical notes stay as they were when the doctor completed it.

1. Waiting, no visit
2. the doctor starts the visit: Visit open
3. the doctor completes the visit: Visit completed
4. the doctor edits the notes: Completed visit's notes changed

## DisagreementHeals breaks

When the appointment and its visit disagree, the system brings them back into agreement by itself.

1. Waiting, no visit
2. the doctor starts the visit: Visit open
3. the desk edits the status: Visit open, appointment shows otherwise
4. the doctor edits the notes: Visit open, appointment shows otherwise
From step 4 the system can repeat these steps, or stop here, forever.
