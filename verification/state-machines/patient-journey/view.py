TITLE = "A patient's day: desk, doctor, pharmacy"


def state(v):
    live = v["visit"] != "none" and not v["visitDeleted"]
    appt = v["appt"]
    if v["bill"] == "CONFIRMED" and v["rx"] == "CANCELLED":
        return "Medicines billed, then the prescription cancelled"
    if appt == "COMPLETED" and not live:
        return "Calendar says completed, patient never seen"
    if live and appt != v["visit"]:
        return "Calendar shows something else while the doctor has the visit"
    if not live:
        return {
            "SCHEDULED": "Booked for today",
            "CONFIRMED": "Booked for today",
            "CHECKED_IN": "Checked in, waiting for the doctor",
            "CANCELLED": "Appointment cancelled",
        }[appt]
    if v["visit"] == "IN_PROGRESS":
        return "With the doctor"
    if v["bill"] == "CONFIRMED":
        return "Visit completed, medicines billed"
    if v["rx"] == "ACTIVE":
        return "Visit completed, prescription at the pharmacy"
    return "Visit completed, nothing to bill"

STEPS = {
    "DeskConfirmsOnCall": "the desk confirms on the call",
    "DeskChecksIn": "the desk checks the patient in",
    "DeskMarksCompleted": "the desk marks the appointment completed",
    "DeskCancels": "the desk cancels the appointment",
    "DoctorStartsVisit": "the doctor starts the visit",
    "DoctorWritesPrescription": "the doctor writes the prescription",
    "DoctorCompletesVisit": "the doctor completes the visit",
    "DoctorDeletesVisit": "the doctor deletes the visit",
    "DoctorCancelsPrescription": "the doctor cancels the prescription",
    "PharmacistReviews": "the pharmacist reviews the medicines",
    "PharmacistBills": "the pharmacist bills the medicines",
    "PharmacistRefreshesQueue": "the queue shows the medicines dispensed",
    "PharmacistMarksDispensed": "the pharmacist marks the medicines dispensed",
}


def step(action, frm, to):
    return STEPS.get(action, action)
