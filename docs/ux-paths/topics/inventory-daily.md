# Topic: Inventory day to day (Today queue, stock list, add item and approvals, counts, losses, corrections, ledger)

Source read: `FE/components/inventory/{InventoryWorkspace,WorkspaceStock,InventoryItemPage,AddInventoryItemDialog,StockEditDialog,StockDetailsEditor,InventoryApprovals,InventoryUpdates,InventoryItemRequests,InventoryLedger,WorkflowDocumentEditor,workflow-document-state,workspace-model}`, `FE/components/inventory/counts/*`, `FE/components/inventory/optimization/DataQualityStrip.tsx`, `BE/modules/inventory/{inventory.controller,inventory-item-request.service,inventory-workspace.service,inventory-workflow.service,inventory-workflow.types}.ts`. Dead components (`PharmacyInventoryControl`, `ShelfIntelligence`) are not used. All routes are under `/dashboard/inventory` and state lives in the query string (`?area=&view=`), so "Inventory" below means the sidebar entry `Inventory` (Pharmacy section).

Cast: Meera Pillai (PHARMACIST), Dr. Anil Reddy (DOCTOR, an approver), Sunita Rao (RECEPTION), Rajesh Agarwal (OWNER).

Step-counting convention: one numbered step per click, per typed field, per selection. "Enter" used to advance between count fields is folded into the typing step. Reading a screen is not a step.

---

## INVENTORY-DAILY-01: Meera opens Inventory and acts on the Low stock count

**Type**: short
**Topic**: Inventory day to day
**Persona**: Meera Pillai, pharmacist, 9:30 am before the first patients arrive
**Goal**: See what needs attention in stock today and open the list of low-stock batches to plan reorders.
**Preconditions**: Signed in as PHARMACIST. Several batches sit at or below their saved minimum (for example 14).
**Ideal path**: 2. One click to reach the queue, one click on the item that needs action; the landing screen already holds the counts.
**Alternate paths**:
- Today row "Low stock" and, further down the same screen, the button "Check low stock" both go to `?area=stock&view=list&stock=LOW` (identical result, two controls on one screen). The same duplication exists for the row "Expiring in the next 3 months" and button "Check next 3 months' expiry", and for row "Overdue supplier bills" and button "Check overdue supplier balances".
- Inventory > area button "Stock" > select "Stock level" > "Low stock" (same list, 3 more steps).
- Header "Notifications" bell for PHARMACIST links to `/dashboard/inventory?tab=low-stock`; the workspace ignores `tab` here and lands on Today, so the user must click the "Low stock" row anyway.
- Dashboard card "System Alerts" > "Low Stock Alert", Reports & Analytics "Low Stock Alerts" (OWNER/ADMIN/MANAGER only) and the Pharmacy Desk stock strip show the same low-stock figure (surfaces named in discovery; not re-read here).
**Same information on several surfaces**: low-stock count appears on Today (row and bottom button), dashboard alerts, header bell, Reports, Pharmacy Desk. "Low stock" here means a batch at or below that batch's own saved minimum.

### Steps
1. Click "Inventory" in the sidebar → page "Inventory" ("Receive, review and manage pharmacy stock.") opens on area "Today" with a brief "Loading inventory permissions…" skeleton, then the five "Data quality" chips (Missing location, Missing category, Missing HSN code, Missing min/max, Unmapped), buttons "Scan or enter bill" and "Find or correct stock", and the list under "What needs attention".
2. Click the row "Low stock" (e.g. "14") → Stock list opens with an active filter chip "stock: LOW ×" and "Stock level" showing "Low stock"; batches are listed with Available, Selling price and Location.

### Variations
- A pharmacist also sees the row "Price/stock edits awaiting approval (n)". Clicking it opens "Approve corrections" but Approve/Reject buttons are hidden for her (only DOCTOR, ADMIN, OWNER can act).
- If the same screen is opened on a phone, the five area buttons wrap and the second-level tasks collapse into a select labelled "Inventory task".

### Edge Cases
- Branch queues fail to load: "Branch queues are unavailable. Retry to see current work." with button "Retry queues".
- Permissions fail: alert "Inventory permissions could not be loaded…" with "Retry permissions"; the Today screen does not render until they load.
- A count that is not available renders as "—" in the number column.

---

## INVENTORY-DAILY-02: Meera checks whether a product is in stock and when it expires

