# Topic: pharmacy-counter-billing

Scope: Pharmacy Counter (`/dashboard/pharmacy?section=counter`, `PharmacyCounterCockpit` + `PrescriptionDispensingQueue`), Pharmacy Billing (`/dashboard/pharmacy?section=billing`, `PrescriptionDispensingQueue` + `PharmacyInvoiceBuilderFixed`), checkout recovery (sessionStorage `pharmacy-checkout-attempt-v1`), and the Pharmacy Invoices list (`/dashboard/pharmacy/invoices` and Inventory → Sales → "Patient invoice history", both `PharmacyInvoiceList`).

Story numbers use the 6xx block (topic 6 in discovery). Persona notes:
- **Seed has no PHARMACIST user.** Pharmacist stories assume admin@clinic.test created "Suresh Goud" (`suresh.pharma@clinic.test`, Role "Pharmacist") from Users → "New User". Where noted, admin@clinic.test can stand in, because ADMIN passes every role and permission check.
- RECEPTION (reception@clinic.test, Riya Sharma) sees Pharmacy Desk/Counter/Billing in the sidebar. The backend refuses `/pharmacy/dashboard`, `/drugs`, `/pharmacy/invoices*` (read, checkout, payments) and `link-inventory` for this role (already known; see discovery).
- DOCTOR (shravya@clinic.test / praneeta@clinic.test) has no Pharmacy sidebar links, but the backend lets them do everything. They reach billing through "Go to Pharmacy".

Data conventions: Hyderabad dermatology pharmacy. Invoice numbers come from `PHI-{year}-{seq}` (for example `PHI-2026-042`). Since GST 2.0, most medicines carry 5% GST and cosmetic sunscreens and shampoos carry 18%. Products are sold by the strip (10 tabs or caps), the tube or the bottle.

---

## STORY-601: Accept every line of a morning acne prescription and mark it ready to bill

**Type**: short
**Topic**: pharmacy-counter-billing
**Persona**: Suresh Goud, pharmacist. At 10:15 on a busy Saturday he wants to clear the oldest waiting prescription before the next consult batch arrives.
**Goal**: Review all medicines on one queued prescription and move it to "Ready to Bill".
**Preconditions**: Logged in as a PHARMACIST (or admin@clinic.test). Dr. Shravya Dermatologist created an ACTIVE prescription for Lakshmi Reddy (98480 12345, Kukatpally) with Doxt-SL 100 (doxycycline, strip of 10), Deriva 0.1% gel 15 g tube and Teczine 5 mg (strip of 10). All three are linked to inventory with stock.
**Ideal path**: 5 steps. Open Counter, select the prescription, Accept ×3, Ready. Review needs one click per line, but selecting and opening could be a single step.
**Alternate paths**: Sidebar "Pharmacy Counter", or Pharmacy Desk quick action "Pharmacy Counter" ("Review and pick"). Line review exists only in the cockpit's "Active Dispense" column. The Prescription Queue table below it and the Billing tab queue have no review actions.

### Steps
1. Click sidebar "Pharmacy Counter" → `/dashboard/pharmacy?section=counter`. The page header and the cockpit header both read "Pharmacy Counter". Command stats show Queue / Review / Exceptions / Ready/Paid.
2. Look at the "Queue" column ("N today or open"). Lakshmi Reddy's card shows "3 medicines", "1.4h pending" and a "Queued" chip. She is auto-selected as the first pending entry.
3. Click Lakshmi Reddy's card → the card turns dark. A dispense task is created (`POST …/pull`) and moved to IN_REVIEW. The lifecycle rail highlights "In Review" and the header reads "0/3 lines reviewed".
4. Check the "Inventory Match", "Stock" ("IN STOCK", "Qty 20") and "Shelf and batch" cells (for example "Rack B2", "DX24117", "30 Apr 2027"). Suresh hesitates at "Qty 20" for doxycycline because he knows it is sold in strips. The cockpit counts doses, not strips (already-known defect).
5. Click "Accept" on each of the three rows → each chip toggles dark and the header shows "3/3 lines reviewed". The footer text changes to "Ready for billing review".
6. Click "Ready" → the lifecycle rail moves to "Ready to Bill", the queue chip reads "Bill" and the "GST bill" checklist item turns green.

### Variations
- Select-then-refresh: Suresh clicks "Refresh" in the cockpit header. Queue and stock reload, and the selection is kept because the entry is still in the first 8.
- Window refocus: alt-tabbing back to the browser triggers a `focus` reload of the queue. This is a silent refresh with no indicator besides the spinner on Refresh.

### Edge Cases
- Clicking "Ready" before all lines are reviewed: the button is disabled. If it is forced, the server returns 400 "Review every available medicine before marking ready for billing. Unavailable medicines must be resolved first."
- Two pharmacists select the same entry: both see "In Review", and `assignedToId` records only the first reviewer. Nothing in the UI shows who owns the task.
- The same information appears on several surfaces: the stock number shows in the review row ("Qty"), in Pick Assist ("Pick N · M available"), in "Scan next" (Stock) and in the Prescription Queue table's Stock column directly below.

---

## STORY-602: Pause a prescription because the antifungal is out of stock, with a note to the doctor

