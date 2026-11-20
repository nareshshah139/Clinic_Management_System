# Visit form saving

During a consultation the doctor's notes save in three ways. Autosave runs 8 seconds after an edit. Save Draft saves at once. Create Prescription saves the prescription, and in the same request it saves the form's clinical notes onto the visit, creating the visit first if it has none. All three write one visit row. This model checks how they share it.

`VisitFormSave.tla` models one doctor, the autosave timer, the server, and one other person who can change the same visit. Each write reaches the server and applies, then its reply reaches the form, so a reply can arrive after other writes.

The save state lives in one `saveStatus` string and several refs. The spec keeps each one.

| Model variable | Code, `MedicalVisitForm.tsx` |
| --- | --- |
| `ind` | `saveStatus`, `431`, rendered at `1733-1738` |
| `dirty` | `hasUnsavedChangesRef`, `608` |
| `timer` | `autoSaveTimerRef`, `609` |
| `auto` | `autoSavePromiseRef` and its PATCH, `610`, `957-1024` |
| `man`, `mw` | `manualSaveInFlight` and the Save Draft request, `900`, `1399-1530` |
| `rx`, `rw` | `PrescriptionBuilder.create` and its requests, `PrescriptionBuilder.tsx:2655-2785`, through `ensureVisitId`, `MedicalVisitForm.tsx:2016-2041` |
| `blocked` | `automaticSaveBlocked` with `saveConflict`, both set by `blockAutomaticSave`, `910-916` |
| `cver` | `visitVersionRef`, `242`, raised by `acknowledgeMutationVersion`, `245-249` |
| `visits`, `sver`, `sed` | visit rows for the consultation, the visit's version, and the doctor's edit it holds |

## Model to code

| Action | Code |
| --- | --- |
| `YouEditTheVisit` | the edit effect, `1237-1260`: Unsaved changes, or Save failed while blocked, then `scheduleAutoSave` |
| `AutosaveRuns` | `runAutoSave`, `936-956`. It returns without a visit id, without unsaved edits, during Save Draft, while blocked, or with an autosave already out. It does not look at the prescription save. |
| `YouSaveDraft`, `SaveDraftSends` | `save`, `1399-1450`: take the manual lock, clear the timer, await the autosave in flight, then `getClinicalSavePatch` (which throws 409 while blocked, `923-928`) and create or PATCH |
| `YouCreatePrescription`, `PrescriptionSends` | `PrescriptionBuilder.create` holds only `prescriptionSaveInFlight`. Without a visit id it calls `ensureVisitId`, which POSTs `/visits` with no idempotency key and does not check `manualSaveInFlight`. The prescription POST carries `getClinicalSavePatch()`, version included (`PrescriptionBuilder.tsx:2703-2707`). |
| `TheServerHandles*` | `VisitsService.update` refuses a stale `version` with 409 (`visits.service.ts:471-472`). Prescription create runs the same update with the form's clinical patch (`prescriptions.service.ts:121-135`). A walk-in visit create has no appointment to make a duplicate fail. |
| `AutosaveReplies` | `957-979`: acknowledge the version unless blocked, compare the sent payload with the latest, then Saved or Unsaved changes. A 409 calls `blockAutomaticSave` (`988-992`). |
| `SaveDraftReplies` | `1460-1512`, same comparison; a 409 calls `blockAutomaticSave` (`1519-1521`) |
| `PrescriptionReplies` | success acknowledges through `onVisitSaved` (`2003-2007`); a 409 calls `onClinicalConflict`, which is `blockAutomaticSave` (`PrescriptionBuilder.tsx:2648-2653`, `MedicalVisitForm.tsx:2002`) |
| `ARequestFails`, `ARequestTimesOut` | a 5xx, a dropped connection, or the 30 second timeout for visit and prescription writes (`api.ts:170-172`). Autosave retries on its timer; Save Draft reschedules autosave. |
| `SomeoneElseChangesTheVisit` | another tab or person saves the visit |
| `YouDiscardTheDraft` | `discardAndReloadSavedVisit`, `1541-1557`, which remounts the editor |

## Rules and what TLC says

| Rule | code | Replay |
| --- | --- | --- |
| `TypeOK` | holds | |
| `OneVisit` | breaks | `today:` and `.failing` pass |
| `NoSelfConflict` | breaks | `today:` and `.failing` pass |
| `LatchAgrees` | breaks | `today:` and `.failing` pass |
| `SavedMeansSaved` | holds | |
| `LeavesSaving` | holds | |

The replays are in `frontend/__tests__/formal/visit-form-save.formal-replay.test.tsx`. They render the real `MedicalVisitForm` with the real `PrescriptionBuilder` and stub only `fetch`. The stub server holds each write, applies it at the model's apply step, and replies at the model's reply step.

- `OneVisit`. On a new walk-in visit, Save Draft and Create Prescription each POST `/visits`. `ensureVisitId` neither waits for Save Draft nor reuses its idempotency key. The server creates two visits. With an appointment, the second create gets 409 and the doctor's own draft is latched as a conflict instead.
- `NoSelfConflict`. An autosave and a prescription save carry the same visit version. The first to land bumps it, so the second gets 409, and the form says the visit changed elsewhere and pauses autosave. Only Discard draft clears it. Nobody else touched the visit.
- `LatchAgrees`. On the same path, the autosave reply arrives after the conflict and sets Saved. The indicator says Saved beside the notice that says autosave is paused.

`SavedMeansSaved` holds. Every success compares the payload it sent with the latest one, so a newer edit keeps Unsaved changes. The rule reads only while there is one visit row, because the model tracks the first row's content; `OneVisit` already breaks when there are two.

`LeavesSaving` holds even if the server never answers, because visit and prescription writes time out after 30 seconds.

## Fixed mode and negative controls

`fixed` makes the prescription save one more writer under the existing serialisation. It holds the Save Draft lock, so Save Draft and Create Prescription wait for each other, and it awaits an autosave in flight, which in turn skips while the prescription save runs and is rescheduled after it.

| Mode | Mistake it reproduces | Breaks |
| --- | --- | --- |
| `rxCreatesAlone` | the prescription save ignores Save Draft, as today | `OneVisit` |
| `rxSavesAlone` | the prescription save ignores autosave, as today | `NoSelfConflict`, `LatchAgrees` |
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

- Complete Visit. It is Save Draft followed by `/complete`; the visit-status lifecycle is the appointment-visit model's subject.
- A reply lost after the server applied the write, and the retry with the same idempotency key. The idempotency model covers it. Failures here happen before the write applies.
- Appointment-linked creates, where the server refuses the duplicate and the form looks the visit up with a GET that has no timeout. The walk-in case already breaks `OneVisit`.
- Tele-video consent, which keeps autosave in Unsaved changes until consent is given.
- Photo uploads. `VisitPhotos` has its own `onVisitNeeded`, `MedicalVisitForm.tsx:2093-2101`, which creates the visit the same way as `ensureVisitId`, and its writes report conflicts and versions through the same callbacks. It is a fourth writer with the same shape, so it can race in the same ways.
- The steps between pressing a button and its request leaving are separate steps in the model. In the browser they run in one task, so the model allows more interleavings than the code. Every broken rule was replayed on the real component, so none of the breaks depends on them.
