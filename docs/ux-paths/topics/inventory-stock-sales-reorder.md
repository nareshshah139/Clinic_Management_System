# Topic: inventory-stock-sales-reorder

Stories for the Inventory workspace (`/dashboard/inventory`) outside Purchases: the **Today** queues, the **Stock** area (stock list, batch detail, approvals, counts, holds, loss, supplier returns, corrections, manual and Excel opening stock), the **Sales** area (counter sales, quotations, customer returns, patient invoice history) and the **Reorder** area (shortbook, purchase orders, target proposals, manual targets, automation settings, monitor).

Setting: Linaé ClinicMS, a dermatology clinic with an attached pharmacy in Banjara Hills, Hyderabad. Seed logins (password `password123`): `admin@clinic.test` (Admin User, ADMIN), `shravya@clinic.test` (Dr. Shravya, DOCTOR), `praneeta@clinic.test` (Dr. Praneeta Jain, DOCTOR), `reception@clinic.test` (Riya Sharma, RECEPTION).

How the workspace behaves (from code):
- Area tabs: **Today / Purchases / Stock / Sales / Reorder** (`InventoryWorkspace.tsx`). URL state is `?area=&view=&document=&new=&item=&status=&page=&return=`. Clicking an area tab resets the URL to `?area=<area>` and drops every filter.
- Desktop shows each area's first 3 tasks as buttons and the rest in a **"More tasks…"** select. Mobile shows a single **"Task"** select.
- **Stock** tasks: Stock list · Approve corrections (OWNER/ADMIN/DOCTOR/PHARMACIST only) · Counts & audit | More: Supplier returns, Loss & breakage, Blocked stock, Corrections, Manual opening stock, Opening stock import.
- **Sales** tasks: Counter sales · Quotations · Customer returns | More: Patient invoice history.
- **Reorder** tasks: Shortbook · Purchase orders · Target proposals | More: Manual targets & exclusions, Automation settings, Monitor.
- Workflow documents are approved only by OWNER, ADMIN or MANAGER (`capabilities.approve`). DOCTOR gets `*` workflow permissions but **cannot** approve workflow documents. Price/stock edits (DrugInventoryChangeRequest) are a separate approval track: submitted by OWNER/ADMIN/PHARMACIST and approved by OWNER/ADMIN/DOCTOR.
- Workflow document status line (sticky header): "Unsaved draft", "Draft", "Awaiting manager approval", "Approved", "Posted", "Return challan saved", "Hold released", "Part received", "Received in full", "Purchase order created", "Sale draft created", "Reversed", "Cancelled", "Rejected". Registers show `labelStatus` text such as "Draft • no stock change".

---

## STORY-801: Morning triage from the Inventory "Today" queues

**Type**: short
**Topic**: inventory-stock-sales-reorder
**Persona**: Admin User (admin@clinic.test), who runs the pharmacy back office and opens Inventory first thing each day
**Goal**: Find out what needs attention today and go straight to the low-stock batches
**Preconditions**: Logged in as ADMIN. The branch has some batches below their saved minimum (for example Momate F Cream 15 g and Isotroin 20 mg capsules), a few creams expiring before February 2027, and one price edit pending.
**Ideal path**: 2. Open Inventory, then click the "Low stock" queue row. The queue is the landing view, so one click reaches the filtered list.
**Alternate paths**: (a) the **"Check low stock"** button under the queue list on Today does the same navigation; (b) Stock → Stock list → "Stock level" select → "Low stock"; (c) header notifications bell "N low-stock items" links to `?tab=low-stock` (known broken: lands on Today). For expiry: the "Expiring in the next 3 months" row, the **"Check next 3 months’ expiry"** button, or Stock list → "Expiry" → "Within 3 months".

### Steps
1. Click **Inventory** in the sidebar (Pharmacy group) → `/dashboard/inventory`. The header reads "Inventory" / "Receive, review and manage pharmacy stock." The **Today** tab is active. "Loading inventory permissions…" then "Loading branch queues…" skeletons appear.
2. Read the **"What needs attention"** list ("Every action opens the matching records. As of 07 Nov 2026 · current branch") → rows show a large count, a bold label and an arrow: "Price/stock edits awaiting approval (1)", "Overdue supplier bills", "Low stock", "Expiring in the next 3 months", "Purchase invoices to review", "Original files awaiting intake", "Counts awaiting completion", "Supplier returns in progress", "Orders awaiting receipt". Hovering a row shows its explanation as a tooltip, for example "Available quantity is at or below this batch’s saved minimum."
3. Notice the approvals row repeats its count: "1" in the count column and "(1)" in the label. This is the same number rendered twice in one row.
4. Click the **Low stock** row → URL becomes `?area=stock&view=list&stock=LOW`. The **Stock** tab is active, the "Stock level" select shows "Low stock", and the status line reads "N matching batches".
5. Click **Today** again, scroll to **"Recent activity"** and click a reference such as `COUNT-2026-11-06` → the count document opens in the workflow editor. The header's back control returns to Today because `return=` was preserved.

### Variations
- Clicking **Expiring in the next 3 months** opens `?area=stock&view=list&expiryMonths=3`.
- Clicking **Counts awaiting completion** opens Stock → Counts & audit with status "OPEN" (all non-final statuses).
- Click the **Refresh inventory** icon (page header): permissions and queues reload without a full page reload.
- Phone width: the area tabs wrap, and the queue rows stay one per line.

### Edge Cases
- Overview API fails: "Branch queues are unavailable. Retry to see current work." plus a **Retry queues** button.
- Capabilities API fails: the alert "Inventory permissions could not be loaded. Loading permissions does not change stock…" plus **Retry permissions**; nothing else renders.
- A user without the edit-read permission (RECEPTION) never sees the "Price/stock edits awaiting approval" row (`pendingEdits` is null).
- Users without `inventory:item:read` see "—" for Low stock and Expiring.
- "Orders awaiting receipt" also counts draft and awaiting-approval orders (see Defects).
- Redundancy: low stock and expiry each have 3 or 4 entry points on Today and in the Stock list (queue row, "Check …" button, filter select, broken header notification).

