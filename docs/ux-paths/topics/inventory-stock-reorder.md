# Stock control, counts & reorder

> Topic slug: `inventory-stock-reorder`. Read-only analysis of the code as it stands.
> Route: `/dashboard/inventory` (`frontend/src/app/dashboard/inventory/page.tsx` → `components/inventory/InventoryWorkspace.tsx`).
> Labels in "quotes" / `code font` are the literal strings in the source. Anything not read directly is marked *(inferred)* or *(label unverified)*.

## How the workspace is driven (context for every story)

- One page, five **areas** as top buttons (`nav aria-label="Inventory areas"`): **Today · Purchases · Stock · Sales · Reorder**. Clicking an area pushes `?area=<id>` and drops every other parameter.
- Each area has a **task strip**. The first *n* tasks are buttons (5 for Stock, 3 for the others); the rest sit in a `More tasks…` select. On phones the whole strip is one `Task` select.
  - Stock buttons: `Stock list` (`view=list`) · `Stock optimization` (`optimize`) · `Stock ledger` (`ledger`) · `Approve corrections` (`approvals`) · `Stock counts` (`COUNT`). In `More tasks…`: `Loss & breakage` (`LOSS`) · `Blocked stock` (`HOLD`) · `Corrections` (`CORRECTION`) · `Manual opening stock` (`OPENING_STOCK`) · `Opening stock import` (`opening`).
  - Reorder buttons: `Shortbook` (`SHORTBOOK`) · `Purchase orders` (`PURCHASE_ORDER`) · `Target proposals` (`TARGET_REVIEW`). In `More tasks…`: `Manual targets & exclusions` (`targets`) · `Automation settings` (`settings`) · `Monitor` (`monitor`).
- State lives in the query string: `area`, `view`, `item` (+ `itemTab`), `document`, `new`, `return`, `page`, stock filters (`search`, `stock`, `expiryMonths`, `batchView`, `gap`, `sortBy`, `category`, …), ledger filters (`ledgerFrom`, `ledgerTo`, `ledgerChannel`, `ledgerDirection`, `ledgerSearch`, `ledgerPage`), count filters (`tab`, `from`, `to`, `q`, `state`, `person`, `sort`, `dir`), optimization (`run=1`), reorder filters (`search`, `from`, `to`, `status`, `gstin`).
- Exceptions that are **not** in the URL: the `Price / stock` vs `New items` tab inside Approve corrections, the stock list's `Filters` panel open/closed and `Show cost & stock details`, the item ledger's From/To/Type filter.
- Capabilities come from `GET /inventory/workspace/capabilities`; until they load the page shows "Loading inventory permissions…", and on failure an alert with `Retry permissions`.
- Purchase-bill intake (`Scan or enter bill`, CSV, Gmail, inward challans, supplier returns, credit notes) belongs to the purchases topic; stories below stop at the hand-off.

---

## STORY-094: Check whether a medicine is in stock and read its batches

**Type**: short
**Topic**: Stock control, counts & reorder
**Persona**: Kavya Reddy, pharmacist, a patient is waiting at the counter and the doctor has just asked "do we still have Isotroin 20?"
**Goal**: See how many strips of Isotroin 20 mg are available, in which batches, and where they are shelved.
**Preconditions**: Signed in as PHARMACIST; at least two batches of the item exist.
**Ideal path**: 2 — type the name into one always-visible search and read the answer (quantity, batch, shelf) in the result row.
**Alternate paths**:
- Sidebar `Inventory` → area button `Stock` (Stock list is the default task) instead of Today's `Find or correct stock`.
- Scan the pack barcode into `Search stock` (placeholder "Type a product name or scan a barcode").
- `Stock ledger` → search → click the product name in any movement → item page (`InventoryLedger.tsx` `onItem`).
- Deep links that open the item page directly: Pharmacy Report › Item Wise Margin (`ItemMarginReport.tsx`), a posted purchase line in the purchase workbench (`PurchaseInvoiceWorkbench.tsx`), the "Batch recovery reference" link printed on the item page itself.
- Pharmacy Desk quick action `Inventory Control` and the counter cockpit's `Inventory control` — both push `/dashboard/inventory?tab=pharmacy-control…`, which the workspace does not read, so they land on **Today** (one more click needed).
- The header global search does **not** search stock (patients / appointments / staff only, per `discovery.md`).
- Stock also appears, read-only, in the prescription builder's medicine search and the counter's "Pick Assist" (other topics).

### Steps
1. Click `Inventory` in the sidebar → `/dashboard/inventory`; "Loading inventory permissions…" then the **Today** area: buttons `Scan or enter bill` and `Find or correct stock`, a "Data quality" strip, and "What needs attention".
2. Click `Find or correct stock` → URL becomes `?area=stock&view=list`; heading "Stock"; every batch is listed (batch view defaults to `All batches`, including empty ones).
3. Type `isotroin` in "Search stock" and press Enter (or click `Search`) → URL gains `search=isotroin&page=1`; a chip "search: isotroin ×" appears under "Active filters"; `Sort` shows "Best match"; status line reads "2 matching batches".
4. Read the two rows: "Product / batch" (name, pack label, batch number), "Batch state" badge ("Current / on hand"), "Expiry", "Available" (`30 STRIPS`, with "5 set aside" beneath if anything is held), "Selling price", "Location" ("Rack A-3" or "Not assigned").
5. (Only if she needs cost, MRP or totals) click the product name → `&item=<id>`; item page header shows "Current stock 42 STRIPS · 5 held · 37 available" and the `Batches` tab lists every sibling batch with Qty, Expiry, MRP, PTR, totals.

### Variations
- **Batch view**: `Current / on hand` hides empty batches; `Previous / depleted` shows only empty ones. Kavya may be thrown by depleted batches appearing first under the default `All batches`.
- **More columns**: tick "Show cost & stock details" to add Physical, Held, Stock unit, Purchase cost, MRP — the same numbers the item page shows again in its Batches tab.
- **Fuzzy / alias match**: a mistyped "isotrion" still matches, with "Similar spelling: …" under the name; an item renamed earlier shows "Matched earlier name: …".
- **Reception role**: same list, but no `Edit` column (`canSubmitEdits` is OWNER/ADMIN/DOCTOR/PHARMACIST only).
- **Phone**: areas wrap; the task strip becomes a `Task` select.

### Edge Cases
- **Nothing found**: table row "No batches match these filters. Reset or change the search." (`Reset` clears every parameter except `area`/`view`).
- **Request fails**: red alert with the server message and an inline `Retry`; status line "Stock results unavailable".
- **Scanned QR label**: a search beginning `purchase:` opens that purchase bill in Purchases; one beginning `inventory-document:` opens the workflow document — the search box silently changes area.
- **Active-filter chips show raw parameter names** ("stock: LOW ×", "expiryMonths: 3 ×", "batchView: ALL ×") rather than the labels used in the selects.
- **Negative stock**: state badge "Negative stock — count needed" in red.

---

## STORY-095: Trace why a batch went down in the Stock ledger

**Type**: short
**Topic**: Stock control, counts & reorder
**Persona**: Dr. Anjali Rao, dermatologist and clinic owner (DOCTOR role), Friday evening review
**Goal**: Find out who took Momate cream out of stock this week and under which bill.
**Preconditions**: Stock movements exist in the last 7 days.
**Ideal path**: 3 — open the ledger, type the product, read the rows.
**Alternate paths**:
- Item page › `Ledger` tab (per-item ledger with its own From / To / Type filter, `Download CSV`, and a reconciliation banner "Ledger matches stock on hand" / "Ledger does not match").
- Item page › `Sales`, `Purchases`, `Purchase returns`, `Sales returns`, `Blocked stock` tabs — each is a slice of the same movement history.
- Today › "Recent activity" list (workflow documents only).
- Pharmacy Report registers (other topic).

### Steps
1. Sidebar `Inventory` → area `Stock` → URL `?area=stock` (Stock list by default).
2. Click task `Stock ledger` → `?area=stock&view=ledger…`; "Loading stock ledger…" then movements for the last 30 days, newest first, grouped under sticky clinic-day headings ("12 Nov 2026 · 14 changes").
3. Click the `7 days` preset chip → `ledgerFrom` / `ledgerTo` are set and the chip shows pressed.
4. Type `momate` in "Search" (placeholder "Product, batch or reference"); after 300 ms the URL gains `ledgerSearch=momate`.
5. Click `Stock out` in the "Direction" group → `ledgerDirection=OUT`.
6. Read each row: signed change ("−2 tubes"), product name (link), "Batch MC2231", a coloured method badge ("Pharmacy bill", "Prescription dispensed", "Approved stock edit", "Stock count"…), the document ("Rx bill PH-2026-01184"), counterparty, time · actor, and balance "14 → 12".
7. (Optional) click the document link → for pharmacy bills the browser goes to `/dashboard/pharmacy/invoices?search=<bill no>`; for purchase bills and workflow documents it stays inside Inventory.

