SPEC = "Prescriptions.tla"
CONSTANTS = {
    "Reqs": "{a, b}",
    "Refills": "{f1, f2}",
    "Reviewers": "{v1, v2}",
    "MaxRefills": "1",
    "MaxBills": "2",
    "Budget": "5",
}
MODES = {
    "code": {"MODE": '"code"'},
    "before": {"MODE": '"before"'},
    "fixed": {"MODE": '"fixed"'},
    "typeProbe": {"MODE": '"typeProbe"'},
    "noRowLock": {"MODE": '"noRowLock"'},
    "noApproveRecheck": {"MODE": '"noApproveRecheck"'},
    "billIgnoresRefills": {"MODE": '"billIgnoresRefills"'},
    "cancelAnyStatus": {"MODE": '"cancelAnyStatus"'},
    "patchIgnoresStatus": {"MODE": '"patchIgnoresStatus"'},
    "noStatusPredicate": {"MODE": '"noStatusPredicate"'},
    "auditOutsideTransaction": {"MODE": '"auditOutsideTransaction"'},
}
RULES = {
    "TypeOK": "invariant",
    "AtMostOnePendingRefill": "invariant",
    "RefillsWithinAllowance": "invariant",
    "NoApprovalOnClosedPrescription": "invariant",
    "BillsWithinAllowance": "invariant",
    "CompletedStaysCompleted": "invariant",
    "CancelledStaysCancelled": "invariant",
    "StrandedRequestsClose": "property",
    "OneDecision": "invariant",
    "DecidedStaysDecided": "invariant",
    "DecisionRecorded": "invariant",
}
RULE_TEXT = {
    "TypeOK": "Every variable stays inside its type.",
    "AtMostOnePendingRefill": "A prescription has at most one refill request waiting for the doctor.",
    "RefillsWithinAllowance": "Approved refills never exceed the prescription's refill allowance.",
    "NoApprovalOnClosedPrescription": "A refill is approved only while the prescription is active and in date.",
    "BillsWithinAllowance": "Pharmacy bills on a prescription never exceed the first fill plus its approved refills.",
    "CompletedStaysCompleted": "A completed prescription stays completed.",
    "CancelledStaysCancelled": "A cancelled prescription stays cancelled.",
    "StrandedRequestsClose": "A refill request on a completed or cancelled prescription does not stay waiting forever.",
    "OneDecision": "A template version gets at most one review decision on record.",
    "DecidedStaysDecided": "Once a template version is approved or rejected, its status does not change.",
    "DecisionRecorded": "An approved or rejected template version has a review record that says so.",
}
BEFORE_BREAKS = {"BillsWithinAllowance", "CompletedStaysCompleted", "StrandedRequestsClose",
                 "OneDecision", "DecidedStaysDecided", "DecisionRecorded"}
CODE_BREAKS = {"BillsWithinAllowance"}
EXPECT = {
    "code": {r: "breaks" if r in CODE_BREAKS else "holds" for r in RULES},
    "before": {r: "breaks" if r in BEFORE_BREAKS else "holds" for r in RULES},
    "fixed": {r: "holds" for r in RULES},
    "typeProbe": {"TypeOK": "breaks"},
    "noRowLock": {"AtMostOnePendingRefill": "breaks", "RefillsWithinAllowance": "breaks"},
    "noApproveRecheck": {"NoApprovalOnClosedPrescription": "breaks"},
    "billIgnoresRefills": {"BillsWithinAllowance": "breaks"},
    "cancelAnyStatus": {"CompletedStaysCompleted": "breaks"},
    "patchIgnoresStatus": {"CancelledStaysCancelled": "breaks"},
    "noStatusPredicate": {"OneDecision": "breaks", "DecidedStaysDecided": "breaks", "DecisionRecorded": "holds"},
    "auditOutsideTransaction": {"DecisionRecorded": "breaks", "OneDecision": "holds", "DecidedStaysDecided": "holds"},
}
CHARTS = ["before", "code"]
REPLAY = "backend/src/modules/prescriptions/tests/prescriptions.formal-replay.database.spec.ts"
REPLAYS = {r: REPLAY for r in CODE_BREAKS}
