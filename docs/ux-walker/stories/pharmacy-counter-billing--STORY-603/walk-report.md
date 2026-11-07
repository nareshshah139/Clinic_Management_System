# Walk report: STORY-603, doctor prescribes, then the pharmacist reviews, bills, prints, collects and dispenses

- **Topic**: pharmacy-counter-billing
- **Result**: **FAIL**
  - The PHARMACIST persona cannot bill at all.
  - The Counter cannot be used at 1280x800.
  - Payment is not captured at checkout.
  - Download PDF fails and leaves the page unclickable.
  - Dispense works without any invoice.
- **Walked**: 2026-11-07 with Playwright Chromium. The default viewport was 1280x800. I used 1920x1080 only where 1280 made the Counter unusable, and say so at each step.
- **Personas**:
  - Doctor: shravya@clinic.test (with praneeta@ for the variant)
  - Pharmacist: pharmacist@clinic.test ("Pooja Pharmacist"), who stands in for "Suresh"
  - Admin: admin@clinic.test, used to finish the feature walk
- **Patient**: Kavya Patel (9876543213). I used her instead of "Ananya Varma" because another walker was already using Ananya Gupta's visit.
- **Data**: the medicines are inventory items "Clindamycin 1% Gel 20g", "Doxycycline 100 mg Tablets (Strip of 10)" and "Broad Spectrum Sunscreen SPF 50 50ml". I used these because the story's Clindac-A, Doxt-SL and La Shield cannot exist in the drug master (D-1).
- **Screenshots**: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/pharmacy-counter-billing--STORY-603/`
- **Scripts**: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/scripts/pharmacy/s603*.js`

## Doctor leg (steps 1–2)

| Step | Screenshot | What the screen shows | Geometry / network |
|---|---|---|---|
| 1a Appointments | `d01-appointments.png` | The Doctor select defaults to **"Praneeta Jain"**, not the logged-in Dr. Shravya. | clean |
| 1b Switch doctor to Shravya | `d02-calendar-shravya.png` | The calendar grid shows 09:00–17:00. Today's appointments are 18:30–20:00, so they never appear, and "Continue Visit" (CONT/START) cannot be reached. I used the "Start Visit" URL (`/dashboard/visits?patientId=…&appointmentId=…&autoStart=true`) instead. **This is a detour.** | n/a |
| 1c Visit Documentation | `d03-visit.png` | The header reads "Patient: Unknown • Doctor: Dr.". The visit card badges wrap one letter per line ("D R AF T", "Linked to Appoin tment", "Shortcuts" stacked vertically). This belongs to another topic and is logged here only. | n/a |
| 1d Prescription tab, add 3 meds | `d04-rx-tab.png`, `d05-search-0..2.png`, `d06-rx-filled.png` | The autocomplete shows inventory items with "Best Match" badges and stock. The page is scrolled horizontally, so the left part of the prescription table is cut off. The 0-1-0 frequency and duration fields work. | the table is wider than the viewport |
| 1e Create Prescription | `d07-before-create.png`, `d08-after-create.png` | Toast "Prescription created — 3 medications recorded". The "Go to Pharmacy?" dialog offers Stay Here / Yes. The footer reads "Total qty: 0". The DB stores `dosageUnit:"TABLET"` and `gstRate:18` for the gel and the sunscreen. | n/a |
| 2 Stay Here | `d09-stay-here.png` | The doctor's sidebar has no Pharmacy links. This matches the story. | n/a |

## Pharmacist leg (steps 3–10), PHARMACIST role

