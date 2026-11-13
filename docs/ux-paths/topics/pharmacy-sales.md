# Pharmacy sales, bills & returns

> Read-only analysis of the code as it stands. Labels in `code font` or "quotes" are strings found in the
> source. Paths are relative to `frontend/src/` unless prefixed. Items marked *(unverified)* were inferred,
> not read. Stories are numbered locally from 001.

Things the code does **not** have, which shape several stories below:

- The Sales bill builder has **no batch picker and no selling-unit field**. Batches are allocated by the server
  at confirm time (`backend/src/modules/pharmacy/pharmacy-invoice.service.ts`, non-expired, unheld stock). Batch
  and stock unit are only chosen by hand in the separate **Counter sales** document under Inventory.
- The Sales register has **no export button**. Export exists only in Pharmacy Report › Sales Register / Sales Bills (`Download`).
- A Sales bill **requires a registered patient** (`Patient *`); there is no "walk-in customer" option and no
  "add patient" control in the builder. An unnamed walk-in can only be sold to through a Counter sale.
- There is **no part-payment** at the counter: confirming a bill records one payment for the full total in
  the chosen method (`collectCheckoutPayment`).
- A finished bill can only have its **discounts** changed. Items, quantities and prices change only through a sales return.

---

## STORY-073: Bill a registered walk-in customer from scratch, print, and see it in the register

**Type**: long
**Topic**: Pharmacy sales, bills & returns
**Persona**: Sandeep Goud, pharmacist, Saturday 11:40 am, three people at the counter
**Goal**: Sell two over-the-counter items to a returning patient with no prescription, take UPI, hand over a printed bill
**Preconditions**: Signed in as PHARMACIST. Patient "Lakshmi Reddy, 98480 12345" exists. "Cetaphil Gentle Skin Cleanser 125 ml" and "Photostable Gold Sunscreen SPF 55 50 g" are in the drug master with unexpired stock.
**Ideal path**: 8 — open new bill, pick patient, add item ×2 (search + pick each), set one quantity, choose payment mode, confirm-and-print. Patient, items and payment are the only real decisions.
**Alternate paths**:
- Pharmacy Desk (`/dashboard/pharmacy?section=desk`) quick action `New sale` ("Bill a prescription or walk-in") → same bill page.
- Pharmacy Counter cockpit `Walk-in bill` (shown when the Rx queue is empty) / `Start billing` (no active prescription) → same bill page.
- Legacy URLs `/dashboard/billing` and `/dashboard/pharmacy?section=billing|invoices|payments` redirect to the same bill page (`sales-bill-model.ts` `pharmacyBillingRedirect`).
- Sales register empty state button `New sale` (only when the period has no rows and no filter is set).
- Inventory › Sales › `Counter sales` › `New document` — a *different document type* that also sells stock and lands in the same register (see STORY-082).

### Steps
1. Click `Sales` in the sidebar (Pharmacy group) → `/dashboard/pharmacy/sales` opens: title "Sales", tabs `Sales` / `Returns`, button `New sale`, filter bar and the register for the current financial year (Period shows "FY 2026-27").
2. Click `New sale` → `/dashboard/pharmacy/sales/bill`. The header button changes to `Back to Sales`. The page shows the card "Prescription dispensing queue" first, and the bill card titled "New bill" below it.
3. Scroll past the prescription queue to the bill (a walk-in has nothing in the queue, but the queue is always rendered above a new bill) → "Patient & Doctor Details" is visible.
4. Click the `Patient *` field ("Search patients by name or phone...") → a dropdown lists up to 20 of the first 100 patients.
5. Type `98480` → after ~300 ms the list is replaced by server matches (search starts at 2 characters).
6. Click "Lakshmi Reddy / 9848012345" → the field reads "Lakshmi Reddy (9848012345)"; in the right column `Billing Name *` and `Phone *` fill in automatically.
7. Leave `Doctor` empty (optional, placeholder "Select doctor") — Sandeep hesitates because the select has no "none" choice, but nothing forces a pick.
8. In "Add Items to Invoice" (tab `Individual Drugs` is selected) click `Search Drugs` and type `cetaphil` → results appear with price, manufacturer, pack size and a green "Best Match" badge on the first row. No stock figure is shown in the results.
9. Click `Add` on "Cetaphil Gentle Skin Cleanser 125 ml" → the search box clears; a card appears under "Invoice Items" with Quantity 1, Unit Price, Discount % 0, **Tax % 18** and Total. An empty "Prescription directions" block (Dosage / Frequency / Duration / Instructions) is also shown on the line.
10. Type `2` in `Quantity` → line Total and the "Invoice Summary" recalculate.
11. Type `photostable` in `Search Drugs` → results list.
12. Click `Add` on "Photostable Gold Sunscreen SPF 55 50 g" → second line added with Tax % 18.
13. Check `Tax %` on each line → the manual-add path always starts at 18 (the code comment says "Default GST") regardless of the product's own GST rate, so Sandeep must correct it by hand where the rate differs; both items here are 18 %, so he leaves them.
14. In "Invoice Summary", under `Bill discount`, leave the `%` toggle selected and type `5` → a green row "Bill discount (5%): -₹…" appears; helper text reads "On the whole bill after item discounts, before tax."
15. Read `Total:` in the summary and tell the customer the amount.
16. In "Billing Information" open `Payment Method` (default Cash) and choose `UPI` → options are Cash, Card, UPI, Net Banking only.
17. Customer pays by UPI on her phone; Sandeep checks the payment app (outside the system — there is no reference field for the UPI transaction on the bill).
18. Click `Print Preview` → a full-screen dialog "Pharmacy Invoice Preview" opens showing the bill as "DRAFT", badges "2 items", "₹…", "ORIGINAL", and a side panel "Invoice Controls" ("Draft previews are confirmed before printing or PDF export."), Status "Draft preview".
19. Click `Confirm & Print` → button shows "Confirming..."; the server creates the bill, issues number `PHI-2026-…`, deducts stock and records one UPI payment for the full total; toast "Success — Invoice PHI-2026-… confirmed successfully"; the browser print dialog opens.
20. Press Print in the browser dialog → the A5 "Pharmacy Invoice" prints with HSN, batch numbers and a GST split table.
21. Back in the preview, the green button now reads `Invoice Confirmed` (disabled), Status "Confirmed", and `Download PDF` is enabled. Click `Close`.
22. The builder is still on screen with the same lines, and an amber notice: "This checkout is confirmed. Reopen it for another copy." with `Reopen confirmed invoice`, `Start a new invoice`, `Back to Sales`. `Save draft` is hidden. Sandeep pauses — the form still looks editable and `Print Preview` is still enabled.
23. Click `Back to Sales` → the register reloads; the new bill is the first row (sorted by Entry Date, newest first) with Bill No `PHI-2026-…`, Patient "Lakshmi Reddy", Mobile "98480 12345", Bill Amount, and a violet `UPI` badge in Payment.

