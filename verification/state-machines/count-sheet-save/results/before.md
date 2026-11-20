# Stock count sheet autosave, before mode

TLC explored 632 states and 1212 steps. The chart has 9 states and 26 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| SavedMeansSaved | invariant | breaks |
| NoDropOnLeave | invariant | breaks |
| OneSaveAtATime | invariant | holds |
| LeavesSaving | property | breaks |
| SaveRequestEnds | property | breaks |

Holds: TypeOK, OneSaveAtATime.

## SavedMeansSaved breaks

The sheet says Saved only when no typed count is waiting to be sent or still on its way.

1. Shows Saved, all sent
2. you type a count: Shows Saved, bad count typed

## NoDropOnLeave breaks

Leaving the sheet never throws away a typed count that was never sent.

1. Shows Saved, all sent
2. you type a count: Shows Saved, count waiting
3. you go back to the list: Sheet closed, a count was lost

## LeavesSaving breaks

Given the server answers, the sheet stops saying Saving with no user action.

1. Shows Saved, all sent
2. another window saves: Shows Saved, all sent
3. you type a count: Shows Saved, count waiting
4. the sheet saves: Shows Saving, request out
5. the server answers: Shows Saving, count waiting
6. the sheet reloads: Shows Saved, all sent
7. you type a count: Shows Saved, count waiting
8. the sheet saves: Shows Saving, request out
9. you type a count: Shows Saving, request out
10. the server answers: Shows Saving, bad count typed
11. the sheet saves: Shows Saving, bad count typed
From step 11 the system can repeat these steps, or stop here, forever.

## SaveRequestEnds breaks

A save request the server never answers still ends with no user action, so later counts can be sent.

1. Shows Saved, all sent
2. another window saves: Shows Saved, all sent
3. you type a count: Shows Saved, bad count typed
4. you type a count: Shows Saved, count waiting
5. you type a count: Shows Saved, count waiting
6. the sheet saves: Shows Saving, request out
7. you go back to the list: Sheet closed
From step 7 the system can repeat these steps, or stop here, forever.