### Variations
- **Method filter**: `Method` select lists 16 channels (Purchase invoice, Opening stock, Customer return, …, Manual entry).
- **Export**: `Export CSV` downloads only the rows of the current page (50) as `stock-ledger-<from>-to-<to>.csv`.
- **From the item**: clicking the product name opens the item page with a `return=` back-link, so "Back to stock list" returns to the ledger with its filters intact.

### Edge Cases
- **Empty**: dashed box "No stock changes match these filters — Widen the date range or clear the method and direction filters."
- **Too many movements**: amber note "This range holds more than N movements. Only the newest are shown. Narrow the dates or search for a product to see the rest."
- **Failed read**: red box with the error, "Reading the ledger never changes stock." and `Try again`.
- **Same bill, two destinations**: the Stock ledger opens a pharmacy bill in the *Pharmacy Invoices list* (`/dashboard/pharmacy/invoices?search=`), the item-page ledger opens the same bill in the *Sales bill view* (`billHref({ bill })`).
- **Same concept, two vocabularies**: Stock ledger says "Method" / "Stock in · Stock out" / `Export CSV` / pager "Newer · Older"; the item ledger says "Type" (Sale, Purchase, Return, Adjustment) / "In · Out" / `Download CSV`.

---

## STORY-096: Pharmacist requests a new item and the doctor approves it

**Type**: medium
**Topic**: Stock control, counts & reorder
**Persona**: Sana Fatima, pharmacist, unpacking a sample order; then Dr. Anjali Rao (DOCTOR) between patients
**Goal**: Get "Venusia Max lotion 150 ml" into inventory so it can be prescribed and sold.
**Preconditions**: Sana is PHARMACIST (holds `inventory:item:create`, cannot approve). The item does not exist yet.
**Ideal path**: 6 — open the add form, enter name, price, batch + expiry + quantity on one screen, submit; approver opens the request and approves in one click.
**Alternate paths**:
- Reception can raise the same request (`@Roles(ADMIN, PHARMACIST, RECEPTION)` on `POST /inventory/items`).
- OWNER / ADMIN / DOCTOR using the same `Add batch` button create the item immediately — no "Sent to doctor" step.
- Post a purchase bill containing the product (Purchases › `Scan or enter bill` — creates the item implicitly; other topic).
- Stock › `More tasks…` › `Opening stock import` (Excel creates drugs and batches; STORY-104).
- Drug database `Add New Drug` and the prescription builder's `+ Add to Drug Database` create a *drug* without a stock batch (other topics; listed as lead A.12 in `discovery.md`).
- Reaching the approval queue: sidebar badge → Inventory → Stock → `Approve corrections (n)`; or the legacy URL `/dashboard/inventory-updates` (redirects to `?area=stock&view=approvals`).

### Steps
1. Sana: sidebar `Inventory` → area `Stock`.
2. Type `venusia` in "Search stock", press Enter → "No batches match these filters. Reset or change the search." (she is checking for a duplicate first).
3. Click `Add batch` (top right) → dialog titled **"Add Inventory Item"** ("Add a new item to your inventory. Fields marked with * are required."). She pauses: the button said *batch*, the dialog says *item*.
4. Leave "Type *" as `Medicine`. In the "Name on prescriptions" box choose "Form *" = `Lotion`, type "Medicine name *" = `Venusia Max`; "Strength (optional)" stays empty. The line "Prints as …" updates live as she types *(exact printed casing not verified)*.
5. Fill "Manufacturer" = `Dr. Reddy's Laboratories`, "Category" = `Moisturiser`.
6. Scroll to "Pricing": "Cost Price (₹) *" = `285.00`, "Selling Price (₹) *" = `399.00`, "MRP (₹)" = `399.00`.
7. "Unit & Packaging": "Unit *" = `Bottles`, "Pack Size" = `150`, "Pack Unit" = `ml`.
8. "Stock Levels": "Min Stock" = `4`, "Reorder Level" = `6`.
9. "Additional Details": "Batch Number" = `VM2407`, "Expiry Date" = `30/06/2028`, "HSN Code" = `33049910`, "GST Rate (%)" = `18`, "Storage Location" = `Rack C-2`.
10. She looks for a quantity field for the 6 bottles in her hand — there is none (the form has ~40 fields, none for stock on hand). She decides to sort that out later.
11. Click `Add Item` → the dialog swaps to **"Sent to doctor for approval"** ("…The item will appear in inventory once approved."). If a similar name or a second pending request exists, an amber "Possible duplicate" box lists it.
12. Click `Close`.
13. Dr. Anjali: notices the red count badge on the sidebar `Inventory` entry, clicks it, then area `Stock`.
14. Click task `Approve corrections (1)` → two tabs `Price / stock` and `New items`; `New items` is pre-selected because a request is pending. Heading "New item requests", section "Waiting for review (1)".
15. Read the card: item name, a grid (Manufacturer, Type, Category, Unit, Pack size, Batch, Expiry, MRP, Cost price, Selling price, GST %, HSN, Min stock, Reorder level), "Requested by Sana Fatima · 13 Nov 2026, 11:42", and any "Possible duplicate. Check before approving." box.
16. Click `Approve` → dialog "Approve new item" ("Venusia Max lotion. The item is added to inventory immediately.").
17. Click `Approve` in the dialog → toast "Item approved and added to inventory"; the card moves to "History" as "Approved by Dr. Anjali Rao · …".

### Variations
- **Reject**: `Reject` → dialog "Reject new item" with "Reason for rejection (required)"; the `Reject` button stays disabled until text is entered; toast "Item request rejected"; Sana sees the note under "My item requests" › History.
- **Requester's view**: for Sana the same task shows the `Price / stock` tab first and, under `New items`, the heading "My item requests" with "Waiting for a doctor (1)". Reception sees only "My item requests" (no tabs).
- **Non-medicine**: choosing Type `Supply` / `Consumable` / `Equipment` replaces the naming box with plain "Item Name *" and "Brand Name".
- **Naming validation**: a Tablet/Capsule/Syrup without strength is refused; focus jumps to the offending field with an inline error.

### Edge Cases
- **The approved item has zero stock**: `createInventoryItem` sets `currentStock: 0`, so the new batch appears in the stock list as "Previous / depleted" (grey) — a brand-new item labelled as a used-up one. Sana must now do a *second* flow to enter the 6 bottles: `Edit stock` (another approval, STORY-098), a `Manual opening stock` document, a stock count, or a purchase bill.
- **Another approver got there first**: a 409 shows a red banner "<message>. The list below is up to date." and the dialog closes.
- **Server error on submit**: red box at the bottom of the long form; the form keeps its values.
- **Approver naming drift**: the dialog says "doctor", the price/stock queue says "doctor or admin", workflow documents say "manager", counts say "doctor or administrator".
- **MANAGER role**: can approve counts and purchase orders but does not get the `Approve corrections` task at all (`canSeeApprovals` excludes MANAGER).

---

## STORY-097: Correct a batch's expiry and shelf, then set a stock alert

**Type**: medium
**Topic**: Stock control, counts & reorder
**Persona**: Sana Fatima, pharmacist, tidying the "Data quality" gaps on a quiet afternoon
**Goal**: Fix a mis-keyed expiry and missing shelf on Tacroz Forte ointment, and set a minimum so it shows as low stock in time.
**Preconditions**: Batch `TF2291` exists with expiry 31/12/2025 (should be 2026), no location, no min/max. Sana holds `inventory:item:update`.
**Ideal path**: 5 — open the batch, change expiry + shelf + minimum in one form, give one reason, save once.
**Alternate paths**:
- Item page › `Batches` tab › row `Edit` (same editor, for any sibling batch).
- Stock list: tick rows → `Set location for N selected batches` → "Rack / shelf / bin" + "Reason" → `Apply reviewed location` (location only, bulk).
- Reorder › `More tasks…` › `Manual targets & exclusions` (min / max / reorder level for many items, with a review step and a reason).
- Reorder › `Target proposals` → `Accept selected` (system-proposed min / max; STORY-103).
- "Data quality" strip chips `Missing location` / `Missing min/max` (Today and Stock list) → filtered list (`gap=LOCATION|MIN_MAX`) → open item.
- Stock list `Filters` › "Missing information" select — a second, differently-keyed way (`missing=`) to list incomplete batches.
- Min/max can also be typed at creation ("Stock Levels" in "Add Inventory Item") and arrive via the opening-stock Excel.

