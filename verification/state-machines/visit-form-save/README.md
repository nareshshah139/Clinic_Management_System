# Visit form saving

During a consultation the doctor's notes save in three ways. Autosave runs 8 seconds after an edit. Save Draft saves at once. Create Prescription saves the prescription, and in the same request it saves the form's clinical notes onto the visit, creating the visit first if it has none. All three write one visit row. This model checks how they share it. Save Draft and Create Prescription share one lock, `holdVisitSave`, and autosave skips while it is held.

`VisitFormSave.tla` models one doctor, the autosave timer, the server, and one other person who can change the same visit. Each write reaches the server and applies, then its reply reaches the form, so a reply can arrive after other writes.

The save state lives in one `saveStatus` string and several refs. The spec keeps each one.

| Model variable | Code, `MedicalVisitForm.tsx` |
| --- | --- |
| `ind` | `saveStatus`, `431`, rendered at `1747-1755` |
| `dirty` | `hasUnsavedChangesRef`, `608` |
| `timer` | `autoSaveTimerRef`, `609` |
| `auto` | `autoSavePromiseRef` and its PATCH, `610`, `958-1025` |
| `man`, `mw` | `manualSaveInFlight`, `900`, held by `holdVisitSave`, `1399-1415`, and the Save Draft request, `1417-1552` |
| `rx`, `rw` | `PrescriptionBuilder.create` and its requests, `PrescriptionBuilder.tsx:2656-2791`, through `ensureVisitId`, `MedicalVisitForm.tsx:2037-2062` |
| `blocked` | `automaticSaveBlocked` with `saveConflict`, both set by `blockAutomaticSave`, `910-916` |
| `cver` | `visitVersionRef`, `242`, raised by `acknowledgeMutationVersion`, `245-249` |
| `visits`, `sver`, `sed` | visit rows for the consultation, the visit's version, and the doctor's edit it holds |

## Model to code

| Action | Code |
| --- | --- |
| `YouEditTheVisit` | the edit effect, `1238-1261`: Unsaved changes, or Save failed while blocked, then `scheduleAutoSave` |
| `AutosaveRuns` | `runAutoSave`, `936-957`. It returns without a visit id, on a locked completed visit, without unsaved edits, while `manualSaveInFlight` is held (Save Draft or the prescription save), while blocked, or with an autosave already out. |
| `YouSaveDraft`, `SaveDraftSends` | `save`, `1417-1552`, through `holdVisitSave`, `1399-1415`: refuse while the lock is held, take it, clear the timer, await the autosave in flight, then `getClinicalSavePatch` (which throws 409 while blocked, `923-928`) and create or PATCH |
| `YouCreatePrescription`, `PrescriptionSends` | `PrescriptionBuilder.create` runs its save through the form's `holdVisitSave` (`PrescriptionBuilder.tsx:2786`, passed at `MedicalVisitForm.tsx:2027`). It is refused while Save Draft runs, then waits for the autosave in flight. Without a visit id it calls `ensureVisitId`, which POSTs `/visits`. The prescription POST carries `getClinicalSavePatch()`, version included (`PrescriptionBuilder.tsx:2709`). |
| `TheServerHandles*` | `VisitsService.update` refuses a stale `version` with 409 (`visits.service.ts:471-472`). Prescription create runs the same update with the form's clinical patch (`prescriptions.service.ts:121-135`). A walk-in visit create has no appointment to make a duplicate fail. |
| `AutosaveReplies` | `964-979`: acknowledge the version unless blocked, compare the sent payload with the latest, then Saved or Unsaved changes. A 409 calls `blockAutomaticSave` (`988-992`). |
| `SaveDraftReplies` | `1479-1531`, same comparison; a 409 calls `blockAutomaticSave` (`1537-1539`). `holdVisitSave` reschedules autosave on release (`1413`). |
| `PrescriptionReplies` | success acknowledges through `onVisitSaved` (`2022-2026`); a 409 calls `onClinicalConflict`, which is `blockAutomaticSave` (`PrescriptionBuilder.tsx:2649-2654`, `MedicalVisitForm.tsx:2021`). `holdVisitSave` reschedules autosave on release. |
| `ARequestFails`, `ARequestTimesOut` | a 5xx, a dropped connection, or the 30 second timeout for visit and prescription writes (`api.ts:170-172`). Autosave retries on its timer; Save Draft and the prescription save reschedule autosave. |
| `SomeoneElseChangesTheVisit` | another tab or person saves the visit |
| `YouDiscardTheDraft` | `discardAndReloadSavedVisit`, `1556-1572`, which remounts the editor |

