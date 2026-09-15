<!-- page: orientation -->
# Inventory workflow
## Operator guide for P S Dermatology
A practical guide to receiving supplier bills, finding batch stock, dispensing, returns, counting and replenishment in the clinic management system.

**Local validation edition - 14 September 2026**

Start from **Dashboard > Inventory**. The five persistent destinations are **Today, Purchases, Stock, Sales and Reorder**. Work from a named record and verify its saved status before moving to the next stage.

## The operating cycle
1. Capture the complete supplier bill and retain every original page.
2. Review supplier identity, products, stock units, batches, expiry and totals.
3. Add stock once, then verify the purchase, affected batches and supplier balance.
4. Dispense from an eligible batch and preserve its sale history.
5. Count, investigate expiry and returns, then replenish through an approved order.

## How to use this guide
The pages below give the operating steps and distinguish physical stock from supplier accounting. Each page carries feature IDs. The final index covers all **42 features**; the companion acceptance baseline retains all **211 criteria** without replacing them with a shorter checklist.

Screenshots are actual captures from the local implementation supplied by the verification run. A screenshot proves what was visible at capture time; it does not prove every adjacent workflow was executed. This guide is not a claim that all acceptance criteria or production rollout checks are complete.

<!-- page: today -->
# Start and finish the day
Features: INV-01, INV-02, INV-40, INV-41
<!-- screenshot: today-queues | Today brings outstanding work into named queues. Open a queue to inspect its matching records. -->

1. Confirm the signed-in branch before reading counts or opening a record.
2. Open **Today**. Check purchase invoices to review, originals awaiting intake, low stock and expiring batches.
3. Follow the queue action into Purchases, Stock or Reorder. Inspect the date and filter scope; a filtered empty result is not proof that the clinic has no such records.
4. At close, check counts awaiting completion, supplier returns in progress, orders awaiting receipt and supplier balances.
5. Return using the workspace's **Back to list** or area navigation. Reopen the selected record to continue work.

**Read the state:** Loading, No matching records and Could not load are different. Use Retry after a failed read. A loading failure is not a zero balance. Saved-but-unposted bills remain outstanding work with **Stock not added**.

Access follows existing permissions and the authenticated branch. A read-only user may inspect allowed records and originals but cannot perform missing write actions. Ask the clinic administrator for the relevant permission when an action is unavailable; another branch's record ID is not a route around that boundary.

<!-- page: effects -->
# Know which action changes a ledger
Features: INV-17, INV-19, INV-22, INV-25, INV-28, INV-29, INV-33, INV-38

| Document or stage | Physical stock / availability | Supplier accounting |
| --- | --- | --- |
| Purchase draft or original upload | No stock added | No posted payable |
| Posted supplier bill | Paid plus free received units added once | Posted bill becomes eligible for settlement |
| Inward challan | Receives physical stock | No supplier bill payable yet |
| Bill linked to posted inward challan | Matching stock is not received twice | Establishes the bill and actual purchase price basis |
| Gate pass | Reference only | No payable |
| Supplier return draft | No stock effect | No credit |
| Supplier return challan | Dispatches eligible units out | No final credit yet |
| Final supplier return | No second deduction after its challan | Creates supplier credit once |
| Supplier credit allocation | No stock movement | Reduces credit availability and bill outstanding |
| Loss or breakage | Removes eligible units | No supplier credit |
| Hold / release | Changes held and available units; on-hand remains | No supplier balance effect |
| PO, quotation or sales draft | No receipt or sale; drafts do not reserve stock | No purchase payable from a PO |
| Posted sale / customer return | Uses the selected batches and disposition | Sale/refund accounting, separate from supplier dues |

**Before submitting:** read the action's consequence, quantity unit and saved status. Keep a physical dispatch, a credit note and a payment as distinct records. Editing a posted history entry is not the correction procedure.

<!-- page: capture -->
# Capture and retain the complete bill
Features: INV-10, INV-23
<!-- screenshot: purchase-intake | Purchase intake retains original files before review and processing. -->

1. Open **Purchases > Scan / enter invoice**. Choose the camera/photo option on mobile or upload the original photo/PDF on desktop.
2. Include every invoice page in order. Keep the supplier, bill number, all rows and footer totals legible; retake a cropped or blurred page.
3. Run extraction and keep the original linked to the draft. Several photos can belong to one invoice.
4. If extraction fails, find the retained original in unfinished intake and choose Retry extraction or enter the bill manually. A retained file alone is not a saved invoice and has not added stock.
5. After saving or posting, use **Retained originals** to open or download the source. Add supporting originals without replacing earlier files.

