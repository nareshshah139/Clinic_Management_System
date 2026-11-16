# Module map

Five packages with disjoint files. Paths are repo-relative. "Create", "Change" and "Delete" refer to files in `the repo root`. Sketches for every new or changed core file are in `sketch/` at the same path (`*.delta.*` and `*-delta.ts` mark a change to an existing file).

## Dependency order

```
W (wire)                applied to the owner's working tree first
 ├── B (backend)        ─┐ wave 1, parallel
 └── C (bar core)       ─┤
                         ├── V (visit page and deletions)            wave 2, parallel,
                         └── P (appointments and inventory pages)    cut from a snapshot with W, B, C
```

- W goes into the working tree before any builder branches. `node_modules/@cms/shared-types` is a symlink to `../../shared-types` (checked with `ls -la node_modules/@cms`), so a worktree can only see a wire file that exists in the main checkout.
- V and P import only from C and W. Their tests mock the registry and transport, so they do not need B running.
- V owns the deletion of the old hook and helpers, because V removes their last importers.

## Commands shared by every package

- Frontend tests: `cd frontend && npx jest <paths>`.
- Frontend typecheck: `cd frontend && npx tsc --noEmit -p tsconfig.build.json`. Not plain `tsconfig.json`, which has 66 errors in `__tests__/` today.
- Backend tests: `cd backend && npx jest <path relative to src>`.
- Backend typecheck: `cd backend && npm run typecheck`.
- Contracts: `npx cc-check format <files>` and `npx cc-check list <files>` on every file the package creates or changes. These check syntax and discovery only; check the meaning by reading. Format: `@cc [owner:nareshshah139,label:<product|accessibility|security>] <id>`, one per `/** */` block, directly above its declaration.
- Do not run `git stash`. Do not call a real provider in any test.

---

## W. Wire contract (XS)

| Action | File |
|---|---|
| Create | `shared-types/src/voice.cjs` (final content: `sketch/shared-types/src/voice.cjs`) |
| Create | `shared-types/src/voice.d.cts` (final content: `sketch/shared-types/src/voice.d.cts`) |
| Change | `shared-types/package.json` (final content: `sketch/shared-types/package.json`; adds `./voice` to `exports` in the same shape as `./medicine-name`, and both files to `files`) |
| Create | `frontend/__tests__/lib/voice/wire.test.ts` |

**Regression test first:** `frontend/__tests__/lib/voice/wire.test.ts` imports `@cms/shared-types/voice` and asserts:
- every exported list and map is frozen;
- `VOICE_INTENTS` is exactly `visit-note`, `book-appointment`, `stock-count`;
- `VISIT_NOTE_SECTIONS` is exactly `chiefComplaints`, `examination`, `pastHistory`, `medicationHistory`;
- `VOICE_ROUTES` and `VOICE_TEXT_LIMITS` have one key per intent;
- `VOICE_STATUS_ROUTE` is `voice/status`.

It fails today because the subpath does not exist.

**Commands:** `cd frontend && npx jest __tests__/lib/voice/wire.test.ts && npx tsc --noEmit -p tsconfig.build.json`; `cd backend && npm run typecheck`; `npx cc-check format shared-types/src/voice.cjs` and `list`.

**Contracts:** `voice-wire-single-source` (product, on `VOICE_INTENTS` in `voice.cjs`).

**Must not touch:** `shared-types/src/index.ts`, `medicine-name.*`, `dist/`.

---

## B. Backend: transcription fixes, the voice module, the status route (M)

| Action | File |
|---|---|
| Change | `backend/src/modules/visits/visits.controller.ts`: judgement P1 items 1-5 and 7 on `transcribeAudio`; `@Roles` decorator line only on the three chunk routes; no status route; no deletion (`sketch/backend/src/modules/visits/visits.controller.transcribe-delta.ts`) |
| Change | `frontend/src/app/test-transcribe/page.tsx`: one line, `formData.append('diarize', 'true')` next to the file append (about `:219`) |
| Create | `backend/src/modules/voice/voice.module.ts`, `voice.controller.ts`, `voice.service.ts`, `voice-intents.ts`, `voice.dto.ts` |
| Change | `backend/src/app.module.ts`: import `VoiceModule`, add it to `fullFeatureModules` (`:52`) |
| Create | `backend/src/modules/visits/tests/visits.transcribe.spec.ts` (not `visits.controller.spec.ts`, which is in `testPathIgnorePatterns`) |
| Create | `backend/src/modules/voice/voice-intents.spec.ts`, `voice.service.spec.ts`, `voice.controller.spec.ts` |

