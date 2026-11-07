# UX Flow Critique — 2026-11-07

Report-only (`--no-issues`). Six core journeys, three critic agents with two journeys each, plus one redundancy critic. Evidence came from ux-walker artifacts where they existed and live Playwright passes at 1280×800 where they didn't; the skill's `agent-browser` CLI was unavailable. Per-journey detail: [`journeys/`](journeys/). Cross-cutting: [`redundancy.md`](redundancy.md).

## Run summary
| Metric | Value |
|---|---|
| Journeys critiqued | 6 |
| Evidence source | ux-walker artifacts (2026-11-07) + live pass |
| Verdicts | 0 minimal · 0 acceptable · 6 convoluted |

## Friction scorecard
| Journey | Steps (actual/ideal) | Needless decisions | Re-entry | Dead ends | Verdict |
|---|---|---|---|---|---|
| J1 Reception books a returning patient (appointments STORY-001) | 7/5 (simpler: 4) | 2 | 0 | 1 + 1 soft | convoluted |
| J2 Walk-in registration, two routes (patients STORY-203 vs appointments STORY-002) | A 7/5 · B 9/6 (simpler: 4) | 2 | 2 | 2 | convoluted |
| J3 Doctor documents a visit to Complete (visits STORY-401) | ~25/8 (simpler: 9) | 4 | 2 | 3 | convoluted |
| J4 Doctor writes, prints, hands off a prescription (prescriptions STORY-001) | 23/8 + ≥6 to complete (simpler: 8) | 5 | 3 | 3 | convoluted |
| J5 Prescription → paid, dispensed sale (pharmacy STORY-603) | 27/12 (simpler: ~9) | 6 | 3 | 3 | convoluted |
| J6 Low stock → shortbook → PO → partial receipt (inventory STORY-810) | 26/12 (simpler: ~14 incl. batch/expiry) | 5 | 2 + 1 structural | 4 | convoluted |

## Redundancy map (from `redundancy.md`)
- **Duplicate paths:** 60 plus 9 dead-route groups. Recommendations: keep both 18, canonical 21, remove 8, merge 13. Worst cases: 13 separate links into `/dashboard/visits`; Calendar vs Slots render the same `DoctorDayCalendar`; five buttons open the same bill; three invoice lists.
- **Duplicate information:** 37 (23 noise, 9 partly justified, 5 justified). Examples: three headings on Patients; progress shown three times on a visit; vitals repeated inside the Prescription tab; queue counts repeated as tiles.
- **Overlapping features:** 18 (merge 8, canonical/remove 7, differentiate 3). The most consequential: Inventory → Sales → "Counter sales" posts a stock movement but never creates a pharmacy invoice (`inventory-workflow.service.ts:1444`), so it competes with the invoice builder as a second, unbilled sale model.
- **Hierarchy & IA:** 12 findings, 15 concepts with naming drift. Sidebar shows roles pages whose APIs 403. Dashboard leads with admin telemetry for every role.

## Simplification proposals (ranked)
Ranked by journey centrality × steps removed ÷ effort.

### 1. One save action and a required-fields gate for the visit
- **Now:** five save-type buttons (Mark Vitals Complete, Save Labs, Create Prescription, Save Draft, Save Prescription), plus an 80%-of-tabs gate that resets after Back. Complete Visit refuses with a toast listing work already done. (J3, J4)
- **Proposed:** autosave everywhere. Section completion computed from saved data. Complete Visit gated only on required clinical fields; photos and labs optional.
- **Saves:** ~10 steps on J3, ~6 on J4, plus every re-do after Back. **Effort:** M.

### 2. A saved prescription is already queued for the pharmacy
- **Now:** "Go to Pharmacy?" modal plus two hand-off routes with different results. The doctor lands on the pharmacist's billing screen with no way back. (J4, J5)
- **Proposed:** remove both routes and the modal; saving or printing queues it. Show a "Sent to pharmacy" chip.
- **Saves:** 3–5 steps and a dead end. **Effort:** S.

### 3. One pharmacy workstation, payment recorded at checkout
- **Now:** Counter → Billing → Desk → Invoices → Counter. Quantity decided twice; payment asked three times and recorded once; five buttons open the bill; the review table is 0px tall at 1280×800. (J5)
- **Proposed:** "Accept all & bill" in place; checkout records the payment; one status-driven primary button. Collapse Desk/Counter/Billing into one Pharmacy item with one Invoices list. Retire Inventory "Counter sales" or route it through the invoice builder.
- **Saves:** ~18 steps on the money path. **Effort:** L.

### 4. Click a slot → booking dialog with patient search inside; merge Calendar and Slots
- **Now:** the Patient field looks like a filter. Clicking a slot first gives a "Patient required" toast with the field off-screen. Confirm sits below the dialog fold. Calendar and Slots duplicate the same grid. (J1, J2)
- **Proposed:** slot click opens the dialog with focused patient search; Confirm visible without scrolling; one schedule view with a duration control; fix the `?patientId` prefill.
- **Saves:** 3 steps on the most frequent front-desk task; booking from a patient chart goes from 9 steps to 4. **Effort:** M.

### 5. One walk-in route that names the slot
- **Now:** Patients → New Patient (15+ fields, books "next free" without showing it, Create off-screen at 1280×800) vs the inline add (8 fields; phone-first typing splits digits into First Name). "Patient Type" is never saved. (J2)
- **Proposed:** a single form with "Save & book next free: 11:30 today".
- **Saves:** 3–5 steps and a route decision. **Effort:** S–M.

### 6. One start-visit helper and a doctor-default "Today" list
- **Now:** 13 entry points; Slots creates a placeholder "General consultation" visit; the Visits picker loads one doctor; dashboard appointment rows aren't clickable. (J3, J4, redundancy)
- **Proposed:** one helper that knows the appointment and the signed-in doctor; a clickable Today list as the doctor's home.
- **Saves:** 2–3 steps and the misattribution risk. **Effort:** M.

### 7. Purchase order: one supplier field, "Place order", receive on the PO with batch and expiry
- **Now:** two supplier dropdowns (using the lower one breaks Create PO); Save draft before Submit; Submit + Approve by the same person; Send can only fail without email; receiving jumps tabs and has no batch/expiry entry. (J6)
- **Proposed:** as described, plus "Close remaining".
- **Saves:** ~12 steps. **Effort:** M–L.

### 8. Role-specific home and one definition per "needs attention" number
Inventory Today owns low stock and expiry; the bell and Desk link to it. Remove the permanent "All systems operational". (Redundancy) **Effort:** M.

### 9. One editor per admin concept
A single doctor-settings page (availability, holidays read-only, WhatsApp) and a single role/permissions editor. This removes a holiday delete with no confirm that hits every doctor, and "Apply Role" silently overwriting permissions. (Redundancy) **Effort:** M.

## Already minimal
- The booking dialog's summary block (patient, phone, date, slot), its 30-minute OPD defaults and the remembered doctor.
- The inline add-patient dialog itself.
- Medicine search with stock levels and Best Match; one-click dose and duration presets; Print saves before printing; BMI auto-calculation; dermatology exam chips.
- Inventory is deliberately the single stock entry in the sidebar (`sidebar.tsx:38-41`).

No GitHub issues were filed (report-only run).