### Steps
1. Sidebar `Inventory` → area `Stock`; type `tacroz`, press Enter.
2. Click the product name → item page (`&item=<id>`). The "Item details" strip shows "Location Not set", "Min qty Not set", "Max qty Not set"; the header badge reads "Expired, on hand" in red because of the wrong year.
3. Click `Edit item` → an inline section appears *above* the tabs: "Editing batch TF2291", form "Correct saved details" ("Check the pack or original bill. These changes apply to this batch; the original bill stays in history.").
4. Change "Expiry date" from 31/12/2025 to 31/12/2026.
5. Type "Rack / shelf" = `Rack B-4`.
6. A "Check your changes" block appears with a "Not saved yet" badge and one line per field: saved value → new value.
7. Type "Why are you changing it?" = `Expiry mis-keyed at intake; checked the tube`.
8. Click `Save corrected details` → status "Corrected details saved. Stock quantity unchanged."; the header badge turns "Current / on hand".
9. Click `Set stock alert` → the *same* editor opens again, this time with "More details: tax, stock limits & codes" expanded and the cursor in "Minimum stock".
10. Type "Minimum stock" = `5` and "Reorder at" = `8`.
11. The reason field is empty again — type `Alert level set after November stock-out`.
12. Click `Save corrected details` → saved; the strip now shows "Min qty 5 TUBES".

### Variations
- **One pass**: an experienced user opens `Edit item`, expands "More details…" herself and does steps 4–10 with a single reason and a single save (8 steps). `Set stock alert` is only a shortcut into the same form.
- **Suggested standard name**: for an old item without a form, the editor offers "Suggested from the recorded name: **<standard name>**" with `Use suggestion` (fills Form, Medicine name, Strength, Combination and Item code).
- **Availability**: inside "More details…" the "Availability" select (Active / Inactive / Discontinued) retires a batch without deleting it.
- **Delete instead**: `Batches` tab › `Delete` works only when the server marks the batch deletable; otherwise the button is disabled and the blocking reason is printed under it. Confirm dialog "Delete batch TF2291?" → `Delete batch`.

### Edge Cases
- **Nothing changed or no reason**: `Save corrected details` stays disabled.
- **Leave mid-edit**: the draft is kept in `sessionStorage`; on return "Restored unsaved product details." or, if someone else saved meanwhile, "This product changed since your edits. Saving will require reloading the current record."
- **Quantity and selling price are deliberately absent** from this form (they go through `Edit stock` / `Edit price` and approval). Details save immediately; a one-unit quantity fix needs a doctor.
- **One concept, many names**: "Set stock alert" (button) = "Minimum stock" / "Reorder at" (editor) = "Min qty" / "Max qty" (item strip) = "Min Stock" / "Reorder Level" / "Reorder Qty" (add dialog) = "Minimum" / "Maximum" / "Reorder level" (manual targets) = "Missing min/max" (data-quality chip) = "targets" (Reorder).
- **"Location" drift**: "Location" (list column, strip) / "Rack / shelf" (editor) / "Rack / shelf / bin" (filter, bulk form) / "Storage Location" (add dialog) / "Shelf / location" (count dialog).

---

## STORY-098: Propose a stock-quantity edit and get it approved

**Type**: medium
**Topic**: Stock control, counts & reorder
**Persona**: Ravi Teja, pharmacist, restocking the counter display; then Dr. Anjali Rao approving
**Goal**: Make the system say 8 tubes of Acnestar gel instead of 10, because two were opened as testers.
**Preconditions**: Batch `AG0917` shows 10 TUBES, none held. Ravi is PHARMACIST.
**Ideal path**: 4 — click the quantity, type 8 and a reason, submit; approver approves from a notification.
**Alternate paths** (lead A.14 in `discovery.md`, confirmed in code):
- Item page action row `Edit stock` (same dialog).
- A stock count: stock list `Count selected batches`, item page `Count this batch`, or Stock counts › `Count an item` → sign-off → `Approve and adjust stock` (STORY-099/007).
- `Loss & breakage` document (`Post stock loss` — posts immediately, **no approval**).
- Item page › `Ledger` tab › row `Correct` → "Correct signed quantity" + "Reason" → `Post linked correction` (shown to approvers only; creates a `Corrections` document).
- For price: row `Edit price` / item page `Edit price` (same dialog with "New selling price (₹ per stock unit)").
- Approval queue entry points: Today row "Price/stock edits awaiting approval (n)"; Stock › `Approve corrections`; the notice link `Open approval queue`; legacy `/dashboard/inventory-updates`.

### Steps
1. Ravi: sidebar `Inventory` → area `Stock`; search `acnestar`.
2. In the row's "Edit" column click `Edit stock` → dialog **"Edit stock"** ("Acnestar gel · Batch AG0917. The change takes effect after doctor or admin approval."), "Current stock on shelf: 10 TUBES".
3. The field "Counted physical stock (TUBES)" is pre-filled with 10; replace it with `8`. Hint: "Count this batch only. Include the 0 units set aside." A "Check your changes — Not saved yet" block shows "Stock (TUBES) 10 → 8".
4. Type "Why are you changing it?" = `Counted 8 on the shelf; 2 opened as testers` (placeholder "e.g. Counted 8 tubes on the shelf today").
5. Click `Submit for approval` → dialog closes; status banner "Submitted for doctor or admin approval." with a link `Open approval queue`. The row still shows 10.
6. (Optional) Ravi clicks `Open approval queue` → Stock › Approve corrections; he sees his request under "Price / stock approval queue" but no Approve/Reject buttons.
7. Dr. Anjali: sidebar `Inventory` → **Today** lists "Price/stock edits awaiting approval (1)" with a large "1" beside it (the count is printed twice in the row).
8. Click that row → `?area=stock&view=approvals`.
9. If a new-item request is also pending, the screen opens on the **`New items`** tab, not on the price/stock edits she clicked — she has to click the `Price / stock` tab.
10. Read the card: "Acnestar gel", "Batch: AG0917 · TUBES", "Batch physical stock: 10 → 8", "Reason: Counted 8 on the shelf; 2 opened as testers", "Ravi Teja · 13 Nov 2026, 16:05".
11. Click `Approve` → dialog "Approve inventory change" with an optional "Review note".
12. Click `Approve` → toast "Inventory change approved"; the queue reloads ("0 pending requests"); stock list and Pharmacy Desk figures refresh through window events.

### Variations
- **Reject**: `Reject` → "Reject inventory change" ("Close this request without changing stock or price.") → `Reject`; a note is optional here (but mandatory when rejecting a *new item*).
- **Price edit**: same flow; preview shows "Selling price ₹180.00 → ₹195.00"; decimals allowed.
- **Why not just record a loss?** Ravi could post `Loss & breakage` for 2 tubes in one go with no approver — the two routes have opposite controls for the same shelf reality.

### Edge Cases
- **Below held stock / decimals**: "Enter a whole number of at least N. Include stock set aside."; `Submit for approval` disabled. Unchanged value or blank reason also keeps it disabled.
- **Stale row**: the request carries `expectedUpdatedAt`; if the batch changed, the server refuses and the dialog shows the message while keeping the inputs.
- **Legacy rows**: old requests appear as "Legacy product-total edit" with "No reason recorded (legacy request)".
- **Three counters that do not agree**: the task label `Approve corrections (n)` and the sidebar badge count pending **new-item requests**; the Today row counts pending **price/stock edits**; the `New items` tab badge repeats the first number.
- **"Corrections" ≠ "Approve corrections"**: the former (in `More tasks…`) is a register of posted movement corrections with no `New document` button; the latter is this approval queue, internally "Inventory Updates".

---

## STORY-099: Run a stock-count cycle end to end (set up → count → sign off → approve → verify)

