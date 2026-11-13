# Topic 7: Purchases and reorder

Scope: Inventory workspace (`/dashboard/inventory`), areas "Purchases" and "Reorder". Source read: `FE/components/inventory/{InventoryWorkspace,WorkflowDocumentEditor,ReplenishmentCenter,SupplierCreditPanel,AlternateInvoiceIntake,workspace-model,workflow-document-state}.ts(x)`, `FE/components/inventory/purchase/*`, `FE/components/pharmacy/{PurchaseInvoiceWorkbench,PurchaseSupplierReview,PurchaseLedger,...}.tsx`.

Conventions used in every story: "Inventory" means the sidebar link `/dashboard/inventory`. Area buttons are Today, Purchases, Stock, Sales, Reorder. Under Purchases the first three task buttons are "Purchase bills", "Scan or enter bill", "Import CSV"; the rest ("Suppliers", "Terms of Trade", "Payments & dues", "Credits & vouchers", "Inward challans", "Gate passes", "Purchase costs") sit in a select labelled "More inventory tasks" (phone: select labelled "Inventory task"). Under Reorder the first three are "Shortbook", "Purchase orders", "Target proposals"; "Manual targets & exclusions", "Automation settings", "Monitor" are in "More inventory tasks". Clicking the Purchases area button opens "Purchase bills" (first task). Roles that can do all of this: PHARMACIST, OWNER, ADMIN, DOCTOR (RECEPTION sees the area but supplier payments need ledger permission; ACCOUNTANT has no Inventory entry). Dead code not used: `PharmacyInventoryControl`, `ShelfIntelligence`, `StockPredictionDashboard`.

---

## PURCHASES-REORDER-01: Scan a supplier bill photo, fix the flagged values, add stock

**Type**: medium
**Topic**: Purchases and reorder
**Persona**: Meena Iyer, pharmacist at a Hyderabad dermatology clinic; a courier has just dropped a 3-item bill from Sri Venkateswara Pharma Distributors (invoice SVP/2411/0873, GSTIN 36AAKCS4821M1ZP).
**Goal**: Get the three received products into stock with the correct batch and expiry.
**Preconditions**: Logged in as PHARMACIST. The distributor is already a saved supplier. A phone photo of the bill (JPG) is on the computer. OCR returns two flags: line 2 expiry month unclear, line 3 batch unclear. All three products already exist in the drug master.
**Ideal path**: 5. Choose file, fix the two flagged fields, one final "add stock" confirmation that also accepts the product matches; the app already knows today's date and the saved supplier.
**Alternate paths**: (a) Today screen button "Scan or enter bill" vs Purchases area task "Scan or enter bill" vs Purchase bills "New purchase" button vs the empty-state button "Scan or enter a bill" / "New purchase". (b) "Import CSV" and "Gmail intake" tasks (`AlternateInvoiceIntake`) produce the same draft in the same workbench. (c) Inside the scan panel, disclosure "Automatic import" with button "Import & Add Stock" (only if the user has automate access) skips review when all automatic checks pass. (d) "Type instead" link types the bill without a file (see story 04). (e) Inward challan > "Create linked purchase bill" opens the same workbench. (f) "Save & Process" under "More options" saves and posts automatically.

