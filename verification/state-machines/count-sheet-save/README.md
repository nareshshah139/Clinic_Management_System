# Stock count sheet autosave

A pharmacist types counted quantities on the count sheet. Each change saves by itself 600 ms later. The sheet shows Saving…, Saved, or Not saved. This model checks that the indicator tells the truth, that a typed count is never thrown away unsent, and that the sheet never stays in Saving.

`CountSheetSave.tla` models one counted line, the pharmacist, the debounce timer, the server, and one other window that saves the same count. The code spreads the save state across `saveState` and four refs. The spec keeps each of them as a variable.

| Model variable | Code |
| --- | --- |
| `ind` | `saveState`, `CountSheet.tsx:38`, rendered at `CountSheet.tsx:269-281` |
| `dirty` | `dirty` ref, `CountSheet.tsx:45` |
| `timer` | `timer` ref, `CountSheet.tsx:49` |
| `flights` | `inflight` ref and the PATCH it awaits, `CountSheet.tsx:48`, `65-83` |
| `ver` | `version` ref, `CountSheet.tsx:44` |
| `mver` | `detail.version` in the sheet's React key, `StockCounts.tsx:104` |
| `stored`, `sver` | the count's payload and version on the server |
| `reload` | `onStale` asked `CountDocument` to reload, `StockCounts.tsx:85-92` |
| `mounted`, `dropped` | the sheet is on screen; a count was discarded unsent |

## Model to code

| Action | Code |
| --- | --- |
| `YouTypeACount` | `change`, `CountSheet.tsx:101-108`. It marks the line dirty, shows Saving (`104`) and re-arms the timer. |
| `TheSheetSaves` | the timer calls `flush`, `CountSheet.tsx:53-86`. It waits for the request in flight (`56`), drops invalid counts (`57`), says Not saved when only invalid counts are dirty (`58-61`), else sets Saving and sends the PATCH with `version.current` (`62-71`). |
| `ServerAnswers` | `saveCountProgress` compares the version and returns 409 when stale, `inventory-workflow.service.ts:1517-1533`. On success the sheet sets Saving if more lines are dirty, else Saved (`CountSheet.tsx:74`). On 409 it puts the line back in dirty and calls `onStale` without changing `saveState` (`77-78`). |
| `TheSaveFails` | any other error: the line goes back in dirty and the sheet says Not saved (`CountSheet.tsx:79`). The server may have saved before the reply was lost. |
| `TheSaveTimesOut` | the count PATCH aborts after 120 s, `api.ts:31`, `178`. The sheet takes the `TheSaveFails` path. |
| `TheReloadArrives` | `useLoad.reload`, `StockCounts.tsx:34-45`. A new version remounts the sheet through its key, showing the saved counts. |
| `AnotherWindowSaves` | another tab or person saves the same count. |
| `YouLeaveTheSheet` | Back to stock counts, `StockCounts.tsx:95`. The unmount cleanup flushes when the debounce timer is armed, `CountSheet.tsx:94-99`. |

## Rules and what TLC says

| Rule | before | code | Replay |
| --- | --- | --- | --- |
| `TypeOK` | holds | holds | |
| `SavedMeansSaved` | breaks | holds | passes |
| `NoDropOnLeave` | breaks | holds | passes |
| `OneSaveAtATime` | holds | holds | |
| `LeavesSaving` | breaks | holds | passes |
| `SaveRequestEnds` | breaks | holds | passes |

`before` is the sheet at commit `be2b934`, kept as a regression control. The replays are in `frontend/__tests__/formal/count-sheet-save.formal-replay.test.tsx`. They render the real `StockCounts` workspace with the real `DashboardUserProvider` and stub only `fetch`. A held PATCH rejects when its signal aborts, as a real fetch does. Each replay follows TLC's path to the break in `before` and asserts the correct outcome.

