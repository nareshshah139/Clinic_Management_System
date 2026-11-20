--------------------------- MODULE AppointmentVisit ---------------------------
(* One appointment and the live visit linked to it. The two rows write each
   other. Starting a visit moves the appointment to IN_PROGRESS, completing it
   writes COMPLETED, deleting it moves the appointment back to CHECKED_IN. The
   desk changes the appointment through DELETE (cancel), PATCH (any status,
   and the voice check-in) and an admin's bulk update.

   Two actors interleave, the doctor on the visit and the desk on the
   appointment. Every server write is one transaction, guarded by a row lock or
   a compare-and-set on a fresh read, so each server call is one atomic step.
   The voice check-in is the exception: the desk's screen picks the appointment
   from a list read earlier, and the PATCH carries no expected status. That is
   a client read then a server write, so it is two steps.

   MODE picks the variant. "code" is today. "uiOnly" is today restricted to
   writes a screen sends. "fixed" adds the smallest guards that make every rule
   hold. The other modes each remove one guard from "fixed". *)
EXTENDS Naturals

CONSTANTS MODE, MaxEdits

ASSUME MODE \in {"code", "uiOnly", "fixed", "patchIgnoresVisit", "bulkIgnoresVisit",
                 "checkInFromAnyStatus", "editAfterComplete", "typeProbe"}
ASSUME MaxEdits \in Nat \ {0}

Statuses == {"SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED",
             "CANCELLED", "NO_SHOW"}
Waiting == {"SCHEDULED", "CONFIRMED"}
\* bulkUpdate refuses targets that need a capacity check.
BulkTargets == Statuses \ Waiting
\* The appointment statuses a check-in may start from in the fixed protocol.
CheckInFrom == {"SCHEDULED", "CONFIRMED", "NO_SHOW"}

\* visit is the live visit linked to the appointment: Visit.status of the row
\* with appointmentId = this appointment and deletedAt null, or none.
VARIABLES appt, visit, notes, signed, checkInPlanned, cancelHeld

vars == <<appt, visit, notes, signed, checkInPlanned, cancelHeld>>

CodeLike == MODE \in {"code", "uiOnly"}
ApiReachable == MODE # "uiOnly"

TypeOK ==
  /\ appt \in Statuses
  /\ visit \in {"none", "open", "done"}
  /\ notes \in 0..MaxEdits
  /\ signed \in 0..MaxEdits
  /\ checkInPlanned \in BOOLEAN
  /\ cancelHeld \in BOOLEAN

\* A desk status write (PATCH or bulk) from status f to status t. Today both
\* accept any jump. The fixed protocol lets the visit own the appointment's
\* status while a live visit exists, and checks a patient in only from a
\* waiting or missed appointment.
VisitAllows(ignoresVisit) == visit = "none" \/ ignoresVisit
CheckInAllows(f, t) == t # "CHECKED_IN" \/ f \in CheckInFrom \/ MODE = "checkInFromAnyStatus"

PatchAllows(f, t) ==
  CodeLike \/ (VisitAllows(MODE = "patchIgnoresVisit") /\ CheckInAllows(f, t))

BulkAllows(f, t) ==
  CodeLike \/ (VisitAllows(MODE = "bulkIgnoresVisit") /\ CheckInAllows(f, t))

\* visits.service.ts update never reads the visit status.
EditAllowed == visit = "open" \/ (visit = "done" /\ (CodeLike \/ MODE = "editAfterComplete"))

\* cancelHeld is true while a cancel stands that nobody who saw it has undone.
\* A deliberate status write by someone looking at the current status sets it
\* by its target.
HeldAfterDeliberate(t) ==
  IF t = "CANCELLED" THEN TRUE ELSE IF appt = "CANCELLED" THEN FALSE ELSE cancelHeld

Init ==
  /\ appt = IF MODE = "typeProbe" THEN "RESCHEDULED" ELSE "SCHEDULED"
  /\ visit = "none"
  /\ notes = 0
  /\ signed = 0
  /\ checkInPlanned = FALSE
  /\ cancelHeld = FALSE

\* visits.service.ts create: lock the appointment row, refuse CANCELLED and
\* COMPLETED and a second live visit, create the visit, write IN_PROGRESS.
DoctorStartsVisit ==
  /\ visit = "none"
  /\ appt \notin {"CANCELLED", "COMPLETED"}
  /\ visit' = "open"
  /\ appt' = "IN_PROGRESS"
  /\ notes' = 0
  /\ signed' = 0
  /\ UNCHANGED <<checkInPlanned, cancelHeld>>

