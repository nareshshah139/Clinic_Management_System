# Dictation and voice capture

This model covers voice capture in the browser on two surfaces.

- **Field dictation.** A form field's mic button runs `useSpeechToTextRecorder`, which runs one dictation session. The model gives this surface the patient-preferred setting, so a live transcript goes through the speaker split.
- **Voice bar.** The dashboard voice bar runs the same dictation session with the full-transcript setting. It then sends the text to voice fill and shows "Working it out..." until the reply.
`Init` picks one surface. The two never interact in the model. They share every session state, so the chart draws them as one machine.

The voice fill button on the intake and add-item forms (`useVoiceFill.ts`) runs the same session with the full-transcript setting, then sends one fill request, as the voice bar does. The model does not draw it separately.

## Where the state lives

The dictation session has no status column. `dictation-session.ts` spreads its lifecycle over closure variables, armed timers and a module-level lock. The spec keeps them under their code names in the record `ds`.

| Model field | Code | Meaning |
| --- | --- | --- |
| `ds.phase` | `phase`, `dictation-session.ts:140` | `connecting`, `listening` or `finishing`, as the UI sees it |
| `ds.ended` | `ended`, `:139` | `finish` has run and the outcome is settled |
| `ds.live` | `live`, `:141` | the WebRTC preview is in use |
| `ds.uploading` | `uploading`, `:142` | `upload` has started |
| `ds.stopSent` | `stopSent`, `:143` | the commit after stop went out |
| `ds.dc` | `dc` and its `readyState`, `:146` | the data channel |
| `ds.sdp` | the `/api/visits/transcribe/live` exchange in `connect`, `:319` | offer pending, answered or refused |
| `ds.speakers`, `ds.upload` | the fetches at `:262` and `:224` | none, in flight, or done |
| `ds.tConnect`, `ds.tTail`, `ds.tFinish`, `ds.tMax` | `connectTimer` `:298`, the tail timer `:351`, `finishTimer` `:357`, `maxTimer` `:361` | armed timers |
| `ds.tReq` | the timer `limitRequest` arms, `:205` | the request timeout on the upload and the speaker split |
| `ds.item`, `ds.acked` | `transcript.items[id].state` and `stopAcked`, `live-transcript.ts:9` and `:14` | one transcript item and the commit acknowledgement |
| `ds.failedOnce` | none, model history | the item was once reported failed |
| `ds.outcome` | the value passed to `resolveOutcome`, `:201` | how the session ended |
| `ds.lock` | `microphoneHolder === holder`, `:74` and `:89` | the one-dictation lock |
| `ds.mic` | the stream's tracks, stopped at `:172` and `:356` | the microphone is in use |
| `bar`, `tFill` | `VoiceBarState.kind` in `voice-bar.ts:51`, and the abort timer in `voice-fill.ts:149` | the voice bar from listening to working to done |

## Model to code

| Model | Code |
| --- | --- |
| `Started` | `startDictationSession` after `getUserMedia` resolved: lock taken `dictation-session.ts:87`, `recorder.start` `:131`, `connect` `:370` |
| `LeaveLive` | `leaveLive`, `:177` |
| `Finish` | `finish`, `:193`. Clears every timer, leaves live, stops capture, releases the lock |
| `Upload` | `upload`, `:211`. It arms the request timeout at `:222` before the fetch at `:224` |
| `Demote` | `demote`, `:246`. During finishing it goes straight to `upload` at `:250` |
| `FinishLive` | `finishLive`, `:258`. Full-transcript ends at once. Patient-preferred arms the request timeout at `:260` and posts to `/transcribe/speakers` at `:262` |
| `SettleIfDone` | `settleIfDone`, `:277`, with `settlement` in `live-transcript.ts:98` |
| `AfterMessage` | `onLiveMessage`, `:287`. Settles only while finishing, `:294` |
| `Stop`, `YouStop` | `stop`, `:339`. Upload when not live `:347`, demote when the channel is not open `:348`, else the 300 ms tail `:351` |
| `YouDiscard` | `dispose`, `:380`. Escape in the voice bar (`VoiceBar.tsx:294`), page change, or unmount (`useSpeechToTextRecorder.ts:48`) |
| `ServerAnswersOffer` | `connect` after the `/live` fetch: ok `:335`, 401, 403 or 503 ends in an error `:327`, anything else demotes `:331` and `:334` |
| `ChannelOpens` | `channel.onopen`, `:304` |
| `ChannelDrops` | `channel.onclose` `:311` and `connectionState === 'failed'` `:313` |
| `ServerHearsWords` | a `delta` or `committed` event creates the item, `live-transcript.ts:71` and `:77` |
| `ServerAcksCommit` | `committed` or `commit_empty` after the stop commit, `:73` and `:76` |
| `ServerCompletesItem` | `completed`, `live-transcript.ts:81`. It leaves a failed item failed, `:82` |
| `ServerFailsItem` | `failed`, `live-transcript.ts:84`. Guarded: a final item stays final |
| `ServerSendsFatal` | a `fatal` event demotes, `dictation-session.ts:291` |
| `ServerAnswersUpload` | the upload's response, `:230` to `:240` |
| `ServerAnswersSpeakers` | the speaker split's response or its fallback, `:269` to `:274` |
| `ConnectTimerFires`, `TailTimerFires`, `FinishTimerFires`, `MaxTimerFires` | the four timers above |
| `RequestTimerFires` | the `limitRequest` timer, `:206`. It finishes with the timeout outcome, then aborts the request |
| `SessionStep` with `bar` | `useSpeechIntoBox.listen` returns the text `VoiceBar.tsx:166`, then `speak` calls `send` `:330`, which dispatches `send` and arms the 240 second abort in `requestVoiceFillFromText`, `voice-fill.ts:147` |
| `ServerAnswersFill`, `FillTimerFires` | the voice fill reply, or the abort at `voice-fill.ts:149` turned into `request-failed`, `VoiceBar.tsx:256` |

