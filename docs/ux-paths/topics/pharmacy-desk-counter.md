# Pharmacy desk, counter & dispensing

> Source of truth: `frontend/src/app/dashboard/pharmacy/pharmacy-workspace.tsx` (Desk + Counter shell),
> `frontend/src/components/pharmacy/PharmacyCounterCockpit.tsx`, `PrescriptionDispensingQueue.tsx`,
> `PrescriptionInventoryLink.tsx`, `DrugManagement.tsx`, `PackageBrowser.tsx`, `PharmacyPackageCreator.tsx`,
> `PartnerDailySync.tsx`, `AgenticPharmacyDock.tsx`, and the Nest controllers/services under
> `backend/src/modules/pharmacy/`. Labels in "quotes" / `code` are the strings in the code.
> Bill building, payment and printing happen on `/dashboard/pharmacy/sales/bill` and are treated as a
> **hand-off** to the pharmacy-sales topic.

**Desk vs Counter in one paragraph.** Both are the same route, `/dashboard/pharmacy`, switched by
`?section=desk|counter` (two separate sidebar items).
*Pharmacy Desk* ("Command center") is the back-office landing page: today's figures (Sales, Invoices, Stock,
Packages), shortcut buttons (`Invoices`, `Drugs`, `Pharmacy Counter`, `New sale`, `Inventory Control`), the
"Pharmacy AI assistant", "Partner Daily Sync" and "Treatment Packages".
*Pharmacy Counter* is the dispensing workstation: a three-column cockpit (Queue → Active Dispense → Pick + Pay)
that records a per-medicine pharmacist review against a persisted *dispense task*, and beneath it a second,
tabular "Prescription Queue" whose row action `Bill` sends the prescription straight into a Sales bill.
Neither surface sells anything itself: every sale ends on the Sales bill page.

---

## STORY-001: Start-of-shift look at the Pharmacy Desk and a jump to the low-stock list

**Type**: short
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Farheen Begum, pharmacist, 9:40 am before the first OPD patients come out
**Goal**: See yesterday-vs-today figures and find out which medicines are running low before the rush
**Preconditions**: Logged in as PHARMACIST; some stock is below its alert level
**Ideal path**: 2 — open the Desk (figures visible), click the "low" figure to open the low-stock list.
**Alternate paths**: Inventory (sidebar) → Today → "Low stock" queue; Inventory → Stock › Stock list → stock-level filter "Low stock"; Dashboard "System Alerts" card; header notification bell (low stock item → `/dashboard/inventory?tab=low-stock`, which also lands on Today); Reports & Analytics alerts strip "Low Stock" (owner/admin/manager only).

### Steps
1. Click sidebar **Pharmacy Desk** → `/dashboard/pharmacy?section=desk` loads ("Loading pharmacy dashboard…" skeleton first). A dark header shows "Pharmacy Desk" with the pill "Command center" and the line "Queue, review, pick, bill, pay, dispense."; four figures `Sales` (₹ today, growth %), `Invoices` (count, "n pending"), `Stock` (count, "9 low"), `Packages` (count, "bundles"); buttons `Quick Guide`, `Refresh`, `Invoices`, `Drugs`; three quick-action tiles `Pharmacy Counter` ("Review and pick"), `New sale` ("Bill a prescription or walk-in"), `Inventory Control` ("Shelves, invoice scanning, expiry"). Below: the "Pharmacy AI assistant" launcher, "Partner Daily Sync" and "Treatment Packages".
2. Reads "Stock 412 · 9 low" and clicks the figure → nothing happens; the four figures are plain text, not links. *(Hesitation: the number invites a click.)*
3. Clicks the quick-action tile **Inventory Control** → browser goes to `/dashboard/inventory?tab=pharmacy-control`. The Inventory workspace does not read `tab`, so it opens on its default **Today** area ("What needs attention") rather than a shelf / scanning / expiry screen.
4. In "What needs attention" clicks the **Low stock** queue row → filtered stock list of low items.
5. Clicks sidebar **Pharmacy Counter** to begin dispensing (or goes back to the Desk and uses the `Pharmacy Counter` tile — both end on `?section=counter`).

### Variations
- **Reception (Riya)**: the Desk shows no figures and no `Refresh` / `Invoices` / `Drugs` / `New sale`; only `Quick Guide`, `Pharmacy Counter` and `Inventory Control` (two tiles). The AI assistant launcher, Partner Daily Sync form and `Create Package` button are still rendered for her (see STORY-009/010 edge cases).
- **Refresh figures**: `Refresh` in the dark header re-fetches `/pharmacy/dashboard` only; Partner Daily Sync has its own `Refresh`, and the package list reloads only after a package is created.
- **Quick Guide**: opens "Pharmacy Management Guide"; its "Inventory Controls" section still says "Use Inventory > Pharmacy Control for Excel import / invoice scanning" — an area that does not exist.
- **Owner**: has no Pharmacy Desk/Counter sidebar entry; can only arrive by typing the URL.

### Edge Cases
- **Figures fail to load**: the error is only logged; all four figures silently show `₹0.00` / `0`, indistinguishable from a real zero day.
- **`?section=billing|invoices|payments` or any `patientId/prescriptionId/doctorId/visitId` in the URL**: the server component redirects to a new Sales bill before the Desk renders (`pharmacyBillingRedirect`).
- **Session expired**: `/auth/me` fails → "Redirecting to login..." → `/login?next=<current pharmacy URL>`.

---

## STORY-002: Dispense a doctor's prescription from the Counter cockpit, start to finish

**Type**: long
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Farheen Begum, pharmacist, 11:15 am, three patients waiting at the hatch
**Goal**: Review, pick and bill Sravani Reddy's acne prescription (3 medicines, all in stock) and see it leave the queue
**Preconditions**: Dr. Anitha Rao created an ACTIVE prescription for Sravani Reddy (P-0412) less than 24 h ago: Isotroin 20 mg cap, Deriva-BPO gel, Photostable Gold SPF 55. All three are linked to inventory with unexpired stock. No pharmacy bill exists for it yet.
**Ideal path**: 6 — open Counter, select the prescription, accept all lines in one action, open the bill, confirm + take payment, done (queue updates itself).
**Alternate paths**:
- "Prescription Queue" table under the cockpit → row `Bill` (skips review entirely — STORY-004).
- Sales (sidebar) → `New sale` → queue at the top of the bill page → row `Load`.
- Pharmacy Desk → `New sale` → same bill-page queue → `Load`.
- Doctor side: prescription builder `Go to Pharmacy` / post-create dialog `Yes, go to Pharmacy`; patient progress tracker `Bill` (all open the same Sales bill prefilled).
- Inside the cockpit the same "open the bill for the active prescription" handler sits behind four buttons: header `Bill`, footer `Open bill`, Pick + Pay `Collect payment` (and `Start billing` / `Walk-in bill` when nothing is active).

