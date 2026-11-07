# Walk report: STORY-402, walk-in visit from the Visits setup screen

- **Topic**: visit-documentation
- **Persona**: Dr. Praneeta Jain (DOCTOR, `praneeta@clinic.test`). I added a cross-check as Dr. Shravya.
- **Result**: **FAIL**. The setup screen loads exactly 1 patient and 1 doctor. A walk-in deep link saved Dr. Shravya's visit under Dr. Praneeta. "Patient: Unknown" appears right beside the picked patient. A walk-in without photos can never be completed.
- **Screenshots**: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/visit-documentation--STORY-402/`

**Data substitution**: Mohammed Imran is not seeded. I used **Sanjay Mehta** (60M), who has no appointment today. I deliberately did not create a new patient: a new patient becomes the newest record, which is the single one `limit=1` returns, and that would mask the defect. Walk-in visit: `cmw6eej6i005t7dc1op5fj0bw`.

## Steps

| # | Story step | What happened | Screenshot |
|---|---|---|---|
| 1 | Visits in sidebar | "Visit Documentation" setup loads with the "Your Role & Permissions" card, Start New Visit, and an "Available Features" card. Network: `GET /api/patients?page=1&limit=1` and `GET /api/users?role=DOCTOR&limit=1`. | `step-01-visits-setup.png` |
| 2 | Role card | "Current Role Doctor – Full access to all visit documentation features" ✓. | `step-01-visits-setup.png` |
| 3 | Type "sanjay" in Select Patient | Suggestions arrive (name, ID, phone). No "Searching…" text was observed (the response was fast). | `step-03-patient-search.png` |
| 4 | ↓ + Enter | The field fills with "Sanjay Mehta" and the Ready to Start / Patient History tabs appear ✓. | `step-04-patient-picked.png` |
| 5 | Open Select Doctor | **Only "Dr. Praneeta Jain"** is listed. This is correct for Praneeta only by accident: she is the newest doctor. Signed in as **Dr. Shravya**, the same dropdown also lists only Dr. Praneeta Jain, so Shravya cannot pick herself. | `step-05-doctor-dropdown.png`, `finding-shravya-cannot-pick-self.png` |
| 6 | Ready to start line | **"Patient: Unknown • Doctor: Dr. Praneeta Jain"**, directly under a field that says Sanjay Mehta. | `step-04-patient-picked.png` |
| 7 | Patient History tab | "1 Records": the tomorrow appointment card "Appointment only — no visit documentation recorded". | `step-07-patient-history.png` |
| 8 | Start Visit Documentation | The form opens (Visit #1, DRAFT, 0%). **"Unsaved changes" shows before any edit.** The sub-heading again says "Patient: Unknown". The tracker offers "Upcoming appt / Start Visit" inside the visit. | `step-08-form-open.png` |
| 9 | No "From Appointment" badge; only "Back to Setup" | ✓ as described. | `step-08-form-open.png` |
| — | (STORY-405 check) Upload 2 photos before the first save | Draft upload OK: "Before / After Photos (2)", 20%. See STORY-405 for what happens on save. | `../visit-documentation--STORY-405/step-a1-draft-upload-before-save.png` |
| 10 | Fill vitals → Save Draft | `POST /api/visits` creates the visit, but the 2 draft photos detach (0 Photos, 0%). Autosave works as described: an edit gives "Unsaved changes" → "Auto-saving…" at ~8.4 s → `PATCH /api/visits/:id` → "Saved 06:17 pm" ✓. | `step-10-autosave.png` |
| x | (Variation "No photos") Mark Vitals Complete, Save Labs with nothing selected, create an Rx | The first Create Prescription with a blank duration fails with the raw toast "items.0.duration must not be less than 1 (Reference: …)". After setting 1-0-1 / 14d it succeeds. Progress caps at **60%** (Vitals, Rx, Labs) and **Complete Visit stays disabled**: without a photo this walk-in can never be completed. | `finding-rx-duration-400.png`, `step-x2-all-but-photos-60pct.png` |
| — | Doctor attribution cross-check (as Dr. Shravya) | Patients-row style deep link `?patientId=<Rohit Agarwal>&autoStart=true`. The header says "Doctor: Dr. Praneeta Jain". The first Save Draft POSTed `doctorId=cmw6d94b400057dw0ce1k8jd2` (Praneeta), and the API stored visit `cmw6emf3f00917dc1n2bk0h9e` under **Praneeta**. Separately, opening John Doe's visit-seed-5 (doctor Shravya) by visitId sent `doctorId=Praneeta` in the PATCH; the backend ignored it there. | `finding-deeplink-wrong-doctor-head.png` |
| M | Mobile 390×844 (setup screen) | One column. The role badge breaks mid-word ("Doct/or"), and the Role card pushes Start New Visit down. "Start Visit Documentation" wraps (geometry). | `mobile-check.png` |

## Geometry audit

- **Setup screen (1280)**: clean (no uneven rows, spills or wrapped controls).
- **Form**: see STORY-401. The header is crushed the same way and the Prescription tab overflows horizontally.
- **Mobile setup**: `wrappedControls`: "Start Visit Documentation".

## Mapped defects touched

| Defect | Verdict |
|---|---|
| #1 setup fetches only 1 patient and 1 doctor; "Patient: Unknown"; deep links assign the first doctor | **CONFIRMED** (all three parts). The misattribution was reproduced live on create. |
| #2 / "No photos" variation (cannot reach 80%) | **CONFIRMED** (60% cap) |
| #3 photos uploaded before first save never attach | **CONFIRMED** here (reported under STORY-405) |
| #8 walk-in local draft lost on reload | Not tested |

## Flow log

- **Ideal path**: 4 steps; actual to "visit started": 5 (the Doctor dropdown check added one).
- **Hesitations**:
  - The Doctor dropdown has a single entry, so for Shravya there is no way to select herself.
  - "Patient: Unknown" contradicts the filled field.
  - "Unsaved changes" appears before editing.
  - The duration error message is technical.
- **Data loss / re-entry**: photos captured before the first save silently move to "Unattached uploads" and must be uploaded again.
- **Duplication**: patient and doctor names appear in the sub-heading, the Ready-to-start line and Patient Context (two of the three are wrong). There are two different QuickGuides, both titled "Visit Documentation Guide". The role is stated in the role card, the badge, the form header "Role: DOCTOR" and Overview "Captured By".