- `SavedMeansSaved`. Before the fix, a count typed a moment ago showed Saved for 600 ms, because `change` never marked the indicator.
- `NoDropOnLeave`. Before the fix, typing a count and pressing Back within 600 ms sent nothing. The cleanup cleared the debounce timer. The replay goes back to the list and checks that the typed count is sent.
- `LeavesSaving`. Before the fix, if the count on screen did not parse when a save returned, the sheet set Saving because the line was dirty, and the next flush found nothing valid to send and returned without changing the indicator. The sheet said Saving… until the next keystroke. TLC's path goes through a 409 and remount first, and the replay follows it.
- `SaveRequestEnds`. Before the fix, the count PATCH had no client timeout, so a request the server never answered never ended and every later count queued behind it. The replay checks the request's abort signal ten minutes later.

`OneSaveAtATime` holds in both. The `while (inflight.current)` wait in `flush` serialises saves. A 409 does not leave the indicator in Saving for good when the server answers. A 409 means the version moved, so the reload always remounts the sheet with a new key.

## The fix

- `CountSheet.tsx:104`. `change` sets Saving, so the indicator never says Saved while a typed count waits.
- `CountSheet.tsx:94-99`. The unmount cleanup flushes when the debounce timer is armed. `fixed` flushes every valid dirty line instead. The code flushes only an edit the timer still holds. A line put back in dirty by a failure or a 409 was already sent once, so `NoDropOnLeave` still holds, as TLC confirms.
- `CountSheet.tsx:58-61`. A flush that finds only unreadable counts says Not saved. The indicator then reads "Not saved. Fix the highlighted quantity." (`274`), because the connection is not the problem.
- `api.ts:31`, `178`. The count PATCH and the count reload GET abort after a client timeout, 120 s for the write and 30 s for the read. `saveCountProgress` runs in a 30 s transaction retried at most twice on a serialization conflict, `inventory-workflow.service.ts:171-182`, so 120 s outlasts the server's own limit.

## Fixed mode and negative controls

`fixed` adds four guards. `change` shows Saving at once. The unmount cleanup flushes every valid dirty line instead of only clearing the timer. A flush with only invalid entries says Not saved. The PATCH is aborted after a timeout. `code` has all four, with the narrower leave flush described above.

| Mode | Mistake it reproduces | Breaks |
| --- | --- | --- |
| `indicatorLagsEdit` | `change` does not mark the indicator, as before the fix | `SavedMeansSaved` |
| `dropTimerOnLeave` | the cleanup only clears the timer, as before the fix | `NoDropOnLeave` |
| `savingWithInvalid` | a flush with nothing valid leaves Saving, as before the fix | `LeavesSaving` |
| `noTimeout` | inventory writes have no client timeout, as before the fix | `SaveRequestEnds` |
| `noSerialise` | `flush` does not wait for the request in flight | `OneSaveAtATime` |
| `typeProbe` | the indicator takes a value outside its type | `TypeOK` |

## Fairness

- `WF_vars(TheSheetSaves)`. The debounce timer fires on its own.
- `WF_vars(TimesOutAny)`. A client timeout fires on its own. It is enabled only in modes that have a timeout.
- `LeavesSaving` assumes the server answers every PATCH and the reload. That assumption sits inside the property as `WF_vars(ServerAnswersAny) /\ WF_vars(TheReloadArrives) => ...`, not in `Spec`.
- `SaveRequestEnds` assumes nothing about the server.
- No user action is fair. The pharmacist may stop typing at any time.

## What the model leaves out

- More than one line. Lines save together in one PATCH, so one line shows every ordering the code has.
- Sign-off. `startSignOff` flushes first and refuses to open the dialog until the flush succeeds, `CountSheet.tsx:122-137`.
- A PATCH that times out and lands later, after newer saves. The model decides whether an aborted request landed at the moment it is aborted.
- The reload GET after a 409 hangs. It now times out after 30 s and the GET retries twice, so the workspace shows Could not load stock counts with Retry. `LeavesSaving` assumes the reload answers.
- The old sheet's leave flush during a remount. When a reload remounts the sheet while a typed count still waits on the debounce, the old sheet's cleanup sends it with the old version. The server refuses it with 409, and the workspace shows the change toast once more and reloads the same version. The model drops the old sheet's requests at the remount.
- Notes. A note saves through the same path as a count.
