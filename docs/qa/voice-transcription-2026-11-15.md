# Voice transcription integration check

Run on 15 November 2026 against a local stack: the Next.js frontend on port 3000, the NestJS backend on port 4000, a throwaway database `cms_voice_test_20261115` on the local Postgres (schema pushed with `prisma db push`, users from `src/scripts/seed-once.ts`), and the real OpenAI account from `backend/.env`. Audio fixtures were an 18-second synthetic doctor–patient exchange (macOS `say`, three voices) rendered as WAV, WebM/Opus and M4A, plus 3 seconds of silence. The browser side used the built-in browser with `getUserMedia` replaced by a Web Audio stream that plays the fixture.

## Result

With the default configuration (`OPENAI_TRANSCRIBE_MODEL` unset, so `gpt-4o-transcribe`) **every recording fails with HTTP 400**. OpenAI rejects the request before transcribing. With `OPENAI_TRANSCRIBE_MODEL=whisper-1` the transcript is accurate for all three formats, but speaker separation never populates, and in the dev build the visit form never shows the returned text.

| Layer | Default model | whisper-1 override |
| --- | --- | --- |
| Unit tests (`speech-to-text.test.ts`, 4 tests) | pass | pass |
| Auth guard on `POST /visits/transcribe` | 401 without cookie | 401 without cookie |
| Empty upload | `{"text":""}` | `{"text":""}` |
| WebM → WAV conversion (ffmpeg) | works | works |
| WAV / WebM / M4A transcription | 400 | accurate text, numbers and units kept |
| Diarization (`segments`, `speakers`) | not reached | empty, OpenAI 400 |
| `/test-transcribe` page in browser | not run | transcript rendered, 201 |
| Visit form mic button (Chief Complaints) | not run | upload succeeds, text never applied |

## Findings

1. **`response_format=verbose_json` is rejected for `gpt-4o-transcribe`.** `visits.controller.ts` always appends it (the comment says unsupported values are safe to ignore). OpenAI now answers `response_format 'verbose_json' is not compatible with model 'gpt-4o-transcribe-api-ev3'. Use 'json' or 'text' instead.` The controller maps that to a 400 with "Speech transcription rejected the recording", so users see a retry prompt for every clip. Only `whisper-1` accepts `verbose_json`.
2. **The diarization call is always rejected.** The chat request uses `json_schema` with `strict` structured output, and OpenAI requires `additionalProperties: false` on every object in the schema; the `DiarizationSchema` omits it. The controller logs the warning and returns empty `segments` and `speakers`, so `patient-preferred` fields in `PrescriptionBuilder` silently fall back to the full transcript. This fails for all models.
3. **The recorder hook drops results under React Strict Mode.** `useSpeechToTextRecorder` sets `mountedRef.current = false` in its effect cleanup and never sets it back to `true` when the effect re-runs. Next 15 app router enables Strict Mode by default in development, which double-invokes effects, so after mount the flag is permanently `false`: the upload goes out and returns 201 with the transcript, but `applyText` and the state resets are skipped. Observed in the visit form: the Chief Complaints field stayed empty and the button stayed on "Stop voice input". A production build was not tested; it should not double-invoke effects.
4. **The visit form's mic button remounts on every render.** `MedicalVisitForm` defines `VoiceButton` with `useCallback`, which yields a new component type whenever its dependencies change, and `startVoiceInput` changes on every render because `resolveText`/`applyText` are inline. A MutationObserver saw the button node replaced twice in 2.5 seconds while recording, which drops keyboard focus mid-recording.

Smaller notes: `whisper-1` transcribed 3 seconds of silence as "Thank you for watching." (the empty-transcript guard did not trigger); `prisma migrate deploy` on a fresh database stops because `backend/prisma/migrations/20260614_add_drug_price_change_requests/` has no `migration.sql`.

## Cleanup

Servers were stopped after the run. The test database remains and can be removed with `dropdb -h localhost -p 5432 cms_voice_test_20261115`. No application code was changed.
