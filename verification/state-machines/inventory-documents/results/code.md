# Shortbook, purchase order and receipt, code mode

TLC explored 145598 states and 622210 steps. The chart has 10 states and 17 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| StaleNeverWrites | invariant | holds |
| PostedOnce | invariant | holds |
| TerminalStaysTerminal | invariant | holds |
| ShortbookFollowsOrder | invariant | breaks |
| RequestsFinish | property | holds |

Holds: TypeOK, StaleNeverWrites, PostedOnce, TerminalStaysTerminal, RequestsFinish.

## ShortbookFollowsOrder breaks

A shortbook never shows ordered or received while its order is cancelled or rejected.

1. Shortbook open
2. staff send a request: Shortbook open
3. staff make the order from the shortbook: Order drafted
4. staff send a request: Order drafted
5. staff cancel the order: Order closed, shortbook still ordered
