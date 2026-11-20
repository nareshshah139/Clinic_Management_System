SPEC = "PatientJourney.tla"
CONSTANTS = {}

CONTROLS = {
    "checkInOverVisit": "CalendarFollowsVisit",
    "cancelAnyStatus": "CalendarFollowsVisit",
    "patchCompletes": "CompletedOnlyAfterVisit",
    "visitFromClosedBooking": "VisitStartsFromOpenBooking",
    "deleteWithRx": "NoOrphanPrescription",
    "billWithoutEligibility": "BillOnlyForActivePrescription",
    "cancelBilledRx": "BilledPrescriptionStaysActive",
    "manualDispense": "DispensedOnlyWhenBilled",
}

MODES = {m: {"MODE": f'"{m}"'} for m in ["code", "fixed", "typeProbe", *CONTROLS]}

RULES = {
    "TypeOK": "invariant",
    "CalendarFollowsVisit": "invariant",
    "CompletedOnlyAfterVisit": "invariant",
    "VisitStartsFromOpenBooking": "invariant",
    "NoOrphanPrescription": "invariant",
    "BillOnlyForActivePrescription": "invariant",
    "BilledPrescriptionStaysActive": "invariant",
    "DispensedOnlyWhenBilled": "invariant",
    "PatientLeavesServed": "property",
}

RULE_TEXT = {
    "TypeOK": "Every status column holds one of its real values.",
    "CalendarFollowsVisit": "While the doctor has the visit, the calendar shows the patient in consultation, and once the visit is completed it shows completed.",
    "CompletedOnlyAfterVisit": "The calendar shows an appointment completed only when its visit is completed.",
    "VisitStartsFromOpenBooking": "A visit never starts from a cancelled or completed appointment.",
    "NoOrphanPrescription": "A prescription always belongs to a visit that has not been deleted.",
    "BillOnlyForActivePrescription": "A pharmacy bill posts only against an active prescription.",
    "BilledPrescriptionStaysActive": "Once medicines are billed against a prescription, the prescription is not cancelled.",
    "DispensedOnlyWhenBilled": "The pharmacy queue marks a prescription dispensed only after its bill has posted.",
    "PatientLeavesServed": "A patient who has arrived either leaves with the visit completed and the medicines billed, or is turned away by a cancellation.",
}

ALL_HOLD = {r: "holds" for r in RULES}
EXPECT = {
    "code": {**ALL_HOLD, "CalendarFollowsVisit": "breaks", "CompletedOnlyAfterVisit": "breaks",
             "BilledPrescriptionStaysActive": "breaks", "PatientLeavesServed": "breaks"},
    "fixed": ALL_HOLD,
    "typeProbe": {"TypeOK": "breaks"},
    **{mode: {rule: "breaks"} for mode, rule in CONTROLS.items()},
}
EXPECT["patchCompletes"]["PatientLeavesServed"] = "breaks"

CHARTS = ["code", "fixed"]

REPLAY = "backend/src/modules/visits/tests/patient-journey.formal-replay.database.spec.ts"
REPLAYS = {rule: REPLAY for rule, verdict in EXPECT["code"].items() if verdict == "breaks"}
