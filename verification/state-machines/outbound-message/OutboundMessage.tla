------------------------------ MODULE OutboundMessage ------------------------------
(* One patient, the WhatsApp consent of their number, and one automated care
   message about one subject (an appointment or a check-in).

   The message is an OutboundMessage row. The scheduler leases a QUEUED row
   (SENDING), then in one step re-reads consent, confirmation, the portal
   switch and the subject and either calls the provider (SENT) or marks the
   row SUPPRESSED or EXPIRED. Receipts move SENT forward; a provider rejection
   moves it to FAILED, which opens an attention item while the subject is open.

   A duplicate patient row with its own consent can be merged into this one.
   stopped is a ghost: TRUE from the moment the patient sends STOP until the
   number confirms again, so OptOutSticks can ask whether a send ignored it. *)
EXTENDS Naturals

CONSTANTS MODE

Modes == {"before", "code", "fixed", "checkAtLease", "noSubjectCheck", "keptWins",
          "noFailureItem", "noLease", "typeProbe"}
ASSUME MODE \in Modes

Consents == {"NOT_ASKED", "PENDING", "OPTED_IN", "OPTED_OUT"}
States == {"QUEUED", "SENDING", "SENT", "DELIVERED", "READ", "FAILED", "SUPPRESSED", "EXPIRED"}
Terminal == {"DELIVERED", "READ", "FAILED", "SUPPRESSED", "EXPIRED"}
Snapshots == [sent: BOOLEAN, consent: Consents, confirmed: BOOLEAN, portal: BOOLEAN,
              open: BOOLEAN, stopped: BOOLEAN]
NoSend == [sent |-> FALSE, consent |-> "NOT_ASKED", confirmed |-> FALSE, portal |-> TRUE,
           open |-> TRUE, stopped |-> FALSE]

VARIABLES consent, confirmed, portal, open, stopped, dup, msg, sends, leaseOk,
          failedOpen, attention, last

vars == <<consent, confirmed, portal, open, stopped, dup, msg, sends, leaseOk,
          failedOpen, attention, last>>

ChecksAtSend == MODE \notin {"before", "checkAtLease", "typeProbe"}
ChecksSubject == MODE \notin {"before", "noSubjectCheck", "typeProbe"}
OptOutWinsMerge == MODE \notin {"keptWins"}
OpensFailureItem == MODE \notin {"before", "noFailureItem"}
Leases == MODE \notin {"noLease"}

Allowed == consent = "OPTED_IN" /\ confirmed /\ portal

Init ==
    /\ consent = "NOT_ASKED" /\ confirmed = FALSE /\ portal = TRUE /\ open = TRUE
    /\ stopped = FALSE /\ dup \in {"none", "OPTED_IN", "OPTED_OUT"}
    /\ msg = "QUEUED" /\ sends = 0 /\ leaseOk = FALSE
    /\ failedOpen = FALSE /\ attention = FALSE /\ last = NoSend

Quiet == last' = NoSend
Patient(c, f, s) == consent' = c /\ confirmed' = f /\ stopped' = s
SameMsg == UNCHANGED <<msg, sends, leaseOk, failedOpen, attention>>

ReceptionRecordsAgreement ==
    /\ consent \in {"NOT_ASKED", "OPTED_OUT"}
    /\ Patient("PENDING", FALSE, stopped)
    /\ SameMsg /\ UNCHANGED <<portal, open, dup>> /\ Quiet

NumberConfirms ==
    /\ consent = "PENDING"
    /\ Patient("OPTED_IN", TRUE, FALSE)
    /\ SameMsg /\ UNCHANGED <<portal, open, dup>> /\ Quiet

PatientSendsStop ==
    /\ Patient("OPTED_OUT", FALSE, TRUE)
    /\ SameMsg /\ UNCHANGED <<portal, open, dup>> /\ Quiet

PhoneChanges ==
    /\ Patient("NOT_ASKED", FALSE, stopped)
    /\ SameMsg /\ UNCHANGED <<portal, open, dup>> /\ Quiet

ConsentLapses ==
    /\ consent = "OPTED_IN"
    /\ Patient("PENDING", FALSE, stopped)
    /\ SameMsg /\ UNCHANGED <<portal, open, dup>> /\ Quiet

StaffTogglesPortal ==
    /\ portal' = ~portal
    /\ SameMsg /\ UNCHANGED <<consent, confirmed, stopped, open, dup>> /\ Quiet

SubjectCloses ==
    /\ open /\ open' = FALSE
    /\ SameMsg /\ UNCHANGED <<consent, confirmed, stopped, portal, dup>> /\ Quiet

