# Pharmacy agent run and proposal review

The pharmacy assistant turns a pharmacist's message into proposals. Nothing it proposes reaches the pharmacy until someone clicks Apply. This model checks that gate. It covers one `sendMessage` run that stages one proposal of two actions, and two reviewers who each send one Apply or Reject. The two reviewers can be one pharmacist double-clicking. The Apply and Reject buttons have no in-flight guard (`frontend/src/components/pharmacy/AgenticPharmacyDock.tsx:413`, `:430`, `:1145`, `:1153`).

Model at commit `6416677`. Census ids: `pharmacy-agent-run`, `pharmacy-agent-proposal`, `pharmacy-agent-proposal-action`, `agent-proposal-review-client`, `pharmacy-agent-turn`.

## Where the state lives

| Model variable | Code |
| --- | --- |
| `run` | `PharmacyAgentRun.status` (`backend/prisma/schema.prisma:2675`). `QUEUED` is the column default and is never written. |
| `rpc` | where `sendMessage` is (`pharmacy-agent.service.ts:453` to `:619`). Not stored. |
| `told` | the ASSISTANT messages in the thread. `"answer"` is the reply at `:540`, `"noChanges"` is the canned reply at `:601` that ends "No database changes were made." |
| `p` | `PharmacyAgentProposal.status` (`schema.prisma:2682`). `EXPIRED` is never written. `APPLYING` exists only in the fixed modes. |
| `act` | `PharmacyAgentProposalAction.status`, a free-text `String` (`schema.prisma:2630`). `SKIPPED` exists only in the fixed modes. |
| `eff` | the rows an action's `applyAction` creates. For a pharmacist's `create_inventory_item` that is one `InventoryItemRequest` per call (`inventory-item-request.service.ts:51`). |
| `upc`, `ui` | where each `applyProposal` or `rejectProposal` request is, and which action the apply loop is on. Not stored. |
| `runEnd`, `firstDecision` | history only. They hold the first final status, so a rule can say a final status never changes. |

The proposal status and its action statuses are one lifecycle written in separate statements. `StatusesAgree` says when they must agree.

## Rules

| Rule | Kind | Says | `code` | Replay |
| --- | --- | --- | --- | --- |
| `TypeOK` | invariant | Every status holds a value the code can write. | holds | |
| `AppliedOnce` | invariant | Each approved action changes the pharmacy at most once. | breaks | `twoApplies` |
| `DecisionIsFinal` | invariant | Once a proposal is applied, rejected or failed, its status never changes again. | breaks | `failureThenRejection` |
| `RejectedMeansNotApplied` | invariant | An action shown as rejected never changed anything. | breaks | `rejectionAfterAChange` |
| `StatusesAgree` | invariant | Applied means every action applied, rejected means every action rejected, and failed leaves no action waiting or in progress. | breaks | `applyWritesOverRejection` |
| `NoChangesMeansNoChanges` | invariant | When the agent says no database changes were made, nothing from that run changed the pharmacy or is still waiting to be applied. | breaks | `failedRunStillOffersProposal` |
| `RunEndsOnce` | invariant | A run that has completed or failed keeps that result. | breaks | `threadUpdateFails` |
| `RunLeavesRunning` | property | A run does not stay running forever. | breaks | `restartDuringCodex` |
| `ApplyingEnds` | property | No proposal or action stays shown as being applied forever. | breaks | `restartDuringApply` |

Replays live in `backend/src/modules/pharmacy-agent/tests/pharmacy-agent.formal-replay.database.spec.ts`.

## What the code does today

- `applyProposal` reads the proposal, checks `PENDING_REVIEW` (`:655`), then writes every status by id with no status in the `where`. Two Applies both pass the check and both run every action. The replay files two item requests for one approved line.
- `rejectProposal` does the same read then write (`:733`, `:737`). A Reject that lands while an Apply is running marks an action `REJECTED` after it already filed its item request. The Apply then writes `APPLYING` and `APPLIED` over the rejection. A Reject that read the proposal before an Apply failed turns the `FAILED` proposal into `REJECTED`.
- When an action throws, the loop marks it `FAILED` and the proposal `FAILED` (`:684` to `:696`). Later actions stay `PENDING_REVIEW` under a failed proposal.
- `sendMessage` creates the proposals (`:524`) before the reply and the run's `COMPLETED` write. One `catch` (`:591`) covers everything after the run row exists. If a later proposal fails to save, the run is marked `FAILED` and the pharmacist reads "No database changes were made", while the first proposal stays `PENDING_REVIEW` and can be applied. The replay triggers this with a Codex reply whose second proposal carries `expectedVersion: "tomorrow"`. No fault injection is needed.
- The same `catch` covers the thread update at `:565`, which runs after `COMPLETED`. If that update throws, the run is rewritten from `COMPLETED` to `FAILED` and the canned "nothing changed" reply is posted under the real answer.
- If the `FAILED` write in the `catch` throws, or the process dies, the run stays `RUNNING`. If the process dies inside the apply loop, the action stays `APPLYING`. No sweeper, cron or startup hook touches either. `onModuleInit` (`:225`) only upserts permissions.

