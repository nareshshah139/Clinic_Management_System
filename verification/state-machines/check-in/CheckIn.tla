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
   badSend is a ghost.

   The patient answers through a task link. A submit reads the check-in (SubmitBegin)
   and then writes in one transaction (SubmitCommit): an OPEN check-in moves to
   ANSWERED with its only response, pinned to the check-in's instrument version,
   and a RESPONSE_FLAG item when urgent; an ANSWERED one keeps the submission as a
   patient message with an open attention item; any other state writes nothing.
   Publishing a new instrument version may happen at any time. The link answers the
   check-in in slot 1 (slot 2 is where an edit or retry puts the next one) and reaches
   the patient only in a sent message; at most two submits run, and seenOpen counts
   in-flight submits that read OPEN. *)
EXTENDS Naturals

CONSTANTS MODE

Modes == {"code", "fixed", "noGuard", "editKeepsOld", "noSubjectCheck",
          "openNeedsSend", "closeNeedsSend", "stopLeavesOpen", "typeProbe",
          "noStateGuard", "dropSecond", "flagAfterCommit", "pinLatest", "answerAnyCheckIn"}
ASSUME MODE \in Modes

Slots == 1..2
TrackStates == {"NONE", "ACTIVE", "COMPLETED", "STOPPED"}
CheckInStates == {"NONE", "SCHEDULED", "OPEN", "ANSWERED", "MISSED", "CANCELLED"}
Terminal == {"ANSWERED", "MISSED", "CANCELLED"}
MsgStates == {"NONE", "QUEUED", "SENT", "EXPIRED", "SUPPRESSED"}

VARIABLES visit, inflight, track, ci, msg, reminded, fullWindow, clock, canSend, badSend,
          civer, cur, submits, pending, seenOpen, resp, rver, urgent, flagItem, kept, attn,
          lost, badWrite

respVars == <<cur, submits, pending, seenOpen, resp, rver, urgent, flagItem, kept, attn, lost, badWrite>>
vars == <<visit, inflight, track, ci, msg, reminded, fullWindow, clock, canSend, badSend, civer, respVars>>
Responses == UNCHANGED respVars
Versions == UNCHANGED civer

Guarded == MODE # "noGuard"              \* row lock + partial unique index
StopsOld == MODE # "editKeepsOld"
ChecksSubject == MODE # "noSubjectCheck"
OpensWithoutSend == MODE # "openNeedsSend"
ClosesWithoutSend == MODE # "closeNeedsSend"
StopCancels == MODE # "stopLeavesOpen"
WriteRechecks == MODE # "noStateGuard"     \* updateMany ... where state = OPEN
KeepsSecond == MODE # "dropSecond"
FlagInTx == MODE # "flagAfterCommit"
PinsVersion == MODE # "pinLatest"
OnlyOpenOrAnswered == MODE # "answerAnyCheckIn"

Init ==
    /\ visit = "IN_PROGRESS" /\ inflight = 0
    /\ track = [s \in Slots |-> "NONE"] /\ ci = [s \in Slots |-> "NONE"]
    /\ msg = [s \in Slots |-> "NONE"] /\ reminded = [s \in Slots |-> FALSE]
    /\ fullWindow = [s \in Slots |-> FALSE] /\ clock = 0
    /\ canSend \in BOOLEAN /\ badSend = FALSE
    /\ civer = [s \in Slots |-> 0] /\ cur = 1 /\ submits = 0
    /\ pending = 0 /\ seenOpen = 0 /\ resp = 0 /\ rver = 0
    /\ urgent = FALSE /\ flagItem = FALSE /\ kept = 0 /\ attn = FALSE
    /\ lost = FALSE /\ badWrite = FALSE

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
    /\ civer' = [s \in Slots |-> IF s = n THEN cur ELSE civer[s]]

Live == {s \in Slots : NotStopped(s)}

\* A completion request takes the visit row lock; without the guard two run at once.
CompleteBegin ==
    /\ visit = "IN_PROGRESS" /\ inflight < 2 /\ (inflight = 0 \/ ~Guarded)
    /\ inflight' = inflight + 1
    /\ UNCHANGED <<visit, track, ci, clock, canSend>> /\ Messages /\ Responses /\ Versions

CompleteCommit(withPlan) ==
    /\ inflight > 0 /\ inflight' = inflight - 1
    /\ IF Guarded /\ visit = "COMPLETED"
         THEN UNCHANGED <<visit, track, ci, civer>>
         ELSE /\ visit' = "COMPLETED"
              /\ IF withPlan /\ Free # {} /\ (~Guarded \/ Live = {})
                   THEN \E n \in Free : Restart({}, n, TRUE)
                   ELSE UNCHANGED <<track, ci, civer>>
    /\ UNCHANGED <<clock, canSend>> /\ Messages /\ Responses