The system retains original bytes with filename, MIME type, size, hash, uploader, branch and capture time. Review rotation or zoom does not rewrite those bytes. Invalid, empty, corrupt, unsupported or oversized uploads need a corrected file; a timeout instead calls for a status check or retry.

**Separate input routes:** Purchase CSV previews supplier and line fields before bill review. Opening stock import sets initial balances and creates no supplier payable. Gmail attachment intake is optional and must be explicitly configured; it is not the same as camera OCR. Live Gmail/OAuth configuration and fetching are outside the completed local verification.

<!-- page: identities -->
# Verify supplier and product identities
Features: INV-09, INV-13

1. Compare extracted supplier name and GSTIN with the printed bill and saved supplier candidates on the review page. Similar names with different GSTINs are different identities.
2. Select the verified supplier or create/update the permitted supplier details. Preserve the address and licence values actually provided. Do not invent a GSTIN or doctor to make a supplier bill pass.
3. On each unresolved product row, compare the printed name, strength/form where relevant, pack label and classification with the candidate master.
4. Select the one compatible medicine, cosmetic or consumable. If none is correct, create a complete permitted master from evidence, then return to the same invoice row.
5. Confirm the stock unit and pack contents before continuing. Keep different batches as separate receipt rows even when the product name repeats.

**Manufacturer is optional.** A cosmetic or consumable does not need an invented strength, prescription status or manufacturer. Missing manufacturer alone must not prevent creation, review or receipt.

Inactive, cross-branch, ambiguous or incompatible candidates must not be treated as automatic matches. Correct the identity or request the appropriate master-data permission. Saving supplier corrections must preserve the rest of the invoice, its row edits and source links.

Supplier account details retain contact information, GSTIN/licences, active state, bills and dues. Deactivation preserves historical documents.

<!-- page: source-review -->
# Compare every OCR row with its source
Features: INV-11, INV-12
<!-- screenshot: invoice-review | Inspect the captured values beside the retained original. This saved example is already posted; its financial fields are locked. -->

1. Count the printed item rows and pages before accepting the extraction. A twenty-row invoice needs twenty distinct rows, including repeated products on different batches and rows crossing a page boundary.
2. Select a header or row value to reveal its source page and region. Use page selection, zoom or rotation to read the original.
3. Check product, pack/unit, batch, expiry, paid/free quantities, MRP, purchase rate, discounts, scheme, GST and line total.
4. Correct disagreement or unreadable text from evidence. Keep directly printed values separate from derived arithmetic.
5. Recheck the footer against all rows. Missing pages, incomplete extraction or a total mismatch require repair or re-extraction before automatic stock posting.

**Source-location limit:** a highlighted region may be estimated. The interface must identify an approximate location; it is not proof of an exact printed character. A derived or unlocatable value can show **No reliable printed location**. Compare the page directly instead of accepting a box as OCR truth.

Editing a value retains its original captured context. Source access remains useful after posting even when financial fields are locked. On mobile, return from the source to the same field before continuing. Printed document instructions are invoice content, not commands to the application.

<!-- page: twenty-line-review -->
# Check a long, multi-page invoice
Features: INV-11, INV-12, INV-14, INV-41
<!-- screenshot: invoice-twenty-lines | Selecting line 20 opens its retained second source page in the local twenty-line invoice check. -->

1. Compare the number and order of extracted rows with every printed page before processing. Use the source row reference to distinguish repeated products and batches.
2. Review the first row, the last row on page one, the first row on page two and the final row, then inspect every intervening row. Boundary checks do not replace the full row review.
3. Select a later row and verify that the original page changes to its source. A line on page two must not be compared with a similarly named product on page one.
4. Confirm the footer's item count, paid/free quantities, taxes and payable after all row corrections.
5. Resolve the remaining checklist items and use the one primary action. Keep all rows reachable; use source navigation without discarding the current draft.

**Local example:** the captured twenty-line fixture demonstrates selecting its final row and reaching PDF page two. It is synthetic local verification data, not a production supplier purchase. Its successful navigation does not remove the need to compare each real invoice with its original.

If an extraction truncates the last rows, loses a repeated batch or omits a page, retry with the complete original or enter the missing data from evidence. Do not approve a shorter list simply because its remaining rows appear plausible.