## Model to code

| Model action | Code |
| --- | --- |
| `PharmacistAsks` | `sendMessage` saves the USER message (`:472`) and creates the run `RUNNING` (`:484`). |
| `CodexAnswers`, `CodexFails` | `runCodexAgent` at `:501` and the optional second pass at `:515`. `spawnWithInput` kills Codex after `PHARMACY_AGENT_CODEX_TIMEOUT_MS`, default 60 s (`:1149`, `:1241`). A non-zero exit or the timeout throws. |
| `StageProposal` | `stageProposals` creates each proposal with its actions in one nested create (`:1311`). |
| `AnswerFails` | anything after staging throws before `COMPLETED`: a later proposal's create (`:1311`), the ASSISTANT message (`:540`) or the run update (`:554`). |
| `AnswerPosted` | the ASSISTANT message (`:540`) and the run `COMPLETED` write (`:554`). In the fixed modes the proposal is created in the same step. |
| `SessionTouched`, `TouchFails` | the thread title and `updatedAt` write (`:565`). The audit write after it swallows its own errors (`:1767`). |
| `RunMarkedFailed` | the `catch` writes the run `FAILED` by id (`:593`) and posts the canned reply (`:601`). |
| `FailedWriteThrows` | the `FAILED` write at `:593` throws, so the request ends with a 500 and the run row is untouched. |
| `Visible` | a reviewer sees a proposal in the `sendMessage` reply or by reloading the thread (`sessionDetailInclude`, `:789`). The dock does not poll during a run. |
| `ReviewerApplies` | `applyProposal` reads the proposal and checks `PENDING_REVIEW` (`:650` to `:657`). In the fixed modes this is a conditional write to `APPLYING`. |
| `MarkApplying` | action `APPLYING` by id (`:674`). |
| `ActionRuns`, `ActionThrows` | `applyAction` (`:678`, body at `:1430`). |
| `RecordApplied` | action `APPLIED` by id (`:679`). The loop moves to the next action in `createdAt` order. |
| `RecordFailure`, `ProposalFails` | action `FAILED` (`:685`), then proposal `FAILED` (`:692`), then rethrow (`:696`). |
| `ProposalApplied` | proposal `APPLIED` by id (`:700`). |
| `ReviewerRejects`, `RejectWrites` | `rejectProposal` reads and checks (`:728` to `:735`), then one nested write sets the proposal and every action `REJECTED` (`:737` to `:750`). |
| `ServerRestarts` | a deploy or crash. Every request in flight stops where it is. |
| `SweeperFailsRun`, `SweeperFailsApply` | not in the code. The fix's sweeper. |

## The fix the model checks

`fixed` turns on six guards. Each negative control turns one off and must break the rule it protects.

| Guard | Mode without it | Breaks |
| --- | --- | --- |
| Apply claims the proposal with one conditional write from `PENDING_REVIEW` to `APPLYING`, and refuses if the write matched no row. The last write goes from `APPLYING` to `APPLIED` or `FAILED` only. | `noClaim` | `AppliedOnce`, `DecisionIsFinal` |
| Reject is one conditional write that matches only `PENDING_REVIEW`. | `rejectNoCAS` | `RejectedMeansNotApplied` |
| When an action fails, the actions after it still waiting are marked `SKIPPED`. | `noSkip` | `StatusesAgree` |
| Staging, the reply and the run's `COMPLETED` write commit in one transaction. | `stageEarly` | `NoChangesMeansNoChanges` |
| The `catch` writes `FAILED` only where the run is still `RUNNING`, and posts the canned reply only if that write matched. | `failedOverwrites` | `RunEndsOnce` |
| A sweeper fails a `RUNNING` run and an `APPLYING` proposal or action that no live request owns. Waiting actions under a swept proposal become `SKIPPED`. | `noSweeper` | `RunLeavesRunning`, `ApplyingEnds` |

`typeProbe` writes a run status outside the enum to show `TypeOK` can fail.

## Fairness

`Spec == Init /\ [][Next]_vars /\ WF(CodexStep) /\ WF(RunDbStep) /\ \A u : WF(ReviewStep(u)) /\ WF(SweepStep)`.

| Clause | Steps | Real-world reason |
| --- | --- | --- |
| `WF_vars(CodexStep)` | `CodexAnswers`, `CodexFails` | A timer. `spawnWithInput` sends SIGTERM after 60 s. |
| `WF_vars(RunDbStep)` | every `sendMessage` step after Codex, success or failure | Assumption. Each database write returns or throws. |
| `WF_vars(ReviewStep(u))` | every step of a reviewer's request after the click | Assumption. The database and the services behind `applyAction` return or throw. |
| `WF_vars(SweepStep)` | the sweeper | A cron or startup job. Enabled only in the fixed modes. |

