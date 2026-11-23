TITLE = "Prescription pad save with an idempotency key"

CLIENT = {
    "idle": "Doctor writing",
    "waiting": "Saving",
    "done": "Saved",
    "gaveUp": "Save failed or timed out",
    "lost": "Unknown screen",
}

STEPS = {
    "DoctorSavesNew": "the doctor saves a new prescription",
    "DoctorSavesAgain": "the doctor presses save again",
    "BrowserTimesOut": "the save times out after 30 seconds",
    "BrowserGetsAnswer": "the screen shows the server's answer",
    "ServerLooksUpKey": "the server checks the key",
    "ServerClaimsKey": "the server claims the key",
    "ServerCreatesPrescription": "the server creates a visit and prescription",
    "ServerStoresResponse": "the server stores the response",
    "ServerFails": "the server fails",
}


def _duplicated(v):
    made = v["made"]
    return any(made.count(o) > 1 for o in set(made))


def _stale(v):
    got = v["got"]
    items = got.items() if isinstance(got, dict) else enumerate(got, start=1)
    return any(g["kind"] == "ok" and v["made"][g["id"] - 1] != int(o) for o, g in items)


def state(v):
    text = CLIENT.get(v["client"], v["client"])
    notes = []
    if _duplicated(v):
        notes.append("two prescriptions for one save")
    if _stale(v):
        notes.append("an old prescription shown as new")
    return f"{text}, {' and '.join(notes)}" if notes else text


def step(action, frm, to):
    return STEPS.get(action, action)
