---------------------------- MODULE ClinicBilling ----------------------------
(* One clinic bill (NewInvoice) and its payment rows (NewPayment).

   The bill's state is three numbers: total, received and balance. Unpaid,
   part paid and paid are not stored anywhere. billing.service.ts moves the
   numbers from four places:
     a desk payment or a gateway confirmation adds to received and takes off
       balance in one conditional update (receive)
     a refund takes off received and adds to balance in one conditional update
     an admin's PATCH reads the bill, then writes total and balance

   Concurrent actors: the desk taking payments and refunds, one admin editing
   the bill, and two requests confirming the same gateway payment.

   MODE "before" is the code before the edit fix, kept as a regression
   control. "code" is the code today: the edit reads received under the row
   lock it writes with and refuses a total below it. "fixed" is the smallest
   set of guards that makes every rule hold. The other modes are fixed with
   one guard removed. *)
EXTENDS Naturals, Sequences

CONSTANTS StartTotal, Totals, PayAmounts, RefundAmount, MaxRows, Confirmers, MODE

ASSUME MODE \in {"before", "code", "fixed", "staleBalance", "editBelowReceived", "unlinkedRefund",
                 "confirmWithoutCAS", "noReconciler", "typeProbe"}

MaxMoney == 4 * MaxRows * 4
Money == 0..MaxMoney
Rows == 1..MaxRows

\* The edit reads received before its transaction and writes an absolute balance.
EditReadsInsideWrite == MODE \notin {"before", "staleBalance"}
\* The edit refuses a total below what the bill has already received.
EditRefusesBelowReceived == MODE \notin {"before", "editBelowReceived"}
\* A refund is linked to its payment and capped by what that payment has left.
RefundCappedPerPayment == MODE \notin {"before", "code", "unlinkedRefund"}
\* confirmPayment's updateMany WHERE reconStatus = 'PENDING'.
ConfirmUsesCAS == MODE # "confirmWithoutCAS"
\* A job that closes a gateway payment nobody confirmed.
HasReconciler == MODE \notin {"before", "code", "noReconciler"}

VARIABLES total, received, balance, pays, edit, confirm

vars == <<total, received, balance, pays, edit, confirm>>

Row == [kind : {"desk", "gateway", "refund"}, amt : Money, st : {"PENDING", "COMPLETED", "FAILED"}, of : 0..MaxRows]
EditState == [ph : {"idle", "read"}, seen : Money, to : Totals]
ConfirmState == [ph : {"idle", "read", "done"}, p : 0..MaxRows, seen : {"NONE", "PENDING", "COMPLETED", "FAILED"}]

TypeOK ==
  /\ total \in Money
  /\ received \in Money
  /\ balance \in Money
  /\ pays \in Seq(Row) /\ Len(pays) <= MaxRows
  /\ edit \in EditState
  /\ confirm \in [Confirmers -> ConfirmState]

Init ==
  /\ total = StartTotal
  /\ received = 0
  /\ balance = IF MODE = "typeProbe" THEN MaxMoney + 1 ELSE StartTotal
  /\ pays = <<>>
  /\ edit = [ph |-> "idle", seen |-> 0, to |-> StartTotal]
  /\ confirm = [c \in Confirmers |-> [ph |-> "idle", p |-> 0, seen |-> "NONE"]]

Max0(x) == IF x > 0 THEN x ELSE 0

\* receive(): updateMany WHERE balance >= amount, increment received, decrement balance.
Receive(a) ==
  /\ balance >= a
  /\ received' = received + a
  /\ balance' = balance - a

RefundedFrom(p) ==
  LET R[i \in 0..Len(pays)] ==
        IF i = 0 THEN 0
        ELSE R[i - 1] + (IF pays[i].kind = "refund" /\ pays[i].of = p THEN pays[i].amt ELSE 0)
  IN R[Len(pays)]

