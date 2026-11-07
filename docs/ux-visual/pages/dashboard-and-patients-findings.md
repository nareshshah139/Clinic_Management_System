# ux-visual — /dashboard and /dashboard/patients findings

Phase 2 inspection (report-only; `--no-implement --no-second-opinion`). Viewports 1440x900, 768x1024, 375x812; roles reception, doctor (shravya), manager; states populated, empty, loading, error, dialog, validation.
Measurements: `pages/dashboard/audit.json`, `pages/patients/audit.json`. Screenshots were kept out of the repo (session scratchpad).

Counts: dashboard 1 P0 / 4 P1 / 14 P2 / 3 P3; patients 2 P0 / 6 P1 / 15 P2 / 3 P3. Levels: 17 component, 11 group, 15 page, 5 layout.

## Worst five
1. **P0 Patients table** — every row is 783px tall at all three viewports; the 96px Actions column stacks 6 buttons whose labels break letter by letter ("Vi/e/w"). One patient per screen. Independently reproduced by the ux-walker front-desk walk at 1280px.
2. **P0 Create Patient dialog** — 985px tall at 1440x900, 1301px at 375; no max-height or inner scroll, so the title and Create button are off-screen. A patient cannot be registered on a phone. Root: `frontend/src/components/ui/dialog.tsx`.
3. **P0 Dashboard error state** — with APIs failing it shows "All systems operational", zero counts and "No appointments scheduled for today", with no error.
4. **P1 Design system wrapping** — `button.tsx`, `select.tsx`, `badge.tsx` carry `min-w-0 whitespace-normal [overflow-wrap:anywhere]`, which breaks labels mid-word app-wide ("FEM/ALE", "All Gen/ders", "Start Tour" on 3 lines at 768).
5. **P1 Dashboard priorities** — admin telemetry (Total Users, Branches, System Status) leads for every role; the doctor's Today's Appointments is below the fold (488px at 1440, 1717px at 375).

## Dashboard
| id | sev | level | finding |
|---|---|---|---|
| D01 | P0 | page | Error state indistinguishable from a quiet day (see worst #3) |
| D02 | P1 | page | Admin stat cards shown to reception, doctor and manager |
| D03 | P1 | page | Doctor's day sheet below the fold |
| D04 | P1 | component | Permanent "All systems operational" item styled as an alert with a warning icon and LOW badge |
| D05 | P2 | page | Alerts card 572px tall at 9% fill (measured) |
| D06 | P2 | component | Appointment rows not clickable while Recent Visits rows are links |
| D07 | P2 | component | Raw status enums ("IN_PROGRESS"); CONFIRMED and COMPLETED look identical |
| D08 | P2 | group | List capped at 5 with no total and no doctor column |
| D09 | P1 | layout | At 768 the header search shrinks to 56px and "Start Tour" wraps to 3 lines, overflowing the bar |
| D10 | P2 | component | "operational" overflows into its icon at 768 |
| D11 | P2 | page | At 375, ~1000px of stat cards precede appointments |
| D12 | P2 | page | Loading skeleton doesn't match the final layout (shift on load) |
| D13 | P2 | layout | Opening notifications shifts the page up 9px |
| D14 | P2 | component | Bell button's accessible name is just "3" |
| D15 | P2 | component | Quick Guide copy wrong; focus not returned after Escape |
| D16 | P2 | layout | No skip link; Log out is the 9th tab stop |
| D17 | P2 | layout | Mobile shell loses search, notifications, settings; nav sheet's X floats outside it |
| D18 | P2 | layout | Doctor nav shows "Test Transcribe"; footer name wraps |
| D19 | P3 | page | Generic welcome copy, no date |
| D20 | P3 | component | Appointments empty state has no action |
| D21 | P2 | component | Doctor Recent Visits truncate at 375 |
| D22 | P3 | page | 16px body, 6–7 font sizes, 156px stat cards — too sparse for a work tool |

## Patients
| id | sev | level | finding |
|---|---|---|---|
| P01 | P0 | component | 783px rows (worst #1) |
| P02 | P1 | component | Design-system wrapping root cause (worst #4) |
| P03 | P0 | component | Dialog overflows viewport (worst #2) |
| P04 | P1 | group | Validation only as a form-level banner out of view; no field highlighting, aria-invalid or required markers |
| P05 | P1 | component | Gender defaults to "Other" |
| P06 | P2 | group | Labels flush on inputs; focus rings overlap them |
| P07 | P2 | component | Phone field: no type=tel/inputmode, 3rd in form, no format check |
| P08 | P2 | group | Walk-in fields always visible; long help paragraphs |
| P09 | P2 | page | Shared error state replaces the table behind the modal |
| P10 | P1 | page | Three stacked titles say the same thing (Patients Management / Patients / Patient Records) |
| P11 | P2 | group | New Patient floats mid-row; Clear Filters sits away from filters |
| P12 | P2 | group | 168px filter card for one row; "Did you mean" chips push the table down |
| P13 | P1 | group | 6 action buttons per row for every role, Archive next to Edit |
| P14 | P2 | component | 19px ID/copy targets; two different identifiers per row |
| P15 | P2 | component | Table 1124px in a 1084px container at 1440 — "Actions" clipped |
| P16 | P2 | component | Empty search result offers no clear/create action |
| P17 | P2 | page | At 375 the first patient is ~1400px down |
| P18 | P2 | component | Detail header shows raw DB id ("cmw6…") |
| P19 | P2 | page | Phone/age/gender repeated on detail; "F" there vs "FEMALE" in list |
| P20 | P2 | group | Stray "—" and 13px header misalignment |
| P21 | P1 | group | Visit stepper Continue/View/Bill buttons lack context, duplicate "Resume last visit", clip at 375 |
| P22 | P2 | page | Reception's primary action is "Start new visit"; doctor gets no clinical summary |
| P23 | P2 | group | History tab: full-width Refresh, native selects, mm/dd/yyyy dates in an Indian clinic |
| P24 | P3 | page | Back sits among action buttons |
| P25 | P3 | page | New Patient / Create Patient / Add Patient naming drift |
| P26 | P3 | group | Duplicate upload buttons |

## Excellent as is
- Visible focus rings on every tab stop.
- Escape closes the patient dialog and returns focus to New Patient.
- Clean filtered-empty state at 1440.
- Doctor's Recent Visits and My Patients are proper links.
- Reception dashboard nearly fits one screen at 1440 (58px scroll).

## Audit caveats
Low-contrast hits are false positives from oklch colours; geometry-audit.js skips buttons containing an icon, so it missed the wrapped buttons; dialog-overlap hits are the dialog against the page behind it.
