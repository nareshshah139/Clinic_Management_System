# Pharmacy counter billing: prescription queue, dispense, Sales bill, print, discount, refund, returns, drafts

Topic 3 of the ClinicMS ux-paths run. All paths in `FE/` (frontend/src) and `BE/` (backend/src). Read from source: `FE/app/dashboard/pharmacy/pharmacy-workspace.tsx`, `FE/app/dashboard/pharmacy/sales/{page,bill/page}.tsx`, `FE/components/pharmacy/{PharmacyCounterCockpit,PrescriptionDispensingQueue,PharmacyInvoiceBuilderFixed,PharmacyInvoiceList}.tsx`, `FE/components/pharmacy/sales/*`, `FE/components/inventory/WorkflowDocumentEditor.tsx` (customer returns), `BE/modules/pharmacy/pharmacy-invoice.{controller,service}.ts`, `pharmacy-prescription-queue.service.ts`.

Ground rules that apply to every story below (observed in source):
- Step counting: one numbered step per click, per typed field, per selection. Focusing a text box by clicking is counted together with typing into it. Browser print-dialog clicks are counted because the user has to do them.
- Only ADMIN and PHARMACIST can create, confirm, discount-edit, refund or delete pharmacy bills on the server (`@Roles` on `pharmacy-invoice.controller.ts`; `RolesGuard` also lets OWNER and DOCTOR through). RECEPTION sees "Pharmacy Desk" and "Pharmacy Counter" but not "Sales", and `sells` is false for them. All stories use a PHARMACIST.
- The Sales bill page (`/dashboard/pharmacy/sales/bill`) is the only surface that actually confirms a prescription bill. Counter "Bill", "Open bill", "Collect payment", "Start billing", "Walk-in bill", Desk "New sale", Sales "New sale", and queue "Load" all end up there (`billHref`).
- Checkout takes the full payment in one go, in the single "Payment Method" chosen (Cash, Card, UPI, Net Banking), inside the same transaction as the stock deduction (`BE/modules/pharmacy/pharmacy-invoice.service.ts`, `collectCheckoutPayment`). There is no "amount received", "change to return", split payment or credit option on the bill page.
- Clinic: a dermatology clinic in Hyderabad. Staff: pharmacist Meenakshi Iyer, doctor Dr. Anil Reddy, owner Dr. Sunita Rao.

---

## PHARMACY-COUNTER-01: Bill a waiting prescription from the Counter queue and print it

**Type**: medium
**Topic**: Pharmacy counter billing
**Persona**: Meenakshi Iyer, pharmacist, at the counter with a patient standing in front of her, about 40 times a day.
**Goal**: Sell the medicines Dr. Anil Reddy prescribed to Lakshmi Narayanan, take UPI payment, and hand over a printed GST bill.
**Preconditions**: Logged in as PHARMACIST. Lakshmi's visit is completed with a prescription (Tretinoin 0.025% cream, Doxycycline 100 mg x 14, Sunscreen SPF 50 gel). All three lines are matched to stocked inventory. The prescription is "Pending".
**Ideal path**: 4. Open the Counter, click the prescription, pick the payment mode, press one "Confirm and print". Patient, doctor, phone, medicines, quantities, prices and GST are all already known to the app.
**Alternate paths**: (a) Pharmacy Counter cockpit: click the patient in the "Queue" panel, then header "Bill", Active Dispense "Open bill" or Pick + Pay "Collect payment" (three buttons, same action). (b) Sales > "New sale", then "Load" on the queue at the top of the bill page (same queue component, label "Load" instead of "Bill"). (c) Visit prescription builder "Go to Pharmacy" > dialog "Go to Pharmacy?" > "Yes, go to Pharmacy". (d) Patient progress tracker "Bill" (visit-only prefill). (e) Legacy `?section=billing` redirects to the same page.

