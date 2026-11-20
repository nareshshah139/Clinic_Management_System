---------------------------- MODULE PatientJourney ----------------------------
(* One patient's day across the desk, the doctor and the pharmacy.
   Each variable is one real status column. Each action is one endpoint or
   service call by a named role. The internals and races of each subsystem
   live in the sibling models (appointment-visit, prescriptions,
   dispense-queue); this model checks the hand-offs between them. *)
EXTENDS Naturals

CONSTANT MODE

VARIABLES appt, visit, visitDeleted, deletions, rx, task, bill, startedFrom, rxAtBill

vars == <<appt, visit, visitDeleted, deletions, rx, task, bill, startedFrom, rxAtBill>>

ApptStatus  == {"SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "CANCELLED"}
VisitStatus == {"none", "IN_PROGRESS", "COMPLETED"}
RxStatus    == {"none", "ACTIVE", "CANCELLED"}
TaskStatus  == {"none", "QUEUED", "READY_TO_BILL", "DISPENSED"}
BillStatus  == {"none", "CONFIRMED"}

\* "before" is the code before the fix, kept as a regression control.
Before == MODE \in {"before", "typeProbe"}
\* A guard the fix adds is on outside "before", except in the control that removes it.
FixGuard(control) == ~Before /\ MODE /= control
\* A guard the code already has is on everywhere, except in the control that removes it.
CodeGuard(control) == MODE /= control

LiveVisit == visit /= "none" /\ ~visitDeleted
RxDispensable == rx = "ACTIVE" /\ LiveVisit

TypeOK ==
  /\ appt \in ApptStatus
  /\ visit \in VisitStatus
  /\ visitDeleted \in BOOLEAN
  /\ deletions \in 0..1
  /\ rx \in RxStatus
  /\ task \in TaskStatus
  /\ bill \in BillStatus
  /\ startedFrom \in {"none"} \cup ApptStatus
  /\ rxAtBill \in RxStatus

Init ==
  /\ appt \in {"SCHEDULED", "CONFIRMED"}
  /\ visit = "none"
  /\ visitDeleted = FALSE
  /\ deletions = 0
  /\ rx = "none"
  /\ task = "none"
  /\ bill = IF MODE = "typeProbe" THEN "LOST" ELSE "none"
  /\ startedFrom = "none"
  /\ rxAtBill = "none"

(* Receptionist *)

DeskConfirmsOnCall ==
  /\ appt = "SCHEDULED"
  /\ appt' = "CONFIRMED"
  /\ UNCHANGED <<visit, visitDeleted, deletions, rx, task, bill, startedFrom, rxAtBill>>

\* PATCH /appointments/:id {status: CHECKED_IN}, sent by the voice check-in.
\* The server compares the status it read itself, not the one the desk saw.
\* The code also checks in only a scheduled or confirmed appointment.
DeskChecksIn ==
  /\ appt /= "CHECKED_IN"
  /\ FixGuard("checkInOverVisit") => appt \notin {"IN_PROGRESS", "COMPLETED"}
  /\ MODE = "code" => appt \in {"SCHEDULED", "CONFIRMED"}
  /\ appt' = "CHECKED_IN"
  /\ UNCHANGED <<visit, visitDeleted, deletions, rx, task, bill, startedFrom, rxAtBill>>

\* PATCH /appointments/:id or POST /appointments/bulk-update {status: COMPLETED}.
DeskMarksCompleted ==
  /\ ~FixGuard("patchCompletes")
  /\ appt /= "COMPLETED"
  /\ appt' = "COMPLETED"
  /\ UNCHANGED <<visit, visitDeleted, deletions, rx, task, bill, startedFrom, rxAtBill>>

\* DELETE /appointments/:id, an updateMany filtered by status.
DeskCancels ==
  /\ appt /= "CANCELLED"
  /\ CodeGuard("cancelAnyStatus") => appt \notin {"IN_PROGRESS", "COMPLETED"}
  /\ appt' = "CANCELLED"
  /\ UNCHANGED <<visit, visitDeleted, deletions, rx, task, bill, startedFrom, rxAtBill>>

(* Doctor *)

\* POST /visits with appointmentId.
DoctorStartsVisit ==
  /\ ~LiveVisit
  /\ CodeGuard("visitFromClosedBooking") => appt \notin {"CANCELLED", "COMPLETED"}
  /\ visit' = "IN_PROGRESS"
  /\ visitDeleted' = FALSE
  /\ appt' = "IN_PROGRESS"
  /\ startedFrom' = appt
  /\ UNCHANGED <<deletions, rx, task, bill, rxAtBill>>

\* POST /prescriptions, which then pulls the prescription into the pharmacy queue.
DoctorWritesPrescription ==
  /\ LiveVisit
  /\ rx = "none"
  /\ rx' = "ACTIVE"
  /\ task' = "QUEUED"
  /\ UNCHANGED <<appt, visit, visitDeleted, deletions, bill, startedFrom, rxAtBill>>

\* POST /visits/:id/complete writes the appointment COMPLETED by id.
DoctorCompletesVisit ==
  /\ visit = "IN_PROGRESS"
  /\ ~visitDeleted
  /\ visit' = "COMPLETED"
  /\ appt' = "COMPLETED"
  /\ UNCHANGED <<visitDeleted, deletions, rx, task, bill, startedFrom, rxAtBill>>

\* DELETE /visits/:id. One deletion keeps the model finite without blocking a restart.
DoctorDeletesVisit ==
  /\ LiveVisit
  /\ deletions = 0
  /\ CodeGuard("deleteWithRx") => rx = "none"
  /\ visitDeleted' = TRUE
  /\ deletions' = 1
  /\ appt' = IF appt \in {"IN_PROGRESS", "COMPLETED"} THEN "CHECKED_IN" ELSE appt
  /\ UNCHANGED <<visit, rx, task, bill, startedFrom, rxAtBill>>

\* DELETE /prescriptions/:id.
DoctorCancelsPrescription ==
  /\ rx = "ACTIVE"
  /\ LiveVisit
  /\ FixGuard("cancelBilledRx") => bill = "none"
  /\ rx' = "CANCELLED"
  /\ UNCHANGED <<appt, visit, visitDeleted, deletions, task, bill, startedFrom, rxAtBill>>

(* Pharmacist *)

\* PATCH /pharmacy/dispense-tasks/:id/lines/:lineId for each line, then status READY_TO_BILL.
PharmacistReviews ==
  /\ task = "QUEUED"
  /\ RxDispensable
  /\ task' = "READY_TO_BILL"
  /\ UNCHANGED <<appt, visit, visitDeleted, deletions, rx, bill, startedFrom, rxAtBill>>

\* POST /pharmacy/invoices/checkout with prescriptionId posts stock and issues the bill number.
PharmacistBills ==
  /\ bill = "none"
  /\ rx /= "none"
  /\ CodeGuard("billWithoutEligibility") => RxDispensable
  /\ bill' = "CONFIRMED"
  /\ rxAtBill' = rx
  /\ UNCHANGED <<appt, visit, visitDeleted, deletions, rx, task, startedFrom>>

\* POST /pharmacy/prescription-queue/:id/pull syncs the task from posted bills.
PharmacistRefreshesQueue ==
  /\ bill = "CONFIRMED"
  /\ task \in {"QUEUED", "READY_TO_BILL"}
  /\ RxDispensable
  /\ task' = "DISPENSED"
  /\ UNCHANGED <<appt, visit, visitDeleted, deletions, rx, bill, startedFrom, rxAtBill>>

\* PATCH /pharmacy/dispense-tasks/:id/status {status: DISPENSED}, refused by the code.
PharmacistMarksDispensed ==
  /\ ~CodeGuard("manualDispense")
  /\ task \in {"QUEUED", "READY_TO_BILL"}
  /\ task' = "DISPENSED"
  /\ UNCHANGED <<appt, visit, visitDeleted, deletions, rx, bill, startedFrom, rxAtBill>>

Next ==
  \/ DeskConfirmsOnCall
  \/ DeskChecksIn
  \/ DeskMarksCompleted
  \/ DeskCancels
  \/ DoctorStartsVisit
  \/ DoctorWritesPrescription
  \/ DoctorCompletesVisit
  \/ DoctorDeletesVisit
  \/ DoctorCancelsPrescription
  \/ PharmacistReviews
  \/ PharmacistBills
  \/ PharmacistRefreshesQueue
  \/ PharmacistMarksDispensed

\* The flow's assumption, not the code's: each role eventually takes its next forward step.
FlowFairness ==
  /\ WF_vars(DoctorStartsVisit)
  /\ WF_vars(DoctorWritesPrescription)
  /\ WF_vars(DoctorCompletesVisit)
  /\ WF_vars(PharmacistReviews)
  /\ WF_vars(PharmacistBills)
  /\ WF_vars(PharmacistRefreshesQueue)

Spec == Init /\ [][Next]_vars /\ FlowFairness

(* Rules *)

CalendarFollowsVisit == LiveVisit => appt = visit

CompletedOnlyAfterVisit == appt = "COMPLETED" => (LiveVisit /\ visit = "COMPLETED")

VisitStartsFromOpenBooking == startedFrom \notin {"CANCELLED", "COMPLETED"}

NoOrphanPrescription == rx /= "none" => ~visitDeleted

BillOnlyForActivePrescription == rxAtBill \in {"none", "ACTIVE"}

BilledPrescriptionStaysActive == bill = "CONFIRMED" => rx = "ACTIVE"

DispensedOnlyWhenBilled == task = "DISPENSED" => bill = "CONFIRMED"

Arrived == appt = "CHECKED_IN" \/ visit /= "none"
Served == LiveVisit /\ visit = "COMPLETED" /\ (bill = "CONFIRMED" \/ rx = "CANCELLED")
TurnedAway == appt = "CANCELLED" /\ ~LiveVisit

PatientLeavesServed == Arrived ~> (Served \/ TurnedAway)
=============================================================================