**Type**: short
**Topic**: Inventory day to day
**Persona**: Meera Pillai, pharmacist, at the counter with a patient asking for "Tacroz 0.1% ointment"
**Goal**: Find the product's batches, available quantity and expiry.
**Preconditions**: Signed in as PHARMACIST; the product exists in at least one batch.
**Ideal path**: 2. Open Inventory (search focused) and type; results update live and show batch, available and expiry in the row.
**Alternate paths**:
- Inventory > area button "Stock" (its first task "Stock list" is the default view) instead of the Today button "Find or correct stock" (same destination).
- Stock ledger search "Product, batch or reference" finds movements for the product but not current availability.
- Counter sale / Counter-sales document "Add a batch" search ("Search product, batch, barcode or SKU") lists batches with "available" and expiry (inventory-side counter sales).
- Pharmacy Sales bill "Search Drugs" and the Drug Database page (named in discovery, separate Drug catalogue; not re-read here).
- Typing `purchase:<id>` or `inventory-document:<id>` (as printed on QR labels) into the same Search box opens that bill or document instead of filtering.
**Same information on several surfaces**: Available and Expiry show in the Stock list row, again in the item page "Batches" table (columns Batch no., Qty, Expiry, MRP, PTR ...), in the batch picker of every inventory document, and in the pharmacy billing search.

### Steps
1. Click "Inventory" in the sidebar → opens Today.
2. Click "Find or correct stock" → Stock list (`?area=stock&view=list`), header "Stock", batch-view chips "All batches" / "Current / on hand" / "Previous / depleted" (default: All batches).
3. Click the "Search stock" field and type "tacroz" (optional in the UI, but without it the list shows every batch in the branch, so it is needed in practice; placeholder "Type a product name or scan a barcode").
4. Click "Search" (or press Enter) → rows show product name with pack label, "Batch state" badge, Expiry, Available (e.g. "9 TUBES"), Selling price, Location. Typing alone does not filter; results change only on submit.

### Variations
- Misspelling "tacrox": rows show "Similar spelling: tacroz".
- Searching the old brand name: row shows "Matched earlier name: ...".
- Scanning a barcode into the field then pressing Enter (scanner usually sends Enter) behaves as step 4.

### Edge Cases
- No match: "No batches match these filters. Reset or change the search." plus "Reset" button next to Filters.
- Default list includes depleted and expired batches ("Previous / depleted", "Expired, on hand"); the user must read the badge to avoid quoting an expired batch. Chip "Current / on hand" is a separate click.
- Failure: alert with "Retry"; the count line says "Stock results unavailable".

---

## INVENTORY-DAILY-03: Meera does today's assigned cycle count and signs it off

**Type**: medium
**Topic**: Inventory day to day
**Persona**: Meera Pillai, pharmacist, assigned 6 batches for today's stock reconciliation cycle
**Goal**: Count the 6 assigned batches on the shelf and sign off the list, sending one difference to the doctor.
**Preconditions**: Reconciliation is on for the branch; Meera is an assignee; one list "due today" with 6 items; she holds count permission (compliance audit). One batch (Candid-B cream, system 8) really holds 6.
**Ideal path**: 7. Reach the list in 2, confirm the five matching batches with one "all other batches match" action (1), type the one different quantity (1), sign off (1), type reason (1), confirm (1).
**Alternate paths**:
- Inventory > "Stock" > "Stock counts" > tab "My counts" > button "Start counting" / "Continue counting" (same sheet, 2 more steps than the Today row).
- Stock list button "Count matching batches" / "Count selected batches" builds a new count from the current filters or ticked rows.
- Item page button "Count this batch" builds a one-batch count.
- Stock counts > button "Count an item" (dialog "Count an item or a shelf") for off-cycle counts.
- Stock list / item page "Edit stock" (dialog "Edit stock", field "Counted physical stock") records a physical count through a different approval route (queue "Price / stock") and does not go through counts; it is a second way to correct quantities.
**Same information on several surfaces**: today's due count shows on Today ("Stock count due today"), on the "My counts" tab (badge "Due today", cycle line "Cycle ... day x of y"), and in the count sheet header; the system quantity is shown next to every counted field.

