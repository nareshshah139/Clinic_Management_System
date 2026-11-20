# Stock count sheet autosave

A pharmacist types counted quantities on the count sheet. Each change saves by itself 600 ms later. The sheet shows Saving…, Saved, or Not saved. This model checks that the indicator tells the truth, that a typed count is never thrown away unsent, and that the sheet never stays in Saving.

`CountSheetSave.tla` models one counted line, the pharmacist, the debounce timer, the server, and one other window that saves the same count. The code spreads the save state across `saveState` and four refs. The spec keeps each of them as a variable.

| Model variable | Code |
| --- | --- |
| `ind` | `saveState`, `CountSheet.tsx:38`, rendered at `CountSheet.tsx:260-270` |
| `dirty` | `dirty` ref, `CountSheet.tsx:45` |
| `timer` | `timer` ref, `CountSheet.tsx:49` |
| `flights` | `inflight` ref and the PATCH it awaits, `CountSheet.tsx:48`, `62-80` |
| `ver` | `version` ref, `CountSheet.tsx:44` |
| `mver` | `detail.version` in the sheet's React key, `StockCounts.tsx:104` |
| `stored`, `sver` | the count's payload and version on the server |
| `reload` | `onStale` asked `CountDocument` to reload, `StockCounts.tsx:85-92` |
| `mounted`, `dropped` | the sheet is on screen; a count was discarded unsent |

## Model to code

| Action | Code |
| --- | --- |
| `YouTypeACount` | `change`, `CountSheet.tsx:93-99`. It marks the line dirty and re-arms the timer. It never touches `saveState`. |
| `TheSheetSaves` | the timer calls `flush`, `CountSheet.tsx:53-83`. It waits for the request in flight (`56`), drops invalid counts (`57`), returns with nothing to send (`58`), else sets Saving and sends the PATCH with `version.current` (`60-68`). |
| `ServerAnswers` | `saveCountProgress` compares the version and returns 409 when stale, `inventory-workflow.service.ts:1517-1533`. On success the sheet sets Saving if more lines are dirty, else Saved (`CountSheet.tsx:71`). On 409 it puts the line back in dirty and calls `onStale` without changing `saveState` (`72-75`). |
| `TheSaveFails` | any other error: the line goes back in dirty and the sheet says Not saved (`CountSheet.tsx:76`). The server may have saved before the reply was lost. |
| `TheSaveTimesOut` | does not exist in the code. `api.ts:170-172` sets a timeout only for patient, visit and prescription writes. `fixed` adds one. |
| `TheReloadArrives` | `useLoad.reload`, `StockCounts.tsx:34-45`. A new version remounts the sheet through its key, showing the saved counts. |
| `AnotherWindowSaves` | another tab or person saves the same count. |
| `YouLeaveTheSheet` | Back to stock counts, `StockCounts.tsx:95`. The unmount cleanup clears the timer, `CountSheet.tsx:88-90`. |

## Rules and what TLC says

| Rule | code | Replay |
| --- | --- | --- |
| `TypeOK` | holds | |
| `SavedMeansSaved` | breaks | `today:` and `.failing` pass |
| `NoDropOnLeave` | breaks | `today:` and `.failing` pass |
| `OneSaveAtATime` | holds | |
| `LeavesSaving` | breaks | `today:` and `.failing` pass |
| `SaveRequestEnds` | breaks | `today:` and `.failing` pass |

The replays are in `frontend/__tests__/formal/count-sheet-save.formal-replay.test.tsx`. They render the real `StockCounts` workspace with the real `DashboardUserProvider` and stub only `fetch`.

- `SavedMeansSaved`. A count typed a moment ago shows Saved for 600 ms, because `change` never marks the indicator.
- `NoDropOnLeave`. Typing a count and pressing Back within 600 ms sends nothing. The cleanup clears the debounce timer and no warning appears. The replay goes back to the list and checks that no PATCH is ever sent.
- `LeavesSaving`. If the count on screen does not parse when a save returns, the sheet sets Saving because the line is dirty, and the next flush finds nothing valid to send and returns without changing the indicator. The sheet says Saving… until the next keystroke, though the server answered. TLC's path goes through a 409 and remount first, and the replay follows it.
- `SaveRequestEnds`. The count PATCH has no client timeout. If the server never answers, the request never ends. `flush` waits on it, so every later count queues behind it, and the indicator says Saving… forever. The replay checks the request's abort signal ten minutes later.

`OneSaveAtATime` holds. The `while (inflight.current)` wait in `flush` serialises saves. The census lead that a 409 leaves the indicator in Saving for good does not hold when the server answers. A 409 means the version moved, so the reload always remounts the sheet with a new key.

## Fixed mode and negative controls

`fixed` adds four guards. `change` shows Saving at once. The unmount cleanup calls `flush` instead of only clearing the timer. A flush with only invalid entries says Not saved. The PATCH is aborted after a timeout.

| Mode | Mistake it reproduces | Breaks |
| --- | --- | --- |
| `indicatorLagsEdit` | `change` does not mark the indicator, as today | `SavedMeansSaved` |
| `dropTimerOnLeave` | the cleanup only clears the timer, as today | `NoDropOnLeave` |
| `savingWithInvalid` | a flush with nothing valid leaves Saving, as today | `LeavesSaving` |
| `noTimeout` | inventory writes have no client timeout, as today | `SaveRequestEnds` |
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
- The reload GET after a 409 hangs forever. GETs have no timeout either, so the indicator would stay Saving. `LeavesSaving` assumes the reload answers.
- Notes. A note saves through the same path as a count.
