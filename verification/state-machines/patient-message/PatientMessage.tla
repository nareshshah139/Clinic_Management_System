------------------------------ MODULE PatientMessage ------------------------------
(* One WhatsApp number and the inbound messages it sends to the clinic.

   live is how many portal-enabled patients have the number. Each inbound
   message is stored as a PatientMessage, assigned EXACT only when one patient
   is live, SUGGESTED when it quotes an outbound message, otherwise UNASSIGNED,
   and lands under the open PATIENT_MESSAGE item of its subject: the patient,
   or the number when nobody is assigned. Staff claim and resolve items.
   A STOP opts the number out; the clinic acknowledges at most once a day and
   never after STOP. ackedStopped and the last* variables are ghosts. *)
EXTENDS Naturals

CONSTANTS MODE

Modes == {"before", "code", "fixed", "noUpsert", "noItem", "noThrottle", "ackAfterStop", "assignAny", "typeProbe"}
ASSUME MODE \in Modes

Subjects == {"patient", "phone"}
ItemStates == {"NONE", "OPEN", "CLAIMED"}
Assignments == {"none", "EXACT", "SUGGESTED", "UNASSIGNED"}

VARIABLES live, items, extra, msgs, stopped, acks, ackedStopped, lastAssign, lastLive, lastSubject

vars == <<live, items, extra, msgs, stopped, acks, ackedStopped, lastAssign, lastLive, lastSubject>>

Upserts == MODE \notin {"before", "noUpsert"}
OpensItem == MODE \notin {"before", "noItem"}
Throttles == MODE \notin {"before", "noThrottle"}
StopSilences == MODE \notin {"before", "ackAfterStop"}
AssignsExactly == MODE \notin {"before", "assignAny"}

Init ==
    /\ live \in 0..2 /\ items = [s \in Subjects |-> "NONE"] /\ extra = 0 /\ msgs = 0
    /\ stopped = FALSE /\ acks = 0 /\ ackedStopped = FALSE
    /\ lastAssign = "none" /\ lastLive = 0 /\ lastSubject = "phone"

Assign(quoted) ==
    IF (AssignsExactly /\ live = 1) \/ (~AssignsExactly /\ live >= 1) THEN "EXACT"
    ELSE IF quoted THEN "SUGGESTED" ELSE "UNASSIGNED"

Arrive(quoted, isStop) ==
    LET a == Assign(quoted)
        s == IF a = "UNASSIGNED" THEN "phone" ELSE "patient"
        stop == stopped \/ isStop
        ack == (~stop \/ ~StopSilences) /\ (acks = 0 \/ ~Throttles)
    IN
    /\ msgs < 3
    /\ msgs' = msgs + 1
    /\ stopped' = stop
    /\ items' = IF OpensItem /\ items[s] = "NONE" THEN [items EXCEPT ![s] = "OPEN"] ELSE items
    /\ extra' = IF OpensItem /\ ~Upserts /\ items[s] # "NONE" THEN 1 ELSE extra
    /\ acks' = IF ack THEN (IF acks < 2 THEN acks + 1 ELSE 2) ELSE acks
    /\ ackedStopped' = (ackedStopped \/ (ack /\ stop))
    /\ lastAssign' = a /\ lastLive' = live /\ lastSubject' = s
    /\ UNCHANGED live

Claim(s) == items[s] = "OPEN" /\ items' = [items EXCEPT ![s] = "CLAIMED"]
            /\ UNCHANGED <<live, extra, msgs, stopped, acks, ackedStopped, lastAssign, lastLive, lastSubject>>
Resolve(s) == items[s] # "NONE" /\ items' = [items EXCEPT ![s] = "NONE"] /\ extra' = 0 /\ lastAssign' = "none"
            /\ UNCHANGED <<live, msgs, stopped, acks, ackedStopped, lastLive, lastSubject>>
DayPasses == acks > 0 /\ acks' = 0 /\ lastAssign' = "none"
            /\ UNCHANGED <<live, items, extra, msgs, stopped, ackedStopped, lastLive, lastSubject>>
NumberConfirmsAgain == stopped /\ stopped' = FALSE /\ lastAssign' = "none"
            /\ UNCHANGED <<live, items, extra, msgs, acks, ackedStopped, lastLive, lastSubject>>
PatientsChange == live' \in 0..2 /\ live' # live /\ lastAssign' = "none"
            /\ UNCHANGED <<items, extra, msgs, stopped, acks, ackedStopped, lastLive, lastSubject>>

Next ==
    \/ \E q, st \in BOOLEAN : Arrive(q, st)
    \/ \E s \in Subjects : Claim(s) \/ Resolve(s)
    \/ DayPasses \/ NumberConfirmsAgain \/ PatientsChange

Spec == Init /\ [][Next]_vars

TypeOK ==
    /\ live \in 0..2 /\ items \in [Subjects -> ItemStates] /\ extra \in 0..1 /\ msgs \in 0..3
    /\ stopped \in BOOLEAN /\ acks \in 0..(IF MODE = "typeProbe" THEN 0 ELSE 2) /\ ackedStopped \in BOOLEAN
    /\ lastAssign \in Assignments /\ lastLive \in 0..2 /\ lastSubject \in Subjects

EveryPatientMessageLands == lastAssign # "none" => items[lastSubject] # "NONE"
OneOpenItemPerSubject == extra = 0
OneAckADay == acks <= 1
NoAckAfterStop == ~ackedStopped
ExactOnlyWhenUnique == lastAssign = "EXACT" => lastLive = 1
=============================================================================
