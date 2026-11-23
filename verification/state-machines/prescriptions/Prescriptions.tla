------------------------------ MODULE Prescriptions ------------------------------
(* Two machines from the prescriptions module, checked as two scenarios.

   rx   One prescription, its refill requests and the pharmacy bills posted
        against it. Every writer locks the prescription row, re-reads it, then
        writes. Two requests run at once.

   tpl  One submitted prescription template version and two reviewers. Each
        review reads the version, checks it is PENDING, updates it by id, then
        inserts a TemplateVersionApproval row in a second statement.

   The two machines share no row, so Init picks one scenario per behaviour and
   each scenario's actions run only in it. MODE picks the code as it is, the
   code before the fix ("before"), the fix, or the fix with one guard removed.
   The code is the fix without the billing allowance check, which the clinic
   has not decided to enforce. *)
EXTENDS Naturals, FiniteSets, Sequences

CONSTANTS Reqs, Refills, Reviewers, MaxRefills, MaxBills, Budget, MODE

ASSUME MODE \in {"code", "before", "fixed", "typeProbe", "noRowLock", "noApproveRecheck",
                 "billIgnoresRefills", "cancelAnyStatus", "patchIgnoresStatus",
                 "noStatusPredicate", "auditOutsideTransaction"}

NONE == "none"
RxStatuses == {"ACTIVE", "COMPLETED", "CANCELLED"}
Finished == {"COMPLETED", "CANCELLED"}
RefillStatuses == {"ABSENT", "PENDING", "APPROVED", "REJECTED"}
Commands == {"request", "approve", "reject", "cancel", "complete", "bill"}
Decisions == {"APPROVED", "REJECTED"}

Locks == MODE # "noRowLock"
ApproveRechecks == MODE # "noApproveRecheck"
BillChecksAllowance == MODE \notin {"code", "before", "billIgnoresRefills"}
CancelOnlyActive == MODE \notin {"before", "cancelAnyStatus"}
PatchChecksStatus == MODE # "patchIgnoresStatus"
CompleteClosesRequests == MODE # "before"
DecisionCAS == MODE \notin {"before", "noStatusPredicate"}
AuditInSameTransaction == MODE \notin {"before", "auditOutsideTransaction"}

VARIABLES focus,
          rxStatus, expired, refill, bills,
          cmd, target, pc, snap, lock, left,
          everCompleted, everCancelled, approvedWhileClosed,
          version, tpc, tkind, audit, firstDecision

rxVars == <<rxStatus, expired, refill, bills, cmd, target, pc, snap, lock, left,
            everCompleted, everCancelled, approvedWhileClosed>>
tplVars == <<version, tpc, tkind, audit, firstDecision>>
vars == <<focus, rxVars, tplVars>>

AnyRefill == CHOOSE f \in Refills : TRUE
Idle == [status |-> "ACTIVE", expired |-> FALSE,
         refill |-> [f \in Refills |-> "ABSENT"], bills |-> 0]
Current == [status |-> rxStatus, expired |-> expired, refill |-> refill, bills |-> bills]

UsedCount(rf) == Cardinality({f \in Refills : rf[f] = "APPROVED"})
PendingCount(rf) == Cardinality({f \in Refills : rf[f] = "PENDING"})
Fillable(s) == s.status = "ACTIVE" /\ ~s.expired
Eligible(s) == Fillable(s) /\ UsedCount(s.refill) < MaxRefills
RejectPending(rf) == [f \in Refills |-> IF rf[f] = "PENDING" THEN "REJECTED" ELSE rf[f]]
HasFreeRow == \E f \in Refills : refill[f] = "ABSENT"

Init ==
  /\ focus \in {"rx", "tpl"}
  /\ rxStatus = "ACTIVE"
  /\ expired = FALSE
  /\ refill = [f \in Refills |-> "ABSENT"]
  /\ bills = 0
  /\ cmd = [r \in Reqs |-> NONE]
  /\ target = [r \in Reqs |-> AnyRefill]
  /\ pc = [r \in Reqs |-> "idle"]
  /\ snap = [r \in Reqs |-> Idle]
  /\ lock = NONE
  /\ left = Budget
  /\ everCompleted = FALSE
  /\ everCancelled = FALSE
  /\ approvedWhileClosed = FALSE
  /\ version = "PENDING"
  /\ tpc = [v \in Reviewers |-> "idle"]
  /\ tkind = [v \in Reviewers |-> NONE]
  /\ audit = <<>>
  /\ firstDecision = NONE

(* A request arrives. With the row lock, the server waits for the lock, then
   re-reads the prescription and its refills (lockPrescription). *)
