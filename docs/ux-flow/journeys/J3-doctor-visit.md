# J3 — Doctor documents a consultation, from appointment to `Complete Visit`

**Primary story**: STORY-045 (`docs/ux-paths/topics/visits-procedures.md`). Supporting: STORY-041, 042, 044, 050; STORY-017/018 (`patients.md`).
**Persona**: Dr Shravya (`doctor`); `nurse` for the vitals hand-off.
**Verdict**: **convoluted** — 23 actions against an ideal of 14, two forced detours to unlock `Complete Visit`, and an arrival screen that fails five screen heuristics at once.

**How this was walked**: live at `http://localhost:3000`, 1440×900, on two patients created for this pass (Divya Jthree, Arjun Jthree), each with an appointment today on Dr Shravya's calendar. Divya's visit was taken all the way to `COMPLETED`; Arjun's was used for the nurse hand-off and for the "no photos" case and is left `IN PROGRESS`.

- **Measured** = done live and seen in a screenshot or in the page text.
- **Suspected** = read in code or in the story only; not exercised live.
- The Prescription tab's medicine table and print preview were treated as one hand-off step (another critic owns them).
- Not walked live: camera capture (`Take Photo`), voice dictation, the tele-video branch, the "Appointment Details" dialog route, the red allergies box (neither test patient has allergies recorded).

---

## Friction Scorecard

| Measure | Count | Notes |
|---|---|---|
| Steps, actual vs ideal | **23 vs 14** | Like-for-like with the story's Ideal path (calendar already open, 4 vitals, tests counted as one action). Raw interactions as walked: 28. |
| Decisions | 12, of which **6 needless** | See list below. |
| Re-entry | **4** | Own name as doctor; lab tests a second time to get them printed; nurse's vitals retyped by the doctor; diagnosis offered again as a chip. |
| Confirmations guarding nothing | **1** (+2 attestation buttons) | "Go to Pharmacy?" dialog. `Mark Vitals Complete` and `Save Labs` act as "I'm done" attestations that check nothing. |
| Dead ends | **3** | After `Complete Visit`; nurse's refused save; a visit with no photo can never be completed. |
| Hesitations | **11** | See list below. |

### Steps — where the extra nine come from (measured)

| Segment | Ideal | Actual | What the extra actions are |
|---|---|---|---|
| Open visit from the calendar | 1 | 1 | Hover the tile, click `START`. |
| Vitals (4 readings) | 4 | 7 | `Vitals` tab; `Mark Vitals Complete` **twice** (the first press only creates the visit — see bugs). |
| Three photos in one go | 2 | 4 | `Photos` tab; `Upload` inside the tag dialog sits below the dialog's visible area. |
| Complaint, diagnosis, examination | 3 | 5 | `Prescription` tab; expand the collapsed "On Examination" section. |
| Order tests | 1 | 3 | `Lab Tests` tab; `Save Labs`. |
| Prescription hand-off | 1 | 2 | `Stay Here` on "Go to Pharmacy?". |
| Complete | 2 | 1 | No confirmation dialog — one click. Better than the ideal. |
| **Total** | **14** | **23** | |

Not in the table:

- **+1** to reach the calendar (`Appointments` in the sidebar). The doctor's Dashboard has no list of today's appointments.
- **+2 the first time** on any browser: Appointments opens on another doctor's calendar ([01](J3-doctor-visit-screens/01-appointments-first-load.jpg)), so she opens the Doctor select and picks herself. Remembered afterwards (`appointments/page.tsx:47-58`).
- **Scrolling**: the tab strip starts about 620 px down a 900 px screen and tab content about 740 px down ([03](J3-doctor-visit-screens/03-visit-form-on-arrival.jpg)), so every one of the four tab switches is followed by a scroll.
- **When no tests or photos are wanted** the count does not drop. She must still open `Lab Tests` and press `Save Labs` with nothing ticked (measured — it was accepted and marked the section), and must upload some image ([09](J3-doctor-visit-screens/09-completion-blocked-no-photos.jpg)).

### Decisions (12)

Needless — a default or a merge would carry them:

