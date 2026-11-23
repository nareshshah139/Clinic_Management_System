TITLE = "Prescriptions, refills and template review"

COMMIT = {
    "request": "the desk's refill request is saved",
    "approve": "the doctor's refill approval is saved",
    "reject": "the doctor's refill rejection is saved",
    "cancel": "the doctor's cancellation is saved",
    "complete": "the doctor's 'completed' is saved",
    "bill": "the pharmacist's bill is posted",
}

REFUSED = {
    "request": "the server turns down the refill request",
    "approve": "the server turns down the refill approval",
    "reject": "the server turns down the refill rejection",
    "cancel": "the server leaves the prescription as it is",
    "complete": "the server turns down 'completed'",
    "bill": "the server turns down the bill",
}

SEND = {
    "request": "the desk asks for a refill",
    "approve": "the doctor approves the refill",
    "reject": "the doctor rejects the refill",
    "cancel": "the doctor cancels the prescription",
    "complete": "the doctor marks it completed",
    "bill": "the pharmacist posts a bill",
}

ROWS = ("rxStatus", "refill", "bills")


def state(v):
    if v["focus"] == "rx":
        status = v["rxStatus"]
        pending = any(s == "PENDING" for s in v["refill"].values())
        used = sum(s == "APPROVED" for s in v["refill"].values())
        if status == "CANCELLED" and v["everCompleted"]:
            return "Cancelled after it was completed"
        if status in ("COMPLETED", "CANCELLED"):
            return "Closed, a refill request still waiting" if pending else "Prescription closed"
        if v["bills"] > 1 + used:
            return "Billed past what the doctor allowed"
        if v["expired"]:
            return "Prescription past its valid-until date"
        return "Refill request waiting for the doctor" if pending else "Prescription active"
    quiet = all(p != "audit" for p in v["tpc"].values())
    if v["version"] != "PENDING" and quiet and v["version"] not in v["audit"]:
        return "Version decided with no review record"
    if v["firstDecision"] != "none" and v["version"] != v["firstDecision"]:
        return "Second reviewer overwrote the decision"
    if len(v["audit"]) >= 2:
        return "Version reviewed twice"
    return "Version waiting for review" if v["version"] == "PENDING" else "Version decided"


def _changed(frm, to, key, before):
    return next(k for k, p in frm[key].items() if p == before and to[key][k] != before)


def step(action, frm, to):
    if action == "ServerCommits":
        c = frm["cmd"][_changed(frm, to, "pc", "sent")]
        return COMMIT[c] if any(frm[k] != to[k] for k in ROWS) else REFUSED[c]
    if frm["focus"] == "rx" and any(frm["pc"][r] == "idle" and to["pc"][r] == "sent" for r in frm["pc"]):
        return SEND[to["cmd"][_changed(frm, to, "pc", "idle")]]
    if any(frm["tpc"][x] == "idle" and to["tpc"][x] != "idle" for x in frm["tpc"]):
        kind = to["tkind"][_changed(frm, to, "tpc", "idle")]
        return "a reviewer approves the version" if kind == "APPROVED" else "a reviewer rejects the version"
    if action == "ServerSavesDecision":
        kind = frm["tkind"][_changed(frm, to, "tpc", "read")]
        return "a reviewer's approval is saved" if kind == "APPROVED" else "a reviewer's rejection is saved"
    if action == "ServerSavesReviewRecord":
        return "the review record is saved"
    if action == "ReviewRecordFails":
        return "saving the review record fails"
    if action == "ValidUntilPasses":
        return "the valid-until date passes"
    if action == "RowStoresExpired":
        return "a row stores EXPIRED"
    return None
