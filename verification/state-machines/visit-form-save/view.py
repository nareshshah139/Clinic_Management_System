TITLE = "Visit form saving"

SHOWN = {"idle": "Saved", "unsaved": "Unsaved changes", "autosaving": "Saving", "saved": "Saved", "saving": "Saving", "error": "Save failed"}


def state(v):
    if v["visits"] > 1:
        return "Two visits created"
    if v["visits"] == 0:
        return "New visit, not created yet"
    shown = SHOWN.get(v["ind"], v["ind"])
    if v["blocked"]:
        return "Conflict notice, shows Save failed" if v["ind"] == "error" else "Conflict notice, shows no failure"
    return "Shows " + shown


def step(action, frm, to):
    return {
        "YouEditTheVisit": "you edit the visit",
        "AutosaveRuns": "autosave sends",
        "YouSaveDraft": "you press Save Draft",
        "SaveDraftSends": "Save Draft sends",
        "YouCreatePrescription": "you press Create Prescription",
        "PrescriptionSends": "the prescription save sends",
        "TheServerHandlesAutosave": "the server applies autosave",
        "TheServerHandlesSaveDraft": "the server applies Save Draft",
        "TheServerHandlesPrescription": "the server applies the prescription save",
        "AutosaveReplies": "autosave's reply arrives",
        "SaveDraftReplies": "Save Draft's reply arrives",
        "PrescriptionReplies": "the prescription save's reply arrives",
        "ARequestTimesOut": "a save times out",
        "AutosaveFailed": "a save fails",
        "SaveDraftFailed": "a save fails",
        "PrescriptionFailed": "a save fails",
        "SomeoneElseChangesTheVisit": "someone else changes the visit",
        "YouDiscardTheDraft": "you discard the draft and reload",
    }.get(action, action)