<!-- page: purchase-totals -->
# Enter a bill and reconcile its total
Features: INV-14, INV-42

1. Enter supplier, invoice number/date, received date, bill terms, order reference where applicable and due date for a credit bill.
2. For every row, enter product, pack/unit, batch, expiry, paid quantity, free quantity, MRP, purchase rate, discounts, scheme amount and GST.
3. Read the computed taxable amount, tax and payable beside the original reported values. Resolve differences; do not erase the source amounts to hide them.
4. Check the footer's row count and paid/free/received stock units. Pack contents do not automatically multiply a quantity already expressed in the declared stock unit.

## Worked 18% bill arithmetic
The reference bill SB-26-43742 shows 10 bottles of 60 ml, batch WWD0040, expiry 02/28, at a purchase rate of Rs. 983.05.

| Calculation | Amount |
| --- | --- |
| 10 x 983.05 | Rs. 9,830.50 taxable |
| 18% GST | Rs. 1,769.49 |
| Taxable plus GST | Rs. 11,599.99 |
| Rounding +0.01 | Rs. 11,600.00 payable |

Header trade/special/cash/damage/visibility/credit-debit values are **reported summaries already included in line taxable values**. To change payable, correct line discounts or scheme amounts. TCS and rounding apply to the bill total; do not deduct the same discount twice.

Indicative margin uses received paid plus free stock units at per-unit MRP, excluding GST from both sales and purchase cost and excluding TCS/rounding. It is before selling discounts. Missing or zero MRP gives **Unknown**, not a fabricated margin.

<!-- page: save-review -->
# Save, review and add stock once
Features: INV-15, INV-16, INV-17
<!-- screenshot: invoice-stock-added | Persisted Stock added feedback identifies the posted invoice and its receipt outcome. -->

1. Resolve each visible issue using its field link, product/supplier confirmation or evidence-based review control.
2. Verify actual received paid/free units, pack basis, batch and expiry. If the heading says APPROVAL BILLS or terms are uncertain, establish the bill type instead of assuming Cash or Credit.
3. Choose **Save & Process**. This saves current corrections and advances only as the validation permits. A complete high-confidence intake can post automatically.
4. If human review remains necessary, check the original, resolve the fields and confirm the review checklist. The primary action becomes **Review & Add stock** when appropriate.
5. Confirm the final persisted status, receipt reference and affected batches. Stock added is a server-confirmed result, not a guess from a button click.

**Save draft for later** is the secondary path for an unfinished invoice; missing values can remain missing without invented defaults. It changes no stock.

A blocking issue cannot be bypassed by merely clearing its label. Duplicate clicks, retries and concurrent commits must produce one receipt. If the response is lost, use the status lookup before attempting another operation. A failed transaction must leave invoice status, batch balances and movements together in their prior state.

<!-- page: purchase-recovery -->
# Find and resume purchase work
Features: INV-18, INV-01, INV-41
<!-- screenshot: purchase-register | The purchase register separates saved status and intake channel and opens the exact record. -->

1. Open **Purchases > Purchase register**. Search by bill number or supplier, then apply date, status and intake-channel filters.
2. Read the status in words: Draft, OCR review required, Reconciliation failed, Reviewed, Stock added or Cancelled. Reviewed alone does not mean stock has been received.
3. Open the saved record, correct it, and return using **Back to list**. Keep the selected filters and page to continue the same queue.
4. Reopen unfinished originals or server intake drafts when work was interrupted. Use the server draft path when work must survive a browser restart; tab recovery is a convenience for that tab.
5. A duplicate candidate should open the existing bill. Compare its supplier, number and original before retrying intake.

**Saved invoice changed:** your local corrections remain visible, but saving/review/posting is blocked if their original server revision is stale or cannot be verified. **Reload saved invoice** performs a fresh read and replaces those local fields. Record any corrections you need to reapply before choosing reload.

Selecting the same active invoice from the recent list resumes its local edits. A receipt-linked recovery must not be reset to its original receipt defaults. Export the chosen full register result, including its status and totals; the visible page is not the full result set.

<!-- page: linked-documents -->
# Keep receiving documents and history linked
Features: INV-19, INV-20
<!-- screenshot: inward-challan | A posted inward challan records physical receipt before its later linked supplier bill. -->