**Type**: medium
**Topic**: pharmacy-counter-billing
**Persona**: Suresh, pharmacist. Lulifin cream ran out yesterday and he does not want to hand over a partial bag without asking Dr. Praneeta.
**Goal**: Flag one line as unavailable, record why, and park the task without billing.
**Preconditions**: Logged in as a PHARMACIST. A prescription for Mohammed Irfan (99890 44321, Tolichowki) contains Lulifin 1% cream 30 g (0 non-expired stock) and Forcan 150 (fluconazole, strip of 1, in stock).
**Ideal path**: 5 steps. Select the entry, NA on Lulifin, Accept Forcan, choose a reason and type a note, Pause.
**Alternate paths**: None. Pause, reason and note exist only in the Counter cockpit. The Billing tab has no pause concept. A pharmacist there would just remove the line from the bill ("Remove Lulifin…").

### Steps
1. Open "Pharmacy Counter" → Queue column. Mohammed Irfan's card shows "over 2h" in amber.
2. Click the card → "Active Dispense" loads. The Lulifin row shows Stock "OUT OF STOCK" and an amber "Out of stock" warning. If an expired batch is still on the shelf, it also shows "Expired batch blocked".
3. Pick Assist (right column) lists "Lulifin … Pick 1 · 0 available".
4. Click "NA" on the Lulifin row → the line saves as UNAVAILABLE. The "Ready" button stays disabled and the footer reads "Review every medicine before billing".
5. Click "Accept" on Forcan 150 → "2/2 lines reviewed". The line-review save also sends the current reason dropdown value ("Substitution requested" by default) as the line's reason. Suresh notices too late that the dropdown should have been changed first.
6. Change the reason dropdown to "Paused for doctor clarification" and type "Lulifin OOS till Tue; OK to switch to Luliconazole generic?" in "Reason or pharmacist note".
7. Click "Pause" → the lifecycle rail highlights "Paused" in amber. The queue card chip turns red "Paused" and the "Exceptions" counters (header and Queue column) increase by 1.
8. Use the Queue filter "Exceptions" → only paused, partial or expired entries show.
9. Two hours later Dr. Praneeta agrees by phone. Suresh selects the entry again, clicks "Sub" on the Lulifin line and types "Dr. Praneeta OK'd generic luliconazole 1%" in the note.
10. The "Ready" button enables (no pending or unavailable lines). Click "Ready" → "Ready to Bill".

