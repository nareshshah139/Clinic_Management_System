---------------------------- MODULE DispenseQueue ----------------------------
(* One prescription at the pharmacy counter, its dispense task with one
   medicine line, and the pharmacy bill for it.

   The task status is stored in PharmacyDispenseTask.status. The queue never
   shows that value directly. Every read passes it through syncedTaskStatus
   with the status derived from posted bills, and mergeTask recomputes Ready to
   bill from the line review. Shown and QueueShown below are those reads.

   Every writer locks the prescription row and then the task row, so each
   request is one atomic step, except the status request. That one is split
   into the check (taken under the lock) and the save, so the checkBeforeLock
   control can let a line review run in between.

   MODE selects the code before the fix, today's code, the fixed protocol, or
   the fixed protocol with one guard removed. Today's code is the fixed
   protocol plus one allowance: repeating a finished status is a no-op. *)
EXTENDS FiniteSets

CONSTANT MODE

Modes == {"before", "code", "fixed", "typeProbe", "paidWithoutBill", "reopenFinished",
          "createUnstamped", "checkBeforeLock", "cancelSticky"}
ASSUME MODE \in Modes

TaskStatus == {"QUEUED", "IN_REVIEW", "PARTIALLY_FILLED", "PAUSED",
               "READY_TO_BILL", "PAID", "DISPENSED", "CANCELLED"}
Finished == {"PAID", "DISPENSED", "CANCELLED"}
Stampable == {"IN_REVIEW", "PAUSED", "READY_TO_BILL", "PAID", "DISPENSED", "CANCELLED"}
\* Statuses a status request can carry: the counter's Pause, Mark paid, Ready to bill
\* and the start of review, plus CANCELLED, which only an API caller sends.
Requestable == {"IN_REVIEW", "PAUSED", "READY_TO_BILL", "PAID", "CANCELLED"}
LineAction == {"PENDING", "ACCEPTED", "UNAVAILABLE"}

VARIABLES task, line, bill, stamped, pending, seen, screen
vars == <<task, line, bill, stamped, pending, seen, screen>>

Fixed == MODE \notin {"before", "typeProbe"}

\* Each fixed guard is on in fixed and in every control except the one named for its removal.
On(guard) ==
  /\ Fixed
  /\ CASE guard = "finishedRefused"    -> MODE # "reopenFinished"
       [] guard = "paidNeedsBill"      -> MODE # "paidWithoutBill"
       [] guard = "stampOnCreate"      -> MODE # "createUnstamped"
       [] guard = "billOutranksCancel" -> MODE # "cancelSticky"

\* lockDispenseTask holds the task row before saveTaskStatus reads the lines.
Locked == MODE # "checkBeforeLock"

\* toQueueEntry: a posted bill that covers the prescription makes it dispensed.
Derived == IF bill = "posted" THEN "dispensed" ELSE "pending"

\* syncedTaskStatus and the SQL "synced" CTE.
Synced(s) ==
  CASE s = "PAID" -> s
    [] s = "CANCELLED" /\ ~(On("billOutranksCancel") /\ Derived = "dispensed") -> s
    [] Derived = "dispensed" -> "DISPENSED"
    [] s = "DISPENSED" -> "QUEUED"
    [] OTHER -> s

\* nextStatusAfterLineReview with the one current line.
LineReview(s, a) ==
  CASE s \in Finished -> s
    [] a = "PENDING" -> "IN_REVIEW"
    [] a = "UNAVAILABLE" -> "PARTIALLY_FILLED"
    [] OTHER -> "READY_TO_BILL"

\* taskStatusFromQueue, used for a prescription with no task yet.
FromQueue == IF Derived = "dispensed" THEN "DISPENSED" ELSE "QUEUED"

\* mergeTask's dispenseStatus: what the counter shows as the task status.
Shown ==
  IF task = "NONE" THEN FromQueue
  ELSE IF Synced(task) = "READY_TO_BILL" THEN LineReview("READY_TO_BILL", line)
  ELSE Synced(task)

\* mergeTask's status through queueStatusFromTask: the queue filter the prescription is in.
QueueShown ==
  IF task = "NONE" THEN Derived
  ELSE CASE Synced(task) = "DISPENSED" -> "dispensed"
         [] Synced(task) = "PARTIALLY_FILLED" -> "partial"
         [] Synced(task) \in {"PAUSED", "CANCELLED"} -> "expired"
         [] OTHER -> Derived

\* statusTimestampPatch, applied only when the status value changes.
Stamp(old, new) == IF new # old /\ new \in Stampable THEN stamped \cup {new} ELSE stamped

