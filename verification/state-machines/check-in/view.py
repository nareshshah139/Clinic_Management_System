TITLE = "Follow-up track and check-in"


def _vals(x):
    return list(x.values()) if isinstance(x, dict) else list(x)


def state(v):
    tracks, cis = _vals(v["track"]), _vals(v["ci"])
    if v["badSend"]:
        return "Message sent about a closed check-in"
    if sum(t in ("ACTIVE", "COMPLETED") for t in tracks) > 1:
        return "Two live tracks on one visit"
    if any(t == "STOPPED" and c in ("SCHEDULED", "OPEN") for t, c in zip(tracks, cis)):
        return "Stopped track with a live check-in"
    if v["visit"] == "IN_PROGRESS":
        return "Visit in progress"
    live = [c for t, c in zip(tracks, cis) if t in ("ACTIVE", "COMPLETED")]
    where = "Visit deleted" if v["visit"] == "DELETED" else "Completed"
    return f"{where}, check-in {live[0].lower()}" if live else f"{where}, no live track"


STEPS = {
    "CompleteBegin": "the doctor completes the visit",
    "CompleteCommit": "the completion commits",
    "EditPlan": "the doctor changes the plan",
    "DeleteVisit": "the visit is deleted",
    "StaffArchives": "staff archive the patient",
    "DoctorStops": "the doctor stops the track",
    "Tick": "time passes",
    "SchedulerOpens": "the pass opens the check-in",
    "SchedulerQueues": "the pass queues a message",
    "SchedulerSends": "the pass sends or settles the message",
    "SchedulerCloses": "the pass closes the window",
    "PatientAnswers": "the patient answers",
    "TrackCompletes": "the track completes",
}


def step(action, frm, to):
    return STEPS.get(action, action)
