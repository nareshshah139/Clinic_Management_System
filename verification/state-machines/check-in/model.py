SPEC = "CheckIn.tla"
CONSTANTS = {}
MODES = {m: {"MODE": f'"{m}"'} for m in [
    "code", "fixed", "noGuard", "editKeepsOld", "noSubjectCheck",
    "openNeedsSend", "closeNeedsSend", "stopLeavesOpen", "typeProbe",
]}
RULES = {
    "TypeOK": "invariant",
    "OneLiveTrackPerVisit": "invariant",
    "ReminderOnlyWhileOpen": "invariant",
    "StopEndsCheckIns": "invariant",
    "EveryCheckInEnds": "property",
}
RULE_TEXT = {
    "TypeOK": "Every variable stays inside its declared set of values.",
    "OneLiveTrackPerVisit": "A visit has at most one track that is not stopped, however often it is completed, edited or retried.",
    "ReminderOnlyWhileOpen": "A message about a check-in reaches SENT only while that check-in is OPEN.",
    "StopEndsCheckIns": "A stopped track has no scheduled or open check-in.",
    "EveryCheckInEnds": "Every check-in eventually reaches ANSWERED, MISSED or CANCELLED, even when no message can be sent.",
}
EXPECT = {
    "code": {rule: "holds" for rule in RULES},
    "fixed": {rule: "holds" for rule in RULES},
    "noGuard": {"OneLiveTrackPerVisit": "breaks", "EveryCheckInEnds": "holds"},
    "editKeepsOld": {"OneLiveTrackPerVisit": "breaks", "StopEndsCheckIns": "holds"},
    "noSubjectCheck": {"ReminderOnlyWhileOpen": "breaks", "EveryCheckInEnds": "holds"},
    "openNeedsSend": {"EveryCheckInEnds": "breaks", "ReminderOnlyWhileOpen": "holds"},
    "closeNeedsSend": {"EveryCheckInEnds": "breaks", "ReminderOnlyWhileOpen": "holds"},
    "stopLeavesOpen": {"StopEndsCheckIns": "breaks", "EveryCheckInEnds": "holds"},
    "typeProbe": {"TypeOK": "breaks"},
}
CHARTS = ["code"]
REPLAYS = {}
TITLE = "Follow-up track and check-in"
