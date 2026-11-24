# Follow-up track and check-in

Release 1b, PP-27 to PP-33. One visit, the follow-up tracks it creates, and one check-in per track.

- Completing the visit with a plan creates a track and its check-in in the completion transaction,
  after the visit row lock (`VisitsService.complete`).
- A plan change on a completed visit stops the live track and creates the next one in the update
  transaction (`VisitsService.update`). Visit delete, staff archive and the doctor stop a track the
  same way, cancelling its scheduled and open check-ins (`follow-ups/tracks.ts`).
- The scheduler pass opens due check-ins, queues the opened message and one reminder, sends after
  re-reading the check-in, and closes ended windows (`follow-ups/scheduler.ts`, `SendPassService.runPass`).
  A check-in opened after its first window keeps one whole window (`closeAfterOpening`).

`canSend` covers every reason no message reaches the patient: no consent, an unconfirmed number, a
disabled portal, or the provider down.

## Rules

| Rule | Breaks in |
| --- | --- |
| `OneLiveTrackPerVisit` | `noGuard` (no row lock, no partial unique index), `editKeepsOld` |
| `ReminderOnlyWhileOpen` | `noSubjectCheck` (send without re-reading the check-in) |
| `StopEndsCheckIns` | `stopLeavesOpen` |
| `EveryCheckInEnds` | `openNeedsSend`, `closeNeedsSend` (open or close waits for a delivered message) |

`code` is the code in this commit; it is the same model as `fixed`. Response rules
(`OneResponsePerCheckIn`, `SecondAnswerNotLost`, `UrgentReachesWorklist`) belong to the task-page
change that writes responses.

Behaviour tests: `backend/src/modules/follow-ups/tests/follow-ups.database.spec.ts`.