### Steps
1. Click sidebar "Pharmacy Counter" → `/dashboard/pharmacy?section=counter`; page title "Pharmacy Counter"; cockpit (panels "Queue", "Active Dispense", "Pick + Pay") loads and fires a stock check for every queued prescription.
2. Scroll down past the cockpit (it is about one screen tall) to the section "Prescription Queue" (card "Prescription dispensing queue", status filter defaults to "Pending") → Lakshmi's row shows patient name and code, doctor, medicines with coverage "0/1", status "Pending", per-line stock badges ("In stock (24 tube)"), and a "Bill" button.
3. Click the row's "Bill" button → navigates to `/dashboard/pharmacy/sales/bill?patientId=…&prescriptionId=…&doctorId=…`; the page header is "Sales" with a "Back to Sales" button; the queue is shown again above region "Prescription bill"; the page scrolls itself to the bill. The builder card "New bill" auto-fills: Patient * (app already knows this), Doctor (app already knows this), Billing Name * (app already knows this), Phone * (app already knows this), three lines under "Invoice Items" with Quantity, Unit Price, Discount % (default: 0), Tax % (taken from the drug), plus a blue "Linked Prescription" box.
4. Read the Invoice Items for amber notes (no input). If a line shows an amber quantity warning, click its "Confirm" button (optional; only appears when the prescribed quantity is ambiguous, e.g. "1 tube" on a pack-based drug).
5. Click the "Payment Method" select (default: Cash) → options Cash, Card, UPI, Net Banking.
6. Choose "UPI" (optional; skip for cash) → select shows UPI.
7. Click "Print Preview" (button also shows "N items • ₹total total") → full-screen dialog "Pharmacy Invoice Preview": Status "Draft preview", Copy Type "Original" (default: Original), zoom 90%. Nothing is saved yet.
8. Click "Confirm & Print" → POST `/pharmacy/invoices/checkout`; stock is deducted, UPI payment for the full total is recorded, a bill number is issued; preview re-renders with the number and Status "Confirmed"; the button on the left changes to "Invoice Confirmed". Guard: this is the only confirmation; there is no "are you sure" dialog before stock moves.
9. In the browser print dialog, click Print → paper bill.
10. Click "Close" in the preview → bill page now shows an amber banner "This checkout is confirmed. Reopen it for another copy." with buttons "Reopen confirmed invoice", "Start a new invoice", "Back to Sales". The builder underneath still shows the old form.
11. Click "Back to Sales" (banner) → `/dashboard/pharmacy/sales` register; the new bill is the top row, Payment badge "UPI".

### Variations
- Pay by cash: skip steps 5 and 6 (9 steps).
- Patient wants a duplicate copy for insurance: in step 7 change "Copy Type" to "Duplicate" (2 extra steps: open select, choose).
- Use the explicit two-click path: "Confirm Invoice" (left panel) then "Print" instead of "Confirm & Print" (one extra step; same result).
- Same information on several surfaces: the prescription's medicines, stock status and patient identity appear in (1) cockpit "Queue" panel, (2) cockpit "Active Dispense" table, (3) the "Prescription Queue" table, (4) the second copy of the queue on the bill page, (5) the bill's Invoice Items, (6) the "Linked Prescription" box. Stock status in particular is shown on all of these.

### Edge Cases
- Prescription expired or not eligible (`dispensingEligible === false`): the "Bill" button is disabled; the cockpit shows "This prescription is not active or has expired."
- A line is unmatched to inventory ("No match", "Not linked"): the "Linked Prescription" box shows a "link inventory before billing" prompt; "Print Preview" then fails with a toast "Medicine needs review". Fix with "Substitute" on the line or the inventory-link control.
- GST missing on a line (Tax % blank, "Enter GST"): toast "GST rate needs review" blocks Print Preview.
- Network drops during step 8: the banner "A checkout for Lakshmi Narayanan needs confirmation. Retry it before starting another sale." offers "Retry pending checkout"; the same request key prevents a double sale.
- Pharmacist-side review actions taken in the Counter cockpit (Accept, Sub, Edit, NA, Ready) are NOT read by this bill; the bill is rebuilt from the prescription plus the stock check (see story 08).

---

## PHARMACY-COUNTER-02: Walk-in sale of one over-the-counter item

**Type**: medium
**Topic**: Pharmacy counter billing
**Persona**: Meenakshi Iyer, pharmacist. A registered patient, Farhan Sheikh, walks in for a sunscreen without a prescription.
**Goal**: Sell 2 tubes of Sunscreen SPF 50 gel for cash and print the bill.
**Preconditions**: Logged in as PHARMACIST. Farhan Sheikh exists in Patients (phone 98480 12345). Drug "Sunscreen SPF 50 Gel 50 g" is in the drug database.
**Ideal path**: 4. Type the item, add it with quantity 2, pick Cash, press "Confirm and print". A walk-in should not need a registered patient or a name and phone.
**Alternate paths**: (a) Inventory > Sales > "Counter sales" (workflow-document editor with "Customer name (optional)" placeholder "Walk-in customer", "Phone (optional)", "Payment method" CASH/UPI/CARD/CREDIT, batch picking, no patient required; appears in the Sales register as source "Counter sales"). (b) Pharmacy Counter empty-state button "Walk-in bill" (only when the queue is empty). (c) Pharmacy Counter "Start billing" (no active prescription), Desk "New sale". All of (b) and (c) land on the same bill page with a required patient.