There is no fairness on `PharmacistAsks`, `ReviewerApplies` or `ReviewerRejects`, because a person may never click. There is none on `ServerRestarts`, which may happen at most once. The two properties ask whether the system leaves `RUNNING` and `APPLYING` by itself. In `code` it does not after a restart or a failed `FAILED` write, because nothing but the dead request ever writes those rows.

## Replays

Each test runs the real `PharmacyAgentService` and its real collaborators on a private PostgreSQL schema from `localDatabase`. Codex is stubbed at `spawnWithInput`, the child-process boundary, so `runCodexAgent`, output parsing, staging and naming all run. Interleavings use `gate()` from `backend/src/shared/testing/interleave.ts`. Each `.failing` test asserts what the rule demands. Each `today:` test walks the same path and asserts what the code does now.

| Rule | Path | `today:` sees |
| --- | --- | --- |
| `AppliedOnce` | The reply is posted. Apply A runs the first action and pauses before its `APPLIED` write. Apply B does the same. | 2 item requests for one approved line |
| `DecisionIsFinal` | The proposal's items are added by hand first, so the first action throws a conflict. Apply A marks it failed and pauses before the proposal write. Reject B reads and pauses. A writes `FAILED`, then B writes. | proposal `REJECTED` |
| `RejectedMeansNotApplied` | Apply A files the first item request and pauses. Reject runs. | Reject accepted, both actions `REJECTED`, 1 item request |
| `StatusesAgree` | Apply A reads and pauses before its first write. Reject runs. A writes `APPLYING`. | proposal `REJECTED` with one action `APPLYING` |
| `NoChangesMeansNoChanges` | Codex returns two proposals. The second has an unparseable `expectedVersion`, so its create throws. | "No database changes were made", run `FAILED`, first proposal still `PENDING_REVIEW` |
| `RunEndsOnce` | The thread update throws once. | run `FAILED` after `COMPLETED`, canned reply |
| `RunLeavesRunning` | Codex never answers. A new service instance starts with `onModuleInit`. | run `RUNNING` |
| `ApplyingEnds` | The reply is posted. Apply A reads and pauses. The thread update throws. Reject B reads and stops. The run is marked failed. A writes `APPLYING` and stops. A new service instance starts with `onModuleInit`. | canned reply, 1 action `APPLYING` |

A process crash cannot happen inside jest. The crash replays stop the killed requests at the model's crash point by never releasing their gate or never answering from Codex, then start a fresh service the way a restart does. `RunEndsOnce` and `ApplyingEnds` make the thread update throw once, because a transient database error is the only way it fails. If the fix uses a cron instead of `onModuleInit`, those two replays must call the cron's method instead.

`StatusesAgree` checks the rule itself on the observed statuses, because a correct fix may refuse either the Apply or the Reject. The other `.failing` tests assert literal values.

Every replay follows its path in `results/code.md`, one gate per interleaving. Where the trace leaves `sendMessage` paused before its thread update, the replay pauses it there too and lets it finish after the observation. The thread update touches only the session row.

Run them with

```sh
cd backend && FORMAL_REPLAY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/clinic_stack npx jest --ci --runInBand src/modules/pharmacy-agent/tests/pharmacy-agent.formal-replay.database.spec.ts
```

## The chart

States break into normal ones (asking, waiting for review, being applied, finished), two stuck ones and six broken ones. The chart stops following a state once it breaks a rule. From a broken state it draws only steps into an overwritten decision or a stuck state, because the shortest overwrite starts from a state that already breaks `StatusesAgree`. From a stuck state it draws only steps back into a normal state. Those are the steps `results/code.md` lists as hidden. Every one of them is also drawn somewhere else.

## What the model leaves out

- One proposal per run. The code stages up to five, and the failed save of a later one is folded into `AnswerFails`.
- The second Codex pass and its data requests. They are folded into `CodexAnswers`.
- The permission and expected-version checks before the apply loop (`:659` to `:669`). They throw before any write, so the model treats them as a refused click.
- A reviewer acting between staging and the posted reply. The window is a few writes long and no screen shows the proposal during it.
- Races inside one `applyAction` call, such as the duplicate check in `DrugService.create`.
- How each action kind reacts to a second run. Verified only for a pharmacist's `create_inventory_item`, which files a second item request. From reading only: `adjust_stock` passes `operationId: agent:<actionId>` (`:1462`) so a rerun is absorbed, and a doctor's `create_inventory_item` or a `create_purchase_invoice_draft` hits a unique constraint, so the second run fails and lands in `DecisionIsFinal` and `StatusesAgree` instead.
- The client's copy of the proposal. The dock merges each response and does not refetch after a failed Apply. The model uses the client only as the source of concurrent clicks.
- Two reads of the same proposal returned its actions in different orders during the replays. Actions created in one nested create can tie on `createdAt`, and `applyProposal` orders by `createdAt` alone. The model applies actions in a fixed order.