## Rules and what TLC says

| Rule | before | code | Replay |
| --- | --- | --- | --- |
| `TypeOK` | holds | holds | |
| `OneVisit` | breaks | holds | passes, fails on the code before the fix |
| `NoSelfConflict` | breaks | holds | passes, fails on the code before the fix |
| `LatchAgrees` | breaks | holds | passes, fails on the code before the fix |
| `SavedMeansSaved` | holds | holds | |
| `LeavesSaving` | holds | holds | |

The replays are in `frontend/__tests__/formal/visit-form-save.formal-replay.test.tsx`. They render the real `MedicalVisitForm` with the real `PrescriptionBuilder` and stub only `fetch`. The stub server holds each write. `serveHeldWrites` applies every held write in arrival order, then delivers the replies newest first, and repeats until the form sends nothing more. That is the order of the `before` counterexamples.

What `before` did, and each replay still checks:

- `OneVisit`. On a new walk-in visit, Save Draft and Create Prescription each POSTed `/visits`. `ensureVisitId` neither waited for Save Draft nor reused its idempotency key, so the server created two visits. With an appointment, the second create got 409 and the doctor's own draft was latched as a conflict instead. The replay presses both, applies every held create, and expects one visit. It then presses Create Prescription again and expects the prescription on that visit.
- `NoSelfConflict`. An autosave and a prescription save carried the same visit version. The first to land bumped it, so the second got 409, and the form said the visit changed elsewhere and paused autosave. Nobody else touched the visit. The replay expects no conflict notice and the prescription to carry the version the autosave returned.
- `LatchAgrees`. On the same path, the autosave reply arrived after the conflict and set Saved beside the notice that said autosave is paused. The replay expects the indicator to agree with the notice.

`SavedMeansSaved` holds. Every success compares the payload it sent with the latest one, so a newer edit keeps Unsaved changes. The rule reads only while there is one visit row, because the model tracks the first row's content; `OneVisit` already breaks when there are two.

`LeavesSaving` holds even if the server never answers, because visit and prescription writes time out after 30 seconds.

## The fix

`fixed` made the prescription save one more writer under the existing serialisation. The code now does that.

- `holdVisitSave`, `MedicalVisitForm.tsx:1399-1415`. It refuses with "Visit is still saving" while `manualSaveInFlight` is held. Otherwise it takes the lock, clears the autosave timer, awaits the autosave in flight, runs the write, and on release reschedules autosave if edits remain and no conflict is latched. `save` runs through it (`1448`), as it did with its own copy of these steps before.
- `PrescriptionBuilder.create` runs its save through `holdVisitSave` (`PrescriptionBuilder.tsx:2786`). The form passes it at `MedicalVisitForm.tsx:2027`. Standalone prescriptions have no form and save as before.
- `runAutoSave` already returned while `manualSaveInFlight` is held (`MedicalVisitForm.tsx:937`), so autosave skips while the prescription save runs.

Save Draft's button is disabled while the lock is held, since `holdVisitSave` sets `saving`. A Create Prescription press during Save Draft is refused with a toast. It does not wait, because its `ensureVisitId` closure would still see no visit id and create a second one.

`code` takes the `fixed` branches. It differs in one step. Pressing Create Prescription clears the autosave timer, as `holdVisitSave` does.

`LatchAgrees` holds in `code` by serialisation. A conflict is latched only by a reply, and no other writer of the three is in flight then.

