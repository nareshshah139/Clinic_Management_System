# Purchases, suppliers & payables

> Scope: Inventory › **Purchases** (`/dashboard/inventory?area=purchases&view=…`) — recording supplier bills
> (scan/OCR, manual, CSV, Gmail), reviewing and posting them to stock, the Purchase bills register,
> paying, credit notes and set-off, supplier returns, suppliers, Terms of Trade and purchase analytics.
> Labels in quotes or `code font` are the strings in the source. Anything not read directly in code is
> marked *(inferred)* or *(label unverified)*. Stories are numbered locally from 001.
>
> Shared navigation facts used by every story (`frontend/src/components/inventory/InventoryWorkspace.tsx`):
> - Sidebar `Inventory` → `/dashboard/inventory` opens area **Today**. Area buttons: `Today`, `Purchases`, `Stock`, `Sales`, `Reorder`.
> - `Purchases` opens `Purchase bills` by default. On desktop the task strip shows three buttons —
>   `Purchase bills`, `Scan or enter bill`, `Import CSV` — and everything else sits in a native
>   `More tasks…` select: `Gmail intake`, `Suppliers`, `Terms of Trade`, `Payments & dues`
>   (only with ledger permission), `Credits & vouchers`, `Inward challans`, `Gate passes`, `Purchase costs`.
>   On phones all tasks are one `Task` select.
> - Server roles for purchase bills are ADMIN, PHARMACIST, RECEPTION (OWNER and DOCTOR pass every gate);
>   `Mark paid` / set-off additionally need `creditWrite` and role OWNER/ADMIN/DOCTOR/PHARMACIST/ACCOUNTANT
>   (`purchase/purchase-register-model.ts` `canRecordSupplierPayments`).

---

## STORY-001: Scan a two-page distributor bill, fix the reading, match products and add stock

**Type**: long
**Topic**: Purchases, suppliers & payables
**Persona**: Sravani Kolla, pharmacist, Friday 11:20 am — a carton from Sri Venkateshwara Pharma Distributors arrived yesterday evening and the counter is quiet for ten minutes
**Goal**: Get the 6-line credit bill SVP/26-27/4183 (₹18,642) into the system so the stock is sellable and the payable is on the books
**Preconditions**: Logged in as PHARMACIST with purchase create/review/commit permissions. Supplier "Sri Venkateshwara Pharma Distributors" (GSTIN 36AAKFS4821M1Z6) already saved. Four of the six products exist in the catalogue; one has a near-duplicate with a different pack; one (a new sunscreen) does not exist. Doctor has recorded Terms of Trade for two of the products. Two phone photos of the bill are on the desktop.
**Ideal path**: 6 — open intake, drop both pages, scan, confirm the handful of flagged values in one pass, accept product matches in bulk, post. Everything else is machine work.
**Alternate paths**:
- Entry to the same workbench: Today `Scan or enter bill` button; Purchases task strip `Scan or enter bill`; Purchase bills `New purchase`; empty-register `New purchase`; denied-register `Scan or enter a bill`; Today queue row "Original files awaiting intake".
- Other ways to bring the same bill in: `Type instead` (STORY-002), `Import CSV` and `Gmail intake` (STORY-010), `Automatic import` › `Import & Add Stock` on the same screen (skips human review when every check passes), an Inward challan followed by `Create linked purchase bill` (goods-first route, Stock/Reorder topic).
- Posting: `Confirm reviewed values & add stock` (one button saves, reviews and commits); or `Save draft` now and `Add stock` later from the reviewed bill; or `More options` › `Save & Process` (automatic processing); review-only users get `Mark Reviewed` and a colleague presses `Add stock`.