---

## STORY-802: Pharmacist-side stock correction approved by a doctor

**Type**: medium
**Topic**: inventory-stock-sales-reorder
**Persona**: Admin User submits; Dr. Shravya (shravya@clinic.test) approves between consultations
**Goal**: Correct the on-shelf quantity of one batch after a shelf check, with an approval trail
**Preconditions**: Batch "Momate F Cream 15gm", batch MF24117, unit TUBES, shows 12 TUBES physical, 0 held. The shelf actually has 9.
**Ideal path**: 6. Find the batch → Edit stock → enter 9 + reason → submit; the doctor then opens the queue → Approve → confirm. That is two people, each needing about 3 actions.
**Alternate paths**: (a) the **Edit stock** button is available both in the stock list row ("Edit" column) and on the batch detail page; (b) the doctor reaches the queue from the Today row "Price/stock edits awaiting approval (n)", from Stock → **Approve corrections**, from the old bookmark `/dashboard/inventory-updates` (redirects to `?area=stock&view=approvals`), or from the submitter's notice link **"Open approval queue"**; (c) a physical discrepancy can instead be fixed through a stock count (STORY-806), which uses the workflow-approval track (managers) instead of the doctor track.

### Steps
1. As admin, open Inventory → **Find or correct stock** → Stock list (`?area=stock&view=list`).
2. Type "momate" in **Search stock** (placeholder "Type a product name or scan a barcode") and press **Search** → one row per batch appears: "Momate F Cream 15gm", batch state, expiry, Available, Selling price, Location, Edit.
3. In the Edit column, click **Edit stock** → the dialog "Edit stock" opens with the description "Momate F Cream 15gm · Batch MF24117. The change takes effect after doctor or admin approval." It shows "Current stock on shelf: 12 TUBES".
4. Enter `9` in **Counted physical stock (TUBES)** → a "Check your changes" preview appears with "Not saved yet" and "Stock (TUBES) 12 → 9".
5. Hesitate over the hint "Count this batch only. Include the 0 units set aside." Then type in **Why are you changing it?**: "Shelf check 7 Nov: 3 tubes found crushed and moved to damage bin". (Placeholder: "e.g. Counted 8 tubes on the shelf today".)
6. Click **Submit for approval** → the dialog closes. Status notice: "Submitted for doctor or admin approval." with a link **Open approval queue**. The stock list still shows 12.
7. Log out, then log in as `shravya@clinic.test`. Open Inventory → Today shows "Price/stock edits awaiting approval (1)".
8. Click that row → **Price / stock approval queue** ("Changes take effect after doctor or admin approval.") → "1 pending request". The card shows "Momate F Cream 15gm", "Batch: MF24117 · TUBES", "Batch physical stock: 12 → 9", the reason, and "Admin User · 07 Nov 2026, 10:42".
9. Click **Approve** → the dialog "Approve inventory change" opens ("Apply the reviewed price or stock change."). Optionally add the **Review note** "Verified with damage bin photo".
10. Click **Approve** in the dialog → toast "Inventory change approved". The queue reloads to "0 pending requests" / "No pending price or stock edits."
11. Go to Stock → Stock list, search "momate" → Available now shows 9 TUBES.

### Variations
- **Edit price**: the dialog "Edit price" shows "Current selling price: ₹245.00" and the field "New selling price (₹ per stock unit)" accepts decimals. Its preview reads "Selling price ₹245.00 → ₹260.00".
- Dr. Shravya clicks **Reject** instead, with the note "Recount after evening stock arrives". Toast "Inventory change rejected". Stock is unchanged.
- The submitter is ADMIN, who can also approve their own request (no self-approval restriction found in `drug.service.ts`).

### Edge Cases
- A value equal to the current value, a blank value, a negative value, or a fractional stock value keeps **Submit for approval** disabled. A stock value below the held quantity shows "Enter a whole number of at least N. Include stock set aside."
- The batch changed after the dialog opened: the server rejects with "Price changed since this request. Reject it and resubmit." (or a stale-revision conflict). The dialog keeps the inputs and shows the error.
- RECEPTION and DOCTOR have no Edit column and no Edit stock/Edit price buttons (`canSubmitEdits` = OWNER/ADMIN/PHARMACIST). A doctor can approve but not propose.
- A PHARMACIST sees the queue but no Approve/Reject buttons. The backend also denies them (`drug.controller.ts` approve = ADMIN/DOCTOR).
- MANAGER does not get the "Approve corrections" task at all, even though MANAGER approves every other workflow document.

---

## STORY-803: Receptionist explores Inventory and runs into permission walls

**Type**: short
**Topic**: inventory-stock-sales-reorder
**Persona**: Riya Sharma (reception@clinic.test), covering the pharmacy counter while the pharmacist is on leave
**Goal**: Check the stock of Ketoconazole 2% shampoo for a patient, then try to look up a past counter sale
**Preconditions**: RECEPTION role with the seeded RBAC permissions (`inventory:item:*` explicit keys, `inventory:po:*` explicit keys, no `pharmacy:invoice:*`, no `pharmacy:compliance:audit`).
**Ideal path**: 3. Inventory → search "keto" → read Available. The sale lookup cannot complete for this role.
**Alternate paths**: The stock check can also go through Pharmacy Counter/Billing drug search (out of topic). For sale history: Inventory → Sales → Patient invoice history, `/dashboard/pharmacy/invoices`, or Pharmacy Billing. All of them call ADMIN/PHARMACIST/DOCTOR-only invoice endpoints.

### Steps
1. Click **Inventory** in the sidebar → Today loads. There is no "Price/stock edits awaiting approval" row.
2. Click **Find or correct stock**, type "keto", press **Search** → the rows for "Nizral 2% Shampoo 100ml" appear with Available "14 BOTTLES". There is no Edit column.
3. Click the product name → the batch detail opens with Physical stock / Held / Available to sell / Minimum / maximum. The buttons offered are "Blocked stock", "Loss & breakage" and "Supplier returns", but **not** "Count this batch". A "Batch recovery handoff" box says "Ask a colleague with Counts & audit write access…" and shows a read-only **Batch recovery reference** URL.
4. Click the **Sales** tab → Counter sales shows "You do not have permission to view counter sales."
5. Open **More tasks…** → **Patient invoice history** → the invoice list loads, then shows an error (403 from `GET /pharmacy/invoices`, which allows only ADMIN/PHARMACIST/DOCTOR).