Collected ==
  LET C[i \in 0..Len(pays)] ==
        IF i = 0 THEN 0
        ELSE C[i - 1] + (IF pays[i].kind # "refund" /\ pays[i].st = "COMPLETED" THEN pays[i].amt ELSE 0)
  IN C[Len(pays)]

Refunded ==
  LET F[i \in 0..Len(pays)] ==
        IF i = 0 THEN 0
        ELSE F[i - 1] + (IF pays[i].kind = "refund" THEN pays[i].amt ELSE 0)
  IN F[Len(pays)]

\* processPayment without a gateway: payAtDesk runs receive and creates a
\* COMPLETED row in one transaction.
DeskTakesPayment(a) ==
  /\ Len(pays) < MaxRows
  /\ Receive(a)
  /\ pays' = Append(pays, [kind |-> "desk", amt |-> a, st |-> "COMPLETED", of |-> 0])
  /\ UNCHANGED <<total, edit, confirm>>

\* processPayment with a gateway: checks the balance, creates a PENDING row,
\* and leaves the bill alone.
DeskStartsGatewayPayment(a) ==
  /\ Len(pays) < MaxRows
  /\ a <= balance
  /\ pays' = Append(pays, [kind |-> "gateway", amt |-> a, st |-> "PENDING", of |-> 0])
  /\ UNCHANGED <<total, received, balance, edit, confirm>>

\* confirmPayment's findFirst, before its transaction.
DeskOpensConfirm(c, p) ==
  /\ confirm[c].ph = "idle"
  /\ p <= Len(pays) /\ pays[p].kind = "gateway"
  /\ confirm' = [confirm EXCEPT ![c] = [ph |-> "read", p |-> p, seen |-> pays[p].st]]
  /\ UNCHANGED <<total, received, balance, pays, edit>>

\* confirmPayment's transaction: mark COMPLETED where still PENDING, then
\* receive. If receive refuses, the transaction rolls back and nothing changes.
DeskConfirms(c) ==
  /\ confirm[c].ph = "read"
  /\ LET p == confirm[c].p
         a == pays[p].amt
         pending == IF ConfirmUsesCAS THEN pays[p].st = "PENDING" ELSE confirm[c].seen = "PENDING"
     IN /\ confirm' = [confirm EXCEPT ![c].ph = "done"]
        /\ IF pending /\ balance >= a
             THEN /\ Receive(a)
                  /\ pays' = [pays EXCEPT ![p].st = "COMPLETED"]
             ELSE UNCHANGED <<received, balance, pays>>
  /\ UNCHANGED <<total, edit>>

\* processRefund: the payment must be COMPLETED and at least the refund; the
\* bill must still hold that much as received.
DeskRefunds(p) ==
  /\ Len(pays) < MaxRows
  /\ p <= Len(pays)
  /\ pays[p].kind # "refund" /\ pays[p].st = "COMPLETED"
  /\ RefundAmount <= pays[p].amt
  /\ received >= RefundAmount
  /\ RefundCappedPerPayment => RefundedFrom(p) + RefundAmount <= pays[p].amt
  /\ received' = received - RefundAmount
  /\ balance' = balance + RefundAmount
  /\ pays' = Append(pays, [kind |-> "refund", amt |-> RefundAmount, st |-> "COMPLETED", of |-> p])
  /\ UNCHANGED <<total, edit, confirm>>

\* updateInvoice's findInvoiceById, before its transaction.
AdminOpensEdit(t) ==
  /\ edit.ph = "idle"
  /\ edit' = [ph |-> "read", seen |-> received, to |-> t]
  /\ UNCHANGED <<total, received, balance, pays, confirm>>

\* updateInvoice's transaction: total from the new items or discount. In
\* "before", balance = max(total - received, 0) with received from the read.
\* In "code", received comes from the row the transaction has locked, and a
\* total below it rolls the transaction back.
AdminSavesEdit ==
  /\ edit.ph = "read"
  /\ edit' = [edit EXCEPT !.ph = "idle"]
  /\ LET t == edit.to
         r == IF EditReadsInsideWrite THEN received ELSE edit.seen
     IN IF EditRefusesBelowReceived /\ received > t
          THEN UNCHANGED <<total, balance>>
          ELSE /\ total' = t
               /\ balance' = Max0(t - r)
  /\ UNCHANGED <<received, pays, confirm>>

\* fixed only: a reconciliation job closes a gateway payment nobody confirmed.
GatewayPaymentExpires(p) ==
  /\ HasReconciler
  /\ p <= Len(pays) /\ pays[p].st = "PENDING"
  /\ pays' = [pays EXCEPT ![p].st = "FAILED"]
  /\ UNCHANGED <<total, received, balance, edit, confirm>>

Next ==
  \/ \E a \in PayAmounts : DeskTakesPayment(a) \/ DeskStartsGatewayPayment(a)
  \/ \E c \in Confirmers, p \in Rows : DeskOpensConfirm(c, p)
  \/ \E c \in Confirmers : DeskConfirms(c)
  \/ \E p \in Rows : DeskRefunds(p)
  \/ \E t \in Totals : AdminOpensEdit(t)
  \/ AdminSavesEdit
  \/ \E p \in Rows : GatewayPaymentExpires(p)

\* The reconciliation job runs on a timer. No fairness on any person's action.
Spec == Init /\ [][Next]_vars /\ \A p \in Rows : WF_vars(GatewayPaymentExpires(p))

-----------------------------------------------------------------------------

BalanceMatches == balance = Max0(total - received)

ReceivedWithinTotal == received <= total

RefundsWithinPayment ==
  \A p \in 1..Len(pays) : pays[p].kind # "refund" => RefundedFrom(p) <= pays[p].amt

ReceivedMatchesPayments == received + Refunded = Collected

Pending(p) == p <= Len(pays) /\ pays[p].st = "PENDING"

\* Rows are only appended and never return to PENDING, so with a bounded
\* number of rows this says every pending payment eventually leaves PENDING.
AnyPending == \E p \in Rows : Pending(p)

GatewayPaymentSettles == [](AnyPending => <>~AnyPending)

=============================================================================
