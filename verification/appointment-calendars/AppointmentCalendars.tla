------------------------- MODULE AppointmentCalendars -------------------------
(* A doctor's day has two calendars. The Scheduled calendar holds patients
   booked ahead who still need a confirmation call. The Confirmed calendar
   holds patients confirmed for the day, and those who arrived. Each calendar
   has its own capacity: a booking or move counts only the appointments in its
   target calendar.

   Concurrent requests:
     book    create an appointment in a calendar at a slot
     place   move an appointment to a calendar and slot (confirm, move back
             to Scheduled, or change time); a request that is already
             satisfied succeeds without writing
     cancel  cancel a Scheduled or Confirmed appointment
     arrive  a visit starts; a Scheduled patient who walks in joins the
             Confirmed calendar without a capacity check

   book and place take the doctor-day lock, read and count under it, and
   write with a compare-and-set on the status and slot they read. cancel and
   arrive take no lock and write with a compare-and-set.

   Slots are disjoint, so two appointments overlap exactly when they share a
   slot. MODE selects the real protocol or a deliberately broken variant. *)
EXTENDS Naturals, FiniteSets

CONSTANTS Appts, Slots, Reqs, Limit, MODE

ASSUME Limit \in Nat \ {0}
ASSUME MODE \in {"correct", "noTargetCheck", "countSourceCalendar",
                 "countOutsideLock", "noCAS", "noNoop"}

NONE == "none"
Calendars == {"SCHEDULED", "CONFIRMED"}
Statuses == {"ABSENT", "SCHEDULED", "CONFIRMED", "ARRIVED", "CANCELLED"}
Movable == {"SCHEDULED", "CONFIRMED"}

\* The calendar an appointment appears in; cancelled and absent appear in none.
CalendarOf(st) ==
  CASE st = "SCHEDULED" -> "SCHEDULED"
    [] st \in {"CONFIRMED", "ARRIVED"} -> "CONFIRMED"
    [] OTHER -> NONE

\* A booking or move into calendar c gives the appointment status c.
EntryStatus(c) == c

AskValues == IF Limit = 1 THEN {FALSE} ELSE BOOLEAN

ReqSpace ==
  [kind: {"book", "place"}, appt: Appts, cal: Calendars, slot: Slots, ask: AskValues]
  \cup [kind: {"cancel", "arrive"}, appt: Appts, cal: {NONE}, slot: {NONE}, ask: {FALSE}]

Placements == {<<"ABSENT", NONE>>} \cup ({"SCHEDULED", "CONFIRMED"} \X Slots)

VARIABLES status, slot, req, pc, lock, seenStatus, seenSlot, seenCount,
          walkedIn, overbookedBy, history

vars == <<status, slot, req, pc, lock, seenStatus, seenSlot, seenCount,
          walkedIn, overbookedBy, history>>

Occupants(c, s, except) ==
  {b \in Appts \ {except} : CalendarOf(status[b]) = c /\ slot[b] = s}

Planned(c, s) ==
  {b \in Appts \ walkedIn : CalendarOf(status[b]) = c /\ slot[b] = s}

Accepts(r, count) == count = 0 \/ (count < Limit /\ req[r].ask)

Locking(r) == req[r].kind \in {"book", "place"}

\* The calendar the capacity check counts. The broken variant counts where the
\* appointment is now instead of where it is going.
CountedCalendar(r) ==
  IF MODE = "countSourceCalendar" /\ req[r].kind = "place"
     /\ CalendarOf(status[req[r].appt]) # NONE
    THEN CalendarOf(status[req[r].appt])
    ELSE req[r].cal

Satisfied(r) ==
  /\ req[r].kind = "place"
  /\ CalendarOf(seenStatus[r]) = req[r].cal
  /\ seenSlot[r] = req[r].slot

Valid(r) ==
  IF req[r].kind = "book" THEN seenStatus[r] = "ABSENT" ELSE seenStatus[r] \in Movable

Checked(r) == ~(MODE = "noTargetCheck" /\ req[r].kind = "place")

Init ==
  /\ \E p \in [Appts -> Placements] :
       /\ status = [a \in Appts |-> p[a][1]]
       /\ slot = [a \in Appts |-> p[a][2]]
  /\ \A c \in Calendars, s \in Slots :
       Cardinality({a \in Appts : CalendarOf(status[a]) = c /\ slot[a] = s}) <= Limit
  /\ req \in [Reqs -> ReqSpace]
  /\ pc = [r \in Reqs |-> "start"]
  /\ lock = NONE
  /\ seenStatus = [r \in Reqs |-> NONE]
  /\ seenSlot = [r \in Reqs |-> NONE]
  /\ seenCount = [r \in Reqs |-> 0]
  /\ walkedIn = {}
  /\ overbookedBy = {}
  /\ history = [a \in Appts |-> {status[a]}]

Observe(r) ==
  /\ seenStatus' = [seenStatus EXCEPT ![r] = status[req[r].appt]]
  /\ seenSlot' = [seenSlot EXCEPT ![r] = slot[req[r].appt]]
  /\ seenCount' = [seenCount EXCEPT ![r] =
                     Cardinality(Occupants(CountedCalendar(r), req[r].slot, req[r].appt))]

\* Only the broken variant reads before taking the lock.
EarlyRead(r) ==
  /\ Locking(r)
  /\ MODE = "countOutsideLock"
  /\ pc[r] = "start"
  /\ Observe(r)
  /\ pc' = [pc EXCEPT ![r] = "counted"]
  /\ UNCHANGED <<status, slot, req, lock, walkedIn, overbookedBy, history>>