## Rules and verdicts

| Rule | Kind | before | code | Sentence |
| --- | --- | --- | --- | --- |
| `TypeOK` | invariant | holds | holds | Every variable stays within its type. |
| `LockAgrees` | invariant | holds | holds | The one-dictation lock is held exactly while the session has not ended. |
| `MicOffWhenEnded` | invariant | holds | holds | An ended dictation has stopped the microphone. |
| `LiveAgrees` | invariant | holds | holds | While the live preview runs, the data channel exists and no transcription request is out. |
| `OneTranscription` | invariant | holds | holds | A dictation sends the speaker split or the recording upload, never both. |
| `ItemFailureSticks` | invariant | breaks | holds | A transcript piece the server reported as failed stays failed, so the recording is transcribed instead. |
| `LeavesFinishing` | property | breaks | holds | A dictation that shows Finishing ends with no user action, even if the server never answers. |
| `LockReleased` | property | breaks | holds | The one-dictation lock is released with no user action, so the next dictation can start. |
| `MicReleased` | property | holds | holds | The microphone is released with no user action. |
| `BarLeavesWorking` | property | holds | holds | The voice bar leaves Working it out with no user action, even if the server never answers. |

### What broke before the fix

The `before` mode keeps this behavior as a regression control.

**A stalled transcription held the session and the lock.** After stop, `upload` and `finishLive` posted with only the dispose signal. `stop` disarms the maximum-duration timer, and `leaveLive` disarms the finish timer. If the server never answered, the session stayed in finishing and kept `microphoneHolder`. The field showed Transcribing and ignored further presses. Every other dictation on the page was refused with "Another dictation is already running. Stop it first." Only leaving the page or unmounting the component ended it. The physical microphone was released, because `upload` stops the tracks, so `MicReleased` held. The shortest path is to stop while the live preview is still opening.

**A failed transcript piece could become final.** `completed` replaced any item with a final one, while `failed` left a final item alone. If the server sent `completed` after `failed` for the same item while the user was still speaking, the session later inserted the live text instead of transcribing the recording. This needs the server to send events out of protocol order. The OpenAI realtime API reports `failed` as the end of an item. It was a missing defensive guard of low severity.

## The fix

`code` now takes the same branches as `fixed`, and every rule holds. Two guards were added.

- `limitRequest`, `frontend/src/lib/dictation-session.ts:205`, arms a timer of `DICTATION_LIMITS.requestMs` (330 s, `:36`). When it fires it calls `finish` with the timeout outcome and then aborts the request, so the late rejection finds the session ended. `upload` arms it with an error outcome at `:222`, read as "Transcription took too long. Please dictate again." `finishLive` arms it with the raw live text at `:260`, the same fallback it uses on any other failure of the speaker split. `finish` clears it with every other timer. 330 s outlasts the 300 s `proxyTimeout` in `frontend/next.config.ts`, so the timer only ends a request that nothing would ever answer.
- `reduceTranscript` leaves a failed item failed on `completed`, `frontend/src/lib/live-transcript.ts:82`.

The `/api/visits/transcribe/live` offer needs no request timeout. The 10 second connect timer demotes the session if the offer is still out, and a demoted session that is finishing goes to the upload, which has the timeout.

### Fixed mode

`fixed` is the checked design the fix follows. It adds the same two guards.

- An abort timer on the `/api/visits/transcribe` upload and the `/api/visits/transcribe/speakers` split. A timed-out upload ends in an error. A timed-out split falls back to the raw live text, as `finishLive` already does on any other failure.
- `completed` leaves a failed item failed.

### Negative controls

