# Dictation and voice capture

This model covers voice capture in the browser on three surfaces.

- **Field dictation.** A form field's mic button runs `useSpeechToTextRecorder`, which runs one dictation session. The model gives this surface the patient-preferred setting, so a live transcript goes through the speaker split.
- **Voice bar.** The dashboard voice bar runs the same dictation session with the full-transcript setting. It then sends the text to voice fill and shows "Working it out..." until the reply.
- **Voice fill clip.** A voice fill button records one audio clip with `useAudioRecorder`. It does not use a dictation session.

`Init` picks one surface. The three never interact in the model. The two dictation surfaces share every session state, so the chart draws them as one machine.

## Where the state lives

The dictation session has no status column. `dictation-session.ts` spreads its lifecycle over closure variables, armed timers and a module-level lock. The spec keeps them under their code names in the record `ds`.

| Model field | Code | Meaning |
| --- | --- | --- |
| `ds.phase` | `phase`, `dictation-session.ts:139` | `connecting`, `listening` or `finishing`, as the UI sees it |
| `ds.ended` | `ended`, `:138` | `finish` has run and the outcome is settled |
| `ds.live` | `live`, `:140` | the WebRTC preview is in use |
| `ds.uploading` | `uploading`, `:141` | `upload` has started |
| `ds.stopSent` | `stopSent`, `:142` | the commit after stop went out |
| `ds.dc` | `dc` and its `readyState`, `:145` | the data channel |
| `ds.sdp` | the `/api/visits/transcribe/live` exchange in `connect`, `:309` | offer pending, answered or refused |
| `ds.speakers`, `ds.upload` | the fetches at `:252` and `:215` | none, in flight, or done |
| `ds.tConnect`, `ds.tTail`, `ds.tFinish`, `ds.tMax` | `connectTimer` `:288`, the tail timer `:341`, `finishTimer` `:347`, `maxTimer` `:351` | armed timers |
| `ds.tReq` | none today | the request timeout that `fixed` adds |
| `ds.item`, `ds.acked` | `transcript.items[id].state` and `stopAcked`, `live-transcript.ts:9` and `:14` | one transcript item and the commit acknowledgement |
| `ds.failedOnce` | none, model history | the item was once reported failed |
| `ds.outcome` | the value passed to `resolveOutcome`, `:200` | how the session ended |
| `ds.lock` | `microphoneHolder === holder`, `:73` and `:87` | the one-dictation lock |
| `ds.mic` | the stream's tracks, stopped at `:171` and `:346` | the microphone is in use |
| `bar`, `tFill` | `VoiceBarState.kind` in `voice-bar.ts:51`, and the abort timer in `voice-fill.ts:157` | the voice bar from listening to working to done |
| `clip.ui` | `recording` state, `useAudioRecorder.ts:31` | the button shows recording |
| `clip.gen` | `sessionRef`, `:36` | bumped by cancel |
| `clip.att`, `clip.attGen` | each pending `getUserMedia` call and the `session` it captured, `:95` and `:98` | up to two permission requests |
| `clip.rec`, `clip.timer` | `recorderRef`, `stopTimerRef`, `:32` and `:34` | a running MediaRecorder and its 40 minute cap |

## Model to code

