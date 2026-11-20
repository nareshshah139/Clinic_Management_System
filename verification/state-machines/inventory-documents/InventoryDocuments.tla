-------------------------- MODULE InventoryDocuments --------------------------
(* A shortbook request, the purchase order made from it, and one inward challan
   that receives goods against the order. All three are
   InventoryWorkflowDocument rows with a status and a version.

   Two people work on them at once. Each sends one request at a time, carrying
   the version they last saw. The server runs every request as one
   Serializable transaction that may abort on a conflict and is retried at most
   twice. The order wants 2 units. The challan carries 1 or 2.

   MODE "code" is the code today. "fixed" adds the one change the model asks
   for. Every other mode is "fixed" with one guard removed. *)
EXTENDS Naturals

CONSTANTS Actors, MODE

ASSUME MODE \in {"code", "fixed", "typeProbe", "noVersionCheck", "noPostedCheck",
                 "convertIgnoresFinal", "receiptIgnoresClosedShortbook",
                 "rejectOrderedShortbook", "retryUnbounded"}

NONE == "none"
Docs == {"sb", "po", "rc"}
Statuses == {"ABSENT", "DRAFT", "AWAITING_APPROVAL", "APPROVED", "ORDERED", "SENT",
             "PART_RECEIVED", "RECEIVED", "POSTED", "CHALLAN", "REVERSED",
             "CANCELLED", "REJECTED"}
\* FINAL in inventory-workflow.service.ts:52, which convert() checks.
FINAL == {"POSTED", "RECEIVED", "RELEASED", "REVERSED", "CANCELLED", "REJECTED"}
Terminal == {"CANCELLED", "REJECTED", "REVERSED"}
Closed == {"CANCELLED", "REJECTED"}
Acts == {"SbCreatePO", "SbCancel", "SbReject", "PoSubmit", "PoApprove", "PoCancel",
         "PoReject", "PoCancelRemaining", "RcPost", "RcReverse"}
MaxVer == 6

DocOf(act) ==
  IF act \in {"SbCreatePO", "SbCancel", "SbReject"} THEN "sb"
  ELSE IF act \in {"RcPost", "RcReverse"} THEN "rc"
  ELSE "po"

Requests == [act: Acts, ver: 0..MaxVer, tries: 0..2]
Idle == [act |-> "idle", ver |-> 0, tries |-> 0]

(* st, ver     each document's status and version column
   req         each person's request in flight, Idle when none
   rqty        units on the challan
   posts       times the challan's stock effects were applied
   final       the first terminal status each document reached
   staleWrote  a request changed a document whose version it had not seen *)
VARIABLES st, ver, req, rqty, posts, final, staleWrote

vars == <<st, ver, req, rqty, posts, final, staleWrote>>

FixClose == MODE # "code"

Init ==
  /\ st = [d \in Docs |-> IF d = "po" THEN "ABSENT" ELSE "DRAFT"]
  /\ ver = [d \in Docs |-> IF d = "po" THEN 0 ELSE 1]
  /\ req = [a \in Actors |-> Idle]
  /\ rqty \in {1, 2}
  /\ posts = IF MODE = "typeProbe" THEN 3 ELSE 0
  /\ final = [d \in Docs |-> NONE]
  /\ staleWrote = FALSE

Refused == [ok |-> FALSE, st |-> st, w |-> {}, post |-> 0]
Done(nst, w, p) == [ok |-> TRUE, st |-> nst, w |-> w, post |-> p]

\* Closing an order closes its shortbook request (fixed and the controls only).
CloseShortbook(nst) ==
  IF FixClose /\ st["sb"] \in {"ORDERED", "PART_RECEIVED"}
    THEN [nst EXCEPT !["sb"] = "CANCELLED"]
    ELSE nst

CloseWrites == IF FixClose /\ st["sb"] \in {"ORDERED", "PART_RECEIVED"} THEN {"sb"} ELSE {}

(* updateOrderReceipt recomputes the order and the shortbook from the posted
   challans. received is 0 after a reversal and rqty after a post. *)