**Type**: long
**Topic**: Stock control, counts & reorder
**Persona**: Meera Nair, clinic administrator (ADMIN), setting up on a Friday; Ravi Teja, pharmacist, counting on Saturday morning before OPD; Dr. Anjali Rao approving at lunch
**Goal**: Have every batch physically counted once a month, with differences approved before stock is adjusted.
**Preconditions**: Stock reconciliation is off. ~410 batches in stock. Ravi and Sana have count permission (`pharmacy:compliance:audit`).
**Ideal path**: 13 — settings on one screen (toggle, two numbers, people, save = 5); open today's list (1); enter counts (1 pass, however many rows); sign off with a note (2); approver opens the count and approves with a prefilled reason (3); glance at the result (1).
**Alternate paths**:
- Opening today's list: Today row "Stock count due today"; Stock › `Stock counts` › `My counts` › `Start counting` / `Continue counting`; a link "Open Stock counts" from workflow documents, the purchase workbench and the compliance centre (`?area=stock&view=COUNT`).
- Approving: Today row "Counts awaiting your approval"; Stock counts › `Approvals` tab › `Review` (or click the row); `History` tab → open a count still "Awaiting approval"; `Next count` button on a record.
- Settings: Stock counts › `Settings` tab; the "Turn it on in Settings" link on My counts; Today row "Batches not counted this cycle" (opens `tab=settings`). Reorder › Automation settings only *points* here ("Stock count settings are in Stock › Stock counts › Settings.").
- Out-of-cycle counts: STORY-100.

### Steps
**A. Meera turns the cycle on**
1. Sidebar `Inventory` → area `Stock` → task `Stock counts` → `?area=stock&view=COUNT`; tabs `My counts · Approvals · History · Settings`; text "Stock reconciliation is off, so no counts are assigned. Turn it on in Settings".
2. Click `Turn it on in Settings` (same as the `Settings` tab) → `tab=settings`.
3. Flip the switch → label changes to "Stock reconciliation is on".
4. "Cycle length (days)" → `30` (hint "Every batch in stock is counted once per cycle.").
5. "Items per person per day" → `15` (hint "Each person counts at most this many a day.").
6. Under "People who count" tick `Ravi Teja · Pharmacist` and `Sana Fatima · Pharmacist`.
7. Read the live forecast: "At 15 per person per day with 2 people, a 30-day cycle covers all 412 batches in stock." and "Saving starts a new cycle today."
8. Click `Save settings` → toast "Stock count settings saved — A new cycle starts today."

**B. Ravi counts**
9. Next morning: sidebar `Inventory` → Today shows "Stock count due today" with "15" and "Open your count and sign off when every batch is counted."
10. Click the row → the count sheet opens directly (`?area=stock&view=COUNT&document=<id>`): heading = the count reference, "Count what is on the shelf. Enter 0 when a batch is not there."; columns Item · Location · System · Counted · Difference · Note; the first "Counted" box has focus and is empty.
11. He notices the "System" quantity is printed next to each box (it is not a blind count) and resists copying it.
12. Type `12` for the first batch and press Enter → focus jumps to the next box; "Difference" shows a green "✓ Matches"; the sticky footer reads "1 of 15 counted · ✓ Saved" (autosave after 0.6 s, no save button).
13. Continue down the list with number + Enter (rows 2–6).
14. Row 7, Photostable Gold SPF 55 gel, System 6: he finds 5 → "Difference" shows "−1" and "−₹612.00" in red; a "Why it differs (optional)" box appears in the Note column.
15. Type the line note `Tester opened for patients`.
16. Row 9 is not on the shelf at all → type `0`.
17. Rows 10–15: number + Enter; he accidentally Enters past row 12 without typing.
18. Enter on the last box moves focus to `Sign off count`; he presses Enter → red prompt "Count every item before signing off. 1 item still to count."; row 12 is highlighted "Not counted yet" and focused.
19. Type the missing count.
20. Click `Sign off count` → dialog **"Sign off this count"**: "15 items, 2 differ · Short −7 (−₹2,412.00)"; a list "Batches that differ" with "System 6 · counted 5" etc.
21. Type "Why do these differ? (required)" = `Tester opened; Tugain batch TG118 not found on Rack B-2`.
22. Click `Sign off and send for approval` → toast "Count signed off and sent for approval. Stock changes only when a doctor or administrator approves it."; the sheet becomes a locked record: badge "Signed – awaiting approval", "Signed by **Ravi Teja** on 14 Nov 2026, 9:20 am", and "You signed this count, so someone else decides it. Ask Dr. Anjali Rao or Meera Nair."
23. Click `Back to stock counts` → My counts shows "Nothing to count right now".

**C. Dr. Anjali decides**
24. Sidebar `Inventory` → Today shows "Counts awaiting your approval" with "1" and "Short −₹2,412.00. Stock changes only when you approve."
25. Click the row → Stock counts opens on the `Approvals` tab (`tab=approvals`); one row: date, "Counted by", "Signed at", Items 15, Differences 2, "Short ₹", "Net ₹".
26. Click `Review` → the locked record opens with only the two differing batches listed; she clicks `Show all 15 batches` to see the rest.
27. Click `Approve and adjust stock` (sticky footer; beside it "Short −7 (−₹2,412.00)" and "Stock changes only when you approve.") → dialog **"Approve and adjust stock"** ("Each difference is applied to today's stock, so sales made since the count are kept."), per batch "6 now → **5**", "Stock value changes by −₹2,412.00", and "Reason (required)" pre-filled "Physical count signed by Ravi Teja on 14 Nov 2026".
28. Click `Approve and adjust stock` in the dialog → toast "Approved. Stock adjusted. 2 batches adjusted by the counted difference."; badge becomes "Approved"; "Approved by **Dr. Anjali Rao** on …".

**D. Verify**
29. Click task `Stock ledger`, set `Method` = "Stock count" → today's group shows "−1 … Photostable Gold … 6 → 5" and "−6 … Tugain … 6 → 0", each linked to the count reference.
30. Back in `Stock counts` › `History` → the count is listed with status "Approved"; footer "1 count · Approved −₹2,412.00 · Awaiting ₹0.00".

### Variations
- **No differences**: the dialog's note becomes "Note (optional)", the button is just `Sign off`, and the count goes straight to "Confirmed, no differences" (toast "Count signed off. Stock confirmed.") — no approver involved.
- **Several lists due**: the Today row then opens My counts ("N lists to count…") instead of a sheet; each list has `Start counting` / `Continue counting`, with "Due today" or "From 12 Nov" badges.
- **Changing the cycle later**: editing "Cycle length" shows an amber note "Saving starts a new cycle today. The 96 batches counted in this cycle will be counted again…".
- **Short-staffed forecast**: "…covers 300 of 412 batches in stock. Raise items per day to 21 or add a person."; Today then shows "Batches not counted this cycle".
- **Keyboard**: ↑ / ↓ also move between Counted boxes.

### Edge Cases
- **Server asks for a re-type** (`COUNT_RETYPE`): the dialog closes, the affected boxes are cleared and marked "Type it again (was 5)".
- **Invalid entry**: letters or decimals → "Whole number, 0 or more"; sign-off blocked with "Fix the highlighted quantity before signing off."
- **Offline while counting**: footer "Not saved. Check your connection; your counts stay on this screen."; sign-off refuses with "Your latest counts are not saved yet…".
- **Edited elsewhere**: a 409 raises the toast "This count changed — … Showing the latest saved version."
- **Stock moved since the count**: the approval dialog adds "It was 6 when counted; stock has moved since." and applies the *difference*, not the counted number.
- **Sole approver signed it herself**: footer text "You signed this count and no other approver is active, so you decide it. This is recorded." and a mandatory checkbox "I signed this count and no other approver is active in this branch…"; History then shows "Own count" under "Decided by".
- **Someone other than the assignee opens an unsigned list**: they get the read-only record "Assigned to **Ravi Teja**. Only they can enter and sign it off."
- **No access**: the register's "denied" state replaces the tab.
- **Naming drift on one screen**: task "Stock counts", switch "Stock reconciliation is on", message "Reconciliation is off", unit "cycle", Today card "Batches not counted this cycle", stock-list filter "Count history" (URL key `audit`), server permission `pharmacy:compliance:audit`.

---

## STORY-100: Count one shelf outside the cycle, and have the count rejected

