# Rationale: the voice bar (synthesis)

## Problems found while synthesizing

Each item states the evidence, the resolution proposed, and where the sketch implements it.

1. **Decision 8 cannot be followed literally: copying the auth module's throttler would add no limit and would double the guard.**
   - `auth.module.ts:12-17` registers `ThrottlerModule.forRoot([{ ttl: 60, limit: 10 }])`, and `:33-36` provides `ThrottlerGuard` as `APP_GUARD`. That guard is already global for every route in the app.
   - `auth.controller.ts:32` uses `@Throttle({ default: { ttl: 60, limit: 5 } })`.
   - The installed `@nestjs/throttler` is 6.4.0. It reads `ttl` in milliseconds: `throttler-storage.service.js` takes `ttlMilliseconds` and passes it to `setTimeout`, and the package README says "time to live in milliseconds". So `ttl: 60` means 60 ms. Copying "including its ttl units" gives 20 requests per 60 ms, which is no limit.
   - `ThrottlerModule` is `@Global()` (`throttler.module.js:61`). A second `forRoot` in the voice module would compete for the same options token, and a second `APP_GUARD` would run the throttler twice on every route.
   - **Resolution:** the voice module registers nothing. Each parse route carries `@Throttle({ default: { ttl: 60_000, limit: 20, getTracker: voiceUserTracker } })` (`sketch/backend/src/modules/voice/voice.controller.ts`). The tracker keys on `req.user.id`. That works because global guards apply in module scan order with AppModule's own first (`@nestjs/core/scanner.js:100-106`), so `JwtAuthGuard` has set `req.user` before the throttler runs. `voice.controller.spec.ts` asserts the limit, the 60000 ms window and the tracker.
   - **Side finding, not fixed here:** the login limit at `auth.controller.ts:32` is also 5 per 60 ms, so login has no working rate limit. That file is outside this feature. The owner should decide whether to fix it.
2. **Decision 7 ("leave the chunk routes and their helper untouched") conflicts with P1's staff-only rule.** Judgement P1 item 7 puts the staff-only `@Roles` on the three chunk routes, and item 1 changes `response_format` at `:1192`. Leaving the routes fully untouched keeps the PATIENT hole open on `POST /visits/transcribe/chunk` (`:1117`), which also spends the key.
   - **Resolution:** add one `@Roles(...TRANSCRIBE_STAFF_ROLES)` decorator line to each chunk route (`:1106`, `:1117`, `:1286`). Do not change their bodies, `response_format` at `:1192`, or `ensureTranscribeSessionDir` (`:188`). Test (h) in B checks the roles metadata on all four handlers.
   - If the lead wants the routes literally untouched, delete those three lines and record the chunk-route PATIENT hole as a known limit.
3. **Line drift in decision 5.** The set-aside rule is `valid` at `StockEditDialog.tsx:26-27` (with the input `min` at `:72` and the alert at `:80`), not `:29-30`. The design does not change.
4. **`copy.ts` sits in `lib/voice/`, not `components/voice/`.** Slot messages are built in `lib/voice/intents.ts`. If copy lived in `components/voice`, `lib` would import a component folder. Both folders are the bar core (package C), so decision 2's "one copy.ts in the bar core" holds.
5. **React 19 has no global `JSX` namespace.** `frontend/node_modules/@types/react` is 19.1.12. Candidate 1's sketches returned `JSX.Element` without an import, which does not compile. The merged components import `type { JSX } from 'react'`.

## Problem

One composer, docked at the bottom of the dashboard shell, turns one spoken or typed utterance into a change to one of three forms:
- a free-text clinical note sorted into four sections;
- a booking that needs a doctor, a date, a patient and a time resolved;
- a stock count that needs one exact batch.

The user reviews the change first, and the form's own save or confirm stays the only database write. What makes the shape hard:
- **Asynchrony.** Microphone, upload, parse and lookups fail differently. Today's hook loses results under Strict Mode (`useSpeechToTextRecorder.ts:32,61-66`).
- **Trust.** The model must never supply an id or invent clinical text, and a draft must never land on another patient's visit.
- **Ownership.** The bar must not know pages, but pages own the state it writes into.

