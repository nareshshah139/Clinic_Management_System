------------------------------ MODULE Idempotency ------------------------------
(* One doctor saves prescriptions from the prescription pad. Each save is a
   POST /prescriptions/pad carrying an Idempotency-Key. The browser aborts an
   attempt after 30 seconds and retries it with the same key. The server's
   IdempotencyInterceptor looks the key up, runs the handler on a miss, and
   stores the response after the handler answers.

   An issue is one prescription the doctor means to write. A request is one
   HTTP attempt. The server keeps running an attempt the browser aborted.

   MODE "code" is the code today. "fixed" claims the key before the handler
   runs and keys each draft instead of each payload. The other modes are
   fixed with one guard removed. *)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Issues, Attempts, MaxReqs, MODE

ASSUME MODE \in {"code", "fixed", "failOpenClaim", "payloadKey", "storeErrors",
                 "noTimeout", "typeProbe"}

Reqs == 1..MaxReqs
Ids == 1..MaxReqs
IssueIds == 1..Issues
Keys == 1..Issues

\* createQuickPrescription hashes the payload into the key, so every save of
\* the same prescription shares one key. The fix keys each draft.
KeyOf(o) == IF MODE \in {"code", "payloadKey"} THEN 1 ELSE o

Claims == MODE # "code"
HasTimeout == MODE # "noTimeout"

VARIABLES issue, client, attempt, cur, sent, reqIssue, srv, ans, store, saving, made, got

vars == <<issue, client, attempt, cur, sent, reqIssue, srv, ans, store, saving, made, got>>

ClientPhases == {"idle", "waiting", "done", "gaveUp"}
ServerPhases == {"idle", "arrived", "claiming", "running", "ready"}
Answers == [kind : {"none", "ok", "err", "busy"}, id : 0..MaxReqs]
Entries == [st : {"empty", "pending", "ok", "err"}, id : 0..MaxReqs]
Results == [kind : {"none", "unknown", "error", "ok"}, id : 0..MaxReqs]

TypeOK ==
  /\ issue \in 0..Issues
  /\ client \in ClientPhases
  /\ attempt \in 0..Attempts
  /\ cur \in 0..MaxReqs
  /\ sent \in 0..MaxReqs
  /\ reqIssue \in [Reqs -> 0..Issues]
  /\ srv \in [Reqs -> ServerPhases]
  /\ ans \in [Reqs -> Answers]
  /\ store \in [Keys -> Entries]
  /\ saving \subseteq Reqs
  /\ made \in Seq(IssueIds) /\ Len(made) <= MaxReqs
  /\ got \in [IssueIds -> Results]

Init ==
  /\ issue = 0
  /\ client = IF MODE = "typeProbe" THEN "lost" ELSE "idle"
  /\ attempt = 0
  /\ cur = 0
  /\ sent = 0
  /\ reqIssue = [r \in Reqs |-> 0]
  /\ srv = [r \in Reqs |-> "idle"]
  /\ ans = [r \in Reqs |-> [kind |-> "none", id |-> 0]]
  /\ store = [k \in Keys |-> [st |-> "empty", id |-> 0]]
  /\ saving = {}
  /\ made = <<>>
  /\ got = [o \in IssueIds |-> [kind |-> "none", id |-> 0]]

KeyOfReq(r) == KeyOf(reqIssue[r])

\* The browser sends one attempt for issue o with the next free request slot.
Send(o) ==
  /\ sent < MaxReqs
  /\ sent' = sent + 1
  /\ cur' = sent + 1
  /\ reqIssue' = [reqIssue EXCEPT ![sent + 1] = o]
  /\ srv' = [srv EXCEPT ![sent + 1] = "arrived"]

\* After a timeout or a transient answer the browser retries with the same
\* key, or gives up and shows res.
RetryOrGiveUp(res) ==
  IF attempt < Attempts /\ sent < MaxReqs
  THEN /\ Send(issue)
       /\ attempt' = attempt + 1
       /\ UNCHANGED <<client, got>>
  ELSE /\ client' = "gaveUp"
       /\ got' = [got EXCEPT ![issue] = [kind |-> res, id |-> 0]]
       /\ UNCHANGED <<attempt, cur, sent, reqIssue, srv>>

\* PrescriptionBuilder saves a new prescription.
DoctorSavesNew ==
  /\ client \in {"idle", "done", "gaveUp"}
  /\ issue < Issues
  /\ issue' = issue + 1
  /\ client' = "waiting"
  /\ attempt' = 1
  /\ Send(issue + 1)
  /\ UNCHANGED <<ans, store, saving, made, got>>

\* After a failed or timed out save the draft is still there and the doctor
\* presses save again.
DoctorSavesAgain ==
  /\ client = "gaveUp"
  /\ client' = "waiting"
  /\ attempt' = 1
  /\ got' = [got EXCEPT ![issue] = [kind |-> "none", id |-> 0]]
  /\ Send(issue)
  /\ UNCHANGED <<issue, ans, store, saving, made>>

\* api.ts aborts the fetch after 30 seconds.
BrowserTimesOut ==
  /\ HasTimeout
  /\ client = "waiting"
  /\ RetryOrGiveUp("unknown")
  /\ UNCHANGED <<issue, ans, store, saving, made>>

