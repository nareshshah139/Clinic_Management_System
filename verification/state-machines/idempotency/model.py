SPEC = "Idempotency.tla"
CONSTANTS = {"Issues": "2", "Attempts": "2", "MaxReqs": "4"}
MODES = {
    "before": {"MODE": '"before"'},
    "code": {"MODE": '"code"'},
    "fixed": {"MODE": '"fixed"'},
    "failOpenClaim": {"MODE": '"failOpenClaim"'},
    "payloadKey": {"MODE": '"payloadKey"'},
    "storeErrors": {"MODE": '"storeErrors"'},
    "noTimeout": {"MODE": '"noTimeout"'},
    "typeProbe": {"MODE": '"typeProbe"'},
}
RULES = {
    "TypeOK": "invariant",
    "OnePrescriptionPerIssue": "invariant",
    "NoStaleReplay": "invariant",
    "NoFailureStored": "invariant",
    "BrowserLeavesSaving": "property",
}
RULE_TEXT = {
    "TypeOK": "Every variable stays within its declared values.",
    "OnePrescriptionPerIssue": "One prescription the doctor saves creates at most one visit and one prescription, however often the browser retries.",
    "NoStaleReplay": "Saving a new prescription never answers with an earlier prescription.",
    "NoFailureStored": "A failed save is never stored, so its retry runs the handler again.",
    "BrowserLeavesSaving": "The save indicator always stops, even when the server never answers.",
}
EXPECT = {
    "before": {
        "TypeOK": "holds",
        "OnePrescriptionPerIssue": "breaks",
        "NoStaleReplay": "breaks",
        "NoFailureStored": "holds",
        "BrowserLeavesSaving": "holds",
    },
    "code": {
        "TypeOK": "holds",
        "OnePrescriptionPerIssue": "holds",
        "NoStaleReplay": "holds",
        "NoFailureStored": "holds",
        "BrowserLeavesSaving": "holds",
    },
    "fixed": {
        "TypeOK": "holds",
        "OnePrescriptionPerIssue": "holds",
        "NoStaleReplay": "holds",
        "NoFailureStored": "holds",
        "BrowserLeavesSaving": "holds",
    },
    "failOpenClaim": {"OnePrescriptionPerIssue": "breaks"},
    "payloadKey": {"NoStaleReplay": "breaks"},
    "storeErrors": {"NoFailureStored": "breaks"},
    "noTimeout": {"BrowserLeavesSaving": "breaks"},
    "typeProbe": {"TypeOK": "breaks"},
}
CHARTS = ["before", "code"]
REPLAYS = {}