Send(r, c, f) ==
  /\ focus = "rx"
  /\ pc[r] = "idle"
  /\ left > 0
  /\ Locks => lock = NONE
  /\ cmd' = [cmd EXCEPT ![r] = c]
  /\ target' = [target EXCEPT ![r] = f]
  /\ pc' = [pc EXCEPT ![r] = "sent"]
  /\ snap' = [snap EXCEPT ![r] = Current]
  /\ lock' = IF Locks THEN r ELSE lock
  /\ left' = left - 1
  /\ UNCHANGED <<focus, rxStatus, expired, refill, bills,
                 everCompleted, everCancelled, approvedWhileClosed, tplVars>>

DeskRequestsRefill(r) == HasFreeRow /\ Send(r, "request", AnyRefill)
DoctorApprovesRefill(r) == \E f \in Refills : refill[f] = "PENDING" /\ Send(r, "approve", f)
DoctorRejectsRefill(r) == \E f \in Refills : refill[f] = "PENDING" /\ Send(r, "reject", f)
DoctorCancels(r) == Send(r, "cancel", AnyRefill)
DoctorMarksCompleted(r) == Send(r, "complete", AnyRefill)
PharmacistPostsBill(r) == bills < MaxBills /\ Send(r, "bill", AnyRefill)

(* The checks each command makes on what it read. *)
Accepts(r, s) ==
  CASE cmd[r] = "request" -> Eligible(s) /\ PendingCount(s.refill) = 0
    [] cmd[r] = "approve" -> s.refill[target[r]] = "PENDING" /\ (ApproveRechecks => Eligible(s))
    [] cmd[r] = "reject" -> s.refill[target[r]] = "PENDING"
    [] cmd[r] = "cancel" -> IF CancelOnlyActive THEN s.status = "ACTIVE" ELSE s.status # "CANCELLED"
    [] cmd[r] = "complete" -> PatchChecksStatus => s.status = "ACTIVE"
    [] cmd[r] = "bill" -> Fillable(s) /\ (BillChecksAllowance => s.bills < 1 + UsedCount(s.refill))

(* The writes, applied to the rows as they are now. *)
Effect(r) ==
  LET c == cmd[r] IN
  /\ rxStatus' = CASE c = "cancel" -> "CANCELLED"
                   [] c = "complete" -> "COMPLETED"
                   [] OTHER -> rxStatus
  /\ refill' = CASE c = "request" /\ HasFreeRow ->
                      [refill EXCEPT ![CHOOSE f \in Refills : refill[f] = "ABSENT"] = "PENDING"]
                 [] c = "approve" -> [refill EXCEPT ![target[r]] = "APPROVED"]
                 [] c = "reject" -> [refill EXCEPT ![target[r]] = "REJECTED"]
                 [] c = "cancel" -> RejectPending(refill)
                 [] c = "complete" /\ CompleteClosesRequests -> RejectPending(refill)
                 [] OTHER -> refill
  /\ bills' = IF c = "bill" THEN bills + 1 ELSE bills
  /\ everCompleted' = (everCompleted \/ c = "complete")
  /\ everCancelled' = (everCancelled \/ c = "cancel")
  /\ approvedWhileClosed' = (approvedWhileClosed \/ (c = "approve" /\ ~Fillable(Current)))

ServerCommits(r) ==
  /\ focus = "rx"
  /\ pc[r] = "sent"
  /\ IF Accepts(r, snap[r])
       THEN Effect(r)
       ELSE UNCHANGED <<rxStatus, refill, bills, everCompleted, everCancelled, approvedWhileClosed>>
  /\ cmd' = [cmd EXCEPT ![r] = NONE]
  /\ target' = [target EXCEPT ![r] = AnyRefill]
  /\ pc' = [pc EXCEPT ![r] = "idle"]
  /\ snap' = [snap EXCEPT ![r] = Idle]
  /\ lock' = IF lock = r THEN NONE ELSE lock
  /\ UNCHANGED <<focus, expired, left, tplVars>>

(* validUntil passes. A transaction holding the row lock runs its check and
   its write within milliseconds, so the clock does not pass inside one. *)
ValidUntilPasses ==
  /\ focus = "rx"
  /\ ~expired
  /\ lock = NONE
  /\ expired' = TRUE
  /\ UNCHANGED <<focus, rxStatus, refill, bills, cmd, target, pc, snap, lock, left,
                 everCompleted, everCancelled, approvedWhileClosed, tplVars>>

(* Only typeProbe: a row stores the EXPIRED value the code never writes. *)
RowStoresExpired ==
  /\ MODE = "typeProbe"
  /\ focus = "rx"
  /\ rxStatus' = "EXPIRED"
  /\ UNCHANGED <<focus, expired, refill, bills, cmd, target, pc, snap, lock, left,
                 everCompleted, everCancelled, approvedWhileClosed, tplVars>>

(* A reviewer clicks. The server reads the version and refuses unless it is
   PENDING (findFirst, then the status check). *)