**Regression tests first:**
- `visits.transcribe.spec.ts`, judgement P1 setup (`new VisitsController({} as any)`, temp `.wav`, `jest.spyOn(global, 'fetch')`):
  - (a) the first call's `response_format` is `json` for the default model;
  - (b) with no `diarize`, `fetch` is called once;
  - (c) with `diarize='true'`, the diarization schema has `additionalProperties: false` at all three levels;
  - (d) with `OPENAI_TRANSCRIBE_MODEL='whisper-1'`, `response_format` is `verbose_json`;
  - (e) with no key, it throws `ServiceUnavailableException` and `fetch` is never called;
  - (f) `context='plain'` sends the plain prompt;
  - (g) a fetch that never resolves, with `OPENAI_TRANSCRIBE_TIMEOUT_MS=10`, rejects with a 503 (not 408);
  - (h) `Reflect.getMetadata(ROLES_KEY, …)` on `transcribeAudio` and on each of the three chunk handlers excludes PATIENT.
- `voice-intents.spec.ts`:
  - `segmentTranscript('Itching for two weeks. On exam, papules.')` gives two trimmed slices of the input;
  - the visit-note `sanitize` maps an out-of-range index, a duplicate and a missing index to `unsorted`, and never emits text that is not a sentence;
  - a section outside the four keys (for example `diagnosis`) becomes `unsorted`;
  - the appointment `sanitize` drops `patientId`, an extra key, `hour: 37` and a `patientName` that is not in `heard`.
- `voice.service.spec.ts`:
  - with no key, `parse` throws 503 with `VOICE_NOT_CONFIGURED_MESSAGE` and the injected `chat` is never called;
  - an `AbortError` from `chat` becomes a 503 with `VOICE_UNAVAILABLE_MESSAGE` (decision 11), and so does a non-2xx;
  - the logger output never contains the transcript;
  - `heard` equals the trimmed request text;
  - 8,001 characters for `visit-note` and 501 for `book-appointment` give 400;
  - `status()` returns `{ configured: false }` without a key and `{ configured: true }` with one, without calling `chat`.
