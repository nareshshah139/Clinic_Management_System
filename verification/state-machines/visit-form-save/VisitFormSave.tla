---------------------------- MODULE VisitFormSave ----------------------------
(***************************************************************************)
(* How the visit form saves, MedicalVisitForm.tsx with PrescriptionBuilder. *)
(* One doctor, the autosave timer, the server, and one other person who can *)
(* change the same visit. Three writers share one visit row: autosave       *)
(* (runAutoSave), Save Draft (save), and Create Prescription (ensureVisitId *)
(* then POST /prescriptions with the form's clinical patch).                *)
(* `ind` is saveStatus. `dirty` is hasUnsavedChangesRef. `blocked` is       *)
(* automaticSaveBlocked, which blockAutomaticSave sets together with        *)
(* saveConflict. `cver` is visitVersionRef. `man` is manualSaveInFlight.    *)
(* Each write lands at the server and its reply reaches the form later.     *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS MODE, MaxEdits, MaxSaves

Ind == {"idle", "unsaved", "autosaving", "saved", "saving", "error"}
ManPhases == {"none", "wait", "create", "patch"}
RxPhases == {"none", "wait", "ensure", "post", "done"}
Results == {"out", "ok", "conflict"}
Versions == 0..12
Write == [kind: {"none", "create", "patch"}, ver: Versions, ed: 0..MaxEdits, res: Results, nv: Versions]
NoWrite == [kind |-> "none", ver |-> 0, ed |-> 0, res |-> "out", nv |-> 0]

VARIABLES
    ed,          \* the edit on screen (edits are numbered)
    dirty,       \* hasUnsavedChangesRef
    ind,         \* saveStatus, the indicator
    timer,       \* autoSaveTimerRef is armed
    vid,         \* the form knows its visit id
    cver,        \* visitVersionRef, the version the next write carries
    auto,        \* the autosave PATCH (autoSavePromiseRef)
    man,         \* Save Draft phase (manualSaveInFlight)
    mw,          \* the Save Draft request
    rx,          \* Create Prescription phase
    rw,          \* the prescription request (visit create, then prescription POST)
    blocked,     \* automaticSaveBlocked and saveConflict
    visits,      \* visit rows the server holds for this consultation
    sver,        \* the server's visit version
    sed,         \* the doctor's edit the server holds
    otherEdited, \* someone else has changed the visit
    saves        \* Save Draft presses, bounds the run

vars == <<ed, dirty, ind, timer, vid, cver, auto, man, mw, rx, rw, blocked,
          visits, sver, sed, otherEdited, saves>>

\* "before" is the code before the fix, kept as a regression control. "code" takes
\* the fixed branches: the prescription save runs under the Save Draft lock.
Fixed(guard) == MODE \in {"fixed", "code"} \/ (MODE \notin {"before", "typeProbe", guard})

RxWaitsForSave  == Fixed("rxCreatesAlone")        \* the prescription save holds the Save Draft lock
RxWaitsForAuto  == Fixed("rxSavesAlone")          \* the prescription save waits for autosave, which skips while it runs
ComparesPayload == MODE # "saveIgnoresNewerEdits" \* a success compares the sent payload with the latest
HasTimeout      == MODE # "noRequestTimeout"      \* visit and prescription writes time out after 30 s

TypeOK ==
    /\ ed \in 0..MaxEdits /\ dirty \in BOOLEAN /\ ind \in Ind /\ timer \in BOOLEAN
    /\ vid \in BOOLEAN /\ cver \in Versions
    /\ auto \in Write /\ man \in ManPhases /\ mw \in Write /\ rx \in RxPhases /\ rw \in Write
    /\ blocked \in BOOLEAN /\ visits \in 0..2 /\ sver \in Versions /\ sed \in 0..MaxEdits
    /\ otherEdited \in BOOLEAN /\ saves \in 0..MaxSaves

Init ==
    /\ \/ vid = TRUE /\ visits = 1 /\ sver = 1 /\ cver = 1
       \/ vid = FALSE /\ visits = 0 /\ sver = 0 /\ cver = 0
    /\ ed = 0 /\ dirty = FALSE /\ timer = FALSE
    /\ ind = IF MODE = "typeProbe" THEN "lost" ELSE "idle"
    /\ auto = NoWrite /\ man = "none" /\ mw = NoWrite /\ rx = "none" /\ rw = NoWrite
    /\ blocked = FALSE /\ sed = 0 /\ otherEdited = FALSE /\ saves = 0

Max(a, b) == IF a > b THEN a ELSE b
Ack(v) == IF blocked THEN cver ELSE Max(cver, v)   \* acknowledgeMutationVersion

AutoOn == auto.kind # "none"
RxBusy == rx \in {"wait", "ensure", "post"}

---------------------------------------------------------------------------
(* The doctor changes a field. The edit effect marks unsaved, or Save       *)
(* failed while a conflict is latched, and schedules autosave.              *)
YouEditTheVisit ==
    /\ ed < MaxEdits
    /\ ed' = ed + 1 /\ dirty' = TRUE
    /\ ind' = IF blocked THEN "error" ELSE "unsaved"
    /\ timer' = ~blocked
    /\ UNCHANGED <<vid, cver, auto, man, mw, rx, rw, blocked, visits, sver, sed, otherEdited, saves>>

(* The autosave timer fires and runAutoSave sends a PATCH, unless there is  *)
(* no visit id, nothing unsaved, a Save Draft running, a latched conflict,  *)
(* or an autosave already out.                                              *)
AutosaveRuns ==
    /\ timer
    /\ timer' = FALSE
    /\ IF vid /\ dirty /\ man = "none" /\ ~blocked /\ ~AutoOn /\ ~(RxWaitsForAuto /\ RxBusy)
         THEN /\ auto' = [kind |-> "patch", ver |-> cver, ed |-> ed, res |-> "out", nv |-> 0]
              /\ ind' = IF ind = "saving" THEN "saving" ELSE "autosaving"
         ELSE UNCHANGED <<auto, ind>>
    /\ UNCHANGED <<ed, dirty, vid, cver, man, mw, rx, rw, blocked, visits, sver, sed, otherEdited, saves>>

(* Save Draft. save() takes the manual lock and clears the timer, then      *)
(* awaits any autosave in flight.                                           *)
YouSaveDraft ==
    /\ man = "none" /\ saves < MaxSaves
    /\ RxWaitsForSave => ~RxBusy
    /\ man' = "wait" /\ timer' = FALSE /\ saves' = saves + 1
    /\ UNCHANGED <<ed, dirty, ind, vid, cver, auto, mw, rx, rw, blocked, visits, sver, sed, otherEdited>>

(* save() resumes once no autosave is out. getClinicalSavePatch throws 409  *)
(* while a conflict is latched; otherwise it creates or patches the visit.  *)
SaveDraftSends ==
    /\ man = "wait" /\ ~AutoOn
    /\ IF blocked
         THEN /\ man' = "none" /\ ind' = "error" /\ UNCHANGED mw
         ELSE /\ man' = IF vid THEN "patch" ELSE "create"
              /\ ind' = "saving"
              /\ mw' = [kind |-> IF vid THEN "patch" ELSE "create", ver |-> cver, ed |-> ed, res |-> "out", nv |-> 0]
    /\ UNCHANGED <<ed, dirty, timer, vid, cver, auto, rx, rw, blocked, visits, sver, sed, otherEdited, saves>>

(* Create Prescription. In "before", PrescriptionBuilder.create holds only  *)
(* its own lock. In "code", holdVisitSave refuses it while Save Draft runs, *)
(* takes the Save Draft lock and clears the autosave timer, as save() does. *)
YouCreatePrescription ==
    /\ rx = "none"
    /\ RxWaitsForSave => man = "none"
    /\ rx' = "wait"
    /\ timer' = (timer /\ MODE # "code")
    /\ UNCHANGED <<ed, dirty, ind, vid, cver, auto, man, mw, rw, blocked, visits, sver, sed, otherEdited, saves>>

(* The prescription save sends. Without a visit id, ensureVisitId creates   *)
(* the visit with no idempotency key. In "before" it does not look at Save  *)
(* Draft or autosave. In "code" it first awaits the autosave in flight.     *)
(* getClinicalSavePatch throws 409 while a conflict is latched.             *)
PrescriptionSends ==
    /\ rx = "wait"
    /\ RxWaitsForAuto => ~AutoOn
    /\ IF blocked
         THEN rx' = "done" /\ UNCHANGED rw
         ELSE /\ rx' = IF vid THEN "post" ELSE "ensure"
              /\ rw' = [kind |-> IF vid THEN "patch" ELSE "create", ver |-> cver, ed |-> ed, res |-> "out", nv |-> 0]
    /\ UNCHANGED <<ed, dirty, ind, timer, vid, cver, auto, man, mw, blocked, visits, sver, sed, otherEdited, saves>>

---------------------------------------------------------------------------
(* A write reaches the server. A create adds a visit row (a walk-in has no  *)
(* appointment to make a duplicate fail). A patch carries the version the   *)
(* form read and VisitsService.update refuses a stale one with 409.         *)
Land(w) ==
    IF w.kind = "create"
      THEN /\ visits' = visits + 1
           /\ sver' = IF visits = 0 THEN 1 ELSE sver
           /\ sed' = IF visits = 0 THEN w.ed ELSE sed
    ELSE IF w.ver = sver
      THEN /\ sver' = sver + 1 /\ sed' = w.ed /\ UNCHANGED visits
      ELSE UNCHANGED <<visits, sver, sed>>

Landed(w) ==
    [w EXCEPT !.res = IF w.kind = "create" \/ w.ver = sver THEN "ok" ELSE "conflict",
              !.nv = IF w.kind = "create" THEN 1 ELSE sver + 1]

TheServerHandlesAutosave ==
    /\ AutoOn /\ auto.res = "out"
    /\ Land(auto) /\ auto' = Landed(auto)
    /\ UNCHANGED <<ed, dirty, ind, timer, vid, cver, man, mw, rx, rw, blocked, otherEdited, saves>>

TheServerHandlesSaveDraft ==
    /\ man \in {"create", "patch"} /\ mw.res = "out"
    /\ Land(mw) /\ mw' = Landed(mw)
    /\ UNCHANGED <<ed, dirty, ind, timer, vid, cver, auto, man, rx, rw, blocked, otherEdited, saves>>

TheServerHandlesPrescription ==
    /\ rx \in {"ensure", "post"} /\ rw.res = "out"
    /\ Land(rw) /\ rw' = Landed(rw)
    /\ UNCHANGED <<ed, dirty, ind, timer, vid, cver, auto, man, mw, rx, blocked, otherEdited, saves>>

(* Replies. A success acknowledges the version unless a conflict is         *)
(* latched, and compares the payload it sent with the latest one. A 409     *)
(* calls blockAutomaticSave.                                                *)
AutosaveReplies ==
    /\ AutoOn /\ auto.res # "out"
    /\ auto' = NoWrite
    /\ IF auto.res = "ok"
         THEN LET newer == ComparesPayload /\ ed # auto.ed IN
              /\ cver' = Ack(auto.nv) /\ dirty' = newer
              /\ ind' = IF newer THEN "unsaved" ELSE "saved"
              /\ timer' = (timer \/ (newer /\ man = "none"))
              /\ UNCHANGED blocked
         ELSE /\ blocked' = TRUE /\ dirty' = TRUE /\ ind' = "error" /\ timer' = FALSE
              /\ UNCHANGED cver
    /\ UNCHANGED <<ed, vid, man, mw, rx, rw, visits, sver, sed, otherEdited, saves>>

SaveDraftReplies ==
    /\ man \in {"create", "patch"} /\ mw.res # "out"
    /\ man' = "none" /\ mw' = NoWrite
    /\ IF mw.res = "ok"
         THEN LET newer == ComparesPayload /\ ed # mw.ed IN
              /\ vid' = TRUE /\ cver' = Ack(mw.nv) /\ dirty' = newer
              /\ ind' = IF newer THEN "unsaved" ELSE "saved"
              /\ timer' = (newer /\ ~blocked)
              /\ UNCHANGED blocked
         ELSE /\ blocked' = TRUE /\ ind' = "error" /\ timer' = FALSE
              /\ UNCHANGED <<vid, cver, dirty>>
    /\ UNCHANGED <<ed, auto, rx, rw, visits, sver, sed, otherEdited, saves>>

PrescriptionReplies ==
    /\ rx \in {"ensure", "post"} /\ rw.res # "out"
    /\ IF rx = "ensure"
         THEN /\ vid' = TRUE /\ cver' = Ack(1) /\ UNCHANGED <<blocked, ind, timer>>
              /\ IF blocked
                   THEN rx' = "done" /\ rw' = NoWrite
                   ELSE /\ rx' = "post"
                        /\ rw' = [kind |-> "patch", ver |-> Max(cver, 1), ed |-> ed, res |-> "out", nv |-> 0]
         ELSE IF rw.res = "ok"
           THEN /\ cver' = Ack(rw.nv) /\ rx' = "done" /\ rw' = NoWrite
                /\ UNCHANGED <<vid, blocked, ind>>
                /\ timer' = IF RxWaitsForAuto /\ dirty /\ ~blocked THEN TRUE ELSE timer
           ELSE /\ blocked' = TRUE /\ ind' = "error" /\ timer' = FALSE
                /\ rx' = "done" /\ rw' = NoWrite /\ UNCHANGED <<vid, cver>>
    /\ UNCHANGED <<ed, dirty, auto, man, mw, visits, sver, sed, otherEdited, saves>>

(* A write fails before the server applies it: a 5xx, a dropped            *)
(* connection, or the 30 second timeout. Autosave retries on its timer;     *)
(* Save Draft reschedules autosave. A reply lost after the server applied   *)
(* a write is the idempotency model's subject, not this one.                *)
AutosaveFailed ==
    /\ AutoOn /\ auto.res = "out"
    /\ auto' = NoWrite /\ dirty' = TRUE /\ ind' = "error" /\ timer' = TRUE
    /\ UNCHANGED <<ed, vid, cver, man, mw, rx, rw, blocked, visits, sver, sed, otherEdited, saves>>

SaveDraftFailed ==
    /\ man \in {"create", "patch"} /\ mw.res = "out"
    /\ man' = "none" /\ mw' = NoWrite /\ ind' = "error" /\ timer' = (timer \/ (dirty /\ ~blocked))
    /\ UNCHANGED <<ed, dirty, vid, cver, auto, rx, rw, blocked, visits, sver, sed, otherEdited, saves>>

PrescriptionFailed ==
    /\ rx \in {"ensure", "post"} /\ rw.res = "out"
    /\ rx' = "done" /\ rw' = NoWrite
    /\ timer' = IF RxWaitsForAuto /\ dirty /\ ~blocked THEN TRUE ELSE timer
    /\ UNCHANGED <<ed, dirty, ind, vid, cver, auto, man, mw, blocked, visits, sver, sed, otherEdited, saves>>

ARequestFails == AutosaveFailed \/ SaveDraftFailed \/ PrescriptionFailed

ARequestTimesOut == HasTimeout /\ ARequestFails

\* Once a write is applied, its reply reaches the form within the timeout.
RepliesInTime == HasTimeout /\ (AutosaveReplies \/ SaveDraftReplies \/ PrescriptionReplies)

(* Someone else saves the same visit, for example from another tab. *)
SomeoneElseChangesTheVisit ==
    /\ ~otherEdited /\ visits > 0
    /\ otherEdited' = TRUE /\ sver' = sver + 1
    /\ UNCHANGED <<ed, dirty, ind, timer, vid, cver, auto, man, mw, rx, rw, blocked, visits, sed, saves>>

(* Discard draft and reload the saved visit: the editor remounts on the     *)
(* server copy. Offered while a conflict is latched.                        *)
YouDiscardTheDraft ==
    /\ blocked /\ vid /\ ~AutoOn /\ man = "none" /\ ~RxBusy
    /\ blocked' = FALSE /\ cver' = sver /\ ed' = sed /\ dirty' = FALSE
    /\ ind' = "idle" /\ timer' = FALSE
    /\ UNCHANGED <<vid, auto, man, mw, rx, rw, visits, sver, sed, otherEdited, saves>>

Next ==
    \/ YouEditTheVisit
    \/ AutosaveRuns
    \/ YouSaveDraft
    \/ SaveDraftSends
    \/ YouCreatePrescription
    \/ PrescriptionSends
    \/ TheServerHandlesAutosave
    \/ TheServerHandlesSaveDraft
    \/ TheServerHandlesPrescription
    \/ AutosaveReplies
    \/ SaveDraftReplies
    \/ PrescriptionReplies
    \/ ARequestFails
    \/ ARequestTimesOut
    \/ SomeoneElseChangesTheVisit
    \/ YouDiscardTheDraft

Spec == Init /\ [][Next]_vars
        /\ WF_vars(AutosaveRuns)
        /\ WF_vars(SaveDraftSends)
        /\ WF_vars(PrescriptionSends)
        /\ WF_vars(ARequestTimesOut)
        /\ WF_vars(RepliesInTime)

---------------------------------------------------------------------------
(* Rules *)

\* One consultation creates at most one visit.
OneVisit == visits <= 1

\* The form shows a conflict only when someone else changed the visit.
NoSelfConflict == blocked => otherEdited

\* While a conflict is latched, the indicator says Save failed.
LatchAgrees == blocked => ind = "error"

\* The indicator says Saved only when the server holds the edit on screen.
\* `sed` follows the first visit row, so the rule reads only while there is one.
SavedMeansSaved == (visits <= 1 /\ ind = "saved") => (~dirty /\ sed = ed)

\* The indicator leaves Saving and Auto-saving with no user action, even if
\* the server never answers.
LeavesSaving == [](ind \in {"saving", "autosaving"} => <>(ind \notin {"saving", "autosaving"}))
=============================================================================