1. Start from the approved purchase order when there is one. Keep ordered, physically received, previously posted and remaining quantities distinct.
2. Record a gate pass as a delivery reference. It adds neither stock nor supplier dues.
3. If goods arrive before the bill, receive them on an **Inward challan**. Its posted stage adds the physical stock.
4. Open bill intake from that receipt. Match all received lines, batches, quantities, units, expiry and MRP. A later matching bill records the accounting and actual price basis without receiving the same stock again.
5. Open related PO, gate pass or receipt links from purchase history, then return to the bill.

## Actions on a saved purchase
Use **PDF, Excel, Purchase CSV** or **Print QR** for the saved document. Exports include the header, every line, quantities, taxes, rounding and status. Use **Logs** for actor/time and recorded changes. **Retained originals** remains available after posting.

**Edit draft** applies to editable drafts. **Correct posted purchase** leads to a linked supplier return and corrected replacement bill; a price-only supplier credit uses a linked credit note. Do not rewrite the posted bill in place.

**Set location & discount** updates linked batch location and a suggestion for future sale discount with a reason. It does not revise this bill's totals, historical discounts, prior sales or supplier balance. Adding a supporting original is likewise separate from stock and money.

<!-- page: receipt-bill-example -->
# Verify the bill did not receive twice
Features: INV-17, INV-19, INV-20
<!-- screenshot: linked-receipt-bill | The posted bill retains the earlier receipt and confirms that no matching stock was added again. -->

1. Open the bill that was created from its posted inward challan.
2. Compare the linked receipt's paid/free quantities and batch with the bill's received quantities.
3. Read the persisted stock feedback. In this local example, **three units were received earlier and zero units were added again** when the bill posted.
4. Follow the inward receipt and order links to inspect their original stock effects and remaining quantities.
5. Check the bill's actual purchase prices and supplier accounting separately from the physical receipt.

The receipt and bill represent two stages of one delivery. A successful bill post must not add the same stock twice. If the displayed receipt, unit or batch differs from the goods being billed, stop and resolve the source link before further processing.

<!-- page: supplier-account -->
# Settle supplier bills and apply credits
Features: INV-21, INV-22
<!-- screenshot: purchase-credits | Eligible supplier credits can be inspected from the posted bill, with its supplier and bill already in context. -->

1. Open **Purchases > Credits & vouchers**, the supplier account, or a posted purchase's **Eligible supplier credits**. Confirm the supplier GSTIN and bill number.
2. Read posted bill value, due date, payments, credits and outstanding. Drafts and OCR exceptions are unposted work, not posted dues.
3. For a payment, choose date, mode, payer and reference, then allocate the payment across eligible bills for the same supplier and branch.
4. For a credit, inspect original value, prior allocations, available amount and linked source. Choose **Allocate to bill** and check the preselected bill.
5. Enter an amount no greater than both credit availability and bill outstanding. Submit once and confirm the refreshed bill balance and allocation history.

A final supplier return creates its credit once. Applying that credit settles the bill without returning stock a second time. A standalone price adjustment credit also has no physical stock effect.

Reverse an incorrect finalized allocation with a reason; preserve its original history rather than deleting it. Concurrent payments and credits must not over-allocate a bill. Read permission exposes the panel; the separate ledger write permission is required to allocate or reverse.

Reconcile supplier statements using the same date and posted-balance scope. Payment recording here is an accounting entry; scanning a supplier payment QR is not authorization to make an external payment.

<!-- page: supplier-payments -->
# Record and allocate a supplier payment
Features: INV-21, INV-22
<!-- screenshot: supplier-payment | Supplier payment details retain the accounting entry and its invoice allocations. -->

1. Open **Purchases > Payments & dues**, select the supplier and check posted bills, previous payments, applied credits and outstanding balance.
2. Choose the payment date, supported mode, payer and reference. Use the actual payment evidence and keep it available for reconciliation.
3. Allocate the amount to eligible bills for the same supplier and branch. Check each bill's remaining balance after credits.
4. Confirm that invoice allocations sum to the payment amount and that none exceeds the current outstanding balance.
5. Save once, then verify the payment reference, allocation rows and refreshed outstanding. If the response is uncertain, inspect the saved account before retrying.

**Effect:** this records supplier settlement; it does not change physical stock. A prior supplier return or credit allocation is a separate accounting record and must not be entered again as a second payment.

The local screenshot is a synthetic accounting example. The application record is not proof of bank delivery, and this verification did not send an external payment. Use the clinic's authorized banking process and supporting reference for actual settlement.