| Step | Screenshot | What the screen shows | Geometry / network |
|---|---|---|---|
| 3 Sidebar "Pharmacy Counter" (1280) | `p01-counter.png` | "Pharmacy Counter" appears twice (PageHeader and cockpit h3). The stat pills overlap ("Exceptions0", "Ready/Paid0"). The Active Dispense column is about 270px wide, so the status chip "Queued" stacks vertically and the "Reason or pharmacist note" input shows one letter per line. `GET /pharmacy/dashboard` returns 403 on every Counter load. | spills: the review table is **550px** wider than its column; pills 6-8px |
| 4 Click Kavya (1280) | `p02-kavya-selected.png`, `p03-review-table.png` | The task moves to "In Review", but **the review table is clipped to 2px high**. Playwright confirms the Accept/Sub/Edit/NA buttons are covered by the overflow-hidden container. **At 1280x800 the pharmacist cannot accept any line.** | Accept button rect (1225,612), clip box height 2px |
| 4' Same step at 1920x1080 | `p03b-counter-1920.png` | The layout works at this size. Each line reads "No inventory match / Needs pharmacist action" even though the stock column says IN STOCK and the prescription line carries an inventoryItemId. The unit shows the raw enum "TABLET ONCE_DAILY" for a gel. **"Pick 30" tubes of Clindamycin gel** (stock 50) and "Qty 30" sunscreen bottles: the dose count is shown as the pick quantity. | n/a |
| 5–6 Accept ×3, then Ready (1920) | `p04-accepted-1920.png`, `p05-ready-1920.png` | The accepted state is only a black pill, and the Accept label stays the same. "1/3" becomes "3/3 lines reviewed", then "Ready for billing review". **"Paid" and "Dispense" were already enabled at In Review with 0/3 lines reviewed.** | n/a |
| 7 "Open bill" | `p06-open-bill-1920.png`, `p06b-open-bill-1280.png` | The URL becomes `?section=billing&patientId=…&prescriptionId=…&doctorId=…`. The scroll-into-view scrolls the whole app shell, so the top header is pushed off-screen and a 64px blank band appears at the bottom. | n/a |
| 8–9 Linked Prescription and patient details | `p07-billing-loaded.png` | "Items from prescription: 3". Each line says "link inventory before billing — Link item". The patient is prefilled. **The Doctor select is empty**: `GET /drugs` returns 403, so `loadInitialData`'s `Promise.all` fails and the doctor list is blank. (Mapped defect 6 confirmed.) | 403 `/drugs?limit=100` |
| 8b "Link item" | `p08-link-dialog.png` | The dialog shows "Unable to search inventory. Try again.", then "No inventory candidates…". `GET /pharmacy/prescription-queue/inventory-suggestions` returns 403, and "Confirm and remember match" stays disabled. | 403 |
| 10 Fill qty, price and GST by hand, then Print Preview | `p10-cards-filled.png`, `p12-preview.png` | The card badges wrap mid-word ("No mat ch", "DR UG", "Prescri ption"). Print Preview is blocked by the toast **"Medicine needs review — Select a replacement or remove each unmatched medicine"**. Substitute also reads `/drugs` (403). **The pharmacist cannot bill a prescription. The walk ends here for this persona.** | n/a |

## Admin re-walk of the billing leg (steps 7–18)

| Step | Screenshot | What the screen shows | Geometry |
|---|---|---|---|
| 7–9 Load the same URL | `a01-billing-admin.png` | The doctor select now shows "Dr. Shravya Dermatologist". | n/a |
| 8b Link item ×3 | `a02-link-dialog.png`, `a03-after-link.png` | Each dialog lists the inventory match ("· 20 g · 50 tubes available"). After linking, the unit prices fill in (105/28/560) with GST 12/12/18. | n/a |
| 10–11 Qty 2 for gel, Confirm reviews, add sunscreen instructions | `a04-cards.png` | The review "Sold per tube. Filled 1; confirm how many the course needs" clears after Confirm. | uneven `Load`/`Substitute` rows (queue table above the builder) |
| 12–13 Summary, UPI, notes | `a05-summary.png` | Subtotal ₹826.00, Tax ₹132.72, Total ₹958.72. The footer repeats "3 items • ₹958.72 total". | widths only (label/value pairs, intentional) |
| 14 Print Preview | `a06-preview.png` | "DRAFT • Kavya Patel", badges "3 items · ₹958.72 · ORIGINAL", Status "Draft preview", Download PDF disabled. **The total appears 4 times on one screen** (header badge, Grand Total, Controls panel and summary behind the overlay). The "Confirm & Print" label wraps over 2 lines. | wrapped control: Close |
| 15–16 Confirm & Print | `a07-confirmed.png` | Toast "Success — Invoice PHI-2026-001 confirmed successfully". The status changes to Confirmed and the button to "Invoice Confirmed". The invoice now shows the branch header and the HSN/GST split. **The chosen Payment Method (UPI) does not appear on the printed invoice.** The amount in words reads "Nine hundred fifty nine rupees only" for ₹958.72. | n/a |
| 17 Download PDF | `a08-pdf.png`, `a20-pdf-fail-toast.png` | It fails with the console error `html2canvas: Attempting to parse an unsupported color function "oklch"` and the toast "PDF failed — Could not generate PDF. Use Print / Save as PDF instead." | n/a |
| 17b After the failure | `a09-banner.png`, `a23-banner.png` | **A leftover `div.html2pdf__overlay` shows a shrunken clone of the app and catches every click.** "Start a new invoice" or any other control cannot be clicked until the page is reloaded (Playwright: `html2pdf__overlay intercepts pointer events`). | n/a |
| 18 Banner | `a23-banner.png` | The amber banner "This checkout is confirmed. Reopen it for another copy." appears with "Reopen confirmed invoice" and "Start a new invoice". These sit only inside the dead overlay clone. | n/a |
| DB | n/a | `PHI-2026-001 | CONFIRMED | PENDING | UPI`. **Payment is not recorded** (mapped defect 7 confirmed). Stock was deducted (Clindamycin 50 → 48 and so on). | n/a |

## Collect and dispense (steps 19–22)

