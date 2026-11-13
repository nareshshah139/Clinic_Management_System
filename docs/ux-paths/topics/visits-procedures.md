# Visit documentation & procedures

> Source of truth: `frontend/src/app/dashboard/visits/page.tsx`, `frontend/src/components/visits/MedicalVisitForm.tsx`,
> `VisitPhotos.tsx`, `PatientPhotoArchive.tsx`, `PatientHistoryVisitCard.tsx`, `ClinicInvestigations.tsx`,
> `VisitIdentityBar.tsx`, `frontend/src/app/dashboard/procedures/page.tsx`,
> `backend/src/modules/visits/visits.controller.ts` / `visits.service.ts` / `consultation.ts`.
> Labels in `code font` or "quotes" are the strings in the code. Anything not read directly is marked *(unverified)* or *(inferred)*.
> Stories are numbered locally from 001.

Facts that several stories rely on (read once):

- **Tabs by role** (`ROLE_PERMISSIONS` + `renderTabs()` in `MedicalVisitForm.tsx`):
  DOCTOR / ADMIN / OWNER → `Overview`, `Vitals`, `Photos`, `Prescription`, `Lab Tests`, `Customization`, `History`.
  NURSE (and the non-existent THERAPIST) → `Overview`, `Vitals`, `Photos`, `History`.
  RECEPTION → `Overview`, `Photos`, `History`.
  Any other role (MANAGER, PHARMACIST, ACCOUNTANT) → `Overview`, `History` only.
- **Server write access**: `POST /visits`, `PATCH /visits/:id` and `POST /visits/:id/complete` are `@Roles(DOCTOR, ADMIN, OWNER)`. Photo upload (visit and draft) is open to all clinic staff; deleting a *visit* photo is DOCTOR/ADMIN/OWNER.
- **Complaints, history, examination and diagnosis have no tab of their own.** They are sections inside the `Prescription` tab ("Chief Complaints", "Diagnosis", "Patient History", "On Examination"), so only DOCTOR/ADMIN/OWNER can reach them.
- **Completion gate**: progress = completed sections ÷ 5 for doctors (÷ 3 for everyone else). Only four sections can ever be marked — `vitals` (button `Mark Vitals Complete`), `photos` (automatic when the visit has ≥ 1 photo), `labs` (button `Save Labs`), `prescription` (opening `Print Preview` or `Create Prescription`). `Complete Visit` needs 80 %, i.e. **all four**.
- **Autosave** runs only once the visit exists on the server (it has an id). Before the first explicit save, edits live only in `localStorage`.

---

## STORY-001: Doctor opens a visit from today's appointment

**Type**: short
**Topic**: Visit documentation & procedures
**Persona**: Dr. Sindhu Reddy, dermatologist, 10:40 am on a busy OPD morning; the patient is already seated
**Goal**: Get from the calendar into the visit form for the patient in front of her
**Preconditions**: Signed in as DOCTOR. A Confirmed appointment today 10:30–10:45 for Ananya Sharma (F, 27, 98480 12345) with Dr. Sindhu Reddy; no visit recorded for it yet. Appointments page already remembers her as the selected doctor and today as the date.
**Ideal path**: 2 — open today's list, one click on the patient opens the visit already linked to the appointment.
**Alternate paths**:
- Hover the appointment tile → quick button `START` (tooltip "Start Visit"); the same button reads `CONT` ("Continue Visit") once a visit exists (`CalendarColumn.tsx`).
- Click the tile → dialog "Appointment Details" → `Start Visit` (`DoctorDayCalendar.tsx`). The dialog button always says `Start Visit`, even when it will resume an existing visit.
- Appointments › `Slots` tab renders the same calendar, so both routes above exist there too.
- Header notification bell (doctor): each upcoming appointment links to `/dashboard/visits?appointmentId=…` (`header.tsx`). The Visits page ignores `appointmentId` unless `patientId` is also present, so this lands on the empty setup screen.
- Patients list row `Start Visit`; patient detail `Start new visit`; progress tracker `Start Visit` — all open a visit that is **not** linked to the appointment (see STORY-003).
- Sidebar `Visits` → setup screen (STORY-002), also not linked to the appointment.

### Steps
1. Click `Appointments` in the sidebar (Clinical) → "Doctor Calendar" for Dr. Sindhu Reddy, today, with Scheduled and Confirmed columns.
2. Move the pointer over Ananya Sharma's tile in the Confirmed column → three small buttons fade in: `INFO`, `RESCHED`, `START`.
3. Click `START` → browser goes to `/dashboard/visits?patientId=…&appointmentId=…&autoStart=true`; the setup screen is skipped.
4. Read the screen → title "Visit Documentation" with a blue `From Appointment` badge, a compact progress tracker (icons only) with a `Continue`/`Prescribe` button row if she has an earlier visit, buttons `Quick Guide`, `Back to Calendar`, `Back to Setup`; a sticky line "Patient: Ananya Sharma · 27 · Female · Doctor: Dr. Sindhu Reddy · 10:30–10:45 · OPD"; left card "Patient Context"; header card "Visit #3", badge `DRAFT`, second badge `Linked to Appointment`, "0 Photos", "Medical Visit Documentation • Role: DOCTOR • Progress: 0%"; `Overview` tab selected.

### Variations
- **Via the details dialog**: click the tile body instead of `START` → "Appointment Details" (Time, Patient, Sex, Bill, Type, Room, Status) → `Start Visit`. One extra click; same destination.
- **Visit already exists**: the tile button reads `CONT`; the URL carries `visitId=` instead of `autoStart=true`, and the form loads saved vitals, complaints and status (`IN PROGRESS` or `COMPLETED`).
- **Receptionist clicks `START`**: the button is not role-gated on the calendar. She lands in the same form with only `Overview`, `Photos`, `History` tabs and "Role: RECEPTION"; `Save Draft` is shown but the server rejects it.

### Edge Cases
- **Nothing is created yet**: arriving on the form does not create the visit or change the appointment. The appointment only flips to In Progress on the first successful save (`visits.service.ts` `create`). If the doctor reads the history and leaves, the calendar tile still says `START`.
- **Two badges for one fact**: "From Appointment" (page header) and "Linked to Appointment" (visit header card) are both on screen.
- **Two people start the same appointment**: the second save gets HTTP 409 "Visit already exists for this appointment"; the form then looks up the existing visit id, shows "Unable to save visit", and raises the conflict banner (see STORY-009).
- **Cancelled or completed appointment**: first save fails with "Cannot create a visit from a cancelled or completed appointment".
- **Telemedicine appointment**: the form still opens with `Consultation type` = "In-person" (see STORY-008).

---

## STORY-002: Doctor starts a visit for a walk-in from the Visits page

