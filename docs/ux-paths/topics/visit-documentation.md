# Topic: visit-documentation

Stories for clinical visit documentation in the Linaé ClinicMS dermatology clinic (Hyderabad): the `/dashboard/visits` setup screen and every way into it, the `MedicalVisitForm` tabs by role, vitals, photos (tagging, draft uploads, compare, archive), voice dictation, Lab Tests with AI autofill, the Tele-video consent gate, autosave and conflict recovery, Save Draft / Complete Visit, the `/dashboard/procedures` page, and the `/test-transcribe` bench.

Seed logins (password `password123`): `admin@clinic.test` (ADMIN), `shravya@clinic.test` (Dr. Shravya Dermatologist, DOCTOR), `praneeta@clinic.test` (Dr. Praneeta Jain, DOCTOR), `reception@clinic.test` (Riya Sharma, RECEPTION). The seed has no NURSE or MANAGER user. Create one first in Users → "New User" (for example "Swathi Kumari", role Nurse).

Code anchors:
- `frontend/src/app/dashboard/visits/page.tsx` (setup screen and form shell)
- `frontend/src/components/visits/MedicalVisitForm.tsx` (tabs, autosave, save and complete)
- `frontend/src/components/visits/VisitPhotos.tsx` and `PatientPhotoArchive.tsx`
- `frontend/src/hooks/useSpeechToTextRecorder.ts` (voice input, used in the Prescription tab)
- `frontend/src/app/dashboard/procedures/page.tsx`
- `frontend/src/app/test-transcribe/page.tsx`
- `backend/src/modules/visits/visits.controller.ts`, `visits.service.ts` and `consultation.ts`

**Role reality check (frontend vs backend):**
- The form's `ROLE_PERMISSIONS` gives DOCTOR, ADMIN and OWNER every tab (Overview, Vitals, Photos, Prescription, Lab Tests, Customization, History).
- NURSE gets Overview, Vitals, Photos and History. RECEPTION gets Overview, Photos and History. MANAGER is not in the map, so it gets only Overview and History.
- The backend allows `POST /visits`, `PATCH /visits/:id`, `POST /visits/:id/complete` and visit-photo deletes only for DOCTOR, ADMIN and OWNER. Every save by a nurse, receptionist or manager therefore fails.

---

## STORY-401: Dr. Shravya documents an acne follow-up end to end, from a calendar tile to Complete Visit

**Type**: long
**Topic**: visit-documentation
**Persona**: Dr. Shravya (DOCTOR), a consultant dermatologist running a busy Saturday OPD
**Goal**: Document Ananya Reddy's (24F, Kondapur) 6-week acne vulgaris follow-up: vitals, photos, examination, prescription and labs. Then complete the visit so the appointment shows Completed.
**Preconditions**:
- Ananya Reddy has a booked OPD Consultation with Dr. Shravya today at 11:30.
- She has one earlier visit with front and left-profile photos and a CBC result.
- `OPENAI_API_KEY` does not matter for this story.

**Ideal path**: 8 steps. Open the visit from the appointment, enter vitals, add photos, fill complaints, diagnosis and Rx, then press Complete. The code adds a mandatory "Save Labs" and photo step just to reach the 80% gate.
**Alternate paths**: The same visit form opens from:
- The Calendar tile "Start Visit" / "Continue Visit" (`DoctorDayCalendar` → `?patientId&appointmentId&autoStart=true` or `&visitId`).
- The double-click "Appointment Details" dialog → "Start Visit".
- The Slots tab (`AppointmentScheduler`, which creates the visit on the server before navigating).
- Patients row "Start Visit" (`?patientId&autoStart=true`).
- The patient detail page "Start visit" / open-last-visit buttons.
- PatientProgressTracker "Start Visit" / "Continue".
- The Dashboard "Recent Visits" link (`?patientId&visitId`).
- The History tab "Resume session".
- Visits → "Start New Visit" → "Start Visit Documentation".
- The doctor notifications bell item (`?appointmentId=` only; see Defects).

### Steps
1. Log in at `/login` as `shravya@clinic.test` / `password123` → Dashboard with "Recent Visits" and "My Patients" panels.
2. Open **Appointments** in the sidebar, keep the Calendar tab, and find Ananya Reddy's 11:30 tile → the tile shows a "Start Visit" action.
3. Click **Start Visit** on the tile → `/dashboard/visits?patientId=…&appointmentId=…&autoStart=true` loads. The heading "Visit Documentation" shows a "From Appointment" badge and a line "Patient: … • Doctor: Dr. … • 11:30 • OPD_CONSULTATION". The compact PatientProgressTracker sits under the heading.
4. Read the form header card → "Visit #2" with a "DRAFT" badge, a "Linked to Appointment" badge, and "Medical Visit Documentation • Role: DOCTOR • Progress: 0%". It also shows a "0 Photos" badge, "Visit Workflow Tour" and "Shortcuts". Dr. Shravya notices the appointment link is badged twice: "From Appointment" on the page and "Linked to Appointment" on the card.
5. Glance at the left **Patient Context** card → name, "ID: …", age and gender, phone, any red "⚠️ ALLERGIES" box, and "Recent Visits" (2 most recent, with diagnoses).
6. Leave "Consultation type" on **In-person**.
7. Click **Vitals** (or Overview → Quick Actions "Record Vitals"). Enter:
   - BP Systolic 112, BP Diastolic 74, Heart Rate 78
   - Temperature 98.4 (°F), Weight 54 (kg), Height 158 (cm), Resp. Rate 16

   → BMI auto-fills 21.6. There is no SpO₂ input even though the payload supports it.