### Steps
1. Click sidebar "Inventory" → Inventory page opens on Today with cards under "What needs attention".
2. Click the "Scan or enter bill" button on Today → workbench opens (area Purchases, task "Scan or enter bill") with the "Scan a bill" panel expanded and "Saved uploads" if any exist.
3. Click the "Upload invoice PDF or image" file input (required field) → OS file picker opens; accepts PDF or images, "Up to 10 files · One invoice, in page order".
4. Pick `svp_2411_0873.jpg` in the picker (selection) → file name shows; "Received on" is already today's date (default: today, required for the Scan button, and the Scan button stays disabled without it).
5. Click "Scan bill" → button shows "Reading bill…"; the form fills: card "Distributor Bill" with Distributor, GSTIN, DL No., Invoice No., Invoice Date, Goods Received, Bill Type; "Products on this bill" with three "Product line" cards; "Check before adding stock" panel says "2 checks to finish"; "Original file saved" appears. No stock has changed ("Scan only · stock stays unchanged").
6. Click "Next check" in the sticky "Invoice checks" bar → focus jumps to line 2 field "Exp. Month" (required field, flagged amber).
7. Retype "Exp. Month" as 08 (required field; OCR misread) → the amber check turns green; bar now says "1 check to review".
8. Click "Next check" → focus jumps to line 3 field "Batch".
9. Type "DX2417B" into "Batch" (required in practice: the line header shows "Batch needed" until filled) → check clears.
10. Click "Back to review" (the same button relabelled when no checks remain) → returns to the top of the review; status cue reads "Ready for your final check".
11. Click "Refresh Matches" in card "Product matching and details" (the `<details>` "Product matching and catalogue details" is auto-open until the catalogue is ready) → each line shows "Possible match · confirm" or "Not in inventory".
12. Click "Confirm Match" on line 1 → badge turns success and the saved product's manufacturer and pack fill in.
13. Click "Confirm Match" on line 2.
14. Click "Confirm Match" on line 3.
15. Read the Supplier section: "Matching saved supplier found. Continue with invoice review." → no action needed (app already knows this supplier from name plus GSTIN; the fields Distributor and GSTIN are shown twice, once in "Supplier" and once in "Distributor Bill").
16. Click "Confirm reviewed values & add stock" (sticky "Invoice actions" bar; there is no window.confirm; the button itself is the guard and its own text says it confirms every current value together) → saves the draft, marks reviewed, then commits stock. Status reads "Stock added" with a stock reference; the bill now appears in Purchase bills as unpaid.

### Variations
- User lacks stock-commit permission: the button reads "Confirm reviewed values & mark reviewed" and a notice says "Review saved. Stock not added. An authorized colleague can add stock from this reviewed invoice."; a colleague later opens the bill and clicks "Add stock".
- Bill was already received on an inward challan: the button reads "Confirm & post bill" and stock label reads "Stock received earlier · 0 added again".
- Multi-page bill: select up to 10 files in step 3 in page order.
- Product not in the drug master: card shows "Not in inventory"; the "Invoice product kind" choice (Medicine, Cosmetic / skin care, Other consumable) and "This is a different product: create..." path appear; without product-edit permission it says staff with that permission are needed.

### Edge Cases
- Duplicate bill (same distributor and invoice number): recovery panel "Finish this purchase" with "Open existing invoice".
- Saved draft changed by someone else: alert "Saved invoice changed" with "Compare with saved version".
- Supplier GSTIN differs from the saved supplier: "Supplier GSTIN differs" with "Correct saved GSTIN" (needs supplier-update permission, a reason and a verified checkbox).
- Scan fails: original stays under "Saved uploads (n)" with "Use for this draft" and "Refresh saved uploads".
- Abandon the upload: the button "Reject this upload" (only before an invoice is saved) uses `window.confirm` "Reject this upload without adding stock? Its archived original will be retained." The guarded action is discarding the scan.
- Same information on several surfaces: "Received on" (scan panel) and "Goods Received" (Distributor Bill) hold the same date; Distributor name and GSTIN appear in "Supplier" and in "Distributor Bill"; stock state appears in the checklist cue, the sticky bar text ("Not saved · stock not added") and the register's Payment column ("Not posted"); pending review count appears on Today ("Purchase invoices to review") and in "Saved uploads".

---

## PURCHASES-REORDER-02: Mark a supplier bill as paid

**Type**: short
**Topic**: Purchases and reorder
**Persona**: Suresh Reddy, owner, paying the same distributor by UPI on a Friday.
**Goal**: Record a full payment against one posted purchase bill.
**Preconditions**: A posted bill "SVP/2411/0873" for Rs 4,820 with Payment state Due. User has supplier-payment rights (OWNER, ADMIN, ACCOUNTANT-style ledger writer or pharmacist with ledger capability).
**Ideal path**: 3. Open Purchase bills, click "Mark paid", confirm with remembered mode and today's date; the amount is already known.
**Alternate paths**: (a) Inventory > Purchases > "Payments & dues" (`PurchaseLedger`, title "Purchase Ledger"): card "Bulk Payment Allocation" with Distributor, Payment Date, Mode, Amount, Reference No, Notes, per-invoice "Allocate", button "Record Payment". (b) The register footer link "Outstanding in these N bills ..." opens Payments & dues. (c) Menu "More" > "Payments & dues". (d) Settle by credit instead: "Set off ₹x credit" inside this dialog or "Set off" on the distributor strip. (e) Bill detail page (opened from the Bill No link) via the workbench.