### Variations
- No doctor reply: Suresh leaves it Paused. The task appears under "Exceptions" in every later session until someone acts. The cockpit has no "Cancel" button, although "Cancelled at counter" is offered as a reason.
- "Edit" instead of "Sub": both only tag the line. The cockpit has no field for the new quantity or the substitute product (the DTO's `editedQuantity` and `substituteDrugId` are never sent). The real change has to be made again in Billing with "Substitute".

### Edge Cases
- Prescription expires while paused: `dispensingEligible` becomes false. The Bill button is disabled, the fieldset is disabled, and the cockpit chip still says "Paused" while the table below says "Expired". Two vocabularies describe the same state.
- A network error on the line save shows "Unable to save medicine review" in the red alert bar, and the line stays un-toggled.

---

## STORY-603: Doctor prescribes, then the pharmacist reviews, bills, prints, collects and dispenses (end to end)

**Type**: long
**Topic**: pharmacy-counter-billing
**Persona**: Dr. Shravya Dermatologist finishes a follow-up for Ananya Varma (98660 77889, Banjara Hills). Suresh Goud, pharmacist, takes the hand-off at the counter while Ananya waits with her mother, who pays by UPI.
**Goal**: Go from a signed prescription to a confirmed GST invoice, printed copy, recorded payment and a "Dispensed" task.
**Preconditions**: Ananya has an appointment and visit. Products exist in inventory with GST rates: Clindac-A gel 20 g (5%), Doxt-SL 100 strip of 10 (5%), La Shield SPF 50 gel 60 g (18%). A PHARMACIST user exists.
**Ideal path**: 12 steps. Prescribe, hand off, select at counter, accept ×3, Ready, open bill, confirm quantity reviews, Print Preview, Confirm & Print, record payment, Dispense. A UI that recorded payment at checkout would need about 10.
**Alternate paths**: Hand-off from the visit: "Go to Pharmacy" in PrescriptionBuilder (before create, prefill by visitId) or "Yes, go to Pharmacy" in the post-create confirm dialog (prefill by prescriptionId). A pharmacist can also skip the Counter entirely: Pharmacy Billing → queue row "Load". From the Counter, billing opens through the header "Bill", "Open bill" (Active Dispense), "Collect payment" (Pick + Pay), or a Prescription Queue table row "Bill". All four do the same thing. Payment can be recorded only from Pharmacy Invoices ("Mark as Paid"), reachable from the Desk "Invoices" button or Inventory → Sales → "Patient invoice history".

### Steps
1. (Dr. Shravya, shravya@clinic.test) Open the visit from Appointments → "Continue Visit". Add the three medicines in the Prescription tab and click "Create Prescription".
2. The confirm dialog offers "Yes, go to Pharmacy" / "Stay Here". She clicks "Stay Here" because the pharmacist will pick it up. Her sidebar has no Pharmacy links.
3. (Suresh) Log in as suresh.pharma@clinic.test → Dashboard → sidebar "Pharmacy Counter".
4. Ananya Varma appears at the top of the Queue column ("3 medicines", "4m pending"). Click it → task created, "In Review".
5. Scan the review table. La Shield shows "LOW STOCK" and "Low stock". Clindac-A shows a batch near expiry ("Near expiry" badge). "Scan next" shows the first line with a mapped shelf.
6. Click "Accept" on all three → "Ready for billing review" → click "Ready".
7. Click "Open bill" → the URL becomes `/dashboard/pharmacy?section=billing&patientId=…&doctorId=…&prescriptionId=…`. The page header and the workbench header both read "Pharmacy Billing". The bill region scrolls into view.
8. The amber "Loading prescription data..." strip shows, then the "Linked Prescription" box appears ("Items from prescription: 3").
9. In "Patient & Doctor Details" the patient search shows "Ananya Varma (9866077889)" and the doctor select shows "Dr. Shravya Dermatologist". Billing Name and Phone are auto-filled.
10. Each "Invoice Items" card carries the 📋 icon and a "Prescription" badge. Clindac-A shows the amber review "Sold per tube. Filled 1; confirm how many the course needs." Suresh changes Quantity to 2, which also clears the review. On the doxycycline card he reads the computed strips, then clicks "Confirm".
11. Check "Prescription directions" on each card (Dosage / Frequency / Duration / Instructions). For La Shield he types "Apply 20 min before going out; reapply every 3 h".
12. Glance at "Invoice Summary": Subtotal, Discount, Tax and Total in ₹. The same total appears under the button ("3 items • ₹1,412.60 total").
13. Choose Payment Method "UPI" and add Notes: "Mother paid via PhonePe".
14. Click "Print Preview" → the full-screen "Pharmacy Invoice Preview" opens. The header shows "DRAFT • Ananya Varma" with badges "3 items", "₹1,412.60" and "ORIGINAL". The "Invoice Controls" panel shows Status "Draft preview" and "Download PDF" is disabled.
15. Click "Confirm & Print" → "Confirming...". The checkout attempt is saved to sessionStorage, then `POST /pharmacy/invoices/checkout` runs. Toast: "Success — Invoice PHI-2026-042 confirmed successfully". The preview reloads with the server's print data (HSN, batch numbers) and the browser print dialog opens.
16. Print on the counter's A5 printer. Back in the dialog, the button reads "Invoice Confirmed" (disabled), Status shows "Confirmed" and "Download PDF" is enabled.
17. Click "Download PDF" → toast "PDF ready", file `pharmacy-invoice-PHI-2026-042.pdf`. Click "Close".
18. Above the builder, the amber banner reads "This checkout is confirmed. Reopen it for another copy." with "Reopen confirmed invoice" and "Start a new invoice".
19. Suresh assumes UPI was recorded. In fact the invoice is CONFIRMED with payment status Pending. To collect it he opens Pharmacy Desk (sidebar) → "Invoices" → `/dashboard/pharmacy/invoices`.
20. The row PHI-2026-042 shows a "Pending" payment badge. Click the "Mark as Paid" icon → confirm "Mark invoice PHI-2026-042 as paid? Remaining payment: ₹1412.60" → OK → alert "Invoice marked as paid successfully".
21. Return to "Pharmacy Counter". The cockpit refreshed on window focus, and Ananya's card shows an "Invoice" badge in Active Dispense.
22. Click "Paid" (records only a task timestamp), hand over the bag, then click "Dispense" → lifecycle "Dispensed", chip "Done", and the entry moves under the "Done" filter.
23. Click "Start a new invoice" in Billing before the next patient. The URL params are cleared and the builder is empty.

### Variations
- Doctor hands off directly: in step 2 Dr. Shravya clicks "Yes, go to Pharmacy". She lands on Pharmacy Billing with the same prefill and could confirm the invoice herself, because DOCTOR bypasses role checks.
- Print later: click "Confirm Invoice" (green) instead of "Confirm & Print", then use the "Print" button.
- Duplicate copy for insurance: switch Copy Type to "Duplicate" before "Print". The preview badge changes to "DUPLICATE".

### Edge Cases
- Pharmacist forgets steps 19–20: the invoice stays "Pending" forever, and the Desk "Invoices" strip counts it as pending. The builder never says that payment was not captured, although Payment Method "UPI" was chosen.
- Pharmacist forgets step 22: the Counter "Done" filter still includes the prescription (the server derives DISPENSED from the invoice), but the task never records `dispensedAt`.
- The same information appears on several surfaces: the grand total shows in the Invoice Summary card, the footer under "Print Preview", the preview header badge, the "Invoice Controls" panel and the printed invoice (5 places on one screen).

---

## STORY-604: Load a prescription whose cream is not linked to inventory and link it once for all patients

**Type**: medium
**Topic**: pharmacy-counter-billing
**Persona**: Suresh, pharmacist. Dr. Praneeta writes "Momate-S ointment" free-text and it never matches stock automatically.
**Goal**: Link the prescribed name to the right inventory product so this and future bills auto-fill.
**Preconditions**: PHARMACIST login. A pending prescription for Sai Kiran Goud (90000 12121, Secunderabad) includes "Momate-S ointment" (UNMATCHED) and Levocet 5 mg (matched). Inventory holds "Momate-S Ointment 20 g" (mometasone + salicylic acid).
**Ideal path**: 5 steps. Load, Link item, search, select, confirm. The bill re-fills automatically.
**Alternate paths**: "Link item" appears in the Stock column of the Prescription Queue table (both the Counter and Billing tabs) and in the builder's "Linked Prescription" box ("… link inventory before billing. Link item"). The builder also offers "Substitute", which replaces the product for this bill only and does not remember the match.

### Steps
1. Sidebar "Pharmacy Billing" → the "Prescription dispensing queue" card lists Sai Kiran Goud. Its Stock column shows "Not linked" and "Momate-S ointment (—)" with a "Link item" link.
2. Click "Load" on his row → the builder remounts and loads the prescription. The Momate-S card shows the red "No match" badge, and the "Linked Prescription" box reads "Momate-S ointment: link inventory before billing. Link item".
3. Try "Print Preview" early → toast "Medicine needs review — Select a replacement or remove each unmatched medicine before confirming the invoice."
4. Click "Link item" in the Linked Prescription box → dialog "Link Momate-S ointment", whose description says the choice "will be remembered for the same medicine across patients". "Search clinic inventory" is pre-filled with the prescribed name.
5. "Searching inventory…" shows, then the candidates: "Momate-S Ointment 20 g · Glenmark · 20 g tube · 14 tube available". Select the radio button.
6. Click "Confirm and remember match" → "Saving…" → the dialog closes and the prescription reloads. The card now shows the product name with price and a GST % from the drug master.
7. Confirm the amber quantity review ("Sold per tube. Filled 1; …"), then continue to Print Preview.

### Variations
- Change an existing link: the queue shows "Change link" for linked lines. Re-linking is remembered for all future prescriptions with that name.
- Substitute instead: click "Substitute" on the card → blue banner "Choose a replacement for Momate-S ointment. The prescribed quantity will be kept." → search "mometasone" → click "Add" on a "Best Match" result. The card keeps "Prescribed: Momate-S ointment" and carries the old quantity (already-known unit defect).

### Edge Cases
- The prescription is edited by the doctor while the dialog is open: save fails with "Prescription changed. Refresh before linking inventory." shown in the dialog. Click the row's refresh icon and retry.
- The inventory item is tied to two products: "This inventory item has multiple product links. Review duplicate products first." There is no link from the dialog to fix it.
- No candidates: "No inventory candidates. Try another spelling or add the product in Inventory." There is no shortcut to Inventory.
- RECEPTION tries the link: 403 (`pharmacy:invoice:create`), and the raw error text shows in the dialog.

---

## STORY-605: Walk-in customer buys a sunscreen and an acne care package without a prescription

**Type**: medium
**Topic**: pharmacy-counter-billing
**Persona**: Suresh, pharmacist. Priya Menon (97010 55667, Madhapur), a returning patient, walks in for her usual La Shield sunscreen and the "Acne Control – 30 Day" treatment package.
**Goal**: Bill OTC items and a package to an existing patient with no prescription.
**Preconditions**: PHARMACIST login. Priya is registered in Patients. Drug "La Shield SPF 50 Gel 60 g" (₹795, drug-master GST 18%) exists, as does an active package "Acne Control – 30 Day" (₹1,450, original ₹1,780).
**Ideal path**: 6 steps. Open billing, pick the patient, add the drug, add the package, preview, confirm.
**Alternate paths**: Pharmacy Counter empty-queue "Walk-in bill" (shown only when the queue is empty), Counter header "Bill" with nothing selected, Active Dispense "Start billing", and Inventory → Sales → "Counter sales" (separate COUNTER_SALE workflow). Sidebar "Pharmacy Billing" and `/dashboard/billing` (redirect) open the same builder.

### Steps
1. Sidebar "Pharmacy Billing". The queue card sits above the builder, so Suresh scrolls past it to "New Pharmacy Invoice with Packages".
2. Click into "Search patients by name or phone..." and type "97010" → after a 300 ms debounce the list shows "Priya Menon / 9701055667". Click it → Billing Name and Phone fill.
3. Leave Doctor on "Select doctor" because the doctor is optional for OTC.
4. In "Individual Drugs" type "la shield" in "Search Drugs" → results show "Best Match" and "High Match" badges with price ₹795.00. Click "Add".
5. The new card shows Tax % 18. That happens to be right for a sunscreen, but every manually added drug defaults to 18% (see Defects).
6. Switch to the "Treatment Packages" tab → package cards show the struck-through original price, the package price and "19% OFF". Click "Acne Control – 30 Day" → the PACKAGE card shows "Package Contents:" with ×quantities.
7. Change the package Discount % to 5 as a loyalty courtesy. The Invoice Summary updates.
8. Payment Method "Cash". Click "Print Preview" → Draft preview → "Confirm Invoice" → toast "Invoice PHI-2026-043 confirmed successfully".
9. Click "Print" and hand over the bill. Click "Start a new invoice" in the banner.

### Variations
- New walk-in, not registered: Patient * is mandatory, so "Print Preview" stays disabled. Suresh must go to Patients → add the patient, then return. The builder has no quick-add.
- Adding the same drug twice increments the quantity of the existing card instead of creating a new one.

### Edge Cases
- The customer asks for Nizral 2% shampoo (5% GST in the drug master): the card still shows Tax % 18 because manual adds ignore the drug's GST rate. Unless Suresh retypes it, the customer is over-charged.
- The patient list is empty and the doctor list is empty: if any one of `/patients`, `/users`, `/drugs` or `/pharmacy/packages` fails on load, all four lists stay empty, with only a console error.
- Typing a 1-character search shows the cached first 100 patients filtered client-side. Patients beyond the first 100 appear only after a 2-character query.

---

## STORY-606: Wi-Fi drops while confirming; recover the pending checkout without double billing

**Type**: medium
**Topic**: pharmacy-counter-billing
**Persona**: Suresh, pharmacist. The clinic's ACT Fibernet line flickers during the monsoon. He clicked Confirm and the spinner just hung.
**Goal**: Find out whether the invoice was created and finish the sale exactly once.
**Preconditions**: PHARMACIST login. A bill for Venkat Rao (94400 22334, Ameerpet) with Doxt-SL ×2 strips and Teczine ×1 strip is in Print Preview.
**Ideal path**: 3 steps. Reload, Retry pending checkout, print. The idempotent request key makes the retry safe.
**Alternate paths**: Check Pharmacy Invoices (search "Venkat") to see whether PHI-… exists. The banner's own "Retry pending checkout" is the intended path.

### Steps
1. In "Invoice Controls" click "Confirm Invoice" → "Confirming..." spins. The network drops and the toast "Error Confirming Invoice" shows a fetch error.
2. Suresh reloads the page (F5) after the router comes back. The builder is now empty, but an amber banner reads "A checkout for Venkat Rao needs confirmation. Retry it before starting another sale." with "Retry pending checkout".
3. He starts adding items for a different customer and clicks Print Preview → "Confirm Invoice". The toast reads "Error Confirming Invoice — Resolve the pending checkout before changing its details or starting another sale. Use Retry pending checkout."
4. Click "Retry pending checkout" → the same request key is resent. If the first request had committed, the server returns the existing invoice with no second stock deduction. Toast "Invoice PHI-2026-044 confirmed successfully", and the preview opens with the saved invoice.
5. The banner changes to "This checkout is confirmed. Reopen it for another copy." Click "Start a new invoice" to clear it and bill the next customer.

### Variations
- Stock ran out in between: the retry returns 400 "Insufficient non-expired stock for Doxt-SL 100. Required 2, available 1." The pending attempt is discarded automatically, and the builder can be edited again.
- Concurrency conflict (409, "Invoice or stock changed concurrently. Retry this request with the same key."): the attempt is kept, and retrying is correct.

### Edge Cases
- Permanent non-400/404 failure (for example 403 for a role without `pharmacy:invoice:create`): the attempt is never cleared. The banner offers only "Retry pending checkout", which fails the same way, and there is no "Discard". Every new sale is blocked until the tab is closed (sessionStorage) (see Defects).
- Closing the tab loses the attempt (sessionStorage). Opening Billing in a second tab does not see it, so a duplicate sale from another tab is not guarded.
- Unreadable stored attempt: toast "Checkout recovery failed — Stored checkout could not be read. Check the invoice list before creating another sale."

---

## STORY-607: Re-print a duplicate copy of yesterday's invoice for an insurance claim

**Type**: short
**Topic**: pharmacy-counter-billing
**Persona**: Suresh, pharmacist. Ravi Teja (98490 11223) returns and needs a copy of yesterday's bill for his employer's medical reimbursement.
**Goal**: Find yesterday's invoice and print it.
**Preconditions**: PHARMACIST login. Invoice PHI-2026-039 for Ravi Teja was confirmed yesterday.
**Ideal path**: 3 steps. Open invoices, search, print.
**Alternate paths**: Pharmacy Desk "Invoices" → `/dashboard/pharmacy/invoices`; Inventory → Sales → "Patient invoice history" (same component). The billing builder's "Reopen confirmed invoice" works only for the last checkout in this tab. A true "Duplicate" copy-type print exists only in the builder preview. The list's print has no copy type.

### Steps
1. Pharmacy Desk → "Invoices". The page shows "Pharmacy Invoices" twice (page h2 and component header) under "Back".
2. The list defaults to Date Range "Today", so yesterday's invoice is missing. Suresh changes it to "This Week".
3. Type "98490" in Search ("Invoice number, patient...") → the row PHI-2026-039 appears.
4. Click the "Download Invoice" (download icon) → a new tab opens with the invoice HTML and the print dialog auto-fires after 0.5 s. Choose the printer or "Save as PDF".

### Variations
- "View Invoice" (eye icon) opens the same HTML without auto-print. It has a "🖨️ Print Invoice" button.
- Pop-ups blocked: alert "Please allow pop-ups to download the invoice".

### Edge Cases
- The list printout is a simpler layout (no HSN, batch, branch GSTIN, or "DUPLICATE" marking) than the builder's print-data preview. The same invoice prints in two different formats depending on the screen.
- "This Week" means "the last 7 days", not the calendar week.

---

## STORY-608: Evening reconciliation in Pharmacy Invoices: filter unpaid UPI bills, collect, and try to delete a mistake

**Type**: medium
**Topic**: pharmacy-counter-billing
**Persona**: Suresh at 8:30 pm, before handing over the cash drawer. He wants every UPI invoice from today marked paid and a wrong bill removed.
**Goal**: Use list filters to find pending payments, record them, and clean up an erroneous invoice.
**Preconditions**: PHARMACIST login. Today: 14 invoices, 3 with payment Pending (2 UPI, 1 Cash). PHI-2026-047 was billed to the wrong patient.
**Ideal path**: 6 steps. Filter Payment Status=Pending, Payment Method=UPI, then Mark as Paid ×2, then cancel the wrong invoice. The last needs a "Cancel/Void" action that the UI lacks.
**Alternate paths**: Inventory → Sales → "Patient invoice history" renders the same list. Admin and Accountant notification-bell items "N pending payments" link to `/dashboard/pharmacy?section=billing`, which is the builder, not this list.

### Steps
1. Desk → "Invoices". The stat cards show Total Invoices / Total Amount / Completed / Pending Amount for today. The card heading reads "Invoices (14)" and "Showing 14 of 14 invoices".
2. Set Payment Status "Pending" → 3 rows. The stat cards now describe only these 3 rows, not the day.
3. Set Payment Method "UPI" → 2 rows. The row text shows raw values ("Payment: UPI").
4. On PHI-2026-045 click "Mark as Paid" (green check) → confirm "Remaining payment: ₹642.00" → OK → "Invoice marked as paid successfully". The row drops out of the Pending filter.
5. Repeat for PHI-2026-046. Midway the request times out → alert "Payment could not be confirmed. Retry to reconcile the same payment." The icon's title becomes "Retry Payment". Clicking it re-sends the same request key and amount.
6. Click "Clear" → all filters reset, including Date Range to "All dates" (not back to Today).
7. Search "PHI-2026-047" → click "Delete Invoice" (trash) → confirm "Are you sure you want to delete this invoice?" → OK → alert "Failed to delete invoice. Please try again."
8. Suresh retries twice with the same result. The server only deletes DRAFT invoices created without checkout, so every builder invoice is undeletable, and the UI has no Cancel action. He gives up and writes it in the register.

### Variations
- Paying partially: "Mark as Paid" always collects the full remaining balance. There is no amount field, although the backend supports PARTIALLY_PAID.
- An invoice confirmed in another tab triggers `pharmacy-invoices-refresh`, which silently forces Date Range back to "Today" and page 1.

### Edge Cases
- More than 20 invoices: "Total Invoices", "Total Amount" and "Pending Amount" count only the visible page, while the header "Invoices (N)" shows the true total. Previous/Next appear only when pages > 1.
- "Confirm Invoice" and "Edit Invoice" icons appear only on DRAFT rows. No reachable screen creates drafts, and "Edit Invoice" does nothing.
- Backend failure or 403 shows the empty state "No invoices found — Try a different search or adjust the filters." That is misleading.

---

## STORY-609: Receptionist covers the pharmacy counter during the pharmacist's lunch

**Type**: medium
**Topic**: pharmacy-counter-billing
**Persona**: Riya Sharma, receptionist (reception@clinic.test). Suresh is at lunch and a patient is waiting for medicines. The sidebar shows her Pharmacy Counter and Pharmacy Billing, so she assumes she can bill.
**Goal**: Review and bill a waiting prescription as RECEPTION.
**Preconditions**: Logged in as reception@clinic.test / password123. A pending prescription for Kavitha Nair (98853 66778, Jubilee Hills) exists.
**Ideal path**: Not applicable. The UI should either hide these actions from RECEPTION or the backend should allow them. Today the goal cannot be reached.
**Alternate paths**: None that succeed. Inventory → Sales → "Counter sales" is a separate workflow and was not verified for RECEPTION here.

### Steps
1. Sidebar "Pharmacy Counter" → the cockpit loads and the queue shows Kavitha Nair. The queue, stock-check and dispense-task endpoints have no role guard, so everything works so far.
2. Click the card, then "Accept" each line, then "Ready" → all succeed. Riya also clicks "Paid" and "Dispense" by accident. Both save, and the entry moves to "Done" with no invoice or payment (see Defects).
3. Click "Open bill" → Pharmacy Billing. The builder's patient search shows "No patients found" and the doctor select is empty. `/drugs` returns 403, and that failure blanks every list loaded alongside it.
4. The prescription loads, but each card shows "Inventory check failed" (the `/drugs/{id}` lookups 403). The alert reads "Prescription loaded, but some inventory details could not be checked…" with "Retry loading prescription".
5. She tries the queue's "Link item" → the dialog shows a Forbidden error.
6. If items were somehow valid, "Confirm Invoice" returns 403 → toast "Error Confirming Invoice". The pending checkout is kept forever with only "Retry pending checkout" (see STORY-606 Edge Cases).
7. Riya gives up and asks Kavitha to come back after 2 pm.

### Variations
- Riya opens Pharmacy Desk first: metrics read ₹0.00 / 0 because `/pharmacy/dashboard` returns 403 (already known).
- Riya opens Pharmacy Invoices from the Desk: the list shows "No invoices found" (GET `/pharmacy/invoices` is ADMIN/PHARMACIST/DOCTOR only), not a permission message.

### Edge Cases
- NURSE or PATIENT accounts that type `/dashboard/pharmacy?section=counter` can also change dispense status. Middleware checks only the cookie, and the dispense-task API has no role check.
- Receptionist Tour ("Start Tour") walks Riya through the pharmacy desk, counter and billing steps, which reinforces that she should be able to do this.

---

## STORY-610: Doctor sends the patient straight to Pharmacy from the prescription

**Type**: short
**Topic**: pharmacy-counter-billing
**Persona**: Dr. Praneeta Jain (praneeta@clinic.test). It is a small Sunday clinic with no pharmacist on duty, so she bills medicines herself.
**Goal**: Jump from a just-created prescription to a pre-filled pharmacy bill.
**Preconditions**: Doctor login. A visit for Harsha Vardhan (99633 88990, Gachibowli) with three prescribed medicines.
**Ideal path**: 3 steps. Create Prescription, "Yes, go to Pharmacy", Print Preview/Confirm.
**Alternate paths**: "Go to Pharmacy" button beside "Create Prescription" (prefills by visitId and may load the visit's existing prescription). "Yes, go to Pharmacy" in the post-create dialog (prefills by prescriptionId). The patient profile and visit progress tracker show a "Bill" button (prefills by visitId). The doctor's sidebar has no Pharmacy links, so no navigation path exists for her.

### Steps
1. In the visit's Prescription tab click "Create Prescription" → the confirm dialog offers "Stay Here" / "Yes, go to Pharmacy".
2. Click "Yes, go to Pharmacy" → full page load to `/dashboard/pharmacy?patientId=…&prescriptionId=…&doctorId=…`. The page opens on Pharmacy Billing because prefill forces the billing section. No sidebar item is highlighted for her role.
3. The builder loads Harsha and "Dr. Praneeta Jain", then the 3 prescription lines. She confirms the quantity reviews.
4. "Print Preview" → "Confirm & Print" → succeeds (DOCTOR bypasses role checks).

### Variations
- She clicks "Go to Pharmacy" before creating the prescription: the URL carries visitId only. The builder fetches `/visits/{id}` and loads `visit.prescription` if one exists. Otherwise the builder opens with patient and doctor but no items.

### Edge Cases
- Back button: returning to the visit works, but a new Pharmacy visit does not keep the bill. It is a fresh draft keyed to the prescription.

---

## STORY-611: Front desk checks whether a patient's medicines are already billed from the patient profile

**Type**: short
**Topic**: pharmacy-counter-billing
**Persona**: Admin (admin@clinic.test) at the front desk. Lakshmi Reddy's husband asks whether her medicines from this morning were billed.
**Goal**: Confirm billing status from the patient page.
**Preconditions**: Lakshmi's prescription was billed at the pharmacy as PHI-2026-041 (STORY-601/603 flow).
**Ideal path**: 2 steps. Open the patient, read the billing step or open invoices filtered to her.
**Alternate paths**: Pharmacy Invoices → Search "Lakshmi". Inventory → Sales → "Patient invoice history". The PatientProgressTracker "Bill"/"Invoices" button appears on the patient detail page, the appointment scheduler and day calendar, and the Visits page.

### Steps
1. Patients → click Lakshmi Reddy → the patient detail page shows the progress tracker. The billing step is not marked done and the button reads "Bill", not "Invoices".
2. Admin clicks "Bill" → `/dashboard/pharmacy?patientId=…&visitId=…` opens the builder and re-loads the visit's prescription as a new draft bill. This is not the existing invoice.
3. Admin realises this is a new bill. They go to Pharmacy Desk → "Invoices" → Search "Lakshmi" (with Date Range adjusted) and find PHI-2026-041 "Completed".

### Variations
- From Appointments → the appointment tile's progress tracker: same "Bill" button, same behaviour.

### Edge Cases
- The tracker reads the clinic `/billing/invoices` API, which no screen writes to. Pharmacy invoices never flip it to "Invoices", so the path invites double billing (see Defects).

---

## STORY-612: Triage a long Saturday queue: filters, overdue items and the second queue table

**Type**: medium
**Topic**: pharmacy-counter-billing
**Persona**: Suresh, pharmacist. At noon 15 prescriptions are waiting and several are flagged "over 2h". He wants to see everything that is stuck.
**Goal**: Find all exception and overdue prescriptions across the whole queue.
**Preconditions**: 15 open prescriptions: 3 paused, 1 partial, 2 expired, 4 over 2h.
**Ideal path**: 2 steps. Open Counter, choose "Exceptions". This is achievable only if the cockpit pages or loads the full list.
**Alternate paths**: The cockpit Queue column (filters All/Queue/Review/Exceptions/Done, first 8 only). The "Prescription Queue" table directly below it (status filter All/Pending/Partial/Dispensed/Expired, 20 per page, Previous/Next). The same table on Pharmacy Billing (button "Load" instead of "Bill"). The cockpit header "Rx queue" button looks like a third path but does nothing.

### Steps
1. Open "Pharmacy Counter". The header stat reads "Queue 15", but the Queue column lists 8 cards ("15 today or open").
2. Click filter "Exceptions" → 2 cards. The header "Exceptions" stat also reads 2, though 6 exceptions exist. The other 4 are beyond the first 8.
3. Click "Rx queue" in the cockpit header, expecting the full queue → nothing happens.
4. Scroll down to "Prescription Queue" → "Prescription dispensing queue · 1-15 of 15 prescriptions" (default status "Pending").
5. Change status to "Expired" → 2 rows with red "Expired" badges. The cockpit calls these "Paused".
6. Back on status "All", rows with an amber "Over 2h" badge stand out. Click a row's refresh icon ("Refresh stock for …"), which reloads the whole table, not just that row.
7. Click "Bill" on an overdue row → Pharmacy Billing with that prescription loaded. He skips cockpit review entirely, because the table offers no Accept/Pause.

### Variations
- Empty queue: the cockpit shows "No prescriptions waiting" with "Walk-in bill", "Pull visits" (only re-reads the queue; nothing is pulled) and "Inventory control" (lands on Inventory Today because of a dead legacy param). The table shows "No prescriptions in this queue."
- "Daily close" (Pick + Pay) jumps to Pharmacy Desk, where Partner Daily Sync lives. Nothing on the Counter page explains this.

### Edge Cases
- The same queue renders on 3 surfaces (cockpit cards, the Counter table, the Billing table). They use two status vocabularies ("Queued/Review/Bill/Paid/Done/Paused" against "Pending/Partial/Dispensed/Expired") and two page sizes (8 against 20).
- Both workbench headers ("Prescription Queue", "Pharmacy Billing") carry a green pill "Validate before adding stock", although these screens sell stock.

---

## Defects noticed while mapping

Already known, not repeated: (a) RECEPTION nav vs backend 403 on dashboard and invoice create; (b) Counter "Pick N" in doses vs stock in selling units; (c) substitution carries quantity in the old unit. Discovery also already lists the dead `?tab=pharmacy-control` links ("Inventory Control", "Shelf locations", "Inventory control").

1. **Dispense task can be marked Paid/Dispensed with no invoice or payment, by any logged-in role.** The cockpit's "Paid" and "Dispense" buttons are enabled whenever a task is eligible (`frontend/src/components/pharmacy/PharmacyCounterCockpit.tsx:942-957`). The server validates only READY_TO_BILL (`backend/src/modules/pharmacy/pharmacy-prescription-queue.service.ts:422-433`), and a DISPENSED task maps the prescription to DISPENSED (`:924-925`). As a result the prescription leaves the queue with no stock deducted. `PharmacyDispenseTaskController` and the `pull` route have only `JwtAuthGuard`, with no `@Roles`/`@Permissions` (`backend/src/modules/pharmacy/pharmacy-dispense-task.controller.ts:26-29,44-57`; `pharmacy-prescription-queue.controller.ts:94-101`).
2. **Counter "Rx queue" button is a no-op.** The page passes `onOpenQueue={() => undefined}` (`frontend/src/app/dashboard/pharmacy/page.tsx:409`) to the header button (`PharmacyCounterCockpit.tsx:586-594`).
3. **Cockpit stats and filters cover only the first 8 queue entries.** The queue is fetched with `limit: 8` and no paging (`PharmacyCounterCockpit.tsx:246-249`). "Queue" shows the server total (`:569`), while Review/Exceptions/Ready/Paid and the Queue-column filters count only the 8 loaded rows (`:412-425`, `:673-704`).
4. **Manually added drugs ignore the drug's GST rate and default to 18%.** `addDrugToInvoice` hard-codes `taxPercent: 18` (`frontend/src/components/pharmacy/PharmacyInvoiceBuilderFixed.tsx:1022`). Prescription lines and substitutes use `getDrugGstRate` (`:557`, `:989`). The server trusts the client's `taxPercent` (`backend/src/modules/pharmacy/pharmacy-invoice.service.ts:327`), so most medicines (5%) are over-taxed. Packages are also fixed at 18% (`:1057`).
5. **A pending checkout cannot be discarded after a permanent failure.** The attempt is cleared only on 400/404 (`PharmacyInvoiceBuilderFixed.tsx:1361-1365`). A different sale is blocked while it is pending (`:1297-1298`). The banner offers "Start a new invoice" only when the attempt is already confirmed (`:2066-2073`). A 403, or a 500 that keeps failing, locks the builder until the tab is closed.
6. **One failing initial load blanks the patient, doctor, drug and package lists.** `loadInitialData` uses a single `Promise.all` over four endpoints and only logs the error (`PharmacyInvoiceBuilderFixed.tsx:723-729`, `:788-790`). For example, `/drugs` returning 403 empties the patient search and the doctor select.
7. **Checkout never records payment; "Collect payment" does not collect.** Checkout stores `paymentMethod` but leaves `paymentStatus` at its PENDING default (`pharmacy-invoice.service.ts:285-305`; `backend/prisma/schema.prisma:1309`). The Counter's "Collect payment" only opens the builder (`PharmacyCounterCockpit.tsx:1236-1239`). Payment can be recorded only from the Invoices list "Mark as Paid", which the Billing screen does not link to.
8. **Invoice list "Delete" is shown on every row but can never succeed for builder invoices.** The trash icon renders unconditionally (`frontend/src/components/pharmacy/PharmacyInvoiceList.tsx:769-777`). The backend rejects anything that is not DRAFT or that carries a `checkoutRequestKey` (`pharmacy-invoice.service.ts:2165-2166`). The UI then shows a generic "Failed to delete invoice. Please try again." (`PharmacyInvoiceList.tsx:371-373`). No cancel/void action exists.
9. **"Edit Invoice" is dead.** It dispatches `pharmacy-invoice-edit` and scrolls to `[data-pharmacy-invoice-builder]` (`PharmacyInvoiceList.tsx:336-348`), but only the orphaned `PharmacyInvoiceBuilder.tsx:189` listens or has that attribute.
10. **Invoice list stat cards are page-scoped but labelled as totals.** "Total Invoices" is `invoices.length`, and "Total Amount" and "Pending Amount" sum only the current page; "Pending Amount" also ignores PARTIALLY_PAID (`PharmacyInvoiceList.tsx:469-477`, `:491`). The header shows the server total (`:659`).
11. **Invoice list load failures look like "no results".** The catch block only empties the list (`PharmacyInvoiceList.tsx:128-131`), which renders "No invoices found / Try a different search or adjust the filters." (`:668`). A 403 or network failure gets no error or retry.
12. **Unescaped HTML in the list's View/Download print window.** `renderPrintHtml` interpolates `itemName`, patient name/phone/address and `invoice.notes` raw (`PharmacyInvoiceList.tsx:160`, `:272-273`, `:305`) into a same-origin `window.open('')` document (`:319-327`). The builder version escapes these values (`PharmacyInvoiceBuilderFixed.tsx:1475-1481`). Notes are free text from the builder.
13. **Patient progress tracker checks the wrong invoice API.** The tracker calls `apiClient.getInvoices` (`frontend/src/components/patients/PatientProgressTracker.tsx:60`), which reads clinic `/billing/invoices` (`frontend/src/lib/api.ts:540`), not pharmacy invoices. The button therefore always reads "Bill" (`PatientProgressTracker.tsx:212`) and opens a new prefilled bill even after the pharmacy has billed the visit.
14. **Duplicate page titles.** `/dashboard/pharmacy/invoices` renders "Pharmacy Invoices" as an h2 (`frontend/src/app/dashboard/pharmacy/invoices/page.tsx:18`) and again via `PageHeader` (`PharmacyInvoiceList.tsx:482`). Counter renders `PageHeader` "Pharmacy Counter" (`page.tsx:198`) plus the cockpit h3 "Pharmacy Counter" (`PharmacyCounterCockpit.tsx:553-555`). Billing renders `PageHeader` plus WorkbenchHeader "Pharmacy Billing" (`page.tsx:198`, `:454`).
15. **Pharmacy guide copy promises things that don't exist.** It mentions a "Billing & GST tab" and an "insurance" payment mode (`page.tsx:529-530`). The builder offers only Cash/Card/UPI/Net Banking (`PharmacyInvoiceBuilderFixed.tsx:2858-2861`), although the enum has WALLET and INSURANCE (`backend/prisma/schema.prisma:1928-1935`).