If two users are settling the same bill, a conflicting or excessive allocation should fail instead of making the outstanding balance negative. Reload the account, reconcile the current allocations, then enter only the still-valid amount.

<!-- page: stock-search -->
# Find stock and repair missing details
Features: INV-03, INV-05, INV-39
<!-- screenshot: stock-register | Stock search, filters and item links keep the selected stock scope visible. -->

1. Open **Stock**. Search by product, SKU or barcode; a scanner and the same typed code should resolve the same authorized identity.
2. Narrow by expiry, low/high/positive/zero/negative balance, category, dosage, schedule, GST, manufacturer, location, HSN, price or margin as available.
3. Apply filters, inspect active criteria and sort/page through results. Read scope labels before interpreting counts or valuations.
4. Open missing-location, min/max, category or HSN queues to repair actual data. Review the item and save a meaningful rack/shelf/bin or classification, then refresh the queue.
5. Open an item to inspect its batch history. Clear filters to broaden the search; an unknown code needs an explicit product lookup or permitted barcode assignment.

Data-quality counts come from the current branch and full matching dataset. Historical reference counts such as 254 missing locations are examples, not current clinic totals. Distinct mapping queues may overlap; do not add their counts without a shared definition.

Print an item/batch or purchase QR when needed. Batch-specific labels identify batch, unit and expiry. Item-level codes still need an eligible batch at dispensing. Lookup alone changes neither stock nor supplier balance; duplicate, inactive or foreign codes must not silently select a product.

<!-- page: stock-detail -->
# Read the master and the batch separately
Features: INV-04, INV-06
<!-- screenshot: item-history | Item detail connects batch balances and source documents to the movement history. -->

1. In item detail, inspect **Batches**, **Purchases**, **Purchase returns**, **Sales**, **Sales returns**, **Ledger**, **Blocked stock** and **Additional information** as relevant.
2. Confirm the master identity, category, pack label and verified conversion. Manufacturer is optional; strength and dosage apply only when relevant.
3. Read each batch's number, expiry, stock unit, balance, location, MRP, purchase price and landing price. Batch-specific prices are not automatically the standard master price.
4. Toggle zero-stock batches when you need older history. Hiding a batch does not remove it or delete its movements.
5. Return to Stock using the in-app action to retain context.

**Unit example:** for a verified ten-tablet strip, 140 tablets equals 14 strips. If a purchase instead declares its quantity as strips, do not multiply it again merely because the pack label contains ten tablets. Unknown conversion needs review before posting.

The reference GSH example showed conflicting master and batch prices. Do not infer a pack conversion by dividing one price by the other. Read the original bill, verified conversion and price basis. Editing master metadata affects future use and must not rewrite historical invoices or posted batch movements.

<!-- page: valuation-ledger -->
# Reconcile quantity and value
Features: INV-07, INV-27

1. Select the branch, date/filter scope and valuation basis. Keep current stock separate from expired stock.
2. Read whether the displayed amount is MRP, purchase/PTR, landing cost or base price and whether tax is included.
3. Multiply quantity by a price expressed in the same unit. Fourteen packs at Rs. 5,112.36 per pack equals Rs. 71,573.04, not 140 times a pack price. Ten stock units costing Rs. 25 each have a value of Rs. 250.
4. Open the item ledger and follow each signed movement to its purchase, sale, return, count or correction.
5. Compare the chronological running close with the stored batch balance. Investigate differences using source records and reasons before changing stock.

## Quantity reconciliation
Opening + posted receipts + accepted saleable returns - sales - supplier dispatches/losses + signed adjustments = physical stock. Held units are then distinguished from available units under the hold policy.

The reference movement example closes at **2,570 - 2,390 - 10 - 30 = 140**. Both negative adjustments are stock out, not stock in. Large variances need a recorded explanation.

Landing cost allocates the saved taxable purchase cost over paid plus free received stock units; recoverable GST is excluded from this purchase basis. A missing or incompatible price basis stays unknown. Do not present unlike master/pack/unit costs as a comparable average or silently convert an unresolved legacy value.

<!-- page: opening -->
# Establish opening stock safely
Features: INV-08
<!-- screenshot: opening-stock | Opening balance entry creates a source-linked stock effect without a supplier payable. -->