### Steps
1. Click `Inventory` in the sidebar → "Loading inventory permissions…" skeleton, then Today with "What needs attention".
2. Click `Scan or enter bill` (primary button above the queues) → URL `?area=purchases&view=intake`; heading "Scan or enter bill", sub-line "Upload every page. Check the reading. Add stock when ready."; the "Scan a bill" panel is open with the cue "Scan only · stock stays unchanged". Also visible before she has done anything: a `Recover interrupted import` button, a collapsed "Recent invoices (n)" and a collapsed "Review status guide".
3. Click the file input "Upload invoice PDF or image" and multi-select `IMG_2291.jpg`, `IMG_2292.jpg` → helper text "PDF or photos · Up to 10 files · One invoice, in page order". There is no thumbnail or page-order preview; she has to trust the file dialog's order.
4. Look at "Received on" — prefilled with today (13/11/2026). The goods came yesterday, so she changes it to 12/11/2026. *(Hesitation: the field sits to the right of the upload, above the button; easy to miss.)*
5. Click `Scan bill` → button reads "Reading bill…" with a spinner; the whole form is disabled. After the read: notice "Extracted 6 line items from IMG_2291.jpg. Review the draft before saving; 5 OCR flags need attention." On a wide screen the page splits: form on the left, "Original invoice" viewer on the right. A "Finish this purchase" box appears above, and "Check before adding stock" shows "*n* checks to finish".
6. Read the "Supplier" block → Distributor and GSTIN are filled; status "Matching saved supplier found. Continue with invoice review." A blue panel "Agreed terms with Sri Venkateshwara Pharma Distributors — Recorded under Purchases, Terms of Trade. Compare each line with what was promised." lists two products.
7. In the amber checklist, click `Correct` beside the bill-type check ("… Check against the original before confirming.") → focus jumps down to "Bill Type" inside the "Distributor Bill" card.
8. Change Bill Type from `Cash` to `Credit` → "Due Date" becomes editable.
9. Enter Due Date 12/12/2026 → required for a credit bill ("dueDate is required before review" otherwise).
10. Type the supplier's licence into "DL No." (`TS/HYD/20B-4471`) → this is a hard requirement for posting although it is not marked required on the field.
11. Click the small source icon beside "Invoice No." (tooltip "Show on original invoice") → the right pane scrolls/highlights and reads "Invoice No. · captured: SVP/26-27/4183". She confirms it matches the paper.
12. Click `Next check` in the sticky bottom bar → counter "Check 1 of 4 · Line 2 batch"; focus lands in line 2's "Batch" field.
13. Click "Zoom in original" twice, compare, and correct batch `BN24O91` → `BN24091`.
14. Click `Next check` → "Line 5 expiry". The line is on the second photo, so she changes the viewer's "Page" select to `2`.
15. Correct "Exp. Year" 2023 → 2028 (the red "expired batches can be saved for correction but cannot be reviewed or committed" warning disappears).
16. Click `Next check` → line 6 "HSN", inside the auto-opened "Other commercial details" disclosure → type `33049990`.
17. Click `Back to review` (the `Next check` button's label on the last stop) → focus returns to "Check before adding stock". An amber "Products need attention" block now names Line 4 and Line 6.
18. Click `Resolve line 4 product` → the "Product matching and catalogue details" disclosure opens on the "Product matching and details" card.
19. For lines 1, 2, 3 and 5 the badge reads "Same product · confirm"; click `Confirm Match` on each (4 clicks) → each turns green "Matched {product}"; notice "Matched … in the drug master."
20. Line 4 ("Photostable Gold SPF 55 Gel 50g") shows "Possible match · confirm" against a saved 30 g pack. She clicks `Confirm Match` out of habit → a box "These look like different products" appears in "Finish this purchase" with "Invoice product" and "Saved product" side by side and the mismatch list. *(She hesitates — the box is at the top of the page, far from the button she pressed.)*
21. Click `Choose another product` → back in the line-4 card.
22. Type `Photostable` in "Search saved products manually" → results list; click `Match Photostable Gold SPF 55 Gel 50g`.
23. Line 6 ("Sunstop Aqua Gel SPF 50 60ml") shows the outline badge "Not in inventory". In the inline "New product details" form choose Product kind `Cosmetic / skin care` and fill "Category (required)".
24. Click `Create new item` → badge "Created Sunstop Aqua Gel SPF 50 60ml". The amber product block clears; the checklist cue reads "Ready for your final check".
25. Scroll to "Products on this bill". Line 3 carries a blue hint: "Agreed: 10% · 10+1" over "Invoice: 8% · 10 paid + 0 free · exp 08/2028 · rate ₹212.00". The distributor short-changed the scheme. She notes it in "Additional invoice details" › "Notes" to raise with the rep; the system does not block or flag it elsewhere.
26. Scroll to "Check bill total" → Gross / Taxable / GST / TCS / "Net Payable ₹18,642.00"; below, "Lines 6 · Paid stock units · Free stock units · Received stock units · Indicative margin at MRP". She compares Net Payable with the printed total.
27. Read the sticky bar guidance: "Confirm values against the original. Adds the received quantities to stock." and status text "Not saved · stock not added".
28. Click `Confirm reviewed values & add stock` → the button stays labelled and shows a spinner; top status pill cycles "Saving and checking invoice…" → "Adding stock…" → "Stock added" with "Reference: …".
29. Read the green "Stock added - saved receipt" list → six links "{product} · {batch}" each with "N stock units added"; notice "Stock added for SVP/26-27/4183. The saved record confirms the operation completed."
30. Click `New invoice` (top-right of the sticky nav) to start the next bill, or `Back to list`.

### Variations
- **Supplier not saved yet**: step 6 shows "No saved supplier matches these details." She ticks "I checked the supplier name and GSTIN against the original invoice." and clicks `Save verified supplier` (2 extra steps) — or skips it; the hint says she can "continue without saving a supplier … then confirm your review and choose Save & Process" (that button name is stale: the primary action is now `Confirm reviewed values & add stock`).
- **Saved supplier has a different GSTIN**: red "Supplier GSTIN differs" box → `Correct saved GSTIN` → "Reason for correction" + checkbox "I checked the new GSTIN against the original invoice and want to correct this saved supplier." → `Update saved GSTIN` (needs supplier-update permission).
- **Same GST on every line misread**: open "Apply GST or discount to selected rows" → `Select all 6 rows` → Change `GST`, GST mode `CGST + SGST`, "Total GST %" 18 → `Preview 6 selected rows` → `Apply to 6 selected rows` (with `Undo shared terms`).
- **Goods were received earlier on an inward challan**: open "Link stock received earlier" → "Receipt reference" → `Find posted receipts` → choose in "Posted receipt"; the primary button becomes `Confirm & post bill` and the result reads "Stock received earlier · 0 added again".
- **Review-only colleague (no stock permission)**: primary button reads "Confirm reviewed values & mark reviewed"; outcome "Review saved. Stock not added. An authorized colleague can add stock from this reviewed invoice." A second person opens the bill and presses `Add stock`.
- **OCR garbage on a crumpled bill**: in "Finish this purchase" click `Enter complete invoice manually` → native confirm "Discard the OCR reading and type every invoice row from the complete original? …" → continues as STORY-002 with the photo kept.
- **Wrong file uploaded**: `Reject this upload` → native confirm → "Upload rejected. No stock was added; the original remains in Saved uploads."

### Edge Cases
- **Duplicate bill**: saving a bill whose supplier + number already exists shows "Finish this purchase" with "Existing invoice: …" and `Open existing invoice` → "Compare with saved invoice" (`Use saved values` / `Apply my corrections to this invoice` / `Keep my attempted entry`).
- **Scan fails**: "Original file saved. Enter the invoice details manually or retry the upload." — the photo is kept under "Saved uploads (n)" (collapsed, bottom of the page, latest 20) with `Use for this draft`.
- **Network drops during posting**: status "Stock status unknown" and `Refresh stock status`; every write control is hidden until the saved outcome is re-read. `Recover interrupted import` (always on the page) asks for an "Import attempt ID", optional "Original operator ID" and "Recovery reason".
- **Someone else edited the draft**: alert "Saved invoice changed" → `Compare with saved version`.
- **Posting blocked**: the sticky bar replaces its guidance with the first blocker, e.g. "Resolve the product checks before adding stock.", "Enter the goods received date before adding stock.", or the raw validation string ("Line 3: purchased plus free quantity must be greater than zero"); the button is disabled but does not say which field to visit unless `Next check` stops exist.
- **`Back to list` after entering from Today or the task strip**: those entries set no `return` target, so `back()` only clears parameters that are already empty — the user appears to stay on the same posted bill *(inferred from `InventoryWorkspace.back()`; verify in a walk)*. It returns to the register only when the bill was opened from it.
- **Same thing shown several times**: stock state appears in the top "Stock status" pill, the bottom bar ("Not saved · stock not added"), the "Scan only · stock stays unchanged" cue and each notice; the "what to do next" sentence appears in "Finish this purchase", in "Finish invoice review" and in the bottom bar. `Refresh Matches` and `Retry product check` call the same function; `Resolve line N product` and `Fix products on this invoice` both just scroll to the matching card.
- **One concept, several names** on this one screen: Distributor / Supplier / "Saved supplier"; Bill / Invoice / Purchase ("Scan bill", "Invoice No.", "Finish this purchase", "Purchase documents & history"); catalogue / "saved product" / "drug master" / "inventory" ("Not in inventory") / "item" (`Create new item`); "Add stock" / "post" / "commit" ("Committed Items", "posted to inventory").

---

## STORY-002: Type a small cash bill by hand, get interrupted, resume and post

**Type**: medium
**Topic**: Purchases, suppliers & payables
**Persona**: Imran Sheikh, pharmacist on the evening shift — a local stockist dropped two items with a carbon-copy handwritten bill that will not scan
**Goal**: Record cash bill DDD/1127 from Deccan Derma Distributors (2 lines, ₹2,360) and add the stock
**Preconditions**: PHARMACIST with create/review/commit. Supplier saved. Both products exist in the catalogue. No file to upload.
**Ideal path**: 6 — open entry, pick supplier, type number/date, add two lines by picking products from a list (batch, expiry, qty, rate), post.
**Alternate paths**:
- `Type instead` link under `Scan bill` (used here); `Enter complete invoice manually` after a failed scan; `Import CSV` with a one-bill CSV.
- Stock without a supplier bill: Stock › `Manual opening stock`, Stock list `Add batch` (approval flow), `Inward challans` — these add stock but create no payable.
- Resume routes for unfinished work: "Saved unfinished intake" buttons on the scan screen (server intake drafts); Purchase bills with Payment status `Not posted` (saved invoice drafts only); "Recent invoices (n)" on the scan screen; Today › "Purchase invoices to review"; per-tab local recovery ("Restored your unfinished purchase draft from this tab.").

### Steps
1. Sidebar `Inventory` → `Purchases` → task strip `Scan or enter bill` → the scan screen.
2. Click the `Type instead` link under the `Scan bill` button → the entry form opens and focus lands on "Distributor"; "Check before adding stock" already reports missing values.
3. Type `Deccan` in "Distributor" — it is a plain text box, so nothing is suggested. He opens the "Saved supplier" select ("Select after checking the original invoice") and picks "Deccan Derma Distributors — 36AAICD5530K1Z2" → name and GSTIN fill; "Matching saved supplier found. Continue with invoice review."
4. In "Distributor Bill" type DL No., Invoice No. `DDD/1127`; leave Invoice Date and Goods Received at today; Bill Type stays `Cash` (Due Date is disabled).
5. In "Products on this bill", line "1. New product": type Product `Benzac AC 2.5% Gel`, Pack Size `20 g`, Stock unit `Tube`, Batch `GD4417`, Exp. Month `6`, Exp. Year `2028`, Paid Qty `10`, Free Qty `0`, Rate `118`, MRP `165`, CGST % `6`, SGST % `6`. (12 fields; "Product" is free text with no autocomplete.)
6. The checklist shows "Checking invoice products…" and then "Products need attention — Line 1 … No exact active product matches this name and pack. Correct the invoice identity or choose an existing product. Create a product only if none exists." *(He typed the name slightly differently from the catalogue.)* Click `Resolve line 1 product` → matching card → `Confirm Match` on the suggested "Benzac AC 2.5% Gel 20g".
7. Click `Add Line` → line 2; type Product `Kojivit Gel`, Pack Size `15 g`, Stock unit `Tube`, Batch `KV2209` … and is called to the counter before entering the quantity.
8. Click `Save draft` so the entry is not lost → because line 2 fails validation, a red "Fix Required — These corrections were not saved. Fix the fields below, then try again." list appears *and* the notice "Unfinished invoice saved to the server. Missing fields are allowed; stock has not changed." *(Both messages render together — inferred from `saveIncompleteDraft` not clearing the validation list; the two statements contradict each other.)*
9. Twenty minutes later: `Inventory` → `Purchases` → he looks for the bill in `Purchase bills` with Payment status `Not posted` → it is not listed (the register reads saved invoices only; an "unfinished intake" is a different record).
10. Click `Scan or enter bill` → under "Saved unfinished intake" click the button `DDD/1127 · 13 Nov 2026` *(date format unverified)* → "Restored the saved invoice intake. Complete the highlighted checks before adding stock."
11. Finish line 2: Exp. Month/Year, Paid Qty `10`, Rate `104`, MRP `149`, CGST/SGST; open "Other commercial details" on both lines to enter HSN (required before review).
12. `Confirm Match` for line 2 in the matching card.
13. Compare "Net Payable ₹2,360.00" in "Check bill total" with the paper.
14. Click `Confirm reviewed values & add stock` → "Stock added"; "Stock added - saved receipt" lists both batches.

### Variations
- **Draft that passes validation** (every required header and line value present, some checks open): `Save draft` creates a real invoice — "Invoice DDD/1127 saved. Stock not added. Check the bill before adding stock." — and that one *does* appear in Purchase bills as "Not posted" (Bill status `Draft`).
- **Product missing from catalogue**: inline "New product details" → `Create new item` (as STORY-001 step 23–24).
- **Reception enters, pharmacist posts**: a RECEPTION user without commit permission ends at "Confirm reviewed values & mark reviewed".

### Edge Cases
- **No product picker**: product identity is typed first and matched afterwards in a separate card; a typo creates a "Products need attention" detour for every line.
- **Required-but-hidden fields**: HSN lives under "Other commercial details"; DL No. looks optional; both block posting ("… is required before review").
- **Cash bill with a due date typed earlier**: switching Bill Type back to `Cash` disables Due Date.
- **Rounding**: "Rounding adjustment cannot exceed Rs. 1".
- **Closing the tab mid-entry**: local recovery restores the draft in the same tab only; `Save draft` is the only cross-device path.
- **Two "draft" concepts under one button**: `Save draft` silently produces either an invoice draft (in the register) or an unfinished intake (not in the register) depending on validation.

---

## STORY-003: Find last month's bill from one distributor and open the original

**Type**: short
**Topic**: Purchases, suppliers & payables
**Persona**: Venkat Rao, clinic admin, on the phone with Medline Agencies' accounts person who is quoting bill "MA/2611"
**Goal**: Find the bill, see whether it is paid and open the scanned original
**Preconditions**: ADMIN. The bill was posted in October 2026 with a photo attached.
**Ideal path**: 3 — open Purchase bills, type the bill number, click the attachment.
**Alternate paths**:
- Suppliers › row `Bills` (opens the register filtered to that GSTIN).
- `Payments & dues` › pick the distributor › invoice link in "Bulk Payment Allocation" (outstanding bills only).
- "Recent invoices (n)" on the scan screen (latest few only).
- Pharmacy Report › `Purchase Register` / `Purchase Bills` (read-only GST reports with their own search "Distributor, bill no. or GSTIN"; no link to the bill or the original).
- Stock › `Stock ledger` and an item page link back to the purchase.
- `Print QR` on a bill says "scan or paste its purchase code into the register search" — the register's search only offers `Bill No` and `Distributor` *(whether a pasted code matches is unverified)*.
- Header global search does **not** cover purchase bills.

### Steps
1. Sidebar `Inventory` → `Purchases` → lands on `Purchase bills`, tab `Purchase`; Period defaults to the current financial year; newest entry first.
2. Leave "Search by" on `Bill No`, type `2611` in the search box → the grid filters (debounced); columns Sr No · Bill No · Entry Date · Bill Date · Entry By · Distributor · Bill Amount · Payment.
3. Read the Payment cell → e.g. red badge "Overdue · 12d" with a `Mark paid` button, or "Paid".
4. Click the paper-clip beside the bill number ("Open original bill MA/2611") → the photo/PDF opens; with several files it is a small menu of file names.

### Variations
- **Does not know the number**: "Search by" → `Distributor`, type `Medline`; or `More filters` → Distributor `Medline Agencies`. With one distributor in view a strip appears: "Medline Agencies · across all bills, not just this period — Due ₹… − Credit held ₹… = Net payable ₹…".
- **Only unpaid**: "Payment status" → `Outstanding` / `Due` / `Overdue` / `Part paid` / `Paid` / `Not posted`.
- **Other filters** under `More filters`: "Bill status" (`Draft`, `Any review step`, `OCR review required`, `Reconciliation failed`, `Reviewed`, `Stock added`, `Cancelled`), "Source" (`Typed in`, `Scanned`, `CSV import`, `Gmail`), "Entry by". `Clear all` resets.
- **Export**: `More` ▾ → `Export to Excel` (current filters).
- **Open the bill itself**: click the bill number or the row → workbench in read-only form with `Back to list`.

### Edge Cases
- **Bill dated in the previous financial year**: nothing found until Period is changed (presets `Today`, `Yesterday`, `Last 7 days`, `This month`, the two FY labels, `Custom`). Empty state: "No purchase bills match your search — Nothing entered with a bill date between … and … with these filters." + `Clear filters`.
- **Totals footer**: "Bills ₹… · Outstanding in these N bills ₹…" (the outstanding part is a link to `Payments & dues`) with a note "*n* not posted and *m* cancelled not included".
- **MANAGER**: has Inventory in the sidebar but is not in the register's server role list — expect the denied state with `Scan or enter a bill` *(inferred from `pharmacy-purchase-register.controller.ts`)*.
- **Status vocabulary differs by surface**: the register says "Stock added" / "Not posted" / "Reviewed"; the bill itself says "Ready to add stock", "Needs corrections", "Invoice posted"; Today calls the same queue "Purchase invoices to review".

---

## STORY-004: Mark a supplier bill paid from the register — and undo a wrong entry

**Type**: short
**Topic**: Purchases, suppliers & payables
**Persona**: Venkat Rao, clinic admin, has just sent ₹12,480 by NEFT to Medline Agencies
**Goal**: Record that bill MA/2611 is fully paid
**Preconditions**: ADMIN with ledger write (`creditWrite`). Bill MA/2611 is posted ("Stock added") and shows "Due" or "Overdue". No supplier credit held for Medline.
**Ideal path**: 3 — click `Mark paid`, confirm mode/reference, record.
**Alternate paths**:
- `Payments & dues` › "Bulk Payment Allocation" (STORY-007) — the only place for a part payment or one payment across several bills.
- Set off a credit instead of paying: `Mark paid` dialog's credit banner, Returns tab `Set off`, the distributor strip `Set off all ₹…`, `Credits & vouchers` › `Set off against bills`, the bill's `Eligible supplier credits` (STORY-006).
- Undo: 30-second `Undo` in the Payment cell or in the toast; later, `Payments & dues` › "Recorded payments" › `Reverse payment` (reason required).

### Steps
1. In `Purchase bills` (STORY-003 step 1–2) find MA/2611 and click `Mark paid` in its Payment cell → a small dialog anchored to the row: title "Pay ₹12,480.00 to Medline Agencies", description "For bill MA/2611".
2. "Mode" is preselected (`NEFT / RTGS` by default, or whatever he used last — remembered in the browser); "Date" shows today as text `13/11/2026`. He leaves both.
3. Type the UTR in "Cheque / UTR no. (optional)".
4. Click `Record payment ₹12,480.00` → dialog closes; the row's badge turns green "Paid" and an `Undo` link sits beside it for 30 seconds; focus moves to the next payable row's `Mark paid`.
5. He realises he opened the wrong MA bill → click `Undo` in the Payment cell within 30 seconds → toast "Payment undone — Bill MA/2611: Due ₹12,480.00." and `Mark paid` is back.

### Variations
- **Paid by cheque yesterday**: change Mode to `Cheque`, overtype Date `12/11/2026` (free text, dd/mm/yyyy; not a date picker).
- **Row filtered away after paying** (e.g. Payment status `Overdue`): the row disappears, so a toast "Payment recorded — ₹12,480.00 to Medline Agencies for bill MA/2611." carries the `Undo` action instead.
- **Distributor has credit that covers the bill**: title becomes "Settle bill MA/2611 · ₹12,480.00" with a blue box "₹15,000.00 credit from Medline Agencies covers this bill. Set it off, or record a payment below." and a primary `Set off ₹12,480.00 credit`; `Record payment …` drops to an outline button.
- **Credit smaller than the bill**: blue line "₹3,000.00 credit from Medline Agencies is available." with link `Set off ₹3,000.00 instead` → hands over to the "Set off credit from …" dialog.

### Edge Cases
- **Part payment is impossible here**: the amount is fixed to the bill's payable; there is no amount field. A cheque for less than the bill must go through `Payments & dues`.
- **Date validation**: "Enter the payment date as dd/mm/yyyy.", "The payment date cannot be after today, …", "… cannot be before the bill date, …".
- **Someone else paid it meanwhile**: toast "This payment was already recorded — The list now shows the bill’s latest balance." or "This bill’s balance changed — Check the new amount before recording a payment."
- **Undo window missed**: no undo in the register; failure copy points to "You can reverse it from Payments & dues."
- **Not-posted bill**: grey badge "Not posted" (tooltip "{status} · Post stock before paying"), no `Mark paid`.
- **Scheduled payment**: badge "Scheduled {date}" with "was due …"; `Mark paid` hidden when the whole balance is scheduled.
- **RECEPTION**: can enter bills but sees no `Mark paid` (role not in the ledger-writer list).
- **Naming**: button `Mark paid`, dialog "Pay …" or "Settle bill …", submit `Record payment`, ledger "Bulk Payment Allocation" / `Record Payment`, discovery doc calls it "Settle bill".

---

## STORY-005: Discover a mistake after posting and correct it with a linked return

**Type**: medium
**Topic**: Purchases, suppliers & payables
**Persona**: Sravani Kolla, pharmacist, doing the Saturday shelf check — bill SVP/26-27/4183 was posted with 20 tubes of Benzac AC but only 10 arrived
**Goal**: Make stock and the payable match what was actually received
**Preconditions**: PHARMACIST with purchase edit and supplier-return write. The bill is "Stock added". Nothing from that batch has been sold.
**Ideal path**: 4 — open the bill, change the wrong line's quantity with a reason, confirm, done (system posts the stock and payable difference itself).
**Alternate paths**:
- The posted bill's own header text says "Stock added. To fix a saved quantity, price or product detail, open the batch below." → batch link → item page → `Edit stock` / `Edit price` (doctor approval queue; changes stock but not the supplier payable).
- "Invoice history and documents" › `Correct posted purchase` › `Start linked return` (used here), or directly `Return to supplier` in the same button row (same destination).
- Price-only error: `Correct posted purchase` › link `Record linked supplier credit` (a Credit note document).
- Stock › `Corrections` / "Post linked correction" on the item page; Stock counts approve-and-adjust; `Loss & breakage` — all change stock without touching the payable.
- For a *draft* (not posted) bill: `Edit draft` / `Review issues`, or `Reject invoice`.

### Steps
1. `Inventory` → `Purchases` → `Purchase bills`; search `4183`; click the bill number → workbench, heading "Stock added", status pill "Stock added", every field read-only.
2. Read the line under the heading: "Stock added. To fix a saved quantity, price or product detail, open the batch below." *(She starts toward the batch link, then remembers the supplier bill would still claim 20 tubes.)*
3. Scroll to the bottom and open the collapsed "Invoice history and documents" → section "Purchase documents & history — The receipt is posted. Keep corrections linked to its original stock and supplier history."
4. Click `Correct posted purchase` → an explanatory panel "Correct this posted purchase — Create a linked supplier return with a reason for affected quantities. Finalise its credit, then enter the corrected replacement bill. For a price-only supplier credit, use a linked credit note. …"
5. Click `Start linked return` → **full page reload** to `?area=purchases&view=SUPPLIER_RETURN&new=purchase-{id}-return&purchaseInvoiceId={id}` → a "Supplier returns" document, Supplier preselected, Note "Return against SVP/26-27/4183", and **all six bill lines prefilled at their full billed quantities**.
6. Remove the five lines that are fine (trash icon "Remove line N" × 5).
7. On the Benzac line change Quantity 20 → 10 (the ten that never arrived).
8. Choose "Reason for return" — options are `Expired`, `Near expiry`, `Breakage`, `Wrong item supplied`, `Excess supply`, `Other`; none means "billed but not delivered". She picks `Other` and types "Short supply – 10 billed extra" in "Note (optional)".
9. Leave "Return price basis" on `Purchase rate per stock unit`; check the footer "Taxable ₹… + GST ₹… Total ₹1,321.60".
10. Click `Create return challan` → heading "Return challan saved"; outcome text "Stock has already been sent back to the supplier on this return challan." and "When the distributor’s credit note arrives, choose Record credit note …". Ten tubes are now deducted from the batch.
11. Click the back arrow ("Back to supplier returns") → lands on a plain "Supplier returns" list (the generic workflow register, heading + `New document` + Status filter) — **not** on Purchase bills › Returns, and not on the bill she came from.
12. Navigate `Purchase bills` → tab `Returns` → the return shows "Credit note awaited · today"; when Sri Venkateshwara sends the credit note she continues as STORY-006 step 9.

### Variations
- **Price was wrong, quantity right**: step 5 uses `Record linked supplier credit` → a "Credit notes" document prefilled with one line "Price adjustment credit" (qty 1, rate 0); enter "Credit note no.", "Credit note date", the amount as the line rate, then `Post supplier credit`.
- **Only the shelf location is wrong**: `Set location & discount` → "Shelf / location", "Suggested future sale discount (%)", "Reason for change" → `Save location & discount` (no stock or payable change).
- **Need the paper trail**: `Logs` (raw before/after JSON per event), `Return history (n)`, exports `PDF` / `Excel` / `Purchase CSV` / `Print QR`, `Add supporting original`.
- **Bill still a draft or "Reviewed"**: `Edit draft`, or `Reopen review and fix products` with "Reason to reopen review".

### Edge Cases
- **Two contradictory instructions on one screen**: the header says "open the batch below" (stock-only edit via approval), the history panel says "create a linked supplier return … then enter the corrected replacement bill".
- **"Enter the corrected replacement bill"** has no button; re-entering the same supplier + invoice number is expected to trip the duplicate check ("Existing invoice …" / `Open existing invoice`) *(inferred — verify in a walk)*.
- **The mental model is wrong for a data-entry error**: goods that never arrived are "returned" on a challan, and the screen states "Stock has already been sent back to the supplier".
- **Units already sold**: return quantity cannot exceed remaining eligible units; the document shows a "Recovery steps" box and `Inspect batch balance and holds`.
- **Wrong challan**: `Cancel document` (while in challan state) or, for approvers, `Correct by reversal` → "Reversal reason" → `Reverse posted effects`.
- **Navigation loss**: `Start linked return` uses `window.location.assign`, so the return document has no route back to the bill; the "View linked …" link at the top of the document is the only way back.
- **A third returns list**: the "Supplier returns" workflow register reached in step 11 has no menu entry and duplicates Purchase bills › Returns with different columns and filters.

---

## STORY-006: Return expired stock, record the distributor's credit note and set it off against a bill

**Type**: medium
**Topic**: Purchases, suppliers & payables
**Persona**: Imran Sheikh, pharmacist — month-end expiry clear-out; later the same week the credit note arrives by WhatsApp
**Goal**: Send 8 expired tubes back to Medline Agencies, record credit note CN/MA/0412 for ₹1,416 and use it against the oldest Medline bill
**Preconditions**: PHARMACIST with supplier-return write and ledger write. Batch "Kojivit Gel 15g · KV2101" has 8 units, expired. Medline has two posted unpaid bills.
**Ideal path**: 7 — new return, pick supplier, pick batch + qty + reason, create challan; later: open the awaited return, enter note number/date/amount, confirm set-off.
**Alternate paths**:
- Start a return: Purchase bills › Returns › `New return` (used here); a posted bill's `Return to supplier` / `Start linked return`; Stock › `Stock optimization` › `Create return draft` (per distributor, returnable batches); item page button `Supplier returns`; the hidden "Supplier returns" workflow list › `New document`; Stock area link "Supplier returns are now in Purchase bills › Returns".
- Record the credit note: Returns row link `Record credit note` (used here); `Record credit note` button inside the return document; Today › "Credit notes awaited"; `Credits & vouchers` › `Record credit note` (creates a *standalone* Credit note document — a different record type that also appears in the Returns tab).
- Set off: toast action `Set off ₹… now` (used here); Returns row `Set off`; distributor strip `Set off all ₹…` (Purchase or Returns tab with a distributor filter); `Mark paid` dialog credit banner; `Credits & vouchers` › `Set off against bills`; the same panel inside `Payments & dues` and inside a bill's `Eligible supplier credits`; the green notice button in the return document.

### Steps
1. `Inventory` → `Purchases` → `Purchase bills` → tab `Returns` → the action button changes to `New return`.
2. Click `New return` → a "Supplier returns" document, heading "Unsaved draft", help text "Save a draft and send the goods back on a challan. When the distributor's credit note arrives, record it here or from Purchase bills › Returns."
3. Choose Supplier "Medline Agencies · 36AAGFM7719Q1ZP".
4. Set "Reason for return" → `Expired`.
5. Type `Kojivit` in "Add a batch" ("Search product, batch, barcode or SKU") → pick "Kojivit Gel 15g · KV2101 · expires … — 8 Tube available · ₹…".
6. Set Quantity `8` on the line; check "Total ₹1,416.00".
7. Click `Create return challan` → heading "Return challan saved"; stock leaves the batch. Hand the tubes to the Medline delivery boy.
8. *(Four days later.)* `Inventory` → Today → click the row "Credit notes awaited — 1" → Purchase bills › Returns filtered to Status `Awaited`; the row shows amber "Credit note awaited · 4d" and, in the first column, a link `Record credit note` above the return reference.
9. Click `Record credit note` → dialog "Record credit note from Medline Agencies — For return SR-… ".
10. Type "Credit note no." `CN/MA/0412` (forced upper-case) and "Credit note date" `11/11/2026` (free text dd/mm/yyyy).
11. Click `Same as return value` to fill "Amount (₹)" with 1416 → click `Record credit note` → toast "Credit note CN/MA/0412 recorded: ₹1,416.00 from Medline Agencies. — Set it off against the distributor’s bills now, or later from this list." with action `Set off ₹1,416.00 now`; the row badge becomes blue "Received · ₹1,416.00 left" with a `Set off` button.
12. Click `Set off ₹1,416.00 now` → dialog "Set off credit from Medline Agencies — ₹1,416.00 available from credit note CN/MA/0412. Filled from the oldest due date." A table Bill · Due date · To pay · "Set off ₹" lists both open bills with the oldest prefilled; "₹0.00 credit left after this".
13. Click `Set off ₹1,416.00` → toast "Set off ₹1,416.00 against bill MA/2611. — Undo is in the Status column for 30 seconds."; the row becomes green "Fully used".
14. Switch to tab `Purchase` → MA/2611 now shows "₹11,064.00 due" with the note "₹1,416.00 paid".

### Variations
- **Distributor credits less than the return** (deducts handling): type 1,300 → amber note "₹116.00 less than your return value. Fine if the distributor’s note says so." → `Record credit note` still works.
- **Amount more than the return by over ₹1**: first click only raises the warning "… more than your return value of … Check the amount on the distributor’s note."; the button relabels to `Record ₹1,500.00 anyway` and needs a second click.
- **Typed the note number wrong**: pencil icon beside the number ("Correct the number, date or amount") → "Correct credit note CN/MA/0412" with mandatory "Why correct it?" → `Save correction`. If part is already set off the amount is locked ("… so its amount stays ₹…").
- **Split across bills**: in step 12 edit the "Set off ₹" boxes per bill; `Set off ₹…` enables only when total > 0 and ≤ credit.
- **Not ready to dispatch**: `Save draft` instead of `Create return challan` ("Draft • no stock change"); the Returns row shows "Draft" with `Open draft`.
- **Return of blocked stock**: choose the hold in "Stock source" instead of "Available stock (no hold)".
- **Returns register filters**: Search by `Credit note no` / `Return ref` / `Distributor`; Status `Awaited`, `Received`, `Adjusted`, `Fully used`, `Draft`, `Cancelled`; More filters Distributor, Type (`Returns only` / `Credit notes only`), Reason, Entry by. Footer "Credit held (all dates) ₹… · Awaited ₹… (n returns)".

### Edge Cases
- **Duplicate credit note number**: inline error on "Credit note no." (server code `CREDIT_NOTE_DUPLICATE`).
- **Date rules**: "The credit note date cannot be before the return date, …" / "… cannot be after today, …".
- **Return changed elsewhere**: destructive toast "This return changed — The list now shows its latest status. Your entry was not saved: credit note …".
- **No open bills**: set-off dialog says "No posted bill from Medline Agencies has anything left to pay. The credit stays available for the next bill."
- **Undo after 30 s**: Returns register has no later undo; go to `Credits & vouchers` (or the same panel in `Payments & dues`) › `Reverse allocation`, which asks for the reason in a native browser `prompt()`.
- **Vocabulary for one act**: "Set off", "Set off against bills", "Set off all", "allocated" / `Reverse allocation`, "Adjusted" / "Fully used", "applied"; the operator guide calls the button "Allocate to bill". Return states are "Draft • no stock change", "Challan • stock returned", "Return challan saved", "Credit note awaited".
- **Same credit shown in four places**: Returns register row, `Credits & vouchers`, the credits panel inside `Payments & dues`, and `Eligible supplier credits` inside each bill.

---

## STORY-007: Month-end — one cheque across three bills, a part payment, and reversing a wrong entry

**Type**: medium
**Topic**: Purchases, suppliers & payables
**Persona**: Venkat Rao, clinic admin, last working day of the month with the cheque book open
**Goal**: Record cheque 004512 for ₹40,000 to Sri Venkateshwara Pharma Distributors against three bills (two in full, one in part) and fix a payment he mis-recorded last week
**Preconditions**: ADMIN with ledger read + write. The distributor has three posted unpaid bills (₹18,642, ₹14,358, ₹12,000). A ₹9,500 UPI payment was recorded last week against the wrong bill.
**Ideal path**: 5 — open the supplier account, enter cheque details once, tick the bills (auto-fill oldest first), record; for the fix: open the payment, move it, give a reason.
**Alternate paths**:
- Reach the ledger: `More tasks…` › `Payments & dues`; Purchase bills `More` ▾ › `Payments & dues`; the register footer link "Outstanding in these N bills ₹…"; Today row "Overdue supplier bills" or button `Check overdue supplier balances`; Suppliers › `Account & dues`.
- Pay single bills in full with `Mark paid` × 2 from the register (STORY-004) — but the part payment still needs this screen.
- Reverse: register `Undo` (30 s only); here `Reverse payment` / `Reallocate payment`.

### Steps
1. `Inventory` → `Purchases` → `More tasks…` select → `Payments & dues` → page titled "Purchase Ledger" (not "Payments & dues"). Tiles "Outstanding" (with "Net of credit held …"), "Overdue", "Due Soon", "TCS Watch"; tables "Distributor Summary", "Aging", "Alerts".
2. Click the "Sri Venkateshwara Pharma Distributors" row in "Distributor Summary" → the lower sections ("Supplier credits & vouchers", "Recorded payments", "Bulk Payment Allocation") reload for that distributor. *(Nothing scrolls or highlights; he has to scroll down to see the effect.)*
3. Scroll to "Bulk Payment Allocation"; confirm the "Distributor" select shows the right name.
4. Set "Payment Date" (native date picker), "Mode" → `CHEQUE` (raw upper-case codes here; the register dialog says "Cheque").
5. Type "Reference No" `004512` and an optional note.
6. In the invoice table click `Max` on the ₹18,642 bill and `Max` on the ₹14,358 bill → "Allocate" boxes fill and the "Amount" field is overwritten with their sum, 33000.
7. Type `7000` in the "Allocate" box of the ₹12,000 bill → the footer reads "Allocated total Rs 40,000.00 / Payment amount Rs 33,000.00" and `Record Payment` is disabled.
8. Correct "Amount" to `40000` → totals match; `Record Payment` enables.
9. Click `Record Payment` → alert "Saved — Payment recorded and allocated."; tiles and tables refresh.
10. Scroll up to "Recorded payments" → find "₹9,500.00 · UPI · 05 Nov 2026" *(date format unverified)* → click `Reallocate payment`.
11. In the "Reallocate ₹9,500.00" panel move the amount from the wrong bill's box to the right one so "Allocated ₹9,500.00 of ₹9,500.00"; type "Reason for correction"; click `Confirm reallocation` → "Payment reallocated. The original and replacement remain in the history."

### Variations
- **Amount first**: typing `40000` in "Amount" and then pressing `Max` on any bill replaces 40000 with the allocation sum — he must re-type it.
- **Wrong amount recorded**: `Reverse payment` → "This reopens the allocated invoice balances and keeps an audit history. It does not refund or transfer money." + reason → `Confirm reversal`, then record the correct amount afresh ("To correct the amount, reverse this payment and record the correct amount.").
- **Came from the register with a distributor filter**: `More` ▾ › `Payments & dues` carries the GSTIN, so step 2 is skipped.
- **Use a credit as part of the settlement**: "Supplier credits & vouchers" in the middle of this page › `Set off against bills`.

### Edge Cases
- **No ledger permission**: the `Payments & dues` task is hidden; a direct link shows "Supplier payments require purchase-ledger permission."
- **Read-only ledger user**: `Record Payment` stays disabled with no explanation; no `Reallocate` / `Reverse` buttons.
- **Alerts are counts only**: "Due in 7 days", "Due today", "Overdue", "TCS approaching" cannot be clicked to list the bills behind them.
- **Money and date formats differ from the register**: "Rs 18,642.00" here vs "₹18,642.00" there; native date inputs here vs typed dd/mm/yyyy in the register dialogs; mode codes vs mode labels.
- **Payment changed in another tab**: "This payment changed. Review its current details before correcting it."
- **Naming**: task `Payments & dues` → heading "Purchase Ledger" → section "Bulk Payment Allocation" → button `Record Payment`; bills are "Invoices" on this page and "Bills" in the register.

---

## STORY-008: Add a new distributor and record the terms the rep agreed

**Type**: medium
**Topic**: Purchases, suppliers & payables
**Persona**: Dr. Lakshmi Reddy, dermatologist and clinic owner, just after a meeting with the rep from Deccan Derma Distributors
**Goal**: Save the distributor and record "15% discount, 10+1 scheme, minimum 18 months expiry" for two sunscreens so the pharmacist sees it when the first bill arrives
**Preconditions**: DOCTOR (passes server gates; terms are editable by doctor/admin/owner only). The two products exist in the catalogue. Distributor not yet saved.
**Ideal path**: 6 — add supplier (name + GSTIN), open its terms, pick two products, type the terms once for both, save.
**Alternate paths**:
- Create the supplier: Purchases › `Suppliers` › `Add supplier` (used here); Purchase bills `More` ▾ › `Suppliers`; inline in the bill workbench via `Save verified supplier` (name + GSTIN only) — no supplier can be created from inside the Terms wizard ("No distributor matches. Add distributors under Suppliers.").
- See the terms: `Terms of Trade` task; the blue "Agreed terms with …" panel and per-line "Agreed: … / Invoice: …" hints in the bill workbench.

### Steps
1. `Inventory` → `Purchases` → `More tasks…` → `Suppliers` → list "Suppliers" with `Add supplier`.
2. Click `Add supplier` → an inline form opens above the list.
3. Fill "Supplier name" `Deccan Derma Distributors`, "GSTIN" `36AAICD5530K1Z2` (both required), "Drug licence", "Contact person" `Ramesh`, "Phone" `9848012345`, "Payment terms" `30 days` (free text); "Active supplier" stays ticked.
4. Click `Save supplier` → form closes; the row shows "36AAICD5530K1Z2 · 9848012345 · Active" with `Bills`, `Account & dues` and a pencil.
5. There is no "Terms" action on the supplier row. Open `More tasks…` → `Terms of Trade` → heading "Terms of Trade — What each distributor agreed per product, so whoever receives a delivery can check it."
6. Click `Add terms` → wizard "Add terms", step chips "1. Distributor  2. Items  3. Scheme  4. Review".
7. Type `Deccan` in "Find distributor" → click the result "Deccan Derma Distributors — 36AAICD5530K1Z2 · 0 products with terms" → `Next`.
8. In "Find product" type `Photostable` → `Add`; type `Sunstop` → `Add` → "Selected products (2)" → `Next`.
9. In the dashed box "Same terms for every selected product" type Discount % `15`, Scheme: buy `10`, Scheme: get free `1`, Min expiry (months) `18`, Note `Agreed with Ramesh, Nov 2026` → click `Apply to all selected` → both product boxes fill.
10. Click `Next` → "Review" lists each product with its summary and the note "These terms will appear when an invoice from Deccan Derma Distributors is entered. Saving a product that already has terms replaces them."
11. Click `Save terms` → the "Agreed terms" table for the distributor: Product · Discount · Scheme · Min expiry · Margin · PTR · Note · Entered ("by Dr. Lakshmi Reddy on …"), each product with `Edit` and `Delete`.

### Variations
- **Product not in the catalogue yet**: `Add “Sunstop Aqua Gel” as typed` → saved as "Not linked to a catalogue product" (matched by name later).
- **Edit one term**: `Edit` → the wizard opens directly on the Scheme step titled "Edit terms for {product}" → `Save terms`.
- **Delete**: `Delete` → inline `Confirm delete` / `Keep`.
- **Pharmacist view**: same page, banner "Read-only. Doctors and admins can change terms."; no `Add terms`, `Edit`, `Delete`.
- **Fix supplier details later**: pencil on the supplier row → same inline form → `Save supplier`.

### Edge Cases
- **GSTIN is mandatory** in the supplier form — an unregistered local supplier cannot be saved.
- **Invalid term value**: "Check {field}." under the product box; `Next` / `Save terms` disabled.
- **Supplier vs Distributor in one flow**: task "Suppliers", button `Add supplier`, then "Find distributor", "Distributor: …", "No distributor matches. Add distributors under Suppliers."
- **Supplier "Payment terms" vs Terms of Trade**: two unrelated things with near-identical names; the supplier's "Payment terms" text is not shown in Terms of Trade, and neither visibly drives a bill's Due Date.
- **Terms are advisory**: a bill that violates them (STORY-001 step 25) is only hinted, never blocked or listed anywhere for follow-up.
- **No suppliers yet**: "No suppliers yet. Add a supplier to start recording purchases." / without permission "Ask an administrator to add a supplier."

---

## STORY-009: Check whether a distributor has quietly cut the discount

**Type**: short
**Topic**: Purchases, suppliers & payables
**Persona**: Dr. Lakshmi Reddy, owner, Sunday evening review
**Goal**: See purchase value by distributor for the last quarter and any products whose discount dropped
**Preconditions**: DOCTOR/OWNER. At least a few bills reviewed/posted in the last 90 days.
**Ideal path**: 3 — open purchase analytics, pick the distributor from a list, read the alerts.
**Alternate paths**:
- Pharmacy Report › `Purchase Register` / `Purchase Bills` / `Item Wise Margin Report` (GST and margin views of the same bills; different page, different filters).
- `Payments & dues` › "Distributor Summary" (money owed, not cost trends).
- Per-bill "Indicative margin at MRP" in the workbench; per-line "Agreed vs Invoice" hints.
- Old links `?area=purchases&view=reports|daywise|margin` redirect out to Pharmacy Report ("This report is now under Pharmacy Report. Opening it…").

### Steps
1. `Inventory` → `Purchases` → `More tasks…` → `Purchase costs` → page titled "Distributor Analytics — Reviewed purchase invoices only. Drafts with OCR or reconciliation issues are excluded." It loads the last 90 days.
2. Read the tiles "Purchase Value", "Taxable", "Free Stock", "Effective Cost" and the "Distributor Ranking" table (Distributor · Invoices · Value · Free Qty · Avg Discount · Last Invoice).
3. To narrow to one distributor she needs its GSTIN: copy `36AAKFS4821M1Z6` from the ranking row, paste it into the "GSTIN" filter, and click `Refresh` (filters do nothing until `Refresh`).
4. Scroll to "Discount Drop Alerts" → rows Product · Distributor · Previous · Latest · Drop · Invoices; e.g. "Photostable Gold SPF 55 Gel — 12% → 8%".

### Variations
- **One product across distributors**: type in "Product" → `Refresh` → "Product Effective Cost" (Qty · Effective Cost · Latest Rate · Discount).
- **Stricter alert threshold**: "Drop %" (default 5) → `Refresh`.
- **Start over**: `Reset` restores the default filter values but does not reload until `Refresh`.

### Edge Cases
- **No data**: "No reviewed purchase data found", "No product analytics available", "No discount-drop alerts".
- **Mixed pack units**: "Effective Cost" tile shows "Mixed units — compare products".
- **Dead ends**: rows are not links — no way to open the bills behind an alert or jump to the distributor's terms/account.
- **Naming**: task `Purchase costs` opens "Distributor Analytics"; the page says "invoices" and "Distributor" while the task list says "Purchase bills" and "Suppliers".

---

## STORY-010: Bring in an e-mailed bill through Gmail (or a CSV) and review it

**Type**: medium
**Topic**: Purchases, suppliers & payables
**Persona**: Kavya, receptionist who also handles purchase entry on weekday mornings — Medline e-mails its invoices as PDFs
**Goal**: Pull this week's Medline invoice PDF from the clinic Gmail into a review draft without downloading and re-uploading it
**Preconditions**: RECEPTION with purchase create permission. Gmail integration configured on the server (`GMAIL_*`); not yet connected for the clinic account.
**Ideal path**: 4 — open Gmail intake, see new invoice e-mails already listed, click the attachment, land in the review draft.
**Alternate paths**:
- Download the PDF and use `Scan or enter bill` (STORY-001).
- `Import CSV` when the distributor sends a spreadsheet (see Variations).
- All three converge on the same workbench review and the same `Confirm reviewed values & add stock`.

### Steps
1. `Inventory` → `Purchases` → `More tasks…` → `Gmail intake` → heading "Invoice attachments from Gmail — Choose an invoice attachment to open a review draft."; "Checking Gmail connection…".
2. Click `Connect Gmail` → browser leaves for Google's consent screen; she signs in as the clinic account and approves.
3. Google redirects back to the Gmail intake screen → "Connected: **linaeclinic@gmail.com** — Last attachment search: Not searched yet · current account and search query", with `Disconnect Gmail`.
4. The search box is prefilled with Gmail syntax `newer_than:30d` (placeholder "from:supplier@example.com newer_than:30d"). She edits it to `from:accounts@medlineagencies.in newer_than:7d` *(hesitates: this is raw Gmail query syntax)*.
5. Click `Find invoice attachments` → list of messages (subject, sender, date) each with buttons `Review {file name}`.
6. Click `Review MA-2648.pdf` → the app switches to `Scan or enter bill` with the notice "Imported draft ready for review. The original is saved; stock has not changed." and the PDF in the "Original invoice" viewer.
7. Review as in STORY-001 steps 6–27 (supplier, flagged fields, product matches, totals).
8. Kavya has no stock permission, so the primary button reads `Confirm reviewed values & mark reviewed` → click → "Review saved. Stock not added. An authorized colleague can add stock from this reviewed invoice."
9. The pharmacist later opens the bill from Purchase bills (Payment status `Not posted`, Bill status `Reviewed`) and clicks `Add stock`.

### Variations
- **CSV instead**: task strip `Import CSV` → "Import purchase CSV — Review imported lines before adding stock." → download icon "Download purchase CSV template" (31 columns, one row per item with the bill header repeated) → choose file in "Purchase invoice CSV" → `Open review draft` ("Reading CSV…") → same workbench. "CSV format and required columns" explains the layout.
- **Already imported**: both routes open the existing bill directly when the server reports a duplicate.
- **More mail**: `Load more messages`.
- **Stop access**: `Disconnect Gmail` (no confirmation).

### Edge Cases
- **Gmail not configured**: "Gmail is not configured. Ask your administrator to connect it. Photo/PDF and CSV intake are available." plus an "Administrator setup" disclosure that lists server environment variable names to an end user.
- **Connection check fails**: red error + `Retry connection check`.
- **No matches**: "No invoice attachments match this search."
- **Imported draft lives in page memory**: it is handed to the workbench through React state, so a browser refresh between step 6 and the first `Save draft` drops the extracted values (the original file is retained and reappears under "Saved uploads") *(inferred from `InventoryWorkspace` `importedDraft` state)*.
- **Label drift across the three intake screens**: `Scan bill` vs `Open review draft` vs `Review {file}`; "Import CSV" (task) vs "Import purchase CSV" (heading) vs "CSV import" (register Source filter); "Gmail intake" (task) vs "Invoice attachments from Gmail" (heading) vs "Gmail" (Source).

---

## Redundancy notes

**Duplicate paths (same goal, several routes)**

- *Start a new bill* — Today `Scan or enter bill`, task strip `Scan or enter bill`, register `New purchase`, empty-state `New purchase`, denied-state `Scan or enter a bill`, workbench `New invoice`; plus `Import CSV`, `Gmail intake`, `Automatic import` › `Import & Add Stock`, and Inward challan › `Create linked purchase bill`. (`inventory/InventoryWorkspace.tsx`, `inventory/purchase/PurchaseBills.tsx`, `PurchaseRegister.tsx`, `pharmacy/PurchaseInvoiceWorkbench.tsx`, `inventory/AlternateInvoiceIntake.tsx`)
- *Post a bill* — `Confirm reviewed values & add stock` / `Confirm & post bill`, `Add stock` / `Post bill` (reviewed bills), `Mark Reviewed`, `More options` › `Save & Process`, `Import & Add Stock`. Five verbs for the final act. (`PurchaseInvoiceWorkbench.tsx` ~3680–3720, 4372–4382)
- *Re-run the product check* — `Refresh Matches` and `Retry product check` call the same `refreshMasterMatches()`; `Resolve line N product` and `Fix products on this invoice` both only scroll to the matching card. (`PurchaseInvoiceWorkbench.tsx` 3341–3346, 3594, 4742)
- *Pay a supplier* — register `Mark paid` (full amount only, no amount field) vs `Payments & dues` › "Bulk Payment Allocation" (only place for part or multi-bill payments). Different money format (₹ vs "Rs"), date input (typed dd/mm/yyyy vs native picker) and mode labels ("NEFT / RTGS" vs `NEFT`). (`purchase/MarkPaidDialog.tsx`, `pharmacy/PurchaseLedger.tsx`)
- *Reach the ledger* — `More tasks…` › `Payments & dues`; register `More` ▾; register footer link; Today row and Today button; Suppliers › `Account & dues`. (`InventoryWorkspace.tsx`, `PurchaseBills.tsx`, `PurchaseRegister.tsx`)
- *Set off a credit* — eight entry points: Returns row `Set off`; toast `Set off ₹… now`; strip `Set off all ₹…` (both tabs); `Mark paid` dialog banner (two variants); `Credits & vouchers` › `Set off against bills`; the same `SupplierCreditPanel` embedded in `Payments & dues`; again in a bill's `Eligible supplier credits`; return-document notice button. All open `SetOffCreditDialog`. (`purchase/SetOffCreditDialog.tsx`, `SupplierCreditPanel.tsx`, `PurchaseDocumentActions.tsx`, `PurchaseLedger.tsx`, `WorkflowDocumentEditor.tsx`)
- *Undo money entries* — 30-second `Undo` (cell + toast), `Reverse payment` / `Reallocate payment` (ledger), `Reverse allocation` via native `window.prompt` (credits panel), `Correct by reversal` (documents). (`purchase/settle.tsx`, `pharmacy/SupplierPaymentRecovery.tsx`, `SupplierCreditPanel.tsx`)
- *Start a supplier return* — Returns `New return`; bill `Return to supplier`; bill `Correct posted purchase` › `Start linked return` (same destination as the previous button); Stock optimization `Create return draft`; item page `Supplier returns`; hidden workflow register `New document`. (`PurchaseBills.tsx`, `PurchaseDocumentActions.tsx`, `optimization/StockOptimization.tsx`, `InventoryItemPage.tsx`)
- *Record a credit note* — Returns row link, return document button, Today queue, and `Credits & vouchers` › `Record credit note` (which creates a different, standalone document type). (`purchase/RecordCreditNoteDialog.tsx`, `returns-columns.tsx`, `SupplierCreditPanel.tsx`)
- *Lists of returns* — Purchase bills › `Returns` (rich register) **and** an unlinked generic "Supplier returns" / "Credit notes" `WorkflowRegister` that the user lands on when pressing Back from a return opened without a `return` target (e.g. from a bill). (`InventoryWorkspace.tsx` `WorkflowRegister`, `back()`)
- *Fix a posted bill* — header copy says "open the batch below" (stock edit via approval), history panel says linked return + replacement bill, and Stock offers Corrections / counts. Two instructions on the same screen disagree. (`PurchaseInvoiceWorkbench.tsx` 4175, `PurchaseDocumentActions.tsx` 465)
- *Create a supplier* — `Suppliers` › `Add supplier` (10 fields) vs workbench `Save verified supplier` (name + GSTIN). (`InventoryWorkspace.tsx` `SupplierWorkspace`, `pharmacy/PurchaseSupplierReview.tsx`)
- *Resume unfinished work* — "Saved unfinished intake", "Saved uploads (n)", "Recent invoices (n)", register `Not posted`, Today "Purchase invoices to review" and "Original files awaiting intake", per-tab local recovery. `Save draft` silently writes one of two record types; only one of them shows in the register. (`PurchaseInvoiceWorkbench.tsx` 3704–3710, 3879–3897, 5419–5474; `backend/.../pharmacy-purchase-register.service.ts`)

**Duplicate information**

- Supplier credits appear in the Returns register, `Credits & vouchers`, inside `Payments & dues`, and inside each bill.
- Distributor position ("Due − Credit held = Net payable") appears as the register strip, the ledger "Distributor Summary", and the ledger "Outstanding" tile.
- Purchase bills are listed in the register, "Recent invoices", Pharmacy Report › Purchase Register / Purchase Bills, and the ledger's allocation table.
- Stock status of the open bill is stated in the top pill, the bottom bar, the scan cue and notices; next-step guidance is repeated in three boxes.
- Overdue payables: Today row, Today button, ledger tiles/alerts, register filter, header notification bell.

**Naming drift**

- **Supplier / Distributor**: tasks "Suppliers", "Supplier credits & vouchers"; columns and filters "Distributor"; "Distributor Bill", "Distributor Analytics", "Find distributor … Add distributors under Suppliers".
- **Bill / Invoice / Purchase**: "Purchase bills", `New purchase`, "Scan or enter bill", `New invoice`, "Invoice No.", "Finish this purchase", "Purchase invoices to review", "Purchase Ledger", ledger column "Invoices".
- **Task name ≠ page title**: `Payments & dues` → "Purchase Ledger"; `Purchase costs` → "Distributor Analytics"; `Credits & vouchers` → "Supplier credits & vouchers"; `Import CSV` → "Import purchase CSV"; `Gmail intake` → "Invoice attachments from Gmail"; register tab is `Purchase` under a task called `Purchase bills`.
- **Posting**: "Add stock", "Post bill", "Stock added", "Invoice posted", "Posted", "Not posted", "commit" / "Committed Items", "Save & Process", "Mark Reviewed"; bill status "Reviewed" (register) = "Ready to add stock" (bill).
- **Set-off**: "Set off", "Set off against bills", "allocated", "Reverse allocation", "Adjusted", "Fully used", "applied".
- **Paying**: `Mark paid`, "Pay …", "Settle bill …", `Record payment`, `Record Payment`, "Bulk Payment Allocation".
- **Returns**: "Returns" tab, "Purchase returns" (table name), "Supplier returns" (document), "Return challan", "Return to supplier", "Credit note awaited".
- **Catalogue**: "saved product", "catalogue", "drug master", "inventory", "item", "product list".
- **Stale wording**: `PurchaseSupplierReview` still tells users to "choose Save & Process"; `docs/product/inventory-workflow-operator-guide.md` describes "Purchase register", **Save & Process** / **Review & Add stock**, **Allocate to bill**, **Reload saved invoice** and "Stock > Supplier returns" — none of which match the current labels (`Purchase bills`, `Confirm reviewed values & add stock`, `Set off against bills`, `Compare with saved version`, Purchase bills › Returns).