EditPlan(withPlan) ==
    /\ visit = "COMPLETED" /\ inflight = 0
    /\ LET stop == IF StopsOld THEN Live ELSE {} IN
         IF withPlan
           THEN Free # {} /\ \E n \in Free : Restart(stop, n, TRUE)
           ELSE Live # {} /\ Restart(stop, 0, TRUE)
    /\ UNCHANGED <<visit, inflight, clock, canSend>> /\ Messages /\ Responses

DeleteVisit ==
    /\ visit # "DELETED" /\ inflight = 0
    /\ visit' = "DELETED" /\ Restart(Live, 0, StopCancels)
    /\ UNCHANGED <<inflight, clock, canSend>> /\ Messages /\ Responses

StaffArchives ==
    /\ Live # {} /\ Restart(Live, 0, StopCancels)
    /\ UNCHANGED <<visit, inflight, clock, canSend>> /\ Messages /\ Responses

DoctorStops(s) ==
    /\ track[s] = "ACTIVE" /\ Restart({s}, 0, StopCancels)
    /\ UNCHANGED <<visit, inflight, clock, canSend>> /\ Messages /\ Responses

\* Time keeps passing while any check-in is open.
Tick ==
    /\ clock < 3 \/ \E s \in Slots : ci[s] = "OPEN" /\ ~fullWindow[s]
    /\ clock' = IF clock < 3 THEN clock + 1 ELSE clock
    /\ fullWindow' = [s \in Slots |-> fullWindow[s] \/ ci[s] = "OPEN"]
    /\ UNCHANGED <<visit, inflight, track, ci, canSend, msg, reminded, badSend>> /\ Responses /\ Versions

SchedulerOpens(s) ==
    /\ ci[s] = "SCHEDULED" /\ clock >= 1 /\ (OpensWithoutSend \/ canSend)
    /\ ci' = [ci EXCEPT ![s] = "OPEN"]
    /\ UNCHANGED <<visit, inflight, track, msg, reminded, fullWindow, clock, canSend, badSend>> /\ Responses /\ Versions

SchedulerQueues(s) ==
    /\ ci[s] = "OPEN"
    /\ \/ msg[s] = "NONE"
       \/ msg[s] = "SENT" /\ ~reminded[s] /\ reminded' = [reminded EXCEPT ![s] = TRUE]
    /\ msg' = [msg EXCEPT ![s] = "QUEUED"]
    /\ IF msg[s] = "NONE" THEN UNCHANGED reminded ELSE TRUE
    /\ UNCHANGED <<visit, inflight, track, ci, fullWindow, clock, canSend, badSend>> /\ Responses /\ Versions