### Variations
- Stock tasks for reception show "Stock list", "Counts & audit" and "Supplier returns" as buttons. Approve corrections is filtered out, so the third button shifts.
- Counts & audit lists counts (read needs only `inventory:item:read`), but the **Start stock count** button is hidden.

### Edge Cases
- Reception can create a Supplier return challan but cannot finalise it. Posting requires `pharmacy:purchase-ledger:write` (`inventory-workflow.service.ts` authorizes CREDIT_NOTE on SUPPLIER_RETURN POST).
- The Opening stock import view is not capability-gated in the UI. Reception can use it, because the backend allows RECEPTION + `inventory:item:create`.

---

## STORY-804: Add a new batch and post its opening balance manually

**Type**: medium
**Topic**: inventory-stock-sales-reorder
**Persona**: Admin User setting up a newly stocked product
**Goal**: Start stocking "Tacroz Forte 0.1% Ointment 10g" with 20 tubes that arrived before the supplier bill was entered
**Preconditions**: ADMIN. The product is not in inventory yet.
**Ideal path**: 5. Add batch (one form that includes the opening quantity) → save. Today it takes two separate flows because **Add Inventory Item** has no quantity field, which raises the real count to about 12 actions.
**Alternate paths**: (a) Stock → **Opening stock import** (Excel, STORY-805); (b) Purchases → Inward challans "Receive stock" or Scan or enter bill → commit stock, which is the normal supplier route (purchases topic); (c) Counts & audit cannot set opening stock on a new batch, and the backend steers to a reviewed count or correction only for existing batches.

### Steps
1. Stock → Stock list → click **Add batch** → the "Add Inventory Item" dialog opens.
2. Fill **Basic Information**: Item Name "Tacroz Forte 0.1% Ointment 10g", Type "Medicine", Generic Name "Tacrolimus", Brand Name "Tacroz Forte", Manufacturer "Glenmark".
3. **Unit & Packaging**: Unit "Tubes", Pack Size 1. **Pricing**: Cost Price (₹) 412.00, Selling Price (₹) 520.00, MRP (₹) 545.00, GST Rate (%) 12, HSN Code 30049099.
4. **Stock Levels**: Min Stock 5, Max Stock 30, Reorder Level 8. **Identification**: Batch Number "TF2511A", Expiry Date 2027-09-30, Storage Location "Rack C-2". Tick **Requires Prescription**.
5. Click **Add Item** → the dialog closes and the list reloads. Search "tacroz" → the new batch shows Available 0 TUBES.
6. Open **More tasks…** → **Manual opening stock** → register "Opening stock entries" ("Set the opening balance of a new batch with no prior movements. This creates no supplier payable.").
7. Click **New document** → the editor opens with the status "Unsaved draft" and the back control "Back to opening stock entries".
8. In "Search product, batch, barcode or SKU" type "tacroz" → pick the TF2511A batch → the line shows Quantity, Rate excl. GST and GST %.
9. Set Quantity 20 and Reason / notes "Received 05 Nov before invoice; opening balance". Click **Save draft** → the status reads "Draft" and the outcome panel says "This draft has not changed stock."
10. Click **Post opening stock** → the status reads "Posted": "Saved stock effects record the opening quantities added to the new batches."
11. Click the back control → the Opening stock entries register lists the reference as "Posted".
12. Return to the Stock list → Available 20 TUBES. In the batch detail **Ledger** tab, the opening movement appears.

### Variations
- **Export lines** (CSV) and **Print QR label** become available on the saved document.
- Reversing a mistaken opening: as admin, click **Correct by reversal** → enter a **Reversal reason** → **Reverse posted effects**.

### Edge Cases
- If you pick a batch that already has stock or any movement, posting fails with "Opening stock is allowed only on a new batch with no movements. Use a reviewed physical count or correction."
- **Add batch** appears only when `capabilities.itemCreate` is true. MANAGER does not see it under the seeded RBAC (see Defects).
- Browser recovery: if the tab closes before saving, reopening restores "Restored unsaved draft details. This draft has not been submitted."

---

## STORY-805: First-day setup from the old pharmacy's Excel stock sheet

**Type**: medium
**Topic**: inventory-stock-sales-reorder
**Persona**: Admin User migrating from a Marg-style Excel export on go-live day
**Goal**: Import about 340 rows of opening stock and fix the rows that fail
**Preconditions**: ADMIN. The file `linae-opening-stock-nov2026.xlsx` is 210 KB with the columns Drug name, Manufacturer, Composition, Category, Dosage form, Strength, Pack size, Selling price, Current stock, plus Batch number, Expiry date, MRP, GST %, Supplier.
**Ideal path**: 4. Open import → choose file → review preview → confirm.
**Alternate paths**: Manual opening stock one batch at a time (STORY-804). The compact "Start Inventory From Excel" card inside the orphaned PharmacyInventoryControl is not reachable.

### Steps
1. Stock → **More tasks…** → **Opening stock import** → the heading "Opening stock import" and the card "Start Pharmacy Inventory From Excel" ("Import opening stock into the drug catalog and inventory in one pass.").
2. Expand **Excel columns and format** → the required columns are filled badges and the optional ones are outlined.
3. Drag the file onto "Drop an Excel file here" (or click **Choose Excel**) → the zone shows the file name and "210.4 KB selected", with a **Remove** button.
4. Click **Preview import** → the server validates the file. The button label changes to **Confirm opening import**. In this full-width layout **no preview table appears** (see Defects), so the user cannot review rows, the "Errors" column, or the "Existing batch balances cannot be reset." warning.
5. Unsure, the user clicks **Confirm opening import** anyway → the toast "Inventory imported with errors: 331 created, 0 updated, 9 skipped."
6. The results region shows Rows 340 · Created 331 · Updated 0 · Drugs 298 · Stock 331 · Skipped 9. Below it is **Rows needing review**, for example "Row 57: Expiry date is invalid", "Row 212: Pack size is required".
7. Click **Download original Excel** (under "Import reference: …") to get the exact file, then fix rows 57 and 212 in it.
8. Click **Retry failed rows** → toast "Some rows still need attention" or "Import complete" with updated counts.
9. Click **Check import outcome** later to re-read the server result without retrying.

