# Purchase import attempt, fixed mode

TLC explored 231 states and 509 steps. The chart has 7 states and 10 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| NeverRunningAgain | invariant | holds |
| TerminalStaysTerminal | invariant | holds |
| SavedStaysSaved | invariant | holds |
| InvoiceRecorded | invariant | holds |
| StockOnce | invariant | holds |
| ResolveAlwaysPossible | invariant | holds |
| RunningSettles | property | holds |

Holds: TypeOK, NeverRunningAgain, TerminalStaysTerminal, SavedStaysSaved, InvoiceRecorded, StockOnce, ResolveAlwaysPossible, RunningSettles.