### Steps
1. Click "Inventory" in the sidebar → Today.
2. Click the row "Stock count due today" (6; detail "Open your count and sign off when every batch is counted.") → opens the count sheet directly (title is the count reference) with columns Item, Location, System, Counted, Difference, Note; the first empty "Counted" field is focused.
3. Type "12" in "Counted" for Tacroz ointment 10 g, batch TZ2417, shelf B-3 (required field, default: empty on purpose; (app already knows this): System also shows 12) → "Matches", Enter moves to the next field.
4. Type "20" for Adapalene gel 0.1% 15 g, batch AD9032, shelf B-3 (required field; (app already knows this): System 20).
5. Type "15" for Isotroin 20 mg capsule strip, batch IS5518, shelf C-1 (required field; (app already knows this): System 15).
6. Type "30" for Cetaphil Gentle face wash 125 ml, batch CG2207, shelf A-2 (required field; (app already knows this): System 30).
7. Type "6" for Candid-B cream 15 g, batch CB1144, shelf A-4 (required field) → shows "−2 units" and a rupee value in red; a note field appears.
8. Type "25" for Sebamed sunscreen SPF 50, batch SB7731, shelf D-2 (required field; (app already knows this): System 25). Autosave shows "Saving…" then "Saved"; footer reads "6 of 6 counted · 1 differ".
9. Click "Note" on the Candid-B line (optional; the note box appears automatically when a difference exists, so this click is only needed if the user wants to hide it earlier).
10. Type in "Why it differs (optional)": "Two tubes sold on slip, not yet billed" (optional).
11. Click "Sign off count" (sticky footer) → dialog "Sign off this count" listing "Batches that differ" with "System 8 · counted 6".
12. Type in "Why do these differ? (required)" (required because something differs): "Two tubes sold on a handwritten slip yesterday" (this repeats the note typed in step 10, (app already knows this) from the same screen).
13. Click "Sign off and send for approval" (confirmation dialog guarding a locked, signed record: "The count is then locked; only a fresh count can replace it."; stock changes only after a doctor or administrator approves) → toast "Count signed off and sent for approval." and the sheet becomes a locked record.

### Variations
- No differences: step 12 becomes an optional "Note (optional)" and the button reads "Sign off"; the count posts straight away ("Count signed off. Stock confirmed.", state "POSTED_NO_DIFF") with no approval.
- Two lists assigned: Today row says "2 lists to count..." and opens "My counts" instead; the user also clicks "Start counting" first.
- Backlog from a missed day: list shows badge "From <date>".

### Edge Cases
- Sign off with an empty field: alert "Count every item before signing off. 1 item still to count." and focus jumps to the empty field; field is highlighted.
- Non-numeric entry: hint "Whole number, 0 or more"; "Enter 0 when a batch is not there."
- Count changed by someone else: toast "This count changed ... Showing the latest saved version."
- Server asks for a retype ("N to type again"): field emptied and hint "Type it again (was x)".
- Connection loss: "Not saved. Check your connection; your counts stay on this screen."

---

## INVENTORY-DAILY-04: Meera records two broken tubes as a loss

**Type**: medium
**Topic**: Inventory day to day
**Persona**: Meera Pillai, pharmacist; a stack of Tacroz ointment boxes fell and 2 tubes of batch TZ2417 broke
**Goal**: Remove the 2 broken units from available stock with a recorded reason.
**Preconditions**: PHARMACIST with transaction-create permission; batch TZ2417 holds at least 2 units.
**Ideal path**: 6. Open Inventory with search (1), type product (1), click a row action "Record loss" (1), type quantity (1), type reason (1), post (1).
**Alternate paths**:
- Inventory > "Stock" > "More tasks..." select > "Loss & breakage" > button "New document" > field "Add a batch" (type, click result) > quantity > reason > "Post stock loss" (adds ~3 steps; the only route for several items in one document).
- Item page or Stock list "Edit stock" (counted physical stock lowered, reason, "Submit for approval") reaches the same quantity but needs a doctor's approval and records no loss reason code.
- Customer return line with disposition "Record as loss" (Inventory > Sales > "Customer returns").
- "Blocked stock" hold then loss using "Stock source" = the hold reference.
- A count with a difference, approved by a doctor.
**Same information on several surfaces**: the quantity change appears in the loss document's "Confirmed stock effects", the item page "Ledger" tab, the "Stock ledger" (method "Loss or breakage") and the Today "Recent activity" list.

