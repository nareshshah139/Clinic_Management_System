# Pharmacy agent run and proposal review, fixed mode

TLC explored 161 states and 418 steps. The chart has 6 states and 9 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| AppliedOnce | invariant | holds |
| DecisionIsFinal | invariant | holds |
| RejectedMeansNotApplied | invariant | holds |
| StatusesAgree | invariant | holds |
| NoChangesMeansNoChanges | invariant | holds |
| RunEndsOnce | invariant | holds |
| RunLeavesRunning | property | holds |
| ApplyingEnds | property | holds |

Holds: TypeOK, AppliedOnce, DecisionIsFinal, RejectedMeansNotApplied, StatusesAgree, NoChangesMeansNoChanges, RunEndsOnce, RunLeavesRunning, ApplyingEnds.
