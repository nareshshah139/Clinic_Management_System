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

The patient answers through a task link (PP-35 to PP-43, `portal/task.service.ts`). A submit reads,
then writes in one transaction: `checkIn.updateMany(... state: 'OPEN')` moves the check-in to
ANSWERED with its only response (pinned `instrumentVersionId`) and, when urgent, its `RESPONSE_FLAG`
attention item; a submit that finds it ANSWERED is kept as a patient message with an open attention
item. The link reaches the patient only in a sent message; two submits may race.

| Rule | Breaks in |
| --- | --- |
| `LinkAnswersOnly` | `answerAnyCheckIn` (writes to a missed or cancelled check-in) |
| `OneResponsePerCheckIn` | `noStateGuard` (write trusts the earlier read) |
| `SecondAnswerNotLost` | `dropSecond` (answers "already answered" and keeps nothing) |
| `ResponsePinsVersion` | `pinLatest` (response takes the newest published version) |
| `UrgentReachesWorklist` | `flagAfterCommit` (flag item written after the response commits) |

`code` is the code in this commit; it is the same model as `fixed`.

Behaviour tests: `backend/src/modules/follow-ups/tests/follow-ups.database.spec.ts`,
`backend/src/modules/portal/tests/portal-task.database.spec.ts`.
