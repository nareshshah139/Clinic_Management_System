TITLE = "Shortbook, purchase order and receipt"

CLOSED = ("CANCELLED", "REJECTED")


def state(v):
    sb, po, rc = v["st"]["sb"], v["st"]["po"], v["st"]["rc"]
    if v["posts"] > 1:
        return "Receipt stock added twice"
    if po == "ABSENT":
        return "Shortbook closed before ordering" if sb in CLOSED else ("Shortbook ordered, no order" if sb == "ORDERED" else "Shortbook open")
    if po in CLOSED:
        if sb in ("ORDERED", "PART_RECEIVED", "RECEIVED"):
            return "Order closed, shortbook still ordered"
        return "Order and shortbook closed"
    if sb in CLOSED:
        return "Shortbook closed, order still open"
    if po == "DRAFT":
        return "Order drafted"
    if po == "AWAITING_APPROVAL":
        return "Order awaiting approval"
    if po == "APPROVED":
        return "Order approved, receipt reversed" if rc == "REVERSED" else "Order approved"
    if po == "PART_RECEIVED":
        return "Part received"
    return "Fully received"


PHRASE = {
    "SbCreatePO": "make the order from the shortbook",
    "SbCancel": "cancel the shortbook",
    "SbReject": "reject the shortbook",
    "PoSubmit": "submit the order",
    "PoApprove": "approve the order",
    "PoCancel": "cancel the order",
    "PoReject": "reject the order",
    "PoCancelRemaining": "cancel the rest of the order",
    "RcPost": "post the receipt",
    "RcReverse": "reverse the receipt",
}


def step(action, frm, to):
    if action == "UserSends":
        return "staff send a request"
    if action == "ServerAborts":
        return "the database aborts a clashing save"
    if action == "ServerCommits":
        for who, r in frm["req"].items():
            if r["act"] != "idle" and to["req"][who]["act"] == "idle":
                return f"staff {PHRASE[r['act']]}"
    return action