- `voice.controller.spec.ts` (candidate 1's version, decision 7):
  - the roles and permissions metadata on each parse route deep-equals the metadata on `VisitsController.prototype.update`, `AppointmentsController.prototype.create` and `DrugController.prototype.createInventoryChangeRequests`;
  - `status` has roles metadata that excludes PATIENT;
  - each parse route has `Reflect.getMetadata('THROTTLER:LIMIT' + 'default', handler) === 20` and `'THROTTLER:TTL' + 'default'` equal to `60000`, and its tracker returns `user:<id>` for a request with `user.id`;
  - `status` has no throttle override.

**Commands:** `cd backend && npx jest modules/voice modules/visits/tests/visits.transcribe.spec.ts && npm run typecheck`; `cd frontend && npx tsc --noEmit -p tsconfig.build.json` (for the test page line); `npx cc-check format` and `list` on the five voice files and `visits.controller.ts`.

**Contracts:**

| Id | Label | Where | Obligation |
|---|---|---|---|
| `transcription-format-per-model` | product | `transcriptionResponseFormat` | `verbose_json` only for `whisper-1` |
| `diarization-opt-in` | product | `transcribeAudio` | Speaker separation only with `diarize=true` |
| `transcription-timeout` | product | `transcribeAudio` | Abort after the timeout; 503 with the "took too long" copy |
| `transcription-staff-only` | security | `transcribeAudio` | Patients cannot call any `/visits/transcribe` route |
| `voice-parse-same-door` | security | `VoiceController` | Each parse route has its form write's roles and permissions; no route writes |
| `voice-status-free` | security | `VoiceController.status` | Refuses PATIENT; answers for voice and text; no provider call |
| `voice-parse-throttled` | security | `VOICE_PARSE_THROTTLE` | 20 per 60 s per user on each parse route |
| `voice-parse-no-key` | product | `VoiceService.parse` | 503 without a key, no provider call |
| `voice-parse-unavailable-503` | product | `VoiceService.parse` | Timeout, non-2xx and bad JSON become 503; no transcript in logs |
| `voice-parse-spoken-only` | security | `VoiceService.parse` | Whitelisted response; no ids; names are substrings of the transcript |
| `visit-note-sentences-verbatim` | product | `segmentTranscript` | Ordered verbatim slices; the model only labels indexes |

**Must not touch:** `auth.module.ts`, `auth.controller.ts` (the throttler is already global there; do not add a second `ThrottlerModule.forRoot` or `APP_GUARD`), the chunk route bodies and `ensureTranscribeSessionDir` (`:188`), `GET transcribe/health` (`:1054`), the transcription response shape and missing-key copy (`:716-718`), the Prisma schema, any frontend file except the one test-page line.

---

## C. Bar core (L)

| Action | File |
|---|---|
| Create | `frontend/src/lib/voice/types.ts`, `machine.ts`, `intents.ts`, `spoken-time.ts`, `lookups.ts`, `transport.ts`, `copy.ts`, `testing.ts` |
| Create | `frontend/src/lib/working-hours.ts` (`workingHoursOn`, extracted from `AppointmentsCalendar.tsx:117-142`; P switches the calendar to it) |
| Create | `frontend/src/components/voice/VoiceBarProvider.tsx`, `voice-bar-store.ts`, `VoiceBar.tsx`, `ProposalReview.tsx`, `visual-viewport.ts` |
| Change | `frontend/src/components/layout/dashboard-layout.tsx`: wrap in `VoiceBarProvider`; root class `h-screen` (`:116`) becomes `h-[var(--voice-shell-height,100dvh)] mt-[var(--voice-shell-offset,0px)]`; `<VoiceBar />` after `<main>` (`:159-161`) |
| Change | `frontend/src/app/dashboard/layout.tsx`: add `export const viewport` (decision 5; not the root layout) |
| Create | tests under `frontend/__tests__/lib/voice/` and `frontend/__tests__/components/voice/` listed below |

**Regression test first:** `frontend/__tests__/components/voice/VoiceBar.strict-mode.test.tsx`. It renders `<React.StrictMode><VoiceBarProvider><TestPage/><VoiceBar/></VoiceBarProvider></React.StrictMode>` with a fake `Transport` and fake `Lookups` (from `lib/voice/testing.ts`). `TestPage` registers a `visit-note` capability whose `apply` is a jest mock.
1. Press the mic, then Stop.
2. Resolve `transcribe` with "Itching for two weeks."
3. Resolve `parse` with one `chiefComplaints` item.
4. Assert the card shows `Heard: "Itching for two weeks."`.
5. Click Add to form and assert `apply` was called once with `sections: { chiefComplaints: ['Itching for two weeks.'] }`.
6. Second case: start recording, unmount and remount the provider, resolve the old `transcribe`. Assert the bar is idle with no draft and no failure.

Written against today's hook in the same shape, step 5 fails (`useSpeechToTextRecorder.ts:61-66`).

**Then, in order:**
- `__tests__/lib/voice/machine.test.ts` (pure `step`):
  - a `transcribed` event with an old attempt id after `escape` changes nothing and emits no command;
  - `escape` while listening emits `abort` and `restore-focus`, never `finish-recording`;
  - a failed `interpret` puts the heard text back in the composer, with `retry: 'interpret'`; `retry` then emits `interpret` with that text;
  - a failed transcription with `retry: 'transcribe'` keeps the attempt in the notice; `retry` emits `transcribe` with the same attempt id and no `open-mic`; a capability change before the retry emits `release-audio`;
  - `failed(not-configured)` sets `configured=false`; a later `send`, `mic` or `retry` emits nothing but the not-configured notice;
  - `status(true)` after `configured=false` leaves it false;
  - **scope (decision 3):** a `capability` event with the same registrant and intent but a new scope, during `listening`, `interpreting` and `review`, emits `abort` and gives idle with notice `page-changed`; in idle it drops `lastUndo`, and a following `undo` emits nothing;
  - **unsorted (decision 2):** a visit-note review with two placed and one unsorted item: `apply` emits `apply` with only the placed sections; `applied` returns to `review` holding only the unsorted item, with `added` set; `dismiss` then gives the applied notice with `leftOut: 1` and `canUndo: true`;
  - with zero placed items `apply` emits nothing;
  - `place(k, 'unsorted')` moves a placed line back;
  - `edit-heard` is ignored once `added` is non-empty;
  - **no undo (decision 9):** after a booking or stock `applied`, `lastUndo` is null and `undo` emits nothing;
  - `apply` after a registration change emits no `apply` command and gives `page-changed`;
  - `apply-failed(threw)` keeps the review with `applyFailed: true`;
  - the first non-null `capability` with `configured === null` emits `fetch-status` once; a second capability event does not.
- `__tests__/lib/voice/intents.test.ts` (fake lookups, `fixedClock()` at 2026-11-16 IST):
  - an unspoken doctor with two doctors gives `choose`, never the first doctor and never `shownDoctorId`;
  - one doctor in the clinic gives `resolved` via `only-option`;
  - zero patients gives `unresolved` and a partial prefill with `{ kind: 'search' }`;
  - choosing a doctor re-resolves the time against that doctor's hours;
  - a doctor without working hours falls back to `defaultHours`;
  - two stock rows on one batch gives `choose`;
  - a unit mismatch gives a `search` prefill;
  - **decision 6:** a count equal to `currentStock` gives count unresolved with `COPY.stock.matchesShelf` and a null prefill; zero rows gives a `search` prefill;
  - **decision 5:** a count of 4 with `heldStock: 6` gives count unresolved with "6 strip are set aside for pending sales. The count cannot be lower than that." and a null prefill;
  - all-null parsed fields give `null` from `resolve` (nothing-found).
- `__tests__/lib/voice/spoken-time.test.ts`: "tomorrow" gives 2026-11-17; "Monday" gives 2026-11-23; 23:30 and 00:30 IST both give the IST next day; 4:30 within 9-18 gives 16:30; 9:30 within 8-22 is ambiguous; Feb 30 is invalid; "Dr Shah" with two Shahs is `many`; `normalizeBatch('b-12 ')` is `B12`; `sameStockUnit('strips','STRIP')` is `match`.
- `__tests__/lib/working-hours.test.ts`: `byDay` wins over top-level hours; a string metadata is parsed; missing values fall back.
- `__tests__/lib/voice/transport.test.ts` (replaces the deleted `speech-to-text.test.ts`): 403 gives `forbidden` (the old code said "session expired"); 401 gives `unauthorised` and the redirect helper runs; 429 gives `rate-limited` with the step; a 503 body naming `OPENAI_API_KEY` or "not set up" gives `not-configured`; a fetch `TypeError` gives `offline`; `fetchVoiceStatus()` twice makes one request to `/api/voice/status`; a network error resolves `{ configured: true }`; no request ever goes to `/visits/transcribe/health`.
- `__tests__/lib/voice/lookups.test.ts`: the module's exports are exactly `createLookups`, `doctorRef`, `patientRef`, `stockRowRef` (decision 4).
- `__tests__/lib/voice/testing-boundary.test.ts`: no file under `frontend/src` other than `lib/voice/testing.ts` itself imports `lib/voice/testing`.
- `__tests__/components/voice/visual-viewport.test.ts` (decision 10, pure `shellBoxFor`): unfocused gives null; iOS sample `{ innerHeight: 844, vvHeight: 508, vvOffsetTop: 0 }` focused gives `{ heightPx: 508, offsetTopPx: 0 }`; Android sample with equal heights gives null; a 40 px difference gives null; `vvOffsetTop: 120` gives `offsetTopPx: 120`.
- `__tests__/components/voice/VoiceBar.states.test.tsx`: renders each phase and notice and asserts the exact `COPY` and `FAILURE_COPY` strings; a failure with `retry: null` renders no Try again; not-configured disables the text box and mic, and a send shows the same line with no `parse` call; after a booking apply there is a Done button and no Undo.
- `__tests__/components/voice/VoiceBar.keyboard.test.tsx`: `Ctrl+/` from inside another textarea focuses the bar's text box; `Escape` on a draft returns focus to that textarea; `Enter` sends; `Shift+Enter` adds a newline and does not send; `Escape` while listening discards and `transcribe` is never called; the Apply row is outside the scroll container; the scroll container has `max-h-[45dvh]` and `max-h-[30dvh]` while the text box has focus.
- `__tests__/components/voice/voice-bar-store.test.ts`: typed text and transcribed text reach `parse` identically; a transcription retry calls `transcribe` twice with the same blob and `openMic` once; `reset()` aborts the live signal and cancels the mic; an apply whose registry key no longer matches sends `apply-failed(page-changed)` and does not call `apply`.

**Commands:** `cd frontend && npx jest __tests__/lib/voice __tests__/lib/working-hours.test.ts __tests__/components/voice && npx tsc --noEmit -p tsconfig.build.json`; `npx cc-check format` and `list` on every file in the table.

**Contracts:**

| Id | Label | Where | Obligation |
|---|---|---|---|
| `voice-bar-stale-results-dropped` | product | `step` | Only live-attempt results change the bar |
| `voice-bar-apply-needs-review` | product | `step` | Prefill only from review, no choice open, at least one value placed, to the original key; unsorted lines stay until placed or dismissed |
| `voice-bar-scope-bound` | product | `step` | A registrant, intent or scope change discards the attempt and the pending undo |
| `voice-bar-not-configured-sticky` | product | `step` | One plain refusal for voice and text; no retry or poll; no Try again when retry is null |
| `voice-intent-table-complete` | product | `INTENTS` | Intent behaviour lives only in the table |
| `visit-note-verbatim-sections` | product | `visitNotePrefill` | Transcript sentences only; only placed items |
| `voice-booking-no-guess` | product | `resolveBooking` | Single matches only; no first or shown doctor by default |
| `voice-count-exact-batch` | product | `resolveStockCount` | One row by batch and unit, else search only |
| `voice-count-dialog-rules` | product | `resolveStockCount` | Equal, below set-aside and fractional counts give no prefill |
| `voice-date-ist` | product | `resolveSpokenDate` | IST calendar; past and impossible dates do not resolve |
| `voice-time-unambiguous` | product | `resolveSpokenTime` | One reading in hours, otherwise a choice |
| `voice-refs-from-records` | security | `doctorRef` in `lookups.ts` | Ids branded only from API records; no string-branding export |
| `voice-failure-copy` | accessibility | `toFailure` | One Failure per transport outcome; 403 is not "session expired" |
| `voice-status-once` | product | `fetchVoiceStatus` | Once per page load; never the paid health route |
| `voice-copy-single-source` | product | `SECTION_LABELS` in `copy.ts` | Every visible string defined here |
| `voice-capability-registration` | product | `useVoiceCapability` | One capability or null; identity is (registrant, intent, scope); latest apply used |
| `voice-bar-keyboard` | accessibility | `VoiceBar` | Enter, Shift+Enter, Escape with focus return, Ctrl/Cmd+/ |
| `voice-bar-never-covers` | accessibility | `VoiceBar` | In flow; Apply row outside scroll; 390 px with keyboard |
| `voice-bar-state-legible` | accessibility | `VoiceBar` | Polite status line, alert for failures, stable nodes |
| `voice-bar-above-keyboard` | accessibility | `shellBoxFor` | Shell sized to the visual viewport while the text box has focus and a keyboard overlays |
| `voice-bar-in-flow` | accessibility | `DashboardLayout` | Mounted once after main, never fixed |

**Must not touch:** anything in `components/visits`, `components/appointments`, `components/inventory`, `components/tours`; `hooks/useSpeechToTextRecorder.ts` and `lib/speech-to-text.ts` (V deletes them; C leaves them compiling); `app/layout.tsx`; `components/ui/*`; `globals.css`.

---

## V. Visit page and deletions (M)

| Action | File |
|---|---|
| Create | `frontend/src/components/visits/visit-note-voice.ts` |
| Change | `frontend/src/components/visits/PrescriptionBuilder.tsx`: replace the hook call, `applyText` and `VoiceButton` (about `:525-573`) with `useVisitNoteVoice({...}, clinicalScopeKey)`; delete both `<VoiceButton/>` uses (about `:4757`, `:5029`); drop now-unused imports (`useSpeechToTextRecorder`, `appendSpeechToText`, `pickSpeechToTextInsert`; `Mic`, `MicOff`, `Spinner` only if unused, grep first) |
| Change | `frontend/src/components/visits/MedicalVisitForm.tsx`: delete the dead hook call and `VoiceButton` (about `:1222-1272`) and its imports (about `:65-66`; `Mic`, `MicOff` at about `:15-16` only if unused; `Spinner` is still used) |
| Change | `frontend/src/components/tours/DoctorTour.tsx` (about `:1108-1131` and `:669`): the per-field mic steps become one step with `TOUR_COPY` from `@/lib/voice/copy` |
| Delete | `frontend/src/hooks/useSpeechToTextRecorder.ts` |
| Delete | `frontend/src/lib/speech-to-text.ts` |
| Delete | `frontend/__tests__/lib/speech-to-text.test.ts` (its subjects are gone; its newline case moves to the new test, its error cases to C's `transport.test.ts`) |
| Create | `frontend/__tests__/visits/visit-note-voice.test.ts`, `frontend/__tests__/visits/PrescriptionBuilder.voice.test.tsx` |

**Regression tests first:**
- `visit-note-voice.test.ts`:
  - `appendDraftText('line 1\nline 2', ['more'])` gives `'line 1\nline 2\nmore'` (today's `appendSpeechToText` gives `'line 1 line 2 more'`);
  - `appendDraftText('a  b', ['c'])` keeps the double space;
  - `applyVisitNote` with a `chiefComplaints` section calls `markTouched` once and returns `written: ['chiefComplaints']`;
  - `undo()` restores the exact earlier text and reports it as restored;
  - `undo()` leaves a field edited after apply alone and reports it as kept.
- `PrescriptionBuilder.voice.test.tsx` (mocks `@/components/voice/VoiceBarProvider` so `useVoiceCapability` records the capability; uses `reviewed()` from `lib/voice/testing.ts`):
  - the recorded capability has intent `visit-note` and `scope` equal to `JSON.stringify([patientId, visitId, doctorId])`;
  - re-rendering with another `patientId` changes the recorded `scope`;
  - no mic button renders in the Chief Complaints or Detailed Examination blocks;
  - applying into Chief Complaints and then clearing it by typing gives save payload `complaints: []` (touched flag, `:2731`);
  - applying into `examination` leaves the examination disclosure state unchanged (`examination-disclosure-preserves-data`, `:175`).

**Commands:** `cd frontend && npx jest __tests__/visits/visit-note-voice.test.ts __tests__/visits/PrescriptionBuilder.voice.test.tsx __tests__/visits && npx tsc --noEmit -p tsconfig.build.json`; `grep -rn "useSpeechToTextRecorder\|speech-to-text\|VoiceButton" frontend/src frontend/__tests__` must return nothing; `npx cc-check format` and `list` on `visit-note-voice.ts` and `PrescriptionBuilder.tsx`.

**Contracts:**

| Id | Label | Where | Obligation |
|---|---|---|---|
| `visit-note-preserves-existing-text` | product | `appendDraftText` | Existing characters kept except trailing whitespace; Chief Complaints touched; disclosure untouched |
| `visit-note-undo-only-untouched` | product | `applyVisitNote` | Undo restores only fields unchanged since apply |
| `visit-note-scope-bound` | security | `useVisitNoteVoice` | Registers with `clinicalScopeKey` as scope |

`examination-disclosure-preserves-data` (`PrescriptionBuilder.tsx:175`) stays word for word.

**Must not touch:** autosave keys and draft shape in `PrescriptionBuilder`; `consultation-consent-form` and `visit-save-attempt-identity` in `MedicalVisitForm`; `lib/voice/*`, `components/voice/*`.

---

## P. Appointments and inventory pages (M)

| Action | File |
|---|---|
| Change | `frontend/src/components/appointments/AppointmentsCalendar.tsx`: `useVoiceCapability(...)` as in `usage.md` section 3; `voiceSummary` state passed to the dialog and cleared on close; extract `selectPatientRow(p)` from the row `onClick` and make each row a `<button type="button">`; the hours effect (`:117-142`) uses `workingHoursOn` |
| Change | `frontend/src/components/appointments/AppointmentBookingDialog.tsx`: `voiceSummary?: VoiceBookingSummary \| null`, the `role="note"` box from `VOICE_DIALOG_COPY`, Cancel focused first via `onOpenAutoFocus` |
| Change | `frontend/src/components/appointments/AppointmentBookingDialog.spec.tsx`: add the summary and focus cases |
| Create | `frontend/src/components/appointments/AppointmentsCalendar.voice.spec.tsx` |
| Change | `frontend/src/components/inventory/WorkspaceStock.tsx`: `useVoiceCapability(...)` as in `usage.md` section 4; widen `stockEdit` with `initialValue` and `voice`; pass them to the dialog (`:1374`) |
| Change | `frontend/src/components/inventory/StockEditDialog.tsx`: `initialValue?`, `voice?: { heard } \| null`, `expiryDate?` on `item`; the note from `VOICE_DIALOG_COPY`; with `voice` set, `autoFocus` moves from the count (`:72`) to the reason |
| Change | `frontend/__tests__/inventory/StockEditDialog.test.tsx` |
| Create | `frontend/__tests__/inventory/WorkspaceStock.voice.test.tsx` |

**Regression tests first** (both mock `@/components/voice/VoiceBarProvider` so `useVoiceCapability` records the capability, and use `reviewed()` and `fake*` from `lib/voice/testing.ts`):
- `AppointmentsCalendar.voice.spec.tsx`:
  - (a) applying a partial prefill with `patient: { kind: 'search' }` leaves `PatientQuickCreateDialog` closed and `createAppointment` uncalled;
  - (b) a complete prefill opens the booking dialog with "Filled by voice. Check every line before you confirm.", "Doctor: Dr …" and "When: Tue 17 Nov 2026, 16:30 to 17:00"; Cancel has focus; `createAppointment` runs only after "Confirm Booking";
  - (c) with `controlledDoctorId` set, the recorded capability is `null`;
  - (d) the selected patient is `prefill.patient.ref.record`, and no "Patient required" toast appears (the `handleBookingRequest` closure trap, `:306-316`);
  - (e) the recorded `apply` returns `undefined` and `context.shownDoctorId` equals the shown doctor;
  - (f) the hours effect still applies `byDay` hours (switch to `workingHoursOn` is behaviour-neutral).
- `WorkspaceStock.voice.test.tsx`:
  - (a) an `edit-count` prefill opens `StockEditDialog` with 48, "Filled by voice. Check the count, then write the reason.", an empty reason with focus, "Submit for approval" disabled, and `submitDrugInventoryChanges` uncalled;
  - (b) a `search` prefill calls `navigate({ search, page: '1', item: '' })` and opens no dialog;
  - (c) a RECEPTION user registers `null`; with `itemId` set, `null`;
  - (d) the recorded `apply` returns `undefined`.
- In `StockEditDialog.test.tsx`: `initialValue` seeds the input; the blank-reason test still blocks submit; a value below `heldStock` still shows the existing alert (`:80`).

**Commands:** `cd frontend && npx jest src/components/appointments __tests__/inventory && npx tsc --noEmit -p tsconfig.build.json`; `npx cc-check format` and `list` on the four changed component files.

**Contracts:**

| Id | Label | Where | Obligation |
|---|---|---|---|
| `voice-booking-needs-confirm` | product | `AppointmentsCalendar` | Voice only pre-fills; Confirm Booking is the only write |
| `voice-summary-visible` | accessibility | `AppointmentBookingDialog` | Patient identity, doctor, long date and heard text shown; Cancel focused first |
| `voice-count-prefill-only` | product | `StockEditDialog` | Unsubmitted proposal, heard text, before and after count, empty reason with focus |

`stock-row-edit-proposal`, `clinic-stock-row-edits`, `appointment-booking-success-feedback` and `appointment-calendar-legend` stay word for word.

**Must not touch:** `AppointmentScheduler.tsx`, `DoctorDayCalendar.tsx`, `usePrefilledPatient.ts`, `PatientQuickCreateDialog.tsx`, the existing `AppointmentsCalendar.spec.tsx`, `InventoryChangePreview.tsx`, any backend file, `lib/voice/*`, `components/voice/*`, `lib/working-hours.ts`.

---

## Ownership: no file has two owners

| File or folder | Owner |
|---|---|
| `shared-types/src/voice.cjs`, `shared-types/src/voice.d.cts`, `shared-types/package.json` | W |
| `frontend/__tests__/lib/voice/wire.test.ts` | W |
| `backend/src/modules/visits/visits.controller.ts` | B |
| `backend/src/modules/visits/tests/visits.transcribe.spec.ts` | B |
| `backend/src/modules/voice/**` | B |
| `backend/src/app.module.ts` | B |
| `frontend/src/app/test-transcribe/page.tsx` | B |
| `frontend/src/lib/voice/**` | C |
| `frontend/src/lib/working-hours.ts` | C |
| `frontend/src/components/voice/**` | C |
| `frontend/src/components/layout/dashboard-layout.tsx` | C |
| `frontend/src/app/dashboard/layout.tsx` | C |
| `frontend/__tests__/lib/voice/**` except `wire.test.ts` | C |
| `frontend/__tests__/lib/working-hours.test.ts` | C |
| `frontend/__tests__/components/voice/**` | C |
| `frontend/src/components/visits/visit-note-voice.ts` | V |
| `frontend/src/components/visits/PrescriptionBuilder.tsx` | V |
| `frontend/src/components/visits/MedicalVisitForm.tsx` | V |
| `frontend/src/components/tours/DoctorTour.tsx` | V |
| `frontend/src/hooks/useSpeechToTextRecorder.ts` (delete) | V |
| `frontend/src/lib/speech-to-text.ts` (delete) | V |
| `frontend/__tests__/lib/speech-to-text.test.ts` (delete) | V |
| `frontend/__tests__/visits/visit-note-voice.test.ts`, `PrescriptionBuilder.voice.test.tsx` | V |
| `frontend/src/components/appointments/AppointmentsCalendar.tsx` | P |
| `frontend/src/components/appointments/AppointmentBookingDialog.tsx`, `.spec.tsx` | P |
| `frontend/src/components/appointments/AppointmentsCalendar.voice.spec.tsx` | P |
| `frontend/src/components/inventory/WorkspaceStock.tsx` | P |
| `frontend/src/components/inventory/StockEditDialog.tsx` | P |
| `frontend/__tests__/inventory/StockEditDialog.test.tsx`, `WorkspaceStock.voice.test.tsx` | P |

The `wire.test.ts` path sits inside C's `__tests__/lib/voice/` folder; it is W's file and C must not edit it. Every other row is a distinct path or folder.

Removed in total: two live per-field mics and the `VoiceButton` component in `PrescriptionBuilder.tsx`, the dead copy in `MedicalVisitForm.tsx`, `useSpeechToTextRecorder.ts`, `speech-to-text.ts` and its test, and the DoctorTour mic steps. The `transcribe/chunk*` routes stay (decision 7).