8. Click **Mark Vitals Complete** → this is the first server save, so the visit is created. Toast "Visit saved" / "Your draft was saved safely." The Vitals tab gets a green dot. The footer reads "Progress: 20% • 1 of 5 sections complete" and the header shows "Saved 11:34 AM".
9. Click **Photos** → card "Before / After Photos (0)" with empty state "No photos attached to this visit", plus "Choose Files" / "Take Photo". Below it, "Other saved photos" lists last visit's photos.
10. Click **Choose Files** and pick 3 phone photos (front, left cheek, right cheek) → the "Tag photo positions" dialog opens in Single mode with Front, Left and Right pre-inferred.
11. Fix the third photo to "Right" via the Select, then click **Upload** → button shows "Uploading (1/1) - 64%". Toast "Photos uploaded" / "3 image(s) uploaded.". The header badge shows "3 Photos" and the Photos tab gets a green dot (40%).
12. Open **Overview** → the Progress Summary shows Vitals and Photos as Complete. The "Visit Information" card still says "Photos Captured: 0" while the header says "3 Photos" (see Defects).
13. Click **Prescription** → PrescriptionBuilder opens. Its "Clinical Details & Vitals" section already shows Height 158, Weight 54, BP 112/74 and Pulse 78 (synced from the Vitals tab).
14. Expand **Chief Complaints**, type "Persistent papules and pustules on both cheeks, fewer new lesions since doxycycline", and tick Skin Concerns "Acne" and "Scarring".
15. Under **Diagnosis** / **On Examination**, pick "Acne vulgaris" among Dermatology Diagnoses and type in "Detailed Examination" → the Prescription tab shows its "At least 4 key sections filled" pulsing dot once enough is filled.
16. Add medications (for example Adapalene 0.1% gel HS and a doxycycline taper), then click **Create Prescription** (prescription details are covered in the prescriptions topic) → the Prescription section is marked complete (60%).
17. Dr. Shravya tries **Complete Visit** → the button is disabled. Pressing Cmd/Ctrl+Shift+S shows the toast "More details needed to complete" / "Fill vitals, complaints, diagnosis, and prescription to reach at least 80% before completing." She has done all of that, which confuses her.
18. She opens **Lab Tests** ("Lab Tests (Investigations)") because labs are the only remaining section. She ticks "Vitamin D" and "CBC" → an "Enter Results" grid appears (Vitamin D with ng/mL; CBC with Hemoglobin/WBC/Platelets).
19. She ticks **Compare with previous visit** → each CBC sub-row shows a "Δ" delta against last visit's values, or "—".
20. She enters Hemoglobin 12.1 and Vitamin D 18, then clicks **Save Labs** → "Visit saved". Lab Tests gets a green dot and progress reaches 80%.
21. Click **Complete Visit** → the button reads "Completing...". Toast "Visit completed" / "All documentation has been marked complete." Both status badges change to "COMPLETED" and the local draft is removed.
22. Go back to Appointments → Ananya's tile now shows as Completed (the backend sets the appointment to COMPLETED in the same transaction).
23. Open **History** in the form → "Patient Visit History" lists today's visit with a green dot, plus a "Resume session" button.

### Variations
- **Entry from Slots tab**: "Start Visit" in the Appointment Scheduler creates the visit immediately with a placeholder complaint "General consultation". It then opens `?visitId&patientId&appointmentId&autoStart=true`, so the form starts at an existing visit (autosave active from the first keystroke).
- **Entry via Ctrl/Cmd+S**: Save Draft works from any tab without clicking.
- **Customization tab**:
  - Before printing, the doctor sets Top Margin 160, ticks "Grayscale Mode", and clicks **Save Doctor Default** → toast "Saved" / "Doctor profile updated".
  - The next visit auto-applies it. "Load Doctor Default" re-applies it. "Choose File" sets a one-off letterhead image (data URL stored in localStorage per doctor).
- **No labs needed**: a doctor who orders no investigations must still open Lab Tests and press "Save Labs" with nothing selected to reach 80%.
- **No photos**: a doctor treating a scalp complaint without photos can never reach 80% (only 4 sections can ever be marked; Customization never is).

### Edge Cases
- **Completing an already completed visit**: the server returns it unchanged. The form stays fully editable after completion, and "Save Draft" still PATCHes a COMPLETED visit, because the backend `update` has no status check.
- **Appointment cancelled meanwhile**: the first save returns 400 "Cannot create a visit from a cancelled or completed appointment" → toast "Unable to save visit".
- **Edits during save**: if fields change while Complete is in flight, it throws "New changes were entered while saving. Please save again before completing or exporting."

---

## STORY-402: Dr. Praneeta starts a walk-in visit from the Visits setup screen

**Type**: medium
**Topic**: visit-documentation
**Persona**: Dr. Praneeta Jain (DOCTOR), seeing an unscheduled walk-in between appointments
**Goal**: Start documentation for Mohammed Imran (35M, Tolichowki) with an itchy annular rash, using the Visits page rather than a calendar tile.
**Preconditions**:
- Mohammed Imran exists as a patient but has no appointment today.
- At least two doctors exist (seed: Shravya and Praneeta).

**Ideal path**: 4 steps. Visits → type patient name → pick patient (doctor defaults to the signed-in doctor) → Start Visit Documentation.
**Alternate paths**:
- Patients row "Start Visit".
- Patient detail page "Start visit" button.
- PatientProgressTracker "Start Visit".
- Create the patient as Walk-in in "Create Patient" (auto-books an appointment), then Calendar tile "Start Visit".