Constraints carried in: judgement P1 (transcription fixes, staff-only access), P3 (same-door guards, output whitelist, resolution rules), P4 and P5 (dialog summaries, Cancel first, empty reason), the CJS-only shared-types subpath convention (`drug-search.ts:1`, `shared-types/package.json` exports), and the lead's synthesis decisions.

## Usage (caller's view)

See `usage.md`. A page calls `useVoiceCapability({ intent, context, scope?, apply })` once, or with `null`. `apply` receives `Reviewed<PrefillOf<K>>`. It returns `{ written, undo }` for the visit note and nothing for booking and stock. The shell mounts `<VoiceBarProvider>` around the root and `<VoiceBar />` after `<main>`. The bar exists on a page exactly when a component on it registered.

## Shape

**Data structures first** (`sketch/frontend/src/lib/voice/types.ts`, `machine.ts`):

- **`BarPhase`, one state machine.** `idle | listening | transcribing | interpreting | review | refining | applying`. Every phase except idle holds an `Attempt { id, key }`. Idle holds the composer text and one `Notice`. `configured` sits outside the phase and only moves to false. `step(model, event) -> { model, commands }` is pure.
- **`RegistrationKey { registrant, intent, scope }`.** A registration's identity. An attempt carries the key it started with. Apply and undo go to that key or nowhere. Any change of key discards the attempt and the pending undo (`voice-bar-scope-bound`). The visit page passes `clinicalScopeKey` (`PrescriptionBuilder.tsx:221`), so a patient, visit or doctor change ends the draft.
- **`Slot<T>` = `resolved | choose | unresolved`.** The only way a looked-up value is held. Several matches are `choose`. Zero matches and "not said" are `unresolved`. There is no "defaulted" variant (`voice-booking-no-guess`).
- **`Proposal`, one variant per intent.** A visit note is a list of `NoteItem { text, place }`, where `place` is a section or `unsorted`. Booking and stock are records of slots.
- **`toPrefill` and `Reviewed<T>`.** `toPrefill` returns null while a choice is open or nothing can be applied, and Apply is enabled iff it is non-null. For a visit note it returns only placed items. Only the machine's apply transition brands the value `Reviewed`.
- **`Failure` with `retry`.** A closed union. `retry` is `null` for permanent conditions (not set up, forbidden, session ended, browser cannot record) and otherwise names the step: `record`, `transcribe` or `interpret`. A transcription failure keeps the attempt, and the store keeps its audio, so Try again re-sends the same recording. A parse failure puts the heard text back in the composer, and Try again re-sends it.
- **`IntentApplyResults`.** The type of each page's apply result. Booking and stock return `void`, so an undo for them cannot be written.

**Making the forbidden things unwritable:**
- *The model returned an id.* The wire types have no id-shaped field. Branded ids are minted only privately in `lookups.ts`, from API records (`voice-refs-from-records`). The server rebuilds every response from a whitelist (`voice-parse-spoken-only`).
- *Invented section text.* The server cuts the transcript into sentences in code. The model only labels indexes (`visit-note-sentences-verbatim`).
- *Applied without review, or to the wrong patient.* The `Reviewed` brand, plus the key check at apply time in the store, plus the scope in the key.
- *A dropped dictation line.* Unplaced lines are never written and stay in review after an apply. Only Dismiss removes them, and the applied line says how many were left out.

**The Strict Mode bug class is gone by construction** (per encode-lessons-in-structure). There is no mounted flag. Async results return as events with their attempt id, and `step` drops any id that is not live. Commands run in `store.send()`, inside event handlers, never inside effects. The store's only effect cleanup is `reset()`, which leaves it usable.

**Data flow:**
1. Audio goes to `POST /visits/transcribe` with `context` from `INTENTS[intent].transcribeContext`, and returns the heard text. Typed text skips this step.
2. The text goes to `POST /voice/{visit-note|appointment|stock-count}` and returns `ParsedByIntent[K]`.
3. `INTENTS[K].resolve(parsed, context, lookups)` builds a `Proposal`, or null for nothing usable.
4. The user reviews: chooses (`refine`) or places lines.
5. `toPrefill` -> `Reviewed` -> the page's `apply`. The bar reports an `AppliedSummary` in words from `copy.ts`.