SchedulerSends(s) ==
    /\ msg[s] = "QUEUED"
    /\ IF ChecksSubject /\ ci[s] # "OPEN"
         THEN msg' = [msg EXCEPT ![s] = "EXPIRED"] /\ UNCHANGED badSend
         ELSE IF ~canSend
           THEN msg' = [msg EXCEPT ![s] = "SUPPRESSED"] /\ UNCHANGED badSend
           ELSE msg' = [msg EXCEPT ![s] = "SENT"] /\ badSend' = (badSend \/ ci[s] # "OPEN")
    /\ UNCHANGED <<visit, inflight, track, ci, reminded, fullWindow, clock, canSend>> /\ Responses /\ Versions

\* A check-in that opened late stays open through one whole window.
SchedulerCloses(s) ==
    /\ ci[s] = "OPEN" /\ clock >= 2 /\ fullWindow[s]
    /\ (ClosesWithoutSend \/ msg[s] = "SENT")
    /\ ci' = [ci EXCEPT ![s] = "MISSED"]
    /\ UNCHANGED <<visit, inflight, track, clock, canSend>> /\ Messages /\ Responses /\ Versions

\* A new instrument version is published; open check-ins keep the version they pinned.
Publish ==
    /\ cur = 1 /\ cur' = 2
    /\ UNCHANGED <<visit, inflight, track, ci, clock, canSend, civer>> /\ Messages
    /\ UNCHANGED <<submits, pending, seenOpen, resp, rver, urgent, flagItem, kept, attn, lost, badWrite>>

\* The patient submits through the link: the guard and the read happen before the write.
SubmitBegin ==
    /\ ci[1] \notin {"NONE", "SCHEDULED"} /\ (msg[1] = "SENT" \/ reminded[1]) /\ submits < 2
    /\ submits' = submits + 1 /\ pending' = pending + 1
    /\ seenOpen' = seenOpen + IF ci[1] = "OPEN" THEN 1 ELSE 0
    /\ UNCHANGED <<visit, inflight, track, ci, clock, canSend, civer, cur>> /\ Messages
    /\ UNCHANGED <<resp, rver, urgent, flagItem, kept, attn, lost, badWrite>>

\* The write transaction. sawOpen: this submit read OPEN at SubmitBegin.
SubmitCommit(isUrgent, sawOpen) ==
    /\ pending > 0 /\ (sawOpen => seenOpen > 0) /\ (~sawOpen => pending > seenOpen)
    /\ pending' = pending - 1
    /\ seenOpen' = seenOpen - IF sawOpen THEN 1 ELSE 0
    /\ LET answers == IF WriteRechecks THEN ci[1] = "OPEN" ELSE sawOpen
            anyState == ~OnlyOpenOrAnswered /\ ci[1] \in {"MISSED", "CANCELLED"} IN
       IF answers \/ anyState
         THEN /\ ci' = [ci EXCEPT ![1] = "ANSWERED"]
              /\ resp' = resp + 1
              /\ rver' = IF PinsVersion THEN civer[1] ELSE cur
              /\ urgent' = (urgent \/ isUrgent)
              /\ flagItem' = (flagItem \/ (isUrgent /\ FlagInTx))
              /\ badWrite' = (badWrite \/ ci[1] # "OPEN")
              /\ UNCHANGED <<kept, attn, lost>>
         ELSE IF ci[1] = "ANSWERED"
           THEN /\ IF KeepsSecond
                     THEN kept' = kept + 1 /\ attn' = TRUE /\ UNCHANGED lost
                     ELSE lost' = TRUE /\ UNCHANGED <<kept, attn>>
                /\ UNCHANGED <<ci, resp, rver, urgent, flagItem, badWrite>>
           ELSE UNCHANGED <<ci, resp, rver, urgent, flagItem, kept, attn, lost, badWrite>>
    /\ UNCHANGED <<visit, inflight, track, clock, canSend, civer, cur, submits>> /\ Messages

\* flagAfterCommit only: the RESPONSE_FLAG item is written by a later, separate step.
FlagLater ==
    /\ ~FlagInTx /\ urgent /\ ~flagItem /\ flagItem' = TRUE
    /\ UNCHANGED <<visit, inflight, track, ci, clock, canSend, civer>> /\ Messages
    /\ UNCHANGED <<cur, submits, pending, seenOpen, resp, rver, urgent, kept, attn, lost, badWrite>>

TrackCompletes(s) ==
    /\ track[s] = "ACTIVE" /\ ci[s] \in Terminal
    /\ track' = [track EXCEPT ![s] = "COMPLETED"]
    /\ UNCHANGED <<visit, inflight, ci, clock, canSend>> /\ Messages /\ Responses /\ Versions

Next ==
    \/ CompleteBegin \/ \E p \in BOOLEAN : CompleteCommit(p) \/ EditPlan(p)
    \/ DeleteVisit \/ StaffArchives \/ Tick
    \/ \E s \in Slots : \/ DoctorStops(s) \/ SchedulerOpens(s) \/ SchedulerQueues(s)
                        \/ SchedulerSends(s) \/ SchedulerCloses(s) \/ TrackCompletes(s)
    \/ Publish \/ SubmitBegin \/ FlagLater \/ \E u, o \in BOOLEAN : SubmitCommit(u, o)

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
    /\ civer \in [Slots -> 0..2] /\ cur \in 1..2 /\ submits \in 0..2
    /\ pending \in 0..2 /\ seenOpen \in 0..2 /\ resp \in 0..2 /\ rver \in 0..2
    /\ urgent \in BOOLEAN /\ flagItem \in BOOLEAN /\ kept \in 0..2 /\ attn \in BOOLEAN
    /\ lost \in BOOLEAN /\ badWrite \in BOOLEAN

\* A visit has at most one track that is not stopped.
OneLiveTrackPerVisit == \A a, b \in Slots : (a # b /\ NotStopped(a)) => ~NotStopped(b)

\* A message about a check-in reaches SENT only while that check-in is OPEN.
ReminderOnlyWhileOpen == ~badSend

\* Stopping a track cancels every check-in on it that had not ended (PP-29).
StopEndsCheckIns == \A s \in Slots : track[s] = "STOPPED" => ci[s] \in Terminal \cup {"NONE"}

\* A task link writes a response only to a check-in that is OPEN when the write commits.
LinkAnswersOnly == ~badWrite

\* A check-in has at most one response, however many submits race (PP-42).
OneResponsePerCheckIn == resp <= 1

\* A submit that finds the check-in answered is kept as a message with an open attention item.
SecondAnswerNotLost == ~lost /\ (kept > 0 => attn)

\* A response carries the instrument version its check-in pinned, not the latest one.
ResponsePinsVersion == resp > 0 => rver = civer[1]

\* An urgent response is never visible without its RESPONSE_FLAG worklist item.
UrgentReachesWorklist == urgent => flagItem

\* Every check-in reaches a terminal state, even when no message can be sent.
EveryCheckInEnds == \A s \in Slots : (ci[s] # "NONE") ~> (ci[s] \in Terminal)
=============================================================================
