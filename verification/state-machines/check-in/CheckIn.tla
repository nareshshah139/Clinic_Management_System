------------------------------ MODULE CheckIn ------------------------------
(* One visit, the follow-up tracks it creates, and one check-in on each track.

   Completing the visit with a plan creates a track and its check-in inside
   the completion transaction, after the visit row lock. Editing a completed
   visit to another plan stops the live track (cancelling its open and
   scheduled check-ins) and creates the next one. Deleting the visit, staff
   archiving the patient, and the doctor stopping a track stop it the same way.

   The scheduler pass opens a due check-in, queues its opened message and one
   reminder, sends (re-reading the check-in at send time), and closes a check-in
   whose window has ended. clock is the time of the one window: 0 before it,
   1 inside it, 2 after its close, 3 later.
   canSend says whether any message can reach the patient at all (no consent,
   provider down). fullWindow[s] says a whole send window has passed while s was open;
   badSend is a ghost. *)
EXTENDS Naturals

CONSTANTS MODE

Modes == {"code", "fixed", "noGuard", "editKeepsOld", "noSubjectCheck",
          "openNeedsSend", "closeNeedsSend", "stopLeavesOpen", "typeProbe"}
ASSUME MODE \in Modes

Slots == 1..2
TrackStates == {"NONE", "ACTIVE", "COMPLETED", "STOPPED"}
CheckInStates == {"NONE", "SCHEDULED", "OPEN", "ANSWERED", "MISSED", "CANCELLED"}
Terminal == {"ANSWERED", "MISSED", "CANCELLED"}
MsgStates == {"NONE", "QUEUED", "SENT", "EXPIRED", "SUPPRESSED"}

VARIABLES visit, inflight, track, ci, msg, reminded, fullWindow, clock, canSend, badSend

vars == <<visit, inflight, track, ci, msg, reminded, fullWindow, clock, canSend, badSend>>

Guarded == MODE # "noGuard"              \* row lock + partial unique index
StopsOld == MODE # "editKeepsOld"
ChecksSubject == MODE # "noSubjectCheck"
OpensWithoutSend == MODE # "openNeedsSend"
ClosesWithoutSend == MODE # "closeNeedsSend"
StopCancels == MODE # "stopLeavesOpen"

Init ==
    /\ visit = "IN_PROGRESS" /\ inflight = 0
    /\ track = [s \in Slots |-> "NONE"] /\ ci = [s \in Slots |-> "NONE"]
    /\ msg = [s \in Slots |-> "NONE"] /\ reminded = [s \in Slots |-> FALSE]
    /\ fullWindow = [s \in Slots |-> FALSE] /\ clock = 0
    /\ canSend \in BOOLEAN /\ badSend = FALSE

NotStopped(s) == track[s] \in {"ACTIVE", "COMPLETED"}
Free == {s \in Slots : track[s] = "NONE"}
Messages == UNCHANGED <<msg, reminded, fullWindow, badSend>>

\* Stop every track in `which` and create a track in slot n (0 = none).
Restart(which, n, cancel) ==
    /\ track' = [s \in Slots |-> IF s = n THEN "ACTIVE"
                                 ELSE IF s \in which THEN "STOPPED" ELSE track[s]]
    /\ ci' = [s \in Slots |-> IF s = n THEN "SCHEDULED"
                              ELSE IF s \in which /\ cancel /\ ci[s] \notin Terminal THEN "CANCELLED"
                              ELSE ci[s]]

Live == {s \in Slots : NotStopped(s)}

\* A completion request takes the visit row lock; without the guard two run at once.
CompleteBegin ==
    /\ visit = "IN_PROGRESS" /\ inflight < 2 /\ (inflight = 0 \/ ~Guarded)
    /\ inflight' = inflight + 1
    /\ UNCHANGED <<visit, track, ci, clock, canSend>> /\ Messages

CompleteCommit(withPlan) ==
    /\ inflight > 0 /\ inflight' = inflight - 1
    /\ IF Guarded /\ visit = "COMPLETED"
         THEN UNCHANGED <<visit, track, ci>>
         ELSE /\ visit' = "COMPLETED"
              /\ IF withPlan /\ Free # {} /\ (~Guarded \/ Live = {})
                   THEN \E n \in Free : Restart({}, n, TRUE)
                   ELSE UNCHANGED <<track, ci>>
    /\ UNCHANGED <<clock, canSend>> /\ Messages

EditPlan(withPlan) ==
    /\ visit = "COMPLETED" /\ inflight = 0
    /\ LET stop == IF StopsOld THEN Live ELSE {} IN
         IF withPlan
           THEN Free # {} /\ \E n \in Free : Restart(stop, n, TRUE)
           ELSE Live # {} /\ Restart(stop, 0, TRUE)
    /\ UNCHANGED <<visit, inflight, clock, canSend>> /\ Messages

DeleteVisit ==
    /\ visit # "DELETED" /\ inflight = 0
    /\ visit' = "DELETED" /\ Restart(Live, 0, StopCancels)
    /\ UNCHANGED <<inflight, clock, canSend>> /\ Messages

StaffArchives ==
    /\ Live # {} /\ Restart(Live, 0, StopCancels)
    /\ UNCHANGED <<visit, inflight, clock, canSend>> /\ Messages

DoctorStops(s) ==
    /\ track[s] = "ACTIVE" /\ Restart({s}, 0, StopCancels)
    /\ UNCHANGED <<visit, inflight, clock, canSend>> /\ Messages