`GET /voice/status` is requested once per page load and answers for voice and typed text alike. The paid `/visits/transcribe/health` is never called.

**Boundaries** (per boundary-discipline): `transport.ts` alone sees HTTP status, `FormData` and `MediaRecorder`, and throws `VoiceFailure`. `lookups.ts` alone sees API rows. Inside, everything is typed domain data and pure functions. On the server, `VoiceService.parse` is the boundary and `voice-intents.ts` holds pure specs.

**Single sources** (per the hand-synced-list red flag): one wire file for intents, sections, limits and routes; one `INTENTS` table; one `VOICE_INTENT_SPECS` table; one `copy.ts`; one `workingHoursOn`. `Record<VisitSectionKey, …>` in labels and the page binding makes the build fail when a section is added in one place only.

**Interface depth.** A page learns one hook and a four-field object. Hidden behind it: recording and its limits, the transcription prompt, parse routes and guards, the whitelist, name, date and time resolution, choices, the review UI, the apply gate, the scope check, undo bookkeeping, failure classification and retry, every word of copy, status, focus and keyboard, and the iOS keyboard fit. The cost is that the bar knows the three intents (`INTENTS`, `ProposalReview`). It knows no page, setter or route file.

**Screened against the design red flags.**
- Shallow module: no; the surface is one hook.
- Information leakage: wire types stop at `transport.ts`; pages see only prefills.
- Two ways to do one task: the old hook, helpers and per-field mics are deleted in the same change, and the old `GET /visits/transcribe/status` from P1 is not added.
- Split ownership: the store is the only writer of the model; each registrant owns its slot.
- Importable internals: `markReviewed` is unexported; `testing.ts` is guarded by a boundary test; `lookups.ts` exports no string-branding function.
- Pass-through: `useVisitNoteVoice` adds the merge, touched flag and undo policy, so it is not one.

**Deliberately not done:** no text-to-speech; no streaming transcription; no server-side record lookup; no autosave or submit from voice; no booking or stock undo in the bar; no per-item discard of unplaced lines; no route allowlist.

## Synthesis decision

**Base: candidate 1** (data model first). Its safety rules live in one place in the bar core: `Slot<T>`, `toPrefill`, the `Reviewed` brand, one wire file, and apply bound to the registration the attempt started with. A page author writes only `apply`, so a new page cannot default a doctor, patient or stock row. In candidate 2 every page writes its own planner with `Ask.defaultId` in reach.

**The lead's first lean was candidate 2**, for its experience work. The cross-judge chose candidate 1 and the lead agreed: candidate 2's experience work grafts onto candidate 1 without changing its shape, while candidate 1's safety cannot be grafted onto candidate 2 without restructuring it.

**Cross-judge scores** (A = candidate 1, B = candidate 2): safety 4/3, page surface 3/4, state model 4/3, failure behaviour 4/5, buildable 4/3, experience 3/5.

**Grafts from candidate 2, each folded in by hand:**
1. *Failure model* (`candidate-2/sketch/frontend/src/components/voice-bar/machine.ts`, `Failure`). Became `Failure` with `retry` in `types.ts`. Rather than adding candidate 2's separate `failed` phase, a failure is an idle notice that carries the attempt when `retry` is `transcribe`. The store keeps that attempt's audio until the notice clears. Candidate 1's rule that the heard text returns to the composer after a parse failure is kept, so `interpret` retry is "send the composer text again".
2. *Copy* (`candidate-2/usage.md` section 3 and the failure table; `candidate-2/sketch/.../voice-bar/copy.ts`). Every string is in `lib/voice/copy.ts`, candidate 2's wording first. Candidate 1's page-returned messages are gone: pages return data and the bar words it. Strings candidate 2 lacked are marked NEW.
3. *Layout and tokens* (`candidate-2/usage.md` section 4). Applied in full in `VoiceBar.tsx`, `ProposalReview.tsx` and `usage.md` section 6.
4. *Keyboard* (`candidate-2/usage.md` section 5). `Ctrl/Cmd + /` with focus memory replaces `Ctrl/Cmd + K`. The machine emits `restore-focus` on Escape, and the component owns the remembered element.
5. *Viewport export in `app/dashboard/layout.tsx`* (`candidate-2/usage.md` section 1).
6. *Stock extras* (`candidate-2/sketch/frontend/src/lib/voice/stock-resolve.ts`). "Count equals shelf" became a count slot rule in `checkCount`. "Show matches in the list" is the label of candidate 1's existing search prefill.
7. *Smaller grafts:* the "Heard: … Edit" control, labelling the calendar's doctor "Shown on the calendar" without selecting it, the module-level status cache, and "Added after the N lines already there."

