# Purchase import attempt, before mode

TLC explored 375 states and 909 steps. The chart has 8 states and 12 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| NeverRunningAgain | invariant | holds |
| TerminalStaysTerminal | invariant | holds |
| SavedStaysSaved | invariant | breaks |
| InvoiceRecorded | invariant | holds |
| StockOnce | invariant | holds |
| ResolveAlwaysPossible | invariant | holds |
| RunningSettles | property | holds |

Holds: TypeOK, NeverRunningAgain, TerminalStaysTerminal, InvoiceRecorded, StockOnce, ResolveAlwaysPossible, RunningSettles.

## SavedStaysSaved breaks

An import that saved a draft bill keeps saying so.

1. No import yet
2. the upload registers the import: Import running
3. OCR reads the bill: Import running
4. the worker saves the draft bill: Draft bill saved
5. a manager recovers it with another bill's original open: Intake blocked after a saved bill
