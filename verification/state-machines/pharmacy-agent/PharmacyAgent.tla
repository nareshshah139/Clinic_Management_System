---------------------------- MODULE PharmacyAgent ----------------------------
(* One agent run that stages one proposal of N actions, and two reviewers who
   each send one Apply or Reject request. See README.md for the code map. *)
EXTENDS Naturals, FiniteSets

CONSTANTS Reviewers, N, MODE

VARIABLES
  run,            \* PharmacyAgentRun.status
  rpc,            \* where the sendMessage request is
  told,           \* assistant messages the pharmacist has been shown
  p,              \* PharmacyAgentProposal.status
  act,            \* PharmacyAgentProposalAction.status, one per action
  eff,            \* how many times each action's change reached the pharmacy
  upc,            \* where each reviewer's request is
  ui,             \* which action each apply request is on
  restarts,       \* server restarts so far
  runEnd,         \* the first final status the run reached
  firstDecision   \* the first final status the proposal reached

vars == <<run, rpc, told, p, act, eff, upc, ui, restarts, runEnd, firstDecision>>
runVars == <<run, runEnd, rpc, told>>
propVars == <<p, firstDecision, act, eff>>
revVars == <<upc, ui>>

Acts == 1..N
RunStatus == {"none", "RUNNING", "COMPLETED", "FAILED"}
RunPc == {"idle", "codex", "stage", "answer", "touch", "catch", "gone"}
RunBusy == {"codex", "stage", "answer", "touch", "catch"}
PropStatus == {"none", "PENDING_REVIEW", "APPLYING", "APPLIED", "REJECTED", "FAILED"}
Decided == {"APPLIED", "REJECTED", "FAILED"}
ActStatus == {"PENDING_REVIEW", "APPLYING", "APPLIED", "FAILED", "REJECTED", "SKIPPED"}
ApplyLoop == {"mark", "run", "record", "failAct", "failProp", "finish"}
Busy == ApplyLoop \cup {"rWrite"}
ReviewerPc == {"idle", "gone"} \cup Busy

\* Each guard is on in "fixed" and "code" and off in "before", the code before the fix.
\* A negative control turns one off.
Claim == MODE \notin {"before", "noClaim"}
RejectCAS == MODE \notin {"before", "rejectNoCAS"}
SkipRest == MODE \notin {"before", "noSkip"}
AtomicStage == MODE \notin {"before", "stageEarly"}
FailOnlyRunning == MODE \notin {"before", "failedOverwrites"}
Sweeper == MODE \notin {"before", "noSweeper"}
\* "code" logs a failed thread update instead of sending it to the catch.
TouchLogged == MODE = "code"

SetRun(s) == /\ run' = s
             /\ runEnd' = IF runEnd = "none" /\ s \in {"COMPLETED", "FAILED"} THEN s ELSE runEnd
SetP(s) == /\ p' = s
           /\ firstDecision' = IF firstDecision = "none" /\ s \in Decided THEN s ELSE firstDecision
KeepP == UNCHANGED <<p, firstDecision>>
SetPc(u, s) == upc' = [upc EXCEPT ![u] = s]

Init ==
  /\ run = "none" /\ rpc = "idle" /\ told = {}
  /\ p = "none"
  /\ act = [i \in Acts |-> "PENDING_REVIEW"]
  /\ eff = [i \in Acts |-> 0]
  /\ upc = [u \in Reviewers |-> "idle"]
  /\ ui = [u \in Reviewers |-> 1]
  /\ restarts = 0 /\ runEnd = "none" /\ firstDecision = "none"

(* sendMessage *)
PharmacistAsks ==
  /\ rpc = "idle"
  /\ SetRun("RUNNING") /\ rpc' = "codex"
  /\ UNCHANGED <<told, propVars, revVars, restarts>>

CodexAnswers ==
  /\ rpc = "codex"
  /\ rpc' = IF AtomicStage THEN "answer" ELSE "stage"
  /\ UNCHANGED <<run, runEnd, told, propVars, revVars, restarts>>

CodexFails ==
  /\ rpc = "codex" /\ rpc' = "catch"
  /\ UNCHANGED <<run, runEnd, told, propVars, revVars, restarts>>

StageProposal ==
  /\ rpc = "stage" /\ rpc' = "answer"
  /\ SetP("PENDING_REVIEW")
  /\ UNCHANGED <<run, runEnd, told, act, eff, revVars, restarts>>

AnswerPosted ==
  /\ rpc = "answer" /\ rpc' = "touch"
  /\ told' = told \cup {"answer"}
  /\ SetRun("COMPLETED")
  /\ IF AtomicStage THEN SetP("PENDING_REVIEW") ELSE KeepP
  /\ UNCHANGED <<act, eff, revVars, restarts>>

AnswerFails ==
  /\ rpc = "answer" /\ rpc' = "catch"
  /\ UNCHANGED <<run, runEnd, told, propVars, revVars, restarts>>