### Steps
1. Click sidebar **Pharmacy Counter** → `/dashboard/pharmacy?section=counter`. The page shows the title "Pharmacy Counter" and, directly under it, the cockpit's own dark header also titled "Pharmacy Counter" with badges "Pharmacist review" and "Shelf locations", the line "Queue to pick to bill in one workstation.", four counters `Queue` / `Review` / `Exceptions` / `Ready/Paid`, and buttons `Refresh`, `Rx queue`, `Bill`.
2. Scan the left **Queue** column ("7 today or open", tiles `Queued` and `Exceptions`, filter chips `All` / `Queue` / `Review` / `Exceptions` / `Done`). The cockpit lists only the 8 newest prescriptions (newest first) and has already highlighted the newest pending one — not Sravani.
3. Click header **Rx queue** hoping for the full list → nothing happens (on this page the button's handler is empty). *(Hesitation.)* The full list is the separate "Prescription Queue" table further down the page.
4. Click **Sravani Reddy**'s card ("3 medicines · 38m pending") → the card turns dark; a dispense task is created and moved to review (chip changes from "Queued" to "Review").
5. Middle column **Active Dispense** now reads "0/3 lines reviewed" with a patient strip: "Sravani Reddy", badge "In Review", "Dr. Anitha Rao · {date time} · {prescription id}", and a rail of eight status pills (Queued, In Review, Partially Filled, Paused, Ready to Bill, Paid, Dispensed, Cancelled). A spinner "Checking stock and batch expiry" is replaced by a table: `Prescription` / `Inventory Match` / `Stock` / `Shelf and batch` / `Action`.
6. Read line 1: "Isotroin 20 mg" · "1-0-0" · "30 DAYS"; Inventory Match shows the stocked product and manufacturer; Stock badge "IN STOCK" and "Qty 30"; shelf "Rack B2", batch number, expiry.
7. Click **Accept** on line 1 → pill turns dark, header "1/3 lines reviewed".
8. Click **Accept** on line 2 (Deriva-BPO gel).
9. Click **Accept** on line 3 (sunscreen) → "3/3 lines reviewed"; the server moves the task to Ready to Bill on its own: badge "Ready to Bill", footer text changes from "Review every medicine before billing" to "Ready for billing review", queue chip reads "Bill", header counter `Ready/Paid` goes up, `Ready` button becomes enabled.
10. Look right at **Pick + Pay**: the dark "Scan next" card shows "Isotroin 20 mg — Pick 30 · Rack B2" with `Batch` / `Expiry` / `Stock`. Looks for somewhere to scan the strip's barcode → there is no input; "Scan next" and the six checklist tiles (Validate, Pick earliest-expiry batch, Barcode, GST bill, Payment, Dispense) are read-only indicators. *(Hesitation.)*
11. Read **Pick Assist** ("Shelf, batch, and split-stock view."): per medicine "Pick 30 · 84 available", batch badge, `Location`, `Expiry`, and for the gel "1 alternate batch available if shelf stock is short."
12. Walk to the racks and pick the three items (off-screen).
13. Click **Ready** → the status is saved again as Ready to Bill; nothing visibly changes because step 9 already did it. *(Redundant click the layout invites.)*
14. Click **Open bill** (footer of Active Dispense) → browser leaves the Counter for `/dashboard/pharmacy/sales/bill?patientId=…&prescriptionId=…&doctorId=…`.
15. **Hand-off (pharmacy-sales topic)**: the Sales bill page shows the *same* prescription queue again at the top (row action `Load`) and, scrolled into view, the bill with patient, doctor and the three medicines prefilled from the prescription. Farheen checks quantities, chooses payment mode, `Print Preview` → `Confirm Invoice` / `Confirm & Print`.
16. When the finished bill is closed the page moves to the **Sales** register (`/dashboard/pharmacy/sales`), not back to the Counter; the bill page's only way out is `Back to Sales`. Click sidebar **Pharmacy Counter** again.
17. The cockpit reloads; once the bill counts as posted Sravani's card carries the chip "Done". Click filter chip **Done** to find her; selecting the card shows the badge "Dispensed" with the checklist tiles GST bill / Payment / Dispense ticked.
18. Click filter chip **All** and select the next waiting patient.

### Variations
- **Skip the cockpit review**: scroll to "Prescription Queue" and press `Bill` on the row — no line review is required to bill (STORY-004).
- **Accept directly on the auto-selected prescription**: clicking `Accept` without first clicking the queue card also creates the task; the click on the card is not required.
- **`Paid` button**: sets the task to Paid by hand at any time (the server only refuses a manual *Dispensed*). It does not take money or check that a bill exists, and it sits next to `Ready`, so it is easy to press by mistake. A task marked Paid stays "Paid" in the cockpit even after its bill is posted, while the table below shows the same prescription as "Dispensed".
- **Different entry button**: header `Bill` and Pick + Pay `Collect payment` do exactly what `Open bill` does.
- **Reception**: sees the whole cockpit including `Accept` / `Ready` / `Open bill`; the task endpoints admit RECEPTION, but Sales is not in her sidebar and the server refuses invoice creation for her role (result on the bill page belongs to the pharmacy-sales topic).

### Edge Cases
- **More than 8 open prescriptions**: the cockpit never shows the older ones (no paging, newest first), so the longest-waiting "over 2h" patients can be missing from the workstation built to serve them; they are only reachable in the table below.
- **Prescription older than 24 h with no bill**: chip "Paused" in the cockpit and "Expired" in the table below, although nobody paused it and it can still be reviewed and billed.
- **Prescription inactive or past its validity date**: same "Paused" / "Expired" labels, but the review buttons, `Pause` / `Ready` / `Paid`, header `Bill` and `Open bill` are disabled; `Collect payment` stays clickable and answers with a red banner "This prescription is not active or has expired."
- **Stock check fails**: red banner "Unable to check current stock. Use Refresh to retry."; every line shows the "Checking" badge and "Stock check pending".
- **Doctor edits the prescription mid-review**: saving a line returns an error surfaced as "Unable to save medicine review" (server: "Prescription line changed. Pull the prescription and review its current medicines.").
- **Window regains focus**: the cockpit reloads queue and stock every time the browser tab is focused, briefly replacing the review table with the stock spinner.
- **Queue load fails**: "Unable to load prescription queue", empty columns.
- **Bill saved only as a draft**: the prescription stays Pending/Ready (drafts do not count as dispensed); the strip shows an "Invoice" badge.

---

## STORY-003: One medicine out of stock, one not stocked at all — substitute, mark unavailable, bill the rest

**Type**: medium
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Suresh Goud, pharmacist on the evening shift, 6:50 pm
**Goal**: Dispense what can be dispensed for Mohammed Irfan, give an equivalent for the out-of-stock cream, and record that the shampoo was not available
**Preconditions**: ACTIVE prescription for Mohammed Irfan (P-0388): Doxy-1 L-DR Forte (in stock), Aziderm 10% cream (linked, zero stock), "Ketoconazole 2% shampoo" (typed free-text, not linked to any inventory item). Ezanic 10% cream (same salt) is in stock.
**Ideal path**: 7 — select prescription, accept line 1, choose the substitute product for line 2 (one picker), mark line 3 unavailable with a reason, open bill (carrying those decisions), confirm, done.
**Alternate paths**:
- Skip the cockpit: `Bill` from the "Prescription Queue" table and handle everything on the bill with its stock warnings and `Substitute` button.
- Fix the "not linked" line first with `Link item` in the queue table (STORY-005) instead of marking it NA.
- Park it: `Pause` with reason "Paused for doctor clarification" and call the doctor.

### Steps
1. Sidebar **Pharmacy Counter** → cockpit loads.
2. Click **Mohammed Irfan** in the Queue column → "In Review", "0/3 lines reviewed"; "Checking stock and batch expiry".
3. Read the table: line 2 shows badge "OUT OF STOCK" and an amber chip "Out of stock"; line 3 shows "No inventory match" / "Needs pharmacist action", badge "UNMATCHED", chip "No match", and "Unmapped" / "No batch" / "No expiry" under Shelf and batch. The right column header says "Pick + Pay · 2 exceptions".
4. Click **Accept** on line 1 (Doxy-1 L-DR Forte).
5. Click **Sub** on line 2 expecting a product picker → no dialog opens; the pill simply turns dark and "2/3 lines reviewed". The click has already been saved with whatever the shared reason box below the table held (default "Substitution requested", empty note). *(Hesitation: where do I say what I substituted with?)*
6. Type in the **"Reason or pharmacist note"** box under the table: "Aziderm 10% nil stock — giving Ezanic 10% (same salt), patient agreed".
7. Click **Sub** on line 2 again so the note is actually stored with the line (the note is only sent at the moment a line button or `Pause` is pressed).
8. Change the reason dropdown to **Medicine unavailable**.
9. Replace the note text with "Ketoconazole shampoo not stocked — advised outside purchase" (the box is shared by all lines; leaving the old text would attach the Ezanic note to the shampoo line).
10. Click **NA** on line 3 → "3/3 lines reviewed", but the badge becomes "Partially Filled", the queue chip "Partial", header `Exceptions` +1; the footer still says "Review every medicine before billing" and `Ready` stays disabled, because an unavailable line blocks "ready". *(Confusing: everything is reviewed, yet it says review every medicine.)*
11. Click **Open bill** (still enabled) → Sales bill for Mohammed Irfan.
12. **Hand-off (pharmacy-sales topic)**: the bill is filled from the *prescription*, not from the cockpit review — all three original lines arrive, Aziderm with an out-of-stock warning and the shampoo with no match. Suresh repeats the decisions there: `Substitute` on the Aziderm line (pick Ezanic 10%), remove the shampoo line, then confirm and take payment.
13. Sidebar **Pharmacy Counter** → find Mohammed Irfan's card again: it reads "Partial" (under the `Exceptions` chip) while the bill is confirmed but not completed, and "Done" once the bill counts as completed — a completed bill marks the whole prescription Dispensed even though the shampoo was never supplied (`pharmacy-prescription-queue-query.ts`; which bill status checkout produces belongs to the pharmacy-sales topic).

### Variations
- **Pause for the doctor**: set the dropdown to "Paused for doctor clarification", type a note, click `Pause` → badge "Paused" (amber on the rail, red chip in the queue). There is no Resume button: pressing any line button (`Accept` etc.) recomputes the status, or `Ready` when every line is acceptable.
- **Quantity change**: `Edit` flags the line as edited with the reason/note only; there is no quantity field in the cockpit although the API accepts one. The real quantity change is made on the bill.
- **Cancel at counter**: the dropdown offers "Cancelled at counter" and the rail has a "Cancelled" pill, but no cockpit button sets a task to Cancelled.
- **Unmapped shelf**: line shows "Unmapped" → click `Shelf locations` (Pick + Pay) → `/dashboard/inventory?tab=pharmacy-control&section=shelf` → Inventory opens on **Today**; the actual route is Stock › Stock list → select batches → "Set location for N selected batches".

### Edge Cases
- **Reason captured wrongly**: pressing `NA` without touching the dropdown records "Substitution requested" as the reason for an unavailable line; nothing on screen shows which reason/note a line was saved with.
- **`Ready` with an NA line**: disabled client-side; if forced, the server answers "Review every available medicine before marking ready for billing. Unavailable medicines must be resolved first."
- **Substitute not carried over**: nothing chosen in the cockpit reaches the bill (only `PharmacyCounterCockpit.tsx` talks to the dispense-task API), so a hurried pharmacist can confirm the original out-of-stock line or forget the substitution.
- **Two saves at once**: line buttons are ignored while a save is in flight (whole table is disabled) — a quick second click is silently dropped.
- **Disappears from the default list below**: marking a line `NA` moves the prescription to "Partial" in the "Prescription Queue" table (and `Pause` moves it to "Expired"), so it leaves that table's default `Pending` view although nothing has been dispensed yet.
- **Near-expiry / expired batch**: chips "Near expiry" or "Expired batch blocked" appear (max two chips per line are shown).

---

## STORY-004: Bill a prescription straight from the "Prescription Queue" table

**Type**: short
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Farheen Begum, pharmacist, lunchtime lull, one simple one-item prescription
**Goal**: Get Lakshmi Narayana's single-medicine prescription onto a bill without the cockpit ceremony
**Preconditions**: Pending prescription for Lakshmi Narayana (Levocet 5 mg × 10), linked and in stock
**Ideal path**: 2 — open Counter, press `Bill` on the row.
**Alternate paths**: cockpit card → `Open bill` / header `Bill` / `Collect payment`; Sales → `New sale` → queue row `Load`; Desk → `New sale` → `Load`; doctor's `Go to Pharmacy`.

### Steps
1. Sidebar **Pharmacy Counter** → scroll past the cockpit to the white strip "Prescription Queue — Review visit prescriptions and send approved medicines into a Sales bill." (with a green pill "Validate before adding stock") and the card "Prescription dispensing queue — 1-6 of 6 prescriptions". The status select defaults to **Pending**.
2. Find the row "Lakshmi Narayana · P-0391 · 12m pending": Doctor + time, Medication "Levocet 5 mg 0/10", Status "Pending", Stock "In stock · Levocet 5 mg (40 strips) · Change link".
3. Click **Bill** on the row → `/dashboard/pharmacy/sales/bill?patientId=…&prescriptionId=…&doctorId=…&visitId=…`.
4. **Hand-off**: bill prefilled; confirm and collect payment on the Sales bill.

### Variations
- **History**: switch the status select to `Dispensed`, `Partial`, `Expired` or `All`; paging is 20 per page with `Previous` / `Next`.
- **Refresh**: the circular-arrow icon in the card header reloads the list; the per-row refresh icon ("Refresh stock for {patient}") reloads the whole list as well.
- **Same table on the bill page**: there the row action is labelled `Load` instead of `Bill`.

### Edge Cases
- **Expired / inactive prescription**: row stays visible as history; `Bill` is disabled and no `Link item` links are offered.
- **Over two hours waiting**: amber badge "Over 2h" under the status.
- **Stock check fails for a row**: "Stock check failed. Refresh to retry." in the Stock cell.
- **Empty filter**: "No prescriptions in this queue. Choose another status to view other prescriptions."
- **Review state shown under other names**: the table knows only Pending / Partial / Dispensed / Expired — a prescription a colleague paused "for doctor clarification" in the cockpit is listed as "Expired" (so it is missing from the default Pending view), its reason is not shown, and its `Bill` button is still active.

---

## STORY-005: Link a prescribed medicine to the right inventory item

**Type**: medium
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Suresh Goud, pharmacist, tidying up "Not linked" lines between patients
**Goal**: Teach the system that the doctor's "Ketoconazole 2% shampoo" is the stocked "Nizral 2% Shampoo 100 ml" so stock shows correctly now and for future patients
**Preconditions**: A pending prescription (Pooja Menon, P-0001) has a line whose Stock cell shows "Not linked"; Nizral 2% Shampoo exists in inventory with stock; user has pharmacy invoice-create permission (pharmacist/doctor/admin)
**Ideal path**: 3 — click `Link item`, pick the suggested product, confirm.
**Alternate paths**: none found for creating the remembered link (the cockpit shows "No inventory match" but offers no link action). On a bill, `Substitute` fixes one bill only.

### Steps
1. Sidebar **Pharmacy Counter** → scroll to "Prescription dispensing queue".
2. In Pooja Menon's row, Stock column: badge "Not linked", text "Ketoconazole 2% shampoo (—)", link **Link item**.
3. Click **Link item** → dialog "Link Ketoconazole 2% shampoo": "Choose the exact product, strength and stock unit. This choice will be remembered for the same medicine across patients." The field "Search clinic inventory" is prefilled with the prescribed name; "Searching inventory…" then "No inventory candidates. Try another spelling or add the product in Inventory."
4. Clear the field and type `Nizral` → after a short pause a radio list appears: "**Nizral 2% Shampoo** — Janssen · bottle of 100 ml · 6 bottle available".
5. Select the radio button for Nizral 2% Shampoo.
6. Click **Confirm and remember match** ("Saving…") → dialog closes, the table reloads, the cell now reads "In stock · Nizral 2% Shampoo (6 bottle) · Change link".
7. Scroll up to the cockpit: the same line there still says "No inventory match" until **Refresh** is clicked (or the browser tab loses and regains focus) — the link does not notify the cockpit.

### Variations
- **Wrong match made earlier**: the link reads `Change link`; same dialog, same steps.
- **Product genuinely not stocked**: the dialog can only say "…or add the product in Inventory" (no link). The pharmacist closes it, opens Inventory → Stock › Stock list → `Add batch` (approval flow for non-doctors), then returns and repeats steps 2–6.

### Edge Cases
- **Prescription edited meanwhile**: "Prescription changed. Refresh before linking inventory." stays in the dialog.
- **Ambiguous inventory item**: "This inventory item has multiple product links. Review duplicate products first." or "Review inactive or invalid product links in Inventory first".
- **Search failure**: "Unable to search inventory. Try again."
- **Reception without the grant**: the `Link item` link is shown, but search/save are refused by permission checks (message from the server, or "Unable to remember match").
- **Typing after selecting**: editing the search text clears the selection, disabling the confirm button again.

---

## STORY-006: A walk-in customer at the counter — getting to a Sales bill

**Type**: short
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Farheen Begum, pharmacist; Karthik Rao walks up asking for a sunscreen refill, no prescription today
**Goal**: Start a bill that is not tied to any queued prescription
**Preconditions**: On the Pharmacy Counter with five prescriptions waiting in the queue; Karthik Rao is a registered patient
**Ideal path**: 1 — a `Walk-in bill` button on the Counter that opens an empty bill.
**Alternate paths**: Pharmacy Desk → `New sale`; Sales → `New sale`; cockpit `Walk-in bill` / `Start billing` (only when the queue is empty); legacy `/dashboard/billing` or `/dashboard/pharmacy?section=billing` (redirects); Inventory → Sales → `Counter sales` (a different document type that also sells stock).

### Steps
1. On the Counter, look for "Walk-in bill" → not there: that button exists only in the Queue column's empty state ("No prescriptions waiting": `Walk-in bill`, `Pull visits`, `Inventory control`). With a non-empty queue the header `Bill`, `Open bill` and `Collect payment` all open the bill **for whichever prescription is currently highlighted**. *(Mistake risk: pressing header `Bill` starts a bill prefilled with another patient.)*
2. Click sidebar **Sales** → Sales register.
3. Click **New sale** → `/dashboard/pharmacy/sales/bill` with nothing prefilled.
4. **Hand-off (pharmacy-sales topic)**: the page shows the prescription queue again on top and the empty bill beneath ("Patient & Doctor Details", "Add Items to Invoice" …). `Patient *` is mandatory ("Search patients by name or phone..."), so a walk-in must be a registered patient.

### Variations
- **Via the Desk**: sidebar Pharmacy Desk → tile `New sale` ("Bill a prescription or walk-in") — also two clicks.
- **Empty queue**: `Walk-in bill` (Queue column) or `Start billing` ("No active prescription" panel) open the empty bill in one click.
- **Unregistered customer**: pharmacists have no Patients entry in the sidebar; the bill cannot be saved without a patient (pharmacy-sales topic / Inventory `Counter sales` covers the rest).

### Edge Cases
- **Reception**: has neither `New sale` on the Desk nor Sales in the sidebar, yet the cockpit's `Bill` / `Walk-in bill` buttons still navigate her to the Sales bill route.
- **Came back with browser Back**: returns to the Counter with the previously highlighted prescription reselected by the "first pending" rule, not necessarily the one she was on.

---

## STORY-007: Create a treatment package and check it in the browser

**Type**: medium
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Dr. Anitha Rao, dermatologist, setting up a kit she prescribes every day
**Goal**: Bundle an "Acne Starter Kit" at a fixed price so the pharmacy can add it to bills in one go
**Preconditions**: Logged in as DOCTOR; Deriva-BPO Gel (₹480) and Clindac A Gel (₹260) exist in the drug database
**Ideal path**: 7 — open dialog, name, price, add drug, add drug, create (dialog closes and the new card is shown).
**Alternate paths**: none found for creating (the fuller `PharmacyPackageManager` component is not mounted). Packages are *used* from the Sales bill → "Add Items to Invoice" → tab `Treatment Packages` (same `PackageBrowser` with `Add to Invoice`).

### Steps
1. Sidebar **Pharmacy Desk** → scroll to the card "Treatment Packages — Browse and select from pre-built dermatology treatment packages".
2. Click **Create Package** → dialog "Create Treatment Package".
3. `Name`: type "Acne Starter Kit – 8 weeks".
4. `Package Price (₹)`: type `650`.
5. `Duration (optional)`: type "8 weeks". Leaves `Category` on "Dermatology" and `Subcategory (optional)` empty.
6. In "Add drugs" type `deriva` → results list after a pause ("₹480 • Galderma • tube of 15 gm").
7. Click **Add** on Deriva-BPO Gel (double-clicking the row also works) → an item row appears with `Qty`, `Dosage`, `Pattern`, `Frequency`, `Duration`.
8. Type `clindac` and click **Add** on Clindac A Gel.
9. On the Deriva row choose `Pattern` **0-0-1** → `Frequency` fills itself.
10. Check the read-only "Original price (auto)" 740.00 and "Computed discount %" 12.16.
11. Click **Create Package** ("Creating…") → toast "Package created — Acne Starter Kit – 8 weeks created successfully."; behind the dialog the list reloads and the Desk `Packages` figure refreshes. The dialog stays open with every field still filled. *(Hesitation: did it save? Pressing `Create Package` again would create a duplicate.)*
12. Close the dialog with the ✕ (or `Cancel`).
13. In "Search Treatment Packages" type `acne` → card shows "Private" badge, ₹740.00 struck through, ₹650.00, "12.2% OFF", "2 items", "8 weeks", "Dr. Anitha Rao".
14. Click **View Details** → dialog titled with the package name: Package Details, Pricing (Original / Package / Discount / Savings), Package Contents, Created By. Close it.

### Variations
- **Pharmacist creates it**: same steps; the card and details still print "Dr. {name}" in front of the creator.
- **Manual discount**: typing a value in `Discount % (optional)` stores that number instead of the computed one, so the "% OFF" badge can disagree with the two prices shown beside it.

### Edge Cases
- **Private by default, no switch**: the creator has no "public" control, so every package made here is saved private and is listed only for its creator — the pharmacist will not find Dr. Rao's kit on the Desk or in the bill's `Treatment Packages` tab.
- **Subcategory free text**: the field accepts anything (placeholder "e.g. Acne Treatment") but the server accepts only ten fixed values (Acne Treatment, Anti-aging, Hair Care, Pigmentation, Eczema/Psoriasis, Fungal Infections, Wound Care, Moisturizing, Sun Protection, Post-procedure Care); "Acne" → toast "Failed to create".
- **Category "General"**: saves, but the Desk browser only requests `category: Dermatology`, so the new package never appears.
- **Missing details**: `Create Package` is disabled until name (3+ chars), price > 0 and one drug are present.
- **Usage instructions**: the details dialog can show "Usage Instructions", but the create form has no field for them.
- **Load failure**: toast "Failed to load pharmacy packages. Make sure the backend server is running." and the empty state "No packages available" with `Retry Loading`.
- **Reception**: sees `Create Package`, but the drug search is refused for her role, so no results ever appear and the package cannot be completed.
- **No edit or delete** of a package anywhere in the mounted UI.

---

## STORY-008: Add a new medicine to the drug database, then correct and remove an entry

**Type**: medium
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Farheen Begum, pharmacist; a new sunscreen arrived that doctors want to prescribe by name
**Goal**: Add "Photostable Gold SPF 55 Gel", fix a typo in its pack size, and delete a duplicate entry
**Preconditions**: Logged in as PHARMACIST (or ADMIN); on the Pharmacy Desk
**Ideal path**: 11 — open the drug page, `Add New Drug`, eight field entries (seven required fields + price), save. The typo fix and the delete add 3 + 2.
**Alternate paths**: prescription builder `+ Add to Drug Database` ("Add Drug to Database" → `Save & Add`); Inventory → Stock list → `Add batch` ("Add Inventory Item", approval flow); posting a purchase bill creates products implicitly; opening-stock Excel import; AI assistant proposal "Add medicine" (STORY-010).

### Steps
1. On the Pharmacy Desk click **Drugs** (dark header) → `/dashboard/pharmacy/drugs`. The page shows `Back`, the heading "Drug Management", and under it a second heading "Drug Database — Manage your pharmacy's drug inventory" with `Add New Drug`; tiles Total Drugs / Categories / Manufacturers / Active Drugs; a filter card (Search Drugs, Category, Manufacturer, `Clear Filters`); list "Drugs (n)".
2. Type `photostable` in "Search by name, composition..." → list filters on every keystroke; "No drugs found — Adjust your search or add a drug to the database."
3. Click **Add New Drug** → dialog "Add New Drug".
4. `Drug Name *`: "Photostable Gold SPF 55 Gel".
5. `Price (₹) *`: `845`.
6. `Manufacturer *`: "Sun Pharma".
7. `Pack Size *`: "tube of 50 gm".
8. `Primary Composition *`: "Octinoxate + Avobenzone + Oxybenzone".
9. `Category *`: "Sunscreen".
10. `Dosage Form *`: "Gel".
11. `Strength *`: "SPF 55".
12. Click **Add Drug** → dialog closes, list reloads with the new card (name, category badge, Manufacturer, Pack Size, Composition, Strength, Price ₹845.00, Form).
13. Notices she typed "50 gm" but the tube is 60 g: click the **pencil icon** on the card (icon only, no label) → dialog "Edit Drug" prefilled.
14. Change `Pack Size` to "tube of 60 gm" and click **Update Drug** → list reloads.
15. Clear the search, type `photostabl gold` and spot an older duplicate; click its **bin icon** → browser confirm "Are you sure you want to delete this drug?" → OK → list reloads.
16. Click **Back** → returns to `/dashboard/pharmacy` (the Desk).

### Variations
- **Filter instead of search**: Category / Manufacturer selects (manufacturer list is cut to the first 50 names); `Clear Filters` resets all three.
- **Cosmetic / consumable item being edited**: Manufacturer, Primary Composition, Dosage Form and Strength switch to "(optional)".
- **Doctor**: can open the page and add; update and delete are limited server-side to admin/pharmacist role lists (doctors pass role lists by policy).

### Edge Cases
- **Missing required field**: native `alert()` "Please fill required product master fields: Manufacturer, Strength"; the dialog stays open.
- **Price left blank**: marked `*` but not validated — saved as ₹0.00.
- **Drug already used on a bill**: delete does not remove it; the server marks it inactive and the card gains an "Inactive" badge (no message tells the user this happened).
- **Delete fails**: native alert "Failed to delete drug. Please try again."
- **Edit wipes optional fields**: the edit dialog always opens with `Barcode` and `Description` empty, whatever was saved before (server handling of the blank values unverified).
- **Search while on page 3**: the page number is not reset by typing, so a search with fewer results can show an empty list until `Clear Filters`.
- **"Active Drugs" tile** counts only the 20 cards on the current page.
- **No stock here**: despite "drug inventory" in the subtitle, quantities, batches and expiry live in Inventory; nothing links there from this page.
- **Reception**: the `Drugs` button is hidden on her Desk, and the API refuses her role.

---

## STORY-009: Enter a partner pharmacy's daily sales, commit stock and resolve an unmatched batch

**Type**: long
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Suresh Goud, pharmacist, 9:15 pm, closing the day
**Goal**: Record what the partner outlet "Glow Derma Studio, Kondapur" sold from Linaé stock today, deduct it from inventory, and sort out one line whose batch number was written wrongly
**Preconditions**: Logged in as PHARMACIST; the partner sold 6 × Tugain 5% solution (batch TG5A24) and 4 × Momate cream (written as batch "MM0912", real batch MM0921); both products are in clinic stock
**Ideal path**: 12 — open the panel, pick the partner from the missing list, two lines (medicine + batch + qty = 6 entries), one submit-and-commit action, then pick the right batch, give a reason and retry (3).
**Alternate paths**: cockpit `Daily close` (Pick + Pay column) opens the Desk — the only link to this panel besides the sidebar. No CSV upload UI is mounted (the API accepts a `CSV` source). No other way to deduct partner sales was found.

### Steps
1. From the Counter click **Daily close** (bottom of Pick + Pay) → lands on the top of the **Pharmacy Desk**; scroll down to "Partner Daily Sync" (tiles Partners / Submitted Today / Missing / Net Sales, cards "Manual Daily Entry", "Missing Entries", "Recent Submissions").
2. Check "Missing Entries — Organizations without a sale for {date}": "Glow Derma Studio, Kondapur · Cutoff 22:00 · Pending".
3. In "Manual Daily Entry" leave `Date` on today, leave `Organization ID` ("Optional") blank.
4. `Organization Name` ("Required without ID"): type "Glow Derma Studio, Kondapur" exactly as it appears under Missing Entries (it is free text, not a picker).
5. `Submitted By` ("Optional"): "Naveen".
6. Row 1 `Medicine`: "Tugain 5% Solution".
7. Row 1 `Batch`: "TG5A24".
8. Row 1 `Qty`: `6`.
9. Row 1 `MRP`: `890`; leave `Discount` 0 and `Payment` on the default "UPI".
10. Click **Add Item** → second row.
11. Row 2: `Medicine` "Momate Cream 15 g", `Batch` "MM0912", `Qty` `4`, `MRP` `215`, `Payment` → **Cash**.
12. Check "Form total ₹6,200.00" and click **Submit** → toast "Partner sale submitted"; the item rows reset to one blank row (organisation fields stay); the partner disappears from Missing Entries; "Recent Submissions" gains a row: Partner, Date, Status "SUBMITTED", Qty 10, Net ₹6,200.00, Flags "Clear", button **Commit**.
13. Click **Commit** → spinner; toast "4 units still outstanding — Match unresolved products or receive stock, then retry outstanding quantities."; status "PARTIAL STOCK COMMITTED", flag "Discrepancy", button now **Retry outstanding**.
14. A grey box appears under the table: "Glow Derma Studio, Kondapur · 4 units outstanding" with **Resolve outstanding**. Click it → explanation "Already committed quantities stay unchanged. Correct the product lookup, choose the stocked batch and enter a reason. Matching does not deduct stock." and a card "Momate Cream 15 g · batch MM0912 — 0 committed · 4 outstanding" with the discrepancy reason.
15. In "Corrected product name or batch" (prefilled with the medicine name) click **Search batches** → select list "Choose the actual product and batch".
16. Choose "Momate Cream 15 g · batch MM0921 · 22 TUBE available · expires 31 Aug 2027".
17. `Reason for correcting the match`: "Partner wrote batch MM0912; physical stock is MM0921".
18. Click **Save match** → "Match saved. Use Retry outstanding to deduct only the remaining quantities." and "A batch is selected for the outstanding quantity. Retry outstanding when stock is available."
19. Click **Retry these outstanding units** (or the row's `Retry outstanding` — same action) → toast "All sale quantities committed"; status "STOCK COMMITTED"; the row button reads "Committed" (disabled) and the grey box disappears.
20. Click the panel's **Refresh** and confirm the tiles (Submitted Today, Net Sales) moved.

### Variations
- **Back-dated entry**: change `Date` → Missing Entries and Recent Submissions follow the chosen date; the four tiles keep showing *today's* summary.
- **Entry after the cut-off hour**: the submission is flagged "Late".
- **Nothing to fix**: `Commit` → "All sale quantities committed" in one click.
- **Close the correction panel**: `Close corrections` (the same button toggles).

### Edge Cases
- **Second submission for the same partner and date**: refused — "A partner daily sale already exists for this organization and date" (toast "Submission failed" + red "Partner sync error" banner). All of a partner's lines must go in one submission; there is no edit or cancel control.
- **Typo in Organization Name**: a new partner organisation is created from the typed text, and the real one stays in Missing Entries.
- **Validation**: "Partner organization required"; "At least one item is required" (rows lacking medicine, batch or a positive quantity are silently dropped rather than flagged).
- **No matching batch**: "No stocked batch matches this search. Add or correct the product in Inventory, receive its stock, then search again. The submitted sale stays saved." (text only, no link to Inventory).
- **Uncertain commit**: "Check the stock outcome — The stock outcome was not confirmed. Refresh the submission and review its quantities before retrying."; stale version → "Partner sale changed. Refresh before retrying outstanding stock."
- **Reception / manager**: the whole form is shown, but the server treats them as partner users — submit fails with "Partner users must have metadata.partnerOrganizationId to submit sales", and corrections with "Only branch pharmacy staff can correct inventory matches".
- **Before 5:30 am IST** the default date is yesterday's (the default is taken from the UTC date).
- **`Daily close` naming**: nothing on the Desk is called "Daily close"; the cash close-out is "Daily Collection" (a different sidebar item).

---

## STORY-010: Ask the Pharmacy AI assistant a stock question, attach a file and review a proposed change

**Type**: medium
**Topic**: Pharmacy desk, counter & dispensing
**Persona**: Farheen Begum, pharmacist, quiet afternoon, wants a quick answer without building a report
**Goal**: Find which acne medicines expire in the next 60 days, then let the assistant add a missing medicine from a supplier price list and approve the change
**Preconditions**: Logged in as PHARMACIST (admin and doctor also qualify; managers are admitted by the API but have no Pharmacy Desk in their sidebar); the assistant backend (Codex CLI) is configured; a supplier price list `derma-pricelist-nov.xlsx` is on her computer
**Ideal path**: 5 — open assistant, type question + send, attach file + ask, `Apply` the proposal.
**Alternate paths**: for the question — Pharmacy Report › Expiring Stock, Inventory › Today "Expiring in the next 3 months", Stock list expiry filter. For the change — Drug database `Add New Drug` (STORY-008). No other entry point to the assistant exists (Desk only; not on the Counter).

### Steps
1. Sidebar **Pharmacy Desk** → under the dark header, the strip "Pharmacy AI assistant — Opens when needed." Click **Open AI Assistant** → "Loading pharmacy assistant…" then a three-pane panel: `Chats` rail (sections "Active", collapsible "History"), the conversation, and `Proposals` ("No pending updates."). Header badge "Checking" → "Assistant ready"; buttons `Archive` (disabled while the chat is empty) and `New chat`.
2. Read the empty-state hint "Ask about stock, billing, purchase invoices, ledger, compliance, or attach a pharmacy file."
3. Type in the box ("Ask the pharmacy assistant about pharmacy operations. Enter sends, Shift+Enter adds a line."): "Which acne medicines expire in the next 60 days? Show as a chart." and press **Enter** → her message appears on the right; "Codex is working" spinner.
4. The reply arrives as text with an inline bar chart (and, for report-type answers, a blue "Report" box of raw data).
5. Click the **upload (arrow) icon** left of the box → file picker (xlsx, xls, csv, images, PDF) → choose `derma-pricelist-nov.xlsx` → toast "Attachment ready"; a chip with the file name appears above the box (clicking the chip removes it from the next message).
6. Type "Add Acnestar gel from this list to our medicines if it is missing" and press **Enter**.
7. The reply explains the suggestion and a card appears in `Proposals` (badge count 1; header badge "1 pending"): title, summary, risk badge ("Low risk"), action row "Add medicine · Medicine", shield line "Permission to add medicines", collapsible "Technical details".
8. Expand **Technical details** to check what will be written, then click **Apply** → toast "Proposal applied"; the card badge becomes "Applied"; the Desk figures refresh.
9. Click **Archive** in the assistant header → toast "Chat archived"; the chat moves under `History` (opened automatically) and a fresh chat starts.
10. Later: click the archived chat under History → amber notice "This thread is in history. Restore it to continue the conversation." with the input disabled → **Restore** → toast "Chat restored".

### Variations
- **Reject**: `Reject` on the card → toast "Proposal rejected"; badge "Rejected" (the reason sent is fixed: "Rejected from Pharmacy Desk").
- **Several chats**: `New chat` starts another; each rail item shows the last message, a pending-proposal count and its own `Archive`.
- **Narrow screen**: the Proposals pane is hidden; proposal cards are listed inside the conversation instead.

### Edge Cases
- **Assistant not configured**: badge "Assistant unavailable"; messages can still be typed and the error text comes back as an assistant bubble.
- **Reception**: the launcher is shown on her Desk, but the assistant API excludes her role → toast "Agent unavailable" and badge "Assistant unavailable".
- **Apply without the needed permission / stale proposal**: toast "Apply failed" with the server message.
- **Upload fails**: toast "Upload failed"; only one file can be picked at a time.
- **No way to close the panel**: once opened it stays expanded on the Desk until the page is left; reopening the Desk shows the launcher strip again.
- **Applied changes are real writes** (medicines, stock items, stock corrections, purchase-invoice drafts/stock) made from a chat on a page whose other stock edits normally go through a doctor approval queue.

---

## Redundancy notes

### 1. Duplicate paths

| Goal | Routes found | Files |
|---|---|---|
| Open the Sales bill for the active prescription | Counter cockpit header `Bill`; Active Dispense footer `Open bill`; Pick + Pay `Collect payment`; (no active item) `Start billing`; (empty queue) `Walk-in bill` — **five labels, one handler** (`openActiveBilling`); plus table row `Bill` below; plus `Load` on the bill page; plus Desk `New sale` | `PharmacyCounterCockpit.tsx` (l. 405–411, 595, 746, 950, 961, 1228), `PrescriptionDispensingQueue.tsx`, `pharmacy-workspace.tsx`, `app/dashboard/pharmacy/sales/bill/page.tsx` |
| See the prescription queue | Cockpit "Queue" column (8 newest, lane chips); "Prescription Queue" table directly under it (20/page, status select); the same table on every new Sales bill | `pharmacy-workspace.tsx` `PharmacyCounterPanel`, `sales/bill/page.tsx` |
| Refresh the queue / stock | Cockpit `Refresh`; empty-state `Pull visits` (same function); table header refresh icon; per-row refresh icon (reloads the whole table); automatic reload on window focus; Desk `Refresh` and Partner Daily Sync `Refresh` are separate again | `PharmacyCounterCockpit.tsx`, `PrescriptionDispensingQueue.tsx`, `PartnerDailySync.tsx` |
| Go to Inventory | Desk tile `Inventory Control` (`?tab=pharmacy-control`); cockpit empty-state `Inventory control` and Pick + Pay `Shelf locations` (`?tab=pharmacy-control&section=shelf`) — **all three land on Inventory › Today** because `tab`/`section` are not read | `pharmacy-workspace.tsx` l. 180, 190 |
| Handle a substitution | Cockpit `Sub` (flag + shared reason only) **and again** `Substitute` on the bill line; the cockpit decision is never read by the bill | `PharmacyCounterCockpit.tsx`, `PharmacyInvoiceBuilderFixed.tsx` |
| Mark "ready" | Automatic when the last line is accepted (server `nextStatusAfterLineReview`) and the manual `Ready` button | `pharmacy-prescription-queue.service.ts` l. 996–1029 |
| Retry partner stock | Row button `Retry outstanding` and panel button `Retry these outstanding units` (same `commitStock`) | `PartnerDailySync.tsx` |
| Add a medicine | Drug database `Add New Drug`; prescription builder `+ Add to Drug Database`; Inventory `Add batch`; AI assistant proposal "Add medicine" | `DrugManagement.tsx`, `AgenticPharmacyDock.tsx` |
| Reach Desk ⇄ Counter | Two sidebar items; Desk tile `Pharmacy Counter`; cockpit `Daily close` (→ Desk); `Back` on Drugs and Invoices pages (→ Desk) | `sidebar.tsx`, `pharmacy-workspace.tsx`, `drugs/page.tsx`, `invoices/page.tsx` |

**Every out-link from this topic** (for the walker):
- → Sales bill `/dashboard/pharmacy/sales/bill`: Desk `New sale` (no prefill); cockpit `Bill`, `Open bill`, `Collect payment`, `Start billing`, `Walk-in bill` (patient + doctor + prescription of the active entry, or none); queue table `Bill` (adds `visitId`).
- → `/dashboard/pharmacy/invoices`: Desk `Invoices`. → `/dashboard/pharmacy/drugs`: Desk `Drugs`.
- → Inventory: Desk `Inventory Control`; cockpit `Inventory control`; cockpit `Shelf locations`.
- Text that sends the user to Inventory with **no link**: link dialog "…or add the product in Inventory."; partner recovery "Add or correct the product in Inventory, receive its stock, then search again."; Quick Guide "Use Inventory > Pharmacy Control…".
- Dead control: cockpit `Rx queue` (`onOpenQueue={() => undefined}` in `pharmacy-workspace.tsx` l. 379).
- No return link: the Sales bill offers only `Back to Sales`; after a confirmed bill the user lands on the Sales register and must use the sidebar to get back to the Counter.

### 2. Duplicate information

- **Stock for the active prescription appears four times on the Counter page**: review table (`Stock` + `Shelf and batch`), "Scan next" card, "Pick Assist" list, and the `Stock` column of the table below (which fires one more stock-check per visible row).
- **Batch / expiry / shelf** repeat in the review row, Scan next and Pick Assist.
- **Page title twice**: "Pharmacy Counter" page header + cockpit heading "Pharmacy Counter"; "Drug Management" + "Drug Database" on the drugs page; "Prescription Queue" strip + "Prescription dispensing queue" card title.
- **Queue size** shown as header `Queue`, column text "N today or open", and table "x-y of N prescriptions" (the table's N differs because it defaults to Pending).
- **Exceptions** shown as header counter, Queue tile and "Pick + Pay · n exceptions" — the last is a different number (stock problems on the active prescription, not exception prescriptions).
- **Lifecycle** shown as the badge, the 8-pill rail, the queue chip and the six checklist tiles.
- **Packages count** in the Desk figure and implicitly in the browser; **sales totals** per discovery (Desk, Sales register footer, invoice list, Daily Collection).

### 3. Naming drift

- **Status vocabulary for one prescription**: table `Pending / Partial / Dispensed / Expired`; cockpit chip `Queued / Review / Partial / Paused / Bill / Paid / Done / Cancelled`; rail `Queued / In Review / Partially Filled / Paused / Ready to Bill / Paid / Dispensed / Cancelled`; lane chips `Queue / Review / Exceptions / Done`. "Expired" (table) = "Paused" (cockpit); "Dispensed" = "Done"; the chip for Ready-to-Bill is "Bill", the same word as the button. (`PharmacyCounterCockpit.tsx` l. 1323–1361, `PrescriptionDispensingQueue.tsx` l. 111–117)
- **Stock state**: cockpit `IN STOCK / LOW STOCK / OUT OF STOCK / UNMATCHED` + "No inventory match" + chip "No match"; table `In stock / Low / Out / Not linked`.
- **Linking**: visible `Link item` / `Change link`, aria "Link inventory", dialog "Link {name}", button "Confirm and remember match", cockpit column "Inventory Match".
- **Unavailable**: button `NA`, reason "Medicine unavailable", status "Partially Filled", API `UNAVAILABLE`. **Substitute**: `Sub` (cockpit) vs `Substitute` (bill).
- **Queue**: "Queue", "Rx queue", "Prescription Queue", "Prescription dispensing queue", "Pull visits".
- **Bill / Invoice / Sale**: Desk figure and button "Invoices", tile "New sale", cockpit "Bill" / "Open bill" / "Collect payment" / tile "GST bill — Invoice ready" / badge "Invoice".
- **Desk**: "Pharmacy Desk", pill "Command center", loader "Loading pharmacy dashboard…", guide "Pharmacy Management Guide".
- **Drugs**: button `Drugs`, heading "Drug Management", heading "Drug Database", "drug inventory", alert "product master fields"; `Add New Drug` → "Add New Drug" → `Add Drug`.
- **Packages**: figure "Packages · bundles", card "Treatment Packages", dialog "Create Treatment Package", toast "pharmacy packages".
- **Assistant**: "Pharmacy AI assistant", `Open AI Assistant`, "Assistant ready", toast "Agent unavailable", spinner "Codex is working", reception tour "Codex assistant"; "Chats" vs "thread"; "History" vs "Archived".
- **Partner sync**: panel "Partner Daily Sync", cockpit button `Daily close`, sidebar "Daily Collection" (unrelated); `Commit` / `Retry outstanding` / `Retry these outstanding units`; `Resolve outstanding` / `Close corrections`.
- **Inventory**: tile "Inventory Control", button "Inventory control", button and badge "Shelf locations", guide "Inventory > Pharmacy Control".
- **Stray copy**: the "Prescription Queue" strip carries the pill "Validate before adding stock", which has nothing to do with the queue.

### 4. Role mismatches seen on these surfaces (controls shown that the server refuses)

- Reception on the Desk: `Open AI Assistant` (API roles exclude RECEPTION — `pharmacy-agent` controller), Partner Daily Sync form (treated as a partner user — `pharmacy-partner-sales.service.ts` l. 808–819), `Create Package` (drug search needs admin/pharmacist/doctor — `drug.controller.ts`).
- Reception on the Counter: every cockpit bill button and the table `Bill` navigate to Sales, which is hidden from her sidebar; `Link item` needs `pharmacy:invoice:create`.
- Packages created from the Desk are always private to their creator (`PharmacyPackageCreator.tsx` has `isPublic` state but no control; `pharmacy-package.service.ts` l. 160–168 lists only own + public).
