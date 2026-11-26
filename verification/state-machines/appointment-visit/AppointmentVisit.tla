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

   MODE picks the variant. "code" is the code as it is now. "before" is the
   code before the fix, kept as a regression control. "uiOnly" is "before"
   restricted to writes a screen sends. "fixed" is the design the fix started
   from. "editReopens" makes an edit to a completed visit reopen it. The other
   modes each remove one guard from "fixed". *)
EXTENDS Naturals

CONSTANTS MODE, MaxEdits

ASSUME MODE \in {"code", "before", "uiOnly", "fixed", "patchIgnoresVisit", "bulkIgnoresVisit",
                 "checkInFromAnyStatus", "editReopens", "typeProbe"}
ASSUME MaxEdits \in Nat \ {0}

Statuses == {"SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED",
             "CANCELLED", "NO_SHOW"}
Waiting == {"SCHEDULED", "CONFIRMED"}
\* The calendar a status belongs to. CANCELLED belongs to none.
CalendarOf(s) ==
  IF s = "SCHEDULED" THEN "Scheduled" ELSE IF s = "CANCELLED" THEN "None" ELSE "Confirmed"
\* bulkUpdate checks no capacity, so it refuses a row whose new status belongs to a
\* calendar the row is not in.
BulkTargets(f) == {t \in Statuses : CalendarOf(t) = "None" \/ CalendarOf(t) = CalendarOf(f)}
\* The appointment statuses a check-in may start from in the fixed protocol.
CheckInFrom == {"SCHEDULED", "CONFIRMED", "NO_SHOW"}
\* The statuses only the visit writes: starting it and completing it.
VisitStatuses == {"IN_PROGRESS", "COMPLETED"}

\* visit is the live visit linked to the appointment: Visit.status of the row
\* with appointmentId = this appointment and deletedAt null, or none.
VARIABLES appt, visit, notes, checkInPlanned, cancelHeld

vars == <<appt, visit, notes, checkInPlanned, cancelHeld>>

Before == MODE \in {"before", "uiOnly"}
ApiReachable == MODE # "uiOnly"

TypeOK ==
  /\ appt \in Statuses
  /\ visit \in {"none", "open", "done"}
  /\ notes \in 0..MaxEdits
  /\ checkInPlanned \in BOOLEAN
  /\ cancelHeld \in BOOLEAN

\* A desk status write (PATCH or bulk) from status f to status t. Before the
\* fix both accepted any jump. The fixed protocol lets the visit own the
\* appointment's status while a live visit exists, and checks a patient in only
\* from a waiting or missed appointment. The code reads no visit. It refuses to
\* write or leave a status only the visit writes, which an open or completed
\* visit always holds, and checks in from the same statuses as "fixed".
VisitAllows(ignoresVisit) == visit = "none" \/ ignoresVisit
CheckInAllows(f, t) == t # "CHECKED_IN" \/ f \in CheckInFrom \/ MODE = "checkInFromAnyStatus"

CodeAllows(f, t) == f \notin VisitStatuses /\ t \notin VisitStatuses /\ CheckInAllows(f, t)

PatchAllows(f, t) ==
  CASE Before -> TRUE
    [] MODE = "code" -> CodeAllows(f, t)
    [] OTHER -> VisitAllows(MODE = "patchIgnoresVisit") /\ CheckInAllows(f, t)

BulkAllows(f, t) ==
  CASE Before -> TRUE
    [] MODE = "code" -> CodeAllows(f, t)
    [] OTHER -> VisitAllows(MODE = "bulkIgnoresVisit") /\ CheckInAllows(f, t)

\* cancelHeld is true while a cancel stands that nobody who saw it has undone.
\* A deliberate status write by someone looking at the current status sets it
\* by its target.
HeldAfterDeliberate(t) ==
  IF t = "CANCELLED" THEN TRUE ELSE IF appt = "CANCELLED" THEN FALSE ELSE cancelHeld

Init ==
  /\ appt = IF MODE = "typeProbe" THEN "RESCHEDULED" ELSE "SCHEDULED"
  /\ visit = "none"
  /\ notes = 0
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
  /\ UNCHANGED <<checkInPlanned, cancelHeld>>