| Model | Code |
| --- | --- |
| `Started` | `startDictationSession` after `getUserMedia` resolved: lock taken `dictation-session.ts:86`, `recorder.start` `:130`, `connect` `:360` |
| `LeaveLive` | `leaveLive`, `:176` |
| `Finish` | `finish`, `:192`. Clears every timer, leaves live, stops capture, releases the lock |
| `Upload` | `upload`, `:203`. The fetch at `:215` carries only the dispose signal and no timeout |
| `Demote` | `demote`, `:237`. During finishing it goes straight to `upload` at `:240` |
| `FinishLive` | `finishLive`, `:249`. Full-transcript ends at once. Patient-preferred posts to `/transcribe/speakers` at `:252`, again with no timeout |
| `SettleIfDone` | `settleIfDone`, `:267`, with `settlement` in `live-transcript.ts:98` |
| `AfterMessage` | `onLiveMessage`, `:277`. Settles only while finishing, `:284` |
| `Stop`, `YouStop` | `stop`, `:329`. Upload when not live `:337`, demote when the channel is not open `:338`, else the 300 ms tail `:341` |
| `YouDiscard` | `dispose`, `:370`. Escape in the voice bar (`VoiceBar.tsx:295`), page change, or unmount (`useSpeechToTextRecorder.ts:48`) |
| `ServerAnswersOffer` | `connect` after the `/live` fetch: ok `:325`, 401, 403 or 503 ends in an error `:317`, anything else demotes `:321` and `:324` |
| `ChannelOpens` | `channel.onopen`, `:294` |
| `ChannelDrops` | `channel.onclose` `:301` and `connectionState === 'failed'` `:303` |
| `ServerHearsWords` | a `delta` or `committed` event creates the item, `live-transcript.ts:71` and `:77` |
| `ServerAcksCommit` | `committed` or `commit_empty` after the stop commit, `:73` and `:76` |
| `ServerCompletesItem` | `completed`, `live-transcript.ts:81`. Unguarded: it also turns a failed item final |
| `ServerFailsItem` | `failed`, `live-transcript.ts:84`. Guarded: a final item stays final |
| `ServerSendsFatal` | a `fatal` event demotes, `dictation-session.ts:281` |
| `ServerAnswersUpload` | the upload's response, `:221` to `:231` |
| `ServerAnswersSpeakers` | the speaker split's response or its fallback, `:259` to `:264` |
| `ConnectTimerFires`, `TailTimerFires`, `FinishTimerFires`, `MaxTimerFires` | the four timers above |
| `RequestTimerFires` | `fixed` only. An abort timer armed with each transcription request |
| `SessionStep` with `bar` | `useSpeechIntoBox.listen` returns the text `VoiceBar.tsx:167`, then `speak` calls `send` `:331`, which dispatches `send` and arms the 240 second abort in `requestVoiceFillFromText`, `voice-fill.ts:155` |
| `ServerAnswersFill`, `FillTimerFires` | the voice fill reply, or the abort at `voice-fill.ts:157` turned into `request-failed`, `VoiceBar.tsx:257` |
| `YouStartClip` | `toggle` with no recording, `useAudioRecorder.ts:94` |
| `YouStopClip` | `toggle` with the same key, `:77`, then `onstop` `:116` |
| `YouCancelClip` | `cancel`, `:68`, wired to Escape through `useCancelOnEscape`, `VoiceFillButton.tsx:100` |
| `BrowserGrantsMic` | `getUserMedia` resolves. A stale grant is dropped by the session check at `:101` |
| `BrowserDeniesMic` | `getUserMedia` rejects. The catch at `:132` calls `release` and `setRecording(null)` with no session check |
| `ClipTimerFires` | the 40 minute cap, `:129` |

## Rules and verdicts

| Rule | Kind | code | Sentence |
| --- | --- | --- | --- |
| `TypeOK` | invariant | holds | Every variable stays within its type. |
| `LockAgrees` | invariant | holds | The one-dictation lock is held exactly while the session has not ended. |
| `MicOffWhenEnded` | invariant | holds | An ended dictation has stopped the microphone. |
| `LiveAgrees` | invariant | holds | While the live preview runs, the data channel exists and no transcription request is out. |
| `OneTranscription` | invariant | holds | A dictation sends the speaker split or the recording upload, never both. |
| `ItemFailureSticks` | invariant | breaks | A transcript piece the server reported as failed stays failed, so the recording is transcribed instead. |
| `ClipShownWhileRecording` | invariant | breaks | Whenever a voice fill clip is recording, its button shows that it is recording. |
| `LeavesFinishing` | property | breaks | A dictation that shows Finishing ends with no user action, even if the server never answers. |
| `LockReleased` | property | breaks | The one-dictation lock is released with no user action, so the next dictation can start. |
| `MicReleased` | property | holds | The microphone is released with no user action. |
| `BarLeavesWorking` | property | holds | The voice bar leaves Working it out with no user action, even if the server never answers. |

### What breaks today

**A stalled transcription holds the session and the lock.** After stop, `upload` and `finishLive` post with only the dispose signal. `stop` disarms the maximum-duration timer, and `leaveLive` disarms the finish timer. If the server never answers, the session stays in finishing and keeps `microphoneHolder`. The field shows Transcribing and ignores further presses. Every other dictation on the page is refused with "Another dictation is already running. Stop it first." Only leaving the page or unmounting the component ends it. The physical microphone is released, because `upload` stops the tracks, so `MicReleased` holds. The shortest path is to stop while the live preview is still opening.

**A clip records while its button shows idle.** The user presses the voice fill button, the permission prompt opens, the user presses Escape and presses the button again. If the first request is then denied and the second granted, the stale catch at `useAudioRecorder.ts:132` sets `recording` to null, and the second grant still starts the recorder because its session number is current. The microphone records with the button idle. After 40 minutes the cap stops it, and `onRecorded` sends the clip to voice fill, which fills the form (`useVoiceFill.ts:68`). In the other order, a stale denial tears down the recording that is running and shows "Microphone access denied". The chart shows that as the arrow from Clip recording to idle. One guard fixes both.

**A failed transcript piece can become final.** `completed` replaces any item with a final one, while `failed` leaves a final item alone. If the server sends `completed` after `failed` for the same item while the user is still speaking, the session later inserts the live text instead of transcribing the recording. This needs the server to send events out of protocol order. The OpenAI realtime API reports `failed` as the end of an item. Treat this as a missing defensive guard of low severity.

### Fixed mode

`fixed` adds three guards and every rule holds.