### Variations
- A clean file gives the toast "Inventory import finished" and no review panel.
- Selecting a new file resets the preview, so you must press "Preview import" again.

### Edge Cases
- A `.csv` or `.pdf` file gives the toast "Unsupported file: Upload an .xlsx or .xls Excel file." A file over 5 MB gives "File too large". An empty file gives "Empty file".
- A network drop during the import gives the toast "Import outcome not confirmed … Check import outcome before trying again." The previous summary is kept.
- "Some earlier row outcomes are unknown. Ask an administrator to reconcile them before importing stock again." appears when `reconciliationRequired` > 0.
- Re-importing the same batches cannot reset balances (per the server message). Use counts or corrections instead.

---

## STORY-806: Doctor-led expiry count with variance that needs manager approval

**Type**: long
**Topic**: inventory-stock-sales-reorder
**Persona**: Dr. Praneeta Jain (praneeta@clinic.test), who checks the cosmeceutical shelf every month; Admin User approves
**Goal**: Physically count every cream expiring in the next 3 months, get the variances approved, and apply them
**Preconditions**: Automation settings **Count policy** = "Manager approval for every variance". About 6 batches expire by early February 2027 (Melalite Forte 15g, Sebamed Clear Face Gel 50ml, Fourderm 15g, and others). DOCTOR has `*` workflow permissions but is not an approver.
**Ideal path**: 8. Filter by expiry → count matching → enter counts → submit; the admin then opens the count → approve → apply.
**Alternate paths**: (a) Stock → **Counts & audit** → **Start stock count** (counts every batch in the branch, with no filter); (b) batch detail → **Count this batch**; (c) select rows in the Stock list → **Count selected batches**; (d) Automation settings "Daily stock count" generates counts automatically; (e) links named "Open Counts & audit" in the purchase workbench, the Compliance Center and the workflow editor outcome panel; (f) for a single batch, **Edit stock** through the doctor/admin approval track (STORY-802).

### Steps
1. Log in as Dr. Praneeta → **Inventory** → Today → click **Check next 3 months’ expiry** → Stock list with Expiry "Within 3 months", "6 matching batches".
2. Tick **Show cost & stock details** to see Physical, Held, Stock unit, Purchase cost and MRP. The same quantities also appear on the batch detail and in the CSV export.
3. Click **Count matching batches** → a COUNT document is created and opens in the editor. The status reads "Draft", and the outcome says "This count is a draft. Submitting can apply the count immediately or may require approval under the saved inventory policy."
4. The line table shows Product & batch, System, Physical count, Difference. Every Physical count starts blank.
5. Walk the shelf and enter: Melalite Forte TUBES system 7 → physical 7; Sebamed Clear Face Gel system 4 → 3; Fourderm system 10 → 10; and so on. One batch could not be found, so she leaves it blank, following the help text "Leave uncounted batches blank; enter 0 only when counted empty."
6. Enter Reason / notes "Monthly expiry shelf check – Nov 2026" (required before posting).
7. Click **Save draft**, then **Submit count** → because Sebamed shows −1 and the policy is "APPROVAL", the server moves the count to **Awaiting manager approval**. The outcome reads "This document is waiting for manager approval. Stock has not changed…" and the recovery says "Ask a manager with approval permission to review this document. Approval alone does not apply a count."
8. Dr. Praneeta sees no Approve button (DOCTOR is not in APPROVERS) and tells the admin.
9. Log in as admin → Inventory → Today → **Counts awaiting completion** shows 1 → click it → Counts & audit, filtered by status OPEN → click the reference `COUNT-2026-11-07`.
10. The status reads "Awaiting manager approval". Buttons: **Approve document** (primary), **Reject proposal**, **Cancel document**.
11. Review the Difference column, then click **Approve document** → status "Approved": "This count is approved. Stock has not changed. Apply approved count updates the recorded quantities to the verified observations."
12. Click **Apply approved count** → status "Posted": "Count applied. Recorded quantities were adjusted to the verified physical observations."
13. Click **Reload saved record** → the outcome is confirmed from the server. **Export lines** downloads `COUNT-2026-11-07.csv`.
14. Open the Sebamed batch from the Stock list → Physical stock now shows 3. The **Ledger** tab shows the count adjustment movement. The **Batches** tab shows "Multiple batches can be on hand; compare expiry dates when choosing stock."
15. Return to Today → "Counts awaiting completion" is back to 0. "Recent activity" lists `COUNT-2026-11-07 · Stock counts · Posted`.

### Variations
- Count policy "Approval based on variance rules" with **Approval threshold (₹)** 500: a −1 tube variance worth ₹189 posts directly when "Negative count variances require approval" is unticked.
- Admin counts directly: an approver's **Submit count** posts immediately (no approval step).
- The admin clicks **Reject proposal** → status "Rejected", and the recovery suggests **Start fresh count**.
- Someone sells a Sebamed tube between counting and applying: posting fails with "Sebamed…: stock changed since the count started from 4 to 3 BOTTLES. Choose Start fresh count and record a new physical observation." Click **Start fresh count** → earlier observations are cleared and history is kept.

### Edge Cases
- **Start stock count** in Counts & audit with no filter creates one COUNT document covering every batch in the branch, including depleted ones (`createCount` with no filters uses the full stock query). This is a very large document for a real pharmacy.
- "No matching batches to count" when the filter returns nothing.
- Interrupted submit (network drop): the status "Outcome not confirmed" with **Check saved status** and a read-only "Recovery handoff" text box.
- Counting and editing the same batch at the same time through STORY-802 creates two competing correction tracks with different approvers.