### Variations
- **Next customer straight away**: at step 22 click `Start a new invoice` instead → the form, patient, items and URL parameters are cleared and the title returns to "New bill".
- **Item-level discount**: type a value in a line's `Discount %` instead of (or as well as) the bill discount → summary shows "Item discounts: -₹…" above the bill discount.
- **Rupee discount**: click the `₹` toggle in `Bill discount` and type `50` → fixed-amount discount.
- **Confirm without printing**: at step 19 click the green `Confirm Invoice` instead → same checkout, no print dialog; then `Print` / `Download PDF` / `Close`.
- **Duplicate copy**: change `Copy Type` to `Duplicate` before printing → the printout says "Copy: DUPLICATE".
- **Treatment package**: switch to tab `Treatment Packages` and click a package card → one PACKAGE line with "Package Contents:".
- **Same item twice**: clicking `Add` on a drug already on the bill raises its quantity by 1 instead of adding a line.

### Edge Cases
- **Customer is not a registered patient**: the patient dropdown shows "No patients found" only when the list is empty; there is no "create patient" link in the builder, and PHARMACIST has no `Patients` sidebar entry. `Print Preview` stays disabled until a patient is chosen. The only in-role route is a Counter sale (STORY-082).
- **Out of stock is not shown for hand-added items**: stock badges ("Out of stock", "Insufficient stock: n available", "Low stock: n available") only appear on lines loaded from a prescription or substituted. A hand-added item with no stock fails at step 19 with toast "Error Confirming Invoice — Insufficient non-expired stock for …. Required 2, available 0."
- **Missing phone**: patient without a phone leaves `Phone *` empty; `Print Preview` then shows toast "Validation Error — Billing phone is required".
- **Bill discount too large**: `₹` discount above the bill gives inline alert "Bill discount ₹… is more than the bill after item discounts (₹…)." and toast "Check the bill discount" on preview.
- **Tax % cleared**: line shows "GST rate needs review. Enter Tax % before previewing or confirming this invoice."; totals read "GST pending".
- **PDF before confirm**: `Download PDF` is disabled until the bill is confirmed.
- **No "leave page" guard**: navigating away from an unsaved new bill loses it silently (no `beforeunload` handler in the builder).

---

## STORY-074: Bill a doctor's prescription from the queue, fixing stock problems on the way

**Type**: medium
**Topic**: Pharmacy sales, bills & returns
**Persona**: Farheen Begum, pharmacist, weekday evening OPD, patient waiting with a fresh prescription from Dr. Kavya Rao
**Goal**: Turn prescription lines into a paid bill, substituting one medicine that is out of stock
**Preconditions**: An ACTIVE, unexpired prescription for "Arjun Varma, 90000 41237" with 3 medicines; one maps to an out-of-stock product, one has an ambiguous quantity. Signed in as PHARMACIST.
**Ideal path**: 5 — open the prescription's bill, resolve the one flagged line, confirm the quantity, choose payment, confirm-and-print.
**Alternate paths** (all open the same builder with `?patientId=&prescriptionId=&doctorId=` or `&visitId=`):
- Sales › `New sale` › queue row `Load` (this story).
- Pharmacy Counter: "Prescription dispensing queue" row action `Bill` *(label per discovery)*, cockpit `Open bill` / `Start billing` / `Collect payment` (all call the same open-billing handler).
- Doctor's side: prescription builder footer `Go to Pharmacy`, and the post-create dialog "Go to Pharmacy?" → `Yes, go to Pharmacy`.
- Patient detail progress tracker `Bill` / `Invoices` button (`components/patients/PatientProgressTracker.tsx`).
- Pharmacy Desk `New sale`, then `Load` from the queue.

