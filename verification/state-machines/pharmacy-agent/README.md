# Pharmacy agent run and proposal review

The pharmacy assistant turns a pharmacist's message into proposals. Nothing it proposes reaches the pharmacy until someone clicks Apply. This model checks that gate. It covers one `sendMessage` run that stages one proposal of two actions, and two reviewers who each send one Apply or Reject. The two reviewers can be one pharmacist double-clicking, or two pharmacists on the same thread. The Apply and Reject buttons now send one request at a time (`frontend/src/components/pharmacy/AgenticPharmacyDock.tsx:415`, `:436`, `:1158`, `:1167`), but a second pharmacist still can.

Model first written at commit `6416677`. Fixed after `be2b934`. The mode `before` keeps the code before the fix as a regression control. `code` models the code after it. Census ids: `pharmacy-agent-run`, `pharmacy-agent-proposal`, `pharmacy-agent-proposal-action`, `agent-proposal-review-client`, `pharmacy-agent-turn`.

## Where the state lives

| Model variable | Code |
| --- | --- |
| `run` | `PharmacyAgentRun.status` (`backend/prisma/schema.prisma:2568`). `QUEUED` is the column default and is never written. |
| `rpc` | where `sendMessage` is (`pharmacy-agent.service.ts:491` to `:670`). Not stored. |
| `told` | the ASSISTANT messages in the thread. `"answer"` is the reply at `:581`, `"noChanges"` is the canned reply at `:629` that ends "No database changes were made." |
| `p` | `PharmacyAgentProposal.status` (`schema.prisma:2597`). `EXPIRED` is never written. The enum has no `APPLYING`, so `APPLYING` is stored as `PENDING_REVIEW` with `appliedAt` set (`:722`). `assertAwaitingReview` (`:841`) reads it that way. |
| `act` | `PharmacyAgentProposalAction.status`, a free-text `String` (`schema.prisma:2630`). `SKIPPED` is written by the apply loop (`:752`) and the sweep (`:263`). |
| `eff` | the rows an action's `applyAction` creates. For a pharmacist's `create_inventory_item` that is one `InventoryItemRequest` per call (`inventory-item-request.service.ts:51`). |
| `upc`, `ui` | where each `applyProposal` or `rejectProposal` request is, and which action the apply loop is on. Not stored. |
| `runEnd`, `firstDecision` | history only. They hold the first final status, so a rule can say a final status never changes. |

The proposal status and its action statuses are one lifecycle written in separate statements. `StatusesAgree` says when they must agree.

## Rules

| Rule | Kind | Says | `before` | `code` | Replay |
| --- | --- | --- | --- | --- | --- |
| `TypeOK` | invariant | Every status holds a value the code can write. | holds | holds | |
| `AppliedOnce` | invariant | Each approved action changes the pharmacy at most once. | breaks | holds | `twoApplies` |
| `DecisionIsFinal` | invariant | Once a proposal is applied, rejected or failed, its status never changes again. | breaks | holds | `failureThenRejection` |
| `RejectedMeansNotApplied` | invariant | An action shown as rejected never changed anything. | breaks | holds | `rejectionAfterAChange` |
| `StatusesAgree` | invariant | Applied means every action applied, rejected means every action rejected, and failed leaves no action waiting or in progress. | breaks | holds | `applyWritesOverRejection` |
| `NoChangesMeansNoChanges` | invariant | When the agent says no database changes were made, nothing from that run changed the pharmacy or is still waiting to be applied. | breaks | holds | `failedRunStillOffersProposal` |
| `RunEndsOnce` | invariant | A run that has completed or failed keeps that result. | breaks | holds | `threadUpdateFails` |
| `RunLeavesRunning` | property | A run does not stay running forever. | breaks | holds | `restartDuringCodex` |
| `ApplyingEnds` | property | No proposal or action stays shown as being applied forever. | breaks | holds | `restartDuringApply` |

Replays live in `backend/src/modules/pharmacy-agent/tests/pharmacy-agent.formal-replay.database.spec.ts`. Every replay is now a plain test that asserts the rule.

## What the code did before the fix

