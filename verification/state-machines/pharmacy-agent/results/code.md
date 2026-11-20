# Pharmacy agent run and proposal review, code mode

TLC explored 4893 states and 13867 steps. The chart has 12 states and 29 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| AppliedOnce | invariant | breaks |
| DecisionIsFinal | invariant | breaks |
| RejectedMeansNotApplied | invariant | breaks |
| StatusesAgree | invariant | breaks |
| NoChangesMeansNoChanges | invariant | breaks |
| RunEndsOnce | invariant | breaks |
| RunLeavesRunning | property | breaks |
| ApplyingEnds | property | breaks |

Holds: TypeOK.

## AppliedOnce breaks

Each approved action changes the pharmacy at most once.

1. Asking the agent
2. you ask the agent: Asking the agent
3. Codex answers: Asking the agent
4. the agent saves its proposal: Asking the agent
5. the agent posts its answer: Proposal waiting for review
6. a reviewer clicks Apply: Being applied
7. an action starts: Being applied
8. an action changes pharmacy records: Being applied
9. a reviewer clicks Apply: Being applied
10. an action starts: Being applied
11. an action changes pharmacy records: Same change made twice

## DecisionIsFinal breaks

Once a proposal is applied, rejected or failed, its status never changes again.

1. Asking the agent
2. you ask the agent: Asking the agent
3. Codex answers: Asking the agent
4. the agent saves its proposal: Asking the agent
5. the agent posts its answer: Proposal waiting for review
6. a reviewer clicks Apply: Being applied
7. an action starts: Being applied
8. an action fails: Being applied
9. the action shows failed: Being applied
10. a reviewer clicks Reject: Being applied
11. the proposal shows failed: Proposal and its actions disagree
12. the rejection is saved: A decided proposal changes its decision

## RejectedMeansNotApplied breaks

An action shown as rejected never changed anything.

1. Asking the agent
2. you ask the agent: Asking the agent
3. Codex answers: Asking the agent
4. the agent saves its proposal: Asking the agent
5. the agent posts its answer: Proposal waiting for review
6. a reviewer clicks Apply: Being applied
7. an action starts: Being applied
8. an action changes pharmacy records: Being applied
9. a reviewer clicks Reject: Being applied
10. the rejection is saved: Rejected after a change was made

## StatusesAgree breaks

A finished proposal and its actions agree. Applied means every action applied, rejected means every action rejected, and failed leaves no action waiting or in progress.

1. Asking the agent
2. you ask the agent: Asking the agent
3. Codex answers: Asking the agent
4. the agent saves its proposal: Asking the agent
5. the agent posts its answer: Proposal waiting for review
6. a reviewer clicks Apply: Being applied
7. a reviewer clicks Reject: Being applied
8. the rejection is saved: Being applied
9. an action starts: Proposal and its actions disagree

## NoChangesMeansNoChanges breaks

When the agent says no database changes were made, nothing from that run changed the pharmacy or is still waiting to be applied.

1. Asking the agent
2. you ask the agent: Asking the agent
3. Codex answers: Asking the agent
4. the agent saves its proposal: Asking the agent
5. a later save fails: Asking the agent
6. the agent says nothing changed: Agent says nothing changed, proposal still open

## RunEndsOnce breaks

A run that has completed or failed keeps that result.

1. Asking the agent
2. you ask the agent: Asking the agent
3. Codex answers: Asking the agent
4. the agent saves its proposal: Asking the agent
5. the agent posts its answer: Proposal waiting for review
6. the thread update fails: Proposal waiting for review
7. the agent says nothing changed: Completed run marked failed

## RunLeavesRunning breaks

A run does not stay running forever.

1. Asking the agent
2. you ask the agent: Asking the agent
3. the server restarts: Run left running
From step 3 the system can repeat these steps, or stop here, forever.

## ApplyingEnds breaks

No proposal or action stays shown as being applied forever.

1. Asking the agent
2. you ask the agent: Asking the agent
3. Codex answers: Asking the agent
4. the agent saves its proposal: Asking the agent
5. the agent posts its answer: Proposal waiting for review
6. a reviewer clicks Apply: Being applied
7. the thread update fails: Being applied
8. a reviewer clicks Reject: Being applied
9. the agent says nothing changed: Completed run marked failed
10. an action starts: Completed run marked failed
11. the server restarts: Apply abandoned half way
From step 11 the system can repeat these steps, or stop here, forever.

## Steps the chart hides

ActionRuns, MarkApplying, ProposalApplied, ProposalFails, RecordApplied, RecordFailure, RejectWrites, ReviewerApplies, ServerRestarts