**Type**: medium
**Topic**: Stock control, counts & reorder
**Persona**: Sana Fatima, pharmacist, who thinks Rack B-4 "looks wrong"; Meera Nair (ADMIN) reviewing
**Goal**: Count everything on one shelf right now; the reviewer distrusts a surplus and sends it back.
**Preconditions**: Reconciliation may be on or off. Six batches are assigned to "Rack B-4"; one of them is already on Ravi's unsigned cycle list.
**Ideal path**: 6 — pick the shelf, enter the counts, sign off with a note; reviewer opens, rejects with a reason.
**Alternate paths** (three different entry points create the same on-demand count via `POST /inventory/workspace/counts`):
- Stock counts › `Count an item` → dialog "Count an item or a shelf" (this story).
- Stock list: tick rows → `Count selected batches`; or with nothing ticked, `Count matching batches` (counts everything the current filters match — e.g. filter "Rack / shelf / bin" = Rack B-4 first).
- Item page action row → `Count this batch`.
- Inside the dialog's item search, typing a rack name surfaces chips "Count shelf Rack B-4 · 6 batches" that switch to shelf mode.

### Steps
1. Sidebar `Inventory` → area `Stock` → task `Stock counts`.
2. Click `Count an item` (top right) → dialog **"Count an item or a shelf"** ("Outside the cycle, for an item or a shelf that looks wrong. You count and sign it off; differences go for approval as usual.").
3. Click the `Shelf / location` toggle (default is `Item or batch`).
4. Open "Shelf" and choose `Rack B-4 · 6 batches` → the batches list appears with five ticked; the sixth is greyed with "On Ravi Teja's count of 14 Nov 2026, not signed yet"; a "Select all 5 on Rack B-4" checkbox is ticked.
5. Click `Count 5 batches` → the dialog closes and the count sheet opens (`document=<id>`).
6. Enter five counts with Enter between them; Momate cream shows System 4, counted 7 → "+3" and "+₹438.00" in amber.
7. Click `Sign off count` → dialog "Sign off this count": "5 items, 1 differs · Extra +3 (+₹438.00)".
8. Type "Why do these differ? (required)" = `3 extra tubes behind the row; maybe from Wednesday's delivery`.
9. Click `Sign off and send for approval` → locked record, "Signed – awaiting approval".
10. Meera: `Inventory` → Stock → `Stock counts` → the `Approvals` tab carries an amber badge "1"; click it, then `Review` on the row (its date cell carries the suffix "· on demand").
11. She suspects an unposted purchase bill rather than a true surplus → click `Reject` → dialog **"Reject this count"** ("Rejecting 5 batches, extra +₹438.00. Stock does not change; these batches go back into the cycle to be counted again.").
12. Type "Reason (required)" = `Looks like the unposted Sri Sai Pharma bill — post the bill first, then recount`.
13. Click `Reject count` → toast "Count rejected. Stock unchanged. These batches go back into the cycle to be counted again."; badge "Rejected"; the reason is printed on the record.

### Variations
- **Item mode**: stay on `Item or batch`, type at least 2 characters in "Find a batch" (placeholder "Item name, batch, or rack"), tick results (zero-stock batches included), `Count 2 batches`.
- **From the stock list**: `Count matching batches` with no filters set would put every matching batch in the branch on one list in a single click, with no confirmation *(server-side limit not verified)*.
- **Sana follows up**: she finds the record under `History` (filters: date range, Status, More › Person, search "Item, batch or person"); footer note "1 rejected count is not included." A fresh `Count an item` is needed — a signed count cannot be edited ("only a fresh count can replace it").

### Edge Cases
- **Nothing chosen**: "Choose a shelf." / "Choose at least one batch to count."
- **Batch already on an open count**: its checkbox is disabled with "On <person>'s count of <day>, not signed yet / waiting for approval".
- **Truncated search**: "Showing 30 of 84. Type more of the name or batch to narrow it down."
- **Empty shelf**: "No batch in stock on Rack B-4."
- **Button label vs dialog title**: `Count an item` opens "Count an item or a shelf"; the stock list calls the same act "Count selected batches"; the item page "Count this batch".

---

## STORY-101: Follow an expiry alert, pull the batch from sale, then write it off

**Type**: medium
**Topic**: Stock control, counts & reorder
**Persona**: Ravi Teja, pharmacist, Monday morning; the header bell shows an orange item
**Goal**: Stop 4 bottles of Tugain 5% solution (expiring in three weeks) from being sold, and later write them off.
**Preconditions**: Batch `TG204`, 4 BOTTLES, expiry 05/12/2026, all available. Ravi holds `inventory:transaction:create`.
**Ideal path**: 5 — alert opens the expiring batch directly; one action "block from sale" with a reason; later one action "write off" on the same record.
**Alternate paths** (lead A.20 in `discovery.md`):
- Today row "Expiring in the next 3 months" **and**, on the same screen, button `Check next 3 months' expiry` — identical target (`?area=stock&view=list&expiryMonths=3`). Likewise "Low stock" row + `Check low stock` button, and "Overdue supplier bills" row + `Check overdue supplier balances` button.
- Stock list › "Expiry" select (`Within 1 / 2 / 3 / 6 months`) or "Stock level" = `Expired`.
- Stock › `Stock optimization` (shelf life left per slow batch; STORY-102).
- Pharmacy Report › Expiring Stock; Dashboard "System Alerts"; Reports & Analytics alerts (other topics).
- Starting the documents from the registers: Stock › `More tasks…` › `Blocked stock` or `Loss & breakage` › `New document` › "Add a batch" search.
- Sending it back instead: item page button `Supplier returns` or Purchases › Purchase bills › Returns (purchases topic).

### Steps
1. Click the bell in the header → item "Expiring soon: Tugain 5% solution — 21 days left • Qty 4".
2. Click it → browser goes to `/dashboard/inventory?tab=expiry`. The workspace ignores `tab`, so he lands on **Today**, not on an expiry list. He looks for the product, does not see it.
3. Click the row "Expiring in the next 3 months" → Stock list with chip "expiryMonths: 3 ×".
4. Change the "Expiry" select to `Within 1 month` → shorter list (chips now "expiryMonths: 1 ×" and "batchView: ALL ×").
5. Click the product name → item page; badge "Current / on hand", "Opened batch TG204 · Expiry 05 Dec 2026".
6. In the action row click the button labelled **`Blocked stock`** (the buttons are named after registers: `Blocked stock`, `Loss & breakage`, `Supplier returns`) → a new document opens (`?area=stock&view=HOLD&new=<key>&return=…`) with one pre-filled line: Tugain, batch TG204, Quantity 1. Help text: "Hold units from sale while keeping them in physical stock. Release from this record."
7. Change "Quantity" from 1 to `4`.
8. Type "Reason / notes" (placeholder "Required before posting") = `Near expiry 05/12/2026 — pulled from sale, asking distributor to take back`.
9. Click `Block stock` (primary, top right) → status heading "Posted"; "Saved stock effects record the units held out of available stock."
10. Click the back arrow (tooltip "Back to blocked stock") → because of `return=`, he is taken back to the **item page**, not the register; header now "4 BOTTLES · 4 held · 0 available", badge "Held, on hand".
11. Two weeks later (distributor declined): open the item again (steps as in STORY-094) → tab `Blocked stock` → "Held stock by source" lists the hold reference with "4 BOTTLES still held · POSTED".
12. Back on the action row click `Loss & breakage` → new LOSS document pre-filled with the batch.
13. In "Stock source" choose the hold reference instead of "Available stock (no hold)".
14. Set "Quantity" = `4` and "Reason / notes" = `Expired 05/12/2026 — destroyed as per SOP`.
15. Click `Post stock loss` → "Posted"; "Saved stock effects record the units removed for loss or breakage."; the batch becomes "Previous / depleted".

### Variations
- **Still usable**: open the hold document → `Release held stock` → "Hold released".
- **Low-stock twin**: the bell item "Low stock: …" links to `?tab=low-stock` and also lands on Today; the user then clicks "Low stock" → `stock=LOW` ("Available quantity is at or below this batch's saved minimum.").
- **Already expired**: filter "Stock level" = `Expired`; rows are red with "Expired, on hand". Choosing a Stock level clears the Expiry filter and vice versa — they cannot be combined.
- **Posted the wrong quantity**: an approver uses `Correct by reversal` → "Reversal reason" → `Reverse posted effects` on the posted document; Ravi cannot.

### Edge Cases
- **Loss with no approval**: `Post stock loss` and `Block stock` take effect immediately for a pharmacist, while `Edit stock` by one unit (STORY-098) waits for a doctor.
- **No reason**: the server refuses the post; the error appears above the form and "Your attempted edits remain in the form…".
- **Interrupted post**: heading "Outcome not confirmed", `Check saved status`, a read-only "Recovery handoff" text block and a link "Open Stock counts".
- **Search finds nothing in a new document**: "No matching batch. Add the product/batch in Stock, then return here."
- **Dead links into the workspace**: `?tab=low-stock`, `?tab=expiry` (`components/layout/header.tsx`), `?tab=pharmacy-control[&section=shelf]` (`app/dashboard/pharmacy/pharmacy-workspace.tsx`).