Acquire(r) ==
  /\ Locking(r)
  /\ pc[r] = IF MODE = "countOutsideLock" THEN "counted" ELSE "start"
  /\ lock = NONE
  /\ lock' = r
  /\ pc' = [pc EXCEPT ![r] = IF MODE = "countOutsideLock" THEN "decide" ELSE "locked"]
  /\ UNCHANGED <<status, slot, req, seenStatus, seenSlot, seenCount, walkedIn, overbookedBy, history>>

Read(r) ==
  /\ pc[r] = "locked"
  /\ Observe(r)
  /\ pc' = [pc EXCEPT ![r] = "decide"]
  /\ UNCHANGED <<status, slot, req, lock, walkedIn, overbookedBy, history>>

Decide(r) ==
  /\ pc[r] = "decide"
  /\ IF Satisfied(r) /\ MODE # "noNoop"
       THEN pc' = [pc EXCEPT ![r] = "done"] /\ lock' = NONE
     ELSE IF Valid(r) /\ (~Checked(r) \/ Accepts(r, seenCount[r]))
       THEN pc' = [pc EXCEPT ![r] = "write"] /\ UNCHANGED lock
     ELSE pc' = [pc EXCEPT ![r] = "refused"] /\ lock' = NONE
  /\ UNCHANGED <<status, slot, req, seenStatus, seenSlot, seenCount, walkedIn, overbookedBy, history>>

Write(r) ==
  LET a == req[r].appt IN
  /\ Locking(r)
  /\ pc[r] = "write"
  /\ IF MODE = "noCAS" \/ (status[a] = seenStatus[r] /\ slot[a] = seenSlot[r])
       THEN /\ status' = [status EXCEPT ![a] = EntryStatus(req[r].cal)]
            /\ slot' = [slot EXCEPT ![a] = req[r].slot]
            /\ history' = [history EXCEPT ![a] = @ \cup {EntryStatus(req[r].cal)}]
            /\ overbookedBy' = IF seenCount[r] > 0 THEN overbookedBy \cup {r} ELSE overbookedBy
            /\ pc' = [pc EXCEPT ![r] = "done"]
       ELSE /\ pc' = [pc EXCEPT ![r] = "refused"]
            /\ UNCHANGED <<status, slot, history, overbookedBy>>
  /\ lock' = NONE
  /\ UNCHANGED <<req, seenStatus, seenSlot, seenCount, walkedIn>>

\* cancel and arrive: one compare-and-set statement, or a blind read-then-write
\* in the broken variant.
Target(r) == IF req[r].kind = "cancel" THEN "CANCELLED" ELSE "ARRIVED"

Apply(r, from) ==
  LET a == req[r].appt IN
  IF from \in Movable
    THEN /\ status' = [status EXCEPT ![a] = Target(r)]
         /\ history' = [history EXCEPT ![a] = @ \cup {Target(r)}]
         /\ walkedIn' = IF Target(r) = "ARRIVED" /\ from = "SCHEDULED"
                          THEN walkedIn \cup {a} ELSE walkedIn
         /\ pc' = [pc EXCEPT ![r] = "done"]
    ELSE /\ pc' = [pc EXCEPT ![r] = "refused"]
         /\ UNCHANGED <<status, history, walkedIn>>

Direct(r) ==
  /\ ~Locking(r)
  /\ pc[r] = "start"
  /\ IF MODE = "noCAS"
       THEN /\ seenStatus' = [seenStatus EXCEPT ![r] = status[req[r].appt]]
            /\ pc' = [pc EXCEPT ![r] = "write"]
            /\ UNCHANGED <<status, history, walkedIn>>
       ELSE /\ Apply(r, status[req[r].appt])
            /\ UNCHANGED seenStatus
  /\ UNCHANGED <<slot, req, lock, seenSlot, seenCount, overbookedBy>>

BlindWrite(r) ==
  /\ ~Locking(r)
  /\ pc[r] = "write"
  /\ Apply(r, seenStatus[r])
  /\ UNCHANGED <<slot, req, lock, seenStatus, seenSlot, seenCount, overbookedBy>>

Next == \E r \in Reqs :
  EarlyRead(r) \/ Acquire(r) \/ Read(r) \/ Decide(r) \/ Write(r) \/ Direct(r) \/ BlindWrite(r)

Spec == Init /\ [][Next]_vars /\ WF_vars(Next)

TypeOK ==
  /\ status \in [Appts -> Statuses]
  /\ slot \in [Appts -> Slots \cup {NONE}]
  /\ pc \in [Reqs -> {"start", "counted", "locked", "decide", "write", "done", "refused"}]
  /\ lock \in Reqs \cup {NONE}
  /\ walkedIn \subseteq Appts
  /\ overbookedBy \subseteq Reqs

\* Booked patients never exceed the limit in either calendar. A scheduled patient
\* who walks in and starts a visit is outside the count: the patient is already there.
WithinLimit == \A c \in Calendars, s \in Slots : Cardinality(Planned(c, s)) <= Limit

\* Only a request that asked to overbook lands in an occupied slot.
NoAccidentalOverbook == \A r \in overbookedBy : req[r].ask

\* A cancelled appointment stays cancelled.
NoResurrection == \A a \in Appts : "CANCELLED" \in history[a] => status[a] = "CANCELLED"

\* Once a visit starts, the appointment never returns to either planning status.
NoDemotion == \A a \in Appts : "ARRIVED" \in history[a] => status[a] = "ARRIVED"

\* Repeating a confirm or move that already took effect never fails.
RetryIsHarmless == \A r \in Reqs : pc[r] = "refused" => ~Satisfied(r)

Done == \A r \in Reqs : pc[r] \in {"done", "refused"}
AllFinish == <>Done
=============================================================================