Review(v, k) ==
  /\ focus = "tpl"
  /\ tpc[v] = "idle"
  /\ tkind' = [tkind EXCEPT ![v] = k]
  /\ tpc' = [tpc EXCEPT ![v] = IF version = "PENDING" THEN "read" ELSE "done"]
  /\ UNCHANGED <<focus, rxVars, version, audit, firstDecision>>

ReviewerApproves(v) == Review(v, "APPROVED")
ReviewerRejects(v) == Review(v, "REJECTED")

(* The status update. Before the fix the code updated by id alone. The code
   now updates where the status is still PENDING and inserts the review row in
   the same transaction. *)
ServerSavesDecision(v) ==
  /\ focus = "tpl"
  /\ tpc[v] = "read"
  /\ IF DecisionCAS /\ version # "PENDING"
       THEN /\ tpc' = [tpc EXCEPT ![v] = "done"]
            /\ UNCHANGED <<version, audit, firstDecision>>
       ELSE /\ version' = tkind[v]
            /\ firstDecision' = IF firstDecision = NONE THEN tkind[v] ELSE firstDecision
            /\ IF AuditInSameTransaction
                 THEN /\ audit' = Append(audit, tkind[v])
                      /\ tpc' = [tpc EXCEPT ![v] = "done"]
                 ELSE /\ tpc' = [tpc EXCEPT ![v] = "audit"]
                      /\ UNCHANGED audit
  /\ UNCHANGED <<focus, rxVars, tkind>>

ServerSavesReviewRecord(v) ==
  /\ focus = "tpl"
  /\ tpc[v] = "audit"
  /\ audit' = Append(audit, tkind[v])
  /\ tpc' = [tpc EXCEPT ![v] = "done"]
  /\ UNCHANGED <<focus, rxVars, version, tkind, firstDecision>>

ReviewRecordFails(v) ==
  /\ focus = "tpl"
  /\ tpc[v] = "audit"
  /\ tpc' = [tpc EXCEPT ![v] = "done"]
  /\ UNCHANGED <<focus, rxVars, version, tkind, audit, firstDecision>>

Next ==
  \/ \E r \in Reqs :
       \/ DeskRequestsRefill(r) \/ DoctorApprovesRefill(r) \/ DoctorRejectsRefill(r)
       \/ DoctorCancels(r) \/ DoctorMarksCompleted(r) \/ PharmacistPostsBill(r)
       \/ ServerCommits(r)
  \/ ValidUntilPasses
  \/ RowStoresExpired
  \/ \E v \in Reviewers :
       \/ ReviewerApproves(v) \/ ReviewerRejects(v)
       \/ ServerSavesDecision(v) \/ ServerSavesReviewRecord(v) \/ ReviewRecordFails(v)

(* The server eventually finishes a request it has started. *)
Fairness ==
  /\ \A r \in Reqs : WF_vars(ServerCommits(r))
  /\ \A v \in Reviewers : WF_vars(ServerSavesDecision(v)) /\ WF_vars(ServerSavesReviewRecord(v))

Spec == Init /\ [][Next]_vars /\ Fairness

TypeOK ==
  /\ focus \in {"rx", "tpl"}
  /\ rxStatus \in RxStatuses
  /\ expired \in BOOLEAN
  /\ refill \in [Refills -> RefillStatuses]
  /\ bills \in 0..MaxBills
  /\ cmd \in [Reqs -> Commands \cup {NONE}]
  /\ target \in [Reqs -> Refills]
  /\ pc \in [Reqs -> {"idle", "sent"}]
  /\ lock \in Reqs \cup {NONE}
  /\ left \in 0..Budget
  /\ version \in {"PENDING"} \cup Decisions
  /\ tpc \in [Reviewers -> {"idle", "read", "audit", "done"}]
  /\ tkind \in [Reviewers -> Decisions \cup {NONE}]
  /\ audit \in Seq(Decisions)
  /\ firstDecision \in Decisions \cup {NONE}

AtMostOnePendingRefill == PendingCount(refill) <= 1

RefillsWithinAllowance == UsedCount(refill) <= MaxRefills

NoApprovalOnClosedPrescription == ~approvedWhileClosed

BillsWithinAllowance == bills <= 1 + UsedCount(refill)

CompletedStaysCompleted == everCompleted => rxStatus = "COMPLETED"

CancelledStaysCancelled == everCancelled => rxStatus = "CANCELLED"

StrandedRequestsClose ==
  \A f \in Refills : (refill[f] = "PENDING" /\ rxStatus \in Finished) ~> (refill[f] # "PENDING")

OneDecision == Len(audit) <= 1

DecidedStaysDecided == firstDecision # NONE => version = firstDecision

DecisionRecorded ==
  (version \in Decisions /\ \A v \in Reviewers : tpc[v] # "audit")
    => \E i \in 1..Len(audit) : audit[i] = version

=============================================================================
