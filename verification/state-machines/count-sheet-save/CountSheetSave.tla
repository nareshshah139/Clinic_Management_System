---------------------------- MODULE CountSheetSave ----------------------------
(***************************************************************************)
(* The stock count sheet's autosave, CountSheet.tsx.                        *)
(* One counted line, one pharmacist typing, the server, and one other       *)
(* window that can save the same count. `ind` is saveState. `dirty`,        *)
(* `timer`, `flights` and `ver` are the dirty set, the debounce timer, the  *)
(* inflight promise and the version ref.                                    *)
(* MODE "code" is the sheet as fixed. "before" is the sheet before the fix, *)
(* kept as a regression control.                                            *)
(***************************************************************************)
EXTENDS Naturals, Sequences

CONSTANTS MODE, MaxEdits

Other == MaxEdits + 1            \* the value another window saves
Values == 0..Other
Ind == {"saved", "saving", "failed"}
Flight == [val: Values, ver: Nat]

VARIABLES
    screen,    \* the value shown in the counted field (an edit number)
    valid,     \* parseCount(screen) is a whole number
    edits,     \* edits typed so far, bounds the run
    dirty,     \* dirty.current has the line
    sent,      \* the current edit has been handed to a PATCH at least once
    timer,     \* the 600 ms debounce timer is armed
    ind,       \* saveState, the indicator
    flights,   \* PATCH requests in flight, oldest first
    ver,       \* version.current, the version the next PATCH carries
    mver,      \* detail.version of the mounted sheet, part of its React key
    stored,    \* the value the server holds
    sver,      \* the server's document version
    reload,    \* onStale asked CountDocument to reload the count
    otherDone, \* the other window has saved
    mounted,   \* the sheet is on screen
    dropped    \* a typed count was discarded without ever being sent

vars == <<screen, valid, edits, dirty, sent, timer, ind, flights, ver, mver,
          stored, sver, reload, otherDone, mounted, dropped>>

Fixed(guard) == MODE \in {"fixed", "code"} \/ (MODE \notin {"fixed", "code", "before", "typeProbe", guard})

\* guards fixed and code have and before lacks, each removed by the negative control of the same name
MarksEdit     == Fixed("indicatorLagsEdit")     \* change() shows Saving until the edit is saved
FlushOnLeave  == Fixed("dropTimerOnLeave")      \* the unmount cleanup flushes instead of clearing the timer
NothingToSend == Fixed("savingWithInvalid")     \* a flush with only invalid entries says Not saved
HasTimeout    == Fixed("noTimeout")             \* the PATCH is aborted after a timeout
Serialised    == MODE # "noSerialise"           \* flush waits for the request in flight (every code version has this)

TypeOK ==
    /\ screen \in Values /\ valid \in BOOLEAN /\ edits \in 0..MaxEdits
    /\ dirty \in BOOLEAN /\ sent \in BOOLEAN /\ timer \in BOOLEAN
    /\ ind \in Ind
    /\ flights \in Seq(Flight) /\ Len(flights) <= 2
    /\ ver \in Nat /\ mver \in Nat /\ stored \in Values /\ sver \in Nat
    /\ reload \in BOOLEAN /\ otherDone \in BOOLEAN /\ mounted \in BOOLEAN
    /\ dropped \in BOOLEAN

Init ==
    /\ screen = 0 /\ valid = TRUE /\ edits = 0
    /\ dirty = FALSE /\ sent = TRUE /\ timer = FALSE
    /\ ind = IF MODE = "typeProbe" THEN "lost" ELSE "saved"
    /\ flights = <<>>
    /\ ver = 1 /\ mver = 1 /\ stored = 0 /\ sver = 1
    /\ reload = FALSE /\ otherDone = FALSE /\ mounted = TRUE /\ dropped = FALSE

Drop(s, i) == [j \in 1..(Len(s) - 1) |-> IF j < i THEN s[j] ELSE s[j + 1]]

(* The pharmacist types a count, valid or not. change() marks the line dirty *)
(* and re-arms the debounce timer. Where MarksEdit, it also shows Saving.   *)
YouTypeACount ==
    /\ mounted /\ edits < MaxEdits
    /\ edits' = edits + 1 /\ screen' = edits + 1
    /\ valid' \in BOOLEAN
    /\ dirty' = TRUE /\ sent' = FALSE /\ timer' = TRUE
    /\ ind' = IF MarksEdit THEN "saving" ELSE ind
    /\ UNCHANGED <<flights, ver, mver, stored, sver, reload, otherDone, mounted, dropped>>

(* The debounce fires and flush() runs. It waits for the request in flight, *)
(* then sends the dirty lines whose counts parse.                           *)
TheSheetSaves ==
    /\ timer
    /\ Serialised => flights = <<>>
    /\ Len(flights) < 2
    /\ timer' = FALSE
    /\ IF dirty /\ valid
         THEN /\ flights' = Append(flights, [val |-> screen, ver |-> ver])
              /\ dirty' = FALSE /\ sent' = TRUE
              /\ ind' = IF mounted THEN "saving" ELSE ind
         ELSE /\ UNCHANGED <<flights, dirty, sent>>
              /\ ind' = IF NothingToSend /\ mounted /\ dirty THEN "failed" ELSE ind
    /\ UNCHANGED <<screen, valid, edits, ver, mver, stored, sver, reload, otherDone, mounted, dropped>>

(* The server answers request i. A matching version saves and increments   *)
(* the version. A stale one is refused with 409, and the sheet calls        *)
(* onStale, which reloads the count, and puts the line back in dirty.       *)
ServerAnswers(i) ==
    /\ i \in 1..Len(flights)
    /\ LET f == flights[i] IN
       IF f.ver = sver
         THEN /\ stored' = f.val /\ sver' = sver + 1 /\ ver' = sver + 1
              /\ ind' = IF mounted THEN (IF dirty THEN "saving" ELSE "saved") ELSE ind
              /\ UNCHANGED <<dirty, reload>>
         ELSE /\ UNCHANGED <<stored, sver, ver>>
              /\ dirty' = TRUE
              /\ UNCHANGED ind
              /\ reload' = (reload \/ mounted)
    /\ flights' = Drop(flights, i)
    /\ UNCHANGED <<screen, valid, edits, sent, timer, mver, otherDone, mounted, dropped>>

(* The request fails: a 5xx, a dropped connection, or, where one exists,   *)
(* the client timeout. The server may have saved it before the reply was    *)
(* lost. The line goes back in dirty and the sheet says Not saved.          *)
TheSaveFails(i) ==
    /\ i \in 1..Len(flights)
    /\ \E landed \in BOOLEAN :
         IF landed /\ flights[i].ver = sver
           THEN /\ stored' = flights[i].val /\ sver' = sver + 1
           ELSE UNCHANGED <<stored, sver>>
    /\ dirty' = TRUE
    /\ ind' = IF mounted THEN "failed" ELSE ind
    /\ flights' = Drop(flights, i)
    /\ UNCHANGED <<screen, valid, edits, sent, timer, ver, mver, reload, otherDone, mounted, dropped>>

TheSaveTimesOut(i) ==
    /\ HasTimeout
    /\ i \in 1..Len(flights)
    /\ \E landed \in BOOLEAN :
         IF landed /\ flights[i].ver = sver
           THEN /\ stored' = flights[i].val /\ sver' = sver + 1
           ELSE UNCHANGED <<stored, sver>>
    /\ dirty' = TRUE
    /\ ind' = IF mounted THEN "failed" ELSE ind
    /\ flights' = Drop(flights, i)
    /\ UNCHANGED <<screen, valid, edits, sent, timer, ver, mver, reload, otherDone, mounted, dropped>>

(* The reload asked by onStale returns. CountDocument remounts the sheet    *)
(* when the version in its key changed, showing the saved counts. A request *)
(* still out from the old sheet carries a stale version and can only 409.   *)
TheReloadArrives ==
    /\ reload /\ mounted
    /\ reload' = FALSE
    /\ IF sver # mver
         THEN /\ mver' = sver /\ ver' = sver
              /\ screen' = stored /\ valid' = TRUE
              /\ dirty' = FALSE /\ sent' = TRUE /\ timer' = FALSE
              /\ ind' = "saved" /\ flights' = <<>>
         ELSE UNCHANGED <<mver, ver, screen, valid, dirty, sent, timer, ind, flights>>
    /\ UNCHANGED <<edits, stored, sver, otherDone, mounted, dropped>>

(* Another window saves the same count first. *)
AnotherWindowSaves ==
    /\ ~otherDone
    /\ otherDone' = TRUE /\ stored' = Other /\ sver' = sver + 1
    /\ UNCHANGED <<screen, valid, edits, dirty, sent, timer, ind, flights, ver, mver, reload, mounted, dropped>>

(* The pharmacist goes back to the list. Before the fix the unmount cleanup *)
(* cleared the debounce timer, so a count typed in the last 600 ms was      *)
(* never sent. `fixed` flushes every valid dirty line. The code flushes     *)
(* only when the debounce timer is armed, so the timer stays armed.         *)
YouLeaveTheSheet ==
    /\ mounted
    /\ mounted' = FALSE
    /\ IF FlushOnLeave
         THEN /\ timer' = IF MODE = "code" THEN timer ELSE (dirty /\ valid)
              /\ UNCHANGED dropped
         ELSE /\ timer' = FALSE /\ dropped' = (dropped \/ (dirty /\ valid /\ ~sent))
    /\ UNCHANGED <<screen, valid, edits, dirty, sent, ind, flights, ver, mver, stored, sver, reload, otherDone>>

Next ==
    \/ YouTypeACount
    \/ TheSheetSaves
    \/ \E i \in 1..2 : ServerAnswers(i)
    \/ \E i \in 1..2 : TheSaveFails(i)
    \/ \E i \in 1..2 : TheSaveTimesOut(i)
    \/ TheReloadArrives
    \/ AnotherWindowSaves
    \/ YouLeaveTheSheet

ServerAnswersAny == \E i \in 1..2 : ServerAnswers(i)
TimesOutAny == \E i \in 1..2 : TheSaveTimesOut(i)

Spec == Init /\ [][Next]_vars
        /\ WF_vars(TheSheetSaves)
        /\ WF_vars(TimesOutAny)

---------------------------------------------------------------------------
(* Rules *)

\* The indicator says Saved only when nothing typed is waiting or in flight.
SavedMeansSaved == (mounted /\ ind = "saved") => (~dirty /\ flights = <<>>)

\* Leaving the sheet never throws away a count that was never sent.
NoDropOnLeave == ~dropped

\* At most one save request is out at a time.
OneSaveAtATime == Len(flights) <= 1

\* Given the server eventually answers every request and the reload,
\* the indicator leaves Saving with no user action.
LeavesSaving ==
    (WF_vars(ServerAnswersAny) /\ WF_vars(TheReloadArrives))
      => [](mounted /\ ind = "saving" => <>(~mounted \/ ind # "saving"))

\* A save request the server never answers still ends, so later counts can be sent.
SaveRequestEnds == [](flights # <<>> => <>(flights = <<>>))
=============================================================================
