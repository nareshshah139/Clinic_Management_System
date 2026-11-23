# Shortbook, purchase order and receipt, code mode

TLC explored 111498 states and 476358 steps. The chart has 9 states and 13 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| StaleNeverWrites | invariant | holds |
| PostedOnce | invariant | holds |
| TerminalStaysTerminal | invariant | holds |
| ShortbookFollowsOrder | invariant | holds |
| RequestsFinish | property | holds |

Holds: TypeOK, StaleNeverWrites, PostedOnce, TerminalStaysTerminal, ShortbookFollowsOrder, RequestsFinish.
