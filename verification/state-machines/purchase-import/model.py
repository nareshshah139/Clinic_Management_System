SPEC = "PurchaseImport.tla"
CONSTANTS = {"Workers": "{w1, w2}"}
MODES = {
    "before": {"MODE": '"before"'},
    "code": {"MODE": '"code"'},
    "fixed": {"MODE": '"fixed"'},
    "typeProbe": {"MODE": '"typeProbe"'},
    "noClaim": {"MODE": '"noClaim"'},
    "bindOutsideTx": {"MODE": '"bindOutsideTx"'},
    "finalizeByIdOnly": {"MODE": '"finalizeByIdOnly"'},
    "checkOutsideTx": {"MODE": '"checkOutsideTx"'},
    "retryReregisters": {"MODE": '"retryReregisters"'},
    "resolveRefusesRunning": {"MODE": '"resolveRefusesRunning"'},
    "noFinalizeOnError": {"MODE": '"noFinalizeOnError"'},
}
RULES = {
    "TypeOK": "invariant",
    "NeverRunningAgain": "invariant",
    "TerminalStaysTerminal": "invariant",
    "SavedStaysSaved": "invariant",
    "InvoiceRecorded": "invariant",
    "StockOnce": "invariant",
    "ResolveAlwaysPossible": "invariant",
    "RunningSettles": "property",
}
RULE_TEXT = {
    "TypeOK": "Every variable holds a value of its type.",
    "NeverRunningAgain": "Once an import attempt leaves RUNNING it never returns to RUNNING.",
    "TerminalStaysTerminal": "A stopped or rejected import keeps its outcome, so a late worker cannot overwrite it.",
    "SavedStaysSaved": "An import that saved a draft bill keeps saying so.",
    "InvoiceRecorded": "A bill the worker saved is recorded on the attempt, so the attempt never says no stock while that bill exists.",
    "StockOnce": "The saved bill adds stock at most once.",
    "ResolveAlwaysPossible": "While an import is running, the pharmacist can always stop it.",
    "RunningSettles": "Unless the worker process dies, a running import leaves RUNNING with nobody acting.",
}
ALL = list(RULES)
EXPECT = {
    "before": {**{r: "holds" for r in ALL}, "SavedStaysSaved": "breaks"},
    "code": {r: "holds" for r in ALL},
    "fixed": {r: "holds" for r in ALL},
    "typeProbe": {"TypeOK": "breaks"},
    "noClaim": {"TerminalStaysTerminal": "breaks"},
    "bindOutsideTx": {"InvoiceRecorded": "breaks"},
    "finalizeByIdOnly": {"TerminalStaysTerminal": "breaks"},
    "checkOutsideTx": {"StockOnce": "breaks"},
    "retryReregisters": {"NeverRunningAgain": "breaks"},
    "resolveRefusesRunning": {"ResolveAlwaysPossible": "breaks"},
    "noFinalizeOnError": {"RunningSettles": "breaks"},
}
CHARTS = ["before", "code"]
REPLAYS = {}