Line numbers in this section are at `be2b934`.

- `applyProposal` read the proposal, checked `PENDING_REVIEW` (`:655`), then wrote every status by id with no status in the `where`. Two Applies both passed the check and both ran every action. The replay filed two item requests for one approved line.
- `rejectProposal` did the same read then write (`:733`, `:737`). A Reject that landed while an Apply was running marked an action `REJECTED` after it had filed its item request. The Apply then wrote `APPLYING` and `APPLIED` over the rejection. A Reject that read the proposal before an Apply failed turned the `FAILED` proposal into `REJECTED`.
- When an action threw, the loop marked it `FAILED` and the proposal `FAILED` (`:684` to `:696`). Later actions stayed `PENDING_REVIEW` under a failed proposal.
- `sendMessage` created the proposals (`:524`) before the reply and the run's `COMPLETED` write. One `catch` (`:591`) covered everything after the run row existed. If a later proposal failed to save, the run was marked `FAILED` and the pharmacist read "No database changes were made", while the first proposal stayed `PENDING_REVIEW` and could be applied. The replay triggers this with a Codex reply whose second proposal carries `expectedVersion: "tomorrow"`.
- The same `catch` covered the thread update at `:565`, which ran after `COMPLETED`. If that update threw, the run was rewritten from `COMPLETED` to `FAILED` and the canned "nothing changed" reply was posted under the real answer.
- If the `FAILED` write in the `catch` threw, or the process died, the run stayed `RUNNING`. If the process died inside the apply loop, the action stayed `APPLYING`. Nothing ever touched either row again.

## Model to code

Line numbers are in `backend/src/modules/pharmacy-agent/pharmacy-agent.service.ts` after the fix.

| Model action | Code |
| --- | --- |
| `PharmacistAsks` | `sendMessage` saves the USER message (`:510`) and creates the run `RUNNING` (`:523`). |
| `CodexAnswers`, `CodexFails` | `runCodexAgent` at `:541` and the optional second pass at `:555`. `spawnWithInput` kills Codex after `codexTimeoutMs()`, `PHARMACY_AGENT_CODEX_TIMEOUT_MS` or 60 s (`:1302`, `:1319`). A non-zero exit or the timeout throws. |
| `StageProposal` | only in `before`. Now staging is part of `AnswerPosted`. |
| `AnswerFails` | anything inside the transaction throws: a proposal's create (`:1389`), the ASSISTANT message (`:581`) or the run update (`:595`). The transaction rolls back every proposal it staged. |
| `AnswerPosted` | one transaction (`:564`) stages the proposals (`:565`), posts the ASSISTANT message (`:581`) and writes the run `COMPLETED` (`:595`). |
| `SessionTouched`, `TouchFails` | the thread title and `updatedAt` write (`:650`). In `code` a failure is logged (`:658`) and the reply is still returned. The audit write after it swallows its own errors (`:1845`). |
| `RunMarkedFailed` | the `catch` (`:618`) writes `FAILED` only where the run is still `RUNNING` (`:620`) and posts the canned reply (`:629`) only if that write matched. Otherwise it rethrows (`:628`). |
| `FailedWriteThrows` | the `FAILED` write at `:620` throws, so the request ends with a 500 and the run row is untouched. |
| `Visible` | a reviewer sees a proposal in the `sendMessage` reply or by reloading the thread (`sessionDetailInclude`, `:866`). The dock does not poll during a run. |
| `ReviewerApplies` | `applyProposal` reads the proposal (`:702`), refuses unless it awaits review (`:707`), checks permissions and versions (`:709` to `:719`), then claims it (`:722`) and refuses if the claim matched no row (`:726`). |
| `MarkApplying` | action `APPLYING` by id (`:734`). |
| `ActionRuns`, `ActionThrows` | `applyAction` (`:736`, body at `:1508`). |
| `RecordApplied` | action `APPLIED` by id (`:739`). The loop moves to the next action in `createdAt` order. |
| `RecordFailure` | action `FAILED` (`:743`), then the actions still `PENDING_REVIEW` become `SKIPPED` (`:750`). |
| `ProposalFails` | proposal `FAILED` where it still holds this request's claim (`:754`), then rethrow. |
| `ProposalApplied` | proposal `APPLIED` where it still holds this request's claim (`:762`). |
| `ReviewerRejects` | `rejectProposal` reads (`:789`), refuses unless it awaits review (`:794`), then one transaction (`:796`) writes `REJECTED` only on an unclaimed `PENDING_REVIEW` proposal and marks every action `REJECTED`. A write that matched no row is refused (`:813`). |
| `RejectWrites` | only in `before`. |
| `ServerRestarts` | a deploy or crash. Every request in flight stops where it is. |
| `SweeperFailsRun`, `SweeperFailsApply` | `sweepAbandonedWork` (`:239`), every five minutes (`:238`). |