---

## STORY-807: Hold a suspected batch, then return it to the distributor for credit

**Type**: long
**Topic**: inventory-stock-sales-reorder
**Persona**: Admin User handling a manufacturer recall notice for "Mintop 5% Solution 60ml" batch MT2408
**Goal**: Stop sales of the batch immediately, write off 2 leaking bottles, and send the remaining 10 back to Sri Venkateswara Pharma Distributors (Koti, GSTIN 36AAKFS4471L1ZQ) for credit
**Preconditions**: ADMIN. Batch MT2408 has 12 BOTTLES physical, 0 held. The supplier is saved under Purchases → Suppliers.
**Ideal path**: 9. Find the batch → Blocked stock → post; Loss & breakage from the hold → post; Supplier returns from the hold → challan → finalise.
**Alternate paths**: Each document can also be started from its register: Stock → More tasks → "Blocked stock" / "Loss & breakage" / "Supplier returns" → **New document**, then search the batch manually. The batch-detail buttons prefill the line instead. The Today row "Supplier returns in progress" reopens an unfinished return.

### Steps
1. Stock list → search "mintop" → click the MT2408 row → batch detail with Available to sell 12 BOTTLES.
2. Click **Blocked stock** → the HOLD editor opens, prefilled with one line (quantity 1, batch MT2408). Set Quantity 12 and Reason / notes "Glenmark recall notice GL/RC/2611 – do not sell".
3. Click **Block stock** → status "Posted": "Holding units changes their availability, not physical quantity."
4. Back on the batch detail: Physical 12 · Held 12 · Available to sell 0. The **Blocked stock** tab and "Held stock by source" list the hold reference. The batch state shows as held.
5. Click **Loss & breakage** → the LOSS editor opens. In **Stock source**, choose the hold reference instead of "Available stock (no hold)". Set Quantity 2 and the reason "2 bottles leaking in carton".
6. Click **Post stock loss** → status "Posted": "Saved stock effects record the units removed for loss or breakage."
7. Click **Supplier returns** → the editor opens. Choose the supplier, Stock source = the hold, **Return type** "Expired / near expiry"? No: she changes it to "Other agreed return" and adds the note "Manufacturer recall". **Return price basis** "Purchase rate per stock unit". Quantity 10.
8. Click **Save draft**, then **Create return challan** → status "Return challan saved": "Stock has already been sent back to the supplier on this return challan."
9. Click **Print QR label** to attach to the carton. Click **Export lines** for the delivery boy's copy.
10. Two days later, the credit note arrives. Today → **Supplier returns in progress** (1) → open the return → click **Finalise supplier credit** → status "Posted". A supplier credit is created and can be allocated under Purchases → Credits & vouchers.
11. Batch detail: Physical 0 · Held 0. The **Purchase returns** tab lists the return. The **Ledger** shows hold, loss and return movements.

### Variations
- The recall turns out to be the wrong batch: open the HOLD document → **Release held stock** → status "Hold released".
- Posted loss in error: admin clicks **Correct by reversal** → **Reversal reason** "Bottles were intact; mis-scan" → **Reverse posted effects** → status "Reversed", with a link **Open linked correction**.
- A DOCTOR can create every one of these documents, but gets no **Correct by reversal** button (approvers only).

### Edge Cases
- Reversing a hold that has downstream loss or return dispositions is blocked. The guard message asks a manager to "inspect and reverse only the incorrect downstream returns or disposals before reversing this record."
- **Cancel document** on a challan records a compensating movement ("If stock had already been sent on a challan, cancellation records its compensation…").
- A user without `pharmacy:purchase-ledger:write` (for example RECEPTION) can create the challan but fails on **Finalise supplier credit** with "This action requires pharmacy:purchase-ledger:write".

---

## STORY-808: Walk-in counter sale from Inventory, including a quotation and FEFO override

**Type**: medium
**Topic**: inventory-stock-sales-reorder
**Persona**: Dr. Shravya (DOCTOR, has `*` workflow access) covering the counter on a Saturday evening
**Goal**: Quote and then sell a sunscreen to a walk-in customer, choosing a newer batch on purpose
**Preconditions**: "Bioderma Photoderm SPF 50+ 40ml" has two batches: PD2602 (expires Feb 2027, 3 TUBES) and PD2711 (expires Nov 2027, 15 TUBES).
**Ideal path**: 5. Sales → New document → add batch → enter payment → Post sale. The quotation step is optional and adds 3.
**Alternate paths**: Selling is reachable in 3 places: (a) Pharmacy Billing invoice builder (`/dashboard/pharmacy?section=billing`); (b) Pharmacy Counter "Walk-in bill"; (c) Inventory → Sales → Counter sales (this story). A quotation converts to a counter-sale draft through "Create sale draft".

### Steps
1. Inventory → **Sales** → **Quotations** → **New quotation**.
2. Customer name "Ananya Reddy" (placeholder "Walk-in customer"), Phone "9849012345", Payment method "UPI", Doctor (optional) "Dr. Shravya", Order type "Pickup", Request source "Manual quotation", Expected date 2026-11-08, Priority "NORMAL".
3. Search "photoderm" → the matches are sale-eligible batches sorted by earliest expiry. Pick PD2711 → line shows "PD2711 · TUBES · 30 Nov 2027", "MRP ₹1,150.00 · Rack B-1 · 15 TUBES available at selection". Quantity 2.
4. **Save draft** → total "Taxable … + GST … Total ₹2,300.00".
5. The customer agrees. Click **Create sale draft** → status "Sale draft created". Click **Open linked sale draft** → the COUNTER_SALE editor opens, status "Draft".
6. Click **Post sale** → error: "Bioderma Photoderm SPF 50+ 40ml: an earlier-expiry batch is available. Use it first or enter the batch-selection reason on this line."
7. Fill **Batch-selection reason (if bypassing earlier expiry)**: "Customer travelling abroad till March; needs longer expiry".
8. Click **Post sale** → status "Posted": "Saved stock effects record the units removed by this sale." The PD2711 batch now shows 13 TUBES available.