1. Open **Stock > Manual opening stock** for initial stock setup, or **Opening stock import** for a file. Use normal supplier-bill intake for later purchases.
2. Enter a new batch manually or choose the migration/template route. Map product identity, stock unit and conversion, batch, expiry, quantity, prices, tax, location and targets.
3. Inspect the preview row by row. Correct an error at its source row; inspect duplicate same-product/same-batch entries before accepting them.
4. Confirm only the accepted rows. Read the success/failure result and retain the import/source identity.
5. Open the resulting batches and ledger to verify one opening effect per accepted row.

**Effect:** opening stock records initial physical quantities with actor, branch, source and import identity. It does not create a supplier invoice or payable. Retrying the same accepted import must not add the balance again.

An operating batch with prior movement history cannot be silently reset by repeating an opening import. Use the authorized count/reconciliation or linked correction workflow to explain a real difference. Partial success requires an exact list of accepted and rejected rows; do not retry everything as a new import without examining that result.

Keep the original migration file and row identifiers with the setup record so the clinic can later trace the opening balance.

<!-- page: supplier-return -->
# Return goods to a supplier in stages
Features: INV-28
<!-- screenshot: stock-return | A supplier return shows the source, selected quantities and its current stock/accounting stage. -->

1. Start **Return to supplier** from the posted bill or open **Stock > Supplier returns**. Confirm the original supplier and eligible purchase lines.
2. Choose affected batches, paid/free quantity and stock unit. Check the return base, type, discounts/scheme, taxable value and GST from the source.
3. Add the reason and inspect the preview. Save a **Draft** if goods are not yet ready to dispatch; a draft changes neither stock nor supplier accounting.
4. Create the return **Challan** when stock leaves the clinic. Verify the signed stock-out movement and remaining eligible quantity.
5. Finalise the **Return invoice** when the return and supplier-credit record are ready. Converting its existing challan adds the credit without deducting the goods again.
6. Inspect return history and apply the resulting credit to an eligible bill through the supplier-credit panel.

Final returns cannot be edited or deleted in place. Use a linked, reasoned correction and inspect its stock and accounting consequences. Draft changes remain editable; challan changes must preserve the original dispatch history and adjust/reverse only the recorded delta.

Quantities cannot exceed the original source's remaining eligible units. A filtered return register with no results means no records matched those filters, not that the clinic has never returned anything.

<!-- page: expiry-loss-hold -->
# Manage expiry, loss and blocked stock
Features: INV-29, INV-30, INV-33
<!-- screenshot: blocked-stock | A hold retains physical stock and separates the quantity unavailable for sale. -->

1. Open expiry queues for expired stock or the next one, two, three or six months. Check the stated date boundary, unit, supplier, location and valuation basis.
2. Inspect the original batch and select its disposition: hold while investigating, supplier return, or loss/breakage when no supplier credit is due.
3. For **Blocked stock**, enter eligible units, reason and owner. Physical on-hand stays recorded while available-to-sell decreases.
4. Release only the recorded held quantity after approval. A release restores availability; it is not a new purchase or an additional physical receipt.
5. For **Loss & breakage**, select batch, quantity/unit and reason, preview the stock decrease and post the final document.

**Effects:** loss removes eligible physical units and creates no supplier credit. A supplier return follows its own dispatch and credit stages. Quarantine or a hold must prevent the held quantity being sold; disposal uses an explicit stock movement, not deletion of the hold.

Opening an expiry list changes nothing. Do not delete a nonzero or ledger-linked batch to make an expiry exception disappear. Record the disposition, then archive only when permitted, keeping recoverable history. Confirm current stock before correction or reversal; it may have changed during investigation.

<!-- page: count-adjust -->
# Count physical stock and explain variance
Features: INV-31, INV-32
<!-- screenshot: stock-count | A count compares entered physical units with system stock before any variance is posted. -->

1. Open **Stock > Counts & audit**. Configure the audit owner, cadence and adjustment/approval mode if authorized. Off means tracking is not active.
2. Select the item, location and batch scope. Count in the displayed stock unit, keeping packs and individual units distinct.
3. Leave an uncounted batch blank. Enter **0** only when it was physically counted empty.
4. Review system quantity, physical quantity and variance. Investigate missed purchases, sales, returns, unit mistakes or damage and record a reason for every nonzero difference.
5. Submit the count. If approval is required, stock remains unchanged while the record is pending. The reviewer must use the current comparison if a sale or receipt occurred meanwhile.
6. Confirm the completed count, signed movement and resulting batch balance.

A -3 adjustment from 10 records outflow 3 and balance 7. A +3 adjustment records inflow 3 and balance 13. An attempted outflow 15 from stock 10 must fail without clamping the balance to zero.

