SPEC = "CountSheetSave.tla"
CONSTANTS = {"MaxEdits": "3"}
MODES = {
    "code": {"MODE": '"code"'},
    "fixed": {"MODE": '"fixed"'},
    "typeProbe": {"MODE": '"typeProbe"'},
    "indicatorLagsEdit": {"MODE": '"indicatorLagsEdit"'},
    "dropTimerOnLeave": {"MODE": '"dropTimerOnLeave"'},
    "savingWithInvalid": {"MODE": '"savingWithInvalid"'},
    "noTimeout": {"MODE": '"noTimeout"'},
    "noSerialise": {"MODE": '"noSerialise"'},
}
RULES = {
    "TypeOK": "invariant",
    "SavedMeansSaved": "invariant",
    "NoDropOnLeave": "invariant",
    "OneSaveAtATime": "invariant",
    "LeavesSaving": "property",
    "SaveRequestEnds": "property",
}
RULE_TEXT = {
    "TypeOK": "Every variable stays within its type.",
    "SavedMeansSaved": "The sheet says Saved only when no typed count is waiting to be sent or still on its way.",
    "NoDropOnLeave": "Leaving the sheet never throws away a typed count that was never sent.",
    "OneSaveAtATime": "At most one save request for the sheet is out at a time.",
    "LeavesSaving": "Given the server answers, the sheet stops saying Saving with no user action.",
    "SaveRequestEnds": "A save request the server never answers still ends with no user action, so later counts can be sent.",
}
ALL = list(RULES)
EXPECT = {
    "code": {**{r: "holds" for r in ALL}, "SavedMeansSaved": "breaks", "NoDropOnLeave": "breaks",
             "LeavesSaving": "breaks", "SaveRequestEnds": "breaks"},
    "fixed": {r: "holds" for r in ALL},
    "typeProbe": {"TypeOK": "breaks"},
    "indicatorLagsEdit": {"SavedMeansSaved": "breaks"},
    "dropTimerOnLeave": {"NoDropOnLeave": "breaks"},
    "savingWithInvalid": {"LeavesSaving": "breaks"},
    "noTimeout": {"SaveRequestEnds": "breaks", "LeavesSaving": "holds"},
    "noSerialise": {"OneSaveAtATime": "breaks"},
}
CHARTS = ["code", "fixed"]
REPLAY = "frontend/__tests__/formal/count-sheet-save.formal-replay.test.tsx"
REPLAYS = {r: REPLAY for r, v in EXPECT["code"].items() if v == "breaks"}
