SPEC = "DispenseQueue.tla"
CONSTANTS = {}  # one prescription, one task, one medicine line, one bill; MODE is the only constant
MODES = {m: {"MODE": f'"{m}"'} for m in (
    "before", "code", "fixed", "typeProbe", "paidWithoutBill", "reopenFinished",
    "createUnstamped", "checkBeforeLock", "cancelSticky")}
RULES = {
    "TypeOK": "invariant",
    "PaidNeedsBill": "invariant",
    "FinishedStaysFinished": "invariant",
    "DispensedStaysDispensed": "invariant",
    "ReadyMeansReviewed": "invariant",
    "StatusHasTimestamp": "invariant",
    "BillShowsDone": "property",
}
RULE_TEXT = {
    "TypeOK": "Every variable holds a value of its type.",
    "PaidNeedsBill": "A task is saved as Paid only when a posted bill exists for its prescription.",
    "FinishedStaysFinished": "Once the counter shows a task as Paid, Dispensed or Cancelled, it never shows it open again.",
    "DispensedStaysDispensed": "Once the counter shows a prescription as Dispensed, it keeps showing Dispensed.",
    "ReadyMeansReviewed": "A task saved as Ready to bill has its medicine reviewed and available.",
    "StatusHasTimestamp": "A task in a status that has a timestamp column has that timestamp set.",
    "BillShowsDone": "Once the bill posts, the queue lists the prescription under Done with nobody acting.",
}
ALL_HOLD = {r: "holds" for r in RULES}
EXPECT = {
    "before": {**ALL_HOLD, "PaidNeedsBill": "breaks", "FinishedStaysFinished": "breaks",
             "DispensedStaysDispensed": "breaks", "StatusHasTimestamp": "breaks", "BillShowsDone": "breaks"},
    "code": ALL_HOLD,
    "fixed": ALL_HOLD,
    "typeProbe": {"TypeOK": "breaks"},
    "paidWithoutBill": {"PaidNeedsBill": "breaks"},
    "reopenFinished": {"FinishedStaysFinished": "breaks", "DispensedStaysDispensed": "breaks"},
    "createUnstamped": {"StatusHasTimestamp": "breaks"},
    "checkBeforeLock": {"ReadyMeansReviewed": "breaks"},
    "cancelSticky": {"BillShowsDone": "breaks"},
}
CHARTS = ["before", "code"]
REPLAYS = {}
