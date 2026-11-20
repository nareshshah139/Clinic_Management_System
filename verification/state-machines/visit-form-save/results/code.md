# Visit form saving, code mode

TLC explored 29899 states and 108042 steps. The chart has 8 states and 26 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| OneVisit | invariant | breaks |
| NoSelfConflict | invariant | breaks |
| LatchAgrees | invariant | breaks |
| SavedMeansSaved | invariant | holds |
| LeavesSaving | property | holds |

Holds: TypeOK, SavedMeansSaved, LeavesSaving.

## OneVisit breaks

One consultation creates at most one visit.

1. New visit, not created yet
2. you press Save Draft: New visit, not created yet
3. Save Draft sends: New visit, not created yet
4. you press Create Prescription: New visit, not created yet
5. the prescription save sends: New visit, not created yet
6. the server applies Save Draft: Shows Saving
7. the server applies the prescription save: Two visits created

## NoSelfConflict breaks

The form reports a conflict only when someone else changed the visit.

1. Shows Saved
2. you edit the visit: Shows Unsaved changes
3. autosave sends: Shows Saving
4. you press Create Prescription: Shows Saving
5. the prescription save sends: Shows Saving
6. the server applies autosave: Shows Saving
7. the server applies the prescription save: Shows Saving
8. the prescription save's reply arrives: Conflict notice, shows Save failed

## LatchAgrees breaks

While a conflict is latched, the indicator says Save failed.

1. Shows Saved
2. you edit the visit: Shows Unsaved changes
3. autosave sends: Shows Saving
4. you press Create Prescription: Shows Saving
5. the prescription save sends: Shows Saving
6. the server applies autosave: Shows Saving
7. the server applies the prescription save: Shows Saving
8. the prescription save's reply arrives: Conflict notice, shows Save failed
9. autosave's reply arrives: Conflict notice, shows no failure