SessionTouched ==
  /\ rpc = "touch" /\ rpc' = "gone"
  /\ UNCHANGED <<run, runEnd, told, propVars, revVars, restarts>>

TouchFails ==
  /\ rpc = "touch" /\ rpc' = IF TouchLogged THEN "gone" ELSE "catch"
  /\ UNCHANGED <<run, runEnd, told, propVars, revVars, restarts>>

RunMarkedFailed ==
  /\ rpc = "catch" /\ rpc' = "gone"
  /\ IF FailOnlyRunning /\ run # "RUNNING"
       THEN UNCHANGED <<run, runEnd, told>>
       ELSE SetRun("FAILED") /\ told' = told \cup {"noChanges"}
  /\ UNCHANGED <<propVars, revVars, restarts>>

FailedWriteThrows ==
  /\ rpc = "catch" /\ rpc' = "gone"
  /\ UNCHANGED <<run, runEnd, told, propVars, revVars, restarts>>

(* A reviewer sees the proposal once the thread shows the answer that carries it, or once the
   sendMessage request has returned and a reload shows the thread. Nothing polls during a run. *)
Visible == "answer" \in told \/ rpc = "gone"

(* applyProposal *)
ReviewerApplies(u) ==
  /\ upc[u] = "idle" /\ p = "PENDING_REVIEW" /\ Visible
  /\ IF Claim THEN SetP("APPLYING") ELSE KeepP
  /\ SetPc(u, "mark") /\ ui' = [ui EXCEPT ![u] = 1]
  /\ UNCHANGED <<runVars, act, eff, restarts>>

MarkApplying(u) ==
  /\ upc[u] = "mark" /\ SetPc(u, "run")
  /\ act' = [act EXCEPT ![ui[u]] = "APPLYING"]
  /\ UNCHANGED <<runVars, p, firstDecision, eff, ui, restarts>>

ActionRuns(u) ==
  /\ upc[u] = "run" /\ SetPc(u, "record")
  /\ eff' = [eff EXCEPT ![ui[u]] = @ + 1]
  /\ UNCHANGED <<runVars, p, firstDecision, act, ui, restarts>>

ActionThrows(u) ==
  /\ upc[u] = "run" /\ SetPc(u, "failAct")
  /\ UNCHANGED <<runVars, propVars, ui, restarts>>

RecordApplied(u) ==
  /\ upc[u] = "record"
  /\ act' = [act EXCEPT ![ui[u]] = "APPLIED"]
  /\ IF ui[u] < N
       THEN SetPc(u, "mark") /\ ui' = [ui EXCEPT ![u] = @ + 1]
       ELSE SetPc(u, "finish") /\ UNCHANGED ui
  /\ UNCHANGED <<runVars, p, firstDecision, eff, restarts>>

RecordFailure(u) ==
  /\ upc[u] = "failAct" /\ SetPc(u, "failProp")
  /\ act' = [i \in Acts |->
               IF i = ui[u] THEN "FAILED"
               ELSE IF SkipRest /\ i > ui[u] /\ act[i] = "PENDING_REVIEW" THEN "SKIPPED"
               ELSE act[i]]
  /\ UNCHANGED <<runVars, p, firstDecision, eff, ui, restarts>>

ProposalFails(u) ==
  /\ upc[u] = "failProp" /\ SetPc(u, "gone")
  /\ IF Claim /\ p # "APPLYING" THEN KeepP ELSE SetP("FAILED")
  /\ UNCHANGED <<runVars, act, eff, ui, restarts>>

ProposalApplied(u) ==
  /\ upc[u] = "finish" /\ SetPc(u, "gone")
  /\ IF Claim /\ p # "APPLYING" THEN KeepP ELSE SetP("APPLIED")
  /\ UNCHANGED <<runVars, act, eff, ui, restarts>>

(* rejectProposal *)
ReviewerRejects(u) ==
  /\ upc[u] = "idle" /\ p = "PENDING_REVIEW" /\ Visible
  /\ IF RejectCAS
       THEN SetP("REJECTED") /\ act' = [i \in Acts |-> "REJECTED"] /\ SetPc(u, "gone")
       ELSE KeepP /\ UNCHANGED act /\ SetPc(u, "rWrite")
  /\ UNCHANGED <<runVars, eff, ui, restarts>>

RejectWrites(u) ==
  /\ upc[u] = "rWrite" /\ SetPc(u, "gone")
  /\ SetP("REJECTED") /\ act' = [i \in Acts |-> "REJECTED"]
  /\ UNCHANGED <<runVars, eff, ui, restarts>>