### Steps
1. Click sidebar "Sales" → `/dashboard/pharmacy/sales`; title "Sales", tabs "Sales" and "Returns", filters, table of bills for the financial year.
2. Click "New sale" (top right) → `/dashboard/pharmacy/sales/bill`; the prescription queue (filter "Pending") loads at the top with a stock check per prescription, below it the builder card "New bill" with empty fields. Sales bill header now shows "Back to Sales".
3. Click the "Patient *" field ("Search patients by name or phone...") and type "Farhan" (required field) → dropdown of up to 20 patients appears on focus; filters after 2 characters via `/patients?search=`.
4. Click "Farhan Sheikh" in the dropdown → Billing Name * and Phone * are filled from the patient (app already knows this; editable).
5. Click "Search Drugs" ("Search by drug name, manufacturer, or ingredient...") and type "Sunscreen" → after about 300 ms a result list of drugs with price, pack size and a green "best match" highlight on the first.
6. Click "Add" on "Sunscreen SPF 50 Gel 50 g" → a card in "Invoice Items" with Quantity 1 (default: 1), Unit Price from the drug, Discount % 0 (default: 0), Tax % 18 (default: 18 for every manually added drug, regardless of the drug's own GST), no stock badge.
7. Select the "Quantity" field of the new card and type 2 (optional; default 1).
8. Leave "Payment Method" on Cash (default: Cash). Leave Doctor and Notes empty (optional). No step.
9. Click "Print Preview" → dialog "Pharmacy Invoice Preview", Status "Draft preview".
10. Click "Confirm & Print" → bill confirmed, stock deducted from the earliest-expiry batch, cash recorded; print dialog opens.
11. Click Print in the browser print dialog.
12. Click "Close" → confirmed banner appears.
13. Click "Back to Sales" → register.

### Variations
- Customer is not a registered patient: there is no "Add patient" in the bill. The pharmacist must leave the sale, go to Patients > "New Patient" (about 6 fields), and come back (+10 steps), or use the Inventory "Counter sales" route.
- Several OTC items: repeat steps 5 and 6 per item (2 steps each). Clicking "Add" on the same drug again just increments Quantity.
- Add a "Treatment Packages" tab item: click tab "Treatment Packages" and click the package card (1 click adds it with its package price and 18% tax).

### Edge Cases
- Dermatology drug with 12% or 5% GST: the manual add still pre-fills Tax % 18; the pharmacist has to retype Tax % per line or the GST on the printed bill is wrong. Prescription-loaded lines use the drug's real rate (story 01).
- Quantity above stock: the manual line has no "Insufficient stock" badge (`availableStock` is only set on prescription and substituted lines); the server rejects the checkout and the toast "Error Confirming Invoice" shows the reason.
- No patient chosen: "Print Preview" button stays disabled.
- "Patient *" required but the customer is a stranger: the pharmacist often picks any placeholder patient, making Billing Name wrong; only Billing Name is editable afterwards.

---

## PHARMACY-COUNTER-03: Reprint a bill for a patient who lost it

**Type**: short
**Topic**: Pharmacy counter billing
**Persona**: Meenakshi Iyer, pharmacist. Patient Ritu Agarwal returns and says "I lost yesterday's bill", bill number is on her WhatsApp message (BILL-2026-004512).
**Goal**: Print another copy of an old confirmed bill.
**Preconditions**: Bill exists, state Final. Sales register period is the default (current financial year).
**Ideal path**: 3. Type the bill number or name, click Print, browser Print.
**Alternate paths**: (a) Sales register row printer icon "Print <bill>" (this story). (b) Click the row to open the bill and press "Print" in the "Bill …" card (+1 step, same output through the shared `printHtml`). (c) Pharmacy Desk > "Invoices" > "View Invoice" (opens a popup window) or "Download Invoice" (PDF). (d) Inventory > Sales > "Patient invoice history" (same component as (c)). (e) The "Pharmacy Invoice Preview" "Print" button, only during the sale itself. (f) Row "Send on WhatsApp" link `wa.me` with the bill amount (no PDF attached, text only).

### Steps
1. Click sidebar "Sales" → register opens.
2. Click the search box (field select "Search by" is "Bill No" by default) and type "004512" (optional narrowing; 300 ms debounce) → table filters to one row.
3. Click the printer icon in the row's Actions column (aria-label "Print BILL-2026-004512") → fetches the invoice and opens the browser print dialog.
4. Click Print in the browser dialog → paper copy. (No indication on the bill that it is a reprint: the call uses `renderPharmacyInvoiceHtml`, not the "Duplicate" copy type.)

### Variations
- Patient does not know the number: change "Search by" to "Mobile" or "Patient" first (2 extra steps: open select, choose).
- Reprint a draft: the Print icon is disabled with tooltip "Finish this draft bill first".

### Edge Cases
- Cancelled bill: print icon disabled, tooltip "This bill is cancelled".
- Print fails: toast "Could not print" / "Check your connection and try again."
- The "Copy Type" Original/Duplicate control exists only in the sale-time preview; reprints from the register are not marked "Duplicate".

---

## PHARMACY-COUNTER-04: Discard an abandoned draft bill

**Type**: short
**Topic**: Pharmacy counter billing
**Persona**: Meenakshi Iyer, pharmacist. A draft for Ritu Agarwal saved this morning is no longer needed (patient bought elsewhere).
**Goal**: Remove the draft so it stops cluttering the Sales list.
**Preconditions**: A draft exists (state Draft, "Draft" badge, no bill number issued).
**Ideal path**: 2. Click discard on the draft row, confirm once.
**Alternate paths**: (a) Open the draft from the register and use "Discard draft" (this story). (b) Pharmacy Desk > "Invoices" list: filter to draft, trash icon "Delete Invoice" (browser `confirm()` "Are you sure you want to delete this invoice?" and a browser `alert()` "Invoice deleted successfully"). (c) Inventory > Sales > "Patient invoice history" (same list).

### Steps
1. Click sidebar "Sales" → register; draft rows show badge "Draft" in the Bill No column and "… not final" if a number is reserved.
2. Click the "Draft" link in Ritu's row (the whole row is also clickable) → `/dashboard/pharmacy/sales/bill?draft=<id>`; builder badge "Draft", status "All changes saved to the draft".
3. Click "Discard draft" (right column, below "Save draft") → dialog "Discard this draft?" with text "Nothing was sold, so stock and payments are unchanged. This cannot be undone."; buttons "Keep draft" and "Discard draft". The dialog guards an irreversible delete.
4. Click "Discard draft" in the dialog → DELETE `/pharmacy/invoices/<id>?version=n`; toast "Draft discarded … No stock moved."; navigates back to the Sales register; the row is gone.

### Variations
- Click "Keep draft" in step 4: dialog closes, nothing changes.
- Someone else already finished or changed the draft: server returns 409; the red banner "This draft was changed after you opened it. Reload it before discarding. Your changes on this screen were not saved." with "Reload draft".

### Edge Cases
- Discard is only reachable from inside the open draft (the page has two buttons both called "Discard draft": one on the page, one in the confirm dialog).
- A finished bill cannot be discarded: "This bill was already finished. It can no longer be discarded."; cancelling a confirmed bill has no UI at all in Sales (only the Cancelled state exists).
- The "Pharmacy Invoices" list shows the Delete icon on every row, including finished bills; the server refuses (browser `alert()` with the message).

---

## PHARMACY-COUNTER-05: Save a half-finished sale as a draft and finish it later

**Type**: medium
**Topic**: Pharmacy counter billing
**Persona**: Meenakshi Iyer, pharmacist. Ritu Agarwal's husband picks up her Adapalene gel but has to step out to fetch money.
**Goal**: Park the bill without moving stock, then complete and print it when he returns.
**Preconditions**: Logged in as PHARMACIST. Ritu Agarwal is a registered patient.
**Ideal path**: 6. Add patient and item (2), save as draft (1), later open the draft (1), confirm and print (1), done. Ideally the drafts would be listed on the Counter without leaving it.
**Alternate paths**: (a) Draft rows are found in Sales register (this story), with the filter More filters > State > "Draft". (b) Pharmacy Desk > "Invoices" list: pencil icon "Continue in Sales". (c) The URL `?draft=<id>`. (d) The Counter and Desk do not show drafts at all.

### Steps
1. Click sidebar "Sales" → register.
2. Click "New sale" → empty bill page.
3. Click "Patient *" and type "Ritu" (required field) → patient dropdown.
4. Click "Ritu Agarwal" → Billing Name * and Phone * filled (app already knows this).
5. Click "Search Drugs" and type "Adapalene" → results list.
6. Click "Add" on "Adapalene 0.1% Gel 15 g" → card in "Invoice Items": Quantity 1 (default: 1), Tax % 18 (default: 18).
7. Click "Save draft" → POST `/pharmacy/invoices`; toast "Draft saved … is in Sales as a draft. Open it from the Draft row to finish it."; URL becomes `?draft=<id>`; heading becomes badge "Draft" and "Gets its bill number when finished"; status line "All changes saved to the draft". No stock moved, no payment taken. Requires patient, at least one line, and Tax % on every line; otherwise toast "Draft not saved".
8. Click "Back to Sales" → register; footer note "1 draft not included" under the totals; row shows "Draft" badge.
9. (Later, same or next day) Click the "Draft" link in the row → builder reopens with every field as saved.
10. Click "Print Preview" → dialog "Pharmacy Invoice Preview".
11. Click "Confirm & Print" → checkout carries `draftId` and `draftVersion`; bill number issued; stock deducted; Cash payment recorded (default: Cash).
12. Click Print in the browser dialog.
13. Click "Close".
14. Click "Back to Sales" (banner) → row now has a bill number and Final state.

### Variations
- Two people on the same draft: the second save gets "This draft was changed after you opened it" with "Reload draft".
- Edit the draft before finishing: change Quantity (type, 1 step) and press "Save draft" again (status line first says "Unsaved changes").
- Prescription-based bill: prescription header and lines are saved with the draft (the draft keeps `prescriptionId`).

### Edge Cases
- Draft with an unmatched medicine: "Draft not saved: Choose a stocked product for X or remove it before saving the draft."
- Closing the tab with unsaved changes: no beforeunload prompt in source; changes are lost.
- Drafts are listed only in Sales (and Pharmacy Invoices); neither the Counter nor the Desk shows them.

---

## PHARMACY-COUNTER-06: Give a goodwill discount after the bill is printed, then refund the difference

**Type**: medium
**Topic**: Pharmacy counter billing
**Persona**: Meenakshi Iyer, pharmacist, on instruction from Dr. Anil Reddy. Sunita Menon already paid ₹1,180 in cash yesterday; the doctor approves a 10% discount on the whole bill after the fact.
**Goal**: Change the discount on a finished bill with an audit reason, then record the cash handed back.
**Preconditions**: Final bill BILL-2026-004498, Cash, fully paid.
**Ideal path**: 5. Open the bill's discount editor from the register, type the percentage, type the reason, save, record the refund.
**Alternate paths**: (a) Register row "Edit discount on <bill>" (percent icon; this story). (b) Open the bill, then "Edit discount" button in the bill card. (c) Deep link `?bill=<id>&edit=discount`. (d) Discount can also be set before confirming: per line "Discount %" and "Bill discount" in the bill's Invoice Summary. Counter sales (Inventory) are corrected in Inventory ("Counter sales are corrected in Inventory"). There is no "cancel bill" or "credit note" for pharmacy bills in this UI.

### Steps
1. Click sidebar "Sales" → register.
2. Click the search box and type "004498" (default search field "Bill No") → one row.
3. Click the percent icon "Edit discount on BILL-2026-004498" → `/dashboard/pharmacy/sales/bill?bill=<id>&edit=discount`; the bill card "Bill BILL-2026-004498" with badge "Paid" appears and dialog "Edit discount on BILL-2026-004498" opens automatically. It lists each line with "Item discount %" input (current value), then "Bill discount".
4. In "Bill discount" type 10 (optional; kind toggle "%" is selected by default (default: %); the "₹" button switches to rupees) → live preview "Total now ₹1,180.00", "Total after change ₹1,062.00", "Refund due after saving ₹118.00".
5. Click "Reason *" and type "Goodwill discount approved by Dr. Anil Reddy" (required field; placeholder "For example: senior citizen discount agreed by the doctor") → "Save discount" becomes enabled (before this, hint "Enter a reason to save.").
6. Click "Save discount" → PATCH `/pharmacy/invoices/<id>/discount`; toast "Discount changed … is now ₹1,062.00."; dialog closes; header badge "Refund due ₹118.00" and "Revised <date>"; new card "Discount changes" lists who, when, ₹1,180.00 → ₹1,062.00 and the reason. No confirmation dialog guards this change; the dialog's preview is the check.
7. Click "Record refund ₹118.00" → dialog "Record refund of ₹118.00": "Paid back by" (default: Cash), "Reference (optional)".
8. Click "Record refund ₹118.00" in the dialog (accept Cash default; skip reference) → POST `/pharmacy/invoices/<id>/refunds`; toast "Refund recorded: ₹118.00 paid back by Cash"; badge becomes "Paid"; card "Payments" gains a "Refund · Cash · …" line.
9. Click "Print" in the bill card (optional) → reprint of the revised bill (browser dialog; 1 further step to click Print).
10. Click "Back to Sales" → register row shows badges "Revised" and "Refunded ₹118.00".

### Variations
- Refund by UPI: in step 7 open "Paid back by" and choose "UPI", then type the UPI reference (3 extra steps).
- Per-item discount instead: in step 4 type in the "Discount % for <drug>" input of one line (1 step per line).
- Wrong first try: "Save discount" refuses unchanged values ("Change a discount to save").

### Edge Cases
- Another user edited the bill meanwhile: server 409 "changed after you opened it", the dialog shows a "Reload bill" button.
- Discount edit never touches items, quantities, batches or stock (dialog description: "Only discounts change.").
- A discount above 100% or a rupee discount above the pre-tax total: inline red message under "Bill discount".
- Refund amount is fixed to the computed difference; it cannot be edited down (partial refunds impossible).
- Same fact on several surfaces: the due or refund state appears in the bill card badge, the Payments card, the register Payment cell, and the Pharmacy Report "Sales Register".

---

## PHARMACY-COUNTER-07: Take back an unopened pack and refund the patient

**Type**: medium
**Topic**: Pharmacy counter billing
**Persona**: Meenakshi Iyer, pharmacist. Priya Nair returns an unopened Tretinoin 0.025% cream; Dr. Anil Reddy changed the prescription.
**Goal**: Post a customer return against the original sale, put the tube back on the shelf, refund in cash.
**Preconditions**: Original sale from last week exists with that item and batch. Logged in as PHARMACIST (needs inventory write permission).
**Ideal path**: 5. Open the original bill, press "Return items", tick the items and quantity, pick the refund method, confirm.
**Alternate paths**: (a) Sales > tab "Returns" > "New return" (this story). (b) Sidebar "Inventory" > area "Sales" > "Customer returns" > primary "Post return" (same editor, same document). (c) The Returns tab empty-state button "New return". (d) The finished bill page has no "Return" action.

### Steps
1. Click sidebar "Sales" → register (tab "Sales").
2. Click tab "Returns" → URL `?tab=returns`; same register layout with an extra column "Against bill", payment column "Refund" (store credit shown as "Store credit"), header button now "New return".
3. Click "New return" → `/dashboard/inventory?area=sales&view=SALES_RETURN&new=<key>&return=…`; Inventory page, document editor for "Customer returns" with the help line "Select the original sale and choose restock, quarantine or loss for each returned batch."
4. Click "Search original sale" ("Sale reference, product, barcode or SKU") and type "Tretinoin" → list in the select below filters (200 ms debounce).
5. Open "Add from original sale" and choose "<sale ref> · Tretinoin 0.025% cream · batch TR2409 · 1 tube" (native select, option text "remaining return quantity") → a return line appears: price, GST, discount are copied from the sale and locked (disabled inputs).
6. Select the line's Quantity field and type 1 (optional; default 1).
7. Click the line's "Disposition" select and choose "Quarantine" or leave "Restock" (default: Restock; options Restock, Quarantine, Record as loss). Counted as 0 steps when left alone.
8. Click "Refund method" select and choose "CASH" (default: CREDIT, which is store credit, so a cash refund needs this change) → one selection.
9. Click "Customer name (optional)" and type "Priya Nair" (optional; placeholder "Walk-in customer"; app already knows this from the original sale).
10. Click "Phone (optional)" and type "9848012345" (optional; app already knows this).
11. Click "Reason / notes" and type "Doctor changed the prescription, pack unopened" (required before posting; placeholder "Required before posting").
12. Click "Post return" → return posted; stock restored for the restocked line (or held if Quarantine); the document locks.
13. Click "Back to customer returns" (top left) → back to the list; later the Sales > Returns row shows "Against bill BILL-…" and Refund badge "Cash".

### Variations
- Opened pack: choose "Quarantine" (held out of stock) or "Record as loss" in step 7.
- Return only part of a multi-line bill: repeat steps 4 and 5 per line (2 steps each).
- Save for later: click "Save draft" instead of "Post return".

### Edge Cases
- Returning more than remaining: the "Add from original sale" list only shows sold batches with remaining quantity above 0.
- Refund method CASH is only recorded on the document; the Pharmacy Invoice's own "Payments" ledger and "Refund due" state do not change (returns live in the inventory document engine, not on the pharmacy invoice).
- Customer details typed again in steps 9 and 10 are already on the original sale.
- Reason is mandatory; the primary button does not post without it.

---

## PHARMACY-COUNTER-08: A full counter shift case: review lines, substitute, discount, bill, PDF, verify

**Type**: long
**Topic**: Pharmacy counter billing
**Persona**: Meenakshi Iyer, pharmacist. Lakshmi Narayanan (68, senior citizen) comes with Dr. Anil Reddy's prescription: Tretinoin 0.025% cream, Doxycycline 100 mg x 14, Sunscreen SPF 50 gel. Doxycycline 100 mg is out of stock; Doxt-SL 100 is available.
**Goal**: Use the Counter's review workflow, bill with a substitute and a 5% senior discount, take UPI, print, download the PDF, then verify the register and the Counter queue.
**Preconditions**: Logged in as PHARMACIST. Prescription pending; Doxycycline line shows "Out" in stock.
**Ideal path**: 7. Click the prescription, accept the available lines (one click for all), pick a substitute from a suggestion list, enter 5% discount, choose UPI, confirm and print, share PDF. Review and billing should be one screen.
**Alternate paths**: (a) The Counter review steps (steps 2 to 8) are optional: the bill can be opened straight from the "Prescription Queue" table with "Bill" (see story 01); the Counter review state is not read by the bill. (b) Substitution can be done in the bill only; the Counter "Sub" button just records a flag. (c) Download PDF is also in Pharmacy Desk > Invoices > "Download Invoice". (d) Status buttons "Paid" and "Ready" are manual toggles unrelated to the invoice.

### Steps
1. Click sidebar "Pharmacy Counter" → cockpit loads; "Queue" panel shows Lakshmi (badge "Pending"), counts "Queued", "Exceptions".
2. Click Lakshmi's card in the "Queue" panel → POST `/pharmacy/prescription-queue/<id>/pull` creates the dispense task and sets "In Review"; "Active Dispense" shows "0/3 lines reviewed", the lifecycle rail "Queued, In Review, …", and a "Medicine review table" with columns Prescription, Inventory Match, Stock, Shelf and batch, Action.
3. Click "Accept" on the Tretinoin row → line saved as accepted ("1/3 lines reviewed").
4. The reason dropdown (below the table) is "Substitution requested" (default: Substitution requested; options also Quantity changed, Medicine unavailable, Paused for doctor clarification, Cancelled at counter, Stock correction needed). Leave it.
5. Click the "Reason or pharmacist note" box and type "Doxycycline 100 out, Doxt-SL 100 offered" (optional).
6. Click "Sub" on the Doxycycline row → line saved as substitute with that reason; no replacement can be chosen here.
7. Click "Accept" on the Sunscreen row → "3/3 lines reviewed"; the text above the buttons changes to "Ready for billing review".
8. Click "Ready" → PATCH status READY_TO_BILL; lifecycle "Ready to Bill"; checklist item "GST bill" ticks. (Ready is disabled until every line is Accept, Sub or Edit; any "NA" line blocks it.)
9. Click "Open bill" (Active Dispense; same as header "Bill" and Pick + Pay "Collect payment") → `/dashboard/pharmacy/sales/bill?patientId=…&prescriptionId=…&doctorId=…`; builder prefilled as in story 01. The review actions, reason and note from steps 3 to 8 are not carried over; Doxycycline shows a red "Out of stock" badge.
10. Click "Substitute" on the Doxycycline line → blue notice "Choose a replacement for Doxycycline 100 mg. The prescribed quantity will be kept." with "Cancel substitution".
11. Click "Search Drugs" and type "Doxt" → results list.
12. Click "Add" on "Doxt-SL 100 Capsule 10s" → the Doxycycline line is replaced in place (name, price, GST, stock), keeps the "Prescribed: Doxycycline 100 mg" caption and quantity.
13. Click "Confirm" on the amber quantity note of the Tretinoin line (optional; only if shown).
14. Click "Bill discount" (Invoice Summary) and type 5 (optional; "%" selected by default (default: %)) → Summary shows "Bill discount (5%): -₹…" and Total.
15. Click the "Payment Method" select (default: Cash).
16. Choose "UPI".
17. Click "Print Preview" → dialog "Pharmacy Invoice Preview".
18. Click "Confirm Invoice" (left, green) → checkout; number issued; stock deducted; UPI payment recorded; button shows "Invoice Confirmed"; "Download PDF" becomes enabled (it is disabled before confirm).
19. Click "Print" → browser print dialog.
20. Click Print in the browser dialog.
21. Click "Download PDF" → toast "PDF ready", file "<bill number>.pdf" downloads (for WhatsApp to the patient; no in-app send).
22. Click "Close" → banner "This checkout is confirmed. Reopen it for another copy."
23. Click "Back to Sales" → register; top row has the new bill with Payment badge "UPI".
24. Click sidebar "Pharmacy Counter" → cockpit reloads on mount.
25. Click filter chip "Done" in the "Queue" panel → Lakshmi's prescription is under "Done" (invoice-derived "Dispensed"); the manual "Paid" button was never needed.

### Variations
- Medicine truly unavailable: click "NA" instead of "Sub" in step 6 and set the reason to "Medicine unavailable" first (extra 2 steps); "Ready" stays disabled until the line is resolved, but "Open bill" is not disabled, so the bill can go ahead anyway.
- Pause for doctor clarification: choose reason "Paused for doctor clarification" and click "Pause" instead of steps 2 to 8; the prescription shows under "Exceptions".
- Partial supply: remove a line from the bill (trash icon "Remove <drug>") and bill the rest; queue shows "Partial" (1/3).
- Click "Paid" in the Active Dispense row before billing: sets the task to Paid without any payment; the invoice is unaffected.

### Edge Cases
- Cockpit buttons: "Rx queue" does nothing (`onOpenQueue` is a no-op), "Daily close" jumps to Pharmacy Desk (partner daily sync), "Shelf locations" and "Inventory Control" open Inventory > Today (the `tab=pharmacy-control` parameters are not understood).
- Selecting a queue row writes to the server (creates the dispense task, sets "In Review") just by looking at it.
- Stock check failure: red text "Unable to check current stock. Use Refresh to retry."
- Stock for the same prescription is shown in at least five places: queue "Stock" column, cockpit "Stock" badge, "Pick Assist", "Scan next", and the bill line badge.
- Checklist panel (Validate, Pick earliest-expiry batch, Barcode, GST bill, Payment, Dispense) are display-only ticks; nothing scans a barcode in this flow.

---

## PHARMACY-COUNTER-09: Find a past pharmacy invoice and download its PDF

**Type**: short
**Topic**: Pharmacy counter billing
**Persona**: Dr. Sunita Rao is the owner; pharmacist Meenakshi Iyer does it for her accountant, who needs a PDF of yesterday's bill.
**Goal**: Download one invoice as a PDF.
**Preconditions**: Logged in as PHARMACIST (or ADMIN, DOCTOR). Invoice is confirmed.
**Ideal path**: 3. Search for the bill, click download, done. A direct download in the Sales register would save the navigation.
**Alternate paths**: (a) Pharmacy Desk > "Invoices" > "Download Invoice" (this story). (b) Inventory > Sales > "Patient invoice history" (same list). (c) Sales register row "Print" then choose "Save as PDF" in the browser dialog. (d) Download PDF is also offered inside the sale-time preview after "Confirm Invoice". (e) Pharmacy Report > "Sales Bills" / "Sales Register".

### Steps
1. Click sidebar "Pharmacy Desk" → `/dashboard/pharmacy?section=desk`; title "Pharmacy Desk" with metric strips (Sales, Invoices, Stock, Packages), AI assistant launcher, "Partner daily sync" and "Treatment Packages" cards.
2. Click "Invoices" (top right) → `/dashboard/pharmacy/invoices`; title "Pharmacy Invoices"; cards "Total Invoices", "Total Amount", "Completed", "Pending Amount"; filters Search, Status, Payment Status, Payment Method, Date Range.
3. Click "Search" ("Invoice number, patient...") and type "Menon" → list filters.
4. Click the download icon "Download Invoice" in the card → PDF is generated and saved without a popup; failure raises a browser `alert()`.

### Variations
- Open instead of download: click the eye icon "View Invoice" (opens a popup window).
- Only completed bills: change Status filter (2 clicks).

### Edge Cases
- The Sales register already lists the same bills with search by Bill No, Patient and Mobile, so this page duplicates it; it uses older styling with browser `alert()` and `confirm()` boxes.
- The list shows a trash icon on every row (confirm dialog, then server refusal for finished bills).
- Same information on several surfaces: invoice number, patient, total and payment method are shown in the Sales register, this list, the bill's own page and the Pharmacy Report.
