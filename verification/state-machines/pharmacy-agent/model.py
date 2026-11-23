SPEC = "PharmacyAgent.tla"

CONSTANTS = {"Reviewers": "{u1, u2}", "N": "2"}

MODES = {
    "before": {"MODE": '"before"'},
    "code": {"MODE": '"code"'},
    "fixed": {"MODE": '"fixed"'},
    "noClaim": {"MODE": '"noClaim"'},
    "rejectNoCAS": {"MODE": '"rejectNoCAS"'},
    "noSkip": {"MODE": '"noSkip"'},
    "stageEarly": {"MODE": '"stageEarly"'},
    "failedOverwrites": {"MODE": '"failedOverwrites"'},
    "noSweeper": {"MODE": '"noSweeper"'},
    "typeProbe": {"MODE": '"typeProbe"'},
}

RULES = {
    "TypeOK": "invariant",
    "AppliedOnce": "invariant",
    "DecisionIsFinal": "invariant",
    "RejectedMeansNotApplied": "invariant",
    "StatusesAgree": "invariant",
    "NoChangesMeansNoChanges": "invariant",
    "RunEndsOnce": "invariant",
    "RunLeavesRunning": "property",
    "ApplyingEnds": "property",
}

RULE_TEXT = {
    "TypeOK": "Every status holds a value the code can write.",
    "AppliedOnce": "Each approved action changes the pharmacy at most once.",
    "DecisionIsFinal": "Once a proposal is applied, rejected or failed, its status never changes again.",
    "RejectedMeansNotApplied": "An action shown as rejected never changed anything.",
    "StatusesAgree": "A finished proposal and its actions agree. Applied means every action applied, rejected means every action rejected, and failed leaves no action waiting or in progress.",
    "NoChangesMeansNoChanges": "When the agent says no database changes were made, nothing from that run changed the pharmacy or is still waiting to be applied.",
    "RunEndsOnce": "A run that has completed or failed keeps that result.",
    "RunLeavesRunning": "A run does not stay running forever.",
    "ApplyingEnds": "No proposal or action stays shown as being applied forever.",
}

ALL_HOLD = {rule: "holds" for rule in RULES}

EXPECT = {
    "before": {
        "TypeOK": "holds",
        "AppliedOnce": "breaks",
        "DecisionIsFinal": "breaks",
        "RejectedMeansNotApplied": "breaks",
        "StatusesAgree": "breaks",
        "NoChangesMeansNoChanges": "breaks",
        "RunEndsOnce": "breaks",
        "RunLeavesRunning": "breaks",
        "ApplyingEnds": "breaks",
    },
    "code": dict(ALL_HOLD),
    "fixed": dict(ALL_HOLD),
    "noClaim": {"AppliedOnce": "breaks", "DecisionIsFinal": "breaks"},
    "rejectNoCAS": {"RejectedMeansNotApplied": "breaks"},
    "noSkip": {"StatusesAgree": "breaks"},
    "stageEarly": {"NoChangesMeansNoChanges": "breaks"},
    "failedOverwrites": {"RunEndsOnce": "breaks"},
    "noSweeper": {"RunLeavesRunning": "breaks", "ApplyingEnds": "breaks"},
    "typeProbe": {"TypeOK": "breaks"},
}

CHARTS = ["before", "code"]

REPLAYS = {}
