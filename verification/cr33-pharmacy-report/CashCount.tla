---------------------------- MODULE CashCount ----------------------------
(***************************************************************************)
(* CR-33 daily collection: several staff count the same clinic day at     *)
(* once. Each reads the latest count, types theirs, and saves it with the  *)
(* sequence it was based on (PharmacyReportsService.recordCount). The      *)
(* server appends the count with sequence basedOn + 1 only when basedOn is *)
(* still the latest; the unique key (branchId, day, sequence) settles two  *)
(* saves racing between the check and the insert.                         *)
(*                                                                         *)
(* MODE "correct"     the check plus the unique key, as built              *)
(* MODE "noCheck"     no basedOn check: append after whatever is latest    *)
(* MODE "noUnique"    the check is a separate read, and no unique key      *)
(* MODE "overwrite"   one row per day, last write wins                     *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Staff, MaxSaves, MODE

VARIABLES
  counts,      \* the stored counts, in order: records [seq, by, basedOn]
  seen,        \* seen[s]: the latest sequence s had on screen when typing
  phase,       \* phase[s]: "idle", "typing", "checked" (noUnique only), "done"
  checkedAt,   \* checkedAt[s]: latest sequence when the noUnique check ran
  refused,     \* staff told someone else saved first
  saves        \* attempts so far, to keep the model finite

vars == <<counts, seen, phase, checkedAt, refused, saves>>

Latest == IF counts = <<>> THEN 0 ELSE counts[Len(counts)].seq

Init ==
  /\ counts = <<>>
  /\ seen = [s \in Staff |-> 0]
  /\ phase = [s \in Staff |-> "idle"]
  /\ checkedAt = [s \in Staff |-> 0]
  /\ refused = {}
  /\ saves = 0

\* Open the day (or reload it after a refusal): the screen shows the latest count.
Open(s) ==
  /\ phase[s] \in {"idle", "done"}
  /\ saves < MaxSaves
  /\ seen' = [seen EXCEPT ![s] = Latest]
  /\ phase' = [phase EXCEPT ![s] = "typing"]
  /\ UNCHANGED <<counts, checkedAt, refused, saves>>

AddCount(s, seq) == counts' = Append(counts, [seq |-> seq, by |-> s, basedOn |-> seen[s]])

\* The save, atomic in the database: check basedOn, insert, unique key.
Save(s) ==
  /\ MODE \in {"correct", "noCheck", "overwrite"}
  /\ phase[s] = "typing"
  /\ saves' = saves + 1
  /\ phase' = [phase EXCEPT ![s] = "done"]
  /\ UNCHANGED <<seen, checkedAt>>
  /\ \/ /\ MODE = "correct"
        /\ IF Latest = seen[s]
             THEN AddCount(s, seen[s] + 1) /\ refused' = refused \ {s}
             ELSE counts' = counts /\ refused' = refused \cup {s}
     \/ /\ MODE = "noCheck"
        /\ AddCount(s, Latest + 1) /\ refused' = refused
     \/ /\ MODE = "overwrite"
        /\ counts' = <<[seq |-> 1, by |-> s, basedOn |-> seen[s]]>> /\ refused' = refused

\* noUnique: the check is one step and the insert another, with nothing to stop a second insert.
Check(s) ==
  /\ MODE = "noUnique"
  /\ phase[s] = "typing"
  /\ IF Latest = seen[s]
       THEN /\ phase' = [phase EXCEPT ![s] = "checked"] /\ refused' = refused
       ELSE /\ phase' = [phase EXCEPT ![s] = "done"] /\ refused' = refused \cup {s}
  /\ checkedAt' = [checkedAt EXCEPT ![s] = Latest]
  /\ saves' = saves + 1
  /\ UNCHANGED <<counts, seen>>

Insert(s) ==
  /\ MODE = "noUnique"
  /\ phase[s] = "checked"
  /\ AddCount(s, seen[s] + 1)
  /\ phase' = [phase EXCEPT ![s] = "done"]
  /\ UNCHANGED <<seen, checkedAt, refused, saves>>

Next == \E s \in Staff : Open(s) \/ Save(s) \/ Check(s) \/ Insert(s)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
TypeOK ==
  /\ phase \in [Staff -> {"idle", "typing", "checked", "done"}]
  /\ refused \subseteq Staff
  /\ saves \in 0..(MaxSaves + Cardinality(Staff))

\* The history is a contiguous chain 1..n: no gaps, no two counts with one sequence.
Contiguous == \A i \in 1..Len(counts) : counts[i].seq = i

\* No lost update: every saved count was typed by someone looking at the count it replaces.
NoLostUpdate == \A i \in 1..Len(counts) : counts[i].basedOn = i - 1

\* Nothing is ever erased: a count once saved stays in the history (checked as an action property).
HistoryKept == [][Len(counts') >= Len(counts) /\ SubSeq(counts', 1, Len(counts)) = counts]_vars

\* The day can always be counted: some save eventually succeeds when anyone tries.
SomeoneCounted == (saves = MaxSaves /\ \A s \in Staff : phase[s] = "done") => Len(counts) >= 1
=============================================================================