(* The fix's sweeper. A cron or startup job that only touches rows no live request owns. *)
SweeperFailsRun ==
  /\ Sweeper /\ run = "RUNNING" /\ rpc = "gone"
  /\ SetRun("FAILED")
  /\ UNCHANGED <<rpc, told, propVars, revVars, restarts>>

ApplyAbandoned == \A u \in Reviewers : upc[u] \notin ApplyLoop

SweeperFailsApply ==
  /\ Sweeper /\ ApplyAbandoned
  /\ p = "APPLYING" \/ \E i \in Acts : act[i] = "APPLYING"
  /\ IF p = "APPLYING" THEN SetP("FAILED") ELSE KeepP
  /\ act' = [i \in Acts |->
               IF act[i] = "APPLYING" THEN "FAILED"
               ELSE IF SkipRest /\ p = "APPLYING" /\ act[i] = "PENDING_REVIEW" THEN "SKIPPED"
               ELSE act[i]]
  /\ UNCHANGED <<runVars, eff, revVars, restarts>>

(* A deploy or crash kills every request in flight. No later step resumes them. *)
ServerRestarts ==
  /\ restarts = 0
  /\ rpc \in RunBusy \/ \E u \in Reviewers : upc[u] \in Busy
  /\ restarts' = 1
  /\ rpc' = IF rpc \in RunBusy THEN "gone" ELSE rpc
  /\ upc' = [u \in Reviewers |-> IF upc[u] \in Busy THEN "gone" ELSE upc[u]]
  /\ UNCHANGED <<run, runEnd, told, propVars, ui>>

ProbeBreaksType ==
  /\ MODE = "typeProbe" /\ run = "none"
  /\ run' = "probe"
  /\ UNCHANGED <<runEnd, rpc, told, propVars, revVars, restarts>>

Next ==
  \/ PharmacistAsks \/ CodexAnswers \/ CodexFails \/ StageProposal
  \/ AnswerPosted \/ AnswerFails \/ SessionTouched \/ TouchFails
  \/ RunMarkedFailed \/ FailedWriteThrows
  \/ \E u \in Reviewers :
       \/ ReviewerApplies(u) \/ MarkApplying(u) \/ ActionRuns(u) \/ ActionThrows(u)
       \/ RecordApplied(u) \/ RecordFailure(u) \/ ProposalFails(u) \/ ProposalApplied(u)
       \/ ReviewerRejects(u) \/ RejectWrites(u)
  \/ SweeperFailsRun \/ SweeperFailsApply
  \/ ServerRestarts
  \/ ProbeBreaksType

CodexStep == CodexAnswers \/ CodexFails
RunDbStep == StageProposal \/ AnswerPosted \/ AnswerFails \/ SessionTouched
             \/ TouchFails \/ RunMarkedFailed \/ FailedWriteThrows
ReviewStep(u) == MarkApplying(u) \/ ActionRuns(u) \/ ActionThrows(u) \/ RecordApplied(u)
                 \/ RecordFailure(u) \/ ProposalFails(u) \/ ProposalApplied(u) \/ RejectWrites(u)
SweepStep == SweeperFailsRun \/ SweeperFailsApply

Spec ==
  /\ Init /\ [][Next]_vars
  /\ WF_vars(CodexStep)
  /\ WF_vars(RunDbStep)
  /\ \A u \in Reviewers : WF_vars(ReviewStep(u))
  /\ WF_vars(SweepStep)

-----------------------------------------------------------------------------
TypeOK ==
  /\ run \in RunStatus /\ rpc \in RunPc /\ told \subseteq {"answer", "noChanges"}
  /\ p \in PropStatus
  /\ act \in [Acts -> ActStatus]
  /\ eff \in [Acts -> 0..2]
  /\ upc \in [Reviewers -> ReviewerPc]
  /\ ui \in [Reviewers -> Acts]
  /\ restarts \in 0..1
  /\ runEnd \in {"none", "COMPLETED", "FAILED"}
  /\ firstDecision \in {"none"} \cup Decided

AppliedOnce == \A i \in Acts : eff[i] <= 1

DecisionIsFinal == firstDecision = "none" \/ p = firstDecision

RejectedMeansNotApplied ==
  \A i \in Acts : (act[i] = "REJECTED" \/ p = "REJECTED") => eff[i] = 0

StatusesAgree ==
  /\ p = "APPLIED" => \A i \in Acts : act[i] = "APPLIED"
  /\ p = "REJECTED" => \A i \in Acts : act[i] = "REJECTED"
  /\ p = "FAILED" => \A i \in Acts : act[i] \notin {"PENDING_REVIEW", "APPLYING"}

NoChangesMeansNoChanges ==
  "noChanges" \in told => (p # "PENDING_REVIEW" /\ \A i \in Acts : eff[i] = 0)

RunEndsOnce == runEnd = "none" \/ run = runEnd

Applying == p = "APPLYING" \/ \E i \in Acts : act[i] = "APPLYING"

RunLeavesRunning == [](run = "RUNNING" => <>(run # "RUNNING"))

ApplyingEnds == [](Applying => <>~Applying)
=============================================================================