**Changes to the base required by the decisions:**
- Sections: four (`chiefComplaints`, `examination`, `pastHistory`, `medicationHistory`). Personal history, family history and diagnosis are gone, and with them the single-line append mode.
- Unsorted lines (decision 2): new `applying` phase; `review` gains `added`. Apply writes placed items and returns to review with the rest. `NoteItem.place` lost `'discarded'`. Dismiss is the only discard. A placed line can be moved back to "Not placed yet", which is the only way to keep a sorted sentence out without Dismiss.
- Scope (decision 3): `RegistrationId` became `RegistrantId` plus `RegistrationKey { registrant, intent, scope }`; `Attempt.registration` became `Attempt.key`; the registry gained `changed()`.
- Private brand casts (decision 4): `lookups.ts` exports `createLookups` and three record-to-ref builders only; `testing.ts` mints test values.
- Set-aside stock (decision 5): `checkCount` returns the "set aside" message.
- One status route (decision 6): `GET /voice/status` on `VoiceController`; `fetch-status` command; `Transport.status` hits it once.
- Chunk routes kept (decision 7), with the problem in item 2 above.
- Throttle (decision 8), with the problem in item 1 above.
- No booking or stock undo (decision 9): `IntentApplyResults` makes their apply `void`.
- iOS keyboard hook (decision 10): `components/voice/visual-viewport.ts`, pure `shellBoxFor` with a unit test; the shell reads two CSS variables.
- Timeouts map to 503 (decision 11), in both the transcription delta and `VoiceService`.
- Module names stay candidate 1's (decision 12).

**Changes to the base beyond the decisions, and why:**
- `IntentContexts['book-appointment']` gained `shownDoctorId` (for the "Shown on the calendar" label) and `defaultHours`. The calendar today falls back to its configured hours when a doctor has none (`AppointmentsCalendar.tsx:129-136`), and voice must use the same fallback.
- `Lookups.workingHours` takes that `fallback`, and `workingHoursOn(metadata, date, fallback)` returns `WorkingHours`, not null.
- `IntentDef` lost `placeholder` and `example` (now in `copy.ts`) and gained `summarize`. `resolve` may return `null` for nothing usable.
- The page apply returns data (`IntentApplyResults`), not `AppliedReceipt { message, undo? }`, because all words moved to `copy.ts`.
- `stockCountPrefill`: a resolved row with an unresolved count now gives no prefill instead of a search. Searching is pointless when the row is known and the count is the problem (decisions 5 and 6).
- Escape and Dismiss in review now clear the composer (Escape returns focus to the remembered element). The new Edit button is what puts the heard text back. Without this, Dismiss after a partial apply would put already-applied text back in the composer.
- `Transport.openMic` takes `onLimit`, so the 10-minute cap lives with the recorder, not in a component timer.
- Components import `JSX` from `react` (problem 5).

**Rejected from candidate 2, and why:**
- The per-page `plan` function and `Ask.defaultId`: they put the no-guess rule back into every page.
- The `ready | needs-you | blocked` proposal with page-built lines: replaced by `Slot` and one review view.
- The "Leave out" default for unplaced lines: decision 2 makes Dismiss the only discard.
- Undo for booking and stock: decision 9.
- Page-supplied section list sent to the server (`context.sections`): the wire file is the single list.
- Quote-span sorting on the server (`voice-bar.sort.ts`): candidate 1's index labelling is simpler and equally verbatim.
- The "Add as new patient" button in the bar: the base's search prefill reaches the existing "+ Add" button.
- The `voice-bar` module and route names: decision 12.
- Its role-metadata equality spec: decision 7 keeps candidate 1's.

## Tradeoffs accepted

