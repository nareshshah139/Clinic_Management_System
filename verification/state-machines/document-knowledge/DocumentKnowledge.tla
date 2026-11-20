--------------------------- MODULE DocumentKnowledge ---------------------------
(***************************************************************************)
(* What the inventory document editor knows about a stock document,         *)
(* WorkflowDocumentEditor.tsx and workflow-document-state.ts.               *)
(* One tab, one stock-loss document, the server, and one other user.       *)
(* `k` is DocumentKnowledge.state. `envelope` is pendingRecovery and its    *)
(* sessionStorage copy. `pc` is the await the tab is parked on, which is    *)
(* also the `lock` ref: the tab is busy whenever pc is not idle or load.    *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS MODE, MaxPosts

States == {"new", "loading", "loadFailed", "known", "unconfirmed"}
Ops == {"none", "create", "save", "transition"}
Steps == {"idle", "create", "save", "post", "reread", "catchRead",
          "byRequest", "replay", "read", "fence", "load", "stuck"}
WriteSteps == {"create", "save", "post", "replay", "fence"}
Kinds == {"create", "save", "post", "resolve"}
Request == [kind: Kinds, ver: 0..20, fresh: BOOLEAN]

VARIABLES
    k,          \* DocumentKnowledge.state
    op,         \* the unconfirmed operation
    refSaved,   \* the unconfirmed reference is a saved id, not a request key
    envelope,   \* pendingRecovery is set and stored in sessionStorage
    expected,   \* pendingRecovery.documentVersion, the version the operation started from
    shown,      \* version of the document on screen (known or lastKnown)
    shownPosted,\* the document on screen is POSTED
    pc,         \* the await the tab is parked on
    carried,    \* the version the current write carries
    err,        \* the error the catch block sees: none, conflict or other
    orphans,    \* writes the tab stopped waiting for that the server may still apply
    docs,       \* documents the server holds for this draft
    sver,       \* the server's document version
    posted,     \* stock postings the server applied
    sposted,    \* the server's document is POSTED
    posts,      \* times you pressed Post stock loss, bounds the run
    reloads,    \* page reloads, bounds the run
    otherDone,  \* the other user has saved the document
    doubleSubmit \* a write was sent while an earlier write could still land

vars == <<k, op, refSaved, envelope, expected, shown, shownPosted, pc, carried, err,
          orphans, docs, sver, posted, sposted, posts, reloads, otherDone, doubleSubmit>>

Fixed(guard) == MODE = "fixed" \/ (MODE \notin {"code", "fixed", "typeProbe", guard})

HasTimeout   == Fixed("noTimeout")                 \* every request is aborted after a timeout
Fences       == MODE # "noFence"                   \* Check saved status settles with POST /resolve
CanMutateGate == MODE # "mutateWhileUnknown"       \* presentation.canMutate is false unless known
ServerCAS    == MODE # "transitionTrustsClient"    \* the transition checks the version and the DRAFT status
UnlockAlways == MODE # "unlockOnSuccessOnly"       \* the lock is released in finally, also after an error
SameKey      == MODE # "freshKeyOnReplay"          \* the replayed create reuses the request key

Busy == pc \notin {"idle", "load"}

TypeOK ==
    /\ k \in States /\ op \in Ops /\ refSaved \in BOOLEAN /\ envelope \in BOOLEAN
    /\ expected \in 0..20 /\ shown \in 0..20 /\ shownPosted \in BOOLEAN
    /\ pc \in Steps /\ carried \in 0..20 /\ err \in {"none", "conflict", "other"}
    /\ orphans \subseteq Request
    /\ docs \in 0..2 /\ sver \in 0..20 /\ posted \in 0..2 /\ sposted \in BOOLEAN
    /\ posts \in 0..MaxPosts /\ reloads \in 0..1 /\ otherDone \in BOOLEAN
    /\ doubleSubmit \in BOOLEAN

CanLand(o) ==
    \/ o.kind = "create" /\ (docs = 0 \/ o.fresh)
    \/ o.kind \in {"save", "post"} /\ o.ver = sver /\ ~sposted /\ docs > 0
    \/ o.kind = "post" /\ ~ServerCAS /\ docs > 0

CurrentWrite == [kind |-> CASE pc = "create" -> "create" [] pc = "replay" -> "create"
                              [] pc = "save" -> "save" [] pc = "post" -> "post"
                              [] OTHER -> "resolve",
                 ver |-> carried, fresh |-> pc = "replay" /\ ~SameKey]

AnyCanLand == (\E o \in orphans : CanLand(o)) \/ (pc \in WriteSteps /\ CanLand(CurrentWrite))

Init ==
    /\ \/ k = "new" /\ docs = 0 /\ sver = 0 /\ shown = 0
       \/ k = "known" /\ docs = 1 /\ sver = 1 /\ shown = 1
    /\ op = "none" /\ refSaved = FALSE /\ envelope = FALSE /\ expected = 0
    /\ shownPosted = FALSE /\ pc = "idle" /\ carried = 0 /\ err = "none"
    /\ orphans = {}
    /\ posted = IF MODE = "typeProbe" THEN 9 ELSE 0
    /\ sposted = FALSE /\ posts = 0 /\ reloads = 0
    /\ otherDone = FALSE /\ doubleSubmit = FALSE

\* apply(saved): the server's document becomes what the screen knows
Apply ==
    /\ k' = "known" /\ op' = "none" /\ envelope' = FALSE /\ refSaved' = TRUE
    /\ shown' = sver' /\ shownPosted' = sposted'
    /\ pc' = "idle" /\ err' = "none"

ServerKeeps == UNCHANGED <<docs, sver, posted, sposted>>

---------------------------------------------------------------------------
(* You press Save draft on a new document. markPending('create') stores    *)
(* the envelope before the POST.                                            *)
YouSaveTheNewDraft ==
    /\ k = "new" /\ pc = "idle"
    /\ k' = "unconfirmed" /\ op' = "create" /\ refSaved' = FALSE /\ envelope' = TRUE
    /\ pc' = "create" /\ carried' = 0
    /\ doubleSubmit' = (doubleSubmit \/ AnyCanLand)
    /\ UNCHANGED <<expected, shown, shownPosted, err, orphans, docs, sver, posted, sposted, posts, reloads, otherDone>>

(* You press Post stock loss. The draft is saved first, markPending('save') *)
(* then PATCH, and the transition follows.                                  *)
YouPostStock ==
    /\ pc = "idle" /\ posts < MaxPosts /\ ~shownPosted /\ docs > 0
    /\ IF CanMutateGate THEN k = "known" ELSE k \in {"known", "unconfirmed"}
    /\ posts' = posts + 1
    /\ k' = "unconfirmed" /\ op' = "save" /\ refSaved' = TRUE /\ envelope' = TRUE
    /\ expected' = shown /\ carried' = shown /\ pc' = "save"
    /\ doubleSubmit' = (doubleSubmit \/ AnyCanLand)
    /\ UNCHANGED <<shown, shownPosted, err, orphans, docs, sver, posted, sposted, reloads, otherDone>>

(* You press Check saved status. A request reference is looked up by key;   *)
(* a saved reference is read back.                                          *)
YouCheckSavedStatus ==
    /\ k = "unconfirmed" /\ pc = "idle"
    /\ pc' = IF refSaved THEN "read" ELSE "byRequest"
    /\ err' = "none"
    /\ UNCHANGED <<k, op, refSaved, envelope, expected, shown, shownPosted, carried, orphans,
                   docs, sver, posted, sposted, posts, reloads, otherDone, doubleSubmit>>

(* You reload the tab. A write still out keeps going at the server. The     *)
(* new page reads the envelope back from sessionStorage.                    *)
YouReloadThePage ==
    /\ reloads < 1
    /\ reloads' = reloads + 1
    /\ orphans' = IF pc \in WriteSteps THEN orphans \union {CurrentWrite} ELSE orphans
    /\ err' = "none"
    /\ IF envelope /\ ~refSaved
         THEN /\ k' = "unconfirmed" /\ op' = "create" /\ pc' = "idle"
         ELSE IF envelope \/ k \in {"known", "loading", "loadFailed"} \/ (k = "unconfirmed" /\ refSaved)
           THEN /\ k' = "loading" /\ pc' = "load" /\ op' = op
           ELSE /\ k' = "new" /\ pc' = "idle" /\ op' = "none"
    /\ UNCHANGED <<refSaved, envelope, expected, shown, shownPosted, carried, docs, sver, posted,
                   sposted, posts, otherDone, doubleSubmit>>

(* The server handles the request the tab is waiting for and its reply      *)
(* arrives. Writes compare versions; a stale one gets 409.                  *)
CreateLands(fresh) ==
    /\ docs' = IF docs = 0 \/ fresh THEN docs + 1 ELSE docs
    /\ sver' = IF docs = 0 THEN 1 ELSE sver
    /\ UNCHANGED <<posted, sposted>>

TheServerAnswers ==
    /\ pc \notin {"idle", "stuck"}
    /\ CASE pc = "create" ->
              /\ CreateLands(FALSE) /\ Apply
              /\ UNCHANGED <<expected, carried, orphans, posts, reloads, otherDone, doubleSubmit>>
         [] pc = "save" ->
              IF carried = sver /\ ~sposted
                THEN /\ sver' = sver + 1 /\ UNCHANGED <<docs, posted, sposted>>
                     /\ k' = "unconfirmed" /\ op' = "transition" /\ envelope' = TRUE /\ refSaved' = TRUE
                     /\ shown' = sver + 1 /\ expected' = sver + 1 /\ carried' = sver + 1
                     /\ pc' = "post" /\ UNCHANGED <<shownPosted, err>>
                     /\ UNCHANGED <<orphans, posts, reloads, otherDone, doubleSubmit>>
                ELSE /\ ServerKeeps /\ pc' = "catchRead" /\ err' = "conflict"
                     /\ UNCHANGED <<k, op, refSaved, envelope, expected, shown, shownPosted, carried, orphans, posts, reloads, otherDone, doubleSubmit>>
         [] pc = "post" ->
              IF (~sposted /\ carried = sver) \/ ~ServerCAS
                THEN /\ sposted' = TRUE /\ posted' = posted + 1 /\ sver' = sver + 1 /\ UNCHANGED docs
                     /\ pc' = "reread"
                     /\ UNCHANGED <<k, op, refSaved, envelope, expected, shown, shownPosted, carried, err, orphans, posts, reloads, otherDone, doubleSubmit>>
                ELSE /\ ServerKeeps /\ pc' = "catchRead" /\ err' = "conflict"
                     /\ UNCHANGED <<k, op, refSaved, envelope, expected, shown, shownPosted, carried, orphans, posts, reloads, otherDone, doubleSubmit>>
         [] pc = "reread" ->
              /\ ServerKeeps
              /\ IF sver > carried
                   THEN Apply /\ UNCHANGED <<expected, carried, orphans, posts, reloads, otherDone, doubleSubmit>>
                   ELSE /\ pc' = "catchRead" /\ err' = "other"
                        /\ UNCHANGED <<k, op, refSaved, envelope, expected, shown, shownPosted, carried, orphans, posts, reloads, otherDone, doubleSubmit>>
         [] pc = "catchRead" ->
              /\ ServerKeeps
              /\ IF err = "conflict" \/ sver > expected
                   THEN Apply /\ UNCHANGED <<expected, carried, orphans, posts, reloads, otherDone, doubleSubmit>>
                   ELSE /\ k' = "unconfirmed" /\ op' = "transition" /\ pc' = "idle" /\ err' = "none"
                        /\ UNCHANGED <<refSaved, envelope, expected, shown, shownPosted, carried, orphans, posts, reloads, otherDone, doubleSubmit>>
         [] pc = "byRequest" ->
              /\ ServerKeeps
              /\ IF docs > 0
                   THEN /\ refSaved' = TRUE /\ envelope' = TRUE /\ pc' = "read"
                   ELSE /\ pc' = "replay" /\ UNCHANGED <<refSaved, envelope>>
              /\ UNCHANGED <<k, op, expected, shown, shownPosted, carried, err, orphans, posts, reloads, otherDone, doubleSubmit>>
         [] pc = "replay" ->
              /\ CreateLands(~SameKey)
              /\ refSaved' = TRUE /\ envelope' = TRUE /\ pc' = "read"
              /\ doubleSubmit' = doubleSubmit
              /\ UNCHANGED <<k, op, expected, shown, shownPosted, carried, err, orphans, posts, reloads, otherDone>>
         [] pc = "read" ->
              /\ ServerKeeps
              /\ IF op # "create" /\ ~(sver > expected) /\ Fences
                   THEN /\ pc' = "fence" /\ carried' = expected
                        /\ UNCHANGED <<k, op, refSaved, envelope, expected, shown, shownPosted, err, orphans, posts, reloads, otherDone, doubleSubmit>>
                   ELSE Apply /\ UNCHANGED <<expected, carried, orphans, posts, reloads, otherDone, doubleSubmit>>
         [] pc = "fence" ->
              IF sver < carried
                THEN /\ ServerKeeps /\ pc' = "idle" /\ err' = "other"
                     /\ UNCHANGED <<k, op, refSaved, envelope, expected, shown, shownPosted, carried, orphans, posts, reloads, otherDone, doubleSubmit>>
                ELSE /\ sver' = IF sver = carried THEN sver + 1 ELSE sver
                     /\ UNCHANGED <<docs, posted, sposted>>
                     /\ Apply /\ UNCHANGED <<expected, carried, orphans, posts, reloads, otherDone, doubleSubmit>>
         [] pc = "load" ->
              /\ ServerKeeps
              /\ IF envelope /\ ~(sver > expected)
                   THEN /\ k' = "unconfirmed" /\ pc' = "idle" /\ shown' = sver /\ shownPosted' = sposted
                        /\ op' = IF op = "none" THEN "save" ELSE op
                        /\ UNCHANGED <<refSaved, envelope, err>>
                   ELSE Apply
              /\ UNCHANGED <<expected, carried, orphans, posts, reloads, otherDone, doubleSubmit>>

(* The request the tab is waiting for fails: a dropped connection or a 5xx. *)
(* A write may still reach the server later.                                *)
Fail ==
    /\ pc \notin {"idle", "stuck"}
    /\ orphans' = IF pc \in WriteSteps THEN orphans \union {CurrentWrite} ELSE orphans
    /\ CASE pc \in {"save", "post", "reread"} ->
              /\ pc' = "catchRead" /\ err' = "other"
              /\ UNCHANGED <<k, op>>
         [] pc = "catchRead" ->
              /\ k' = "unconfirmed" /\ op' = "transition" /\ pc' = "idle" /\ err' = "none"
         [] pc = "load" ->
              /\ k' = IF envelope THEN "unconfirmed" ELSE "loadFailed"
              /\ op' = IF envelope /\ op = "none" THEN "save" ELSE op
              /\ pc' = "idle" /\ err' = "none"
         [] OTHER ->
              /\ pc' = IF UnlockAlways THEN "idle" ELSE "stuck"
              /\ err' = "other" /\ UNCHANGED <<k, op>>
    /\ UNCHANGED <<refSaved, envelope, expected, shown, shownPosted, carried, docs, sver, posted,
                   sposted, posts, reloads, otherDone, doubleSubmit>>

TheRequestFails == Fail

TheRequestTimesOut == HasTimeout /\ Fail

(* A write the tab stopped waiting for reaches the server. *)
AnOldRequestLands ==
    \E o \in orphans :
       /\ orphans' = orphans \ {o}
       /\ CASE o.kind = "create" -> CreateLands(o.fresh)
            [] o.kind = "save" ->
                 /\ sver' = IF o.ver = sver /\ ~sposted THEN sver + 1 ELSE sver
                 /\ UNCHANGED <<docs, posted, sposted>>
            [] o.kind = "post" ->
                 IF (~sposted /\ o.ver = sver) \/ ~ServerCAS
                   THEN /\ sposted' = TRUE /\ posted' = posted + 1 /\ sver' = sver + 1 /\ UNCHANGED docs
                   ELSE ServerKeeps
            [] o.kind = "resolve" ->
                 /\ sver' = IF o.ver = sver THEN sver + 1 ELSE sver
                 /\ UNCHANGED <<docs, posted, sposted>>
       /\ UNCHANGED <<k, op, refSaved, envelope, expected, shown, shownPosted, pc, carried, err,
                      posts, reloads, otherDone, doubleSubmit>>

(* Another user saves the same draft. *)
AnotherUserSaves ==
    /\ ~otherDone /\ docs > 0 /\ ~sposted
    /\ otherDone' = TRUE /\ sver' = sver + 1
    /\ UNCHANGED <<k, op, refSaved, envelope, expected, shown, shownPosted, pc, carried, err,
                   orphans, docs, posted, sposted, posts, reloads, doubleSubmit>>

Next ==
    \/ YouSaveTheNewDraft
    \/ YouPostStock
    \/ YouCheckSavedStatus
    \/ YouReloadThePage
    \/ TheServerAnswers
    \/ TheRequestFails
    \/ TheRequestTimesOut
    \/ AnOldRequestLands
    \/ AnotherUserSaves

Spec == Init /\ [][Next]_vars /\ WF_vars(TheRequestTimesOut)

---------------------------------------------------------------------------
(* Rules *)

\* Stock is posted at most once.
PostedOnce == posted <= 1

\* One draft becomes at most one saved document.
OneDocument == docs <= 1

\* When the screen shows a confirmed outcome, no earlier write can still change it.
KnownMeansSettled == k = "known" => ~AnyCanLand

\* No new write is sent while an earlier write could still land.
NoSubmitWhileUnknown == ~doubleSubmit

\* Given the server answers, the editor stops being busy with no user action.
BusyEndsIfAnswered == WF_vars(TheServerAnswers) => [](Busy => <>~Busy)

\* Even if the server never answers, the editor stops being busy, so Check saved status works.
BusyEnds == [](Busy => <>~Busy)
=============================================================================