1. **Which doctor am I?** Appointments first load, Visits setup "Select Doctor", and `Start new visit` on the patient record all default to Dr Praneeta Jain while Dr Shravya is signed in ([01](J3-doctor-visit-screens/01-appointments-first-load.jpg), [13](J3-doctor-visit-screens/13-new-visit-from-record-wrong-doctor.jpg)).
2. **Which vitals surface?** `Vitals` tab or Prescription › "Clinical Details & Vitals" ([07](J3-doctor-visit-screens/07-prescription-tab-clinical-notes.jpg)). They stay in sync, but only the Vitals tab's button counts towards completion.
3. **Which diagnosis input?** "Diagnosis" text box or "Dermatology Diagnoses" chips, both in the Prescription tab.
4. **Which tests list?** `Lab Tests` tab or Prescription › "Investigations". This one matters and the screen does not say so: tests ticked in `Lab Tests` did not appear in the Prescription checklist, and the print preview read "Investigations: 0" (measured).
5. **"Go to Pharmacy?"** — asked of a doctor at 60 % progress, before the visit is complete ([08](J3-doctor-visit-screens/08-go-to-pharmacy-dialog.jpg)).
6. **Which save?** `Save Draft`, `Mark Vitals Complete`, `Save Labs`, `Create Prescription` all save the visit.

Real, or already carried by a good default: `START` vs opening the tile; consultation type (defaults to In-person); which tab to open first; photo position tags (pre-guessed); `Print Preview` vs `Create Prescription`; where to go after completing.

### Hesitations (11)

1. Appointments shows someone else's day ([01](J3-doctor-visit-screens/01-appointments-first-load.jpg)).
2. The calendar grid is below the fold; filters and a nine-item legend fill the first screen ([01](J3-doctor-visit-screens/01-appointments-first-load.jpg)).
3. `START` exists only on hover, and is clipped by the 15-minute tile's height ([02](J3-doctor-visit-screens/02-calendar-tile-hover-start.jpg)). On a tablet there is no hover *(suspected: the only route there is tile → dialog → `Start Visit`)*.
4. The visit opens with no clinical field on screen ([03](J3-doctor-visit-screens/03-visit-form-on-arrival.jpg)).
5. "Where do I write the complaint?" — inside the `Prescription` tab, under a Templates toolbar ([07](J3-doctor-visit-screens/07-prescription-tab-clinical-notes.jpg)).
6. `Mark Vitals Complete` → toast "Visit saved", but progress still 0 % and no green dot (first press on a new visit).
7. Tag dialog: the position select and `Upload` are not visible until she scrolls inside the dialog ([06](J3-doctor-visit-screens/06-photo-tag-dialog.jpg); the button measured at y = 1074 px in a 900 px viewport).
8. "Go to Pharmacy?" with `Yes, go to Pharmacy` as the dark button ([08](J3-doctor-visit-screens/08-go-to-pharmacy-dialog.jpg)).
9. `Complete Visit` greyed out with "Remaining: labs" when no tests are needed — nothing says "press Save Labs" ([09](J3-doctor-visit-screens/09-completion-blocked-no-photos.jpg)).
10. A reopened visit that has three photos says "0 Photos" and "Remaining: photos" until the `Photos` tab is opened (measured, same browser).
11. `Continue` / `Prescribe` / `Bill` under the title look like next steps but navigate away; on a brand-new visit they open the *previous* visit ([13](J3-doctor-visit-screens/13-new-visit-from-record-wrong-doctor.jpg)).

---

## Take-away Pass

### Appointments calendar — [01](J3-doctor-visit-screens/01-appointments-first-load.jpg), [02](J3-doctor-visit-screens/02-calendar-tile-hover-start.jpg)

- **Collapse**: the "Legend" block (two paragraphs and nine colour keys). It is reference material sitting above the thing it explains.
- **Defer**: `Visit Type`, `Room`, `Grid` filters — a doctor starting a visit uses none of them.
- **Default**: Doctor = signed-in doctor.
- **Hierarchy**: the one action this persona came for (`START`) is invisible until hover, then appears as one of three equal-weight abbreviations (`INFO`, `RESCHED`, `START`) in three different colours. The amber `RESCHED` is the loudest.
- **One primary action**: none visible at rest.

