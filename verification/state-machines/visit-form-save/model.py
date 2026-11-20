SPEC = "VisitFormSave.tla"
CONSTANTS = {"MaxEdits": "2", "MaxSaves": "2"}
MODES = {
    "code": {"MODE": '"code"'},
    "fixed": {"MODE": '"fixed"'},
    "typeProbe": {"MODE": '"typeProbe"'},
    "rxCreatesAlone": {"MODE": '"rxCreatesAlone"'},
    "rxSavesAlone": {"MODE": '"rxSavesAlone"'},
    "saveIgnoresNewerEdits": {"MODE": '"saveIgnoresNewerEdits"'},
    "noRequestTimeout": {"MODE": '"noRequestTimeout"'},
}
RULES = {
    "TypeOK": "invariant",
    "OneVisit": "invariant",
    "NoSelfConflict": "invariant",
    "LatchAgrees": "invariant",
    "SavedMeansSaved": "invariant",
    "LeavesSaving": "property",
}
RULE_TEXT = {
    "TypeOK": "Every variable stays within its type.",
    "OneVisit": "One consultation creates at most one visit.",
    "NoSelfConflict": "The form reports a conflict only when someone else changed the visit.",
    "LatchAgrees": "While a conflict is latched, the indicator says Save failed.",
    "SavedMeansSaved": "The indicator says Saved only when the server holds the edits on screen.",
    "LeavesSaving": "The indicator leaves Saving and Auto-saving with no user action, even if the server never answers.",
}
ALL = list(RULES)
EXPECT = {
    "code": {**{r: "holds" for r in ALL}, "OneVisit": "breaks", "NoSelfConflict": "breaks", "LatchAgrees": "breaks"},
    "fixed": {r: "holds" for r in ALL},
    "typeProbe": {"TypeOK": "breaks"},
    "rxCreatesAlone": {"OneVisit": "breaks"},
    "rxSavesAlone": {"NoSelfConflict": "breaks", "LatchAgrees": "breaks"},
    "saveIgnoresNewerEdits": {"SavedMeansSaved": "breaks"},
    "noRequestTimeout": {"LeavesSaving": "breaks"},
}
CHARTS = ["code", "fixed"]
REPLAY = "frontend/__tests__/formal/visit-form-save.formal-replay.test.tsx"
REPLAYS = {r: REPLAY for r, v in EXPECT["code"].items() if v == "breaks"}
