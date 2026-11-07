# Walk report: STORY-401, acne follow-up from calendar tile to Complete Visit

- **Topic**: visit-documentation
- **Persona**: Dr. Shravya (DOCTOR, `shravya@clinic.test`)
- **Result**: **FAIL**. Steps 2 and 22 are impossible for today's appointments, the first "Mark Vitals Complete" does not mark Vitals, and the Prescription tab pushes Save Draft and Complete Visit off-screen. The visit still completed, after the mandatory "Save Labs" detour.
- **Walked**: 2026-11-07 ~18:05–18:20 IST. Playwright Chromium at 1280x800, DPR 1.
- **Screenshots**: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/visit-documentation--STORY-401/`. All paths below are relative to that folder.

**Data substitutions**: Ananya Reddy is not in the seed, so I used **Ananya Gupta** (31F, OPD 19:30 today with Dr. Shravya, appointment `cmw6dbj34001m7dc1hfa8v36e`). The resulting visit is `cmw6e3wjs00227dc1yxulnzls`. She has no earlier visit, so the "previous visit" comparisons had no baseline.

**Auth note**: The shared login throttle (5/min) returned 429 to the form. I injected the `auth_token` cookie from an API login instead.

## Steps

| # | Story step | What happened | Screenshot |
|---|---|---|---|
| 1 | Log in → Dashboard | Dashboard loads with Recent Visits and My Patients. A doctor also sees admin tiles (Total Users, Branches, System Status). | `../prescriptions-print-share--STORY-001/step-01-dashboard.png` |
| 2 | Appointments → Calendar → find today's tile | **Blocked.** The Doctor selector defaults to *Praneeta Jain* although Shravya is signed in. After switching to Shravya, the grid only runs 09:00–18:00 (`DoctorDayCalendar.tsx:68-69`). Today's 18:30, 19:00 and 19:30 appointments are not rendered anywhere, and the Slots tab shows the same range. Switching tab and date also once showed Dr. Praneeta's patient (Sanjay Mehta) on Dr. Shravya's calendar for 8 Nov, while hiding her own two tiles. | `step-02-appointments-calendar.png`, `step-02b-calendar-shravya.png`, `finding-wrong-doctor-tiles.png` |
| 2b | (verify the tile action on a visible tile) | For tomorrow's 11:30 Deepika Nair tile, the INFO / RESCHED / START buttons appear only on hover, on an 18px-tall tile. | `step-02c-calendar-tomorrow.png`, `step-02f-tile-deepika.png` |
| 3 | Click Start Visit | START opens `/dashboard/visits?patientId…&appointmentId…&autoStart=true` with the "From Appointment" badge. The sub-heading reads **"Patient: Unknown • Doctor: Dr. • 11:30-11:45 • OPD"**. I then opened Ananya Gupta with the identical deep link, because her tile is not rendered. | `step-03-tile-start-deepika.png`, `step-04-form-header-ananya.png` |
| 4 | Read the header card | Visit #1, DRAFT, Linked to Appointment, 0 Photos, "Unsaved changes" before any edit. The header is crushed at 1280px. DRAFT badge measures 37×81px with one letter per line. "Linked to Appointment" is 87×81 and "0 Photos" is 42×81. The Shortcuts button is 64×185px, stacked letter by letter. The patient-ID chip spills its border. The appointment link is badged twice (confirmed). The tracker under the heading offers "Book" for an appointment that is already booked. | `step-04-form-header-ananya.png` |
| 5 | Patient Context card | Shows name, ID, age, sex and phone. After the first save, "Recent Visits" lists the current visit itself, with "No diagnosis". | `step-08-vitals-saved.png` |
| 7 | Vitals: enter values | Values entered. BMI auto-fills 21.6 ✓. There is no SpO₂ input (confirmed). Labels have **no units** (Temperature, Weight, Height) and no `for`/`id` association. | `step-07-vitals-empty.png`, `step-07c-vitals-filled.png` |
| 8 | Mark Vitals Complete | Toast "Visit saved / Your draft was saved safely" (visit created), **but** the footer stays "Progress: 0% • 0 of 5" and Vitals is not marked. A second click gives "20% • 1 of 5". | `step-08-vitals-saved.png`, `step-08b-vitals-second-click.png` |
| 9 | Photos tab | Shows "Before / After Photos (0)" with an empty state. Upload/Camera in the header duplicate Choose Files/Take Photo in the body. | `step-09-photos-empty.png` |
| 10–11 | Choose 3 files → tag → Upload | The tag dialog infers Front/Left/Right correctly (no fix needed). Its **Upload** button sits at y=988 inside a 720px modal, so it is invisible until you scroll the dialog. Upload succeeds: "3 Photos", Photos dot, 40%. | `step-10-tag-dialog.png`, `step-11a-tag-dialog-bottom.png`, `step-11b-photos-uploaded.png` |
| 12 | Overview | Progress Summary shows Vitals and Photos complete, but **"Photos Captured: 0"** while the header says 3 (defect 9 CONFIRMED). | `step-12-overview-photos-captured-0.png` |
| 13 | Prescription tab | Vitals synced into Clinical Details ✓. **The builder is 1182px wide inside a 1024px main**: main.scrollWidth is 1407 against clientWidth 1024. The right side is clipped: Pulse, "Save current" and the template buttons, and later Create Prescription, Save Draft and Complete Visit (x = 1373–1638). | `step-13-prescription-tab.png`, `finding-prescription-tab-hoverflow.png` |
| 14–15 | Complaints, Acne/Scarring, Dx, exam | All filled. The "Acne vulgaris" chip toggles. The Treatment Suggestions card shows "No strong pattern yet". | `step-15-exam-dx.png` |
| 16 | Add medication → Create Prescription | Search "adapa" shows a "Best Match" row with stock ✓. Selecting it fills no regimen. The HS preset sets frequency but leaves "When" as Select. The When options list both QHS and HS. The When/Remove cells wrap letter by letter. Create → toast "1 medications recorded…" (grammar) and the "Go to Pharmacy?" dialog. Prescription is marked; 60%. | `step-16a-med-search.png`, `step-16b-med-selected.png`, `step-16c-create-rx-dialog.png` |
| 17 | Try Complete Visit | The button is disabled with no tooltip. Ctrl+Shift+S gives the toast "More details needed to complete / Fill vitals, complaints, diagnosis, and prescription to reach at least 80%…", although all of those are done (defect 2 CONFIRMED). | `step-17-complete-blocked.png` |
| 18–20 | Lab Tests: Vitamin D + CBC, compare, Save Labs | Results grid appears. With no previous visit, the deltas read **"Δ +0"** and then "Δ +18" / "Δ +12.1" (compared against 0). The **Save Labs** button is letter-stacked vertically. Save Draft and Complete Visit wrap to 2 lines. Result inputs are clipped ("12.1", "g/d"). The file input is the unstyled native control. Save Labs → 80% and Complete is enabled. | `step-18-labs-selected.png`, `step-20-labs-saved.png` |
| 21 | Complete Visit | "Completing..." → toast "Visit completed" ✓ and both badges read COMPLETED. **But** the header still says "Unsaved changes". The local draft key `clinic:visit-draft:…:visit-cmw6e3wjs…` is still in localStorage. The tracker now offers "Continue". | `step-21-completed.png` |
| 22 | Appointments shows Completed | Cannot be verified in the UI because the 19:30 tile is never rendered. The API confirms the appointment is `COMPLETED`. | n/a |
| 23 | History tab | Lists today's visit (Completed, CC, Dx Acne vulgaris, 3 Photos, 1 Rx item, Resume session). The Patient Context card still says "No diagnosis" for the same visit. | `step-23-history.png` |
| M | Mobile 390×844 | The form keeps its two-column layout. Patient Context and the form card sit side by side and clip (414px spill). The patient ID and COMPLETED badge are letter-stacked. Save Draft, Complete Visit and Back to Setup wrap. | `mobile-check.png` |

## Geometry audit (per distinct state)

- **Appointments calendar**: tabs row Calendar/Slots widths 87/56. This is the intended variation in tab width, so it is not logged.
- **Visit form header**: the script reports only the tracker and button-pair width drift. It misses the crushed badges because they are `<span>`s, so I measured them by hand: DRAFT 37×81, "Linked to Appointment" 87×81, "0 Photos" 42×81, Shortcuts 64×185, "Visit Workflow Tour" 46×91.
- **Prescription tab**: `overflowSpills` on `div.space-y-4 "Visit Documentation…"` and `div.flex.gap-6 "Patient Context…"` (407px). `main` scrollWidth 1407 vs 1024. `wrappedControls`: two "Add" buttons.
- **Lab Tests**: `wrappedControls`: "Save Labs".
- **Mobile**: six spills (240–414px). Wrapped: Back to Setup, Refresh, Save Draft, Complete Visit.

## Mapped defects touched

| Defect (topic file) | Verdict |
|---|---|
| #1 setup fetches 1 patient / 1 doctor | CONFIRMED in this flow too: the appointment deep link shows "Patient: Unknown • Doctor: Dr." |
| #2 Complete needs photos + Save Labs; toast misleads | **CONFIRMED.** 60% after vitals + photos + Rx; Save Labs → 80% |
| #9 Overview "Photos Captured" hard-coded 0 | **CONFIRMED** |
| Redundancy: appointment linkage badged twice | CONFIRMED |
| Story step 8 "first save marks Vitals 20%" | **REFUTED.** It needs a second click (new defect) |
| Story step 21 "local draft removed" | **REFUTED.** The key remains and "Unsaved changes" shows after completion |
| Story step 11 "fix 3rd photo to Right" | Not needed: inference was correct |

## Flow log

- **Story vs actual**: The ideal path is 8 steps. I needed about 14. The detours were: switching doctor on the calendar, hunting for the tile (it does not exist for evening slots), falling back to a deep link, clicking Mark Vitals Complete twice, scrolling inside the tag dialog to find Upload, scrolling `main` horizontally to reach Create Prescription and Complete Visit, a dead-end Complete attempt, opening Lab Tests and pressing Save Labs only to unlock Complete, then Complete.
- **Hesitations**:
  - The Doctor selector showed someone else.
  - The evening appointments had vanished.
  - The tile actions are hover-only.
  - The Upload button was not visible.
  - Save Draft and Complete Visit were not visible on the Prescription tab.
  - The disabled Complete Visit gave no reason, and its toast contradicted the state.
  - "Δ +18" implied a previous value of 0.
- **Re-entry**: the "previous visit" lab deltas compare against nothing. The vitals were re-shown in Prescription (synced, so no re-typing).
- **Cross-screen duplication**:
  - Progress appears 4× (header text, header bar, Overview summary, footer).
  - Photo count appears 3× and disagrees with itself.
  - Appointment linkage is badged twice.
  - The 30-test investigations list appears in both the Prescription tab and the Lab Tests tab.
  - Upload/Camera are duplicated with Choose Files/Take Photo.
  - The tracker CTAs ("Book", "Start Visit", "Continue") contradict the visit state.
