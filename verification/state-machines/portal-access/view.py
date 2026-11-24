def state(v):
    last = v["last"]
    if last["route"] == "staff" and last["cred"] != "none":
        return "Portal credential on a staff route"
    if last["route"] == "portal" and last["cred"] == "staff":
        return "Staff credential on a portal route"
    if v["perCode"] > 1:
        return "Two sessions from one code"
    if v["deadCommit"]:
        return "Signed in with a dead code"
    if v["issuedIneligible"]:
        return "Code sent to an ineligible number"
    if last["cred"] == "link":
        return "Link reads " + ("an answer" if last["kind"] == "answer" else "questions")
    sess = v["sess"]
    if not sess["alive"]:
        return "Signed out"
    if last["cred"] == "session":
        return "Reading as the chosen profile"
    return "Signed in, no profile chosen" if sess["chosen"] == "none" else "Signed in with a profile"


STEPS = {
    "Issue": "code sent, mistyped or expired",
    "WrongAttempt": "code sent, mistyped or expired",
    "Expire": "code sent, mistyped or expired",
    "Submit": "code sent, mistyped or expired",
    "Commit": "code consumed",
    "Choose": "profile chosen",
    "ReadRecord": "records read",
    "SessionEnds": "session ends",
    "Disable": "staff change",
    "Enable": "staff change",
    "PhoneChange": "staff change",
    "Archive": "staff change",
    "Answer": "check-in moves",
    "NextCheckInOpens": "check-in moves",
    "LinkRead": "task link opened",
    "PortalCredentialOnStaffRoute": "a portal credential on a staff route",
    "StaffCredentialOnPortalRoute": "a staff credential on a portal route",
}


def step(action, frm, to):
    return STEPS.get(action, action)
