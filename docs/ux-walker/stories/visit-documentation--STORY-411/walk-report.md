# Walk report: STORY-411, record a Soprano LHR session on the Procedures page

- **Topic**: visit-documentation
- **Persona**: Dr. Shravya (DOCTOR)
- **Result**: **FAIL**. "Save Procedure" can never succeed: the backend returns 400 "complaints must be an array" and the page shows a native alert. View Details is dead. Load & Edit mixes stale form data into the loaded record.
- **Screenshots**: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/visit-documentation--STORY-411/`

**Data substitution**:

- **Patient**: Sai Teja Goud is not seeded, so I used **Rohit Agarwal** (46M).
- **Nurse**: Swathi is not seeded, so I used "Sowmya Reddy" (the default `nurse@` user).
- **History card**: to exercise steps 8–10 I created one prior procedure visit via the API with the same payload shape plus `"complaints": []`. It succeeded (visit `cmw6ep04m009d7dc16tm7rdp7`), which proves the missing field is the only blocker.

## Steps

| # | Story step | What happened | Screenshot |
|---|---|---|---|
| 1 | Procedures in sidebar | "Smart Procedures Management" with New Procedure / Procedure History / Analytics ✓. | `step-01-procedures.png` |
| 2 | Basic Information | "Patient *" silently preselects the first list entry, a walker-created "UXW MgrToast". It is a plain Select of 14 names with no search. "Doctor *" defaults to **Dr. Praneeta Jain**, not the signed-in Dr. Shravya. I changed the patient to Rohit Agarwal and the doctor to Shravya. Nurse options: Sowmya Reddy, Nisha Nurse. | `step-01-procedures.png` |
| 3 | Session 3, shots 15200 → 16850, Chin + Neck, indications | Total Shots auto = 1650 ✓. | — |
| 4 | Fitzpatrick Type IV, Herpes None | ✓ | — |
| 5 | Soprano Platinum LHR | The parameter table shows Area / Fluence / Spot Size × Pass 1–8 ✓. Inputs are ~66px wide, placeholders are truncated ("fluenc", "spot s"), and there are no units. | `step-05-soprano-grid.png` |
| 6 | Fill Pass 1–3 | Values are entered but clipped in the cells ("Bearc"). | `step-07-save-procedure.png` |
| 7 | Notes → Save Procedure | `POST /api/visits` → **400 {"message":["complaints must be an array"]}** → native `alert("Failed to save procedure. Please try again.")`. The form keeps its data, but a retry can never work. | `step-07-save-procedure.png` |
| var | Fotona Starwalker | Rows: Area, Spot Size, Energy, Fluency, Frequency, Wavelength, PTP Mode, **Area**. Typing in the second Area row fills the first. Soprano values ("Beard line") persist in passes 2–3. | `variation-fotona-duplicate-area.png` |
| 8 | Procedure History → Refresh | "Procedures captured from visits (1 found)". The card shows patient, time, machine badge and doctor. It shows **no session number and no parameters**. | `step-08-history.png` (empty before seeding), `step-08b-history-with-card.png` |
| 10 | View Details | Nothing happens: no dialog, and the DOM is unchanged. | `step-10-view-details-nothing.png` |
| 9 | Load & Edit | The tab switches to New Procedure and the machine is set to Soprano. **Session No. resets to 1** and **Notes are cleared**. Shot counts and body parts stay as the previous unsaved values (15200/16850, Chin + Neck), not the loaded session's (13000/15200, Chin). | `step-09-load-edit.png` |
| 11 | Analytics | "Analytics dashboard coming soon" ✓ (placeholder). | `step-11-analytics.png` |
| M | Mobile 390×844 | Single column ✓. Tabs wrap. The parameter table scrolls inside its card, and pass inputs are ~40px wide (unusable); Area pass 1 shows "Up…" (Fotona value leaked into the Soprano grid). | `mobile-check.png` |

## Geometry audit

- **New Procedure (1280)**: `wrappedControls` lists the 4 machine buttons, but that is the intended icon-over-label layout, so it is not logged. Otherwise clean.
- **Mobile**: `wrappedControls`: the 3 tab triggers (New Procedure, Procedure History, Analytics) and the machine buttons.

## Mapped defects touched

| Defect | Verdict |
|---|---|
| #14 Save Procedure always fails (missing `complaints`) | **CONFIRMED** (400 + alert; the API with `complaints: []` succeeds) |
| #15 View Details dead; Load & Edit cannot edit | **CONFIRMED**, worse than described: Load & Edit also keeps stale shot counts and body parts and wipes notes |
| #16 Fotona "Area" twice, mirrored | **CONFIRMED** |
| #17 history cards don't show per-pass parameters | **CONFIRMED** |
| Edge: stale parameters on machine switch | **CONFIRMED** |

## Flow log

- **Ideal path**: 6 steps. The goal (save the session) was **not achievable** in any number of steps.
- **Hesitations**:
  - The preselected unknown patient.
  - The doctor defaults to someone else.
  - The patient list cannot be searched.
  - There are no units on fluence or spot size.
  - The generic alert gives no reason.
  - View Details does nothing.
  - Load & Edit produced a form that mixes two sessions.
- **Duplication**: procedures can also be recorded in the visit form (Prescription → Procedures and the visit-level procType/fluence fields). History reads only the visit form's single-procedure fields, so the two entry points disagree.
