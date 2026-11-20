TITLE = "Pharmacy counter dispense task"

FINISHED = {"PAID", "DISPENSED", "CANCELLED"}
STAMPABLE = {"IN_REVIEW", "PAUSED", "READY_TO_BILL", "PAID", "DISPENSED", "CANCELLED"}


def state(v):
    s, queue, billed, seen = v["screen"]["task"], v["screen"]["queue"], v["bill"] == "posted", set(v["seen"])
    if "dispensed" in seen and s != "DISPENSED":
        return "Billed, but the counter shows " + ("Paid" if s == "PAID" else "Cancelled" if s == "CANCELLED" else "it open again")
    if "finished" in seen and s not in FINISHED:
        return "Open again after it was paid or cancelled"
    if v["task"] == "NONE":
        return "Billed before anyone opened it" if billed else "Waiting in the queue"
    if v["task"] in STAMPABLE and v["task"] not in v["stamped"]:
        return "Dispensed, with no dispensed time"
    if s == "PAID":
        return "Paid, with no bill" if not billed else "Paid and billed"
    if billed and queue != "dispensed":
        return "Billed, but listed under Paused"
    if s == "CANCELLED":
        return "Cancelled"
    if s == "DISPENSED":
        return "Dispensed"
    return "Open at the counter"


STATUS_STEP = {
    "IN_REVIEW": "you open it for review",
    "PAUSED": "you pause",
    "READY_TO_BILL": "you mark ready to bill",
    "PAID": "you mark paid",
    "CANCELLED": "an API call cancels",
}

LINE_STEP = {
    "PENDING": "you reset the medicine",
    "ACCEPTED": "you accept the medicine",
    "UNAVAILABLE": "you mark the medicine unavailable",
}


def step(action, frm, to):
    if action == "YouRequestStatus":
        return None
    if action == "ServerSavesStatus":
        return STATUS_STEP[frm["pending"]]
    if action == "YouReviewLine":
        return LINE_STEP[to["line"]]
    if action == "YouOpenPrescription":
        return "you open the prescription"
    if action == "DeskPostsBill":
        return "the bill posts"
    return action