A completed visit opens locked, and the doctor unlocks it with Edit visit. The server accepts the edit and keeps the visit completed (appointment-visit model, `EditKeepsCompletion`). This is outside this model, which leaves Complete Visit out. One derived value decides every gate. `editMode` is `open`, `locked` or `amending`, and `canEdit` is false only when `locked` (`MedicalVisitForm.tsx:280-282`). `amending` resets when the visit loads (`1164`) and after Save changes (`1505`), and a remount starts it false.

- `save` refuses a locked visit with "Choose Edit visit to change a completed visit" (`1428-1431`). This covers Save Draft, Save vitals, Save changes and Ctrl+S. The shortcut calls the current `save` through `saveShortcut` (`1308`, `1562`), so it never acts on a stale lock state.
- `runAutoSave` returns on a locked visit (`942`). While amending it runs as on an open visit.
- A locked visit's bar shows Edit visit and the indicator reads "Completed. Read only." While amending the bar shows Save Draft and Save changes, which runs the completion path, and the indicator begins "Editing a completed visit." (`1761-1795`). Save vitals is disabled while locked (`1994`).
- The prescription builder gets `readOnly={!canEdit}` (`2044`). A read-only builder exports the saved record with no write (`PrescriptionBuilder.tsx:2808`). While amending it saves the visit and the prescription before output, as on an open visit.

## Negative controls

`fixed` holds the Save Draft lock in the prescription save, so Save Draft and Create Prescription exclude each other, and it awaits an autosave in flight, which in turn skips while the prescription save runs and is rescheduled after it. `before` is the code before the fix, kept as a regression control.

| Mode | Mistake it reproduces | Breaks |
| --- | --- | --- |
| `rxCreatesAlone` | the prescription save ignores Save Draft, as `before` did | `OneVisit` |
| `rxSavesAlone` | the prescription save ignores autosave, as `before` did | `NoSelfConflict`, `LatchAgrees` |
| `saveIgnoresNewerEdits` | a success marks Saved without comparing payloads | `SavedMeansSaved` |
| `noRequestTimeout` | visit writes lose their 30 second timeout | `LeavesSaving` |
| `typeProbe` | the indicator takes a value outside its type | `TypeOK` |

## Fairness

- `WF_vars(AutosaveRuns)`. The autosave timer fires on its own.
- `WF_vars(SaveDraftSends)`, `WF_vars(PrescriptionSends)`. An awaited promise resumes once what it waits for settles. These steps are microtasks, so they are fair.
- `WF_vars(ARequestTimesOut)`. The 30 second client timeout fires on its own.
- `WF_vars(RepliesInTime)`. Once the server has applied a write, its reply reaches the form before the timeout. A reply lost after the server applied the write is the idempotency model's subject.
- No user action is fair.

## What the model leaves out

- Complete Visit. It is Save Draft followed by `/complete`; the visit-status lifecycle is the appointment-visit model's subject. The completed-visit gates in the fix section are outside this model.
- A reply lost after the server applied the write, and the retry with the same idempotency key. The idempotency model covers it. Failures here happen before the write applies.
- Appointment-linked creates, where the server refuses the duplicate and the form looks the visit up with a GET that has no timeout. The walk-in case already breaks `OneVisit`.
- Tele-video consent, which keeps autosave in Unsaved changes until consent is given.
- Photo uploads. The form passes `VisitPhotos` an `onVisitNeeded`, `MedicalVisitForm.tsx:2114-2125`, that creates the visit the way `ensureVisitId` does, but `VisitPhotos` never calls it, so photos cannot create a visit. A photo upload or deletion bumps the visit version (`visits.service.ts:1152`) and reports it through `onVisitVersion`. It does not take `holdVisitSave`, so an upload while an autosave is in flight can still make that autosave get 409, the `NoSelfConflict` shape. Fixing it means running photo writes through the same lock, in `VisitPhotos.tsx`.
- The steps between pressing a button and its request leaving are separate steps in the model. In the browser they run in one task, so the model allows more interleavings than the code. Every broken rule was replayed on the real component, so none of the breaks depends on them.