### Steps
1. Click "Inventory" in the sidebar → Today.
2. Click "Find or correct stock" → Stock list.
3. Type "tacroz" in "Search stock" (optional narrowing, practically required to find the batch).
4. Click "Search" → batches listed.
5. Click the product name link of the TZ2417 row → item page opens (header, "Current stock", item details, buttons "Edit stock", "Edit price", "Blocked stock", "Loss & breakage", "Supplier returns", "Count this batch").
6. Click "Loss & breakage" → editor opens at `?area=stock&view=LOSS&new=...` titled "Loss & breakage" ("Record a reason and remove damaged or lost units from available stock.") with Reference "LOSS-2026-11-13" (default: today's date and kind; editable, (app already knows this)), Date (default: today), "Stock source" (default: "Available stock (no hold)"), and the opened batch already added as a line with Quantity 1 (default: 1).
7. Change "Quantity" in the line from 1 to 2 (required field; default 1). The row also shows Free, Rate excl. GST, Discount %, Scheme ₹, GST % inputs, which do not apply to a loss; "Total" and "Taxable/GST/Total" lines are shown.
8. Type in "Reason / notes" (placeholder "Required before posting"): "2 tubes broken while restocking shelf B-3" (required field).
9. Click "Post stock loss" (no confirmation dialog; the required reason is the only guard) → status "Posted", section "Confirmed stock effects" shows "Physical -2 · Held 0", document history lists the post event.

### Variations
- Meera wants to save and finish later: button "Save draft" instead of step 9 (draft "Draft • no stock change").
- Loss of a held batch: select the hold in "Stock source".
- Posted by mistake: button "Correct by reversal" appears only for approver roles (OWNER, ADMIN, MANAGER, DOCTOR) and needs "Reversal reason" and "Reverse posted effects"; a pharmacist must ask the doctor.

### Edge Cases
- Empty reason: server error "Enter a reason before posting".
- Quantity above available: server guard error; the "Recovery steps" panel offers "Inspect batch balance and holds".
- Network drop after submit: "Outcome not confirmed" with "Check saved status" so the loss is not posted twice.
- Back link "Back to loss & breakage" is an icon-only button.

---

## INVENTORY-DAILY-05: Meera proposes a new selling price for a batch

**Type**: medium
**Topic**: Inventory day to day
**Persona**: Meera Pillai, pharmacist; the distributor revised the price of Tacroz ointment 10 g, batch TZ2417, from ₹218 to ₹224
**Goal**: Request the price change so it takes effect after doctor approval.
**Preconditions**: PHARMACIST (roles OWNER, ADMIN, DOCTOR, PHARMACIST see "Edit price"); the batch exists at ₹218.
**Ideal path**: 6. Open Inventory with search (1), type (1), open the price editor from the row (1), type price (1), type reason (1), submit (1).
**Alternate paths**:
- Item page button "Edit price" (same dialog) after clicking the product name (+1 step).
- Item page "Edit item" opens "Correct saved details" but selling price is deliberately excluded there; stock and price are only changed through proposals.
- A new purchase bill ("Scan or enter bill") posting a batch with the new rate creates a new batch rather than editing this one.
- Drug Database page edits (discovery: separate Drug catalogue; not re-read here).
**Same information on several surfaces**: Selling price is in the Stock list row, item page "Edit price" dialog, the approval queue card ("Selling price: ₹218.00 → ₹224.00"), and pharmacy billing.

### Steps
1. Click "Inventory" in the sidebar.
2. Click "Find or correct stock".
3. Type "tacroz" in "Search stock".
4. Click "Search".
5. Click "Edit price" in the TZ2417 row (Edit column; each batch has its own pair "Edit price" / "Edit stock") → dialog "Edit price", text "Tacroz ointment 10 g · Batch TZ2417. The change takes effect after doctor or admin approval." and "Current selling price: ₹218.00".
6. Type "224" in "New selling price (₹ per stock unit)" (required field; default: current price 218, (app already knows this)) → panel "Check your changes — Not saved yet" shows "Selling price ₹218.00 → ₹224.00".
7. Type "Distributor revised rate from 12 Nov" in "Why are you changing it?" (required field; placeholder "e.g. Counted 8 tubes on the shelf today").
8. Click "Submit for approval" (the dialog is the confirmation; it guards a price change that would otherwise apply immediately) → dialog closes, banner "Submitted for doctor or admin approval." with link button "Open approval queue".

### Variations
- Stock instead of price: click "Edit stock", field "Counted physical stock (TUBES)" (default: current stock; must be a whole number of at least the held units), same reason and submit.
- Several batches of the same product need the new price: steps 5-8 repeat per batch (no multi-select for price).
- Doctor Anil submits his own change: the same queue lists it; whether he may approve his own proposal is not restricted in `InventoryUpdates.tsx` (backend rule not traced).

### Edge Cases
- Submit stays disabled until the value differs from the current one and the reason is not blank.
- Stock field shows "Enter a whole number of at least N. Include stock set aside." when below held units.
- Batch changed meanwhile (`expectedUpdatedAt` mismatch): "Could not submit. Try again." with the entered values preserved.
- RECEPTION and MANAGER do not see the Edit column at all.

---

## INVENTORY-DAILY-06: Dr. Anil clears the approval queue: a new item and a price edit

**Type**: medium
**Topic**: Inventory day to day
**Persona**: Dr. Anil Reddy, doctor and approver, between consultations
**Goal**: Approve Sunita's new-item request and Meera's price edit.
**Preconditions**: Signed in as DOCTOR. One pending new-item request ("Cetaphil Gentle face wash", from story 07) and one pending price edit (story 05). Sidebar entry "Inventory" shows a red count badge for pending new-item requests.
**Ideal path**: 3. Open Inventory (1); the Today queue shows each pending proposal with its before/after and one-tap Approve (2), (3); no dialog because the card already shows what is changing.
**Alternate paths**:
- Today row "Price/stock edits awaiting approval (n)" > tab "Price / stock"; sidebar "Inventory" badge > tab "New items"; Stock list banner link "Open approval queue" (after an edit submit); legacy `/dashboard/inventory-updates` redirect; Inventory > "Stock" > "Approve corrections". Four ways into one two-tab screen.
- Stock counts approvals live in a different queue (Stock counts > "Approvals"; Today "Counts awaiting your approval"), so a doctor checks two approval screens.
**Same information on several surfaces**: pending new items are counted in the sidebar badge, in the task label "Approve corrections (1)" and in the "New items" tab badge. Pending price/stock edits appear only in the Today row; the task label and badge do not count them.

### Steps
1. Click "Inventory" in the sidebar → Today with rows "Price/stock edits awaiting approval (1)" and others.
2. Click the row "Price/stock edits awaiting approval (1)" → "Approve corrections" opens, but on the tab "New items" ("New item requests"), because the default tab is New items whenever a new item is pending, regardless of which row was clicked.
3. Click "Approve" on the card "Cetaphil Gentle" (details list Form, Medicine name, prices, unit; "Requested by Sunita Rao · 13 Nov 2026"; the "Check before approving." warning appears only if a similar item or pending request exists) → dialog "Approve new item": "The item is added to inventory immediately."
4. Click "Approve" in the dialog (confirmation guarding creation of a stock item; no note field on approve) → toast "Item approved and added to inventory"; the card moves to "History".
5. Click the tab "Price / stock" → heading "Price / stock approval queue", "1 pending request".
6. Click "Approve" on the card "Tacroz ointment 10 g" (shows "Batch: TZ2417", "Selling price: ₹218.00 → ₹224.00", "Reason: Distributor revised rate from 12 Nov", requester and time) → dialog "Approve inventory change".
7. Type in "Review note" (optional; placeholder "Optional note").
8. Click "Approve" in the dialog → toast "Inventory change approved"; the queue empties ("No pending price or stock edits.").

### Variations
- Reject a new item: click "Reject" > dialog "Reject new item" > required "Reason for rejection (required)" (button stays disabled until typed).
- Reject a price edit: "Reject" > "Reject inventory change" with an optional note.
- Request is a duplicate: card shows the duplicate warning ("An item with this name is already in inventory...").

### Edge Cases
- Another approver already decided: 409 shows a banner "... The list below is up to date." and the dialog closes.
- MANAGER role: the "Approve corrections" task is hidden (MANAGER is not an approver role).
- RECEPTION opening "Approve corrections" sees only "My item requests" with status "Waiting for doctor".
- The task label "Approve corrections (1)" counts only new items, so a queue holding only a price edit shows no number on the tab bar.

---

## INVENTORY-DAILY-07: Sunita requests a new item for the pharmacy catalogue

**Type**: medium
**Topic**: Inventory day to day
**Persona**: Sunita Rao, receptionist; the dermatologist wants "Cetaphil Gentle" face wash 125 ml stocked and nobody has added it
**Goal**: Request the new item so the doctor can approve it into inventory.
**Preconditions**: Signed in as RECEPTION (has full inventory item create permission, shown as button "Add batch"); the item is not yet in stock list.
**Ideal path**: 7. Reach the add form in 2 (Inventory > "Add item"), type name (1), pick form (1), type cost (1), type selling price (1), submit (1); the quantity and batch come later from a purchase bill.
**Alternate paths**:
- Pharmacy Desk > Drugs page "add drug" and the PrescriptionBuilder "+ Add to Drug Database" create items in the separate Drug catalogue (two catalogues: Drug and InventoryItem; per discovery).
- "Manual opening stock" (Inventory > Stock > "More tasks..." > "Manual opening stock" > "New document") creates a batch with quantity, and "Opening stock import" bulk-loads.
- A purchase bill ("Scan or enter bill") that includes an unknown product creates the item during intake.
**Same information on several surfaces**: the dialog title is "Add Inventory Item", while the button that opens it is "Add batch" and the Today button is "Find or correct stock"; the same fields later appear on the item page "Item details" and in the approval card.

### Steps
1. Click "Inventory" in the sidebar → Today.
2. Click "Find or correct stock" → Stock list.
3. Click "Add batch" (top right of "Stock") → dialog "Add Inventory Item" ("Fields marked with * are required.").
4. Click the select "Form" in the "Name on prescriptions" box (required field, default: "Choose the form").
5. Choose "Face wash" (selection; "Type *" above stays "Medicine", default: Medicine).
6. Type "Cetaphil Gentle" in "Medicine name *" (required field; hint "Only the name: no form, strength, code or pack size"); the live line shows "Prints as Cetaphil Gentle face wash". "Strength" is optional for this form (shown as "Strength (optional)"; it would be required for Tablet, Capsule or Syrup).
7. Type "310" in "Cost Price (₹) *" (required field).
8. Type "385" in "Selling Price (₹) *" (required field).
9. Type "425" in "MRP (₹)" (optional).
10. Click the select "Unit *" (default: Pieces).
11. Choose "Bottles" (optional change).
12. Click "Add Item" → dialog content switches to title "Sent to doctor for approval": "Sent to doctor for approval. The item will appear in inventory once approved." plus a duplicate warning if a similar item exists.
13. Click "Close" (dismisses the confirmation) → back to the Stock list; the item does not appear yet.

### Variations
- Tablet type: "Strength" becomes required and a unit prompt "Which unit?" with chips mg, mcg, g, IU, % appears if the typed strength has no unit (extra click).
- Combination product: tick "Combination product" and strength is disabled.
- Non-medicine (Equipment, Supply, Consumable): "Item Name *" replaces the Name box and the "Name on prescriptions" box disappears.
- Added by Dr. Anil, Meera or the owner: the item is created straight away; the dialog closes and the list reloads (no approval).

### Edge Cases
- Missing form or name: inline errors below the fields and focus moves to the first one.
- Same name/SKU/barcode already exists: server refuses ("assertItemIdentifiersFree"); error shows inside the dialog.
- Many optional sections (Description, Generic Name, Category, Sub-Category, Manufacturer, Supplier, Prescription defaults, Item code, Barcode, SKU, Pack Size, Pack Unit, Min/Max Stock, Reorder Level/Qty, Batch Number, Expiry Date, HSN Code, GST Rate, Storage Location, Storage Conditions, two checkboxes) are all on one scrolling form; there is no field for opening quantity, so the new item starts at 0 stock and needs a purchase bill, "Manual opening stock" or an approved "Edit stock" before it can be sold.
- The "Cost Price" label here is called "PTR" and "Purchase cost" elsewhere in the stock list.

---

## INVENTORY-DAILY-08: Rajesh corrects a wrongly keyed stock movement

**Type**: medium
**Topic**: Inventory day to day
**Persona**: Rajesh Agarwal, owner, reviewing a manual adjustment someone keyed as +50 for Adapalene gel 0.1% 15 g that should have been +5
**Goal**: Replace the wrong movement with a linked correction that keeps the original entry visible.
**Preconditions**: Signed in as OWNER (approver roles OWNER, ADMIN, MANAGER, DOCTOR with adjustment permission). The +50 row is a manual entry, not tied to a purchase bill or inventory document.
**Ideal path**: 6. Open Inventory with search (1), type (1), open the item's ledger row with a "Correct" action (1), type the right quantity (1), type reason (1), post (1).
**Alternate paths**:
- Stock ledger (Inventory > "Stock" > "Stock ledger") shows the same movements, with links to documents, but no "Correct" action; the user must go to the item page.
- Item page tab "Sales" is the ledger table filtered to sales and offers the same "Correct".
- Item "Edit stock" proposal sets an absolute quantity (needs doctor approval; does not retain the movement link).
- A fresh approved stock count (story 09) restates the quantity without touching the wrong row.
- Posted workflow documents (loss, challans, returns) are corrected through "Correct by reversal" in their own editor instead.
**Same information on several surfaces**: each movement is listed in Stock ledger (grouped by day, with balance before → after), item "Ledger" tab (In, Out, Batch closing, Item closing), item "Sales" tab, and the "Corrections" register (Inventory > Stock > "Corrections").

### Steps
1. Click "Inventory" in the sidebar.
2. Click "Find or correct stock".
3. Type "adapalene" in "Search stock".
4. Click "Search".
5. Click the product name link of the row → item page.
6. Click the tab "Ledger" → "Ledger matches stock on hand" or "Ledger does not match" banner, filters From / To / Type, "Download CSV", and the table with the Action column.
7. Click "Correct" on the +50 row (the Action column appears only for approvers; other rows show "Open purchase correction", "Open source correction" or "Open original sale") → inline form opens under the table.
8. Type "5" in "Correct signed quantity" (required field; default: the row's current quantity "50", (app already knows this)).
9. Type "Keyed 50 instead of 5 during opening entry" in "Reason" (required field).
10. Click "Post linked correction" (posts immediately; there is no confirmation dialog) → opens the "Corrections" document `COR-...` with status "Posted", "Confirmed stock effects" "Physical -45", and history.

### Variations
- Cancel: button "Cancel" next to "Post linked correction" discards the form.
- Entering the same quantity as already recorded: server error "This movement already has the requested corrected quantity".

### Edge Cases
- Pharmacist or receptionist: Action column is empty; they cannot correct (they use "Edit stock" proposals).
- Row from a purchase bill or workflow: no direct "Correct"; server refuses "Correct the source workflow or invoice".
- Unknown direction in historical rows: "Historical direction is unknown; record an approved physical count instead".
- Ledger rows with an unrecorded stock jump are highlighted and explained ("stock that changed without a ledger entry").

---

## INVENTORY-DAILY-09: Shelf B-3 looks short: spot count, doctor approval, and ledger check

**Type**: long
**Topic**: Inventory day to day
**Persona**: Meera Pillai (pharmacist) in the evening, then Dr. Anil Reddy (doctor) the next morning, then Meera again
**Goal**: Count shelf B-3 outside the cycle, get the difference approved, and confirm the stock figure and ledger afterwards.
**Preconditions**: Reconciliation on; shelf "B-3" holds 4 batches in stock; one (Tacroz ointment 10 g, TZ2417) is really 2 short. Meera has count permission; Dr. Anil is an active approver (DOCTOR/ADMIN/OWNER can decide counts).
**Ideal path**: 10. Pharmacist: start a shelf count in 2 (Inventory, "Count shelf" action), pick shelf (1), type only the exception with the rest confirmed as matching (1+1), sign with reason (2). Doctor: open Inventory and approve with the prefilled reason (2). Verify: 1 click from the approval toast to the ledger entry.
**Alternate paths**:
- Start the shelf count from the Stock list: "Filters" > select "Rack / shelf / bin" > "Count matching batches" (3 steps).
- From the item page: "Count this batch" for one batch.
- Today row "Stock count due today" for cycle lists.
- Approve via Today row "Counts awaiting your approval" (story step 19) or Stock counts > tab "Approvals" (same record).
- Fixing quantity with "Edit stock" proposals (stories 05/06) is a separate approval queue with similar effect.
**Same information on several surfaces**: counted difference appears in the sheet footer ("n of n counted · 1 differ"), sign-off dialog, locked record, approval dialog ("8 now → 6"), "History" tab, Stock ledger (method "Stock count"), item "Ledger" tab, and the Today cards "Counts awaiting your approval" and "Batches not counted this cycle".

### Steps
1. Click "Inventory" in the sidebar → Today.
2. Click the area button "Stock" → Stock list (first task "Stock list" shown as selected).
3. Click the task button "Stock counts" (fifth primary Stock task) → tab "My counts": "Cycle ... day x of y" and either assigned lists or "Nothing to count right now".
4. Click "Count an item" → dialog "Count an item or a shelf" ("Outside the cycle, for an item or a shelf that looks wrong...").
5. Click "Shelf / location" (radio; default: "Item or batch").
6. Click the "Shelf" select (default: "Choose a shelf").
7. Choose "B-3 · 4 batches" → all 4 batches are listed and ticked (default: all ticked; checkbox "Select all 4 on B-3").
8. Click "Count 4 batches" → count sheet opens, assigned to Meera.
9. Type "12" for Tacroz ointment 10 g TZ2417 (required field; system shows 14; difference −2 appears).
10. Type "20" for Adapalene gel 0.1% AD9032 (required field; (app already knows this): System 20).
11. Type "15" for Isotroin 20 mg capsule IS5518 (required field; (app already knows this): System 15).
12. Type "30" for Cetaphil Gentle CG2207 (required field; (app already knows this): System 30).
13. Click "Note" on the TZ2417 line (optional; opens automatically because it differs).
14. Type "Two tubes with expired seal binned earlier, not recorded" in "Why it differs (optional)" (optional).
15. Click "Sign off count".
16. Type the same explanation in "Why do these differ? (required)" in dialog "Sign off this count" (required because a batch differs; repeats step 14, (app already knows this)).
17. Click "Sign off and send for approval" (confirmation: locks the count; stock changes only on approval) → toast "Count signed off and sent for approval."
18. Dr. Anil signs in and clicks "Inventory" in the sidebar → Today shows a card "Counts awaiting your approval" (1) with the split "₹... short" and "Stock changes only when you approve."
19. Click the row "Counts awaiting your approval" → Stock counts, tab "Approvals" (table "Counts awaiting approval": Date, Counted by, Signed at, Items, Differences, Short ₹, Net ₹, Action).
20. Click "Review" in the row (the row itself is also clickable) → locked record "Signed by Meera Pillai on ..." with the differing batch first and a button "Show all 4 batches".
21. Click "Approve and adjust stock" (sticky footer; "Stock changes only when you approve.") → dialog "Approve and adjust stock" listing "12 now → ..." and "Stock value changes by −₹...".
22. Click "Approve and adjust stock" in the dialog (reason is prefilled with "Physical count signed by Meera Pillai on 12 Nov 2026" (default: prefilled), so no typing is needed; confirmation guarding the stock adjustment) → toast "Approved. Stock adjusted."
23. Meera clicks the area button "Stock" in Inventory.
24. Click the task button "Stock ledger" → ledger for the last 30 days (default: From = 30 days back, To = today).
25. Type "tacroz" in Search ("Product, batch or reference"; optional) → today's group shows an entry "−2 TUBES Tacroz ointment 10 g · Batch TZ2417", badge "Stock count", balance "14 → 12", actor Dr. Anil Reddy.

### Variations
- The count is a cycle list on Today: steps 3-8 collapse to "Stock count due today" (see story 03).
- Dr. Anil rejects: "Reject" > "Reject this count" with typed reason; stock stays unchanged and the batches return to the cycle.
- Only one approver exists and Meera is not an approver; if the OWNER is the sole approver deciding his own count, the dialog adds a required tick "I signed this count and no other approver is active in this branch...".
- Stock moved after the count: dialog notes "It was 14 when counted; stock has moved since" and applies the difference to today's stock.

### Edge Cases
- Meera opens her own signed count: banner "You signed this count, so someone else decides it. Ask Dr. Anil Reddy."
- A batch is already on another undecided count: its checkbox is disabled with "On <name>'s count of <date>, waiting for approval."
- Shelf has no stock: "No batch in stock on B-3."
- Rejected or cancelled counts do not change the Today card "Batches not counted this cycle".