## The fix the model checks

`fixed` turns on six guards. `code` turns on the same six and also logs a failed thread update instead of sending it to the `catch` (`TouchLogged`). Each negative control turns one guard off and must break the rule it protects.

| Guard | Mode without it | Breaks |
| --- | --- | --- |
| Apply claims the proposal with one conditional write from `PENDING_REVIEW` to `APPLYING`, and refuses if the write matched no row. The last write goes from `APPLYING` to `APPLIED` or `FAILED` only. | `noClaim` | `AppliedOnce`, `DecisionIsFinal` |
| Reject is one conditional write that matches only `PENDING_REVIEW`. | `rejectNoCAS` | `RejectedMeansNotApplied` |
| When an action fails, the actions after it still waiting are marked `SKIPPED`. | `noSkip` | `StatusesAgree` |
| Staging, the reply and the run's `COMPLETED` write commit in one transaction. | `stageEarly` | `NoChangesMeansNoChanges` |
| The `catch` writes `FAILED` only where the run is still `RUNNING`, and posts the canned reply only if that write matched. | `failedOverwrites` | `RunEndsOnce` |
| A sweeper fails a `RUNNING` run and an `APPLYING` proposal or action that no live request owns. Waiting actions under a swept proposal become `SKIPPED`. | `noSweeper` | `RunLeavesRunning`, `ApplyingEnds` |

`typeProbe` writes a run status outside the enum to show `TypeOK` can fail.

## The fix

Each guard, in `backend/src/modules/pharmacy-agent/pharmacy-agent.service.ts` unless named.

- **Claim.** `applyProposal` claims with `updateMany` where `status` is `PENDING_REVIEW` and `appliedAt` is null, setting `appliedBy` and `appliedAt` (`:722`). No schema change. A claimed proposal is a `PENDING_REVIEW` row with `appliedAt` set. A claim that matched no row is refused with `BadRequestException` (`:726`). The `FAILED` and `APPLIED` writes match the exact claim (`:754`, `:762`). `assertAwaitingReview` (`:841`) refuses a claimed proposal before any write, for both Apply and Reject.
- **Conditional reject.** `rejectProposal` runs one transaction whose `updateMany` matches only an unclaimed `PENDING_REVIEW` proposal, then marks the actions `REJECTED` (`:796`). A miss is refused with `BadRequestException` (`:813`).
- **Skip the rest.** After an action fails, the actions still `PENDING_REVIEW` become `SKIPPED` (`:750`).
- **Atomic answer.** Staging, the ASSISTANT message and the run's `COMPLETED` write run in one `$transaction` (`:564`). `stageProposals` takes the transaction client (`:1369`).
- **Fail only a running run.** The `catch` writes `FAILED` with `updateMany` where `status` is `RUNNING` (`:620`), and rethrows without a canned reply if that matched nothing (`:628`).
- **Thread update outside the failure path.** The thread rename runs after the answer commits. Its failure is logged (`:658`) and the real reply is returned. This is the one difference from `fixed`, and it is why `code` has `TouchLogged`.
- **Sweep.** `sweepAbandonedWork` (`:239`) runs every five minutes with `@Cron(CronExpression.EVERY_5_MINUTES)` (`:238`). It fails a `RUNNING` run whose `startedAt` is older than the window (`:243`), fails a claimed proposal whose `appliedAt` is older than the window (`:251`), fails an `APPLYING` action under a proposal no longer awaiting review (`:255`), and marks `SKIPPED` every waiting action under a `FAILED` proposal (`:262`). The window is `2 * codexTimeoutMs() + 5 minutes`, 7 minutes by default. `sendMessage` runs Codex at most twice and `spawnWithInput` kills each run at the timeout, so a live request is always younger than the window. That age is how the sweep knows no live request owns a row. Each statement is a conditional `updateMany`, so a repeated or interrupted sweep converges. The last two statements also repair rows left by the code before the fix.
- **One review at a time in the dock.** `AgenticPharmacyDock.tsx` keeps a `reviewing` flag (`:155`). `applyProposal` and `rejectProposal` return at once while it is set (`:415`, `:436`), and both buttons are disabled (`:1158`, `:1167`).