### Variations
- Choose PD2602 instead → posts with no reason.
- Quotation with Request source "Unfilled customer demand" (bounce), left in Draft → it counts as demand in the next target proposal when "Include unfulfilled bounce quotations" is on (STORY-811).

### Edge Cases
- Drafts do not reserve stock ("Drafts do not reserve; posting reduces available stock."). If someone else sells the last units first, posting fails at validation.
- Sales lists are invisible to roles without `pharmacy:invoice:read` ("You do not have permission to view counter sales.").
- The counter sale is a workflow document, not a PharmacyInvoice, so it never appears in **Patient invoice history** or `/dashboard/pharmacy/invoices`. This is a redundancy and consistency gap between the three selling paths.

---

## STORY-809: Customer returns an unopened product: quarantine, inspect, release

**Type**: medium
**Topic**: inventory-stock-sales-reorder
**Persona**: Admin User handling a return at the counter
**Goal**: Accept back 1 unopened "Sebamed Clear Face Gel 50ml" sold yesterday, keep it off-sale until the seal is inspected, then release it
**Preconditions**: The counter sale `SALE-...` from 06 Nov 2026 included 2 tubes of Sebamed batch SB2509.
**Ideal path**: 6. Customer returns → New → pick the sold batch → disposition → post; later Release held stock.
**Alternate paths**: none found for returns of workflow counter sales. PharmacyInvoice returns are not handled here.

