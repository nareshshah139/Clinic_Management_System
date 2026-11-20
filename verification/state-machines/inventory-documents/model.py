SPEC = "InventoryDocuments.tla"
CONSTANTS = {"Actors": "{clerk, manager}"}
MODES = {m: {"MODE": f'"{m}"'} for m in [
    "code", "fixed", "typeProbe", "noVersionCheck", "noPostedCheck", "convertIgnoresFinal",
    "receiptIgnoresClosedShortbook", "rejectOrderedShortbook", "retryUnbounded"]}
RULES = {
    "TypeOK": "invariant",
    "StaleNeverWrites": "invariant",
    "PostedOnce": "invariant",
    "TerminalStaysTerminal": "invariant",
    "ShortbookFollowsOrder": "invariant",
    "RequestsFinish": "property",
}
RULE_TEXT = {
    "TypeOK": "Every variable holds a value of its type.",
    "StaleNeverWrites": "A request never changes a document whose version moved on after the person saw it.",
    "PostedOnce": "A receipt adds its stock at most once.",
    "TerminalStaysTerminal": "A cancelled, rejected or reversed document keeps that status.",
    "ShortbookFollowsOrder": "A shortbook never shows ordered or received while its order is cancelled or rejected.",
    "RequestsFinish": "Every request the server takes finishes, committed or refused.",
}
ALL = list(RULES)
EXPECT = {
    "code": {**{r: "holds" for r in ALL}, "ShortbookFollowsOrder": "breaks"},
    "fixed": {r: "holds" for r in ALL},
    "typeProbe": {"TypeOK": "breaks"},
    "noVersionCheck": {"StaleNeverWrites": "breaks"},
    "noPostedCheck": {"PostedOnce": "breaks"},
    "convertIgnoresFinal": {"TerminalStaysTerminal": "breaks"},
    "receiptIgnoresClosedShortbook": {"TerminalStaysTerminal": "breaks"},
    "rejectOrderedShortbook": {"TerminalStaysTerminal": "breaks"},
    "retryUnbounded": {"RequestsFinish": "breaks"},
}
CHARTS = ["code", "fixed"]
REPLAYS = {"ShortbookFollowsOrder": "backend/src/modules/inventory/tests/inventory-documents.formal-replay.database.spec.ts"}