BrowserGetsAnswer ==
  /\ client = "waiting"
  /\ srv[cur] = "ready"
  /\ IF ans[cur].kind = "ok"
     THEN /\ client' = "done"
          /\ got' = [got EXCEPT ![issue] = [kind |-> "ok", id |-> ans[cur].id]]
          /\ UNCHANGED <<attempt, cur, sent, reqIssue, srv>>
     ELSE RetryOrGiveUp("error")
  /\ UNCHANGED <<issue, ans, store, saving, made>>

Answer(r, kind, id) ==
  /\ srv' = [srv EXCEPT ![r] = "ready"]
  /\ ans' = [ans EXCEPT ![r] = [kind |-> kind, id |-> id]]

\* idempotency.interceptor.ts findFirst. code runs the handler on a miss.
\* fixed inserts a pending row under the unique index in the same step.
ServerLooksUpKey(r) ==
  /\ srv[r] = "arrived"
  /\ LET k == KeyOfReq(r)
         e == store[k]
     IN CASE e.st \in {"ok", "err"} ->
               Answer(r, e.st, e.id) /\ UNCHANGED store
          [] e.st = "pending" ->
               Answer(r, "busy", 0) /\ UNCHANGED store
          [] MODE = "code" ->
               srv' = [srv EXCEPT ![r] = "running"] /\ UNCHANGED <<ans, store>>
          [] MODE = "failOpenClaim" ->
               srv' = [srv EXCEPT ![r] = "claiming"] /\ UNCHANGED <<ans, store>>
          [] OTHER ->
               /\ store' = [store EXCEPT ![k] = [st |-> "pending", id |-> 0]]
               /\ srv' = [srv EXCEPT ![r] = "running"]
               /\ UNCHANGED ans
  /\ UNCHANGED <<issue, client, attempt, cur, sent, reqIssue, saving, made, got>>

\* failOpenClaim only: the pending row is created after the lookup and a
\* unique violation is swallowed, as the interceptor swallows store errors.
ServerClaimsKey(r) ==
  /\ srv[r] = "claiming"
  /\ LET k == KeyOfReq(r) IN
       store' = IF store[k].st = "empty"
                  THEN [store EXCEPT ![k] = [st |-> "pending", id |-> 0]]
                  ELSE store
  /\ srv' = [srv EXCEPT ![r] = "running"]
  /\ UNCHANGED <<issue, client, attempt, cur, sent, reqIssue, ans, saving, made, got>>

\* createPrescriptionPad creates an automatic visit and a prescription.
ServerCreatesPrescription(r) ==
  /\ srv[r] = "running"
  /\ LET id == Len(made) + 1
         k == KeyOfReq(r)
     IN /\ made' = Append(made, reqIssue[r])
        /\ Answer(r, "ok", id)
        /\ IF Claims
             THEN store' = [store EXCEPT ![k] = [st |-> "ok", id |-> id]] /\ UNCHANGED saving
             ELSE saving' = saving \cup {r} /\ UNCHANGED store
  /\ UNCHANGED <<issue, client, attempt, cur, sent, reqIssue, got>>

\* code: the tap stores the response after it is emitted. A unique violation
\* is swallowed, so the first stored response wins.
ServerStoresResponse(r) ==
  /\ r \in saving
  /\ saving' = saving \ {r}
  /\ LET k == KeyOfReq(r) IN
       store' = IF store[k].st = "empty"
                  THEN [store EXCEPT ![k] = [st |-> "ok", id |-> ans[r].id]]
                  ELSE store
  /\ UNCHANGED <<issue, client, attempt, cur, sent, reqIssue, srv, ans, made, got>>

\* The handler throws. createPrescriptionPad deletes its automatic visit, so
\* nothing is left behind. The tap never sees an error.
ServerFails(r) ==
  /\ srv[r] = "running"
  /\ Answer(r, "err", 0)
  /\ LET k == KeyOfReq(r) IN
       store' = CASE MODE = "code" -> store
                  [] MODE = "storeErrors" -> [store EXCEPT ![k] = [st |-> "err", id |-> 0]]
                  [] OTHER -> [store EXCEPT ![k] = [st |-> "empty", id |-> 0]]
  /\ UNCHANGED <<issue, client, attempt, cur, sent, reqIssue, saving, made, got>>

Next ==
  \/ DoctorSavesNew
  \/ DoctorSavesAgain
  \/ BrowserTimesOut
  \/ BrowserGetsAnswer
  \/ \E r \in Reqs :
       \/ ServerLooksUpKey(r)
       \/ ServerClaimsKey(r)
       \/ ServerCreatesPrescription(r)
       \/ ServerStoresResponse(r)
       \/ ServerFails(r)

\* The browser's abort timer fires. Nothing promises the server ever answers.
Spec == Init /\ [][Next]_vars /\ WF_vars(BrowserTimesOut)

-----------------------------------------------------------------------------

CreatedFor(o) == Cardinality({i \in 1..Len(made) : made[i] = o})

OnePrescriptionPerIssue == \A o \in IssueIds : CreatedFor(o) <= 1

NoStaleReplay == \A o \in IssueIds : got[o].kind = "ok" => made[got[o].id] = o

NoFailureStored == \A k \in Keys : store[k].st # "err"

BrowserLeavesSaving == [](client = "waiting" => <>(client # "waiting"))

=============================================================================