### Steps
1. Log in as `praneeta@clinic.test` and click **Visits** in the sidebar → "Visit Documentation" / "Create and manage patient visits with role-based documentation", with a "Visit Documentation Guide" QuickGuide button.
2. Read the **Your Role & Permissions** card → "Current Role" badge "Doctor", "Full access to all visit documentation features".
3. In **Start New Visit**, click "Select Patient" (placeholder "Search name, phone, or email") and type "imran" → the menu shows "Searching…", then rows with name, "ID: …", 📞 phone and ✉️ email.
4. Use ↓ and Enter (or click) to choose Mohammed Imran → the field fills with his name, and the tabs "Ready to Start" / "Patient History" appear.
5. Open the **Select Doctor** dropdown, expecting both doctors → it lists only one doctor (the page fetches `/users?role=DOCTOR&limit=1`; newest first). If that is not Dr. Praneeta, she cannot pick herself (see Defects).
6. Read "Ready to start visit" → it reads "Patient: Unknown • Doctor: Dr. …", because the page only holds the first patient from `getPatients({limit:1})`.
7. Click the **Patient History** tab → "No documented history to show", or a timeline with a "Refresh" button, a "n Records" badge and "Most recent record" on the top card. Visits with a prescription show "View Prescription" → the "Prescription Details" dialog has "Prescription Overview", "Medications" and "Print".
8. Return to **Ready to Start** and click **Start Visit Documentation** → the form opens with "Visit #n", "DRAFT", "Progress: 0%" and the status text "Unsaved changes" after the first edit.
9. Note there is no "From Appointment" badge. "Back to Setup" is the only way back; "Back to Calendar" appears only when appointment data exists.
10. Fill Vitals, then press **Save Draft** → the visit is created (POST `/visits`). Toast "Visit saved". Autosave now runs every 8 s after edits ("Auto-saving…", then "Saved h:mm").

### Variations
- **Empty clinic**: with no patients or no doctors, the page shows "Setup Required" with "No patients found / Add at least one patient to create visits" or "No doctors found", plus "Manage Patients" / "Manage Users" buttons.
- **Deep link** `?patientId=<id>&autoStart=true` (Patients row "Start Visit") skips the setup screen and opens the form with the single fetched doctor preselected.
- **Keyboard**: Esc closes the patient menu, and ↑/↓ moves the highlight (also listed in the "Keyboard Shortcuts" dialog, although those keys only work on the setup screen).

### Edge Cases
- **Search with no match** ("zzz") → "No results".
- **`/auth/me` fails** → the role silently defaults to DOCTOR, so the setup card claims full access.
- **Same information on several surfaces**: the patient and doctor names appear in the page sub-heading ("Patient: … • Doctor: Dr. …"), the Ready-to-start line and the Patient Context card. The two QuickGuides on this page (setup and form) are different texts with the same title, "Visit Documentation Guide".

---

## STORY-403: Nurse Swathi records pre-consult vitals and hits a backend wall

**Type**: medium
**Topic**: visit-documentation
**Persona**: Swathi Kumari (NURSE, created by admin), who takes vitals in triage before the doctor sees the patient
**Goal**: Record vitals for Lakshmi Prasanna (42F, Kukatpally, melasma review) so Dr. Shravya sees them when she opens the visit.
**Preconditions**:
- Admin created Swathi with role "Nurse" in Users → "New User".
- Lakshmi has an 11:00 appointment with Dr. Shravya and no visit yet.

**Ideal path**: 4 steps. Open the appointment's visit → Vitals → enter values → save. The doctor then sees them.
**Alternate paths**:
- Sidebar Visits → Start New Visit.
- Appointments tile "Start Visit".
- Patients row "Start Visit".

