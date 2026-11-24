SPEC = "CheckIn.tla"
CONSTANTS = {}
MODES = {m: {"MODE": f'"{m}"'} for m in [
    "code", "fixed", "noGuard", "editKeepsOld", "noSubjectCheck",
    "openNeedsSend", "closeNeedsSend", "stopLeavesOpen", "typeProbe",
    "noStateGuard", "dropSecond", "flagAfterCommit", "pinLatest", "answerAnyCheckIn",
]}
RULES = {
    "TypeOK": "invariant",
    "OneLiveTrackPerVisit": "invariant",
    "ReminderOnlyWhileOpen": "invariant",
    "StopEndsCheckIns": "invariant",
    "LinkAnswersOnly": "invariant",
    "OneResponsePerCheckIn": "invariant",
    "SecondAnswerNotLost": "invariant",
    "ResponsePinsVersion": "invariant",
    "UrgentReachesWorklist": "invariant",
    "EveryCheckInEnds": "property",
}
RULE_TEXT = {
    "TypeOK": "Every variable stays inside its declared set of values.",
    "OneLiveTrackPerVisit": "A visit has at most one track that is not stopped, however often it is completed, edited or retried.",
    "ReminderOnlyWhileOpen": "A message about a check-in reaches SENT only while that check-in is OPEN.",
    "StopEndsCheckIns": "A stopped track has no scheduled or open check-in.",
    "LinkAnswersOnly": "A task link writes a response only to a check-in that is OPEN when the write commits.",
    "OneResponsePerCheckIn": "A check-in has at most one response, however many submits race.",
    "SecondAnswerNotLost": "A submit that finds the check-in answered is kept as a patient message with an open attention item.",
    "ResponsePinsVersion": "A response carries the instrument version its check-in pinned, even after a new version is published.",
    "UrgentReachesWorklist": "An urgent response never exists without its RESPONSE_FLAG worklist item.",
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
    "noStateGuard": {"OneResponsePerCheckIn": "breaks", "UrgentReachesWorklist": "holds"},
    "dropSecond": {"SecondAnswerNotLost": "breaks", "OneResponsePerCheckIn": "holds"},
    "flagAfterCommit": {"UrgentReachesWorklist": "breaks", "OneResponsePerCheckIn": "holds"},
    "pinLatest": {"ResponsePinsVersion": "breaks", "OneResponsePerCheckIn": "holds"},
    "answerAnyCheckIn": {"LinkAnswersOnly": "breaks", "ResponsePinsVersion": "holds"},
}
CHARTS = ["code"]
REPLAYS = {}
TITLE = "Follow-up track and check-in"
