# Inventory document outcome, code mode

TLC explored 13799 states and 59589 steps. The chart has 7 states and 14 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| PostedOnce | invariant | holds |
| OneDocument | invariant | holds |
| KnownMeansSettled | invariant | holds |
| NoSubmitWhileUnknown | invariant | holds |
| BusyEndsIfAnswered | property | holds |
| BusyEnds | property | breaks |

Holds: TypeOK, PostedOnce, OneDocument, KnownMeansSettled, NoSubmitWhileUnknown, BusyEndsIfAnswered.

## BusyEnds breaks

Even if the server never answers, the editor stops being busy, so Check saved status works.

1. New draft, not saved
2. you reload the page: New draft, not saved
3. you save the new draft: Outcome not confirmed, waiting
From step 3 the system can repeat these steps, or stop here, forever.
