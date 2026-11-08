---------------------------- MODULE Overbooking ----------------------------
(* Concurrent booking of one doctor's time slot under a per-doctor limit.
   Each request takes the doctor-day lock, counts the bookings that overlap
   the slot, then books or refuses. A request may book into an occupied slot
   only when it explicitly asks to overbook and the count is below Limit.
   MODE selects the real protocol or a deliberately broken variant. *)
EXTENDS Naturals, FiniteSets

CONSTANTS Requests, Limit, AsksToOverbook, MODE

ASSUME Limit \in Nat \ {0}
ASSUME AsksToOverbook \subseteq Requests
ASSUME MODE \in {"correct", "nolock", "countOutsideLock", "ignoreFlag"}

NONE == "none"

VARIABLES pc, lock, booked, seen

vars == <<pc, lock, booked, seen>>

UsesLock == MODE # "nolock"
CountsOutsideLock == MODE = "countOutsideLock"

Accepts(r, count) ==
  \/ count = 0
  \/ /\ count < Limit
     /\ (r \in AsksToOverbook \/ MODE = "ignoreFlag")

Init ==
  /\ pc = [r \in Requests |-> "start"]
  /\ lock = NONE
  /\ booked = {}
  /\ seen = [r \in Requests |-> 0]

\* Read the current count before taking the lock (only the broken variant does this).
EarlyCount(r) ==
  /\ CountsOutsideLock
  /\ pc[r] = "start"
  /\ seen' = [seen EXCEPT ![r] = Cardinality(booked)]
  /\ pc' = [pc EXCEPT ![r] = "counted"]
  /\ UNCHANGED <<lock, booked>>

Acquire(r) ==
  /\ pc[r] = IF CountsOutsideLock THEN "counted" ELSE "start"
  /\ IF UsesLock THEN lock = NONE /\ lock' = r ELSE UNCHANGED lock
  /\ pc' = [pc EXCEPT ![r] = "locked"]
  /\ UNCHANGED <<booked, seen>>

Count(r) ==
  /\ pc[r] = "locked"
  /\ seen' = IF CountsOutsideLock THEN seen ELSE [seen EXCEPT ![r] = Cardinality(booked)]
  /\ pc' = [pc EXCEPT ![r] = "decide"]
  /\ UNCHANGED <<lock, booked>>

Decide(r) ==
  /\ pc[r] = "decide"
  /\ IF Accepts(r, seen[r])
       THEN booked' = booked \cup {r} /\ pc' = [pc EXCEPT ![r] = "booked"]
       ELSE booked' = booked /\ pc' = [pc EXCEPT ![r] = "refused"]
  /\ lock' = IF UsesLock THEN NONE ELSE lock
  /\ UNCHANGED seen

Next == \E r \in Requests : EarlyCount(r) \/ Acquire(r) \/ Count(r) \/ Decide(r)

Spec == Init /\ [][Next]_vars /\ WF_vars(Next)

TypeOK ==
  /\ pc \in [Requests -> {"start", "counted", "locked", "decide", "booked", "refused"}]
  /\ lock \in Requests \cup {NONE}
  /\ booked \subseteq Requests
  /\ seen \in [Requests -> 0..Cardinality(Requests)]

\* The slot never holds more bookings than the doctor allows.
WithinLimit == Cardinality(booked) <= Limit

\* Only requests that asked to overbook are booked into an occupied slot.
NoAccidentalOverbook == \A r \in booked : seen[r] > 0 => r \in AsksToOverbook

\* The first request always gets the free slot: someone is booked once all finish.
Done == \A r \in Requests : pc[r] \in {"booked", "refused"}
SomeoneBooked == Done => booked # {}

\* Every request finishes (no deadlock or starvation on the lock).
AllFinish == <>Done
=============================================================================
