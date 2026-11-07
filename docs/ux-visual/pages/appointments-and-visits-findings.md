# ux-visual — /dashboard/appointments and /dashboard/visits findings

Phase 2 inspection (report-only; `--no-implement --no-second-opinion`). Viewports 1440x900, 768x1024, 375x812; roles reception and doctor (shravya). Measurements: `pages/appointments/audit.json`, `pages/visits/audit.json` (re-measured contrast under `extra`, because layout-audit.js misreads Tailwind v4 oklch colours). Screenshots were kept out of the repo (session scratchpad). The "N" circle in screenshots is the Next.js dev indicator.

Counts: 48 findings — P0 5 · P1 20 · P2 18 · P3 5 (appointments 2/11/9/3, visits 3/9/9/2). Levels: component 31 · group 4 · page 11 · layout 2.

## Worst five
1. **APT-01 P0** — the day grid silently drops any appointment outside its hour window (`DoctorDayCalendar.tsx` ~382–399 returns `null`). The window comes from the doctor's working hours and falls back to 09:00–18:00 when none are configured (`DoctorDayCalendar.tsx:67-72`, `AppointmentsCalendar.tsx:120-133`). The backend accepts bookings outside that window, so today's three 18:30–19:45 appointments for Dr Shravya are invisible in both Calendar and Slots, with no hint. *Orchestrator check: confirmed in code; the "hard-coded" part applies only when no working hours are set.*
2. **APT-02 P0** — opening Slots resets the schedule to the first doctor (`AppointmentScheduler.tsx:168`); the header still says Shravya while Praneeta's schedule is shown and bookable, and it persists after switching back.
3. **VIS-01 P0** — the Visits doctor picker loads doctors with `limit:1`; logged in as Shravya, the only choice is Praneeta, so visits are misattributed.
4. **VIS-02 P0** — print preview and printed prescription show "Doctor cmw6d9" in the header and a nameless "Dr." in the signature (`PrescriptionBuilder.tsx:2397`).
5. **VIS-03 P0** — visit form content is wider than the page (1408px in 1184px at 1440; 1400px in 375px on mobile); Create Prescription and Complete Visit are clipped; patient ID wraps one character per line.

## Appointments
| id | sev | level | finding | evidence |
|---|---|---|---|---|
| APT-01 | P0 | component | Out-of-window appointments dropped silently | worst #1; `extra.scheduleToday` |
| APT-02 | P0 | page | Slots tab swaps in another doctor's schedule | worst #2; `extra.doctorRace` |
| APT-03 | P1 | component | Confirm Booking below the fold inside the dialog at every viewport | `extra.dialog` |
| APT-04 | P1 | component | Requested `max-w-4xl` loses to built-in `sm:max-w-lg` → 512px dialog; no side margin on mobile | measured |
| APT-05 | P1 | component | Badge wrapping rule breaks single words ("Avai/labl/e") | shared design-system cause |
| APT-06 | P1 | page | Grid starts ~705px down at 1440 (2 of 18 rows visible), ~1200px at 375 | measured |
| APT-07 | P1 | group | Filters split over two cards; Patient (needed to book) mixed with view filters | observed |
| APT-08 | P1 | page | Calendar vs Slots are the same grid with different labels | observed |
| APT-09 | P1 | component | "No patient" validation is a far-away toast; Patient field not focused | observed |
| APT-10 | P2 | component | Patient search warns on first keystroke; results push grid ~90px; name shown twice | observed |
| APT-11 | P1 | component | Empty slots not reachable by Tab — no keyboard booking | `extra.tabOrder` |
| APT-12 | P1 | component | Appointment actions hover-only, abbreviated caps (INFO/RESCHED/START), 27px; unusable on touch | observed |
| APT-13 | P2 | component | Appointment row fields spread across ~1000px; OPD tag purple vs blue legend | measured |
| APT-14 | P2 | component | Legend: 8 near-identical pale swatches; wraps to 8 lines on mobile | observed |
| APT-15 | P2 | page | No empty-day state | observed |
| APT-16 | P1 | layout | At 768 "Start Tour" wraps to 4 lines, sidebar doesn't collapse, "Dermatolo/gist" | observed |
| APT-17 | P1 | component | At 375 appointment labels spill out of the column, time clipped | measured |
| APT-18 | P2 | component | Hour labels 12px at 2.20:1 contrast | measured |
| APT-19 | P2 | group | Doctor/Date card spacing uneven; Quick Guide button as wide as an input | observed |
| APT-20 | P2 | component | Raw codes in dialog copy ("for OPD", "PROCEDURE *"); room cards lack selection cue; disabled Confirm with reason below fold | observed |
| APT-21 | P2 | component | Dialog close target 16×16px | measured |
| APT-22 | P2 | component | Escape returns focus to body, not the slot | measured |
| APT-23 | P3 | page | 7 font sizes | measured |
| APT-24 | P3 | component | Date input mm/dd vs "08 Nov 2026" in dialog | suspected |
| APT-25 | P3 | component | Off-scale spacing 3/6/10px | measured |