\* The duplicate's patient had stopped messages if its row is OPTED_OUT.
MergeDuplicate ==
    /\ dup # "none"
    /\ IF dup = "OPTED_OUT"
         THEN /\ stopped' = TRUE
              /\ IF OptOutWinsMerge \/ consent # "OPTED_IN"
                   THEN consent' = "OPTED_OUT" /\ confirmed' = FALSE
                   ELSE UNCHANGED <<consent, confirmed>>
         ELSE UNCHANGED <<consent, confirmed, stopped>>
    /\ dup' = "none"
    /\ SameMsg /\ UNCHANGED <<portal, open>> /\ Quiet

SchedulerLeases ==
    /\ msg = "QUEUED"
    /\ msg' = "SENDING"
    /\ leaseOk' = (Allowed /\ open)
    /\ UNCHANGED <<sends, failedOpen, attention, consent, confirmed, stopped, portal, open, dup>>
    /\ Quiet

PassesChecks == IF ChecksAtSend THEN Allowed /\ (open \/ ~ChecksSubject) ELSE IF MODE = "checkAtLease" THEN leaseOk ELSE TRUE
Expired == ChecksAtSend /\ ChecksSubject /\ ~open

SchedulerSends ==
    /\ \/ msg = "SENDING"
       \/ ~Leases /\ msg = "SENT" /\ sends = 1
    /\ IF Expired THEN msg' = "EXPIRED" /\ UNCHANGED sends /\ last' = NoSend
       ELSE IF PassesChecks
         THEN /\ msg' = "SENT" /\ sends' = sends + 1
              /\ last' = [sent |-> TRUE, consent |-> consent, confirmed |-> confirmed,
                          portal |-> portal, open |-> open, stopped |-> stopped]
         ELSE msg' = "SUPPRESSED" /\ UNCHANGED sends /\ last' = NoSend
    /\ UNCHANGED <<leaseOk, failedOpen, attention, consent, confirmed, stopped, portal, open, dup>>

ReceiptDelivered ==
    /\ msg = "SENT" /\ msg' = "DELIVERED"
    /\ UNCHANGED <<sends, leaseOk, failedOpen, attention, consent, confirmed, stopped, portal, open, dup>> /\ Quiet

ReceiptRead ==
    /\ msg \in {"SENT", "DELIVERED"} /\ msg' = "READ"
    /\ UNCHANGED <<sends, leaseOk, failedOpen, attention, consent, confirmed, stopped, portal, open, dup>> /\ Quiet

ProviderFails ==
    /\ msg \in {"SENDING", "SENT"} /\ msg' = "FAILED"
    /\ failedOpen' = open
    /\ attention' = (attention \/ (open /\ OpensFailureItem))
    /\ UNCHANGED <<sends, leaseOk, consent, confirmed, stopped, portal, open, dup>> /\ Quiet

\* A later event queues a new message once this one is settled.
NextEvent ==
    /\ msg \in Terminal
    /\ msg' = "QUEUED" /\ sends' = 0 /\ leaseOk' = FALSE /\ open' = TRUE
    /\ failedOpen' = FALSE /\ attention' = FALSE
    /\ UNCHANGED <<consent, confirmed, stopped, portal, dup>> /\ Quiet

Next ==
    \/ ReceptionRecordsAgreement \/ NumberConfirms \/ PatientSendsStop \/ PhoneChanges
    \/ ConsentLapses \/ StaffTogglesPortal \/ SubjectCloses \/ MergeDuplicate
    \/ SchedulerLeases \/ SchedulerSends \/ ReceiptDelivered \/ ReceiptRead
    \/ ProviderFails \/ NextEvent

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
TypeOK ==
    /\ consent \in Consents /\ confirmed \in BOOLEAN /\ portal \in BOOLEAN
    /\ open \in BOOLEAN /\ stopped \in BOOLEAN /\ dup \in {"none", "OPTED_IN", "OPTED_OUT"}
    /\ msg \in States /\ sends \in 0..(IF MODE = "typeProbe" THEN 0 ELSE 2)
    /\ leaseOk \in BOOLEAN /\ failedOpen \in BOOLEAN /\ attention \in BOOLEAN
    /\ last \in Snapshots

\* A care message reaches SENT only while consent is OPTED_IN, the number is
\* confirmed and the portal switch is on.
NoSendToUnconfirmedNumber ==
    last.sent => (last.consent = "OPTED_IN" /\ last.confirmed /\ last.portal)

\* No send reaches a patient who stopped messages and has not confirmed again,
\* including after a merge with a duplicate row that had opted out.
OptOutSticks == last.sent => ~last.stopped

\* A message is sent only while its subject is still current.
SubjectCurrentAtSend == last.sent => last.open

\* A failed message about a current subject puts an item in front of staff.
FailureReachesStaff == (msg = "FAILED" /\ failedOpen) => attention

\* The provider is called at most once per OutboundMessage row.
AtMostOneSend == sends <= 1
=============================================================================