### Steps
1. Log in as Swathi → the sidebar shows Dashboard, Patients, Appointments, Visits and Rooms.
2. Click **Visits** → the "Your Role & Permissions" card shows the "Nurse" badge: "Can record vitals, capture photos, complaints, and basic assessments". "Available Features" lists Full Vitals, Photo & Complaints and Assessment Notes.
3. Select Lakshmi Prasanna and Dr. Shravya, then click **Start Visit Documentation** → the form shows only the **Overview**, **Vitals**, **Photos** and **History** tabs. The header says "Role: NURSE". The footer says "0 of 3 sections complete" and offers only "Save Draft" (no Complete Visit).
4. Look for a complaints or assessment field promised by the role card → none exists. Complaints live only in the Prescription tab, which is doctor-only.
5. Click Overview → Quick Actions **Record Vitals** → Vitals tab.
6. Enter BP 128/84, Heart Rate 88, Temperature 98.8, Weight 67, Height 155, Resp. Rate 18, Pain Score 0.
7. Click **Mark Vitals Complete** → the form POSTs `/visits`. The backend `@Roles(DOCTOR, ADMIN, OWNER)` rejects it with 403 → toast "Unable to save visit" (the server's Forbidden message). The header shows "Save failed" in red, and Vitals is not marked complete.
8. Swathi tries **Save Draft** → the same failure.
9. She switches to **Photos**, uploads two cheek photos and tags them "Left" / "Right" → the upload succeeds as **draft** photos (`POST /visits/photos/draft/:patientId` has no role guard). Toast "Photos uploaded".
10. She sees a red "Delete" button on each photo, but she would get "Delete failed" for any non-draft visit photo (backend delete is DOCTOR/ADMIN/OWNER only).
11. She closes the tab, assuming the doctor will see her work → the vitals exist only in her browser's localStorage, and the photos are "Unattached uploads".
12. Dr. Shravya opens the visit on her own machine → no vitals. The photos appear only under "Other saved photos" → "Unattached uploads — <date>".

### Variations
- **Existing visit**: if the doctor had already created the visit, Swathi's edits trigger autosave PATCH → 403 → toast "Auto-save failed" (no retry for 4xx). The draft is kept locally.
- **Keyboard**: Ctrl+Shift+S as a nurse → "Doctor access required" / "Only doctors can complete a visit. Save a draft instead."

### Edge Cases
- **Manager instead of nurse**: a MANAGER sees Visits in the sidebar, but the role card shows "Doctor – Full access…" (fallback) while the form shows only Overview and History, with empty Quick Actions.
- **Progress**: a nurse's footer reads "x of 3 sections complete", but only Vitals and Photos can ever be completed (max 67%).

---

## STORY-404: Receptionist Riya captures "before" photos for a laser-hair-reduction patient

**Type**: short
**Topic**: visit-documentation
**Persona**: Riya Sharma (RECEPTION), front desk, who often takes intake photos while the doctor is busy
**Goal**: Upload baseline photos of Sai Teja Goud's (29M, Gachibowli) beard line before his first laser session.
**Preconditions**: Sai Teja exists as a patient. Reception has no Visits sidebar item.

**Ideal path**: 4 steps. Find patient → open photo capture → upload with positions → confirm the photos are attached to today's visit.
**Alternate paths**:
- Patients row "Start Visit" (the only reception route).
- The patient detail "Uploads" tab shows the archive read-only.

### Steps
1. Log in as `reception@clinic.test` and go to **Patients**, then search "sai teja" → his row shows the "Start Visit" button.
2. Click **Start Visit** → `/dashboard/visits?patientId=…&autoStart=true` opens the form with Overview, Photos and History tabs. Doctor is preselected to the single fetched doctor.
3. Click **Photos** → "Before / After Photos (0)" → **Take Photo** (opens the rear camera on a tablet via `capture="environment"`).
4. Capture Front, Left and Right → "Tag photo positions" opens. Riya switches **Mode** to **Grid**, sets each Select, then clicks **Upload** → toast "Photos uploaded". They show in the viewer with "Uploaded: <date time> • Front".
5. Riya clicks **Save Draft** to "attach" them → toast "Unable to save visit" (403). The photos remain unattached draft uploads.

### Variations
- **Infer positions**: in the tag dialog this simply assigns Front, Left, Right, Back, Close-up, Other in order. It is not AI.
- **Non-image file** (a PDF consent form) → it is skipped, and the toast is "Upload completed with warnings" / "Skipped: 1 (… not an image)".

### Edge Cases
- **More than 6 photos**: uploads are sent in batches of 6, up to 4 at once. If every batch fails, the toast still says "Upload completed with warnings" rather than an outright failure.
- **Hidden Lab Tests content**: reception's permission set (`basic-info`) renders the Lab Tests content, but no tab trigger exists, so it can never be seen.

---

## STORY-405: Dr. Shravya compares melasma photos across visits and removes a blurry shot

**Type**: medium
**Topic**: visit-documentation
**Persona**: Dr. Shravya, reviewing treatment response
**Goal**: Show Lakshmi Prasanna her melasma improvement (Visit 2 vs Visit 4) side by side, and delete one blurry photo from today's set.
**Preconditions**:
- Lakshmi has visits 1–3 with Front, Left and Right tagged photos.
- Today's visit (Visit 4) is saved and has 4 photos: Front, Left, Right, and a blurry Close-up.

**Ideal path**: 5 steps. Photos tab → Compare: On → choose the earlier visit → step through position pairs → delete the bad photo.
**Alternate paths**:
- The patient detail page "Uploads" tab (PatientPhotoArchive, read-only).
- The form's "Other saved photos" section under the Photos card.
- PatientHistoryVisitCard photo counts in History.

### Steps
1. Open the visit via Dashboard → **Recent Visits** → Lakshmi's row → the form loads with "Visit #4" and "4 Photos".
2. Click **Photos** → main viewer with thumbnail strip; meta "Uploaded: … • Front"; **Prev** / **Next** buttons.
3. Click **Compare: Off** → it toggles to **Compare: On**. "Compare against:" defaults to "Visit 3 - <date>".
4. Change the Select to "Visit 2 - <date>" → two panes appear, captioned "Visit 2 - Front" and "Visit 4 - Front". The pair navigator reads "Position: Front • 1 / 4".
5. Click **Next** twice → "Left", then "Right". At "Close-up" the left pane shows "No photo".
6. Toggle Compare off, then hover the blurry Close-up thumbnail (4th) while the Front photo (1st) is active.
7. Click the small red trash icon on the **Close-up thumbnail** → confirm "Delete this photo? This cannot be undone." → OK.
8. Observe the result → the **Front** photo (the one that was active) is deleted instead of the Close-up. The thumbnail handler sets the index and then calls `deleteActive` with the stale `active` (see Defects). The count drops to "Before / After Photos (3)".
9. Re-select the Close-up in the strip, then use the header **Delete** button → the correct photo is removed.
10. Scroll down to **Other saved photos** → groups "Visit — <date> (n)" and "Unattached uploads — <date> (n)". Each image opens in a new tab.

### Variations
- **Delete as nurse or reception**: the Delete buttons show, but the backend returns 403 → toast "Delete failed" / "Failed to delete photo."
- **Photo load failure**: "Unable to load this visit's photos. Please retry." with **Retry visit photos**. An archive failure shows "Retry saved photos".

### Edge Cases
- **Concurrent edit**: a 409 on upload or delete (the visit changed elsewhere) triggers the conflict banner (see STORY-409).
- **Photo count on four surfaces**: the header badge "n Photos", the card title "Before / After Photos (n)", Overview "Photos Captured" (hard-coded 0) and Progress Summary "Photos: Complete/Pending".

---

## STORY-406: Dictating chief complaints and examination by voice

**Type**: short
**Topic**: visit-documentation
**Persona**: Dr. Praneeta, who prefers dictating in a mix of English and Telugu terms while examining
**Goal**: Fill "Chief Complaints" and "Detailed Examination" for Venkatesh Rao (56M, psoriasis) by speaking instead of typing.
**Preconditions**: The visit form is open on the Prescription tab. The browser has a microphone. `OPENAI_API_KEY` is configured.

**Ideal path**: 3 steps. Tap mic → speak → tap again; the text is appended to the field.
**Alternate paths**: `/test-transcribe` (a diagnostic bench, not wired to a visit). No mic exists on the Subjective/Objective/Assessment/Plan fields: their `VoiceButton` in MedicalVisitForm is never rendered.

### Steps
1. In the Prescription tab, expand **Chief Complaints** → a textarea with a mic button ("Start voice input").
2. Click the mic → the browser asks for microphone permission → Allow. The button turns red with a MicOff icon ("Stop voice input"), and the other mic buttons are disabled.
3. Say "Scaly plaques over both elbows and scalp for eight months, itching worse at night, on methotrexate earlier" and click the mic again → a spinner appears ("Transcribing recording"). The audio uploads to `/api/visits/transcribe`, and the patient-preferred text is **appended** to the existing complaint.
4. Expand **On Examination** and use the mic next to "Detailed Examination" → "Well-demarcated erythematous plaques with silvery scale, elbows, knees, scalp; nail pitting present" is appended.

### Variations
- **Denied permission** → toast "Microphone access denied" / "Check browser permissions and try again."
- **Unsupported browser** → "Voice capture unavailable" / "Microphone recording is not supported in this browser."
- **Silence** → "No speech detected"; an empty blob gives "No audio recorded".
- **Missing API key** → 503 → "Speech-to-text error" / "Speech transcription is temporarily unavailable. Try again shortly."
- **Expired session** → redirect to login.

### Edge Cases
- **Ten-minute cap**: recording auto-stops after 10 minutes.
- **Leaving the tab**: navigating away mid-recording cancels capture.

---

## STORY-407: AI-autofilling pre-methotrexate labs from a diagnostic-centre PDF

**Type**: medium
**Topic**: visit-documentation
**Persona**: Dr. Shravya, starting a patient on methotrexate who needs baseline LFT/CBC/RFT
**Goal**: Pull Venkatesh Rao's Vijaya Diagnostics report (PDF, 3 pages) into the Lab Tests tab without retyping, then compare it with last visit.
**Preconditions**: The visit is saved, the previous visit has LFT and CBC values, and `OPENAI_API_KEY` is set.

**Ideal path**: 3 steps. Lab Tests → choose file → review the auto-ticked tests and values → Save Labs.
**Alternate paths**:
- Manual checkbox selection and entry in the same tab.
- Investigations can also be listed in the Prescription tab's investigations section (ClinicInvestigations), which is a separate list from Lab Tests.

### Steps
1. Click **Lab Tests** → card "Lab Tests (Investigations)", "Select tests and enter results with units. You can also autofill from a photo.", with 31 checkboxes (CBC, ESR, CRP, LFT, … Skin Biopsy).
2. In the footer, use the file input (hint "Accepts JPG, PNG, or PDF") and choose `Venkatesh_Rao_VijayaDiagnostics.pdf` → the "Save Labs" button changes to "Processing…".
3. Wait → toast "Autofill complete" / "Extracted results inserted." Tests are ticked automatically (for example CBC, LFT, RFT), and "Enter Results" fills with values and units per page.
4. Notice a card titled "Lipid Profile" → the AI's name doesn't match the checkbox label "Fasting lipid profile", so it shows a results card with no checkbox to untick.
5. Tick **Compare with previous visit** → "Δ +4" next to ALT (SGPT), "—" where last visit had no value.
6. Correct Platelets from "2.1" to "210" (lakh/µL confusion) in the Value input.
7. Click **Save Labs** → "Visit saved". The tab gets a green dot. The footer note says "Selections and results are saved under Treatment Plan → Dermatology."

### Variations
- **Phone photo of the report (JPG)**: the same flow with one page.
- **Missing key**: no `OPENAI_API_KEY` gives the toast "Autofill failed" / "AI autofill failed: 503 {…AI autofill is unavailable. Contact an administrator to configure OPENAI_API_KEY.}". The raw JSON appears in the toast.

### Edge Cases
- **Non-lab image** → `{labs:{}}`, which still says "Autofill complete" with nothing inserted.
- **Unticking a composite test** (CBC) removes its sub-results immediately; re-ticking restores blank defaults, not the AI values.

---

## STORY-408: Tele-video follow-up blocked until consent is recorded

**Type**: short
**Topic**: visit-documentation
**Persona**: Dr. Praneeta, doing a video follow-up with Harika Chowdary (31F, now in Vizag) for chronic urticaria
**Goal**: Mark the consultation as Tele-video, record consent, and save.
**Preconditions**: A Telemedicine appointment exists (room "Telemedicine Suite"), and the visit form is open from its tile.

**Ideal path**: 3 steps. Consultation type Tele-video → tick consent → Save Draft. Ideally a Telemedicine appointment would preselect Tele-video; the code does not.
**Alternate paths**: none found. Consent can only be set in the form header card.

### Steps
1. In the header card, note "Consultation type" shows **In-person**, although the appointment type is Telemedicine.
2. Change it to **Tele-video** → a box appears with an unchecked "Patient consented to tele-video consultation" and red help text "Patient consent is required before saving a tele-video consultation."
3. Press **Save Draft** without ticking → toast "Patient consent required". Autosave silently stays at "Unsaved changes".
4. On Photos, try to upload a screenshot of the hives → the upload is not blocked for draft-mode visits (the consent check is only in the unused `onVisitNeeded`).
5. Tick the consent box → the help text changes to "Consent will be recorded with your account and the save time."
6. Click **Save Draft** → "Visit saved". The server stores `teleVideoConsentById` and `teleVideoConsentAt`.

### Variations
- **Switch back to In-person**: switching back and then to Tele-video again clears the tick, so consent must be re-confirmed.
- **Restored draft**: a restored local draft keeps Tele-video and its tick only if both were saved together.

### Edge Cases
- **Export or print**: PrescriptionBuilder export also requires consent (`onBeforeExport` → save).
- **Revoking consent**: unticking it on a saved tele-video visit → the server rejects with 400 "Patient consent is required…".

---

## STORY-409: Two doctors edit the same visit; autosave conflict and recovery

**Type**: medium
**Topic**: visit-documentation
**Persona**:
- Dr. Shravya, on the consultation room PC.
- Dr. Praneeta, covering on a laptop. She opens the same visit to add a procedure plan.

**Goal**: Recover cleanly when the visit changes elsewhere, without silently losing either doctor's notes.
**Preconditions**: Ananya Reddy's visit is saved (it has a version). Both doctors have it open.

**Ideal path**: 3 steps. See the conflict notice → choose keep or discard → reload the saved visit.
**Alternate paths**:
- The same visit opens in two browser tabs of one user (this triggers the "Draft changed in another tab" toast instead).

### Steps
1. Dr. Praneeta edits Vitals (weight 54 → 55) on the laptop → after 8 s the status shows "Auto-saving…", then "Saved 12:02 PM". The server version increments.
2. Dr. Shravya, on her stale copy, changes Heart Rate to 82 → after 8 s, autosave PATCH sends the old version and gets 409.
3. Observe → toast "Visit changed elsewhere" / "Your draft is retained and autosave is paused. Use the conflict notice to discard it and reload the saved visit." An amber banner reads "This visit changed elsewhere. Your local draft is retained." The header shows "Save failed".
4. Dr. Shravya presses **Save Draft** → toast "Unable to save visit" / "Visit changed; reconcile the saved visit before saving". Saves stay blocked, including prescription saves.
5. She copies her HR note mentally and clicks **Discard draft and reload saved visit** → the button reads "Loading saved visit…". The form re-mounts with the server copy (weight 55, her HR change gone). Autosave resumes.
6. She re-enters HR 82 → "Saved".

### Variations
- **Same user, two tabs**: editing in tab B shows "Draft changed in another tab" / "Your local form may be out of date." in tab A, but nothing is blocked.
- **Reload fails**: a network error during reload gives "Unable to reload saved visit" / "Your draft is still available. Please try again."
- **Closing the browser after a conflict**: the conflict flag is persisted in the draft, so reopening shows the banner again.

### Edge Cases
- **No merge or diff**: the banner offers only "discard", never a merge or a diff of what changed. Keeping edits means the doctor must retype after discarding.
- **Appointment-linked double create**: if two people "Start Visit" from the same appointment, the second create gets 409 "Visit already exists for this appointment". The form adopts the existing visit id but enters the blocked-conflict state.

---

## STORY-410: Walk-in documentation lost after a refresh, and session expiry mid-visit

**Type**: short
**Topic**: visit-documentation
**Persona**: Dr. Praneeta, whose laptop browser restarts for an update mid-consult
**Goal**: Get back the vitals and notes she had typed for walk-in patient Mohammed Imran before saving.
**Preconditions**: The visit was started from Visits → Start New Visit (no appointment). Nothing has been saved to the server yet; the status shows "Unsaved changes".

**Ideal path**: 2 steps. Reopen the visit → the draft is restored automatically.
**Alternate paths**: none found. There is no "recover drafts" UI.

### Steps
1. Type vitals and complaints → the status reads "Unsaved changes". No autosave runs: autosave needs an existing visit id, although the QuickGuide says "Save progress automatically as you work".
2. Press browser reload → the browser shows its "Leave site?" prompt (`beforeunload`) → she confirms.
3. Re-select Mohammed and click **Start Visit Documentation** → the form is empty. The draft was stored under a localStorage key containing the previous page-render timestamp (`date-<ISO>`), so it is never found again.
4. Clicking **Back to Setup** and re-entering behaves the same way: no warning, and a fresh key.

### Variations
- **Appointment- or visit-linked visits**: their keys are stable (`appt-<id>` / `visit-<id>`), so reload restores the draft with the active tab and completed sections.
- **Session expiry**: when the JWT cookie expires during autosave, a 401 gives the toast "Not signed in" / "Your session expired. Please sign in to continue." Autosave stops and the draft stays local.

### Edge Cases
- **Shared workstation**: drafts persist in localStorage indefinitely (keyed by doctor and patient), so a shared workstation keeps PHI drafts until completion or discard.

---

## STORY-411: Recording a Soprano laser hair reduction session on the Procedures page

**Type**: medium
**Topic**: visit-documentation
**Persona**: Dr. Shravya, running the procedure room, with nurse Swathi assisting
**Goal**: Log Sai Teja Goud's session 3 of laser hair reduction (beard line) on the Soprano Platinum, with per-pass parameters, then review past sessions.
**Preconditions**: Sai Teja exists (within the first 100 patients). Swathi exists as a NURSE.

**Ideal path**: 6 steps. Pick patient/doctor/nurse → session no. → body part → machine → fill pass grid → Save.
**Alternate paths**:
- The visit form's Prescription → "Procedures" section and the visit-level procedure fields (procType/fluence/spotSize/passes) record a procedure inside a normal visit.
- Procedure History reads visits filtered by `plan.dermatology.procedures`.

### Steps
1. Click **Procedures** in the sidebar → "Smart Procedures Management" / "Advanced procedure planning and tracking with machine-specific parameters", with the "Procedures Management Guide" button and tabs **New Procedure / Procedure History / Analytics**.
2. In **Basic Information**:
   - "Patient *" defaults to the first patient. Change it to Sai Teja Goud (a plain Select of up to 100 names, no search).
   - "Doctor *" Dr. Shravya.
   - "Nurse/Therapist" Swathi Kumari.
3. In **Procedure Metrics**, set Session No. 3, Shot Count (Begin) 15200 and (End) 16850 → "Total Shots" shows 1650. Toggle the body part "Chin" and "Neck". In Indications, type "Pseudofolliculitis barbae, beard line shaping".
4. In **Skin Type Assessment**, set Fitzpatrick "Type IV", Herpes Status "None".
5. In **Machine Selection**, click "💫 Soprano Platinum LHR" → a "Soprano Platinum LHR Parameters" table appears with rows Area / Fluence / Spot Size and columns Pass 1–8.
6. Fill Pass 1–3: Area "Beard line", Fluence "10, 12, 12", Spot Size "Small".
7. Add Additional Notes "Mild perifollicular erythema, ice applied" and click **Save Procedure** → the browser `alert('Failed to save procedure. Please try again.')`. The payload has no `complaints` array, so the backend's `CreateVisitDto` rejects it (see Defects).
8. Open **Procedure History** → "Procedure History" / "Procedures captured from visits (n found)" with **Refresh**. Earlier sessions recorded through the visit form appear as cards with patient, date/time, a machine badge and "Dr. …".
9. Click **Load & Edit** on session 2 → the form switches to New Procedure, prefilled with machine, Fitzpatrick type and notes. Session No resets to 1 ("we don't track this").
10. Click **View Details** on a card → nothing happens.
11. Open **Analytics** → "Procedure Analytics" / "Analytics dashboard coming soon".

### Variations
- **Fotona Starwalker**: the grid lists "Area" twice. Typing in either Area row fills both.
- **Hydrafacial**: has 1 pass column only (Actives Used, Area).
- **Missing machine**: no machine selected gives `alert('Please fill in all required fields')`.

### Edge Cases
- **Load & Edit cannot update**: Save always creates a new visit (if save worked), so "Load & Edit" can only duplicate, never update.
- **Stale parameters**: switching machine keeps old parameter keys in `machineParameters`.
- **History scope**: history only covers the currently selected patient. Cards display Fluence/Spot Size/Passes only from the visit form's single-procedure fields, never this page's per-pass grid.

---

## STORY-412: Admin sanity-checks speech transcription on /test-transcribe

**Type**: short
**Topic**: visit-documentation
**Persona**: Clinic admin (`admin@clinic.test`), checking that Whisper/OpenAI works before doctors rely on dictation
**Goal**: Record a short Telugu-English mixed test phrase, transcribe it, and inspect speaker split and diagnostics.
**Preconditions**: `OPENAI_API_KEY` is set and a microphone is available.

**Ideal path**: 3 steps. Start Recording → Stop → Transcribe.
**Alternate paths**: Sidebar Admin → "Test Transcribe" (OWNER/ADMIN/DOCTOR). A direct URL works for anyone, because the page is outside the middleware matcher.

### Steps
1. Click **Test Transcribe** in the sidebar → the full-page "Voice Transcription Test" (no dashboard shell), with "Test the OpenAI Whisper transcription API with speaker diarization" and **Back to dashboard**.
2. In the "Recording" card, click **Start Recording** → the badge reads "Recording" and a duration timer starts. An "Audio Level" meter appears (a "⚠️ Low audio level…" hint shows below 20%).
3. Speak a doctor/patient exchange for about 20 s ("Doctor: Ela unnaru? Patient: Itching takkuva ayyindi…") and click **Stop Recording** → "Idle", "n chunks". The Playback audio player appears, along with **Transcribe**, **Download** and **Clear** buttons.
4. Click **Transcribe** → "Transcribing...", then "Transcription Results" with tabs **Combined / By Speaker / Segments**. By Speaker shows "Doctor" and "Patient" blocks; Segments shows a speaker badge and confidence.
5. Review **Diagnostics** → Chunks, Total Size, Recording Format, Duration, Avg. Bitrate, Sample Rate, "Backend Processing: WebM → WAV → gpt-4o-transcribe → Transcription", and Chunk Details.
6. Click **Back to dashboard** → a full document navigation stops the microphone.

### Variations
- **Logged-out user** opening `/test-transcribe`: the page renders. Transcribe shows a red alert "Transcription failed: 401 - {…}" with no redirect to login (unlike the in-visit mic).
- **Missing key** → alert "Transcription failed: 503 - …configure OPENAI_API_KEY."

### Edge Cases
- **Clear** wipes chunks and transcription with no confirmation.
- **Microphone permission denied** → the alert shows the browser error text.

---

## Redundancy & multi-surface notes (for consolidation)

- **Ten-plus ways to open the visit form** (listed in STORY-401). Two of them behave differently:
  - The Slots tab pre-creates a server visit with a placeholder complaint.
  - The notification link passes only `appointmentId`, which the page ignores.
- **Vitals edited in two places**: the Vitals tab (BP Systolic/Diastolic, Heart Rate, Temperature °F, Weight, Height, BMI, Resp. Rate, Pain Score) and Prescription → "Clinical Details & Vitals" (Height, Weight, BMI, BP Sys/Dia, Pulse). They are kept in sync by `receiveClinicalData`.
- **Progress shown four times**:
  - Header card description "Progress: x%".
  - The header progress bar.
  - Overview → Progress Summary "Overall Progress".
  - The footer "Progress: x% • n of 5 sections complete".
- **Patient history shown four times**:
  - Visits setup → "Patient History" tab.
  - Form → History tab ("Patient Visit History").
  - Patient Context → "Recent Visits".
  - Patient detail → History tab.
- **Appointment linkage badged twice**: "From Appointment" (page) and "Linked to Appointment" (form card).
- **Role shown in three places**: the setup "Your Role & Permissions" card, header "Role: DOCTOR" and Overview "Captured By".
- **Photos also in three places**: Photos tab, "Other saved photos" (same tab) and patient detail "Uploads".

---

## Defects noticed while mapping

1. **Visits setup fetches only one patient and one doctor.**
   - `loadData` calls `getPatients({ page: 1, limit: 1 })` and `GET /users?role=DOCTOR&limit=1`.
   - The "Select Doctor" dropdown therefore lists a single doctor: the most recently created one, because users are ordered `createdAt desc`.
   - Any picked patient other than the first renders "Patient: Unknown".
   - Deep links (`autoStart=true`) silently assign the visit to that first doctor, not the signed-in doctor.
   - Evidence: `frontend/src/app/dashboard/visits/page.tsx:519-546`, `:673-681`, `:942-943`, `:1076-1077`; `backend/src/modules/users/users.service.ts:165`.
2. **Complete Visit needs photos and labs, but its message says otherwise.**
   - The doctor total is 5 sections, but only vitals, photos, labs and prescription can ever be marked. Reaching the 80% gate therefore requires ≥1 photo and pressing "Save Labs".
   - The blocking toast says "Fill vitals, complaints, diagnosis, and prescription…".
   - Evidence: `frontend/src/components/visits/MedicalVisitForm.tsx:797`, `:1522-1533`, `:1559-1565`, `:2159`, `:2330`, `:2456-2457`, `:2742`.
3. **Photos uploaded before the visit exists are never attached to it.**
   - With no visit id, VisitPhotos posts to `/visits/photos/draft/:patientId`. The `onVisitNeeded` callback (which would create the visit and enforce consent) is accepted but never called.
   - The backend `create` never claims draft attachments. Once the visit is saved, those photos disappear from the visit and show as "Unattached uploads", and the Photos section drops back to Pending.
   - Evidence: `frontend/src/components/visits/VisitPhotos.tsx:19`, `:41`, `:456-458`; `MedicalVisitForm.tsx:2343`, `:2352-2363`; `backend/src/modules/visits/visits.service.ts:74-140`.
4. **The thumbnail trash icon deletes the wrong photo.**
   - The handler calls `setActiveIndex(idx)` and then immediately `deleteActive()`. That function reads the stale `active` from the current render, so it deletes the previously selected photo.
   - The confirm dialog does not say which photo. This is permanent data loss.
   - Evidence: `frontend/src/components/visits/VisitPhotos.tsx:562-564`, `:775-783`.
5. **Nurse, reception and manager can open the form and press Save Draft / Mark Vitals Complete, but the backend rejects every create, update and complete.**
   - The sidebar shows Visits to NURSE/MANAGER. Reception reaches it via Patients "Start Visit".
   - Evidence: `frontend/src/components/layout/sidebar.tsx:72-75`; `MedicalVisitForm.tsx:188-195`, `:2159`, `:2738`; `backend/src/modules/visits/visits.controller.ts:251-252`, `:468-469`, `:478-479`.
6. **Photo Delete is shown to nurse and reception, but the backend restricts visit-photo deletes to DOCTOR/ADMIN/OWNER.**
   - Draft-photo delete has no role guard at all.
   - Evidence: `MedicalVisitForm.tsx:2345`; `visits.controller.ts:402-416`, `:632-633`, `:647-648`.
7. **The role card misstates access.**
   - `roleInfo` falls back to "Doctor – Full access to all visit documentation features" for ADMIN/OWNER/MANAGER. MANAGER actually gets only Overview and History, because MANAGER is not in `ROLE_PERMISSIONS`.
   - The Nurse card promises "complaints, and basic assessments", but no nurse-visible UI records them.
   - ADMIN/OWNER see an empty "Available Features" card.
   - Evidence: `frontend/src/app/dashboard/visits/page.tsx:647-671`, `:978-1054`; `MedicalVisitForm.tsx:188-195`, `:1688-1702`.
8. **A walk-in visit's local draft is unrecoverable before the first save.**
   - The draft key ends in `date-<visitDate>`, and `visitDate` is `new Date().toISOString()` recomputed on every render of the page. A reload or "Back to Setup" therefore produces a new key and orphans the draft.
   - Autosave does not run until a visit id exists.
   - Evidence: `MedicalVisitForm.tsx:160-178`, `:577-580`, `:899`; `frontend/src/app/dashboard/visits/page.tsx:1131`, `:1143`.
9. **Overview "Photos Captured" is hard-coded to 0**, while the header badge shows the real count.
   - Evidence: `MedicalVisitForm.tsx:1999` vs `:1870`.
10. **The Lab Tests content is rendered for RECEPTION (`basic-info`), but its tab trigger is doctor-only**, so it is unreachable dead UI.
    - Evidence: `MedicalVisitForm.tsx:2167` vs `:1698-1701`.
11. **Dead voice dictation in the visit form.**
    - The recorder and `VoiceButton` for subjective/objective/assessment/plan are built but never rendered. Dictation exists only in the Prescription tab (Chief Complaints, Detailed Examination).
    - Evidence: `MedicalVisitForm.tsx:1307-1358`; `PrescriptionBuilder.tsx:4576`, `:4854`.
12. **Dead standalone photos panel.**
    - `{!showForm && recentVisitId && <PhotosPanel …/>}` sits inside the branch that only renders when `showForm` is true.
    - Evidence: `frontend/src/app/dashboard/visits/page.tsx:1150`.
13. **The doctor notification link `/dashboard/visits?appointmentId=…` is ignored.**
    - The page only reads `appointmentId` when `patientId` is also present, so the link lands on an empty setup screen.
    - Evidence: `frontend/src/components/layout/header.tsx:177`; `frontend/src/app/dashboard/visits/page.tsx:575-588`.
14. **Procedures "Save Procedure" always fails.**
    - The payload omits `complaints`, which `CreateVisitDto` requires (`@IsArray()` without `@IsOptional`), and the service re-checks it. The user only sees `alert('Failed to save procedure…')`.
    - Evidence: `frontend/src/app/dashboard/procedures/page.tsx:271-300`, `:314`; `backend/src/modules/visits/dto/create-visit.dto.ts:231-234`; `visits.service.ts:92-94`.
15. **Procedures "View Details" is dead, and "Load & Edit" cannot edit.**
    - "View Details" only sets `selectedVisit`, which is never rendered.
    - "Load & Edit" prefills a form whose save always calls `createVisit`.
    - Evidence: `frontend/src/app/dashboard/procedures/page.tsx:132`, `:300`, `:350`, `:425-431`.
16. **The Fotona Starwalker parameter list contains "Area" twice**, so both rows bind to `machineParameters['Area']` and mirror each other.
    - Evidence: `frontend/src/app/dashboard/procedures/page.tsx:31`, `:480`.
17. **Procedure History cards show the wrong parameters.**
    - Cards show `fluence/spotSize/passes`, but procedures saved from this page store a per-pass `parameters` grid, so those values never display.
    - Evidence: `frontend/src/app/dashboard/procedures/page.tsx:277-294` vs `:359-409`.
18. **The Slots-tab "Start Visit" pre-creates the visit with a placeholder complaint "General consultation".**
    - This contradicts the form's own rule that a new visit with no complaints must send an empty array. It also 403s for nurse and reception.
    - Evidence: `frontend/src/components/appointments/AppointmentScheduler.tsx:543-551`; `MedicalVisitForm.tsx:807-810`.
19. **`DELETE /visits/:id` has no `@Roles` guard**, so any authenticated role (e.g. PHARMACIST, RECEPTION) can soft-delete a visit through the API.
    - Evidence: `backend/src/modules/visits/visits.controller.ts:488-491`.
20. **`/test-transcribe` does not redirect on 401**: it shows a raw "Transcription failed: 401 - …".
    - The page is outside the middleware matcher, and `/visits/transcribe` has no role guard.
    - Evidence: `frontend/src/app/test-transcribe/page.tsx:233-237`; `frontend/src/middleware.ts:28-30`; `visits.controller.ts:663-690`.
