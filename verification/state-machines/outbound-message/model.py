SPEC = "OutboundMessage.tla"
CONSTANTS = {}
MODES = {m: {"MODE": f'"{m}"'} for m in [
    "before", "code", "fixed", "checkAtLease", "noSubjectCheck", "keptWins",
    "noFailureItem", "noLease", "typeProbe",
]}
RULES = {
    "TypeOK": "invariant",
    "NoSendToUnconfirmedNumber": "invariant",
    "OptOutSticks": "invariant",
    "SubjectCurrentAtSend": "invariant",
    "FailureReachesStaff": "invariant",
    "AtMostOneSend": "invariant",
}
RULE_TEXT = {
    "TypeOK": "Every variable stays inside its declared set of values.",
    "NoSendToUnconfirmedNumber": "A care message is sent only while consent is OPTED_IN, the number is confirmed and the portal is on.",
    "OptOutSticks": "After STOP, nothing is sent until the number confirms again, even after a merge with an opted-out duplicate.",
    "SubjectCurrentAtSend": "A message is sent only while its appointment or check-in is still current.",
    "FailureReachesStaff": "A failed message about a current subject opens an attention item.",
    "AtMostOneSend": "The provider is called at most once for one OutboundMessage row.",
}
EXPECT = {
    "before": {
        "TypeOK": "holds",
        "NoSendToUnconfirmedNumber": "breaks",
        "OptOutSticks": "breaks",
        "SubjectCurrentAtSend": "breaks",
        "FailureReachesStaff": "breaks",
        "AtMostOneSend": "holds",
    },
    "code": {rule: "holds" for rule in RULES},
    "fixed": {rule: "holds" for rule in RULES},
    "checkAtLease": {"NoSendToUnconfirmedNumber": "breaks", "OptOutSticks": "breaks"},
    "noSubjectCheck": {"SubjectCurrentAtSend": "breaks", "NoSendToUnconfirmedNumber": "holds"},
    "keptWins": {"OptOutSticks": "breaks", "NoSendToUnconfirmedNumber": "holds"},
    "noFailureItem": {"FailureReachesStaff": "breaks"},
    "noLease": {"AtMostOneSend": "breaks"},
    "typeProbe": {"TypeOK": "breaks"},
}
CHARTS = ["before", "code"]
REPLAYS = {}