- An abort timer on the `/api/visits/transcribe` upload and the `/api/visits/transcribe/speakers` split. A timed-out upload ends in an error. A timed-out split falls back to the raw live text, as `finishLive` already does on any other failure.
- `completed` leaves a failed item failed.
- The catch in `useAudioRecorder.toggle` returns when `session !== sessionRef.current`, as the success path already does.

### Negative controls

| Mode | Mistake | Breaks |
| --- | --- | --- |
| `typeProbe` | the outcome starts outside its type | `TypeOK` |
| `noRequestTimeout` | the transcription requests have no timeout, as today | `LeavesFinishing`, `LockReleased` |
| `noMaxTimer` | the 10 minute cap is dropped | `MicReleased`, `LockReleased`. `LeavesFinishing` still holds |
| `noFillTimeout` | `requestVoiceFillFromText` loses its 240 second abort | `BarLeavesWorking` |
| `noReleaseOnFinish` | `finish` forgets `release()` | `LockAgrees`, `LockReleased` |
| `noStopCapture` | `finish` forgets `stopCapture()` | `MicOffWhenEnded`, `MicReleased` |
| `noLeaveLiveOnSettle` | `settleIfDone` skips `leaveLive` before the speaker split | `LiveAgrees`, `OneTranscription` |
| `completedOverwritesFailure` | `completed` turns a failed item final, as today | `ItemFailureSticks` |
| `staleDenialClears` | a stale microphone denial clears the clip, as today | `ClipShownWhileRecording` |

## Fairness

`Spec` puts weak fairness on timers only. Each is a `setTimeout` that fires with nobody acting.

| Clause | Real-world reason |
| --- | --- |
| `WF_vars(ConnectTimerFires)` | the 10 second `connectMs` timer |
| `WF_vars(TailTimerFires)` | the 300 ms tail before the commit |
| `WF_vars(FinishTimerFires)` | the 8 second `finishMs` timer |
| `WF_vars(MaxTimerFires)` | the 10 minute `maxMs` cap. The voice bar passes 40 minutes |
| `WF_vars(RequestTimerFires)` | the request timeout that `fixed` adds. Never enabled in `code` |
| `WF_vars(FillTimerFires)` | the 240 second abort in `requestVoiceFillFromText` |
| `WF_vars(ClipTimerFires)` | the 40 minute clip cap in `useAudioRecorder` |

No fairness sits on the server, OpenAI, the WebRTC peer, the browser's permission prompt or the user. Each may never act. That is why `LeavesFinishing` breaks in `code` and why `BarLeavesWorking` holds there: the bar has a timer and the session does not.

## Replays

`frontend/__tests__/formal/dictation.formal-replay.test.ts` replays each break against the real hooks and session. It stubs only `getUserMedia`, `MediaRecorder`, `RTCPeerConnection` and `fetch`, and runs the clock with jest fake timers. The stalled `fetch` stub rejects when its signal aborts, as a real fetch does.

- `LeavesFinishing` and `LockReleased` drive `useSpeechToTextRecorder` with the patient-preferred setting. The steps are start, press again while the preview is opening, then every timer. The `today:` tests see Transcribing still shown with the upload in flight, and a second `startDictationSession` refused as `busy`.
- `ItemFailureSticks` follows the TLC path through the same hook with the full-transcript setting the voice bar uses. The item state is private to the session, so the test then stops, lets the tail timer commit, and acknowledges the commit. The outcome shows which text was inserted.
- `ClipShownWhileRecording` drives `useAudioRecorder` through the six-step TLC path.

For both liveness breaks TLC's path has two steps: the session opens, and the user presses stop while the live preview is still opening. The replay follows it.

## What the model leaves out

- The steps before the session exists: `getUserMedia` and the `MediaRecorder` constructor failing. `startDictationSession` releases the lock in its catch at `:92`. The hook's `stopRequested` flag for a press while the microphone is opening is also left out.
- A browser without `RTCPeerConnection`. It starts in recorded-only listening, which the model reaches by demoting.
- More than one transcript item, delta text, and a final item with empty text. A recording under 1000 bytes ends as `empty` before any fetch. The model folds that into the upload's answers.
- Two dictation sessions at once. The model has one session and its lock. The replay shows the refusal a second session gets.
- `useAudioRecorder` does not take `microphoneHolder`, so a clip and a dictation can use the microphone together. The model keeps the surfaces apart.
- The voice bar's draft, applied and confirming states, typed sends, and page changes. The bar goes from listening to working to done. The bar has no Escape while working (`VoiceBar.tsx:357`), so working ends only by reply, abort or page change.
- The 401, 403 and 503 answers to the live offer end the dictation with an error instead of uploading the recording. The model includes that exit and does not judge it.
- `MediaRecorder.onstop` is taken to fire promptly after `stop()`. The upload awaits it at `:208`.

## Run

```sh
export TLA2TOOLS=/path/to/tla2tools.jar
python3 verification/state-machines/verify.py dictation
python3 verification/state-machines/chart.py dictation
cd frontend && npx jest --ci __tests__/formal/dictation.formal-replay.test.ts
```