### Steps
1. Click sidebar "Inventory" → Inventory opens on Today.
2. Click area button "Purchases" → "Purchase bills" register loads, tab "Purchase" active, columns Sr No, Bill No, Entry Date, Bill Date, Entry By, Distributor, Bill Amount, Payment.
3. (optional) Choose "Due" in the "Payment status" filter → list narrows to due bills.
4. Click "Mark paid" in the Payment cell of the SVP row → dialog "Pay ₹4,820 to Sri Venkateswara Pharma Distributors" ("Settle bill SVP/2411/0873 · ₹4,820" if the distributor holds credit). Amount is fixed to the bill payable; there is no amount field.
5. (optional) Change the "Mode" select from its default (default: the last mode used, stored in the browser, else "NEFT / RTGS"; choices Cash, Cheque, NEFT / RTGS, UPI, Card) to "UPI".
6. (optional) Date: leave the pre-filled dd/mm/yyyy (default: today).
7. (optional) Type the "Cheque / UTR no." (max 80 characters).
8. Click "Record payment ₹4,820" → dialog closes; toast "Payment recorded" with "Undo"; the Payment cell shows Paid and an "Undo" button for 30 seconds. The dialog is the only confirmation; undo is the safety net.

### Variations
- Part payment: not possible here (amount is fixed); use Payments & dues, enter Amount 2000 and allocate it.
- Credit held by the distributor covers the bill: the dialog shows "₹x credit from ... covers this bill" and button "Set off ₹4,820 credit" as the primary action.
- Bill not yet posted: Payment shows "Not posted" and there is no "Mark paid".

### Edge Cases
- Invalid date: inline error under Date, focus returns to the field.
- Someone else paid the bill meanwhile: toast with the stale message and list reload.
- Mode and Date: Mode is remembered per browser; Date defaults to today but must be re-checked for back-dated payments.
- Same information on several surfaces: outstanding amount appears in the row Payment badge, the register footer "Outstanding in ...", the distributor position strip and Payments & dues "Distributor Summary".

---

## PURCHASES-REORDER-03: Find a distributor's bills and see what is owed

**Type**: short
**Topic**: Purchases and reorder
**Persona**: Dr. Anita Rao, owner, before a call to the distributor about a disputed bill.
**Goal**: See all bills from one distributor and the total outstanding and credit held.
**Preconditions**: At least three bills from Sri Venkateswara Pharma Distributors exist this financial year.
**Ideal path**: 3. Open Purchase bills, pick the distributor once, read the position strip.
**Alternate paths**: (a) Search box with field select "Distributor" instead of the filter. (b) "Suppliers" task > row button "Bills" (`onBills`) opens the register already filtered by GSTIN. (c) "Suppliers" row button for the account opens "Payments & dues" for that GSTIN. (d) Purchases > "Purchase costs" (`DistributorAnalytics`). (e) "Credits & vouchers" (`SupplierCreditPanel`) for credit only.

### Steps
1. Click sidebar "Inventory" → Today.
2. Click "Purchases" → Purchase bills register.
3. Click "More filters" → extra filters appear: Distributor, Bill status, Source, Entry by.
4. Choose "Sri Venkateswara Pharma Distributors" in "Distributor" (required for this goal; list is built from bills already entered) → register filters; a strip shows the distributor position (outstanding, credit held) and, if credit is settable, a set-off button.
5. Read the footer: "Bills ₹x · Outstanding in these N bills ₹y" → the outstanding text is a link to "Payments & dues".

