TITLE = "Appointment and its visit"


def state(v):
    appt, visit = v["appt"], v["visit"]
    if v["cancelHeld"] and appt != "CANCELLED":
        return "Cancelled appointment back in use"
    if visit == "open":
        return "Visit open" if appt == "IN_PROGRESS" else "Visit open, appointment shows otherwise"
    if visit == "done":
        return "Visit completed" if appt == "COMPLETED" else "Visit completed, appointment shows otherwise"
    return "Cancelled" if appt == "CANCELLED" else "Waiting, no visit"


STEPS = {
    "DoctorStartsVisit": "the doctor starts the visit",
    "DoctorEditsNotes": "the doctor edits the notes",
    "DoctorCompletesVisit": "the doctor completes the visit",
    "VisitIsDeleted": "the visit is deleted",
    "DeskCancels": "the desk cancels",
    "DeskPlansCheckIn": "the desk prepares a voice check-in",
    "DeskConfirmsCheckIn": "the desk confirms the voice check-in",
    "DeskSetsStatus": "the desk edits the status",
    "AdminBulkSets": "an admin bulk-updates the status",
}


def step(action, frm, to):
    return STEPS.get(action, action)