\* visits.service.ts update: version compare-and-set on an open or completed
\* visit. It writes clinical columns only. "editReopens" is a variant that
\* turns an edit to a completed visit into a reopen of the visit and its
\* appointment.
Reopens == MODE = "editReopens" /\ visit = "done"

DoctorEditsNotes ==
  /\ visit # "none"
  /\ notes < MaxEdits
  /\ notes' = notes + 1
  /\ visit' = IF Reopens THEN "open" ELSE visit
  /\ appt' = IF Reopens THEN "IN_PROGRESS" ELSE appt
  /\ UNCHANGED <<checkInPlanned, cancelHeld>>

\* visits.service.ts complete: lock the visit row, write COMPLETED, then write
\* the appointment COMPLETED by id whatever its status.
DoctorCompletesVisit ==
  /\ visit = "open"
  /\ visit' = "done"
  /\ appt' = "COMPLETED"
  /\ UNCHANGED <<notes, checkInPlanned, cancelHeld>>

\* visits.service.ts remove: soft delete, detach the link, and move an
\* IN_PROGRESS or COMPLETED appointment back to CHECKED_IN. No screen calls it.
VisitIsDeleted ==
  /\ ApiReachable
  /\ visit # "none"
  /\ visit' = "none"
  /\ notes' = 0
  /\ appt' = IF appt \in {"IN_PROGRESS", "COMPLETED"} THEN "CHECKED_IN" ELSE appt
  /\ UNCHANGED <<checkInPlanned, cancelHeld>>

\* appointments.service.ts remove: updateMany to CANCELLED where status is not
\* COMPLETED, IN_PROGRESS or CANCELLED.
DeskCancels ==
  /\ appt \notin {"COMPLETED", "IN_PROGRESS", "CANCELLED"}
  /\ appt' = "CANCELLED"
  /\ cancelHeld' = TRUE
  /\ UNCHANGED <<visit, notes, checkInPlanned>>

\* voice-command.ts matchAppointment: the dialog offers check-in only for an
\* appointment it read as SCHEDULED or CONFIRMED.
DeskPlansCheckIn ==
  /\ ~checkInPlanned
  /\ appt \in Waiting
  /\ checkInPlanned' = TRUE
  /\ UNCHANGED <<appt, visit, notes, cancelHeld>>

\* VoiceCommandDialog.tsx run: PATCH status CHECKED_IN with no expected status.
\* The server compares against its own fresh read, so the write lands on
\* whatever the appointment is now unless a guard refuses it. The desk saw a
\* waiting appointment, so the write never counts as undoing a cancel.
DeskConfirmsCheckIn ==
  /\ checkInPlanned
  /\ checkInPlanned' = FALSE
  /\ appt' = IF PatchAllows(appt, "CHECKED_IN") THEN "CHECKED_IN" ELSE appt
  /\ UNCHANGED <<visit, notes, cancelHeld>>

\* appointments.service.ts update: PATCH any status, compare-and-set on the
\* status read in the same request. No screen sends it except the check-in.
DeskSetsStatus ==
  \E t \in Statuses :
    /\ ApiReachable
    /\ t # appt
    /\ PatchAllows(appt, t)
    /\ appt' = t
    /\ cancelHeld' = HeldAfterDeliberate(t)
    /\ UNCHANGED <<visit, notes, checkInPlanned>>

\* appointments.service.ts bulkUpdate. ADMIN only, no screen sends it. In
\* "code" it compare-and-sets each row on the status it read.
AdminBulkSets ==
  \E t \in BulkTargets(appt) :
    /\ ApiReachable
    /\ t # appt
    /\ BulkAllows(appt, t)
    /\ appt' = t
    /\ cancelHeld' = HeldAfterDeliberate(t)
    /\ UNCHANGED <<visit, notes, checkInPlanned>>

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

\* An edit to a completed visit keeps it completed and leaves its appointment alone.
EditKeepsCompletion ==
  [][visit = "done" /\ visit' # "none" /\ notes' # notes => visit' = "done" /\ appt' = appt]_vars

\* When the two rows disagree, something brings them back into agreement.
DisagreementHeals == [](~StatusesAgree => <>StatusesAgree)
=============================================================================
