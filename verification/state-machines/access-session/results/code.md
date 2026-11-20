# Staff account and session, code mode

TLC explored 462 states and 2358 steps. The chart has 4 states and 7 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| ColumnsAgree | invariant | holds |
| NoAccessWhileSuspended | invariant | holds |
| RoleIsCurrent | invariant | holds |
| ResetEndsOldSessions | invariant | holds |
| NoResetWhileSuspended | invariant | holds |
| SessionsEnd | property | holds |
| AccessEnds | property | holds |

Holds: TypeOK, ColumnsAgree, NoAccessWhileSuspended, RoleIsCurrent, ResetEndsOldSessions, NoResetWhileSuspended, SessionsEnd, AccessEnds.