---

## STORY-102: Find slow stock and raise a supplier-return draft

**Type**: medium
**Topic**: Stock control, counts & reorder
**Persona**: Meera Nair, clinic administrator, month-end housekeeping
**Goal**: See which batches have not sold in four months and start a return to the distributor for those still returnable.
**Preconditions**: Purchase bills exist for some slow batches. Meera can write supplier returns.
**Ideal path**: 3 — open the screen (results already computed), press "Create return draft" on a distributor, open the draft.
**Alternate paths** (lead A.15 in `discovery.md`):
- Purchases › `Purchase bills` › `Returns` tab › new return (also reachable from the Stock strip's text link "Supplier returns are now in Purchase bills › Returns").
- Item page action row `Supplier returns` (single batch).
- "Return to supplier" inside a purchase bill's actions; `Credits & vouchers` (purchases topic).
- For spotting slow / expiring stock only: stock list Expiry filter, Pharmacy Report › Expiring Stock.

### Steps
1. Sidebar `Inventory` → area `Stock` → task `Stock optimization` → `?area=stock&view=optimize`. The "Data quality" strip sits above; below, heading "Stock optimization", a "Rules" panel and a dashed box "Run optimization to check every batch on the shelf against its sales and purchase bills."
2. In "Rules" change "Non-moving days" from 90 to `120` (hint "Flag stock not sold for this many days."); leave "Minimum batch value (₹)" at 500.
3. Click `Save rules` → "Saved: 120 non-moving days, minimum ₹500.00."
4. Click `Run optimization` → URL gains `run=1`; summary "Checked 412 batches on the shelf on 13 Nov 2026, 5:40 pm: **23 batches** not sold for 120 days. Returnable **₹18,450.00** · non-returnable **₹6,210.00**, at PTR excluding GST."
5. Read "Returnable · bought in the last N days": one card per distributor, e.g. "Sri Venkateshwara Pharma Distributors — GSTIN 36AAACS1234F1Z5 · 5 batches · ₹9,870.00 at PTR, excluding GST", rows with "Shelf life left", Qty, PTR, GST, "Value at PTR", "Bill SV/2611 · 02/06/2026", "Last sold 141 days ago".
6. A second distributor's card shows an amber box (the server's `blocker` text for a group below the minimum value) and no button — she skips it.
7. Click `Create return draft` on the first card → green banner "Return draft SR-… created with batch, PTR and GST filled in." with `Open draft` and `See it in Purchase bills › Returns`; the list re-runs and the rows now say "On return SR-… (Draft)".
8. Click `Open draft` → the Supplier-return document opens in the **Purchases** area — hand-off to the purchases topic (`Create return challan`).
9. Use the back arrow → returns to Stock optimization (the run repeats automatically because `run=1` is still in the URL); scroll to "Non-returnable · view only" ("…Discount it, bundle it or use it in the clinic before it expires.").

### Variations
- **Re-run**: the header button becomes `Run again`.
- **Some batches already on a return**: the card shows `Open SR-… (Draft)` plus `Draft the remaining batches`.
- **Read-only user**: rule inputs are disabled with "Ask someone who raises supplier returns to change these."; no draft buttons.
- **Phone**: tables collapse to cards with "Qty × PTR".

### Edge Cases
- **Rules edited by someone else**: a 409 shows the error and reloads the saved rules.
- **Double click**: one request key per distributor guarantees a single draft.
- **Nothing slow**: "Nothing slow-moving can go back to a distributor." / "No slow stock is past its return window."
- **Not saved anywhere**: results exist only for the current page view; there is no history or export of a run.
- **Naming**: the task is "Stock optimization", `discovery.md` and the redirect call a neighbouring feature "Stock predictions", the output is a "return draft" / "Supplier returns" / "Purchase bills › Returns", and suppliers are "distributors" on this screen.

---

## STORY-103: From reorder targets to a received purchase order

**Type**: long
**Topic**: Stock control, counts & reorder
**Persona**: Meera Nair (ADMIN — may accept targets and approve orders); Ravi Teja (PHARMACIST — may create shortbook requests and orders, cannot approve)
**Goal**: Let the system propose minimum / maximum levels, turn shortages into a purchase order, get it approved, send it, and start receiving it.
**Preconditions**: A few months of sales history. Suppliers exist. No automation owner is configured (manual run).
**Ideal path**: 8 — accept proposed targets (2), open the generated shortage list with supplier pre-chosen and create the order (2), approve (2), send (1), receive (1).
**Alternate paths**:
- Targets: Reorder › `More tasks…` › `Manual targets & exclusions` (type min / max / reorder per item → `Review selected changes` → "Reason (required)" → `Save reviewed targets`); item page `Set stock alert` (STORY-097); legacy `/dashboard/stock-predictions` (redirects to `?area=reorder&view=targets`); Reorder › `Monitor` › "Demand & stock coverage" › `Review proposal`.
- Shortages: Shortbook › `Add manual request`; Shortbook › `Sync shortages`; ticking "Sync accepted targets to Shortbook" when accepting targets; Reorder › `Automation settings` › "Automatic PO drafts" + `Run saved settings`.
- Orders: Purchase orders › `Add purchase order` (skips the shortbook entirely).
- Receiving: order page `Receive remaining stock`; Today row "Orders awaiting receipt"; Purchases › `Inward challans` › new document › choose the order in "Purchase order"; or simply post the supplier's bill in `Scan or enter bill` (purchases topic). A `Receive against order` button also exists in the generic register (`WorkflowRegister` in `InventoryWorkspace.tsx`), but that register is never rendered for the Reorder area.
- Cancelling: `Cancel document` (document toolbar) **and** "Cancel remaining quantities" › `Cancel remaining units` (delivery panel) on the same page.

### Steps
**A. Meera accepts targets**
1. Sidebar `Inventory` → area `Reorder` → lands on `Shortbook` (first task).
2. Click task `Target proposals` → "Target proposals — 0 matching records · all result pages included" and "No matching records. Generate a proposal to review demand and saved targets."
3. Click `Generate target proposal` → a proposal document opens: reference, a status line "<status> · <model> · 13 Nov 2026" *(initial status label inferred to be "Draft • no stock change")*, an assumptions sentence, and a three-part strip "Evidence dates", "Demand inputs" (e.g. "90 days · 3 minimum orders · Bounce Off · Refill Off"), "Coverage" ("15 / 45 min / max days").
4. Read a line: "**Acnestar gel** — AG0917 · TUBES — Ready for review"; "Saved min / max **Unconfigured / Unconfigured** → Proposed **6 / 18 TUBES**"; "Available 3 · Sales 22 · Bounce 0 · Refill 0 · 9 orders".
5. Expand "Demand records (9)" on that line to see the dated sales behind the number.
6. Click `Select unreviewed` → every undecided line is ticked; counter "14 selected".
7. Untick two lines marked "Cold start: retain saved targets".
8. Leave "Sync accepted targets to Shortbook" ticked.
9. Click `Accept selected` → "Selected targets accepted. Unselected lines remain available for review."; accepted lines now read "Accepted 13 Nov 2026, 5:52 pm by <actor id>".
10. Click `Back to list`.

**B. Ravi turns shortages into an order**
11. `Inventory` → `Reorder` → `Shortbook`: rows such as "<reference> — Acnestar gel: 15 TUBES — <source> · NORMAL · 13 Nov 2026 · Requested by … — Min 6 / available 3 · Supplier selection required", status "Draft • no stock change" *(reference format and source value not verified)*.
12. (If the list looks stale) click `Sync shortages` → "Shortbook refreshed from active targets. Existing requests are preserved."
13. Click the Acnestar request → **two stacked panels** open: the generic document editor on top (heading "Draft", "This draft has not changed stock.", fields Reference, Date, Supplier, Expected date, Priority, Reason / notes, "Add a batch" search, lines table) and under it "Supplier recommendation".
14. In "Supplier recommendation" expand "Sri Sai Pharma Agencies · Alternative · 4 posted purchase records" → past bills with rate, pack, free quantity and discount.
15. He sees two supplier pickers — "Supplier" in the top form and "Supplier" + `Save supplier` in the lower panel — hesitates, then uses the lower one: choose `Sri Sai Pharma Agencies · 36ABCFS9876K1Z2` and click `Save supplier` → "Supplier choice saved for this request and future shortages."
16. In the lines table change "Quantity" to `12`.
17. Set "Expected date" = 17/11/2026 and "Priority" = `HIGH`.
18. Click `Save draft` → "Document saved. Review the confirmed document status below."
19. Click `Create purchase order` (primary) → heading "Purchase order created"; "A purchase order was created. Stock is unchanged by this conversion."; a button `Open linked purchase order` appears.
20. Click `Open linked purchase order` → the order opens (Draft) with the same two-panel layout; the lower panel is "Order delivery & receipts" (Ordered / Previously received / Remaining).
21. Check "Rate excl. GST" and "GST %" on the line, then click `Submit for approval` → heading "Awaiting manager approval"; "Ask a manager with approval permission to review this document."