ReceiptOutcome(nst, received) ==
  LET po == IF st["po"] = "CANCELLED" THEN "CANCELLED"
            ELSE IF received = 2 THEN "RECEIVED"
            ELSE IF received > 0 THEN "PART_RECEIVED" ELSE "APPROVED"
      sbOpen == st["sb"] \notin Closed \/ MODE = "receiptIgnoresClosedShortbook"
      sb == IF received = 2 THEN "RECEIVED"
            ELSE IF received > 0 THEN "PART_RECEIVED" ELSE "ORDERED"
  IN [nst EXCEPT !["po"] = po, !["sb"] = IF sbOpen THEN sb ELSE st["sb"]]

ReceiptWrites == IF st["sb"] \notin Closed \/ MODE = "receiptIgnoresClosedShortbook"
                   THEN {"po", "sb"} ELSE {"po"}

PostFrom == IF MODE = "noPostedCheck" THEN Statuses ELSE {"DRAFT", "APPROVED", "CHALLAN"}
SbRejectFrom == {"DRAFT", "AWAITING_APPROVAL"}
                \cup (IF MODE = "rejectOrderedShortbook" THEN {"ORDERED"} ELSE {})

\* What the transaction decides, from move(), convert(), reverse(),
\* updateOrderReceipt() and cancelRemaining().
Outcome(act) ==
  CASE act = "SbCreatePO" ->
         IF st["sb"] \in FINAL /\ MODE # "convertIgnoresFinal" THEN Refused
         ELSE IF st["po"] # "ABSENT" THEN Done(st, {}, 0)
         ELSE Done([st EXCEPT !["po"] = "DRAFT", !["sb"] = "ORDERED"], {"po", "sb"}, 0)
    [] act = "SbCancel" ->
         IF st["sb"] \in {"DRAFT", "AWAITING_APPROVAL", "APPROVED", "CHALLAN"}
           THEN Done([st EXCEPT !["sb"] = "CANCELLED"], {"sb"}, 0) ELSE Refused
    [] act = "SbReject" ->
         IF st["sb"] \in SbRejectFrom
           THEN Done([st EXCEPT !["sb"] = "REJECTED"], {"sb"}, 0) ELSE Refused
    [] act = "PoSubmit" ->
         IF st["po"] = "DRAFT"
           THEN Done([st EXCEPT !["po"] = "AWAITING_APPROVAL"], {"po"}, 0) ELSE Refused
    [] act = "PoApprove" ->
         IF st["po"] = "AWAITING_APPROVAL"
           THEN Done([st EXCEPT !["po"] = "APPROVED"], {"po"}, 0) ELSE Refused
    [] act = "PoCancel" ->
         IF st["po"] \in {"DRAFT", "AWAITING_APPROVAL", "APPROVED", "CHALLAN"}
            /\ st["rc"] \notin {"POSTED", "CHALLAN"}
           THEN Done(CloseShortbook([st EXCEPT !["po"] = "CANCELLED"]), {"po"} \cup CloseWrites, 0)
           ELSE Refused
    [] act = "PoReject" ->
         IF st["po"] \in {"DRAFT", "AWAITING_APPROVAL"}
           THEN Done(CloseShortbook([st EXCEPT !["po"] = "REJECTED"]), {"po"} \cup CloseWrites, 0)
           ELSE Refused
    [] act = "PoCancelRemaining" ->
         IF st["po"] \in {"DRAFT", "AWAITING_APPROVAL", "APPROVED", "SENT", "PART_RECEIVED"}
           THEN Done([st EXCEPT !["po"] = "CANCELLED", !["sb"] = "CANCELLED"], {"po", "sb"}, 0)
           ELSE Refused
    [] act = "RcPost" ->
         IF st["rc"] \in PostFrom /\ st["po"] \in {"APPROVED", "SENT", "PART_RECEIVED"}
           THEN Done(ReceiptOutcome([st EXCEPT !["rc"] = "POSTED"], rqty), {"rc"} \cup ReceiptWrites, 1)
           ELSE Refused
    [] act = "RcReverse" ->
         IF st["rc"] \in {"POSTED", "CHALLAN"}
            /\ st["po"] \in {"APPROVED", "SENT", "PART_RECEIVED", "RECEIVED", "CANCELLED"}
           THEN Done(ReceiptOutcome([st EXCEPT !["rc"] = "REVERSED"], 0), {"rc"} \cup ReceiptWrites, 0)
           ELSE Refused