Posting is transactional and retry-safe. Retrying an old count must not reapply stale physical quantities. Correct posted adjustments through a linked reversal/replacement with actor and reason; preserve the original before/after balances and source.

<!-- page: sales -->
# Dispense from the correct batch
Features: INV-24, INV-25, INV-39
<!-- screenshot: sales-entry | Sales entry identifies the product, batch, stock unit and current availability before confirmation. -->

1. Open **Sales** and choose a customer/patient workflow or **Counter sales** as appropriate. A counter bill must not need an invented patient.
2. Enter bill date, staff, doctor where applicable, payment mode and order details.
3. Search or scan the product. Confirm pack/unit, location, batch, expiry, quantity, MRP, discounts, GST and line total.
4. Prefer the eligible earliest-expiry batch. If the permitted workflow allows a different batch, record the reason; expired, held or insufficient stock is not available to sell.
5. Confirm the sale and inspect its allocated batches and signed stock-out history. Current availability is rechecked at posting, including repeated items and concurrent sales.

## Drafts and quotations
Save a draft or quotation when the sale is unfinished. These stages do not post stock or revenue and **do not reserve stock under the current policy**. The physical, held and available balances must remain understandable.

Convert a quotation once to its linked sale draft, preserving the source and agreed price changes. Final confirmation revalidates stock, expiry and holds; yesterday's quotation is not permission to sell unavailable stock today. Cancelling an unposted draft creates no purchase or sales-return movement.

<!-- page: customer-return -->
# Accept a customer return and refund
Features: INV-26
<!-- screenshot: sales-return | A customer return starts from its original sale and records the disposition of each selected batch. -->

1. Open **Sales > Customer returns**. Find the original sale and inspect its purchased lines and batches.
2. Select the partial or full quantity being returned and the reason. Use the original sale's unit and commercial basis, not today's selling price.
3. Choose a disposition for each line: **saleable restock**, **quarantine** or **loss**.
4. Preview the return/refund amounts and stock consequences. Only accepted saleable units increase stock available to dispense; quarantined units remain held and lost units do not become saleable.
5. Post once, then inspect the return document, original-sale link, affected batch and refund/credit status.

Returned units cannot exceed sold units less prior accepted returns, including simultaneous attempts. The backend validates the original sale terms and prevents an unrelated batch being credited as if it were the sold one.

Stock and refund/credit records belong to one transactional operation. If the response is uncertain, look up the saved return before retrying. A final return's history remains visible; correcting it creates a linked reversal/correction instead of erasing the original. Use the permitted refund method and record its status; an accounting refund record is not proof of an external bank transfer.

<!-- page: targets -->
# Set and review replenishment targets
Features: INV-34, INV-36
<!-- screenshot: manual-targets | Review the saved manual quantities and exclusions before accepting automatic proposals. -->

1. Open **Reorder > Manual targets & exclusions**. Confirm each item's stock-unit basis and saved min, max and reorder level.
2. Enter nonnegative targets with min no greater than max. Missing targets mean **unconfigured**, not zero demand.
3. Keep manual settings and exclusions visibly separate from automatic proposals. Preview bulk changes and retain an actor/reason.
4. In **Automation settings**, configure the owner, schedule, demand lookback, minimum history, cover days and supported bounce/refill inputs. Review last/next run and summary.
5. Open **Target proposals** and compare old and proposed targets, evidence period and cold-start/no-sales handling. Accept or reject the selected rows before synchronizing demand to Shortbook.

Automatic refresh must preserve reviewed manual overrides and exclusions. When the feature is Off it should not silently change targets. Use the supported target-review route if a legacy min/max control redirects there.

The reference application's 60-day history, one-order minimum, 10/60 cover days and 112/128 scope were observed examples, not clinic-wide rules to hardcode. Choose and review actual values for the current clinic, stock categories and demand pattern. Changes to settings must affect the calculation and remain explainable in its preview.

<!-- page: shortbook -->
# Turn demand into a reviewed order
Features: INV-35, INV-37
<!-- screenshot: reorder-shortbook | Shortbook keeps requested quantities, supplier, status and demand source together before a PO is created. -->