Why a cron and no startup sweep. A row the restart killed is younger than the window when the new process starts, so a startup sweep would leave it alone. Closing it at startup regardless of age could close a run that the other instance still owns during a rolling deploy. The cron closes it within five minutes of the window.

## Fairness

`Spec == Init /\ [][Next]_vars /\ WF(CodexStep) /\ WF(RunDbStep) /\ \A u : WF(ReviewStep(u)) /\ WF(SweepStep)`.

| Clause | Steps | Real-world reason |
| --- | --- | --- |
| `WF_vars(CodexStep)` | `CodexAnswers`, `CodexFails` | A timer. `spawnWithInput` sends SIGTERM after 60 s. |
| `WF_vars(RunDbStep)` | every `sendMessage` step after Codex, success or failure | Assumption. Each database write returns or throws. |
| `WF_vars(ReviewStep(u))` | every step of a reviewer's request after the click | Assumption. The database and the services behind `applyAction` return or throw. |
| `WF_vars(SweepStep)` | the sweeper | The five-minute cron on `sweepAbandonedWork`. Enabled in every mode but `before` and `noSweeper`. |

There is no fairness on `PharmacistAsks`, `ReviewerApplies` or `ReviewerRejects`, because a person may never click. There is none on `ServerRestarts`, which may happen at most once. The two properties ask whether the system leaves `RUNNING` and `APPLYING` by itself. In `before` it does not after a restart or a failed `FAILED` write, because nothing but the dead request ever wrote those rows. In `code` the sweep does.

## Replays

Each test runs the real `PharmacyAgentService` and its real collaborators on a private PostgreSQL schema from `localDatabase`. Codex is stubbed at `spawnWithInput`, the child-process boundary, so `runCodexAgent`, output parsing, staging and naming all run. Interleavings use `gate()` from `backend/src/shared/testing/interleave.ts`. Each test asserts what the rule demands. Each one fails on the code at `be2b934`.

| Rule | Path | Asserts |
| --- | --- | --- |
| `AppliedOnce` | The reply is posted. Apply A runs the first action and pauses before its `APPLIED` write. Apply B is sent. | 1 item request, B refused with `BadRequestException` |
| `DecisionIsFinal` | The proposal's items are added by hand first, so the first action throws a conflict. Reject B reads and pauses right after its read. Apply A runs and fails. B resumes. | A `ConflictException`, B `BadRequestException`, proposal `FAILED` |
| `RejectedMeansNotApplied` | Apply A files the first item request and pauses. Reject runs. | Reject refused with `BadRequestException`, 1 item request |
| `StatusesAgree` | Apply A pauses right after its read. Reject runs. A resumes and pauses after its first action write, if it makes one. | the statuses agree |
| `NoChangesMeansNoChanges` | Codex returns two proposals. The second has an unparseable `expectedVersion`, so its create throws. | "No database changes were made", run `FAILED`, no proposal waiting |
| `RunEndsOnce` | The thread update throws. | run `COMPLETED`, the real answer |
| `RunLeavesRunning` | Codex never answers. The sweep runs, then the run's `startedAt` is moved an hour back and the sweep runs again. | `RUNNING` after the first sweep, `FAILED` after the second |
| `ApplyingEnds` | The reply is posted. Apply A writes its first action `APPLYING` and never resumes. The sweep runs, then the claim's `appliedAt` is moved an hour back and the sweep runs again. | first sweep leaves `PENDING_REVIEW` with `APPLYING` and `PENDING_REVIEW`, second gives `FAILED` with `FAILED` and `SKIPPED` |

