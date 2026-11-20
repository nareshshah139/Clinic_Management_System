TITLE = "Stock count sheet autosave"


def state(v):
    if not v["mounted"]:
        return "Sheet closed, a count was lost" if v["dropped"] else "Sheet closed"
    shown = {"saved": "Saved", "saving": "Saving", "failed": "Not saved"}.get(v["ind"], v["ind"])
    if v["ind"] == "failed":
        return "Shows Not saved"
    if v["flights"]:
        work = "request out"
    elif v["dirty"] and not v["valid"]:
        work = "bad count typed"
    elif v["dirty"]:
        work = "count waiting"
    else:
        work = "all sent"
    return f"Shows {shown}, {work}"


def step(action, frm, to):
    return {
        "YouTypeACount": "you type a count",
        "TheSheetSaves": "the sheet saves",
        "ServerAnswers": "the server answers",
        "TheSaveFails": "the save fails",
        "TheSaveTimesOut": "the save times out",
        "TheReloadArrives": "the sheet reloads",
        "AnotherWindowSaves": "another window saves",
        "YouLeaveTheSheet": "you go back to the list",
    }.get(action, action)
