# Stock count sheet autosave, fixed mode

TLC explored 743 states and 1847 steps. The chart has 6 states and 21 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| SavedMeansSaved | invariant | holds |
| NoDropOnLeave | invariant | holds |
| OneSaveAtATime | invariant | holds |
| LeavesSaving | property | holds |
| SaveRequestEnds | property | holds |

Holds: TypeOK, SavedMeansSaved, NoDropOnLeave, OneSaveAtATime, LeavesSaving, SaveRequestEnds.
