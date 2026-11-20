TITLE = "Pharmacy agent run and proposal review"

APPLY_LOOP = {"mark", "run", "record", "failAct", "failProp", "finish"}
RUN_BUSY = {"codex", "stage", "answer", "touch", "catch"}
OVERWRITE = "A decided proposal changes its decision"


def agree(v):
    p, act = v["p"], v["act"]
    if p == "APPLIED":
        return all(a == "APPLIED" for a in act)
    if p == "REJECTED":
        return all(a == "REJECTED" for a in act)
    if p == "FAILED":
        return all(a not in ("PENDING_REVIEW", "APPLYING") for a in act)
    return True


def broken(v):
    p, act, eff = v["p"], v["act"], v["eff"]
    if v["run"] not in ("none", "RUNNING", "COMPLETED", "FAILED"):
        return "Status outside the enum"
    if any(n >= 2 for n in eff):
        return "Same change made twice"
    if any((a == "REJECTED" or p == "REJECTED") and n > 0 for a, n in zip(act, eff)):
        return "Rejected after a change was made"
    if v["firstDecision"] != "none" and p != v["firstDecision"]:
        return OVERWRITE
    if not agree(v):
        return "Proposal and its actions disagree"
    if v["runEnd"] != "none" and v["run"] != v["runEnd"]:
        return "Completed run marked failed"
    if "noChanges" in v["told"] and (p == "PENDING_REVIEW" or any(eff)):
        return "Agent says nothing changed, proposal still open"
    return None


def stuck(v):
    p, act = v["p"], v["act"]
    live_apply = any(pc in APPLY_LOOP for pc in v["upc"].values())
    if (p == "APPLYING" or "APPLYING" in act) and not live_apply:
        return "Apply abandoned half way"
    if v["run"] == "RUNNING" and v["rpc"] == "gone":
        return "Run left running"
    return None


def state(v):
    label = stuck(v) or broken(v)
    if label:
        return label
    p = v["p"]
    visible = "answer" in v["told"] or v["rpc"] == "gone"
    if v["run"] == "none" or (v["rpc"] in RUN_BUSY and not visible):
        return "Asking the agent"
    if any(pc in APPLY_LOOP for pc in v["upc"].values()):
        return "Being applied"
    if p == "PENDING_REVIEW":
        return "Proposal waiting for review"
    return "Finished"


STEPS = {
    "PharmacistAsks": "you ask the agent",
    "CodexAnswers": "Codex answers",
    "CodexFails": "Codex fails or times out",
    "StageProposal": "the agent saves its proposal",
    "AnswerPosted": "the agent posts its answer",
    "AnswerFails": "a later save fails",
    "SessionTouched": "the reply comes back",
    "TouchFails": "the thread update fails",
    "RunMarkedFailed": "the agent says nothing changed",
    "FailedWriteThrows": "saving the failure fails",
    "ReviewerApplies": "a reviewer clicks Apply",
    "MarkApplying": "an action starts",
    "ActionRuns": "an action changes pharmacy records",
    "ActionThrows": "an action fails",
    "RecordApplied": "the action shows applied",
    "RecordFailure": "the action shows failed",
    "ProposalFails": "the proposal shows failed",
    "ProposalApplied": "the proposal shows applied",
    "ReviewerRejects": "a reviewer clicks Reject",
    "RejectWrites": "the rejection is saved",
    "SweeperFailsRun": "the sweeper closes the stale run",
    "SweeperFailsApply": "the sweeper closes the abandoned apply",
    "ServerRestarts": "the server restarts",
}


def step(action, frm, to):
    text = STEPS.get(action)
    a, b = state(frm), state(to)
    if a == b:
        return text
    if broken(frm) and not stuck(frm):
        return text if b == OVERWRITE or stuck(to) else None
    if stuck(frm):
        return None if broken(to) or stuck(to) else text
    return text