### Variations
- Search by bill number: choose "Bill No" (default search field) in the search field select and type "0873".
- Date range: change the date filter (default: the register's default period) to include last year's bills.

### Edge Cases
- Nothing found: EmptyState "No purchase bills match your search" with button "Clear filters".
- Role without purchase read: "Scan or enter a bill" denial card.
- Same information on several surfaces: distributor outstanding shows in the strip, footer, Payments & dues summary, Suppliers task and Purchase costs.

---

## PURCHASES-REORDER-04: Type a bill by hand and add stock for a new product

**Type**: medium
**Topic**: Purchases and reorder
**Persona**: Farhan Sheikh, pharmacist, receiving a hand-written cash bill for a new cosmetic (Sebamed Clear Face Gel 50 g) from Hyderabad Derma Supplies, with no scannable copy.
**Goal**: Enter the bill manually, create the missing product in the catalogue, and add stock.
**Preconditions**: PHARMACIST with create, review and commit rights. The distributor exists in Suppliers; the product does not.
**Ideal path**: 9. Open the form, type invoice no., pick distributor, enter one product with batch/expiry/qty/rate/MRP/GST (five typed fields), confirm. Everything else defaults.
**Alternate paths**: Scan a photo instead (story 01); "Import CSV"; "Gmail intake"; add the product first via Stock > "Stock list" "Add Inventory Item"; Pharmacy "Drugs" page add-drug; stock via "Manual opening stock" (no supplier payable) or an inward challan first.

### Steps
1. Click sidebar "Inventory" → Today.
2. Click "Scan or enter bill" button → workbench; scan panel open.
3. Click link "Type instead" → manual form opens, focus on "Distributor".
4. Type "Hyderabad Derma Supplies" in "Distributor" (required field).
5. Type "36AABCH7312K1ZQ" in "GSTIN" (required field, validated as a 15-character GSTIN).
6. Click the "Saved supplier" select and choose "Hyderabad Derma Supplies — 36AABCH7312K1ZQ" (optional but removes the "Supplier" warning; the app already knows this supplier, yet name and GSTIN are typed anyway). If the supplier is new, tick "I checked the supplier..." and click "Save verified supplier" instead (2 steps).
7. Type "HDS-5521" in "Invoice No." (required field).
8. "Invoice Date" (required field, default: today) and "Goods Received" (default: today; must not be before the invoice date) are left as they are; "Bill Type" stays "Cash" (default: Cash; the select offers Cash and Credit; choosing Credit reveals "Due Date").
9. Type "Sebamed Clear Face Gel" in line 1 "Product" (required field).
10. Type "50 g" in "Pack Size".
11. "Stock unit" is pre-filled "Strip" (default: Strip); retype it as "Tube" (required for correct stock counting; wrong default for a gel).
12. Type "SB25107" in "Batch".
13. "Exp. Month" is pre-filled 12 (default: 12); retype "03".
14. "Exp. Year" is pre-filled with next year (default); retype "2028".
15. "Paid Qty" is pre-filled 1 (default: 1); retype "10".
16. "Free Qty" default 0, leave.
17. Type "412.00" in "Rate" (defaults to 0; required for a correct payable).
18. Type "595.00" in "MRP" (defaults to 0).
19. Type "9" in "CGST %" and "9" in "SGST %" (two typed fields; defaults 0; the form rejects combining IGST with CGST/SGST).
20. Check "Check bill total" card against the paper bill total (read only; trade, special and cash discount, TCS, rounding sit inside the disclosure "Reported discounts, TCS & rounding").
21. Click "Refresh Matches" → line shows "Not in inventory".
22. Choose "Medicine", "Cosmetic / skin care" or "Other consumable" in "Invoice product kind" → pick "Cosmetic / skin care".
23. Expand the disclosure "This is a different product: create..." (a summary, not a button; shown for matched or unmatched lines) and confirm the pre-filled Product, Manufacturer, Pack, MRP, Rate, Batch → saved product created in the drug master.
24. Click "Confirm reviewed values & add stock" → draft saved, reviewed, stock committed; label "Stock added".

### Variations
- "Save draft" in the sticky bar stores an incomplete bill ("Not saved · stock not added" becomes "Stock not added") for later completion from "Saved uploads" or the register.
- Second product: click "Add Line" (one more line card, "Remove line n" available once there are two).
- "Apply to N selected" shared terms editor sets discount/GST on many lines at once, with "Undo shared terms".

### Edge Cases
- Missing required header values: the list "Distributor name is required", "Invoice number is required" etc. is shown; the action button stays disabled with the blocker text above it ("Review checks" link).
- GSTIN typo: "Distributor GSTIN must be a valid 15-character GSTIN".
- Goods received before invoice date: error "Goods received date cannot be before invoice date".
- Both IGST and CGST/SGST filled: "use either IGST or CGST and SGST".
- Same information several surfaces: Product name, pack, MRP and rate appear in the line card, in "Product matching and details", and again in "Receipt quantity and margin summary".

---

## PURCHASES-REORDER-05: Return expired stock to a supplier

**Type**: medium
**Topic**: Purchases and reorder
**Persona**: Meena Iyer, pharmacist, returning 12 expired tubes of an acne gel to Sri Venkateswara Pharma Distributors.
**Goal**: Create a supplier return challan that removes the stock and awaits a credit note.
**Preconditions**: The batch exists in stock with at least 12 tubes. The user has write rights on Supplier returns.
**Ideal path**: 6. Open the return form, choose supplier, pick the batch, set quantity, confirm. The app already knows the date and reference.
**Alternate paths**: (a) Purchase bills tab "Returns" > "New return". (b) Stock area link "Supplier returns are now in Purchase bills › Returns" (goes to the same tab). (c) Empty-state button "New return". (d) Stock optimization's "onReturns" shortcut. (e) Credit notes task from "Credits & vouchers" > "New" (`CREDIT_NOTE` document) if the note arrives first.

### Steps
1. Click sidebar "Inventory" → Today.
2. Click "Purchases" → Purchase bills.
3. Click tab "Returns" → register "Purchase returns" with filters Status, Distributor, Type, Reason, Entry by.
4. Click "New return" → document editor "Supplier returns" (help: "Save a draft and send the goods back on a challan...").
5. "Reference" is pre-filled SUPPLIER-RETURN-<today> (default); leave it. "Date" is pre-filled today (default; a dd/mm/yyyy day field).
6. Choose the distributor in "Supplier" ("Select supplier"; required field).
7. "Stock source" stays "Available stock (no hold)" (default); leave.
8. Type "acne" in "Add a batch" (needs at least 2 characters) → list of batches with expiry, available units and cost.
9. Click the matching batch row (e.g. "Adapalene Gel 0.1% · AG2408 · expires 03/2026") → a line is added.
10. Change line field "quantity 1" from its default (1) to 12 (required).
11. Type "Expired March 2026" in "Note (optional)".
12. Click "Create return challan" (primary action; no separate confirm dialog, the status label "Challan • stock returned" tells the outcome) → stock leaves inventory, status CHALLAN, and a button "Record credit note" appears for users with credit-write rights.

### Variations
- "Save draft" first, then finish later from the Returns list.
- Return from a blocked batch: choose it in "Stock source" (holds list).
- Cancel: "Cancel document" while DRAFT or CHALLAN; "Correct by reversal" for approvers once posted.

### Edge Cases
- More than available: server rejects with a recovery panel ("Recovery steps").
- Returned batch should have been quarantined first: "Open blocking source hold".
- Same information several surfaces: the return appears in the Returns tab, in Stock ledger, and as "Credit notes awaited" on Today; the "Record credit note" action exists in the document, in the Returns row and in the Credits & vouchers task.

---

## PURCHASES-REORDER-06: Record the credit note when it arrives

**Type**: short
**Topic**: Purchases and reorder
**Persona**: Meena Iyer, three days after story 05; the distributor's credit note CN/24/1187 dated 10/11/2026 for Rs 3,840 arrives by email.
**Goal**: Record the credit note against the return and set it off against an open bill.
**Preconditions**: The return challan exists with state CHALLAN. User can write credits.
**Ideal path**: 5. Open Returns, click "Record credit note", type number and date, accept the return value as amount, record. Set-off is offered in the same toast.
**Alternate paths**: (a) From the return document: button "Record credit note". (b) Credits & vouchers task, button for new credit note document ("Post supplier credit" primary, with "Add credit line"). (c) Today card "Credit notes awaited". (d) Set off later from the row button "Set off", the distributor strip, or "Set off ₹x instead" in Mark paid.

### Steps
1. Click sidebar "Inventory" → Today.
2. Click "Purchases" → Purchase bills.
3. Click tab "Returns" → the return shows "No credit note yet" and a "Record credit note" button.
4. Click "Record credit note" on the row → dialog "Record credit note from Sri Venkateswara Pharma Distributors" ("For return SUPPLIER-RETURN-2026-11-10").
5. Type "CN/24/1187" in "Credit note no." (required field, auto-uppercased).
6. Type "10/11/2026" in "Credit note date" (required field, dd/mm/yyyy; no default; it cannot be before the return date, which the app already knows).
7. Click "Same as return value" (optional shortcut; "Amount (₹)" is empty by default and required) → amount fills with the return value.
8. Click "Record credit note" → if the typed amount differs from the return value the dialog shows a warning and the button changes to "Record ₹3,500 anyway" (a confirmation guarding a mismatch with the goods value; one more click). Otherwise the dialog closes with toast "Credit note CN/24/1187 recorded: ₹3,840.00 from ..." and an action "Set off ₹3,840 now".
9. Click "Set off ₹3,840.00 now" in the toast → dialog "Set off credit from Sri Venkateswara Pharma Distributors" with open bills listed and "Set off ₹" amounts pre-filled from the oldest due date (default).
10. Click "Set off ₹3,840.00" → toast "Set off ₹3,840 against bill SVP/2411/0873" with "Undo" (30 seconds, shown in the Status column).

### Variations
- Wrong number entered: row button "Correct credit note CN/24/1187" opens "Correct credit note ..." with an extra required "Why correct it?" field; amount is locked once part has been set off.
- Duplicate number: field error on "Credit note no.".

### Edge Cases
- Another user changed the return: toast "This return changed" with the entry you typed echoed so it can be re-entered.
- Same information several surfaces: the credit appears in the Returns row Status, Credits & vouchers, the distributor strip (credit held) and the "Mark paid" dialog.

---

## PURCHASES-REORDER-07: Shortbook request to an approved purchase order

**Type**: medium
**Topic**: Purchases and reorder
**Persona**: Meena Iyer (pharmacist) raises the order; Dr. Anita Rao (owner) approves.
**Goal**: Turn low-stock items into a purchase order to a chosen supplier.
**Preconditions**: Active reorder targets exist so some items are below minimum. At least one active saved supplier.
**Ideal path**: 5. Open Shortbook, pick a supplier on the request, create the order, submit for approval; the approver then approves (one more step by another person).
**Alternate paths**: (a) Reorder > "Purchase orders" > "Add purchase order" (build the order by hand). (b) Automation: "Automation settings" with "Automatic PO drafts" and "Run saved settings" creates PO drafts without anyone touching the Shortbook. (c) Today card "Orders awaiting receipt" for follow-up. (d) "Add manual request" in Shortbook for an item not below target.

### Steps
1. Click sidebar "Inventory" → Today.
2. Click area button "Reorder" → Shortbook list (first task), showing each request as "Min x / available y · Supplier selection required".
3. Click "Sync shortages" → toast "Shortbook refreshed from active targets. Existing requests are preserved."
4. Click a request row (e.g. "Isotretinoin 20 mg: 3 strip") → document opens with two panels: the editor ("Reference", "Date", "Supplier", "Reason / notes", lines with Quantity) and "Supplier recommendation".
5. Choose a supplier in the panel select "Supplier" ("Select a saved supplier"; required before ordering).
6. Click "Save supplier" → "Supplier choice saved for this request and future shortages." (The editor also has its own "Supplier" select in the header grid; two controls for one fact.)
7. (optional) Change the line "quantity" from the suggested shortage.
8. Click "Create purchase order" (primary) → opens the new order (reference PURCHASE-ORDER-...), status draft.
9. Click "Submit for approval" → status "Awaiting manager approval".
10. Owner opens Reorder > "Purchase orders" and clicks the order row, then clicks "Approve document" → "Approved • ready for next step".
11. Click "Send purchase order" → records a delivery attempt; the page says "Supplier mail transport: setup required. Sending records the setup failure; export is available for manual delivery."
12. Click the icon button "Export order & remaining quantities" → CSV downloads for sharing with the distributor by WhatsApp or email.

### Variations
- Reject: "Reject proposal" for the approver.
- Cancel: "Cancel document" or details "Cancel remaining quantities".
- Same person is approver (owner): steps 9 and 10 happen in one session.

### Edge Cases
- No supplier chosen: the request cannot become an order; the row says "Supplier selection required".
- Item has no supplier history: the recommendation list is empty ("live supplier stock is not connected").
- Same information several surfaces: supplier, quantity and status appear in the Shortbook row, document editor, order delivery table and "Monitor".

---

## PURCHASES-REORDER-08: Weekly reorder cycle, receive the goods, post the bill and pay

**Type**: long
**Topic**: Purchases and reorder
**Persona**: Dr. Anita Rao (owner) and Meena Iyer (pharmacist) over one week.
**Goal**: From demand-based targets to goods received, billed and paid, with no stock counted twice.
**Preconditions**: Sales history of at least a few weeks; active suppliers; owner set as "Automation owner"; Meena has inventory write and ledger rights.
**Ideal path**: 18. Targets accepted in one screen (4), order raised from the Shortbook (3), approved (1), received as a challan (3), bill linked and posted (4), paid (3). Most data (quantities, supplier, lines) is already known to the app at each hand-off.
**Alternate paths**: Targets: "Stock optimization" (Stock area), "Manual targets & exclusions", "Automation settings" run, legacy `/dashboard/stock-predictions`. Receipt: scan the bill directly without a challan (story 01); "Purchase orders" row "Receive remaining stock". Payment: "Payments & dues" bulk allocation.

### Steps
1. Click sidebar "Inventory" → Today.
2. Click area button "Reorder" → Shortbook list.
3. Click "Target proposals" → list of proposals.
4. Click "Generate target proposal" → proposal opens: evidence dates, assumptions, each line "Saved min / max → Proposed min / max" with "Demand records (n)" disclosure.
5. Click "Select unreviewed" → all undecided lines are ticked (optional: untick any line, one click each).
6. Leave the checkbox "Sync accepted targets to Shortbook" ticked (default: ticked).
7. Click "Accept selected" → "Selected targets accepted. Unselected lines remain available for review." Shortbook gets new requests. (Alternative "Reject selected" keeps the saved targets.)
8. Click "Shortbook" task → list now includes requests.
9. Click a request row → request opens.
10. Choose the supplier in "Supplier" ("Select a saved supplier"; required).
11. Click "Save supplier".
12. Click "Create purchase order" → order draft opens.
13. Click "Submit for approval" → "Awaiting manager approval".
14. (Owner) Click "Purchase orders" task, open the order, click "Approve document" → approved.
15. (Owner or pharmacist) Click "Send purchase order" → delivery attempt recorded (mail transport not configured), then click "Export order & remaining quantities" to share the CSV.
16. Four days later the goods arrive: click "Reorder" > "Purchase orders" > open the order → "Order delivery & receipts" table shows expected, received and remaining units.
17. Click "Receive remaining stock" → "Inward challans" editor opens, supplier and lines prefilled from the order ("Receipt against PURCHASE-ORDER-..."; quantities default to remaining).
18. (optional) Edit a line "quantity" where fewer units arrived.
19. Click "Receive stock" (primary) → stock is added; status Posted. This is stock received before the bill.
20. Click "Create linked purchase bill" → the "Scan or enter bill" workbench opens linked to the receipt (the app already knows supplier and goods).
21. Click "Upload invoice PDF or image", pick the file (2 steps: click, select) → "Received on" is today (default).
22. Click "Scan bill" → "Reading bill…" and the form fills.
23. Click "Refresh Matches" and "Confirm Match" on each line (n+1 clicks; the lines were already matched on the receipt in most cases, so the matches are usually already confirmed).
24. Click "Confirm & post bill" (label because a receipt is linked) → bill posted, stock label "Stock received earlier · 0 added again". A `window.confirm` appears only if you later choose to remove the receipt link: "Remove the receipt link only if these goods have not already been added to inventory. Posting this bill will add stock. Continue?" This guards against receiving twice.
25. Click "Purchases" > "Purchase bills" → new bill shows Payment Due.
26. Click "Mark paid" on the bill → dialog "Pay ₹x to ...".
27. Click "Record payment ₹x" (Mode defaults to the remembered one; Date defaults to today; Cheque / UTR no. optional) → "Payment recorded" toast with Undo.

### Variations
- Partial delivery: the order becomes "Part received"; "Receive remaining stock" is offered again for the rest.
- Supplier sends a bill with different rates: the scan flags differences on the linked bill; use "Compare with saved version".
- Credit note from an earlier return exists: step 26 dialog offers "Set off ₹x credit" instead of paying.
- Manual override: "More inventory tasks" > "Manual targets & exclusions" to edit min, max and reorder level for selected items, then "Review selected changes", enter the required "Reason", then "Save reviewed targets" (a second confirmation form guarding bulk changes).

### Edge Cases
- Targets cold start: lines read "Unconfigured: set manual targets first".
- Automation: "Automation settings" shows "Save settings" and "Run saved settings"; with "Automatic PO drafts" on, steps 4 to 12 may already have been done by the system, surfaced under "Saved run outcomes" with "Open generated document".
- Both a challan and a direct bill used for the same goods: the duplicate guard in the workbench ("Finish this purchase", "Open existing invoice") prevents double stock.
- Same information several surfaces: item, supplier, quantity and status repeat across the proposal, Shortbook row, order table, challan, bill and ledger; Monitor shows the same outcomes in charts; PO status also appears on Today ("Orders awaiting receipt").

---

## PURCHASES-REORDER-09: Add a new supplier

**Type**: short
**Topic**: Purchases and reorder
**Persona**: Suresh Reddy, owner, onboarding a new distributor, Charminar Medicals.
**Goal**: Save a supplier with GSTIN so it can be chosen on bills, returns and orders.
**Preconditions**: User has supplier-create permission (button hidden otherwise).
**Ideal path**: 4. Open suppliers, "Add supplier", type name and GSTIN, save. Everything else is optional.
**Alternate paths**: (a) Purchase bills menu "More" > "Suppliers". (b) Inside the bill workbench, "Supplier" section: tick "I checked the supplier..." and "Save verified supplier" (name and GSTIN only). (c) "Terms of Trade" for payment terms per distributor, separately. Two places hold supplier data: this directory form has a free-text "Payment terms" field and Terms of Trade has structured terms.

### Steps
1. Click sidebar "Inventory" → Today.
2. Click "Purchases" → Purchase bills.
3. Click menu "More" then "Suppliers" (or choose "Suppliers" in "More inventory tasks") → "Suppliers" list.
4. Click "Add supplier" → form with Supplier name, GSTIN, Drug licence, Food licence, Contact person, Email, Phone, Address, Payment terms, Notes, checkbox "Active supplier" (default: ticked).
5. Type "Charminar Medicals" in "Supplier name" (required field).
6. Type "36AAFCC9120B1ZM" in "GSTIN" (required field).
7. (optional) Type "Drug licence" "TS/HYD/20B/2145" and "Phone".
8. Click "Save supplier" → form closes, list reloads with the new row and row buttons for bills and account.

### Variations
- Edit: icon button "Edit supplier Charminar Medicals".
- Deactivate: untick "Active supplier"; inactive suppliers disappear from selects in returns, orders and shortbook.

### Edge Cases
- Duplicate GSTIN: the error message is shown in an alert above the list.
- Read-only role: "Ask a ..." message instead of the button.
- Same information several surfaces: supplier name and GSTIN appear in the Suppliers list, in every supplier select ("Name · GSTIN"), the register Distributor column, and the bill workbench "Saved supplier" select.