### Steps
1. Sidebar `Sales` → click `New sale` → bill page with "Prescription dispensing queue" on top (status filter All / Pending / Partial / Dispensed / Expired; columns Patient, Doctor, Medication, Status, Stock, Actions).
2. Find "Arjun Varma" in the queue; the Stock column already shows "Out" on one medicine and the row carries an "Over 2h" badge → click `Load` on that row.
3. The URL gains the prescription parameters and the page scrolls to the bill region; "Loading prescription data..." shows, then a blue "Linked Prescription" box ("Prescription ID: …", "Items from prescription: 3") and three lines marked 📋 with a "Prescription" badge. Patient, Doctor, Billing Name and Phone are filled in.
4. Line 2 shows a red "Out of stock" badge. Click `Substitute` on that line → focus jumps to `Search Drugs` with a blue notice "Choose a replacement for …. The prescribed quantity will be kept." and a `Cancel substitution` button.
5. Type the alternative brand name and click `Add` on the result → the line keeps its quantity and directions, shows the new product with "Prescribed: <original name>" beneath it, and its price and Tax % are replaced.
6. Line 3 shows an amber note about its quantity (server "billing quantity" review message) with a `Confirm` button → check the strip count against the prescription, adjust `Quantity` if needed (editing clears the note) or click `Confirm`.
7. Review `Tax %` on each line (prescription lines use the product's own GST rate; a line with no rate shows "GST rate needs review…").
8. Choose `Payment Method` → `Cash`.
9. Click `Print Preview` → "Pharmacy Invoice Preview" opens.
10. Click `Confirm & Print` → toast "Success — Invoice PHI-… confirmed successfully"; print dialog; print.
11. Click `Close`, then `Back to Sales` → the bill is the newest row in the register. (Farheen stops and wonders whether the prescription left the queue; the queue endpoint recomputes status server-side, per the `pending-refresh-after-invoice` contract comment.)

### Variations
- **Unlinked medicine**: a line with a red "No match" badge appears in the blue box as "<name>: link inventory before billing." with a link control (dialog "Link <name>"); alternatively `Substitute` it or remove it with the bin icon.
- **Patient declines one medicine**: click the bin icon on that line → removed from the bill only; the blue box states "Changes here do not alter the doctor's prescription."
- **Switch to another prescription**: click `Load` on a different queue row → a separate fresh bill is started so nothing carries over (`prescription-load-visible-draft` contract).
- **Arrive from the doctor's `Go to Pharmacy`**: steps 1–2 are skipped; the page opens already scrolled to the loaded bill.
- **Add an OTC extra**: search and `Add` a non-prescribed item; it has no 📋 marker.

### Edge Cases
- **Inventory check fails**: lines get "Inventory check failed" badges and an amber alert "Prescription loaded, but some inventory details could not be checked. Retry loading or select a replacement for the flagged items." with `Retry loading prescription`.
- **Prescription cannot load**: toast "Prescription load failed" and the same retry button; `Print Preview` then reports "Prescription not ready".
- **Unmatched line left on the bill**: preview is blocked with toast "Medicine needs review — Select a replacement or remove each unmatched medicine before confirming the invoice."
- **Queue row not billable**: when the server marks the prescription ineligible the `Load` button is disabled (expired / inactive prescriptions; server messages "Only active prescriptions can be billed", "Expired prescriptions cannot be billed").
- **Doctor mismatch**: changing the `Doctor` select away from the prescriber is refused at confirm ("Prescription doctor does not match the selected doctor").
- **Same queue, three places**: this queue component is also rendered on the Pharmacy Counter page, where the cockpit shows the same prescriptions a second time as "Rx queue".

---

## STORY-075: Park a half-finished bill as a draft and finish it later

**Type**: medium
**Topic**: Pharmacy sales, bills & returns
**Persona**: Sandeep Goud, pharmacist; patient Meenakshi Iyer has gone to the ATM mid-billing
**Goal**: Keep the bill without moving stock, serve others, then resume and finish it
**Preconditions**: A new bill with patient "Meenakshi Iyer, 99890 55214" and two matched items with Tax % filled.
**Ideal path**: 4 — save, later reopen from a visible "drafts" spot, confirm-and-print. (Autosave would make it 3.)
**Alternate paths**:
- Resume from Sales register: click the row with the "Draft" badge (this story).
- Resume from "Pharmacy Invoices" list (`/dashboard/pharmacy/invoices`, or Inventory › Sales › `Patient invoice history`): pencil icon `Continue in Sales`.
- Resume from a bookmarked/back-button URL `/dashboard/pharmacy/sales/bill?draft=<id>`.
- Remove a draft: `Discard draft` in the builder, or the red bin `Delete Invoice` on the invoice list (native confirm).

### Steps
1. On the bill, click `Save draft` (below `Print Preview`; hint text: "Saves the bill to Sales without moving stock or taking payment.") → toast "Draft saved — Meenakshi Iyer is in Sales as a draft. Open it from the Draft row to finish it."
2. The URL becomes `?draft=<id>`; the card title changes from "New bill" to a "Draft" badge with "Gets its bill number when finished"; the hint reads "All changes saved to the draft"; a `Discard draft` button appears.
3. Click `Back to Sales` and serve other customers (each via `New sale`).
4. Patient returns. On the Sales register look for the row whose Bill No cell is a yellow "Draft" badge for "Meenakshi Iyer"; the footer note says "1 draft not included" (drafts are listed but left out of the total).
5. (If the list is long) open `More filters` → `State` → `Draft` → only drafts remain; the button shows a count badge "1".
6. Click the draft row → "Loading draft bill…", then the builder opens with patient, doctor, lines, discount, payment method and notes restored. The prescription queue is *not* shown above a reopened draft.
7. Patient adds one more item: search, `Add` → hint flips to "Unsaved changes".
8. Click `Print Preview` → preview shows "DRAFT".
9. Click `Confirm & Print` → the draft is finished as `PHI-…`, stock moves, payment is recorded; print.
10. `Close` → `Back to Sales` → the row now shows the bill number instead of the Draft badge.

### Variations
- **Discard instead**: `Discard draft` → dialog "Discard this draft?" ("…will be removed from Sales. Nothing was sold, so stock and payments are unchanged. This cannot be undone.") → `Discard draft` (or `Keep draft`) → toast "Draft discarded" and return to Sales.
- **Save again after edits**: `Save draft` at step 7 → "All changes saved to the draft"; the save names the version it edited.
- **Print/WhatsApp a draft from the register**: both row icons are disabled with tooltip "Finish this draft bill first"; `Edit discount` is disabled with "Open the draft to change its discount".

### Edge Cases
- **Cannot save**: toasts "Draft not saved — Select a patient before saving the draft." / "Add at least one medicine before saving the draft." / "Choose a stocked product for … or remove it before saving the draft." / "Enter Tax % for … before saving the draft."
- **Two counters edit the same draft**: the second save shows a red banner "This draft was changed after you opened it. Reload it to see the latest version. Your changes on this screen were not saved." with `Reload draft`.
- **Draft finished elsewhere**: opening its link shows the finished bill view with notice "This draft was finished as bill PHI-…, so it can no longer be edited as a draft."
- **Draft discarded elsewhere**: "This draft no longer exists — It was discarded, or the link is out of date. Nothing was sold from it." with `Back to Sales` and `New sale`.
- **Load failure**: "Could not open the draft" with `Back to Sales` / `Try again`.
- **Unsaved edits are lost on navigation**: there is no autosave and no leave-page warning; only the "Unsaved changes" hint.
- **Stock is not reserved**: another sale can consume the stock while the draft waits; the shortage only surfaces at confirm.

---

## STORY-076: Find yesterday's bill by mobile number and reprint or WhatsApp it

**Type**: short
**Topic**: Pharmacy sales, bills & returns
**Persona**: Farheen Begum, pharmacist; a patient phones asking for a copy of her bill
**Goal**: Locate one finished bill and give the patient a copy
**Preconditions**: Finished bill `PHI-2026-398` for "Sunita Sharma, 98660 73310" dated yesterday.
**Ideal path**: 3 — search by mobile, click print (or WhatsApp). 
**Alternate paths**:
- Open the row → finished bill view → `Print`.
- Pharmacy Desk › `Invoices` → "Pharmacy Invoices" list → search → eye icon `View Invoice` (opens a new tab with a `Print` button) or `Download Invoice` (PDF).
- Inventory › Sales › `Patient invoice history` — the same list component.
- Pharmacy Report › Sales Bills / Sales Register (lookup only) *(row drill-down unverified)*.
- If the bill is the one just confirmed in this browser session: reopening it shows `Reopen confirmed invoice` → preview → `Print` / `Download PDF`.

### Steps
1. Sidebar `Sales` → in the filter bar change `Search by` from "Bill No" to `Mobile`.
2. Type `9866073310` in the search box → after 300 ms the register shows the matching rows; the URL now carries `field=mobile&q=…`.
3. Hover the printer icon at the end of the row (tooltip "Print") and click it → the bill is fetched and the browser print dialog opens with "Pharmacy Invoice PHI-2026-398".
4. Or click the green chat icon (tooltip "Send on WhatsApp") → a new tab opens `wa.me/919866073310` with the message "Dear Sunita Sharma, thank you for visiting <clinic>. Your pharmacy bill PHI-2026-398 dated … is ₹… (UPI)." — text only; no PDF is attached.

### Variations
- **Search by name or bill number**: `Search by` → `Patient` or `Bill No`.
- **Older bill**: default period is the current financial year; for last year pick `FY 2025-26` in `Period`.
- **Counter-sale row**: `Print` produces a "Pharmacy Receipt <reference>" with a Batch column instead of the invoice layout.

### Edge Cases
- **No mobile on the bill**: WhatsApp icon disabled, tooltip "No mobile number"; malformed number → "Mobile number is not a valid 10-digit number".
- **Cancelled bill**: Print and WhatsApp disabled, tooltip "This bill is cancelled"; amount is struck through.
- **Print fetch fails**: toast "Could not print — Check your connection and try again."
- **Different paper for the same bill**: the reprint from the register / finished view / invoice list uses `lib/pharmacy-invoice-print.ts` (no batch, HSN, copy type or GST split), whereas the print at confirm time uses the builder's own A5 layout with those details.
- **Nothing found**: empty state "No sales match your search — Nothing recorded between … and … with these filters." with `Clear filters`.

---

## STORY-077: Check the day's takings by payment mode in the Sales register

**Type**: medium
**Topic**: Pharmacy sales, bills & returns
**Persona**: Dr. Kavya Rao, clinic owner-doctor, 8:45 pm before leaving
**Goal**: See today's pharmacy sales, how much came by UPI vs cash, who entered them, and what is unpaid
**Preconditions**: Signed in as DOCTOR. Several bills, one counter sale and one draft exist for today.
**Ideal path**: 3 — open Sales, choose Today, read a per-mode breakdown in one place.
**Alternate paths**:
- Sidebar `Daily Collection` (Pharmacy Report › Daily Collection) — takings by payment mode with cash count.
- Pharmacy Report › `Sales Register` / `Sales Bills` / `Day wise Summary` — with `Download` (Excel) and `Print`.
- Pharmacy Desk header metrics `Sales` / `Invoices`.
- "Pharmacy Invoices" list tiles (Total Invoices, Total Amount, Completed, Pending Amount) — computed from the current page only.
- Reports & Analytics › Revenue Report (admin roles).

### Steps
1. Sidebar `Sales` → register for "FY 2026-27", newest first; footer reads "Total Amount ₹… · n bills".
2. In `Period` choose `Today` → rows and footer reload; the date link beside it reads today – today; the URL gains `from`/`to`.
3. Read the footer: "Total Amount ₹18,640.00 · 23 bills" and, underneath, "1 draft not included".
4. In `Payment` choose `UPI` → rows filter to bills with a UPI payment; footer changes to "Collected by UPI ₹… · n bills".
5. Change `Payment` to `Cash` → "Collected by Cash ₹… · n bills". (She notes there is no single view of all modes side by side.)
6. Change `Payment` to `Due (unpaid)` → rows with a red "Due ₹…" badge; footer "Due (unpaid) ₹… · n bills".
7. Set `Payment` back to `All`. Click `More filters` → set `Entry by` to "Sandeep Goud" → the button shows a "1" badge; only his entries remain.
8. In the same popover set `Source` to `Counter sales` → only rows with the blue "Counter sale" badge.
9. Click the `Bill Amount` column header → sorted highest first (arrow down); click again → lowest first.
10. Click `Clear all` → search, filters and period reset to the financial year (sort order is kept).
11. She looks for an export button to send the list to her accountant — there is none on this page; she goes to sidebar `Pharmacy Report` → `Sales Register` → `Download`.

### Variations
- **Custom dates**: `Period` → `Custom` (or click the date link) → popover "Custom dates" with `From` / `To` typed as dd/mm/yyyy; applies on blur or Enter.
- **Returns side**: click tab `Returns` → the second register (columns add "Against bill"; "Amount" and "Refund" replace "Bill Amount" and "Payment"; footer "Refunded by …"); each tab remembers its own filters while switching.
- **Phone width**: filters collapse behind a `Filters (n)` button.
- **Deep link**: the header bell's overdue items open `/dashboard/pharmacy/sales?pay=CREDIT`, i.e. this register pre-filtered to `Due (unpaid)`.

### Edge Cases
- **Range too long / reversed**: "Pick at most 400 days at a time." / "The From date is after the To date." / "Enter the From date as dd/mm/yyyy, year 2000 or later."
- **Load error**: red bar "Could not load sales. <message>" with `Retry`; footer "Total not available".
- **No permission**: "You don't have access to sales. Ask a clinic administrator to give your account access if you need it."
- **Page beyond the end** (e.g. stale `page=9` link): the register steps back to the last page automatically.
- **Label drift inside one filter**: the same mode is "Credit" as a row badge, "Due (unpaid)" in the filter and footer, and "Store credit" on the Returns tab.
- **50 rows per page**, fixed; previous/next arrows only.

---

## STORY-078: Give a forgotten discount on a finished bill and hand the money back

**Type**: medium
**Topic**: Pharmacy sales, bills & returns
**Persona**: Sandeep Goud, pharmacist; Dr. Rao phones the counter: "Mr. Narayana is staff family, give him 10 %"
**Goal**: Reduce the total of an already-paid bill, record why, and record the cash refund
**Preconditions**: Finished, fully paid bill `PHI-2026-405` for "K. Narayana, 94400 26118", total ₹2,360.00 paid by Card; no sales return against it.
**Ideal path**: 5 — open the bill's discount editor, enter 10 %, enter reason, save, record refund (method).
**Alternate paths**:
- Register row icon `Edit discount` (opens the bill with the dialog already open: `?bill=<id>&edit=discount`) — this story.
- Click the row → finished bill view → `Edit discount`.
- For a bill still in draft: change the discount in the builder itself (`Bill discount`, line `Discount %`).
- Money back for returned goods (not a discount): Returns › `New return` (STORY-079).

### Steps
1. Sidebar `Sales` → search `Bill No` = `405` (or find the row).
2. Click the `%` icon on the row (tooltip "Edit discount") → the bill page opens and the dialog "Edit discount on PHI-2026-405" appears on top ("Only discounts change. Items, quantities, batches and stock stay as billed, and the bill keeps its number.").
3. Under `Bill discount` keep `%` selected and type `10` → the grey box shows "Total now ₹2,360.00", "Total after change ₹2,124.00" and an amber "Refund due after saving ₹236.00".
4. `Save discount` is still disabled with the hint "Enter a reason to save." → type in `Reason *`: "Staff family discount approved by Dr. Kavya Rao on phone".
5. Click `Save discount` → toast "Discount changed — PHI-2026-405 is now ₹2,124.00."; dialog closes.
6. The bill header now shows badges "Refund due ₹236.00" and "Revised <date>", an amber notice "₹2,360.00 was taken, ₹236.00 more than the bill total of ₹2,124.00. Hand it back and record the refund.", and a new card "Discount changes" listing time, Sandeep's name, "₹2,360.00 → ₹2,124.00" and the reason.
7. Click `Record refund ₹236.00` → dialog "Record refund of ₹236.00" ("K. Narayana paid more than the revised total of PHI-2026-405. Record the money you hand back.").
8. `Paid back by` defaults to `Cash` (options Cash, UPI, Card, Net banking, Wallet) — Sandeep hesitates: the customer paid by card, but he is handing back cash; he leaves `Cash`. `Reference (optional)` left blank.
9. Click `Record refund ₹236.00` → toast "Refund recorded — ₹236.00 paid back by Cash on PHI-2026-405."; header badge becomes "Paid"; the "Payments" card lists "Received · Card · …" and "Refund · Cash · …" with "-₹236.00".
10. Click `Print` → a revised copy prints with a "Revised" line. `Back to Sales` → the row shows a blue "Revised" badge and a grey "Refunded ₹236.00" badge beside `Card`.

### Variations
- **Per-item discount**: edit a line's box under "Item discount %" instead of the bill discount.
- **Remove a discount (total goes up)**: the preview shows "Still to collect ₹…"; after saving, the bill shows "Due ₹…" — and there is no button here to take that money (see STORY-080).
- **Refund later**: skip steps 7–9; the register row keeps an amber "Refund due ₹236.00" badge until someone records it.

### Edge Cases
- **Nothing changed**: `Save discount` disabled, hint "Change a discount to save."
- **Invalid value**: "Discount for <item> must be between 0 and 100%." / "Bill discount cannot be more than 100%." with hint "Fix the discount first."
- **Bill changed meanwhile**: red box "Discount not changed — This bill was changed after you opened it. Reload it to see the latest amounts." with `Reload bill`.
- **Bill has a return**: "This bill has a sales return (<refs>), so its discount can no longer be changed. Correct it through the return."
- **Same drug on two lines at different effective prices**: refused with "… is on this bill more than once at different prices, so a return could not tell which price to refund…".
- **Refund amount is fixed**: the dialog always refunds the full refund-due figure; a part refund is not possible. Server guards: "Nothing is due back on this bill." / "Only ₹… is due back on this bill. Reload it to see the latest amounts."
- **Draft / cancelled / counter-sale / return rows**: the `%` icon is disabled with "Open the draft to change its discount", "Cancelled bills cannot change", "Counter sales are corrected in Inventory", "Returns have no discount to edit". Appending `&edit=discount` to a cancelled bill's URL does not open the dialog.

---

## STORY-079: Take back an unopened medicine and refund the patient (sales return)

**Type**: medium
**Topic**: Pharmacy sales, bills & returns
**Persona**: Farheen Begum, pharmacist; patient Rohit Deshmukh returns one sealed tube bought two days ago
**Goal**: Record the return against the original bill, put the tube back in stock, refund ₹412 in cash
**Preconditions**: Finished bill `PHI-2026-391` containing "Momate Cream 15 g" ×2. User has write permission for customer returns in Inventory.
**Ideal path**: 6 — open the original bill, choose "return items", tick the line and quantity, choose restock, choose refund method, post.
**Alternate paths**:
- Sales › tab `Returns` › `New return` (this story) — leaves Sales and opens Inventory with a `return=` link back.
- Sidebar `Inventory` › area `Sales` › `Customer returns` › `New document` — same editor, back button returns to the Inventory list instead.
- Returns register empty state button `New return`.
- A posted return can be undone only by an approver via `Correct by reversal` in the document.
- Price-only correction (no goods back): `Edit discount` + `Record refund` (STORY-078).

### Steps
1. Sidebar `Sales` → click tab `Returns` → the "Sales returns" register; the header button now reads `New return`.
2. Click `New return` → the app navigates to `/dashboard/inventory?area=sales&view=SALES_RETURN&new=…&return=…`; the Inventory workspace shows status "Unsaved draft", heading "Customer returns", help "Select the original sale and choose restock, quarantine or loss for each returned batch.", buttons `Save draft` and `Post return`. Farheen notices she is now in a differently styled screen with no bill to start from.
3. In `Search original sale` ("Sale reference, product, barcode or SKU") type `PHI-2026-391` (or `momate`) → the `Add from original sale` dropdown refreshes *(server-side match on the bill number is unverified)*.
4. Open `Add from original sale` ("Select sold batch · remaining return quantity") and pick the option for bill 391 — options read "<sale reference> · Momate Cream 15 g · <batch> · 2 <unit>" (the reference is the stock movement's, written by the server as `INV-<bill number>`; exact display unverified) → a line is added with Quantity 1 and the original rate, discount and GST locked; Disposition "Restock".
5. Leave `Quantity` at 1; leave `Disposition` = `Restock` (other choices: `Quarantine`, `Record as loss`).
6. Type `Customer name (optional)` "Rohit Deshmukh" and `Phone (optional)` "9123456780" — the form does not copy these from the chosen sale.
7. Change `Refund method` from its default `CREDIT` to `CASH` (options are the raw codes CASH, UPI, CARD, CREDIT).
8. Type `Reason / notes` (placeholder "Required before posting"): "Duplicate purchase, tube sealed".
9. Click `Post return` → the draft is saved and posted in one go; green notice "Saved status confirmed. Review the outcome and recorded effects below."; status "Posted"; sections "Refund / credit recorded" ("₹412.00 · CASH · …" and "This records the refund in the ledger. Settle cash or the chosen payment method separately."), "Confirmed stock effects" and "Document history" appear.
10. Hand ₹412 to the patient.
11. Click the back arrow at top-left (tooltip "Back to customer returns") → because of the `return=` parameter it lands back on Sales › `Returns`, where the new row shows the return reference, "Against bill PHI-2026-391", Amount ₹412.00 and a `Cash` badge under "Refund".

### Variations
- **Damaged or opened item**: set `Disposition` to `Quarantine` (stock held; later `Release held stock` on the posted document) or `Record as loss`.
- **Several items**: repeat step 4 per sold batch; `Load more original sales` pages the dropdown.
- **Refund as store credit**: leave `CREDIT` → the Returns register shows the badge "Store credit".
- **Send confirmation**: on the Returns row click `Send on WhatsApp` → "Dear Rohit Deshmukh, <clinic> has processed a refund of ₹412.00 against bill PHI-2026-391 on …".
- **Open an existing return**: click a Returns row → the same Inventory editor in read-only state, with `Export lines` and `Print QR label` icons.

### Edge Cases
- **Already fully returned batch**: options with no remaining return quantity are filtered out of the dropdown, so the sale simply does not appear.
- **Missing reason / other server refusals**: red alert with the server message and "Your attempted edits remain in the form and have not been saved. Correct the reported issue before trying again."
- **No write permission**: fields are disabled and the action buttons are absent; a "Recovery handoff" text box is shown instead.
- **Uncertain outcome (network drop while posting)**: status "Outcome not confirmed" with a `Check saved status` button; mutation buttons are hidden until settled.
- **Discount edits blocked afterwards**: the original bill's `Edit discount` is refused once a return exists (see STORY-078).
- **Naming**: the tab says "Returns", the button "New return", the register table "Sales returns", the Inventory screen "Customer returns", the print "Sales Return".
- **Print icon on a Returns row** prints a "Sales Return <reference>" receipt; draft returns show "Finish this draft return first".

---

## STORY-080: Collect the balance on a bill that shows "Due"

**Type**: medium
**Topic**: Pharmacy sales, bills & returns
**Persona**: Sandeep Goud, pharmacist, following up the bell notification "1 overdue invoice"
**Goal**: Take ₹180 still owed on a bill and mark it settled
**Preconditions**: Bill `PHI-2026-377` (dated last week, paid by UPI) shows "Due ₹180.00" because a discount was later reduced via `Edit discount`.
**Ideal path**: 3 — open the due bill, click "record payment", choose mode and confirm.
**Alternate paths**:
- "Pharmacy Invoices" list at `/dashboard/pharmacy/invoices` (Pharmacy Desk › `Invoices`) → green tick `Mark as Paid` — this story; the only UI that calls the payment endpoint.
- Same list at Inventory › Sales › `Patient invoice history` → `Mark as Paid`.
- *Not* possible from the Sales register, the finished bill view, or the Counter cockpit's `Collect payment` (that button only opens a bill).

### Steps
1. Click the bell in the header → click the overdue item (every overdue / pending-money notification links to the same address; whether this particular bill is counted by the alert is unverified) → `/dashboard/pharmacy/sales?pay=CREDIT`: the Sales register filtered to `Payment` = "Due (unpaid)"; the row for `PHI-2026-377` has a red "Due ₹180.00" badge.
2. Click the row → finished bill view with badge "Due ₹180.00" and summary row "Due ₹180.00". The only buttons are `Print` and `Edit discount`. Sandeep looks for a way to record the payment and finds none.
3. Sidebar `Pharmacy Desk` → click `Invoices` in the dark header → page "Pharmacy Invoices" (the title appears twice: page heading and the list's own header).
4. The list defaults to `Date Range` = "Today", so last week's bill is missing → type `377` in `Search` ("Invoice number, patient...") and change `Date Range` to `All dates`.
5. On the card for `PHI-2026-377` (status chips, "Payment: UPI") click the green tick icon (tooltip "Mark as Paid").
6. A native browser confirm appears: "Mark invoice PHI-2026-377 as paid? Remaining payment: ₹180.00" → click OK. (The payment is recorded in the bill's original method — UPI — there is no way to say it was cash.)
7. A native alert "Invoice marked as paid successfully" → click OK; the list reloads and the tick icon disappears from that card.
8. Go back to `Sales` → the row no longer shows the Due badge.

### Variations
- **OWNER** has no `Pharmacy Desk` sidebar entry: reach the same list through `Inventory` › `Sales` › `Patient invoice history`.
- **Interrupted payment**: if the request outcome is unknown, alert "Payment could not be confirmed. Retry to reconcile the same payment." and the icon's tooltip becomes `Retry Payment`, reusing the same amount and request key.

### Edge Cases
- **Already settled**: alert "This invoice has no remaining balance."
- **Clear vs. Today**: `Clear` sets the date range to "All dates", not back to the default "Today"; a new sale elsewhere fires an event that forces it back to "Today".
- **Tiles mislead**: "Pending Amount" sums only the invoices on the current page whose payment status is PENDING.
- **Naming**: the same state is "Due" (finished view), "Due (unpaid)" (register filter), "Credit" (mode), "Pending"/"Partially Paid" (invoice list), "overdue invoice" (bell).

---

## STORY-081: Look through the "Pharmacy Invoices" list and open one

**Type**: short
**Topic**: Pharmacy sales, bills & returns
**Persona**: Anitha Krishnan, clinic admin, checking what was billed to a patient this month
**Goal**: See a patient's pharmacy invoices with their items and download one as PDF
**Preconditions**: Signed in as ADMIN; patient "Imran Khan" has 3 pharmacy bills this month.
**Ideal path**: 3 — search patient, see bills, download.
**Alternate paths**:
- Sales register: `Search by` `Patient` → row → finished bill view (no PDF button there; `Print` only).
- Inventory › Sales › `Patient invoice history` — identical component, embedded without the `Back` button.
- Pharmacy Report › Sales Bills.
- Deep link `/dashboard/pharmacy/invoices?search=<text>` pre-fills the search and sets the date range to "All dates".

### Steps
1. Sidebar `Pharmacy Desk` → click `Invoices` → "Pharmacy Invoices" with four tiles (Total Invoices, Total Amount, Completed, Pending Amount) and filters Search, Status, Payment Status, Payment Method, Date Range (default "Today"), `Clear`.
2. Type `Imran` in `Search` and set `Date Range` to `This Month` → cards list each invoice: number, two status chips, Patient, Phone, Doctor, Payment, Items count, Date, Subtotal, Total and the first two item lines ("+1 more items...").
3. Click the eye icon (`View Invoice`) on a card → a new browser tab opens with the printable invoice and a `Print` button.
4. Back on the list, click the download icon (`Download Invoice`) → a PDF named after the invoice number is saved without a pop-up.
5. Click `Back` (top-left) → returns to `/dashboard/pharmacy` (the Desk), not to wherever she came from.

### Variations
- **Draft card**: shows "Draft" as its number, no eye/download icons, a pencil `Continue in Sales` that opens `/dashboard/pharmacy/sales/bill?draft=<id>`.
- **Paging**: 20 per page with `Previous` / `Next` and "Page x of y".

### Edge Cases
- **Pop-up blocked**: native alert "Please allow pop-ups to view the invoice".
- **Delete on every card**: the red bin `Delete Invoice` is shown even on finished bills; after a native confirm "Are you sure you want to delete this invoice?" the server refuses a finished bill ("This bill was already finished. It can no longer be discarded.") in a native alert. On a draft it deletes and alerts "Invoice deleted successfully".
- **Load failure**: logged only; the list silently shows "No invoices found — Try a different search or adjust the filters."
- **Counter sales and returns are absent** from this list (it reads pharmacy invoices only), although they appear in the Sales register.
- **Icon-only actions**: labels exist only as hover titles.

---

## STORY-082: Sell to an unnamed walk-in choosing the exact batch (Counter sale)

**Type**: medium
**Topic**: Pharmacy sales, bills & returns
**Persona**: Farheen Begum, pharmacist; a passer-by wants one sunscreen and does not want to register
**Goal**: Sell from a specific batch without creating a patient, and have the sale show in Sales
**Preconditions**: User has write permission for counter sales in Inventory. "Suncros Soft SPF 50 Gel 50 g" has two batches (expiring 03/2027 and 11/2027).
**Ideal path**: 4 — start a quick sale, scan/search the item (batch pre-chosen by earliest expiry), choose payment mode, post-and-print.
**Alternate paths**:
- Sales bill builder (`New sale`) — requires a patient; batch chosen by the server, not the user (STORY-073).
- Inventory › Sales › `Quotations` › `New quotation` › `Create sale draft` → converts into a counter-sale draft.
- Reopen an existing counter sale from the Sales register row (blue "Counter sale" badge) → same editor with a link back to Sales.

### Steps
1. Sidebar `Inventory` → top nav `Sales` → task `Counter sales` → list "Counter sales" ("Choose the actual batch and stock unit. Drafts do not reserve; posting reduces available stock.").
2. Click `New document` → editor with status "Unsaved draft", buttons `Save draft` and `Post sale`.
3. In `Add a batch` ("Search product, batch, barcode or SKU") type `suncros` → matches are listed earliest-expiry first, each as "<name> · <batch> · expires <date>" and "<n> <unit> available · <cost price>".
4. Click the first batch → a line is added: Quantity 1, Free 0, "Rate excl. GST" (selling price with GST backed out), Discount %, Scheme ₹, GST %, Total; under the name: batch, unit, expiry, MRP, location and "n <unit> available at selection".
5. Leave `Quantity` 1. (If she had picked the later-expiring batch she would type why in "Batch-selection reason (if bypassing earlier expiry)".)
6. Leave `Customer name (optional)` blank (placeholder "Walk-in customer") and `Phone (optional)` blank.
7. Set `Payment method` to `UPI` (options CASH, UPI, CARD, CREDIT); leave `Order type` = Pickup; `Doctor (optional)` blank.
8. Click `Post sale` → notice "Saved status confirmed. Review the outcome and recorded effects below."; status "Posted"; "Confirmed stock effects" lists the unit removed.
9. Sidebar `Sales` → the sale is in the register with its document reference as Bill No, a blue "Counter sale" badge, Patient "—", and a `UPI` badge.
10. Click the printer icon on that row → "Pharmacy Receipt <reference>" prints (with Batch column).

### Variations
- **Save first, post later**: `Save draft` → appears in Sales as a Draft row; opening it returns to the Inventory editor.
- **Credit sale**: `Payment method` = `CREDIT` → the Sales row shows a red "Credit" badge and is caught by the `Due (unpaid)` filter.
- **Filter only these**: Sales › `More filters` › `Source` = `Counter sales`.

### Edge Cases
- **No matching batch**: "No matching batch. Add the product/batch in Stock, then return here."
- **Discount change afterwards**: the Sales row's `%` icon is disabled — "Counter sales are corrected in Inventory" (i.e. `Correct by reversal`, approvers only).
- **No WhatsApp**: with no phone, the WhatsApp icon shows "No mobile number".
- **No shortcut from Sales**: on the `Sales` tab `New sale` always opens the patient bill builder; there is no button for a counter sale there.
- **Two selling tools, two vocabularies**: the bill builder says "Unit Price" and "Tax %"; this editor says "Rate excl. GST", "GST %", "Scheme ₹" and "Free". Payment options differ too (builder: Cash / Card / UPI / Net Banking; here: CASH / UPI / CARD / CREDIT).

---

## STORY-083: Recover when the connection drops while confirming a bill

**Type**: short
**Topic**: Pharmacy sales, bills & returns
**Persona**: Sandeep Goud, pharmacist, clinic Wi-Fi flickers at the moment he confirms
**Goal**: Find out whether the sale went through and avoid billing the patient twice
**Preconditions**: A complete bill for "Pooja Nair, 97010 88342" in the preview; the request to `/pharmacy/invoices/checkout` gets no response.
**Ideal path**: 2 — one "retry / check" action, then print.
**Alternate paths**:
- Check the Sales register (or "Pharmacy Invoices" list) for the bill manually — the recovery-failure toast itself says "Check the invoice list before creating another sale."
- Reload the page: the pending attempt is restored from `sessionStorage` on any bill page.

### Steps
1. Click `Confirm & Print` → after the failure a red toast "Error Confirming Invoice — <network message>" appears; the preview stays open.
2. Click `Close` → above the bill an amber notice reads "A checkout for Pooja Nair needs confirmation. Retry it before starting another sale." with one button `Retry pending checkout`; `Save draft` is hidden.
3. Click `Retry pending checkout` → the exact same payload and request key are resent; the server either completes the sale or returns the bill it already created (no second bill); toast "Success — Invoice PHI-… confirmed successfully" and the preview reopens as Confirmed.
4. Click `Print` → print; `Close` → notice now says "This checkout is confirmed. Reopen it for another copy." → `Back to Sales`.

### Variations
- **He reloads the tab instead**: the same amber notice is shown on the fresh page, even on a blank new sale, until retried.
- **He edits the bill and tries to confirm again**: refused with "Resolve the pending checkout before changing its details or starting another sale. Use Retry pending checkout."

### Edge Cases
- **Server rejects outright (400/404)**: the pending attempt is dropped and only the error toast shows — fix the bill and confirm again.
- **Draft was changed/finished elsewhere**: red banner with the server message plus "Your changes on this screen were not saved." and `Reload draft`; the preview closes.
- **Stored attempt unreadable**: toast "Checkout recovery failed — Stored checkout could not be read. Check the invoice list before creating another sale."
- **Different browser / device**: the attempt lives in this tab's `sessionStorage` only; from another machine the only check is the register.

---

## Redundancy notes

**Duplicate paths to the same goal**

- *Start a pharmacy sale* — Sales `New sale`; Pharmacy Desk quick action `New sale`; cockpit `Walk-in bill` / `Start billing` / `Open bill` / `Collect payment` (all one handler); queue `Load` / `Bill`; prescription builder `Go to Pharmacy` and "Go to Pharmacy?" dialog; patient tracker `Bill`; legacy `/dashboard/billing` and `/dashboard/pharmacy?section=billing|invoices|payments`; plus a second selling tool, Inventory › Sales › `Counter sales`. (`app/dashboard/pharmacy/sales/page.tsx`, `app/dashboard/pharmacy/pharmacy-workspace.tsx`, `components/pharmacy/PharmacyCounterCockpit.tsx`, `components/pharmacy/PrescriptionDispensingQueue.tsx`, `components/pharmacy/sales/sales-bill-model.ts`, `components/inventory/WorkflowDocumentEditor.tsx`)
- *Browse the same bills* — four surfaces: Sales register (`components/pharmacy/sales/SalesRegister.tsx`); "Pharmacy Invoices" page (`app/dashboard/pharmacy/invoices/page.tsx`); Inventory › Sales › "Patient invoice history" (`components/inventory/InventoryWorkspace.tsx` mounts the same `PharmacyInvoiceList`); Pharmacy Report › Sales Register / Sales Bills. They disagree on defaults (financial year vs "Today" vs last month), on content (register includes counter sales and returns; invoice list does not) and on actions.
- *Actions split across surfaces* — discount edit and refund exist only in `FinishedBillView.tsx`; collecting a due exists only in `PharmacyInvoiceList.tsx` (`Mark as Paid`); delete exists in the builder (`Discard draft`) and in the invoice list (`Delete Invoice`, offered even on finished bills); PDF download exists in the confirm preview and the invoice list but not in the finished bill view or register; export exists only in Pharmacy Report.
- *Resume a draft* — Sales register row, invoice-list `Continue in Sales`, direct `?draft=` URL.
- *Sales return* — Sales › Returns › `New return` and Inventory › Sales › Customer returns › `New document` open the same `WorkflowDocumentEditor`; the user is moved out of Sales into the Inventory workspace and back via `return=`.
- *Two print renderers for one bill* — the builder's inline `renderPrintHtml` (A5, copy type, HSN, batch, GST split; `components/pharmacy/PharmacyInvoiceBuilderFixed.tsx`) vs `renderPharmacyInvoiceHtml` (`lib/pharmacy-invoice-print.ts`) used by register print, finished view, and invoice list view/download.
- *Prescription queue shown three times* — on every new Sales bill (`sales/bill/page.tsx`), on the Pharmacy Counter page, and inside the cockpit as "Rx queue".

**Duplicate information**

- Patient name and phone appear twice on the bill form ("Patient *" search field and "Billing Name *" / "Phone *").
- Day totals: register footer, invoice-list tiles (current page only), Desk metrics, Daily Collection, Sales Register report.
- "Pharmacy Invoices" title is rendered twice on `/dashboard/pharmacy/invoices` (page `<h2>` and the list's `PageHeader`).
- The confirm preview repeats invoice number, patient and total in the header badges and again in the side panel.
- Bill status is conveyed by three different vocabularies: register state (Final / Draft / Cancelled), invoice-list chips (Draft / Pending / Confirmed / Dispensed / Completed / Cancelled + payment status), finished view badges (Paid / Due / Refund due / Cancelled).

**Naming drift**

- **Bill / Invoice / Sale / Receipt**: sidebar "Sales", `New sale`, card "New bill", "Add Items to Invoice", "Invoice Items", "Invoice Summary", `Confirm Invoice`, "Pharmacy Invoice Preview", register "Bill No" / "Bill Amount", finished view "Bill PHI-…", list "Pharmacy Invoices", Inventory "Patient invoice history", counter-sale print "Pharmacy Receipt".
- **Sales Register** names both the register on the Sales page (`aria-label="Sales registers"`) and a GST report in Pharmacy Report.
- **Returns**: tab "Returns", `New return`, table "Sales returns", Inventory "Customer returns", print "Sales Return".
- **Unpaid**: "Due", "Due (unpaid)", "Credit", "Store credit" (returns), "Pending", "Partially Paid", "overdue invoice", "Still to collect".
- **Discount**: "Discount %" (line), "Item discounts" / "Item discount", "Bill discount", "Disc%" (print), "Scheme ₹" (counter sale).
- **Tax**: "Tax %", "GST pending", "GST rate needs review", "GST %", "Rate excl. GST".
- **Drug / Medicine / Item / Product / Batch**: "Individual Drugs", "Search Drugs", "Add at least one medicine", "Invoice Items", "Choose a stocked product", "Add a batch".
- **Payment modes** differ by surface: builder (Cash, Card, UPI, Net Banking); refund dialog (Cash, UPI, Card, Net banking, Wallet); register filter (adds Insurance, Due (unpaid), Other); counter sale / return (raw CASH, UPI, CARD, CREDIT).
- **Draft discard vs delete**: `Discard draft` (builder) vs `Delete Invoice` (list) for the same server call.

**Friction worth walking**

- No patient → no bill: the builder cannot create a patient and PHARMACIST has no Patients menu.
- Hand-added items always start at Tax % 18 and show no stock status until confirm fails.
- No batch or selling-unit control in the bill builder (only in Counter sales).
- "Due" bills dead-end in Sales; payment is hidden behind an icon in a different page, with native `confirm()` / `alert()` dialogs and no payment-mode choice.
- No autosave or leave-page warning for bills; drafts do not reserve stock.
- After confirming, the builder stays populated and editable-looking beneath a small amber notice.
- Sales return starts from an empty Inventory document rather than from the bill being returned; default refund method is `CREDIT`.
