TITLE = "Inventory document outcome"


def state(v):
    k = v["k"]
    if k == "new":
        return "New draft, not saved" if v["pc"] == "idle" else "New draft, saving"
    if k == "loading":
        return "Checking saved record"
    if k == "loadFailed":
        return "Saved record unavailable"
    if k == "known":
        return "Stock loss posted" if v["shownPosted"] else "Draft saved"
    busy = v["pc"] not in ("idle", "load")
    return "Outcome not confirmed, waiting" if busy else "Outcome not confirmed"


def step(action, frm, to):
    return {
        "YouSaveTheNewDraft": "you save the new draft",
        "YouPostStock": "you post the stock loss",
        "YouCheckSavedStatus": "you check saved status",
        "YouReloadThePage": "you reload the page",
        "TheServerAnswers": "the server answers",
        "Fail": "a request fails",
        "AnOldRequestLands": "an earlier request lands",
        "AnotherUserSaves": "another user saves it",
    }.get(action, action)
