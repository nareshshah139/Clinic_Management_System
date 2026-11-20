SPEC = "AppointmentVisit.tla"
CONSTANTS = {"MaxEdits": "1"}
MODES = {
    "code": {"MODE": '"code"'},
    "before": {"MODE": '"before"'},
    "uiOnly": {"MODE": '"uiOnly"'},
    "fixed": {"MODE": '"fixed"'},
    "patchIgnoresVisit": {"MODE": '"patchIgnoresVisit"'},
    "bulkIgnoresVisit": {"MODE": '"bulkIgnoresVisit"'},
    "checkInFromAnyStatus": {"MODE": '"checkInFromAnyStatus"'},
    "editAfterComplete": {"MODE": '"editAfterComplete"'},
    "typeProbe": {"MODE": '"typeProbe"'},
}
RULES = {
    "TypeOK": "invariant",
    "StatusesAgree": "invariant",
    "NoResurrection": "invariant",
    "CompletedVisitFrozen": "invariant",
    "DisagreementHeals": "property",
}
RULE_TEXT = {
    "TypeOK": "Every variable holds a value of its type.",
    "StatusesAgree": "While a visit is open the appointment shows in progress, and once the visit is completed the appointment shows completed.",
    "NoResurrection": "A cancelled appointment stays cancelled until someone looking at it as cancelled brings it back.",
    "CompletedVisitFrozen": "A completed visit's clinical notes stay as they were when the doctor completed it.",
    "DisagreementHeals": "When the appointment and its visit disagree, the system brings them back into agreement by itself.",
}
ALL_HOLD = {rule: "holds" for rule in RULES}
EXPECT = {
    "code": ALL_HOLD,
    "before": {**ALL_HOLD, "StatusesAgree": "breaks", "NoResurrection": "breaks",
               "CompletedVisitFrozen": "breaks", "DisagreementHeals": "breaks"},
    "uiOnly": {"StatusesAgree": "breaks", "NoResurrection": "breaks",
               "CompletedVisitFrozen": "breaks", "DisagreementHeals": "breaks"},
    "fixed": ALL_HOLD,
    "patchIgnoresVisit": {"StatusesAgree": "breaks", "NoResurrection": "breaks",
                          "DisagreementHeals": "breaks", "CompletedVisitFrozen": "holds"},
    "bulkIgnoresVisit": {"StatusesAgree": "breaks", "NoResurrection": "breaks",
                         "DisagreementHeals": "breaks", "CompletedVisitFrozen": "holds"},
    "checkInFromAnyStatus": {"NoResurrection": "breaks", "StatusesAgree": "holds"},
    "editAfterComplete": {"CompletedVisitFrozen": "breaks", "StatusesAgree": "holds", "NoResurrection": "holds"},
    "typeProbe": {"TypeOK": "breaks"},
}
CHARTS = ["before", "code"]
REPLAYS = {}