**C. Meera approves and sends**
22. `Inventory` → `Reorder` → `Purchase orders`; set "Status" = `Awaiting manager approval`, click `Apply filters` (filters here need an explicit apply, unlike the stock list).
23. Click the order → click `Approve document` (primary) → heading "Approved"; "Receive actual goods through an inward challan linked to this order."
24. In "Order delivery & receipts" click `Send purchase order` → a status note is recorded under the panel; the fixed caption underneath reads "Supplier mail transport: setup required. Sending records the setup failure; export is available for manual delivery."
25. Click the download icon (tooltip "Export order & remaining quantities") → `<reference>.csv`; she forwards it to the distributor's rep on WhatsApp outside the app.

**D. Ravi receives**
26. Tuesday, goods arrive: `Inventory` → Today row "Orders awaiting receipt" (count 1) → Reorder › Purchase orders filtered `status=OPEN`.
27. Click the order → `Receive remaining stock` → the app jumps to Purchases › Inward challans with a new document pre-filled from the order's remaining lines (reason "Receipt against <order reference>") — **hand-off to the purchases topic** (`Receive stock`, then "Create linked purchase bill").

### Variations
- **Manual targets instead of proposals**: `Manual targets & exclusions` → search → tick items → type Minimum / Maximum / Reorder level → optionally tick "Protect manual targets for <item>" or "Exclude <item> from target proposals" → `Review selected changes` → reason → `Save reviewed targets` ("Reviewed targets and exclusions saved with their history.").
- **Reject proposals**: `Reject selected` → "Selected proposal lines rejected; saved targets retained."
- **Automation**: `Automation settings` → pick "Automation owner", tick "Automatic target proposals" / "Automatic PO drafts", set "Demand lookback (days)", "Min. cover (days)" etc. → `Save settings` → `Run saved settings` → "Saved run outcomes" list with `Open generated document`.
- **Monitor**: order-outcome bars, "Demand & stock coverage" table, "Supplier choices", `Export underlying records`.
- **Partial delivery**: after a first receipt the order shows "Part received"; `Receive remaining stock` again, or "Cancel remaining quantities" › reason › `Cancel remaining units`.

### Edge Cases
- **Self-approval**: a DOCTOR who created the order gets "Another approver must approve a document you created"; OWNER / ADMIN / MANAGER may approve their own.
- **Pharmacist on a proposal**: `Select unreviewed` and the line checkboxes are disabled; no Accept / Reject buttons, and no hint why.
- **Supplier list is partial**: the lower "Supplier" select only offers suppliers suggested for the *first* line (`suggestions[0]`).
- **Raw identifiers leak into the UI**: "Supplier <supplierId>" in shortbook rows, "Requested by <createdBy>", "by <decision.actorId>", "Branch <branchId>" on Manual targets and Monitor.
- **Load failure**: "Could not load replenishment. Retry." with `Retry loading`; nothing is shown as zero.
- **Sending without mail set up**: the attempt is logged as a failure in the order's dispatch list; the order is still usable.
- **Naming drift**: area "Reorder"; component "Replenishment" ("Replenishment monitor", "Loading saved replenishment records…"); legacy route "stock-predictions"; "Shortbook" vs "Add manual request" vs "Sync shortages" vs (dead code) "Add low-stock demand"; "Target proposals" vs "Reorder target review" vs "Manual targets & exclusions"; list button `Add purchase order` vs generic register `New order`.

---

## STORY-104: Load opening stock from an Excel sheet

**Type**: medium
**Topic**: Stock control, counts & reorder
**Persona**: Meera Nair, clinic administrator, the weekend before go-live, with a stock sheet exported from the old billing software
**Goal**: Create the drug catalogue and opening batch balances for ~380 rows in one go.
**Preconditions**: An `.xlsx` under 5 MB and 1,000 rows. Inventory is empty or nearly so.
**Ideal path**: 3 — choose the file, review a row-by-row preview with errors, confirm.
**Alternate paths** (lead A.13 in `discovery.md`):
- Stock › `More tasks…` › `Manual opening stock` → register "Opening stock entries" → `New document` → "Add a batch" search → quantity → `Post opening stock`. It can only add balance to a batch that **already exists** ("No matching batch. Add the product/batch in Stock, then return here."), so a brand-new item needs `Add batch` (+ approval) first.
- `Add batch` then `Edit stock` (two approvals for a pharmacist).
- Post real purchase bills (`Scan or enter bill`, `Import CSV`, `Gmail intake` — purchases topic).
- An unmounted compact version of this same importer ("Start Inventory From Excel — Upload opening stock without leaving the pharmacy desk.") exists in `PharmacyInventoryControl.tsx`; the Pharmacy guide still points to it, but no route renders it.

### Steps
1. Sidebar `Inventory` → area `Stock` → open the `More tasks…` select → choose `Opening stock import` → `?area=stock&view=opening`; heading "Opening stock import" and a card "Start Pharmacy Inventory From Excel — Import opening stock into the drug catalog and inventory in one pass."
2. Click "Excel columns and format" → filled badges (required): Drug name, Manufacturer, Composition, Category, Dosage form, Strength, Pack size, Selling price, Current stock; outlined (optional): Cost price, MRP, SKU, Batch number, Expiry date, GST %, Supplier. There is no template to download.
3. Click `Choose Excel` (or drop the file on "Drop an Excel file here") and pick `linae-opening-stock-nov-2026.xlsx` → the drop zone shows the file name and "212.4 KB selected" with a `Remove` button.
4. Click `Preview import` → a spinner; the button label then changes to **`Confirm opening import`**. On this full-width layout no preview table is rendered (the "Review N source rows…" table is only wired into the compact layout), so she sees nothing to review and hesitates before pressing a button that now says "Confirm".
5. Click `Confirm opening import` → toast "Inventory imported with errors — 371 created, 6 updated, 7 skipped."; a results block appears with tiles Rows 384 · Created 371 · Updated 6 · Drugs 352 · Stock 377 · Skipped 7.
6. Read "Rows needing review": "Row 41: …", "Row 118: …"; below it "Import reference: <id>" and a link `Download original Excel`.
7. Fix what the server marks as retryable: click `Retry failed rows` → toast "Some rows still need attention — … 3 remaining." (or "Import complete").
8. Click task `Stock list` → the new batches are listed; the "Data quality" strip shows how many lack a location, category, HSN code or min/max — the columns list in step 2 offers no way to supply location, HSN or min/max.

### Variations
- **Clean file**: toast "Inventory import finished"; no review block.
- **Nothing imported**: toast "No inventory rows imported".
- **Uncertain outcome** (timeout): toast "Import outcome not confirmed — … Check import outcome before trying again."; `Check import outcome` re-reads the saved result without importing again; `Resume unfinished rows` appears when rows are pending.
- **Manual route for a handful of batches**: `Manual opening stock` › `New document` › search batch › quantity and "Rate excl. GST" › `Post opening stock` ("Saved stock effects record the opening quantities added to the new batches.") — no approval step.

### Edge Cases
- **Wrong file**: toasts "Unsupported file — Upload an .xlsx or .xls Excel file.", "File too large — Upload an Excel file no larger than 5 MB.", "Empty file".
- **Preview request fails**: toast "Import failed — <message>" (the same title is used for preview and for the real import).
- **Choosing another file** resets the preview, so the button returns to `Preview import`.
- **Earlier unknown outcomes**: "Some earlier row outcomes are unknown. Ask an administrator to reconcile them before importing stock again."
- **Existing batches**: the (unrendered) preview caption states "Existing batch balances cannot be reset." — re-importing does not overwrite quantities; that warning is never shown on this screen.
- **Naming drift**: task "Opening stock import" · card "Start Pharmacy Inventory From Excel" · button "Confirm opening import" · toast "Inventory import finished" · neighbouring task "Manual opening stock" whose register is headed "Opening stock entries" · ledger methods "Opening stock" and "Excel import"; sheet column "Current stock" vs preview column "Opening qty"; "Cost price" vs "PTR".

