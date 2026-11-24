TITLE = "Inbound WhatsApp message"


def state(v):
    if v["lastAssign"] != "none" and v["items"][v["lastSubject"]] == "NONE":
        return "Message with no open item"
    if v["extra"]:
        return "Two open items for one subject"
    if v["ackedStopped"]:
        return "Acknowledged after STOP"
    if v["acks"] > 1:
        return "Acknowledged twice in a day"
    open_items = sorted(s for s, st in v["items"].items() if st != "NONE")
    return "Open: " + ", ".join(open_items) if open_items else "Nothing open"


STEPS = {
    "Arrive": "a message arrives",
    "Claim": "staff claim the item",
    "Resolve": "staff resolve the item",
    "DayPasses": "a day passes",
    "NumberConfirmsAgain": "the number confirms again",
    "PatientsChange": "patients on the number change",
}


def step(action, frm, to):
    return STEPS.get(action, action)