\* visits.service.ts update: version compare-and-set, no status check.
DoctorEditsNotes ==
  /\ visit # "none"
  /\ EditAllowed
  /\ notes < MaxEdits
  /\ notes' = notes + 1
  /\ UNCHANGED <<appt, visit, signed, checkInPlanned, cancelHeld>>

\* visits.service.ts complete: lock the visit row, write COMPLETED, then write
\* the appointment COMPLETED by id whatever its status.
DoctorCompletesVisit ==
  /\ visit = "open"
  /\ visit' = "done"
  /\ signed' = notes
  /\ appt' = "COMPLETED"
  /\ UNCHANGED <<notes, checkInPlanned, cancelHeld>>

\* visits.service.ts remove: soft delete, detach the link, and move an
\* IN_PROGRESS or COMPLETED appointment back to CHECKED_IN. No screen calls it.
VisitIsDeleted ==
  /\ ApiReachable
  /\ visit # "none"
  /\ visit' = "none"
  /\ notes' = 0
  /\ signed' = 0
  /\ appt' = IF appt \in {"IN_PROGRESS", "COMPLETED"} THEN "CHECKED_IN" ELSE appt
  /\ UNCHANGED <<checkInPlanned, cancelHeld>>

\* appointments.service.ts remove: updateMany to CANCELLED where status is not
\* COMPLETED, IN_PROGRESS or CANCELLED.
DeskCancels ==
  /\ appt \notin {"COMPLETED", "IN_PROGRESS", "CANCELLED"}
  /\ appt' = "CANCELLED"
  /\ cancelHeld' = TRUE
  /\ UNCHANGED <<visit, notes, signed, checkInPlanned>>

\* voice-command.ts matchAppointment: the dialog offers check-in only for an
\* appointment it read as SCHEDULED or CONFIRMED.
DeskPlansCheckIn ==
  /\ ~checkInPlanned
  /\ appt \in Waiting
  /\ checkInPlanned' = TRUE
  /\ UNCHANGED <<appt, visit, notes, signed, cancelHeld>>

\* VoiceCommandDialog.tsx run: PATCH status CHECKED_IN with no expected status.
\* The server compares against its own fresh read, so the write lands on
\* whatever the appointment is now. The desk saw a waiting appointment, so the
\* write never counts as undoing a cancel.
DeskConfirmsCheckIn ==
  /\ checkInPlanned
  /\ checkInPlanned' = FALSE
  /\ appt' = IF PatchAllows(appt, "CHECKED_IN") THEN "CHECKED_IN" ELSE appt
  /\ UNCHANGED <<visit, notes, signed, cancelHeld>>

\* appointments.service.ts update: PATCH any status, compare-and-set on the
\* status read in the same request. No screen sends it except the check-in.
DeskSetsStatus ==
  \E t \in Statuses :
    /\ ApiReachable
    /\ t # appt
    /\ PatchAllows(appt, t)
    /\ appt' = t
    /\ cancelHeld' = HeldAfterDeliberate(t)
    /\ UNCHANGED <<visit, notes, signed, checkInPlanned>>

\* appointments.service.ts bulkUpdate: updateMany by id with no status
\* predicate. ADMIN only, no screen sends it.
AdminBulkSets ==
  \E t \in BulkTargets :
    /\ ApiReachable
    /\ t # appt
    /\ BulkAllows(appt, t)
    /\ appt' = t
    /\ cancelHeld' = HeldAfterDeliberate(t)
    /\ UNCHANGED <<visit, notes, signed, checkInPlanned>>

Next ==
  \/ DoctorStartsVisit
  \/ DoctorEditsNotes
  \/ DoctorCompletesVisit
  \/ VisitIsDeleted
  \/ DeskCancels
  \/ DeskPlansCheckIn
  \/ DeskConfirmsCheckIn
  \/ DeskSetsStatus
  \/ AdminBulkSets

\* No step in this lifecycle happens with nobody acting: no timer, cron or
\* reconciler touches either row. The spec has no fairness.
Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Rules *)

\* The appointment shows what its live visit is doing.
StatusesAgree ==
  /\ visit = "open" => appt = "IN_PROGRESS"
  /\ visit = "done" => appt = "COMPLETED"

\* A cancel stands until someone looking at the cancelled appointment undoes it.
NoResurrection == cancelHeld => appt = "CANCELLED"

\* A completed visit's clinical notes stay as they were when it was completed.
CompletedVisitFrozen == visit = "done" => notes = signed

\* When the two rows disagree, something brings them back into agreement.
DisagreementHeals == [](~StatusesAgree => <>StatusesAgree)
=============================================================================
