SPEC = "DocumentKnowledge.tla"
CONSTANTS = {"MaxPosts": "2"}
MODES = {
    "before": {"MODE": '"before"'},
    "code": {"MODE": '"code"'},
    "fixed": {"MODE": '"fixed"'},
    "typeProbe": {"MODE": '"typeProbe"'},
    "noTimeout": {"MODE": '"noTimeout"'},
    "noFence": {"MODE": '"noFence"'},
    "mutateWhileUnknown": {"MODE": '"mutateWhileUnknown"'},
    "transitionTrustsClient": {"MODE": '"transitionTrustsClient"'},
    "unlockOnSuccessOnly": {"MODE": '"unlockOnSuccessOnly"'},
    "freshKeyOnReplay": {"MODE": '"freshKeyOnReplay"'},
}
RULES = {
    "TypeOK": "invariant",
    "PostedOnce": "invariant",
    "OneDocument": "invariant",
    "KnownMeansSettled": "invariant",
    "NoSubmitWhileUnknown": "invariant",
    "BusyEndsIfAnswered": "property",
    "BusyEnds": "property",
}
RULE_TEXT = {
    "TypeOK": "Every variable stays within its type.",
    "PostedOnce": "A stock loss is posted to stock at most once.",
    "OneDocument": "One draft becomes at most one saved document, even when its creation is replayed.",
    "KnownMeansSettled": "When the editor shows a confirmed outcome, no earlier request can still change the document.",
    "NoSubmitWhileUnknown": "No new save or stock action is sent while an earlier one could still land.",
    "BusyEndsIfAnswered": "Given the server answers, the editor stops being busy with no user action.",
    "BusyEnds": "Even if the server never answers, the editor stops being busy, so Check saved status works.",
}
ALL = list(RULES)
EXPECT = {
    "before": {**{r: "holds" for r in ALL}, "BusyEnds": "breaks"},
    "code": {r: "holds" for r in ALL},
    "fixed": {r: "holds" for r in ALL},
    "typeProbe": {"TypeOK": "breaks"},
    "noTimeout": {"BusyEnds": "breaks", "BusyEndsIfAnswered": "holds"},
    "noFence": {"KnownMeansSettled": "breaks"},
    "mutateWhileUnknown": {"NoSubmitWhileUnknown": "breaks"},
    "transitionTrustsClient": {"PostedOnce": "breaks"},
    "unlockOnSuccessOnly": {"BusyEndsIfAnswered": "breaks"},
    "freshKeyOnReplay": {"OneDocument": "breaks"},
}
CHARTS = ["before", "code"]
REPLAY = "frontend/__tests__/formal/document-knowledge.formal-replay.test.tsx"
REPLAYS = {r: REPLAY for r, v in EXPECT["code"].items() if v == "breaks"}