Idle == pending = "none"
Free == Idle \/ ~Locked
\* seen records whether the counter has ever shown a finished status, and Dispensed.
\* screen is what it shows now, kept as a variable only so the chart can label states by it.
Track ==
  /\ seen' = seen \cup (IF Shown' \in Finished THEN {"finished"} ELSE {})
                  \cup (IF Shown' = "DISPENSED" THEN {"dispensed"} ELSE {})
  /\ screen' = [task |-> Shown', queue |-> QueueShown']

Init ==
  /\ task = "NONE"
  /\ line = "PENDING"
  /\ bill = "none"
  /\ stamped = {}
  /\ pending = "none"
  /\ seen = {}
  /\ screen = [task |-> "QUEUED", queue |-> "pending"]

\* pull -> ensureTaskForEntry: create the task from the queue status, or sync it.
YouOpenPrescription ==
  /\ Free
  /\ IF task = "NONE"
     THEN /\ task' = FromQueue
          /\ line' = "PENDING"
          /\ stamped' = IF On("stampOnCreate") /\ FromQueue \in Stampable THEN {FromQueue} ELSE {}
     ELSE LET s == IF Synced(task) = "READY_TO_BILL" THEN LineReview(task, line) ELSE Synced(task)
          IN /\ task' = s
             /\ stamped' = Stamp(task, s)
             /\ UNCHANGED line
  /\ UNCHANGED <<bill, pending>>
  /\ Track

\* saveTaskLine: write the line action, then recompute the status from the lines.
YouReviewLine(a) ==
  /\ Free
  /\ task # "NONE"
  /\ line' = a
  /\ task' = LineReview(task, a)
  /\ stamped' = Stamp(task, LineReview(task, a))
  /\ UNCHANGED <<bill, pending>>
  /\ Track

\* saveTaskStatus up to its checks. Before the fix the only checks were the DISPENSED
\* refusal (no DISPENSED in Requestable) and Ready to bill needing reviewed lines.
\* Today's statusRefusal also lets a request repeat the finished status it already has.
RepeatFinished(s) == MODE = "code" /\ Synced(task) \in Finished /\ s = Synced(task)

Allowed(s) ==
  \/ RepeatFinished(s)
  \/ /\ s = "READY_TO_BILL" => line = "ACCEPTED"
     /\ On("finishedRefused") => Synced(task) \notin Finished
     /\ (On("paidNeedsBill") /\ s = "PAID") => bill = "posted"

YouRequestStatus(s) ==
  /\ Idle
  /\ task # "NONE"
  /\ Allowed(s)
  /\ pending' = s
  /\ UNCHANGED <<task, line, bill, stamped, seen, screen>>

\* saveTaskStatus's update, then commit.
ServerSavesStatus ==
  /\ pending # "none"
  /\ task' = pending
  /\ stamped' = Stamp(task, pending)
  /\ pending' = "none"
  /\ UNCHANGED <<line, bill>>
  /\ Track

\* checkout or finishDraft -> transitionInvoice to CONFIRMED, covering every line.
DeskPostsBill ==
  /\ Free
  /\ bill = "none"
  /\ bill' = IF MODE = "typeProbe" THEN "lost" ELSE "posted"
  /\ UNCHANGED <<task, line, stamped, pending>>
  /\ Track

Next ==
  \/ YouOpenPrescription
  \/ \E a \in LineAction : YouReviewLine(a)
  \/ YouRequestStatus("CANCELLED")
  \/ \E s \in Requestable \ {"CANCELLED"} : YouRequestStatus(s)
  \/ ServerSavesStatus
  \/ DeskPostsBill

\* Every other step is a person's request and gets no fairness. The one assumption is
\* that the server eventually finishes a status request it has started. The queue is
\* computed on each read, so BillShowsDone asks whether it shows Done once the bill
\* posts with nobody acting.
ServerAnswers == WF_vars(ServerSavesStatus)

Spec == Init /\ [][Next]_vars /\ ServerAnswers

TypeOK ==
  /\ task \in TaskStatus \cup {"NONE"}
  /\ line \in LineAction
  /\ bill \in {"none", "posted"}
  /\ stamped \subseteq Stampable
  /\ pending \in Requestable \cup {"none"}
  /\ seen \subseteq {"finished", "dispensed"}
  /\ screen \in [task : TaskStatus, queue : {"pending", "partial", "dispensed", "expired"}]

PaidNeedsBill == task = "PAID" => bill = "posted"

FinishedStaysFinished == "finished" \in seen => Shown \in Finished

DispensedStaysDispensed == "dispensed" \in seen => Shown = "DISPENSED"

ReadyMeansReviewed == task = "READY_TO_BILL" => line = "ACCEPTED"

StatusHasTimestamp == task \in Stampable => task \in stamped

BillShowsDone == [](bill = "posted" => <>(QueueShown = "dispensed"))
=============================================================================
