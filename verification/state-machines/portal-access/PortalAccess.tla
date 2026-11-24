------------------------------ MODULE PortalAccess ------------------------------
(* One confirmed WhatsApp number N shared by two patients, p1 and p2. The number
   asks for a one-time code, submits it (two submissions can race), and holds one
   portal session that chooses a profile and reads records. p1 also holds a task
   link for its latest check-in. Staff turn the portal off and on, archive a
   patient, or change a patient's phone to M. The session ends by itself (idle,
   absolute, sign out, sign out everywhere). A staff credential and the portal
   credentials are each tried on the other side's routes.

   last records the read the previous step made; every other step clears it, so
   an invariant over last judges the read at the moment it happened.
   pending, perCode, deadCommit, issuedIneligible and changed are ghosts. *)
EXTENDS Naturals

CONSTANTS MODE

Modes == {"code", "fixed", "noEligibility", "noAtomic", "noExpiryCheck", "noLock",
          "noRecheck", "noRebuild", "noRevoke", "linkReadsAnswers",
          "staffAcceptsPortal", "portalAcceptsStaff", "typeProbe"}
ASSUME MODE \in Modes

P == {"p1", "p2"}
None == [cred |-> "none", route |-> "none", patient |-> "none", kind |-> "none"]
MaxWrong == 5

VARIABLES enabled, archived, phoneOf, code, wrong, pending, perCode, deadCommit,
          issuedIneligible, sess, changed, checkIn, linkAlive, last

vars == <<enabled, archived, phoneOf, code, wrong, pending, perCode, deadCommit,
          issuedIneligible, sess, changed, checkIn, linkAlive, last>>
codeVars == <<code, wrong, pending, perCode, deadCommit, issuedIneligible>>
patientVars == <<enabled, archived, phoneOf>>

ChecksEligibility == MODE # "noEligibility"
Atomic == MODE # "noAtomic"
ChecksExpiry == MODE # "noExpiryCheck"
Locks == MODE # "noLock"
Rechecks == MODE # "noRecheck"
Rebuilds == MODE # "noRebuild"
Revokes == MODE # "noRevoke"

Eligible(p) == enabled[p] /\ ~archived[p] /\ phoneOf[p] = "N"
NumberEligible == \E p \in P : Eligible(p)
Usable(c, w) == (c = "ISSUED" /\ (w < MaxWrong \/ ~Locks)) \/ (c = "EXPIRED" /\ ~ChecksExpiry)

Init ==
    /\ enabled = [p \in P |-> TRUE] /\ archived = [p \in P |-> FALSE] /\ phoneOf = [p \in P |-> "N"]
    /\ code = "NONE" /\ wrong = 0 /\ pending = 0 /\ perCode = 0
    /\ deadCommit = FALSE /\ issuedIneligible = FALSE
    /\ sess = [alive |-> FALSE, chosen |-> "none"] /\ changed = [p \in P |-> FALSE]
    /\ checkIn = "OPEN" /\ linkAlive = TRUE /\ last = None

(* PP-55: a code goes only to a number with an eligible patient. *)
Issue ==
    /\ code # "ISSUED"
    /\ NumberEligible \/ ~ChecksEligibility
    /\ code' = "ISSUED" /\ wrong' = 0 /\ pending' = 0 /\ perCode' = 0
    /\ issuedIneligible' = (issuedIneligible \/ ~NumberEligible)
    /\ last' = None
    /\ UNCHANGED <<patientVars, deadCommit, sess, changed, checkIn, linkAlive>>

(* PP-56: five wrong attempts lock the code. *)
WrongAttempt ==
    /\ code = "ISSUED" /\ wrong < MaxWrong
    /\ wrong' = wrong + 1
    /\ code' = IF wrong + 1 = MaxWrong /\ Locks THEN "LOCKED" ELSE code
    /\ last' = None
    /\ UNCHANGED <<patientVars, pending, perCode, deadCommit, issuedIneligible, sess, changed, checkIn, linkAlive>>

