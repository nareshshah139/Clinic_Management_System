# Inventory document outcome, fixed mode

TLC explored 13799 states and 67007 steps. The chart has 7 states and 14 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| PostedOnce | invariant | holds |
| OneDocument | invariant | holds |
| KnownMeansSettled | invariant | holds |
| NoSubmitWhileUnknown | invariant | holds |
| BusyEndsIfAnswered | property | holds |
| BusyEnds | property | holds |

Holds: TypeOK, PostedOnce, OneDocument, KnownMeansSettled, NoSubmitWhileUnknown, BusyEndsIfAnswered, BusyEnds.