| Mode | Mistake | Breaks |
| --- | --- | --- |
| `typeProbe` | the outcome starts outside its type | `TypeOK` |
| `noRequestTimeout` | the transcription requests have no timeout, as in `before` | `LeavesFinishing`, `LockReleased` |
| `noMaxTimer` | the 10 minute cap is dropped | `MicReleased`, `LockReleased`. `LeavesFinishing` still holds |
| `noFillTimeout` | `requestVoiceFillFromText` loses its 240 second abort | `BarLeavesWorking` |
| `noReleaseOnFinish` | `finish` forgets `release()` | `LockAgrees`, `LockReleased` |
| `noStopCapture` | `finish` forgets `stopCapture()` | `MicOffWhenEnded`, `MicReleased` |
| `noLeaveLiveOnSettle` | `settleIfDone` skips `leaveLive` before the speaker split | `LiveAgrees`, `OneTranscription` |
| `completedOverwritesFailure` | `completed` turns a failed item final, as in `before` | `ItemFailureSticks` |

## Fairness

`Spec` puts weak fairness on timers only. Each is a `setTimeout` that fires with nobody acting.

| Clause | Real-world reason |
| --- | --- |
| `WF_vars(ConnectTimerFires)` | the 10 second `connectMs` timer |
| `WF_vars(TailTimerFires)` | the 300 ms tail before the commit |
| `WF_vars(FinishTimerFires)` | the 8 second `finishMs` timer |
| `WF_vars(MaxTimerFires)` | the 10 minute `maxMs` cap. The voice bar and the voice fill button pass 40 minutes |
| `WF_vars(RequestTimerFires)` | the 330 second `requestMs` timer. Never enabled in `before` |
| `WF_vars(FillTimerFires)` | the 240 second abort in `requestVoiceFillFromText` |

No fairness sits on the server, OpenAI, the WebRTC peer, the browser's permission prompt or the user. Each may never act. That is why `LeavesFinishing` broke in `before` while `BarLeavesWorking` held there. The bar had a timer and the finishing session did not.

## Replays

`frontend/__tests__/formal/dictation.formal-replay.test.ts` replays each rule that broke in `before` against the real hooks and session. Every replay now passes as a plain test, so `REPLAYS` in `model.py` is empty. It stubs only `getUserMedia`, `MediaRecorder`, `RTCPeerConnection` and `fetch`, and runs the clock with jest fake timers. The stalled `fetch` stub rejects when its signal aborts, as a real fetch does.

- `LeavesFinishing` and `LockReleased` drive `useSpeechToTextRecorder` with the patient-preferred setting. The steps are start, then press again while the preview is opening. The clock then runs to 1 ms before `DICTATION_LIMITS.requestMs`, where the field still shows Transcribing and a second `startDictationSession` is refused as `busy`, and then 1 ms more, where the field has left Transcribing with the timeout message and a second dictation starts. Both fail if the timeout is removed or made longer.
- `ItemFailureSticks` follows the TLC path through the same hook with the full-transcript setting the voice bar uses. The item state is private to the session, so the test then stops, lets the tail timer commit, and acknowledges the commit. The inserted text shows that the recording was transcribed.
- The voice fill button's race at the permission prompt (Escape, then press again) is tested in `frontend/__tests__/hooks/voice-recording.test.tsx`: the second press is refused while the first request holds the lock, and the late grant is released.
- The speaker split's timeout has its own test in `frontend/__tests__/lib/dictation-session.test.ts`, "falls back to the full live text when the speaker split never answers".

For both liveness breaks TLC's path has two steps: the session opens, and the user presses stop while the live preview is still opening. The replay follows it.

## What the model leaves out

- The steps before the session exists: `getUserMedia` and the `MediaRecorder` constructor failing. `startDictationSession` releases the lock in its catch at `:93`. The hook's `stopRequested` flag for a press while the microphone is opening is also left out.
- A browser without `RTCPeerConnection`. It starts in recorded-only listening, which the model reaches by demoting.
- More than one transcript item, delta text, and a final item with empty text. A recording under 1000 bytes ends as `empty` before any fetch. The model folds that into the upload's answers.
- Two dictation sessions at once. The model has one session and its lock. The replay shows the refusal a second session gets.
- The voice bar's draft, applied and confirming states, typed sends, and page changes. The bar goes from listening to working to done. The bar has no Escape while working (`VoiceBar.tsx:356`), so working ends only by reply, abort or page change.
- The 401, 403 and 503 answers to the live offer end the dictation with an error instead of uploading the recording. The model includes that exit and does not judge it.
- `MediaRecorder.onstop` is taken to fire promptly after `stop()`. The upload awaits it at `:216`.

## Run

```sh
export TLA2TOOLS=/path/to/tla2tools.jar
python3 verification/state-machines/verify.py dictation
python3 verification/state-machines/chart.py dictation
cd frontend && npx jest --ci __tests__/formal/dictation.formal-replay.test.ts
```