- We accept a closed intent set known to the bar (`INTENTS`, `ProposalReview`, `copy.ts`) in exchange for typed proposals and one review UI. A fourth intent edits those files plus the wire list, and the compiler finds all of them.
- We accept two requests per spoken utterance (transcribe, then parse) in exchange for typed and spoken input sharing one path, and the heard text surviving a parse failure.
- We accept sentence-level sorting in exchange for verbatim section text. A sentence that mixes a complaint and an examination finding lands in one section, and the doctor moves it.
- We accept an extra review round after a partial visit-note apply in exchange for never silently dropping a dictated line.
- We accept an unspoken doctor costing one click, in exchange for never booking against the calendar's first-loaded doctor (`AppointmentsCalendar.tsx:188`).
- We accept that a scope change discards a draft the doctor may have wanted, in exchange for a draft never landing on another patient's visit.
- We accept no Undo in the bar for booking and stock, in exchange for one undo path per form: the dialog's Cancel.
- We accept `Reviewed` being a type brand, not a runtime check. A determined `as` cast defeats it; the contract and review catch that.
- We accept setting the shell height from JavaScript on iOS only while the text box has focus, in exchange for a bar that stays above the iOS keyboard, where `interactive-widget` is ignored.
- We accept `useVoiceCapability` being a no-op outside the provider, so page components render unchanged in their own tests.

**Known limits, stated and not solved:**
- The calendar loads at most 100 doctors (`AppointmentsCalendar.tsx:185`), so name matching can report "no doctor" in a larger clinic.
- Whether the chosen slot is already taken is checked by the server when the user confirms the booking, as today.
- Transcript text, with patient names, goes to an OpenAI chat model. The owner must agree before this is enabled in production. The feature is off without a key.
- A sentence that mixes a complaint and an examination finding lands in one section, and the doctor moves it.

## Alternatives considered

1. **The bar as a transcript pipe; pages own review.** A page registers `onUtterance(text)` and renders its own review, choices and apply. The surface looks smaller, but it is the shallowest shape: three pages would each re-implement attempt tracking, stale-result dropping, review state, the apply gate, the scope check, undo and failure copy. "Applied without review" and "the model returned an id" become conventions repeated three times.
2. **One server call that resolves everything.** `POST /voice/{intent}` takes audio or text, looks up patients, doctors and stock rows in Prisma, and returns ids. The client becomes trivial, but the parse route becomes a read door wider than the pages' own lookups, the wire would carry ids next to model output, and the heard text is lost when parsing fails after transcription. Rejected on the trust boundary.
3. **A schema-driven generic bar.** Pages register field descriptors and one prompt extracts them. The descriptor language would have to express sentence sorting with an unsorted bucket, morning or night against one doctor's hours, and exact batch plus unit. That is each intent's logic re-encoded as configuration, with page labels flowing into prompts. A larger surface hiding less.

## Open questions and risks

- May the three `transcribe/chunk*` routes be deleted in a later change? They stay for now (decision 7). Is the decorator-only change in problem 2 acceptable meanwhile?
- Should the login rate limit (`auth.controller.ts:32`, 5 per 60 ms) be fixed to 60,000 ms in a separate change?
- The Prescription tab is `forceMount`ed, so the visit bar shows on the visit form's other tabs. Should the builder register only while that tab is visible? That needs a prop from `MedicalVisitForm`.
- An OWNER sees the stock bar (`WorkspaceStock.tsx:75`) but `PermissionsGuard` does not bypass OWNER, so the parse route returns 403 unless OWNER holds `pharmacy:drug:inventory-change:create`. The same is true of the form's submit. Should the page gate on the permission instead of the role list?
- Does the privacy answer for sending transcripts to a chat model (judgement Q8) cover whole clinical dictations?
- Risk: the iOS keyboard fit is verified only by the pure function test until the Simulator hand-test. `visualViewport.offsetTop` behaviour differs between iOS versions.
- Risk: a transcript with no terminal punctuation becomes one sentence, so the doctor places it whole.
- Risk: on a 390 px phone with the keyboard open, the review card at `30dvh` leaves little of the page visible.

## Next implementation step

Apply W to the working tree, then write `frontend/__tests__/lib/voice/machine.test.ts` against `step()` in `sketch/frontend/src/lib/voice/machine.ts`, starting with the stale-attempt, scope-change and partial-apply cases.