### Visit form on arrival — [03](J3-doctor-visit-screens/03-visit-form-on-arrival.jpg), [04](J3-doctor-visit-screens/04-overview-tab-bottom.jpg)

This is the screen that most needs the take-away test. Everything in the top 620 px can go or shrink; the doctor would still succeed.

Removable:
- **Six-circle tracker and its button row** (`Book` here; `Continue` / `Prescribe` / `Bill` later). It describes a different concept (the patient's journey) with unlabelled icons, and its buttons leave the form. On arrival it offered `Book` for a patient whose appointment she had just opened.
- **`From Appointment` badge** — duplicated by `Linked to Appointment` 220 px lower, and by the slot time in the identity bar.
- **"Medical Visit Documentation • Role: DOCTOR"** — she knows what the page is and who she is.
- **"Visit Information" card** (Overview): Visit Number, Status — both already in the header card; "Photos Captured: 0" is hard-coded (`MedicalVisitForm.tsx:1975-1976`); "Captured By: DOCTOR".
- **"Progress Summary" card** (Overview): a third and fourth rendering of progress, including a "Customization: Pending" row that can never change.
- **"Quick Actions" card**: `Record Vitals` and `Capture Photos` duplicate the two tabs directly above it.
- **The `Overview` tab itself** — once the three cards above go, it is empty. The form should open on the first tab with work to do.
- **`ID: cmwepyoel002p7d00sy24woct`** in Patient Context — a database id. The human-usable patient code (`2PC7T`) is not shown here.
- **"Unsaved changes"** on a form nobody has touched.

Collapsible:
- **`Quick Guide`, `Visit Workflow Tour`, `Shortcuts`** — three help entry points; one "Help" menu.
- **`Consultation type`** — a full-width labelled select with its own 150 px band; defaults correctly to In-person. A small toggle in the header row is enough.
- **"Patient Context" card** — name, age, sex repeat the sticky identity bar directly above it. What is unique (phone, allergies, recent visits) fits in the bar or a popover. The card costs a third of the width; below it the column is empty, and the squeezed form wraps its seven tabs onto two rows.
- **`Back to Setup`** — there was no setup step on this route.

Stated more than once on this one screen:

| Fact | Times | Where |
|---|---|---|
| Progress | 4 | header text, header bar, Progress Summary, footer |
| Patient name / age / sex | 2 | identity bar, Patient Context |
| Visit number, status | 2 each | header card, Visit Information |
| Linked to appointment | 2 | two badges |
| Role | 2 | "Role: DOCTOR", "Captured By: DOCTOR" |
| Photo count | 2 | header badge, Visit Information |

Hierarchy:
- No primary action above the fold. The only filled button on the page is `Complete Visit`, disabled, at the very bottom.
- The largest text is the page title "Visit Documentation"; the patient's name is body-size.
- **Earns its place**: the sticky identity bar (patient, age, sex, doctor, slot). It stays on screen through every scroll and is the identity check for everything typed below. Keep it exactly as it is.

### Vitals tab — [05](J3-doctor-visit-screens/05-vitals-marked-complete.jpg)

- **Remove**: `Mark Vitals Complete`. It is a save button with a second meaning. It checks nothing, it stays unchanged after pressing, and pressing it is mandatory even when vitals were typed in the Prescription tab.
- **Three buttons in the bottom 200 px**: `Mark Vitals Complete` (dark), `Save Draft`, `Complete Visit` (disabled). The dark one is the least important.
- **Self-reference**: "Recent Visits" in Patient Context lists the visit being edited ("13 Nov 2026 — No diagnosis").
- Fields themselves are fine: eight inputs with units as placeholders, BMI computed.

### Photos tab and tag dialog — [06](J3-doctor-visit-screens/06-photo-tag-dialog.jpg)

- **Duplicate controls**: `Upload` / `Camera` in the card header and `Choose Files` / `Take Photo` in the empty state.
- **Dialog**: the preview takes the full dialog height (`aspect-video`, `VisitPhotos.tsx:829`), pushing the position select, thumbnails and `Upload` out of view. `Mode: Grid / Single` and `Infer positions` are advanced controls on the first row; positions are already inferred.
- **Three delete controls** once photos exist: a red `Delete` in the card header, a red `Delete` under the viewer, and a red bin on each thumbnail (measured after upload; the header one is visible in [11](J3-doctor-visit-screens/11-visit-completed.jpg)). The loudest colour on the tab belongs to the rarest action.
- **"Before / After Photos"** as the title on a first visit with nothing to compare.

### Prescription tab as the place for clinical notes — [07](J3-doctor-visit-screens/07-prescription-tab-clinical-notes.jpg), [08](J3-doctor-visit-screens/08-go-to-pharmacy-dialog.jpg)

Scope note: only how the tab fits the visit.

- **First thing shown**: a Templates toolbar with a red `Reset to default` and a dark `New template`. The first clinical field (Chief Complaints) is the third block down. Template management is the loudest element on the tab where the consultation is written.
- **"Clinical Details & Vitals"** repeats the Vitals tab. The sync works (measured), so one of the two surfaces is removable.
- **Bottom of the tab**: five buttons in two rows — `Print Preview`, `Create Prescription` (dark), `Go to Pharmacy`, then `Save Draft`, `Complete Visit` (dark, disabled). Two primaries.
- **"Go to Pharmacy?" dialog**: appears on every `Create Prescription`. Its primary button takes the doctor out of an unfinished visit to a billing screen that belongs to the pharmacist. The same destination is already a button (`Go to Pharmacy`) on the row behind the dialog.
- The tab is about 3,350 px tall; `Create Prescription` is at the very bottom.

### Lab Tests tab — [09](J3-doctor-visit-screens/09-completion-blocked-no-photos.jpg), [10](J3-doctor-visit-screens/10-labs-saved-ready-to-complete.jpg)

- **Remove**: `Save Labs` as a completion trigger.
- **Remove**: "Selections and results are saved under Treatment Plan → Dermatology." — a storage path, not something the doctor can act on.
- **Defer**: "Compare with previous visit" and the report-photo autofill (a bare `Choose File No file chosen` next to `Save Labs`) are for the *results* visit, not for ordering.
- **Merge**: this list and Prescription › "Investigations" are the same 31 tests held separately.
- The tick grid and the "Enter Results" cards with pre-filled units are good.

### Customization tab

- **Move out of the visit**: print margins, paper preset, grid/rulers/snap, letterhead profile. This is one-time print set-up, shown as a peer of Vitals and Photos on every visit and counted as a fifth "section" in the progress maths.

### Completion — [10](J3-doctor-visit-screens/10-labs-saved-ready-to-complete.jpg), [11](J3-doctor-visit-screens/11-visit-completed.jpg)

- At 80 % the footer is right: one line of status, `Save Draft`, one dark `Complete Visit` ([10](J3-doctor-visit-screens/10-labs-saved-ready-to-complete.jpg)).
- After completion nothing on the screen changes role: `Complete Visit` is still dark and enabled, `Save Draft` is still there, progress still reads "80 % • 4 of 5", the header says "Unsaved changes" next to `COMPLETED` ([11](J3-doctor-visit-screens/11-visit-completed.jpg)). The only acknowledgement is a toast. The way out (`Back to Calendar`) is at the top of the page, out of view from where she clicked.

### Alternate entry points — [13](J3-doctor-visit-screens/13-new-visit-from-record-wrong-doctor.jpg), [14](J3-doctor-visit-screens/14-patient-record-entry-points.jpg)

- **Patient record**: three controls go to the same URL — `Resume last visit` (header), `Continue` and `View` (tracker); the two tracker links were byte-identical (measured). `Start new visit` is the dark primary even for Arjun, whose visit was in progress today.
- **Patient record → `Start new visit`**: opens "Visit #2 DRAFT" under **Dr Praneeta Jain** with a tracker showing four green circles that describe visit #1 ([13](J3-doctor-visit-screens/13-new-visit-from-record-wrong-doctor.jpg)). Nothing warns that today's visit already exists.
- **Visits page (walk-in)**: "Your Role & Permissions" and "Available Features" cards frame the one card that matters; both tell a doctor she is a doctor. The Doctor select defaults to Dr Praneeta Jain (measured).
- **Patients list**: at 1440 px the row buttons `View` and `Start Visit` wrap to one or two letters per line. Layout defect, noted in passing.

### Nurse hand-off (STORY-044) — [12](J3-doctor-visit-screens/12-nurse-vitals-forbidden.jpg)

- The nurse gets a `Vitals` tab, types five readings, presses `Mark Vitals Complete` and gets a red "Unable to save visit — Forbidden resource (Reference: …)".
- When the doctor then opened the same appointment the vitals were blank (measured), so she typed them herself.
- Either the tab should save or it should not be offered. As it stands it is the longest dead end in the journey.

---

## The Simpler Version

Same goal, same information, same safety checks. Starting from sign-in:

1. **Dashboard** lists today's appointments for the signed-in doctor. Click `Start visit` on the patient's row. *(1)*
2. The visit opens on **Vitals**, cursor in the first field. Above it: one sticky line — patient, age, sex, allergies, doctor, slot, visit status, save state. Values the nurse entered are already there.
3. Type the four readings. Autosave; no button. *(4)*
4. `Photos` → choose three files → the tag dialog shows guessed positions with `Upload` in view → `Upload`. *(2, plus the tab)*
5. `Consultation` (today's "Prescription" tab, renamed, notes first): complaint, diagnosis, examination chips. *(3)*
6. Tick the tests once, in one list that also prints on the prescription. *(1)*
7. Prescription hand-off: `Create Prescription`. A toast confirms; no dialog. *(1)*
8. `Complete Visit` — available as soon as there is a complaint or a diagnosis. Beside it, plain information rather than a lock: "No photos · No tests ordered". *(1)*
9. The footer becomes "Visit completed · **Next: Arjun Jthree 16:00 — Start** · Back to calendar".

**14 actions plus three tab switches**, against 23 plus four today — and nothing the doctor sees today is hidden, except chrome.

What stays deliberately:
- The sticky identity bar (patient identity).
- The allergies warning, promoted into that bar.
- The disclaimer that progress is not a clinical check.
- Every medicine-safety step inside the prescription builder (other critic's scope).
- The photo position tags — they are what makes before/after comparison work.

### Changes to get there

| # | Change | Effort | Files |
|---|---|---|---|
| 1 | **Replace the attestation gate with data-derived state.** A section is "done" when it has data (any vital; server photo count; a prescription exists; tests are optional). Compute it on load from the server, not from the browser draft. Enable `Complete Visit` on a clinical minimum (complaint or diagnosis); list what is empty as information. Delete `Mark Vitals Complete` and `Save Labs` as triggers. Also removes the double-press, the "0 % on reopen", the "0 Photos until the tab is opened", the unreachable fifth section, and the mismatched shortcut toast. | M | `MedicalVisitForm.tsx` (`getProgress` :791, `markSectionComplete` :1435, photo effect :1511, toast :1552, buttons :2136 and :2307, footer :2712-2724) |
| 2 | **Default the doctor to the signed-in doctor** wherever a doctor is picked or implied. | S | `app/dashboard/appointments/page.tsx:47-58`, `app/dashboard/visits/page.tsx:564-573` |
| 3 | **Collapse the form header into the sticky bar.** Drop the tracker from the form, one appointment badge, no "Role", one Help menu, consultation type as a small toggle, Patient Context collapsed by default with allergies in the bar. Open on the first tab with work to do; remove `Overview`. | M | `app/dashboard/visits/page.tsx:1086-1147`, `MedicalVisitForm.tsx:1703-1880` and :1956-2040, `VisitIdentityBar.tsx` |
| 4 | **Stop asking "Go to Pharmacy?"** when the author is a doctor with an open visit; keep the `Go to Pharmacy` button. | S | `PrescriptionBuilder.tsx:6899` |
| 5 | **One tests list.** `Lab Tests` selections feed the prescription's Investigations (or one of the two lists is removed). | M | `MedicalVisitForm.tsx` (Lab Tests tab, :2148-2310), `PrescriptionBuilder.tsx` (investigations) |
| 6 | **A real end state.** After completion: `Complete Visit` becomes a "Completed" marker, and the footer offers the next appointment and `Back to calendar`. | S–M | `MedicalVisitForm.tsx` (`save(true)` near :1548, footer :2712-2730) |
| 7 | **Rename and reorder tabs**: Vitals · Photos · Consultation · Tests · History. Move `Customization` into the print preview or Settings. Put the Templates toolbar behind a disclosure so Chief Complaints is first. | S (rename/move), M (toolbar) | `MedicalVisitForm.tsx` (`renderTabs`, :2440-2700), `PrescriptionBuilder.tsx` |
| 8 | **Always-visible `Start` / `Continue` on the calendar tile**, full words; legend collapsed below the grid. | S | `components/appointments/CalendarColumn.tsx:301-340`, `DoctorDayCalendar.tsx` |
| 9 | **Keep the tag dialog's footer in view** (cap the preview height; pin position select and `Upload`). Hide `Mode` / `Infer positions` behind "More". | S | `VisitPhotos.tsx:805-937` |
| 10 | **Today's appointments on the doctor Dashboard** with a `Start visit` button per row. | M | `components/dashboard/DoctorPatientPanels.tsx` |
| 11 | **Nurse vitals**: either let NURSE save vitals to the visit, or remove the Vitals tab and button for that role. A clinic policy decision, not a UI one. | M | `backend/src/modules/visits/visits.controller.ts`, `MedicalVisitForm.tsx` (`ROLE_PERMISSIONS`) |
| 12 | **Patient record**: one `Continue today's visit` when one is open, otherwise `Start visit`; drop the duplicate tracker links. | S | `app/dashboard/patients/[id]/page.tsx:215-219`, `PatientProgressTracker.tsx` |

Changes 1–4 are the bulk of the win: they remove seven of the nine extra actions and most of the hesitations without touching the prescription builder.

---

## Clarity Issues

**Names that mislead**

- **`Prescription` tab** holds Chief Complaints, Diagnosis, Patient History and On Examination. A doctor looking for where to write notes has no tab with that name. The `Quick Guide` makes it worse: "Fill out sections in order: Vitals → History → Examination → Assessment → Plan" — none of the last four is a tab, and the `History` tab is past visits, not the patient's history (measured text).
- **"Complete" means four things**: `Mark Vitals Complete` (a section), `Complete Visit` (the visit), `Complete` / `Pending` badges, and the tracker's unlabelled third circle (a time heuristic, `PatientProgressTracker.tsx:107-112, 136`).
- **`Save Draft`** on a visit whose badge reads `IN PROGRESS` or `COMPLETED`; toast "Your draft was saved safely." `DRAFT` is a status the user never chose.
- **`Back to Setup`** on a visit that had no setup.
- **`START`, `CONT`, `INFO`, `RESCHED`** — abbreviations in capitals; elsewhere the same actions are `Start Visit`, `Continue`, `Resume last visit`, `Resume session`.
- **"Before / After Photos"** for a first visit; **`Resume session`** on a history card for what every other screen calls a visit.
- **"Heart Rate"** (Vitals tab) vs **"Pulse (bpm)"** (Prescription tab); **"Lab Tests (Investigations)"** vs **"Investigations"** for two separate lists.

**Copy that assumes inside knowledge**

- **"Completion requires 80 % progress. Remaining: labs."** She must know that "labs" means "press `Save Labs`, even with nothing ticked", that "prescription" means "open `Print Preview` or `Create Prescription`", and that "0 of 5" can only ever reach 4.
- **The Ctrl/Cmd+Shift+S toast** names a different list: "Fill vitals, complaints, diagnosis, and prescription…" while the hint under it says "Remaining: photos" ([09](J3-doctor-visit-screens/09-completion-blocked-no-photos.jpg)).
- **"Forbidden resource (Reference: 2f1dffed-…)"** shown to a nurse who typed vitals ([12](J3-doctor-visit-screens/12-nurse-vitals-forbidden.jpg)).
- **"Selections and results are saved under Treatment Plan → Dermatology."**
- **`ID: cmwepyoel002p7d00sy24woct`** — an internal id presented as patient information.
- **"Role: DOCTOR"**, **"Captured By: DOCTOR"**.

**Status that cannot be trusted**

- **"Unsaved changes"** was the header status at every point checked: untouched new visit, just-reopened saved visit, seconds after a "Visit saved" toast, and on the `COMPLETED` visit ([03](J3-doctor-visit-screens/03-visit-form-on-arrival.jpg), [11](J3-doctor-visit-screens/11-visit-completed.jpg)). "Saved hh:mm" was never seen (measured; cause not investigated).
- **The green dot** on the `Prescription` tab means "at least 4 key sections filled" and pulses; on other tabs it means "section complete" (`MedicalVisitForm.tsx:1934-1946`, suspected from code; the dot is visibly lighter in [11](J3-doctor-visit-screens/11-visit-completed.jpg)).
- **"Recent Visits"** includes the visit currently open.
- **Tracker `Book`** on a visit opened from today's appointment ([03](J3-doctor-visit-screens/03-visit-form-on-arrival.jpg)); **"Next appointment: Not scheduled"** on Arjun's record while he had a 16:00 slot today.
- **"3 medications were added to this prescription"** — the diagnosis auto-filled them. Whether that needs an explicit confirm is the prescription critic's call; from the visit's side, the doctor did not add them by hand.

**Accessibility, in passing**: the Vitals labels are not programmatically tied to their inputs (label-based lookup found none of them).

---

## Already Minimal

- **Calendar → visit**: one click on `START` opens the form with patient, doctor, slot and appointment link already set — no setup screen, no re-selection (measured). Matches the ideal.
- **Sticky identity bar**: one line, always visible, right content. Worth its space.
- **Vitals carry over**: readings typed in the Vitals tab appear in the Prescription tab and on the printed prescription without re-entry; BMI is computed.
- **Photo upload**: multi-select, positions pre-guessed Front / Left / Right in order, one `Upload`, and the photos section marks itself — the one section that needs no attestation.
- **Diagnosis → treatment suggestions**: typing "Acne vulgaris" pre-filled three medicines from earlier plans. A large step saver; its safety framing belongs to the prescription critic.
- **Lab result units** are pre-filled (µIU/mL for TSH and Fasting Insulin).
- **`Complete Visit` itself**: one click, no confirmation dialog, and the calendar tile flips to `Completed` (measured). The visit stays editable afterwards (`Save Draft` still enabled), so a confirm would guard nothing. Do not add one.
- **`Back to Calendar`** returns to the same day and doctor.
- **Footer at 80 %** ([10](J3-doctor-visit-screens/10-labs-saved-ready-to-complete.jpg)): one status line, one secondary, one primary. This is what the whole form's hierarchy should look like.
- **Consultation type** defaults to In-person — right for almost every visit; only its size is at issue.
- **Previous visit while documenting (STORY-050)**: `History` tab → `Show details` gives last visit's complaint, diagnosis and medicines in two clicks without leaving the form (measured). Meets its ideal of 2.

---

## Functional bugs tripped over (not investigated)

1. The first `Mark Vitals Complete` on a not-yet-saved visit creates the visit ("Visit saved") but does not mark the section; a second press is needed. Reproduced on both patients.
2. Nurse: `Mark Vitals Complete` → `POST /visits` 403 "Forbidden resource"; vitals are lost to the doctor.
3. A reopened visit with three photos shows "0 Photos" and "Remaining: photos" until the `Photos` tab is opened.
4. Header save status stays "Unsaved changes" after successful saves and on a completed visit.
5. `Start new visit` (patient record) and Visits setup default to Dr Praneeta Jain for a signed-in Dr Shravya.
6. Tests ticked in `Lab Tests` are not on the prescription ("Investigations: 0").
7. Patients list: `View` / `Start Visit` buttons wrap letter-by-letter at 1440 px.