Expire ==
    /\ code = "ISSUED" /\ code' = "EXPIRED" /\ last' = None
    /\ UNCHANGED <<patientVars, wrong, pending, perCode, deadCommit, issuedIneligible, sess, changed, checkIn, linkAlive>>

(* A correct code is read; the consuming write comes in a later step. *)
Submit ==
    /\ pending < 2 /\ Usable(code, wrong)
    /\ pending' = pending + 1 /\ last' = None
    /\ UNCHANGED <<patientVars, code, wrong, perCode, deadCommit, issuedIneligible, sess, changed, checkIn, linkAlive>>

(* PP-56, PP-58: the conditional update consumes the code and creates a new session. *)
Commit ==
    /\ pending > 0 /\ pending' = pending - 1
    /\ IF Atomic /\ ~Usable(code, wrong)
       THEN UNCHANGED <<code, perCode, deadCommit, sess>>
       ELSE /\ code' = "CONSUMED" /\ perCode' = perCode + 1
            /\ deadCommit' = (deadCommit \/ code \in {"EXPIRED", "LOCKED"} \/ wrong >= MaxWrong)
            /\ sess' = [alive |-> TRUE, chosen |-> "none"]
    /\ last' = None
    /\ UNCHANGED <<patientVars, wrong, issuedIneligible, changed, checkIn, linkAlive>>

(* PP-61, PP-66: the profile list is read again on every request. *)
Choose(p) ==
    /\ sess.alive
    /\ Eligible(p) \/ (~Rebuilds /\ phoneOf[p] = "N")
    /\ sess' = [sess EXCEPT !.chosen = p] /\ changed' = [changed EXCEPT ![p] = FALSE]
    /\ last' = [cred |-> "session", route |-> "portal", patient |-> p, kind |-> "profile"]
    /\ UNCHANGED <<patientVars, codeVars, checkIn, linkAlive>>

