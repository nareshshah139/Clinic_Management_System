TITLE = "Purchase import attempt"


def state(v):
    status, link = v["status"], v["link"]
    if status == "ABSENT":
        return "No import yet"
    if status == "RUNNING":
        if v["saved"]:
            return "Import running, saved bill not recorded"
        if any(pc == "crashed" for pc in v["pc"].values()) and not any(
            pc in ("extracting", "saving", "binding", "checking", "posting", "finishing") for pc in v["pc"].values()
        ):
            return "Import running, worker gone"
        return "Import running"
    if status == "INVOICE_SAVED":
        if link == "other":
            return "Matched an existing bill"
        return "Stock added from the bill" if v["committed"] else "Draft bill saved"
    if status == "NO_STOCK_WRITTEN":
        return "Stopped, but a bill was saved" if v["saved"] else "Stopped, no stock"
    return "Intake blocked after a saved bill" if link == "mine" else "Intake blocked, stock unverified"


def _who(frm, to):
    for w, pc in frm["pc"].items():
        if to["pc"][w] != pc:
            return w
    return None


def step(action, frm, to):
    if action == "WorkerRegisters":
        return "the upload registers the import"
    if action == "OcrReadsBill":
        return "OCR reads the bill"
    if action == "WorkerSavesDraft":
        return "the worker saves the draft bill"
    if action == "WorkerBindsDraft":
        return "the worker records the saved bill"
    if action == "WorkerReadsBill":
        return "the worker opens the saved bill"
    if action == "WorkerAddsStock":
        return "the worker adds stock"
    if action == "WorkerRecordsOutcome":
        return "the worker records the outcome"
    if action == "WorkerDies":
        return "the worker process dies"
    if action == "PharmacistOpensDraft":
        return "the pharmacist opens the draft"
    if action == "PharmacistAddsStock":
        return "the pharmacist presses Add to stock"
    if action == "PharmacistStopsImport":
        return "the pharmacist stops the import"
    if action == "ManagerRecovers":
        if to["link"] == "other" or to["status"] == "RETRY_REJECTED":
            return "a manager recovers it with another bill's original open"
        return "a manager recovers the import"
    return action