**Type**: medium
**Topic**: Visit documentation & procedures
**Persona**: Dr. Sindhu Reddy, between appointments; a known patient has walked in without a booking
**Goal**: Open a new visit for a patient who has no appointment
**Preconditions**: Signed in as DOCTOR. Patient Mohammed Irfan (M, 34, 98490 55512) exists with three earlier visits. The clinic has two doctors; "Dr. Praveen Kumar" sorts before "Dr. Sindhu Reddy" in the users list.
**Ideal path**: 3 — search the patient, pick him, start (the doctor should default to the signed-in doctor).
**Alternate paths**:
- Patients list → row `Start Visit` (→ `/dashboard/visits?patientId=…&autoStart=true`).
- Patient detail page → `Start new visit`; `Resume last visit`; progress tracker `Continue` / `Start Visit`.
- Appointments → tile `START` / "Appointment Details" › `Start Visit` (needs a booking first).
- Doctor Dashboard › "Recent Visits" row (resumes an existing visit).
- `/dashboard/prescriptions` redirects to this same setup screen.
- Procedures › `Save Procedure` also creates a visit record (STORY-011).

### Steps
1. Click `Visits` in the sidebar → page "Visit Documentation" ("Create and manage patient visits with role-based documentation") with three cards: "Your Role & Permissions" (badge `Doctor`, "Full access to all visit documentation features"), "Start New Visit", and "Available Features" (Complete Documentation / Dermatology Specific / Treatment Planning).
2. Click the "Select Patient" box (placeholder "Search name, phone, or email") → a dropdown opens with up to 10 patients.
3. Type `98490` → "Searching…", then matching rows, each showing name, "ID: <full internal id>", 📞 phone and ✉️ e-mail.
4. Press ↓ then Enter (or click) on "Mohammed Irfan" → the box shows his name; below it two tabs appear, `Ready to Start` (selected) and `Patient History`, with "Ready to start visit" and the identity line "Patient: Mohammed Irfan · 34 · Male · Doctor: Dr. Praveen Kumar".
5. Notice the wrong doctor: "Select Doctor" was pre-filled with the first doctor in the list, not the signed-in user. Open the select and choose "Dr. Sindhu Reddy" → identity line updates.
6. Click `Start Visit Documentation` → the form opens: "Visit #4", badge `DRAFT`, no appointment badges, `Overview` tab, footer "Progress: 0% • 0 of 5 sections complete" with the hint "Completion requires 80% progress. Remaining: vitals, photos, labs, prescription. Section progress does not verify clinical completeness."

### Variations
- **Peek at history first**: after step 4 click `Patient History` → timeline of past records with `Show details`, `Resume session` and (where a prescription exists) `View Prescription`; then back to `Ready to Start`.
- **No doctor chosen**: if the doctor select is cleared, `Ready to Start` shows a yellow note "Please select a doctor to start the visit." and no start button.
- **ADMIN / OWNER / MANAGER on this screen**: the role card falls back to the `Doctor` badge and description for any role without its own entry, and "Available Features" is an empty card (it only has content for THERAPIST, NURSE, DOCTOR). A MANAGER who starts a visit then gets only `Overview` and `History`.

### Edge Cases
- **No patients or no doctors in the branch**: card "Setup Required" — "No patients or doctors found. Please add at least one to create a visit." with `Manage Patients` and `Manage Users`.
- **Role info shown twice**: "Your Role & Permissions" and "Available Features" both start with "Features available … your role: Doctor".
- **Search failure**: an API error while searching shows "No results" (errors are swallowed).
- **Unsaved new visit is fragile** *(inferred from `createDraftStorageKey` and `visitDate={new Date().toISOString()}`)*: until the first save, the local draft key contains a full timestamp generated at render time, so a draft for a brand-new walk-in visit is unlikely to be found again after a page reload. The browser's "leave site?" prompt is the only warning.
- **Existing open visit is not offered**: starting here always opens a blank "new" visit even if the patient has an in-progress visit from this morning; resuming needs the `Patient History` tab or another route.

---

## STORY-003: Second doctor starts a visit from the Patients list and finds it under the wrong doctor

**Type**: short
**Topic**: Visit documentation & procedures
**Persona**: Dr. Praveen Kumar, visiting cosmetologist, Saturday clinic
**Goal**: Start documenting a visit for a patient he found in the Patients list
**Preconditions**: Signed in as DOCTOR (Dr. Praveen Kumar). Patient Sunita Rao (F, 45) exists. Another doctor sorts first in the clinic's doctor list.
**Ideal path**: 1 — `Start Visit` on the patient row opens a visit under the signed-in doctor.
**Alternate paths**: patient detail `Start new visit`; patient detail progress tracker `Start Visit` (only shown when an upcoming appointment exists and no visit yet); Visits setup screen (STORY-002); appointment `START` (STORY-001).

### Steps
1. Click `Patients` in the sidebar, type `Sunita` in the search box → her row appears.
2. Click `Start Visit` on the row → `/dashboard/visits?patientId=…&autoStart=true`; the form opens immediately, no setup screen.
3. Read the sticky identity line → "Patient: Sunita Rao · 45 · Female · Doctor: Dr. Aarti Mehta" — the first doctor in the list, because the link carries no `doctorId` and the page defaults to `doctors[0]`.
4. Click `Back to Setup` → the setup screen shows the "Start New Visit" card; the patient search box is empty although "Ready to start visit" still names Sunita Rao.
5. Change "Select Doctor" to "Dr. Praveen Kumar" → the form re-opens by itself (a deep-link effect re-shows the form whenever patient and doctor are both set), now under the right doctor; he never clicks `Start Visit Documentation`.

### Variations
- **From the patient detail page**: `View` → `Start new visit` uses the same URL and the same doctor default.
- **Resume instead of start**: `Resume last visit` (detail page) or tracker `Continue` adds `visitId=`, so the visit's own doctor is loaded and the problem does not arise.