\* Time keeps passing while any check-in is open.
Tick ==
    /\ clock < 3 \/ \E s \in Slots : ci[s] = "OPEN" /\ ~fullWindow[s]
    /\ clock' = IF clock < 3 THEN clock + 1 ELSE clock
    /\ fullWindow' = [s \in Slots |-> fullWindow[s] \/ ci[s] = "OPEN"]
    /\ UNCHANGED <<visit, inflight, track, ci, canSend, msg, reminded, badSend>>

SchedulerOpens(s) ==
    /\ ci[s] = "SCHEDULED" /\ clock >= 1 /\ (OpensWithoutSend \/ canSend)
    /\ ci' = [ci EXCEPT ![s] = "OPEN"]
    /\ UNCHANGED <<visit, inflight, track, msg, reminded, fullWindow, clock, canSend, badSend>>

SchedulerQueues(s) ==
    /\ ci[s] = "OPEN"
    /\ \/ msg[s] = "NONE"
       \/ msg[s] = "SENT" /\ ~reminded[s] /\ reminded' = [reminded EXCEPT ![s] = TRUE]
    /\ msg' = [msg EXCEPT ![s] = "QUEUED"]
    /\ IF msg[s] = "NONE" THEN UNCHANGED reminded ELSE TRUE
    /\ UNCHANGED <<visit, inflight, track, ci, fullWindow, clock, canSend, badSend>>

SchedulerSends(s) ==
    /\ msg[s] = "QUEUED"
    /\ IF ChecksSubject /\ ci[s] # "OPEN"
         THEN msg' = [msg EXCEPT ![s] = "EXPIRED"] /\ UNCHANGED badSend
         ELSE IF ~canSend
           THEN msg' = [msg EXCEPT ![s] = "SUPPRESSED"] /\ UNCHANGED badSend
           ELSE msg' = [msg EXCEPT ![s] = "SENT"] /\ badSend' = (badSend \/ ci[s] # "OPEN")
    /\ UNCHANGED <<visit, inflight, track, ci, reminded, fullWindow, clock, canSend>>

\* A check-in that opened late stays open through one whole window.
SchedulerCloses(s) ==
    /\ ci[s] = "OPEN" /\ clock >= 2 /\ fullWindow[s]
    /\ (ClosesWithoutSend \/ msg[s] = "SENT")
    /\ ci' = [ci EXCEPT ![s] = "MISSED"]
    /\ UNCHANGED <<visit, inflight, track, clock, canSend>> /\ Messages

PatientAnswers(s) ==
    /\ ci[s] = "OPEN" /\ ci' = [ci EXCEPT ![s] = "ANSWERED"]
    /\ UNCHANGED <<visit, inflight, track, clock, canSend>> /\ Messages

TrackCompletes(s) ==
    /\ track[s] = "ACTIVE" /\ ci[s] \in Terminal
    /\ track' = [track EXCEPT ![s] = "COMPLETED"]
    /\ UNCHANGED <<visit, inflight, ci, clock, canSend>> /\ Messages

Next ==
    \/ CompleteBegin \/ \E p \in BOOLEAN : CompleteCommit(p) \/ EditPlan(p)
    \/ DeleteVisit \/ StaffArchives \/ Tick
    \/ \E s \in Slots : \/ DoctorStops(s) \/ SchedulerOpens(s) \/ SchedulerQueues(s)
                        \/ SchedulerSends(s) \/ SchedulerCloses(s) \/ PatientAnswers(s)
                        \/ TrackCompletes(s)

Fairness ==
    /\ WF_vars(Tick)
    /\ WF_vars(\E p \in BOOLEAN : CompleteCommit(p))
    /\ \A s \in Slots : /\ WF_vars(SchedulerOpens(s)) /\ WF_vars(SchedulerQueues(s))
                        /\ WF_vars(SchedulerSends(s)) /\ WF_vars(SchedulerCloses(s))

Spec == Init /\ [][Next]_vars /\ Fairness

-----------------------------------------------------------------------------
TypeOK ==
    /\ visit \in {"IN_PROGRESS", "COMPLETED", "DELETED"} /\ inflight \in 0..2
    /\ track \in [Slots -> TrackStates] /\ ci \in [Slots -> CheckInStates]
    /\ msg \in [Slots -> MsgStates] /\ reminded \in [Slots -> BOOLEAN]
    /\ fullWindow \in [Slots -> BOOLEAN]
    /\ clock \in 0..(IF MODE = "typeProbe" THEN 2 ELSE 3)
    /\ canSend \in BOOLEAN /\ badSend \in BOOLEAN

\* A visit has at most one track that is not stopped.
OneLiveTrackPerVisit == \A a, b \in Slots : (a # b /\ NotStopped(a)) => ~NotStopped(b)

\* A message about a check-in reaches SENT only while that check-in is OPEN.
ReminderOnlyWhileOpen == ~badSend

\* Stopping a track cancels every check-in on it that had not ended (PP-29).
StopEndsCheckIns == \A s \in Slots : track[s] = "STOPPED" => ci[s] \in Terminal \cup {"NONE"}

\* Every check-in reaches a terminal state, even when no message can be sent.
EveryCheckInEnds == \A s \in Slots : (ci[s] # "NONE") ~> (ci[s] \in Terminal)
=============================================================================