Excellent as is: no page-level or horizontal scroll; dialog's patient/date/slot summary; per-slot room availability with conflict detail; visible focus rings on filters; past vs future tile tint.

## Visits
| id | sev | level | finding | evidence |
|---|---|---|---|---|
| VIS-01 | P0 | page | Doctor picker `limit:1` misattributes visits | `extra.doctorOptions` |
| VIS-02 | P0 | component | Printed prescription has no prescriber name | `PrescriptionBuilder.tsx:2397` |
| VIS-03 | P0 | layout | Visit form wider than page; footer actions clipped | `extra.mainHorizontalOverflow` |
| VIS-04 | P1 | page | Header says "Patient: Unknown • Doctor: Dr." while the card shows the patient | observed |
| VIS-05 | P1 | component | Badges/buttons break mid-word ("IN PROGRES S", "DRAF T", "Workflo w") | same cause as APT-05 |
| VIS-06 | P1 | component | Medicine table: "When" select reads vertically, "Rem/ove", truncated names | observed |
| VIS-07 | P1 | page | Print/Download/Save below the fold in print preview (Print at y=1380 in 900px); 9 buttons, two primary | `extra.printPreview` |
| VIS-08 | P1 | component | Chief complaints ~642ms per keystroke on the dev build under load — re-measure on a production build | caveat |
| VIS-09 | P1 | page | Landing leads with "Role & Permissions"/"Available Features" cards; no waiting-patients list | observed |
| VIS-10 | P1 | group | Header crowded: unlabelled 6-icon stepper + chips + 2 back buttons + tour + shortcuts | observed |
| VIS-11 | P1 | group | Vitals repeated from Vitals tab; doubled labels ("Diagnosis/Diagnosis") | observed |
| VIS-12 | P2 | page | Progress shown three times; raw "Captured By: DOCTOR" | observed |
| VIS-13 | P1 | component | Bright red "Reset to default" is the loudest toolbar button, next to Undo/Redo | observed |
| VIS-14 | P2 | component | Empty Treatment Suggestions panel is the heaviest element | observed |
| VIS-15 | P2 | component | Raw DB patient id shown | observed |
| VIS-16 | P2 | component | Overview tabs wrap to 2 rows at 1440 | observed |
| VIS-17 | P2 | component | Native select and mm/dd/yyyy date input | observed |
| VIS-18 | P2 | component | Create Prescription / Complete Visit disabled with no reason | observed |
| VIS-19 | P2 | component | Print allowed with zero medicines | observed |
| VIS-20 | P2 | component | Escape from preview doesn't return focus | measured |
| VIS-21 | P2 | page | Preview at 375 clipped to a narrow band | observed |
| VIS-22 | P3 | component | Emoji browser tip; ambiguous "Live Preview: Off" | observed |
| VIS-23 | P3 | component | Close target 16×16px | measured |

Excellent as is: medicine search with stock levels and Best Match ranking; frequency/duration presets (1-0-1, 7d); clean prescription sheet layout; dermatology examination chips (Fitzpatrick type, morphology, body areas).