### Edge Cases
- **He does not notice**: the first save creates the visit under the other doctor (and, for a patient without one, makes that doctor the patient's primary doctor — `visits.service.ts`). No UI was found to change a saved visit's doctor.
- **Typed-in data under the wrong doctor**: the local draft key includes the doctor id, so anything typed before step 4 is not carried over to the corrected form.
- **Receptionist uses the same button**: `Start Visit` is visible to RECEPTION on the Patients list although `Visits` is not in her sidebar; she gets `Overview`, `Photos`, `History` and cannot save a visit.

---

## STORY-004: Nurse records vitals and a photo before the doctor sees the patient

**Type**: medium
**Topic**: Visit documentation & procedures
**Persona**: Lakshmi Devi, staff nurse, pre-consultation desk, six patients waiting
**Goal**: Capture BP, pulse, weight, height and one photo so the doctor finds them in the visit
**Preconditions**: Signed in as NURSE. Patient Karthik Varma (M, 29) has a Confirmed appointment with Dr. Sindhu Reddy; no visit yet.
**Ideal path**: 7 — open the patient's visit (1), type five vitals (5), save (1); the doctor then sees them.
**Alternate paths**:
- Appointments → tile `START` (nurses have Appointments) — links the form to the appointment.
- Patients row `Start Visit` / patient detail `Start new visit`.
- Photos only: patient detail › `Uploads` tab (same `VisitPhotos` component with `visitId="temp"`).
- Vitals can also be typed by the doctor in Prescription › "Clinical Details & Vitals" (doctor-only).

### Steps
1. Click `Visits` in the sidebar → setup screen; "Your Role & Permissions" shows badge `Nurse` — "Can record vitals, capture photos, complaints, and basic assessments"; "Available Features" lists Full Vitals, Photo & Complaints, Assessment Notes.
2. Click "Select Patient", type `Karthik`, click "Karthik Varma" → `Ready to Start` appears.
3. Open "Select Doctor" and choose "Dr. Sindhu Reddy".
4. Click `Start Visit Documentation` → form with four tabs only: `Overview`, `Vitals`, `Photos`, `History`. Header: "Role: NURSE • Progress: 0%". Footer: "0 of 3 sections complete" and a single button `Save Draft` (no `Complete Visit`).
5. Look for somewhere to type the complaint promised on the setup screen → there is none; complaints live in the doctor-only `Prescription` tab. She moves on.
6. Click `Record Vitals` under "Quick Actions" (or the `Vitals` tab).
7. Type `118` in "BP Systolic".
8. Type `76` in "BP Diastolic".
9. Type `82` in "Heart Rate".
10. Type `72` in "Weight".
11. Type `174` in "Height" → read-only "BMI" shows 23.8. Header status reads "Unsaved changes".
12. Click `Mark Vitals Complete` → the form tries to create the visit; the server refuses (`POST /visits` allows only DOCTOR/ADMIN/OWNER) → red toast "Unable to save visit" with the server's message *(exact text unverified)*, header "Save failed"; the Vitals tab gets no green dot.
13. Click the `Photos` tab → "No photos attached to this visit" → click `Take Photo`, shoot the forearm lesion.
14. In the dialog "Tag photo positions" change the position from the pre-selected "Front" to "Close-up", click `Upload` → toast "Photos uploaded — 1 image(s) uploaded."; header shows "1 Photos" and the Photos tab gets a green dot (progress 33 %).
15. Walk over and tell the doctor the readings, because nothing she typed in `Vitals` left her browser.

### Variations
- **Opened from the appointment after the doctor already saved the visit**: the form loads the saved visit; `Mark Vitals Complete` then sends `PATCH /visits/:id`, which is refused the same way. Her photo, however, attaches to the visit directly (photo upload is open to clinic staff).
- **Receptionist**: only `Overview`, `Photos`, `History`; `Quick Actions` shows just `Capture Photos`.
- **Manager**: only `Overview` and `History`, an empty "Quick Actions" card, and a `Save Draft` button that cannot succeed.

### Edge Cases
- **Where the photo went**: with no visit id the upload goes to the per-patient, per-day draft store (`/visits/photos/draft/:patientId`). When the doctor later opens the visit it appears under "Other saved photos" → "Unattached uploads — <date> (1)", not in the visit's own photo strip; nothing links draft photos to the visit on creation.
- **Delete is offered but refused**: the nurse sees `Delete` buttons (`allowDelete` is true for anyone with the Photos tab). Deleting a draft upload works; deleting a photo attached to a visit returns 403 → toast "Delete failed".
- **Vitals stay in the nurse's local draft**: the draft is keyed by doctor, patient and (here) a timestamp; it is not visible on the doctor's machine.
- **The promise vs. the form**: the setup screen and the page's `Quick Guide` both say nurses record "complaints, and assessments"; the form has no such field for this role. The guide also describes a "Therapist" role that does not exist in the role enum.

---

## STORY-005: Doctor documents a full acne consultation from appointment to `Complete Visit`

**Type**: long
**Topic**: Visit documentation & procedures
**Persona**: Dr. Sindhu Reddy, dermatologist, mid-morning; follow-up patient with a hormonal-acne work-up
**Goal**: Record vitals, photos, complaint, history, examination, diagnosis, order investigations, issue the prescription and close the visit so the appointment shows Completed
**Preconditions**: Signed in as DOCTOR. Confirmed appointment today for Ananya Sharma (F, 27). She has two earlier visits, the last with tagged photos (Front, Left, Right). Drug master and a signature are set up (prescription internals are another topic).
**Ideal path**: 14 — open from appointment (1), four vitals (4), add three photos in one action (2), complaint + diagnosis + examination chips (3), order tests (1), prescription hand-off (1), complete (2: confirm + done).
**Alternate paths**:
- Starting: any route from STORY-001/002/003.
- Vitals: `Vitals` tab **or** Prescription › "Clinical Details & Vitals" (Height, Weight, BMI, BP Sys, BP Dia, Pulse) — the two are kept in sync.
- Diagnosis: Prescription › "Diagnosis" text box **or** Prescription › "On Examination" › "Dermatology Diagnoses" chips (merged on save).
- Ordering tests: `Lab Tests` tab **or** Prescription › "Investigations" checklist.
- Saving: `Save Draft`, Ctrl/Cmd+S, `Mark Vitals Complete`, `Save Labs`, autosave, and `Create Prescription` all save the visit.
- Completing: `Complete Visit` button or Ctrl/Cmd+Shift+S.

### Steps
1. Click `Appointments`, hover Ananya Sharma's tile, click `START` → visit form opens with `From Appointment` / `Linked to Appointment`, "Visit #3", badge `DRAFT`.
2. Glance at "Patient Context" (left) → name, "ID: …", "Age: 27 • <gender as stored>", "Phone: …", a red "⚠️ ALLERGIES" box if recorded, and "Recent Visits" with the last two dates and diagnoses.
3. Click the `Vitals` tab.
4. Type `110` in "BP Systolic".
5. Type `70` in "BP Diastolic".
6. Type `78` in "Heart Rate".
7. Type `58` in "Weight".
8. Type `162` in "Height" → "BMI" shows 22.1. Header status: "Unsaved changes" (autosave has not started — the visit does not exist yet).
9. Click `Mark Vitals Complete` → visit is created on the server; green toast "Visit saved — Your draft was saved safely."; badge becomes `IN PROGRESS`; green dot on the `Vitals` tab; "Progress: 20%"; header "Saved 10:44". The appointment is now In Progress.
10. Click the `Photos` tab → card "Before / After Photos (0)", empty state "No photos attached to this visit".
11. Click `Choose Files`, select three photos from the clinic camera folder in the OS picker.
12. Dialog "Tag photo positions" opens in `Single` mode with positions pre-guessed in order (Front, Left, Right). Click `Next` twice to check each preview against its tag.
13. Click `Upload` → button shows "Uploading (1/1) - 60%"; toast "Photos uploaded — 3 image(s) uploaded."; header "3 Photos"; green dot on `Photos`; progress 40 %.
14. Click `Compare: Off` → it becomes `Compare: On`; two panes "Visit 2 - Front" and "Visit 3 - Front", "Compare against:" pre-set to the previous visit.
15. Click `Next` twice to compare Left and Right; note visible improvement.
16. Click the `Prescription` tab → the prescription builder. "Clinical Details & Vitals" already shows Height 162, Weight 58, BMI, BP 110/70, Pulse 78 — the same readings on a second surface ("Heart Rate" is called "Pulse (bpm)" here).
17. Click in "Chief Complaints" and type `Pimples on both cheeks and jawline for 3 months, flare before periods` (a mic button offers dictation).
18. Click the `Acne` chip under "Skin Concerns".
19. In "Diagnosis" type `Acne vul` and click the suggestion "Acne vulgaris" → the section turns green with a "Has Data" badge.
20. In "Patient History" type `Used Betnovate-N on face for 2 months (self-medication)` under "Medication History".
21. Type `Irregular cycles, 40–45 days` under "Menstrual History".
22. Expand "On Examination" if it is collapsed; click `IV` under "Fitzpatrick Skin Type".
23. Type `moderate` in "Acne Severity".
24. Click `Papule`, `Pustule`, `Comedo` under "Morphology" (3 clicks).
25. Click `Face` under "Distribution / Body Areas".
26. Hesitate at "Dermatology Diagnoses": `Acne vulgaris` is offered again as a chip although it was just typed in "Diagnosis". She clicks it anyway to be safe.
27. **Hand-off — prescription topic**: fill the "Treatment" table (e.g. Adapalene 0.1% gel at night, Doxycycline 100 mg OD × 4 weeks), set "Review Date" with the `4w` shortcut, click `Create Prescription`, deal with the "Go to Pharmacy?" dialog (`Stay Here`). Creating (or even just opening `Print Preview`) marks the prescription section complete → progress 60 %.
28. Click the `Lab Tests` tab → card "Lab Tests (Investigations)".
29. Tick `Total Testosterone`, `S. Prolactin`, `TSH`, `Fasting Insulin` (4 clicks) → an "Enter Results" grid appears with Value/Unit boxes (left blank today).
30. Click `Save Labs` → toast "Visit saved"; green dot on `Lab Tests`; footer "Progress: 80% • 4 of 5 sections complete"; the 80 % hint disappears and `Complete Visit` becomes enabled.
31. Click `Complete Visit` → button reads "Completing..."; the visit is saved, then completed with the review date as follow-up; toast "Visit completed — All documentation has been marked complete."; badge `COMPLETED`; the linked appointment becomes Completed; the local draft is cleared.
32. Click `Back to Calendar` → browser history goes back to Appointments; the tile now shows the completed status.

### Variations
- **Vitals typed in the Prescription tab instead**: values flow back to the `Vitals` tab, but the `Vitals` section is only marked complete by pressing `Mark Vitals Complete` on the Vitals tab — so she must still visit that tab and press the button before completion is possible.
- **No tests needed today**: she still has to open `Lab Tests` and press `Save Labs` with nothing ticked, because completion needs the "labs" section. The button does not check that anything was selected.
- **No photos taken** (e.g. patient declines): `Complete Visit` can never be enabled; "photos" stays in the "Remaining:" list. The only way through is to upload some image.
- **Keyboard**: Ctrl/Cmd+S = `Save Draft`; Ctrl/Cmd+Shift+S = complete. `Shortcuts` opens "Keyboard Shortcuts", which also lists patient-search keys that only apply on the setup screen.
- **Guided**: `Visit Workflow Tour` in the header starts an intro.js tour (Step 1 Patient Context … Step 12 Completing the Visit).

### Edge Cases
- **Shortcut below 80 %**: Ctrl/Cmd+Shift+S while the button is disabled shows the toast "More details needed to complete — Fill vitals, complaints, diagnosis, and prescription to reach at least 80% before completing." — which names complaints and diagnosis, whereas the footer hint (and the code) track vitals, photos, labs, prescription.
- **Progress is shown four times**: header text, header mini-bar, `Overview` › "Progress Summary" (per-tab `Complete`/`Pending` badges + bar), footer text. The page header additionally shows the patient progress tracker, a different six-step concept (Start → Document → Complete → Prescribe → Billing → Follow-up) whose "Complete" step is a heuristic (visit older than 24 h or has a prescription), not the visit's status.
- **`Overview` › "Photos Captured: 0"** is hard-coded; the header badge next to it says "3 Photos".
- **Typing during save**: if edits land while a save is in flight the toast reads "Earlier changes saved — New edits are still waiting to save."; completing in that state fails with "New changes were entered while saving. Please save again before completing or exporting."
- **Tracker buttons inside the form**: the compact tracker's `Continue` / `View` buttons link to the patient's *latest saved* visit; before step 9 that is the previous visit, so clicking them leaves the current form.
- **After completion** the form remains editable and `Save Draft` still works; no read-only state was found in the form or in `visits.service.ts` `update`.
- **Section completion is not restored from the server**: reopening this visit on another computer shows 0 % progress except Photos (auto-detected) — see STORY-010 edge cases.

---

## STORY-006: Doctor photographs a melasma follow-up on a tablet, compares with last visit and retakes a blurred shot

**Type**: medium
**Topic**: Visit documentation & procedures
**Persona**: Dr. Sindhu Reddy using the consulting-room tablet; patient Sunita Rao, melasma, week 8 of treatment
**Goal**: Add front/left/right photos to today's visit, compare them with the previous visit, replace one bad photo
**Preconditions**: Visit already saved (`IN PROGRESS`). The previous visit has three photos tagged Front, Left, Right.
**Ideal path**: 6 — open Photos (1), shoot three angles in one capture session with auto-tagging (3), toggle compare (1), swipe through pairs (1).
**Alternate paths**:
- `Overview` › "Quick Actions" › `Capture Photos` (jumps to the Photos tab).
- `Upload` / `Choose Files` (multi-select from files) instead of `Camera` / `Take Photo`.
- Patient detail page › `Uploads` tab (same component, saves as unattached uploads).
- Viewing only: History cards › `Show details` › `Full details` › "Photos"; "Other saved photos" beneath the photo viewer.

### Steps
1. In the open visit click the `Photos` tab → "Before / After Photos (0)", header buttons `Upload` and `Camera`, empty state with `Choose Files` and `Take Photo` (same two actions under different labels).
2. Click `Take Photo` → the tablet camera opens (single capture); shoot the front view and accept.
3. Dialog "Tag photo positions" opens in `Single` mode, position pre-set to "Front" → click `Upload` → toast "Photos uploaded — 1 image(s) uploaded."
4. Click `Camera` (the empty-state buttons are gone now) → shoot the left profile.
5. The dialog again pre-selects "Front" (the guess restarts from Front for every batch) → open the position select, choose "Left".
6. Click `Upload`.
7. Click `Camera` → shoot the right profile → change the select to "Right" → click `Upload` (3 actions). Title now "Before / After Photos (3)", thumbnails labelled Front / Left / Right.
8. Click `Compare: Off` → `Compare: On`; "Compare against:" shows the previous visit ("Visit 2 - <date>"); left pane "Visit 2 - Front", right pane "Visit 3 - Front"; footer "Position: Front • 1 / 3".
9. Click `Next` → Left pair; `Next` → Right pair. The right-profile photo from today is blurred.
10. Click the red bin icon on the "Right" thumbnail → native browser confirm "Delete this photo? This cannot be undone." → `OK` → photo removed; title "(2)"; the compare pane for Right shows "No photo".
11. Click `Camera`, reshoot, set "Right", `Upload` → pair restored.
12. Scroll below the viewer to "Other saved photos" → groups such as "Visit — <date> (3)"; tap a thumbnail → opens full size in a new browser tab.

### Variations
- **From files**: `Upload` allows multi-select; with three files the dialog pre-tags Front, Left, Right in file order and one `Upload` click sends them all (batches of 6, progress "Uploading (1/1) - 40%").
- **Grid tagging**: `Grid` mode shows every pending photo with its own position select; `Infer positions` re-applies the Front → Left → Right → Back → Close-up → Other order.
- **Different comparison**: the "Compare against:" select lists every earlier visit as "Visit n - <date>".

### Edge Cases
- **Three delete controls for one action**: `Delete` in the card header, `Delete` beside Prev/Next, and the bin on each thumbnail; all use the native confirm dialog.
- **Compare pairs by position, first photo only**: two photos tagged "Close-up" in one visit — only the first is ever shown in compare.
- **Photos taken before the first save**: uploads go to the draft store; after the first save the viewer reloads from the visit, shows 0 photos, the Photos section loses its green dot (progress drops 20 %), and the pictures appear only under "Other saved photos" → "Unattached uploads — <date>". *(From `VisitPhotos.tsx`: `onVisitNeeded` is accepted but never called.)*
- **Bad files**: non-images are skipped; > 25 MB is attempted with a warning; mixed outcomes give the toast "Upload completed with warnings" listing skipped/failed batches; total failure gives "Upload failed".
- **Load failure**: "Unable to load this visit's photos. Please retry." with `Retry visit photos`; the archive has its own `Retry saved photos`.
- **Stale version**: an upload or delete answered with 409 raises the visit conflict banner (STORY-009).

---

## STORY-007: Doctor enters lab results from a report photo and compares with the last visit

**Type**: medium
**Topic**: Visit documentation & procedures
**Persona**: Dr. Sindhu Reddy; Ananya Sharma returns after four weeks with a printed hormone report
**Goal**: Record TSH, Vitamin D, testosterone and prolactin results in today's visit without retyping, and see the change from last time
**Preconditions**: Today's visit is open and saved. The previous visit had the same tests ticked (with or without values). `OPENAI_API_KEY` configured on the server.
**Ideal path**: 3 — open Lab Tests (1), drop the report photo (1), confirm extracted values (1).
**Alternate paths**:
- Type each value by hand in the "Enter Results" grid.
- Ordering (not results): Prescription tab › "Investigations" checklist with "Add Custom Investigation" and `Manage saved investigations` — this is the list that prints on the prescription.
- Reading old results: History card › `Full details` › "Treatment plan" / "Lab orders".

### Steps
1. Click the `Lab Tests` tab → card "Lab Tests (Investigations)" — "Select tests and enter results with units. You can also autofill from a photo."; 31 checkboxes (CBC, ESR, CRP, LFT … Skin Biopsy). Nothing is pre-ticked from the previous visit's orders.
2. Click the browser's file chooser at the bottom of the card (caption "Accepts JPG, PNG, or PDF"; it has no label of its own) and pick the phone photo of the report.
3. Wait → the `Save Labs` button reads "Processing…" → toast "Autofill complete — Extracted results inserted."; the matching tests become ticked and "Enter Results" shows a box per test with Value and Unit filled.
4. Check the values against the paper; correct TSH from `48` to `4.8`.
5. Testosterone came back without a unit → type `ng/dL` in its "Unit" box.
6. Tick "Compare with previous visit" (top of the card) → a small "Δ +1.3" style figure appears beside each value.
7. Click `Save Labs` → toast "Visit saved"; green dot on `Lab Tests`.
8. **Hand-off — prescription topic**: to order a repeat Vitamin D in 3 months she goes to `Prescription` › "Investigations", not back to this tab.

### Variations
- **Manual entry**: tick `TSH` → a row with unit pre-filled "µIU/mL"; tick `CBC` → three sub-rows (Hemoglobin, WBC, Platelets) with units; `LFT`, `RFT`, `Fasting lipid profile`, `Thyroid profile` also expand into sub-rows.
- **Clinic-specific test** (e.g. "Anti-TPO"): cannot be added on this tab; custom investigations are added and managed only in Prescription › "Investigations" (`Add`, then `Manage saved investigations` → rename with the pencil, remove with "Remove <name> for everyone in the clinic?" → `Remove` / `Keep`).

### Edge Cases
- **Two checklists, two stores**: the `Lab Tests` ticks and the Prescription "Investigations" ticks are separate state; ticking `TSH` here does not tick it there during the session *(they only converge when a saved visit is reloaded — inferred from the hydration code)*. Three names are in play: "Lab Tests", "Investigations", "Labs".
- **AI returns a name that is not in the checklist** (e.g. "Serum Prolactin"): it is added to the results grid but has no checkbox, so it cannot be removed from the UI.
- **Misleading delta**: when the previous visit has no value for a test, the comparison still shows "Δ +<current value>" (blank is treated as 0) rather than "—".
- **Autofill failure**: toast "Autofill failed" with the HTTP status text; the selections are untouched.
- **Jargon footnote**: "Selections and results are saved under Treatment Plan → Dermatology." describes the storage path, not anything the user can open.
- **Tab gating mismatch**: the tab's content is rendered for Reception (`basic-info`) but the tab button is only added for doctor-level roles, so Reception can never open it.

---

## STORY-008: Doctor runs a tele-video consultation and records consent

**Type**: medium
**Topic**: Visit documentation & procedures
**Persona**: Dr. Sindhu Reddy on a WhatsApp video call with Meera Nair (F, 38), an out-of-station psoriasis follow-up
**Goal**: Document the call as a tele-video visit with consent recorded, so the prescription carries the tele-consultation wording
**Preconditions**: Signed in as DOCTOR. A "Telemedicine" appointment exists for today (the video call itself happens outside the app — no call component exists).
**Ideal path**: 3 — open the visit from the Telemedicine appointment already set to Tele-video (1), tick consent (1), save (1).
**Alternate paths**: none found for recording consent — the `Consultation type` select and checkbox in the visit header card are the only place. (The appointment's "Telemedicine" type and the patient's "Online/Offline" consultation type are separate fields that do not feed it.)

### Steps
1. Appointments → Meera Nair's tile (purple "TELEMED") → `START` → visit form opens; `Consultation type` shows "In-person".
2. Open `Consultation type` and choose "Tele-video" → a checkbox "Patient consented to tele-video consultation" appears with red text "Patient consent is required before saving a tele-video consultation."
3. Skip the checkbox for now; click `Vitals`, type `64` in "Weight" (patient-reported) → header "Unsaved changes".
4. Click `Mark Vitals Complete` → red toast "Patient consent required — Patient consent is required before saving a tele-video consultation."; nothing is saved and the section is not marked.
5. Ask the patient on the call, then tick "Patient consented to tele-video consultation" → helper text turns grey: "Consent will be recorded with your account and the save time."
6. Click `Mark Vitals Complete` again → toast "Visit saved"; badge `IN PROGRESS`; consent is stored server-side with her user id and the time.
7. **Hand-off — prescription topic**: in `Prescription` › `Print Preview` the date line reads "… • Consultation: Tele-video" and a disclaimer paragraph is printed ("This prescription was issued after a tele-video consultation, conducted with the patient's consent…").
8. To close the visit she still needs the four tracked sections: upload at least one image in `Photos` (e.g. a screenshot the patient sent), press `Save Labs`, then `Complete Visit`.

### Variations
- **Changes her mind**: switching the select back to "In-person" and then to "Tele-video" again clears the checkbox each time; consent must be re-ticked.
- **Resuming later**: a saved tele-video visit reopens with "Tele-video" selected and the box ticked (restored from the server receipt or the local draft).

### Edge Cases
- **Silent autosave skip**: with Tele-video selected and consent unticked on an already-saved visit, autosave does nothing and the header simply stays on "Unsaved changes"; only a manual save explains why.
- **Create/Export blocked too**: `Create Prescription` and exports raise the same "Patient consent required" toast.
- **Photos are not blocked** by the consent gate (the photo component uploads on its own endpoints).
- **Server double-check**: the API rejects a tele-video save without consent with the same sentence, and "Sign in before recording tele-video consent." if the actor is unknown.
- **Naming**: "Tele-video" (visit), "Telemedicine"/"TELEMED" (appointment), "Online" (patient record) all describe the same mode.

---

## STORY-009: Autosave stops after the same visit is edited in a second tab; doctor discards and reloads

**Type**: medium
**Topic**: Visit documentation & procedures
**Persona**: Dr. Sindhu Reddy, afternoon; she has Ananya Sharma's visit open in one browser tab and re-opened it from the Dashboard in another
**Goal**: Keep working without losing data after the "changed elsewhere" warning
**Preconditions**: Visit saved and `IN PROGRESS`, open in tab A.
**Ideal path**: 1 — the form merges non-overlapping changes itself, or offers a single "use latest + keep my edits" action.
**Alternate paths**: none found — `Discard draft and reload saved visit` is the only recovery; `Save Draft` and autosave stay blocked until then. (Reloading the page keeps the conflict flag because it is stored in the local draft.)

### Steps
1. Tab A, `Vitals`: change "Weight" from `58` to `59` → header "Unsaved changes" → about 8 seconds later "Auto-saving…" → "Saved 15:02". No click needed.
2. Open the Dashboard in a new tab (B) and click Ananya's row under "Recent Visits" → the same visit opens in tab B.
3. Tab B: `Lab Tests` → tick `CBC` → click `Save Labs` → "Visit saved". (Tab A meanwhile shows the toast "Draft changed in another tab — Your local form may be out of date.")
4. Switch to tab A and type `2` in "Pain Score (0-10)" → after 8 seconds the autosave is rejected (409) → amber toast "Visit changed elsewhere — Your draft is retained and autosave is paused. Use the conflict notice to discard it and reload the saved visit."; header "Save failed".
5. Read the amber banner at the top of the form: "This visit changed elsewhere. Your local draft is retained." / "Autosave is paused. You can keep these edits here, or discard them and load the saved visit." with one button.
6. Try `Save Draft` anyway → red toast "Unable to save visit — Visit changed; reconcile the saved visit before saving".
7. Jot the pain score on paper (there is no merge or side-by-side view), then click `Discard draft and reload saved visit` → "Loading saved visit…" → the form rebuilds from the server on the `Overview` tab; `CBC` is ticked; Pain Score is empty.
8. Go back to `Vitals`, re-type `2` → "Unsaved changes" → "Auto-saving…" → "Saved 15:06".

### Variations
- **Network blip instead of conflict**: toast "Auto-save failed — <message or 'We will retry shortly.'>"; it retries after 15 seconds on its own and returns to "Saved hh:mm".
- **Session expired**: toast "Not signed in — Your session expired. Please sign in to continue."; no retry; the draft stays in the browser.
- **Other 4xx rejection**: autosave pauses until the next edit, then tries again.
- **Conflict raised from Photos or Prescription**: an upload, delete or prescription save that gets 409 raises the same banner.

### Edge Cases
- **Reload fails**: toast "Unable to reload saved visit — … Your draft is still available. Please try again."; the banner stays.
- **Discard also clears the prescription draft** for this visit (`rxDraft:<patient>:<visit>`), not just the visit fields.
- **Leaving with unsaved edits**: the browser's native "Leave site?" prompt appears.
- **Never-saved visit**: there is no autosave at all before the first explicit save, so the status line never shows "Auto-saving…" on a brand-new visit however long she types.

---

## STORY-010: Doctor checks what happened at the previous visit while documenting today's

**Type**: short
**Topic**: Visit documentation & procedures
**Persona**: Dr. Sindhu Reddy, mid-consultation; the patient says "the cream you gave last time burned"
**Goal**: See last visit's diagnosis, medicines and photos without leaving today's visit
**Preconditions**: Today's visit is open for Mohammed Irfan; he has earlier visits, one with a prescription and photos.
**Ideal path**: 2 — one click to open the last visit's summary beside the form, one to expand medicines.
**Alternate paths** (the same history is rendered on six surfaces):
- "Patient Context" side card › "Recent Visits" — last two visits, date + diagnosis only, not clickable.
- Visits setup screen › `Patient History` tab — same cards plus `View Prescription` → dialog "Prescription Details" (`Print`).
- Patient detail page › `History` tab (doctor/date filters, grouped by day).
- Doctor Dashboard › "Recent Visits" → opens the visit itself in the form.
- Patient progress tracker `Continue` / `View` → opens the latest visit in the form.
- Photos only: `Photos` tab › "Other saved photos"; procedures only: Procedures › `Procedure History`.

### Steps
1. Click the `History` tab → "Patient Visit History" with `Refresh`; a timeline of cards, each with date, "Visit" (or "Appointment"), doctor, a status badge (`In progress` / `Completed`), "Chief Complaint" and "Diagnosis" lines, and a footer "3 Photos · 2 Rx Items".
2. Click `Show details` on the 14 Oct card → compact view: "History" and a "Medicines" list (e.g. Luliconazole 1% cream, Itraconazole 100 mg).
3. Click `Full details` → every recorded section: Complaint details, Diagnosis details, History, Examination, Treatment plan, Vitals, Prescription, Prescription instructions, Follow-up date, Visit notes, Lab orders, plus photo thumbnails that open in a new tab.
4. Click the `Prescription` tab to carry on with today's visit (the History tab keeps its expanded state while the form is open).

### Variations
- **Needs the printable prescription**: not available here; `View Prescription` exists only on the setup screen's `Patient History` tab — reaching it from an open visit means `Back to Setup` → `Patient History` → `Show details` → `View Prescription`.
- **Wants to edit the old visit**: `Resume session` on the card navigates to `/dashboard/visits?visitId=…&patientId=…` (a full page load that replaces today's form). The button is shown for completed visits too.
- **Appointment-only entries**: shown as "Appointment only — no visit documentation recorded." with no `Resume session`.

### Edge Cases
- **Resumed visit shows 0 % progress**: section completion is kept only in the browser draft. A visit reopened on another machine (or after completion cleared the draft) shows every section `Pending` except Photos; to press `Complete Visit` on it the doctor must again click `Mark Vitals Complete`, `Save Labs` and open `Print Preview`.
- **Empty past visits are hidden**: visits from earlier days with no clinical content at all are filtered out of the list (`history-visibility.ts`), so "Visit #n" can be higher than the number of cards.
- **Load failure**: "Unable to load history. <message>" (form tab) or "Unable to load patient history. … `Retry`" (setup tab); empty: "No documented history to show."
- **Units differ**: the Vitals tab takes temperature in °F; the history card labels the stored value "Temperature (°C)".
- **One thing, several names**: the cards call a past visit a "record" ("Most recent record", "n Records"), a "Visit", and a "session" (`Resume session`); the Dashboard calls them "consultations".

---

## STORY-011: Doctor records a laser hair reduction session on the Procedures page

**Type**: medium
**Topic**: Visit documentation & procedures
**Persona**: Dr. Sindhu Reddy, evening procedure slot; nurse Lakshmi Devi has just finished session 3 of beard-line laser hair reduction for Karthik Varma
**Goal**: Log machine, shot counts, body areas and per-pass settings for the session and confirm it is on record
**Preconditions**: Signed in as DOCTOR (sidebar `Procedures` is shown to OWNER, ADMIN, MANAGER, DOCTOR). Karthik Varma is among the first 100 patients returned by the API (the patient list is not searchable).
**Ideal path**: 9 — pick patient (1), machine (1), session auto-numbered, shot counts (2), body parts (2), two passes of settings pasted from last session (1), note (1), save (1).
**Alternate paths**:
- Prescription tab › "Procedures" section (free-text "Procedures" and "Procedure Planned") inside a visit — prints on the prescription.
- Appointment of type Procedure with "Procedure Name" (scheduling only).
- Procedures › `Procedure History` › `Load & Edit` to start from an earlier record.

### Steps
1. Click `Procedures` in the sidebar → "Smart Procedures Management" ("Advanced procedure planning and tracking with machine-specific parameters"); tabs `New Procedure` (selected), `Procedure History`, `Analytics`. "Patient *", "Doctor *" and "Nurse/Therapist" are already filled with the **first** patient, doctor and nurse in each list.
2. Open "Patient *", scroll the plain list (no type-ahead) and choose "Karthik Varma".
3. Check "Doctor *" (first doctor by default); choose "Dr. Sindhu Reddy" if needed.
4. Open "Nurse/Therapist" and choose "Lakshmi Devi".
5. Replace "Session No." `1` with `3` (it is not derived from his history).
6. Type `12450` in "Shot Count (Begin)".
7. Type `13120` in "Shot Count (End)" → disabled "Total Shots" shows 670.
8. Click `Chin` and `Neck` under "Body Parts" (2 clicks).
9. Type `Laser hair reduction – beard line shaping, session 3 of 6` in "Indications".
10. Under "Skin Type Assessment" choose "Type IV" for "Fitzpatrick Type" and "None" for "Herpes Status" (2 selects).
11. Under "Machine Selection" click the `Soprano Platinum LHR` tile → a table "Soprano Platinum LHR Parameters" appears: rows Area, Fluence, Spot Size × columns Pass 1 … Pass 8.
12. Fill Pass 1 (`Chin`, `10`, `12`) and Pass 2 (`Neck`, `12`, `12`) — 6 cells.
13. Type `Mild perifollicular erythema. Ice pack applied, sunscreen advised.` in "Additional Notes".
14. Click `Save Procedure` → a native browser alert "Procedure saved successfully!" → `OK`. The form stays open: "Session No." is now `4`, shot counts are `0`, the parameter table and notes are cleared; patient, machine, body parts, indications and skin types remain.
15. Click the `Procedure History` tab → "Procedures captured from visits (n found)"; the session just saved is not listed yet.
16. Click `Refresh` → a new card: "Karthik Varma", date and time, badge "Soprano Platinum LHR", "Dr. Sindhu Reddy", buttons `Load & Edit` and `View Details`. None of the shot counts, body parts or pass settings are shown on the card.
17. Click `View Details` → nothing visible happens (the click only sets state that no part of the page renders).

### Variations
- **Repeat next month via `Load & Edit`**: it switches to `New Procedure` and restores only patient, doctor and machine; session number resets to `1`, and body parts, shot counts, per-pass settings, indications and notes come back empty for records saved from this page. `Save Procedure` then creates a **new** record — nothing is edited.
- **Other machines**: `Endymed Pro Max` (Intensity, RF, Depth, Area Treated, Mode × 8 passes), `Fotona Starwalker` (8 rows × 8 passes), `Hydrafacial` (Actives Used, Area × 1 pass).
- **`Analytics` tab**: placeholder "Analytics dashboard coming soon".

### Edge Cases
- **Wrong patient by default**: because the first patient in the list is pre-selected, pressing `Save Procedure` without step 2 files the session under an unrelated patient.
- **Missing machine/patient/doctor**: native alert "Please fill in all required fields" (it does not say which; only Patient and Doctor carry a `*`, Machine does not).
- **Save failure** (including a MANAGER, who sees this page but is refused by `POST /visits`): native alert "Failed to save procedure. Please try again."
- **It is a visit**: the save calls `createVisit`, so the session appears in the patient's visit history, the doctor's "Recent Visits" and the progress tracker as an in-progress visit with no complaints; there is no way to complete it from this page.
- **Fotona table quirk**: the parameter list contains "Area" twice; both rows write to the same key, so typing in one mirrors the other.
- **End below Begin**: "Total Shots" goes negative; no validation.
- **Patient beyond the first 100**: cannot be selected here at all.
- **Nurses cannot log their own procedures**: the page is hidden from NURSE and the save endpoint refuses the role, although the form has a "Nurse/Therapist" field.
- **History card reads other fields**: the card looks for Fluence / Spot Size / Passes in the visit-form procedure shape and for notes under `plan.dermatology.notes`; this page stores per-pass `parameters` and top-level notes, so its own records show only the machine badge.

---

## Redundancy notes

### Duplicate paths to the same goal
- **Start / resume a visit — at least nine entry points**: calendar tile `START`/`CONT` (`components/appointments/CalendarColumn.tsx`), "Appointment Details" › `Start Visit` (`DoctorDayCalendar.tsx`), the same two again under Appointments › `Slots`, Patients row `Start Visit` (`PatientsManagement.tsx`), patient detail `Start new visit` / `Resume last visit` (`app/dashboard/patients/[id]/page.tsx`), tracker `Continue` / `Start Visit` / `Prescribe` / `View` (`PatientProgressTracker.tsx`, also embedded *inside* the visit form header), Visits setup `Start Visit Documentation` (`app/dashboard/visits/page.tsx`), Dashboard "Recent Visits" (`DoctorPatientPanels.tsx`), History cards `Resume session` (`PatientHistoryVisitCard.tsx`), doctor notification bell (`header.tsx`), plus Procedures `Save Procedure` which silently creates a visit. Only the appointment routes link the visit to the appointment; only routes with `visitId`/`appointmentId` pick the right doctor.
- **Save the visit — six triggers**: `Save Draft`, Ctrl/Cmd+S, autosave, `Mark Vitals Complete`, `Save Labs`, and prescription create/export (`MedicalVisitForm.tsx` `save`, `runAutoSave`, `onBeforeExport`). Two of them double as the only way to tick a completion section.
- **Vitals in two places**: `Vitals` tab (8 fields + pain score) and Prescription › "Clinical Details & Vitals" (5 fields), synced by `receiveClinicalData` / `builderRefreshKey`.
- **Diagnosis twice inside one tab**: Prescription › "Diagnosis" text box and "On Examination" › "Dermatology Diagnoses" chips (`PrescriptionBuilder.tsx`), merged on save.
- **Investigations in two places**: `Lab Tests` tab (hard-coded 31-item list, results, autofill) vs Prescription › "Investigations" (same list + clinic-saved + custom, managed via `ClinicInvestigations.tsx`). Separate state during a session.
- **Procedures in three places**: `/dashboard/procedures`, Prescription › "Procedures" / "Procedure Planned", appointment type Procedure. The visit form still carries unused procedure state (`procType`, `fluence`, `spotSize`, `passes`) that only the Procedure History card reads.
- **Fitzpatrick skin type**: Prescription › "On Examination" and Procedures › "Skin Type Assessment", stored in different places.
- **Photo upload**: visit `Photos` tab and patient detail `Uploads` tab (same `VisitPhotos`, `visitId="temp"`); within the tab, `Upload`/`Camera` (header) duplicate `Choose Files`/`Take Photo` (empty state); three separate delete controls.
- **Help**: two different "Visit Documentation Guide" `Quick Guide` dialogs (setup vs form), `Visit Workflow Tour`, and `Shortcuts`.

### Same information on several surfaces
- **Patient identity**: sticky `VisitIdentityBar`, "Patient Context" card, setup "Ready to start visit" line (and the raw internal id is shown in the search dropdown and the context card).
- **Past visits**: setup `Patient History` tab, form `History` tab, "Patient Context" › "Recent Visits", patient detail `History`, Dashboard "Recent Visits", Procedures `Procedure History`, and "Other saved photos" (`PatientPhotoArchive.tsx`).
- **Progress**: header text, header bar, `Overview` › "Progress Summary", footer text — plus the unrelated six-step patient tracker at the top of the same screen.
- **Visit number and status**: header card and `Overview` › "Visit Information".
- **Photo count**: header badge (live), Photos card title (live), `Overview` › "Photos Captured: 0" (hard-coded).
- **Role**: setup "Your Role & Permissions", setup "Available Features", form header "Role: …", `Overview` › "Captured By".
- **Appointment link**: "From Appointment" and "Linked to Appointment" badges together.

### Naming drift
- **Visit**: "Visit", "Visit Documentation", "Medical Visit Documentation", "session" (`Resume session`), "record" ("Most recent record", "n Records"), "consultation" (Dashboard), "encounter" (code).
- **Start/continue**: `START`, `Start Visit`, `Start new visit`, "Start New Visit", `Start Visit Documentation`; `CONT`, "Continue Visit", `Continue`, `Resume last visit`, `Resume session`.
- **Complete**: `Mark Vitals Complete` (a section), `Complete Visit` (the visit), `Complete`/`Pending` badges, tracker step "Complete" (a time heuristic), status `COMPLETED`. `DRAFT` is a UI-only status; `Save Draft` turns it into `IN PROGRESS`.
- **Labs**: "Lab Tests", "Lab Tests (Investigations)", "Investigations", `Save Labs`, "Lab orders".
- **Photos**: "Photos", `Capture Photos`, "Before / After Photos", "Uploads", "Unattached uploads", "Other saved photos".
- **Heart Rate** (Vitals tab) vs **Pulse (bpm)** (Prescription tab, history); temperature °F on entry vs "Temperature (°C)" in history.
- **Review Date** vs "Follow-up date" vs "Follow-up Instructions".
- **Tele-video** vs "Telemedicine"/"TELEMED" (appointments) vs "Online" (patient).
- **Nurse/Therapist**, and a "Therapist" role in guides and permissions that the role enum does not contain.
- **Procedures** (sidebar) vs "Smart Procedures Management" (page).

### Friction and stale paths seen in this topic
- **Completion gate** needs all four tracked sections (4 of a nominal 5 = 80 %), including at least one photo and a `Save Labs` click, and the keyboard-shortcut toast names different requirements (`MedicalVisitForm.tsx` `getProgress`, `save`).
- **Nurse hand-off does not persist**: the UI gives nurses a Vitals tab, but `visits.controller.ts` restricts create/update to DOCTOR/ADMIN/OWNER.
- **Role card fallback**: any role without an entry is shown as "Doctor — Full access" on the setup screen (`visits/page.tsx` `roleInfo`).
- **Doctor default** is the first doctor in the list on every route without `doctorId`/`visitId`/`appointmentId`.
- **Notification link** `/dashboard/visits?appointmentId=…` is ignored without `patientId`.
- **Draft photos never attach** to the visit created afterwards (`VisitPhotos.tsx` ignores `onVisitNeeded`).
- **Procedures page**: first patient pre-selected, non-searchable 100-patient list, native `alert()` feedback, `View Details` does nothing, `Load & Edit` restores three fields and always creates a new record, history needs a manual `Refresh`.
- **Unmounted / dead code in the topic's files**: `components/visits/VisitStateContext.tsx` is imported nowhere; `AppointmentScheduler.tsx` has an unused `handleStartVisit` that would create a visit with a placeholder complaint "General consultation"; the standalone `PhotosPanel` at the bottom of `visits/page.tsx` can never render (`!showForm` inside the `showForm` branch).