### Steps
1. Inventory → **Sales** → **Customer returns** → **New document**.
2. Type "sebamed" in **Search original sale** ("Sale reference, product, barcode or SKU") → choose in **Add from original sale** the option for SB2509 with its remaining return quantity.
3. The line appears with a **Disposition** select: choose **Quarantine**. Quantity 1.
4. **Refund method** "CASH", Customer name "Farhan Ali", Reason / notes "Unopened; customer bought wrong variant" (required before posting).
5. Click **Post return** → status "Posted". The **Refund / credit recorded** panel shows "₹695.00 · CASH · …". The batch shows +1 physical and +1 held, so available is unchanged.
6. Next morning, the seal is verified. Open the return (Customer returns register, or the batch's **Sales returns** / **Blocked stock** tab) → click **Release held stock** → status "Hold released". Available rises by 1.

### Variations
- **Restock** posts straight to available stock. **Record as loss** writes the unit off immediately.
- A released return that was wrong: an approver uses **Correct by reversal** (allowed for SALES_RETURN in RELEASED).

### Edge Cases
- Trying to return more than the remaining sold quantity: the option shows the remaining return quantity, and the server rejects any excess.
- The original sale was reversed earlier: the return is blocked by the downstream-integrity rules.

---

## STORY-810: Low stock to shortbook to purchase order to partial receipt

**Type**: long
**Topic**: inventory-stock-sales-reorder
**Persona**: Admin User doing the weekly reorder for the acne line
**Goal**: Replenish Isotroin 20 mg (STRIPS) and Itrasys 200 (STRIPS) from Sai Balaji Medical Agencies, Ameerpet (GSTIN 36ABCPS1234K1Z5), receive a short delivery, and close the rest
**Preconditions**: ADMIN (an approver). Isotroin has Min 10 / Max 40 STRIPS with 6 available. Itrasys has Min 5 / Max 20 with 2 available. Both suppliers are saved and active.
**Ideal path**: 12. Sync shortages → open request → choose supplier → create PO → submit → approve → receive → post receipt → cancel the remainder. Each request is a separate shortbook document, so the count grows per item.
**Alternate paths**: (a) Reorder → Purchase orders → **Add purchase order** (manual order without shortbook); (b) Shortbook **Add manual request**; (c) receiving: PO detail **Receive remaining stock**, Purchases → **Inward challans** → New document → "Purchase order" select, or the PO editor link **Review linked receipts**; (d) Today **Low stock** row → Stock list (inspection only, there is no "add to shortbook" action there); (e) target proposals with "Sync accepted targets to Shortbook" (STORY-811); (f) "Automatic PO drafts" in Automation settings.

### Steps
1. Inventory → **Reorder** → **Shortbook** (default). The header reads "Shortbook · N matching records · all result pages included".
2. Click **Sync shortages** → notice "Shortbook refreshed from active targets. Existing requests are preserved." Two new rows appear: `NEED-2026-11-07-Isotroin 20mg Capsule` and `NEED-2026-11-07-Itrasys 200`, each showing "Isotroin 20mg Capsule: 34 STRIPS", "LOW_STOCK · NORMAL · 07 Nov 2026 · Requested by <user id>", "Min 10 / available 6 · Supplier selection required".
3. Click the Isotroin request → the shortbook document opens. The sticky header has "Back to shortbook", status "Draft", **Save draft** and **Create purchase order**. Below it is **Supplier recommendation**, with each saved supplier's posted purchase history (rate, pack, free quantity, discount).
4. In **Supplier**, choose "Sai Balaji Medical Agencies · 36ABCPS1234K1Z5" → **Save supplier** → notice "Supplier choice saved for this request and future shortages."
5. Click **Create purchase order** → status "Purchase order created". Click **Open linked purchase order**.
6. The PO `PO-NEED-2026-11-07-…` opens in Draft. Adjust Quantity to 30 STRIPS (a round number). Set Expected date 2026-11-10 and Priority "HIGH". Click **Save draft**.
7. Click **Submit for approval** → status "Awaiting manager approval".
8. As an approver, the admin sees **Approve document** → click it → status "Approved". The recovery reads "Receive actual goods through an inward challan linked to this order."
9. In **Order delivery & receipts**, the table shows Ordered 30 · Previously received 0 · Remaining 30.
10. Click **Send purchase order** → notice "Supplier mail transport is not configured. Export the order and deliver it manually." The attempt is listed with status SETUP_REQUIRED.
11. Click **Export order & remaining quantities** → `PO-….csv` downloads. WhatsApp it to the distributor manually.
12. On delivery day, open Reorder → **Purchase orders**, filter Status "Approved • ready for next step", and open the PO. (Or Today → **Orders awaiting receipt**.)
13. Click **Receive remaining stock** → the Inward challan editor opens prefilled with 30 STRIPS ("Receipt against PO-…").
14. The delivery has only 20 strips. Set Quantity 20 and enter batch "IS2611" with expiry 2028-04-30. Click **Receive stock** → status "Posted".
15. Go back to the PO → the status reads "Part received" with Ordered 30 · Previously received 20 · Remaining 10. **Receipt history** lists the challan.
16. The distributor says the rest is out of stock. Expand **Cancel remaining quantities**, enter **Reason (required)** "Distributor out of stock till Dec", and click **Cancel remaining units** → notice "Remaining units cancelled. Posted receipts and stock are retained." The shortbook request also becomes Cancelled.
17. On the challan, click **Create linked purchase bill** to record the supplier invoice without receiving the goods again (handoff to the Purchases workbench).
18. Reorder → **More tasks…** → **Monitor** → "Replenishment monitor". Outcome bars CREATED / APPROVED / FAILED / PART_RECEIVED each list the PO. **Supplier choices** shows "Sai Balaji Medical Agencies · 1 orders".

### Variations
- A DOCTOR performs steps 1 to 7 but sees no **Approve document**, **Send purchase order** or **Cancel remaining quantities** (manager actions).
- Inward challan created from Purchases → Inward challans instead: choose the order in the **Purchase order** select and match each line with **Match order line**.
- Filter the shortbook by **Supplier GSTIN** and **Download all matching lines** for a supplier-wise order sheet.

### Edge Cases
- **Sync shortages** with nothing below minimum: "No new shortages. Existing requests and manual overrides are retained." Items without both a minimum and a maximum are skipped silently.
- **Create purchase order** before saving a supplier: posting validation rejects it.
- Cancelling a PO that already has posted receipts through **Cancel document** fails with "An order with receipts cannot be cancelled". Use **Cancel remaining units** instead.
- The shortbook rows show raw supplier and user IDs ("Supplier clx…", "Requested by clx…"); see Defects.

---

## STORY-811: Configure replenishment automation and review a target proposal

**Type**: medium
**Topic**: inventory-stock-sales-reorder
**Persona**: Admin User, with Dr. Shravya giving input on seasonal demand
**Goal**: Turn on automatic target proposals, run them once, and accept the sensible minimum/maximum changes
**Preconditions**: ADMIN (`capabilities.settings` and `approve` are true). 90 days of SALE movements exist.
**Ideal path**: 7. Settings → set owner and toggles → Save → Run → open generated proposal → select → Accept.
**Alternate paths**: (a) Reorder → **Target proposals** → **Generate target proposal** (manual run without saving settings); (b) the "Open generated document" link in **Saved run outcomes**; (c) Monitor → "Demand & stock coverage" → **Review proposal**; (d) minimum/maximum can also be changed directly in **Manual targets & exclusions** or in batch detail **Edit product details** (Minimum stock / Maximum stock / Reorder at); (e) `/dashboard/stock-predictions` redirects to Manual targets & exclusions.

### Steps
1. Inventory → Reorder → **More tasks…** → **Automation settings** → "Automation setup & summary". The summary row shows Owner "Setup required", Last run "Never run", and Model / version.
2. **Automation owner**: "Admin User · ADMIN". Tick **Automatic target proposals: On**. Leave **Automatic PO drafts: Off**. Set **Demand lookback (days)** 90, **Minimum order history** 3, **Min. cover (days)** 15, **Max. cover (days)** 45, and tick **Include unfulfilled bounce quotations**.
3. Click **Save settings** → notice "Automation settings saved."
4. Click **Run saved settings** → notice "Run recorded. Review the outcomes below." **Saved run outcomes** shows "Manual run · <actor id>" and "Target proposal · CREATED …" with **Open generated document**.
5. Click **Open generated document** → the target review opens with "Back to list", the reference, "Draft · observed-demand-cover-v2 · 07 Nov 2026", Evidence dates, Demand inputs and Coverage.
6. Each line shows "Saved min / max 10 / 40 → Proposed 14 / 42 STRIPS" plus "Available · Sales · Bounce · Refill · orders", with an expandable "Demand records (n)". Lines can also be labelled "Cold start: retain saved targets" or "Unconfigured: set manual targets first".
7. Click **Select unreviewed**, untick the sunscreen lines (seasonal spike), keep **Sync accepted targets to Shortbook** ticked, and click **Accept selected** → notice "Selected targets accepted. Unselected lines remain available for review." The status becomes "Partly reviewed".
8. Select the remaining lines → **Reject selected** → the proposal becomes "Posted" (some accepted). Each line shows "Accepted/Rejected <date> by <user id>".
9. Go to **Manual targets & exclusions** → tick **Exclude Bioderma Photoderm SPF 50+ 40ml from target proposals** for that row, select it, click **Review selected changes**, enter **Reason (required)** "Seasonal; Dr. Shravya sets manually", and click **Save reviewed targets**.

### Variations
- Dr. Shravya (DOCTOR) opens the same proposal: checkboxes are disabled and there are no Accept/Reject buttons. Manual targets shows "An inventory manager with target-review access can change these values." She can still change Minimum stock / Maximum stock on any batch through **Edit product details** with a reason (see Defects).
- With Count policy and **Daily stock count** on, the run also creates a COUNT document (outcome link opens Counts & audit).

### Edge Cases
- **Select all matching items** is disabled above 1,000 rows: "Narrow the search or select up to 1,000 items for one review."
- Minimum greater than maximum is rejected server-side ("Minimum cannot exceed maximum").
- Reviewing a line someone else just reviewed: "A selected line has already been reviewed. Reload the proposal."
- Non-approvers see "An inventory manager can change automation settings." and a disabled fieldset.

---

## STORY-812: Old bookmarks and phone-width task switching

**Type**: short
**Topic**: inventory-stock-sales-reorder
**Persona**: Admin User returning after months away, now on a phone
**Goal**: Use old bookmarks to reach approvals and stock predictions, then switch tasks on mobile
**Preconditions**: Logged in as ADMIN, on a 390 px viewport.
**Ideal path**: 2. Open the bookmark → land on the target view.
**Alternate paths**: The sidebar Inventory → Stock → Approve corrections; Reorder → More tasks → Manual targets & exclusions.

### Steps
1. Open `/dashboard/inventory-updates` → redirects to `/dashboard/inventory?area=stock&view=approvals` → "Price / stock approval queue".
2. Open `/dashboard/stock-predictions` → redirects to `?area=reorder&view=targets` → "Manual targets & exclusions" (not a predictions dashboard; StockPredictionDashboard is orphaned).
3. On the phone, the desktop task buttons are hidden and a **Task** select appears. Choose "Monitor" → the replenishment monitor loads.
4. Tap the **Stock** area tab → the URL resets to `?area=stock` and the Task select shows "Stock list".

### Variations
- Logged out: middleware redirects to `/login?next=/dashboard/inventory-updates`, and after login the redirect chain lands on approvals.

### Edge Cases
- Old notification links `?tab=low-stock` / `?tab=expiry` / `?tab=pharmacy-control` land on Today (already known).
- The approvals bookmark opened by RECEPTION or MANAGER shows "You do not have access to price/stock approvals."

---

## Defects noticed while mapping

1. **Opening stock import never shows its preview in the Inventory layout.** `previewTable` is built at `frontend/src/components/pharmacy/PharmacyInventoryStarterImport.tsx:244` but rendered only in the `compact` branch (`:300` `if (compact)`, `:440` `{previewTable}`). The full layout returned at `:446` omits it. Inventory → Stock → Opening stock import mounts the non-compact variant (`frontend/src/components/inventory/InventoryWorkspace.tsx:342`). After "Preview import" the user sees only the button flip to "Confirm opening import" and confirms with no row review, no per-row "Errors" column, and no "Existing batch balances cannot be reset." warning. The only compact consumer is the orphaned `PharmacyInventoryControl.tsx:75`.
2. **Wildcard role grants never match, so MANAGER and PHARMACIST lose inventory access.** `backend/scripts/seed_rbac.ts:8-15` gives MANAGER `inventory:*` and `pharmacy:*`, and `:87-117` gives PHARMACIST `inventory:item:*`, `inventory:po:*` and `pharmacy:invoice:*`. Every inventory check is an exact `Set.has` (`backend/src/modules/inventory/inventory-workflow.service.ts:88,102,107`; `inventory-workspace.service.ts:18`). `PermissionsGuard` uses exact `includes` (`backend/src/shared/guards/permissions.guard.ts:92-95`), and its spec asserts that wildcards fail closed (`permissions.guard.spec.ts:39-42`). Result: MANAGER is the only non-admin workflow approver (`inventory-workflow.service.ts:35,109`) but gets `read:false` for every kind. The UI then shows "You do not have permission to view …" (`InventoryWorkspace.tsx:970`), and stock-list reads are refused with "This action requires inventory:item:read". PHARMACIST likewise cannot load the stock list or Sales.
3. **Today "Orders awaiting receipt" counts orders that cannot be received.** `queue('PURCHASE_ORDER')` excludes only final statuses (`InventoryWorkspace.tsx:538-552`), and the row targets `status: "OPEN"` (`:614-617`). The backend's OPEN also includes DRAFT and AWAITING_APPROVAL (`inventory-workflow.service.ts:673-686`). Receiving is only possible for APPROVED/SENT/PART_RECEIVED (`inventory-replenishment.service.ts:362`), so unsubmitted drafts inflate the count and the list.
4. **Reorder screens show raw database IDs instead of names.** In the Shortbook/PO list: "Supplier {d.supplierId}" and "Requested by {d.payload.requester || d.createdBy}" (`frontend/src/components/inventory/ReplenishmentCenter.tsx:168`). Target review shows "Accepted … by {decision.actorId}" (`:119`). Manual targets show "Changed … by {row.lastChangedBy}" and history `{event.actorId}` (`:208`). The backend stores `actor.id` in each of these (`inventory-replenishment.service.ts:66,176`; shortbook `requester: actor.id` in `refreshShortbook`) and never resolves names.
5. **Manager-only target editing is bypassable from batch detail.** Manual targets & exclusions requires a manager (`inventory-replenishment.service.ts:38-39` `manager(actor)`), and its UI says "An inventory manager with target-review access can change these values." (`ReplenishmentCenter.tsx:203`). Yet batch **Edit product details** exposes Minimum stock / Maximum stock / Reorder at (`StockDetailsEditor.tsx:23-25`) and PATCHes `/inventory/workspace/stock/:id` (`WorkspaceStock.tsx:434`), which needs only `inventory:item:update` (`inventory-workspace.service.ts:141-143`). It saves the targets and even sets `manualTargets = true` (`inventory-item-metadata.ts:126-157`). DOCTOR and RECEPTION can therefore change replenishment targets.
6. **The selling-price approval track is bypassable at the API.** The UI routes price edits through doctor/admin approval (`StockEditDialog.tsx`, `submitDrugInventoryChanges`), but `saveInventoryItemMetadata` writes `sellingPrice`/`mrp` directly for any holder of `inventory:item:update` (`backend/src/modules/inventory/inventory-item-metadata.ts:172-176`, reached through `inventory-workspace.service.ts:141-143`). The details editor already sends the whole item, including `sellingPrice`, in its PATCH body (`WorkspaceStock.tsx:434`), so only the unchanged value is sent today. The server does not stop a changed one.
7. **The "Cancel remaining order" label is unreachable dead code.** The button renders only when the status is in DRAFT/AWAITING_APPROVAL/APPROVED/CHALLAN (`WorkflowDocumentEditor.tsx:1395`), yet its label tests `doc.status === "PART_RECEIVED"` (`:1404-1405`), so it always reads "Cancel document". Part-received orders must use ReplenishmentCenter's separate "Cancel remaining units".