A process crash cannot happen inside jest. The crash replays stop the killed request at the model's crash point by never releasing its gate or never answering from Codex. They call `sweepAbandonedWork` as the cron would. Moving a timestamp back an hour stands for the cron firing after the window. The first sweep in each crash replay checks that the sweep leaves a row a live request may still own.

`DecisionIsFinal` and `StatusesAgree` pause the late request right after its `findFirst` read, not before a write. The interleaving is then the same whatever write methods the code uses, so a gate cannot silently miss and let the test pass for another reason. The original `DecisionIsFinal` path, where Reject reads after Apply has started, now ends at Reject's first check. The rewritten path covers the race the conditional write closes, a Reject that read before the claim.

The `ApplyingEnds` replay used to reach a half-applied proposal through a failed thread update, a Reject and a failed `FAILED` write. The fix logs a failed thread update and refuses that Reject, so the replay now takes the shortest path to the same abandoned apply.

The dock's guard has its own tests in `frontend/__tests__/pharmacy/AgenticPharmacyDock.test.tsx`. Two Apply clicks and a Reject click while an Apply is in flight send one request. A refused Apply lets the pharmacist try again.

Run them with

```sh
cd backend && FORMAL_REPLAY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/clinic_stack npx jest --ci --runInBand src/modules/pharmacy-agent/tests/pharmacy-agent.formal-replay.database.spec.ts
```

## The chart

`results/code.md` charts the code after the fix. It has six states and no broken one. "Run left running" and "Apply abandoned half way" still appear, because a restart can still leave a row behind, and the sweep's arrow leads out of each to "Finished". Neither is marked as a state the system can stay in, because the cron always fires and the sweep always leads out.

`results/before.md` charts the code before the fix. States break into normal ones (asking, waiting for review, being applied, finished), two stuck ones and six broken ones. The chart stops following a state once it breaks a rule. From a broken state it draws only steps into an overwritten decision or a stuck state, because the shortest overwrite starts from a state that already breaks `StatusesAgree`. From a stuck state it draws only steps back into a normal state. Those are the steps `results/before.md` lists as hidden. Every one of them is also drawn somewhere else.

## What the model leaves out

- One proposal per run. The code stages up to five, and the failed save of a later one is folded into `AnswerFails`.
- The second Codex pass and its data requests. They are folded into `CodexAnswers`.
- The permission and expected-version checks before the claim (`:709` to `:719`). They throw before any write, so the model treats them as a refused click.
- A reviewer acting between staging and the posted reply. The window is a few writes long and no screen shows the proposal during it.
- Races inside one `applyAction` call, such as the duplicate check in `DrugService.create`.
- How each action kind reacts to a second run. Verified only for a pharmacist's `create_inventory_item`, which files a second item request. From reading only: `adjust_stock` passes `operationId: agent:<actionId>` (`:1540`) so a rerun is absorbed, and a doctor's `create_inventory_item` or a `create_purchase_invoice_draft` hits a unique constraint, so the second run fails and lands in `DecisionIsFinal` and `StatusesAgree` instead.
- The client's copy of the proposal. The dock merges each response and does not refetch after a failed Apply. The model uses the client only as the source of concurrent clicks.
- Two reads of the same proposal returned its actions in different orders during the replays. Actions created in one nested create can tie on `createdAt`, and `applyProposal` orders by `createdAt` alone. The model applies actions in a fixed order.
- The sweep's age window. The model lets the sweep act only once no request is in the apply loop or in `sendMessage`. The code uses age as the sign of that. A request that outlived the window could have its rows closed under it. Codex is killed at its timeout, so only a database or `applyAction` call that hangs for minutes could do that.
- The sweep is four statements, not one step. A crash between them leaves rows the next tick finishes.
- A second pharmacist on the same thread. The dock's guard covers one browser. The server's claim covers the rest.
