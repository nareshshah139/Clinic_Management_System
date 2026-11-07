# Walk report: STORY-001, write, print and hand off an acne prescription

- **Topic**: prescriptions-print-share
- **Persona**: Dr. Shravya (DOCTOR)
- **Result**: **FAIL**. Prescription creation, preview, Print (saves first) and Download PDF all work. But:
  - The calendar tile route does not exist for the evening appointment.
  - The footer "Go to Pharmacy" hands off without saving, and the unsaved medicine is missing from the bill.
  - "Refill eligible" is printed on a non-refillable Rx.
  - High contrast leaks app-wide.
  - Step 18 (Complete Visit) is unreachable after coming back, because section progress resets to 0%.
- **Screenshots**: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/prescriptions-print-share--STORY-001/`

**Data substitution**: Arjun Rao is not seeded. Arjun Reddy's appointment is with Praneeta, and Kavya Patel's visit was already in use by another walker. I used **Priya Sharma** (29F, OPD 18:30 today with Dr. Shravya).

- Appointment: `cmw6dbj17001a7dc1yfck7pql`
- Visit: `cmw6esnai00b07dc1oi4byggb`
- Prescription: `cmw6esndg00b57dc1p2d6y7er`

No signature or letterhead is uploaded (STORY-004 was not run), so the signature checkbox is disabled. The UI explains this ✓.

## Steps

| # | Story step | What happened | Screenshot |
|---|---|---|---|
| 1 | Log in | The form login hit the shared throttle: **"ThrottlerException: Too Many Requests (Reference: …)"** shown raw. I used a cookie from an API login instead. The dashboard shows "Today's Appointments". | `step-01-login-throttled.png`, `step-01-dashboard.png` |
| 2 | Appointments → 18:30 tile → Start Visit | **Not possible.** The calendar ends at 18:00 (STORY-401 F1). The dashboard "Today's Appointments" rows are not clickable and show the raw "IN_PROGRESS" enum. I used the tile's deep link `?patientId&appointmentId&autoStart=true`. The form opens on Overview with "Linked to Appointment" ✓. | `step-02a-dashboard-today.png` |
| 3 | Prescription tab | No "Loading templates…" was observed (fast load). The Templates control is a dropdown menu ✓. The Patient Context ID chip renders one character per line. | `step-04a-templates-open.png` |
| 4 | Template "Acne (Mild) — Topical regimen" | Adapalene Gel 0.1% (Once daily, Bedtime, 12 weeks) and Benzoyl Peroxide Gel 2.5% (Morning, 12 weeks) ✓, plus an always-present blank row. Both template drugs show "Stock: —" because they are not linked to the drug master. | `step-04b-template-applied.png` |
| 5 | Diagnosis "Acne vulgaris – grade 2" | Accepted. The suggestions card shows no matched plan. | — |
| 6–7 | Blank row → "doxy" | Dropdown: "Doxycycline 100 mg Tablets (Strip of 10)", stock shown ✓. Selecting it pre-fills 1-0-0 / 14 days ✓. | `step-07-doxy-search.png` |
| 8 | 0-1-0, After Lunch, 4w | Row = 0-1-0, After Lunch, 4 WEEKS ✓. The table cells are crushed: "Be/dti/me", "Aft/er/Lu/nc/h", "WEEK/S", raw "ONCE_/DAILY". | `step-08-doxy-regimen.png` |
| 9 | Instructions | ✓ | `step-08-doxy-regimen.png` |
| 10 | Follow-up "Review in 4 weeks", review date | The review shortcuts are 7d/2w/3w/30d/6w (there is no "4w"). 30d → 2026-12-07 ✓. | — |
| 11 | Create Prescription | Footer "Total items: 3 • Total qty: **0**". The "Go to Pharmacy?" dialog shows "3 medications were added…" ✓. | `step-11-create-dialog.png` |
| 12 | Stay Here | The dialog closes; the Prescription tab gets its dot ✓. | — |
| 13 | Print Preview | "Processing pagination…", then a page with patient, code SEGLM, Dx, a chief complaint **"Acne lesions on face" injected by the template** (never typed), the Rx table, review date and follow-up ✓. | `step-13-print-preview.png` |
| 14 | Letterhead / signature | "Letterhead (none uploaded)". "Show signature" is disabled with help text ✓. **Refill stamp** prints "Refill eligible" although the Rx has `maxRefills: 0`. The **Printer profile** select is empty. | `step-14-refill-stamp.png` |
| 15 | Print | `window.print` (stubbed) is called once. Before that the app PATCHes the visit and prescription and POSTs print-events, so it saves first ✓. | — |
| 16 | Download PDF | "Generating PDF…" → "PDF ready" → `prescription-cmw6esndg00b57dc1p2d6y7er.pdf` ✓. In the PDF the "Refill eligible" stamp is clipped at the top-right edge, and a "Signature" caption prints with no signature. | `step-16-pdf.png`, `pdfpage-1.png` |
| (12) | High contrast → Close | `body.high-contrast` stays after Close, so the whole app is in high-contrast. The button has no pressed state. | `finding-high-contrast-leak.png` |
| 17 | Footer "Go to Pharmacy" | Before clicking, I added an unsaved 4th drug (Salicylic Acid 12% Ointment, 1-0-1, 4w). The click sent **no save request**, raised the browser "leave site?" prompt, and did a full navigation to `/dashboard/pharmacy?patientId…&doctorId…&visitId=…`. Pharmacy Billing shows "Items from prescription: **3**", so the 4th drug is not billed. Both template drugs are flagged "Not linked – link inventory before billing" and priced as "Dosage: 1 TABLET", 0/84. | `step-17-pharmacy-handoff.png` |
| 18 | Browser Back → Complete Visit | The visit reopens with the unsaved row restored from the local draft, but progress is **0% • 0 of 5**: the Prescription completion was lost although the Rx is saved. Complete Visit is disabled and would also need vitals, a photo and Save Labs (STORY-401 F7). **Not completed.** | `step-18-back-to-visit.png` |
| M | Mobile 390×844 (Prescription tab) | `main` scrollWidth is 1400 inside 390. Only the start of the medicine column is visible. | `mobile-check.png` |

## Geometry audit

- **Prescription tab (1280)**: same as STORY-401. `main` overflows (1407 vs 1024), with spills on the page container and Patient Context row (407px).
- **Preview**: not geometry-audited. Visually, three heavy primaries and two Close buttons; "PDF via WhatsApp" wraps.
- **Mobile**: `main` is 1400px wide in a 390px viewport.

## Mapped defects touched (prescriptions-print-share topic)

| Defect | Verdict |
|---|---|
| #4 footer "Go to Pharmacy" hands off without saving; URL uses only `visitId` | **CONFIRMED** (unsaved 4th item missing from the bill; the URL carries `visitId` only) |
| #10 Printer profile select is dead UI | **CONFIRMED** (no options) |
| #11 "Refill eligible" printed unconditionally | **CONFIRMED** (`maxRefills` = 0) |
| #12 High contrast leaks app-wide | **CONFIRMED** |
| #13 Email gated differently | Not tested |
| #1 / #2 / #3 email and WhatsApp sharing | Not tested (out of this story's path) |
| Story step 15 "Print saves first" | Works as described |

## Flow log

- **Ideal path**: 8 steps. Actual: 17 to reach the pharmacy handoff, and the visit was still not completed.
- **Detours**:
  - The calendar tile was missing, so I needed a deep link.
  - The table and footer were scrolled horizontally to reach Create Prescription and Go to Pharmacy.
  - I had to look up why the template drugs show no stock.
  - After Back, progress was reset.
- **Hesitations**:
  - "Total qty 0".
  - The When column cannot be read.
  - Which of Save Prescription, Print or Download PDF is primary.
  - "Refill eligible" without any refill setting.
  - The leave-site prompt when pressing a handoff button.
- **Re-entry**: template drugs must be re-linked at the pharmacy counter. After returning, the doctor would have to re-trigger section completions to finish the visit.
- **Duplication**: two handoff routes with different URLs (footer `visitId` vs dialog `prescriptionId`). Save exists in 3 places (Create Prescription, Save Draft, preview Save Prescription). Close appears 3× in the preview.