| Step | Screenshot | What the screen shows |
|---|---|---|
| 19 PHARMACIST: Desk → "Invoices" | `p14-invoices.png` | "Pharmacy Invoices" appears twice. All stat cards read 0, with "No invoices found — Try a different search or adjust the filters." This is really a 403 on `/pharmacy/invoices`. **The pharmacist cannot collect payment.** |
| 20 ADMIN: Invoices → Mark as Paid | `a14-invoices.png`, `a15-marked-paid.png` | Native confirm "Mark invoice PHI-2026-001 as paid? Remaining payment: ₹958.72", then alert "Invoice marked as paid successfully". The badge changes to COMPLETED. The sidebar highlights "Pharmacy Billing" while the Invoices page is open. |
| 21–22 PHARMACIST: Counter (1920) → Paid → Dispense → Done | `p16-counter-after-invoice.png`, `p17-paid.png`, `p18-dispensed.png`, `p19-done-filter.png` | Kavya already shows "Dispensed" and "Invoice" (derived on the server). After Paid and Dispense, the footer still reads **"Ready for billing review"**, "Open bill" stays the primary button, every line still says "Needs pharmacist action" with "Qty 0", and the card shows "14m pending" next to "Done". |

## Defect probes

- **Mapped #1, Paid/Dispense with no invoice: CONFIRMED, and worse than mapped.**
  - Dr. Praneeta prescribed Adapalene for Vikram Singh (`d11-vikram-rx.png`).
  - As the pharmacist I selected Vikram (In Review, 0/1 reviewed) and clicked **Dispense** once (`p20-vikram-in-review.png`, `p21-dispense-no-invoice.png`).
  - The task became **DISPENSED** immediately, with `paidAt` and `dispensedAt` set, **0 invoices** and **no stock movement** (Adapalene stayed at 60).
  - Ready/Paid/Dispense stay enabled afterwards.
  - The server did not require READY_TO_BILL.
- **New: the doctor can overwrite a billed and dispensed prescription.**
  - Dr. Shravya reopened Kavya's visit to write a second prescription and clicked "Create Prescription".
  - The toast read "**Prescription updated** — 1 medications". The dialog read "0 medications were added".
  - The DB shows the original prescription (already invoiced as PHI-2026-001, task DISPENSED) now holds only Adapalene. The Counter shows Kavya as "1 medicines · Done".
  - The invoice and the prescription no longer match (`d10-second-rx.png`).
- **Mapped (b), "Pick N" in doses vs selling units: CONFIRMED.** "Pick 30 · 50 available" for a gel tube, and "Pick 30" for Adapalene gel.
- **Mapped #14, duplicate titles: CONFIRMED** on Counter, Billing and Invoices.
- **Mapped #6, one failing load blanks the lists: CONFIRMED.** A 403 on `/drugs` blanks the doctor list for the pharmacist.
- **Mapped #7, checkout never records payment: CONFIRMED.**
- Not exercised: "Rx queue" no-op (#2), 8-entry cap (#3) and pending-attempt lock (#5).

## Mobile check (390x844)

`mobile-check.png`: the Counter stacks into one column, which reads better than at 1280. The queue cards are cut off on the right: the status badges "Done" and "Que…" are clipped, and the queue grid spills 62px. "Change link" labels wrap.

## Flow log

- Story path: 23 steps. Ideal path: 12.
- Actual path, ADMIN, to reach paid and dispensed: about 22 steps. The extra steps came from:
  - (a) the calendar doctor default and the hidden evening slots (2 detour steps plus a URL workaround)
  - (b) three "Link item" dialogs (3 dialogs × 2 clicks)
  - (c) a separate page to record payment
  - (d) Paid/Dispense on the Counter, which in practice are no-ops because the server already derived Dispensed
- The PHARMACIST persona reached step 10 and was then blocked. Their path also needed a 1920px window to accept lines.
- Hesitations:
  - Accept gives no confirmation beyond a colour change.
  - "No inventory match" sits next to IN STOCK.
  - Linking is required on the Billing page for items the doctor picked from inventory.
  - After "Confirm & Print", UPI had been selected but the invoice was Pending. Nothing in the builder says so.
  - "Collect payment" on the Counter only opens the builder.
- Re-entry of known data: the inventory match the doctor already chose must be re-linked by the pharmacist, and the payment method chosen at checkout must be "collected" again elsewhere.
- Redundancy: the total appears 4–5 times in the preview. There are 4 billing entry points (Bill, Open bill, Collect payment, the queue "Bill"/"Load"). "Pharmacy Counter" and "Pharmacy Billing" each appear twice on their own page.
- Side effects left in data: the invoices PHI-2026-001 (paid) and PHI-2026-004 (Vikram, billed later by admin to provide STORY-608 data), and the invoice-number gaps 002/003 from failed checkouts in STORY-605.
