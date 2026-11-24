TITLE = "Automated WhatsApp care message"


def state(v):
    last = v["last"]
    if last["sent"]:
        if not (last["consent"] == "OPTED_IN" and last["confirmed"] and last["portal"]):
            return "Sent to a number that has not agreed"
        if last["stopped"]:
            return "Sent after the patient sent STOP"
        if not last["open"]:
            return "Sent about a closed subject"
    if v["sends"] > 1:
        return "Sent twice"
    msg = v["msg"]
    if msg == "FAILED" and v["failedOpen"] and not v["attention"]:
        return "Failed with nobody told"
    return msg.capitalize()


STEPS = {
    "ReceptionRecordsAgreement": "reception records agreement",
    "NumberConfirms": "the number confirms",
    "PatientSendsStop": "the patient sends STOP",
    "PhoneChanges": "staff change the phone",
    "ConsentLapses": "12 months pass with no contact",
    "StaffTogglesPortal": "staff switch the portal",
    "SubjectCloses": "the subject closes",
    "MergeDuplicate": "a duplicate patient is merged in",
    "SchedulerLeases": "the scheduler leases the row",
    "SchedulerSends": "the scheduler sends or settles it",
    "ReceiptDelivered": "a delivered receipt arrives",
    "ReceiptRead": "a read receipt arrives",
    "ProviderFails": "the provider rejects it",
    "NextEvent": "a later event queues a message",
}


def step(action, frm, to):
    return STEPS.get(action, action)