(* PP-63, PP-84: the guard builds the scope from the session and the chosen patient's current state. *)
ReadRecord ==
    /\ sess.alive /\ sess.chosen # "none"
    /\ Eligible(sess.chosen) \/ ~Rechecks
    /\ last' = [cred |-> "session", route |-> "portal", patient |-> sess.chosen, kind |-> "record"]
    /\ UNCHANGED <<patientVars, codeVars, sess, changed, checkIn, linkAlive>>

(* PP-60: idle or absolute expiry, sign out, sign out everywhere. *)
SessionEnds ==
    /\ sess.alive /\ sess' = [sess EXCEPT !.alive = FALSE] /\ last' = None
    /\ UNCHANGED <<patientVars, codeVars, changed, checkIn, linkAlive>>

RevokeFor(p) ==
    /\ sess' = IF Revokes /\ sess.chosen = p THEN [sess EXCEPT !.alive = FALSE] ELSE sess
    /\ linkAlive' = IF Revokes /\ p = "p1" THEN FALSE ELSE linkAlive
    /\ changed' = [changed EXCEPT ![p] = TRUE]

(* PP-09 *)
Disable(p) ==
    /\ enabled[p] /\ enabled' = [enabled EXCEPT ![p] = FALSE] /\ RevokeFor(p) /\ last' = None
    /\ UNCHANGED <<archived, phoneOf, codeVars, checkIn>>
Enable(p) ==
    /\ ~enabled[p] /\ enabled' = [enabled EXCEPT ![p] = TRUE] /\ last' = None
    /\ UNCHANGED <<archived, phoneOf, codeVars, sess, changed, checkIn, linkAlive>>
(* PP-07 *)
PhoneChange(p) ==
    /\ phoneOf[p] = "N" /\ phoneOf' = [phoneOf EXCEPT ![p] = "M"] /\ RevokeFor(p) /\ last' = None
    /\ UNCHANGED <<enabled, archived, codeVars, checkIn>>
(* Archiving stops the patient's tracks and cancels their open check-ins, so the link opens nothing. *)
Archive(p) ==
    /\ ~archived[p] /\ archived' = [archived EXCEPT ![p] = TRUE] /\ last' = None
    /\ linkAlive' = (linkAlive /\ p # "p1")
    /\ UNCHANGED <<enabled, phoneOf, codeVars, sess, changed, checkIn>>

Answer ==
    /\ checkIn = "OPEN" /\ checkIn' = "ANSWERED" /\ last' = None
    /\ UNCHANGED <<patientVars, codeVars, sess, changed, linkAlive>>
NextCheckInOpens ==
    /\ checkIn = "ANSWERED" /\ checkIn' = "OPEN" /\ last' = None
    /\ UNCHANGED <<patientVars, codeVars, sess, changed, linkAlive>>

(* PP-37, PP-39: a live link reads the questions of its open check-in. *)
LinkRead ==
    /\ linkAlive /\ enabled["p1"]
    /\ checkIn = "OPEN" \/ MODE = "linkReadsAnswers"
    /\ last' = [cred |-> "link", route |-> "portal", patient |-> "p1", kind |-> IF checkIn = "OPEN" THEN "question" ELSE "answer"]
    /\ UNCHANGED <<patientVars, codeVars, sess, changed, checkIn, linkAlive>>

(* PP-62, PP-83: a credential tried on the other side's route. Refusal changes nothing. *)
PortalCredentialOnStaffRoute(c) ==
    /\ MODE = "staffAcceptsPortal"
    /\ last' = [cred |-> c, route |-> "staff", patient |-> "none", kind |-> "staff"]
    /\ UNCHANGED <<patientVars, codeVars, sess, changed, checkIn, linkAlive>>
StaffCredentialOnPortalRoute ==
    /\ MODE = "portalAcceptsStaff"
    /\ last' = [cred |-> "staff", route |-> "portal", patient |-> "p2", kind |-> "record"]
    /\ UNCHANGED <<patientVars, codeVars, sess, changed, checkIn, linkAlive>>

Next ==
    \/ Issue \/ WrongAttempt \/ Expire \/ Submit \/ Commit
    \/ \E p \in P : Choose(p) \/ Disable(p) \/ Enable(p) \/ PhoneChange(p) \/ Archive(p)
    \/ ReadRecord \/ SessionEnds \/ Answer \/ NextCheckInOpens \/ LinkRead
    \/ \E c \in {"session", "link"} : PortalCredentialOnStaffRoute(c)
    \/ StaffCredentialOnPortalRoute

Spec == Init /\ [][Next]_vars

TypeOK ==
    /\ enabled \in [P -> BOOLEAN] /\ archived \in [P -> BOOLEAN] /\ phoneOf \in [P -> {"N", "M"}]
    /\ code \in {"NONE", "ISSUED", "CONSUMED", "EXPIRED", "LOCKED"} /\ wrong \in 0..MaxWrong
    /\ pending \in 0..2 /\ perCode \in 0..(IF MODE = "typeProbe" THEN 0 ELSE 2)
    /\ deadCommit \in BOOLEAN /\ issuedIneligible \in BOOLEAN
    /\ sess \in [alive : BOOLEAN, chosen : P \cup {"none"}] /\ changed \in [P -> BOOLEAN]
    /\ checkIn \in {"OPEN", "ANSWERED"} /\ linkAlive \in BOOLEAN
    /\ last \in [cred : {"none", "session", "link", "staff"}, route : {"none", "portal", "staff"},
                 patient : P \cup {"none"}, kind : {"none", "profile", "record", "question", "answer", "staff"}]

OwnDataOnly == last.cred = "session" => (sess.alive /\ last.patient = sess.chosen /\ Eligible(last.patient))
LinkAnswersOnly == last.cred = "link" => (last.kind = "question" /\ last.patient = "p1" /\ Eligible("p1"))
StaffCookieStaysStaff ==
    /\ ~(last.route = "staff" /\ last.cred \in {"session", "link"})
    /\ ~(last.route = "portal" /\ last.cred = "staff")
NoCodeToIneligibleNumber == ~issuedIneligible
OneSessionPerCode == perCode <= 1
NoSignInWithDeadCode == ~deadCommit
ChangeEndsSessions == (sess.alive /\ sess.chosen # "none") => ~changed[sess.chosen]
=============================================================================