---

## Redundancy notes

### Duplicate paths (same goal, several routes)

| Goal | Routes found | Files |
|---|---|---|
| Open the low-stock / expiring / overdue lists | Today queue row **and** a button directly beneath it for each of the three (`Check low stock`, `Check next 3 months' expiry`, `Check overdue supplier balances`); stock-list "Stock level" / "Expiry" selects; header bell (lands on Today — dead `?tab=` link) | `InventoryWorkspace.tsx` (`WorkspaceToday`), `WorkspaceStock.tsx`, `components/layout/header.tsx` |
| Change a batch's quantity | `Edit stock` on the list row; `Edit stock` on the item page; three count entry points → `Approve and adjust stock`; `Loss & breakage`; item ledger `Correct` → `Post linked correction`; `Manual opening stock`; purchase correction | `StockEditDialog.tsx`, `InventoryItemPage.tsx`, `counts/*`, `WorkflowDocumentEditor.tsx` |
| Start an on-demand count | Stock counts `Count an item`; stock list `Count selected batches` / `Count matching batches`; item page `Count this batch` (all `POST /inventory/workspace/counts`) | `counts/StartCountDialog.tsx`, `WorkspaceStock.tsx`, `InventoryItemPage.tsx` |
| Set minimum / maximum / reorder level | "Add Inventory Item" › Stock Levels; item `Edit item` › More details; item `Set stock alert` (same form, different focus); Reorder › Manual targets & exclusions; Reorder › Target proposals › Accept; opening-stock Excel | `AddInventoryItemDialog.tsx`, `StockDetailsEditor.tsx`, `ReplenishmentCenter.tsx` |
| List batches with missing data | "Data quality" strip chips (`gap=`); `Filters` › "Missing information" (`missing=`); `Filters` › "Product mapping" = Unmapped (`mapping=`); typing `MISSING` into "HSN or MISSING" / "GST rate or MISSING" | `optimization/DataQualityStrip.tsx`, `WorkspaceStock.tsx` |
| Reach the approval queue | Sidebar badge → Inventory → Stock → `Approve corrections`; Today row "Price/stock edits awaiting approval"; notice link `Open approval queue`; legacy `/dashboard/inventory-updates` | `InventoryApprovals.tsx`, `app/dashboard/inventory-updates/page.tsx` |
| Read an item's movements | Stock › Stock ledger; item page › Ledger tab; item tabs Sales / Purchases / Purchase returns / Sales returns / Blocked stock; Today "Recent activity" | `InventoryLedger.tsx`, `InventoryItemPage.tsx`, `item-ledger-view.ts` |
| Add an item / opening balance | `Add batch` (approval, zero stock); purchase-bill posting; Opening stock import (Excel); Manual opening stock; Drug database / prescription-builder quick add (drug only) | `AddInventoryItemDialog.tsx`, `PharmacyInventoryStarterImport.tsx`, `workspace-model.ts` |
| Choose a shortbook supplier | "Supplier" select in the document form **and** "Supplier" + `Save supplier` in the "Supplier recommendation" panel, both on the same page | `WorkflowDocumentEditor.tsx`, `ReplenishmentCenter.tsx` |
| Cancel a purchase order | `Cancel document` (document toolbar) and `Cancel remaining units` (delivery panel) on the same page | same two files |
| Receive against an order | `Receive remaining stock` (order page); Today "Orders awaiting receipt"; Inward challans › "Purchase order" select; unreachable `Receive against order` in `WorkflowRegister` | `ReplenishmentCenter.tsx`, `InventoryWorkspace.tsx` |
| Raise a supplier return | Stock optimization `Create return draft`; item page `Supplier returns`; Stock-strip link to Purchase bills › Returns; purchases-area routes | `optimization/StockOptimization.tsx`, `InventoryItemPage.tsx`, `InventoryWorkspace.tsx` |

### Duplicate information

- **Reorder documents render two components at once**: for `?area=reorder&view=SHORTBOOK|PURCHASE_ORDER&document=…` the workspace mounts `WorkflowDocumentEditor` *and* `ReplenishmentCenter` (`InventoryWorkspace.tsx` lines ~514–596), giving two headings, two status explanations, two supplier controls and two cancel actions.
- **Pending-approval numbers**: sidebar badge and task label `Approve corrections (n)` count *new-item requests*; the Today row counts *price/stock edits* and prints its number twice ("1 · Price/stock edits awaiting approval (1)"); the `New items` tab repeats the badge.
- **Batch quantities** appear on the list row, behind "Show cost & stock details", in the item header ("Current stock … held … available"), in the item `Batches` table and footer total, and in both ledgers' closing balances.
- **Item master data** is shown twice on the item page: the "Item details" strip (Category, HSN, GST %, barcode…) and again in the `Information` tab.
- **Count results**: Today card, Approvals register, the record header ("15 items, 2 differ · Short …"), the sticky footer and the decision dialog all restate the same short/extra figures.
- **Stock-count settings pointer**: Reorder › Automation settings carries a sentence redirecting to Stock › Stock counts › Settings.

### Naming drift

- **Batch vs item vs product**: button `Add batch` → dialog "Add Inventory Item" → submit `Add Item` → success "Sent to doctor for approval"; list column "Product / batch"; editor "Edit product details" / "Correct saved details" opened by `Edit item`.
- **Approver**: "doctor" (item requests), "doctor or admin" (price/stock), "manager" (`labelStatus`: "Awaiting manager approval"), "doctor or administrator" (counts). The role sets differ too: item/edit approval = DOCTOR/ADMIN/OWNER; workflow and count approval adds MANAGER, who nevertheless has no `Approve corrections` task (`InventoryWorkspace.tsx` `canSeeApprovals`, `inventory-workflow.types.ts`).
- **Approve corrections / Price / stock approval queue / New item requests / My item requests / Inventory Updates** — one screen; and **"Corrections"** is an unrelated task.
- **Stock counts / Stock reconciliation / Reconciliation / cycle / Count history / audit**.
- **Reorder / Replenishment / Shortbook / Stock predictions / Targets / Stock alert / Min–Max**.
- **Blocked stock / Held / Set aside / Hold**: task "Blocked stock", list text "5 set aside", filter "Set aside / held", item header "held", state "Held, on hand", action `Block stock`, `Release held stock`.
- **Loss & breakage / Stock loss / Loss or breakage** (task, button `Post stock loss`, ledger method).
- **Purchase cost / PTR / Cost Price / Purchase price / Rate excl. GST / Landing price** for cost; **Available / Physical / Current stock / On hand / Qty / System** for quantity.
- **Supplier / Distributor**: "Supplier" selects and filters vs "distributor" throughout Stock optimization.
- **Action buttons named after registers**: the item page's `Blocked stock`, `Loss & breakage`, `Supplier returns` buttons *start* a new document but read like navigation.
- **Raw keys shown as labels**: active-filter chips ("expiryMonths: 3 ×"), "Missing information" options, status values in some item tabs ("POSTED"), actor / supplier / branch IDs in Reorder.

### Stale or broken paths seen in this topic

- `/dashboard/inventory?tab=low-stock`, `?tab=expiry` (header bell) and `?tab=pharmacy-control[&section=shelf]` (Pharmacy Desk, counter cockpit) → all land on Today; `tab` is only read by Stock counts.
- Opening stock import: the preview table (`previewTable`) is rendered only in the `compact` branch of `PharmacyInventoryStarterImport.tsx`; the mounted full layout flips the button to `Confirm opening import` without showing any preview.
- `WorkflowRegister` contains `Add low-stock demand`, `Generate target proposal`, `New order` and `Receive against order` for reorder kinds, but the register is never rendered when `area=reorder` (only reachable through a hand-typed URL such as `?area=stock&view=SHORTBOOK`).
- `WorkflowDocumentEditor.tsx` still special-cases `kind === "COUNT"`, although counts are now handled entirely by `counts/StockCounts.tsx`.
- A newly approved item is created with `currentStock: 0` and therefore labelled "Previous / depleted" (`inventory.service.ts`, `stock-batch-view.ts`).
- The `Price / stock` ↔ `New items` tab is local state, so the Today row "Price/stock edits awaiting approval" can open on the wrong tab and the choice cannot be deep-linked or restored by Back.