\* A person sends a request for the document version on screen.
UserSends(a) ==
  /\ req[a] = Idle
  /\ \E act \in Acts :
       /\ st[DocOf(act)] # "ABSENT"
       /\ req' = [req EXCEPT ![a] = [act |-> act, ver |-> ver[DocOf(act)], tries |-> 0]]
  /\ UNCHANGED <<st, ver, rqty, posts, final, staleWrote>>

\* transaction() commits the request, or refuses it with nothing written.
ServerCommits(a) ==
  /\ req[a] # Idle
  /\ LET r == req[a]
         stale == r.ver # ver[DocOf(r.act)]
         o == Outcome(r.act)
     IN IF (stale /\ MODE # "noVersionCheck") \/ ~o.ok
          THEN UNCHANGED <<st, ver, posts, final, staleWrote>>
          ELSE /\ st' = o.st
               /\ ver' = [d \in Docs |-> IF d \in o.w THEN ver[d] + 1 ELSE ver[d]]
               /\ posts' = posts + o.post
               /\ final' = [d \in Docs |-> IF final[d] = NONE /\ o.st[d] \in Terminal
                                             THEN o.st[d] ELSE final[d]]
               /\ staleWrote' = (staleWrote \/ (stale /\ DocOf(r.act) \in o.w))
  /\ req' = [req EXCEPT ![a] = Idle]
  /\ UNCHANGED rqty

(* PostgreSQL aborts a Serializable transaction that conflicts with another in
   flight (P2034). transaction() retries twice, then fails the request. The
   unbounded variant keeps the count modulo 3 because nothing else reads it. *)
ServerAborts(a) ==
  /\ req[a] # Idle
  /\ \E b \in Actors \ {a} : req[b] # Idle
  /\ IF MODE = "retryUnbounded"
       THEN req' = [req EXCEPT ![a].tries = (@ + 1) % 3]
     ELSE IF req[a].tries < 2
       THEN req' = [req EXCEPT ![a].tries = @ + 1]
     ELSE req' = [req EXCEPT ![a] = Idle]
  /\ UNCHANGED <<st, ver, rqty, posts, final, staleWrote>>

Server(a) == ServerCommits(a) \/ ServerAborts(a)

Next == \E a \in Actors : UserSends(a) \/ Server(a)

\* Weak fairness only on the server's handling of a request already sent: the
\* database eventually answers. No fairness on anyone sending a request.
Spec == Init /\ [][Next]_vars /\ \A a \in Actors : WF_vars(Server(a))

TypeOK ==
  /\ st \in [Docs -> Statuses]
  /\ ver \in [Docs -> 0..MaxVer]
  /\ req \in [Actors -> Requests \cup {Idle}]
  /\ rqty \in {1, 2}
  /\ posts \in 0..2
  /\ final \in [Docs -> Terminal \cup {NONE}]
  /\ staleWrote \in BOOLEAN

\* A request never changes a document version it did not see.
StaleNeverWrites == ~staleWrote

\* The challan's stock is added at most once.
PostedOnce == posts <= 1

\* A cancelled, rejected or reversed document keeps that status.
TerminalStaysTerminal == \A d \in Docs : final[d] # NONE => st[d] = final[d]

\* A shortbook never shows ordered or received while its order is cancelled or rejected.
ShortbookFollowsOrder == st["sb"] \in {"ORDERED", "PART_RECEIVED", "RECEIVED"} => st["po"] \notin Closed

\* Every request the server takes finishes, committed or refused.
RequestsFinish == \A a \in Actors : [](req[a] # Idle => <>(req[a] = Idle))
=============================================================================