1. Open **Reorder > Shortbook**. Inspect product, supplier, priority, min/current stock, required quantity, requester and manual/automatic source.
2. Search or date-filter demand. Add or edit a manual request when needed, keeping its reason and override visible.
3. Review how automatic suggestions and manual requests overlap. Avoid ordering the same demand twice.
4. Choose supplier and final quantity, then create the linked purchase order for approval. Shortbook alone changes neither stock nor supplier dues.
5. Follow Ordered, Partially received, Fulfilled or Cancelled status through the linked PO and receipt records. Download the complete chosen demand set when reviewing offline.

Supplier recommendations are evidence for a decision, not a silent supplier switch. Check available history, price/unit basis and the chosen supplier before approval.

**Auto PO** requires a visible owner, approval policy, enabled state and schedule. Off sends no order. Review proposed/created/approved/sent/failed outcomes and their source links. Monitoring should state date and eligible category scope; a sample is not a complete replenishment plan. Supplier email delivery is not live configured/tested in this local validation and needs an authorized transport test before operational reliance.

<!-- page: purchase-order -->
# Receive an order in parts
Features: INV-38, INV-19
<!-- screenshot: purchase-order | A purchase order separates ordered, already received and remaining quantities. -->

1. Open **Purchase orders** from Reorder or the originating Shortbook request.
2. Check supplier, items, ordered quantities/units, prices, expected date, creator and source demand.
3. Save and submit for approval. An authorized reviewer approves; sending is a separate explicit action with its delivery or failure recorded.
4. When goods arrive, choose **Receive** to open Purchases with order context. Enter the actual receipt, retaining source lines and batches.
5. After posting the receiving document, inspect received and remaining quantities. A partial receipt must leave the unreceived balance open.
6. Cancel the remaining quantity when appropriate using its reasoned action. Cancellation preserves goods already received and their history.

Creating, approving or sending a PO does not itself add stock or create a supplier payable. An inward receipt adds physical stock; its linked supplier bill creates the purchase-accounting effect. A gate pass remains reference-only.

Duplicate receipts must not consume the remaining quantity twice. Investigate over-delivery through the documented decision path instead of inflating ordered or previously received quantities to force acceptance. Keep completed PO links; deleting a completed record must not erase receipts or their stock evidence.

<!-- page: reporting -->
# Read reports and keep evidence boundaries clear
Features: INV-42, INV-40, INV-41

1. Open **Purchases > GST & monthly reports** or **Purchase costs**.
2. Set branch/date scope and read eligible document status. Posted totals exclude drafts; pending work is displayed separately.
3. Compare the table, total, source drill-down and complete-result export under the same filters. A displayed page or ranked subset must not be called the full dataset.
4. Compare product costs only with compatible verified product, pack and stock-unit identity. Read MRP, purchase price, landing cost, tax, discount and free-goods treatment separately. Unknown or mixed bases remain unknown.
5. Use the source bill and arithmetic page in this guide to investigate a difference; formulas are an implementation policy, not a new legal tax rule.

## What this edition establishes
Local verification uses isolated fixtures and the dedicated acceptance database. The original Eucerin bill SB-26-136543 records two batches with 9 and 7 packs and Rs. 45,602 net. The synthetic twenty-line bill records all 20 rows. Both checks confirm identical downloaded original bytes and duplicate retries without extra stock. Other checks exercise transactional posting and permission boundaries. Screenshot captions identify visible local screens; they do not certify all 211 acceptance criteria.

**Still external:** production rollout validation; live Gmail/OAuth connection and attachment fetch; live supplier-email delivery; and the observed task exercise with three representative clinic staff. Staff usability must cover receiving a bill, finding a batch, recording a count and starting a return, recording assistance as well as completion.

The reference PDF is a read-only review of eVitalRx, not evidence that the new implementation shares every vendor behavior. Keep its observations distinct from this system's explicit posting policies and current test results.

<!-- page: feature-index -->
# Complete feature index
The index below maps every feature to its operating destination and guide page. It is a navigation aid, not a declaration that every acceptance check passed.

The companion baseline is **docs/product/inventory-workflow.acceptance.json**: 42 features and 211 criteria, with original criterion IDs and source references. Assessment fields describe the source snapshot they were recorded against; read current verification evidence separately. Preserve every acceptance criterion when updating implementation evidence.

Current source review and local evidence are recorded in **docs/qa/inventory-workflow-final-gap-audit.md**, **docs/qa/inventory-workflow-contract-review.md** and **output/diagnostics/inventory-workflow/**. This guide's page illustrations come only from the parent-verified screenshot manifest.

<!-- feature-index -->
