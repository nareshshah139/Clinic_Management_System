SPEC = "PatientMessage.tla"
CONSTANTS = {}
MODES = {m: {"MODE": f'"{m}"'} for m in [
    "before", "code", "fixed", "noUpsert", "noItem", "noThrottle", "ackAfterStop", "assignAny", "typeProbe",
]}
RULES = {
    "TypeOK": "invariant",
    "EveryPatientMessageLands": "invariant",
    "OneOpenItemPerSubject": "invariant",
    "OneAckADay": "invariant",
    "NoAckAfterStop": "invariant",
    "ExactOnlyWhenUnique": "invariant",
}
RULE_TEXT = {
    "TypeOK": "Every variable stays inside its declared set of values.",
    "EveryPatientMessageLands": "Each inbound message lands under an unresolved PATIENT_MESSAGE item for its patient or number.",
    "OneOpenItemPerSubject": "A patient, or an unknown number, never has two unresolved PATIENT_MESSAGE items.",
    "OneAckADay": "A number gets at most one acknowledgement in a day.",
    "NoAckAfterStop": "No acknowledgement goes to a number after it sent STOP, until it confirms again.",
    "ExactOnlyWhenUnique": "A message is assigned EXACT only when exactly one portal-enabled patient has the number.",
}
EXPECT = {
    "before": {
        "TypeOK": "holds",
        "EveryPatientMessageLands": "breaks",
        "OneOpenItemPerSubject": "holds",
        "OneAckADay": "breaks",
        "NoAckAfterStop": "breaks",
        "ExactOnlyWhenUnique": "breaks",
    },
    "code": {rule: "holds" for rule in RULES},
    "fixed": {rule: "holds" for rule in RULES},
    "noUpsert": {"OneOpenItemPerSubject": "breaks", "EveryPatientMessageLands": "holds"},
    "noItem": {"EveryPatientMessageLands": "breaks"},
    "noThrottle": {"OneAckADay": "breaks", "NoAckAfterStop": "holds"},
    "ackAfterStop": {"NoAckAfterStop": "breaks", "OneAckADay": "holds"},
    "assignAny": {"ExactOnlyWhenUnique": "breaks"},
    "typeProbe": {"TypeOK": "breaks"},
}
CHARTS = ["before", "code"]
REPLAYS = {}
