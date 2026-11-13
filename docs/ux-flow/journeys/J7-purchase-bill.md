# J7 — Purchase bill: a supplier's bill becomes stock, and then gets paid

**Stories**: STORY-084 (primary), 085, 086, 087, 088, 090 — `docs/ux-paths/topics/inventory-purchases.md`
**Persona**: `pharmacist` (Karthik Reddy), 1440×900, seeded demo data, 13 Nov 2026
**Verdict**: **convoluted** for intake and the review workbench; **minimal** for the register and `Mark paid`.

## How this was walked

| Part | Evidence | Status |
|---|---|---|
| Routes into "record a bill" (Today, task strip, register) | live | measured |
| Scan screen: upload a generated PNG, press `Scan bill` | live — the read fails here ("Codex could not start…"), the file is kept and the review layout opens empty | measured up to the failure |
| Post-OCR review of a *successful* read (flag counts, source highlights, "Agreed terms" panel, bulk GST apply) | code + story only | **suspected** |
| Manual entry end to end: new supplier, 2 lines, new products, post (bill `J7-1001`, credit) | live | measured |
| Interrupted entry: near-miss product name, `Save draft` with an incomplete line, look for it, resume, post, `Back to list` (bill `J7-1002`, cash) | live | measured |
| Register, `Mark paid`, `Undo` | live on `J7-1001` | measured |
| `Payments & dues`: `Max` → `Record Payment` | live on `J7-1002` | measured |
| Posted bill › "Invoice history and documents" › `Correct posted purchase` panel | live, opened only; no return created | measured to the panel, rest **suspected** |

Seed-data caveat that shapes several findings: at the start the Purchase bills register was empty, the supplier directory was empty ("No saved suppliers yet") and the purchase product catalogue was empty — the 79 seeded stock batches are "Unmapped" (Today data-quality strip, [01](J7-purchase-bill-screens/01-inventory-today.jpg)). I created supplier "Jseven Pharma Distributors" and two "Jseven …" products; everything else was left alone.

---

## Friction Scorecard

| Measure | Count | What it is |
|---|---|---|
| **Steps — typed bill**, saved supplier, 2 catalogued products, cash (STORY-085) | **28 interactions / 8 coarse steps** vs ideal **6** coarse (≈20 interactions) | measured, see breakdown |
| **Steps — typed bill, first time** (new supplier, 2 new products, credit) | **44 interactions** | measured on `J7-1001` |
| **Steps — scan route** (STORY-084) | 4 to start the read (measured); the story lists **30 steps vs ideal 6** for the rest | suspected beyond the read |
| **Steps — pay one bill** (`Mark paid`) | **3 vs ideal 3** | measured |
| **Steps — pay via `Payments & dues`** | 4 interactions + ~1,865 px of scrolling vs ideal 5 | measured |
| **Decisions** | 10, of which **4 needless** | below |
| **Re-entry** | **4** kinds of data the app already holds | below |
| **Confirmations** | 6, of which **2 guard nothing** (+1 suspected), **1 is a double confirm**, 1 is a phantom | below |
| **Dead ends** | **4** | below |
| **Hesitations** | **13** | below |

**Step breakdown, typed bill (measured).** `Inventory` (1) → `Scan or enter bill` (1) → `Type instead` (1) → Saved supplier (1) → DL No. (1) → Invoice No. (1) → line 1: Product, Pack Size, Stock unit, Batch, Exp. Month, Exp. Year, Paid Qty, Rate, MRP, HSN (10) → `Add Line` (1) → line 2 (10) → `Confirm reviewed values & add stock` (1) = 28. The eight that a better form would not ask for: `Type instead`, DL No., and Pack Size + Stock unit + HSN on each line. Batch, expiry, quantity, rate and MRP are on the paper and nowhere else — those 5 per line are irreducible and earn their place.
Each product the catalogue does not know adds 4 (cosmetic) to 8 (medicine) interactions; a product typed almost-but-not-exactly adds 3 plus a 2,200 px scroll.

**Decisions (10).** Needed: scan vs type; Bill Type Cash/Credit; product kind for a new product; confirm / choose another / create new on a doubtful match; payment mode. Carried well by a default: Received on (today), Invoice Date (today), payment Date (today), Mode (remembered). **Needless (4):**
1. "Invoice product kind" *and* "Product kind" — two selects with the same three options in one card ([06](J7-purchase-bill-screens/06-product-not-in-inventory.jpg)).
2. `Confirm reviewed values & add stock` vs `More options` › `Save & Process` — a second way to post, differing only in an "automatic" label (`PurchaseInvoiceWorkbench.tsx:3712-3717`).
3. `Retry product check` vs `Refresh Matches` — same function, two names (`:3345` and the matching card).
4. `Resolve line N product` vs `Fix products on this invoice` vs `Choose another product` — three buttons that scroll to the same card ([07](J7-purchase-bill-screens/07-different-products-second-confirm.jpg)).

**Re-entry (4).**
1. **DL No.** — typed on every bill. Picking the saved supplier fills only name and GSTIN (`PurchaseSupplierReview.tsx:134`); it was still empty on bill 2 after bill 1 was posted with it. `Supplier.drugLicenseNo` exists (`backend/prisma/schema.prisma:1131`).
2. **Pack Size + Stock unit** per line — the catalogue product already carries the pack ("Pack 15 g" in the Saved product panel), and Stock unit defaults to "Strip" for a tube.
3. **HSN** per line — a product-level field (`schema.prisma:1041`), hidden under "Other commercial details" and required.
4. **GST %** per line — product-level (`schema.prisma:1042`); the form guesses 6 + 6 for everything (`:471`).

**Confirmations (6).**
- Guard nothing: (a) native confirm "Reject this upload without adding stock? Its archived original will be retained." — nothing is destroyed (`:3602`, measured); (b) checkbox "I checked the supplier name and GSTIN against the original invoice." on a *typed* bill — the pharmacist typed those values from the paper seconds earlier (measured). Suspected (c): "Discard the OCR reading and type every invoice row…?" (`:3510`) is also asked when the scan failed and there is no reading to discard.
- Double: `Confirm Match` → "These look like different products" → `Confirm this match`. The second check is worth having; asking for it in a different place is not (see dead end 2).
- Phantom: badge "Same product · confirm" on an exact match — nothing has to be confirmed; `J7-1001` posted without touching it.
- Earn their place: the posting button (no dialog, the label states the consequence), the `Mark paid` popover (input + commit, with `Undo`).

**Dead ends (4).**
1. **`Back to list` does nothing** after posting a bill entered from Today or the task strip — URL and screen unchanged (measured; `InventoryWorkspace.tsx:162-175` has no fallback when there is no `return` target). It works when the bill was opened from the register.
2. **`Confirm Match` appears to do nothing** on a near-miss name: the badge stays "Possible match · confirm", focus stays on `<body>`, and the follow-up box is inserted 2,233 px above the viewport under "Finish this purchase" (measured scroll offsets).
3. **An interrupted bill cannot be found where one looks for it.** After `Save draft`, `J7-1002` was absent from Purchase bills › Payment status `Not posted`, and Today showed "Purchase invoices to review 0". It exists only as a button under "Saved unfinished intake" on the scan screen.
4. **Today › "Original files awaiting intake 1"** lands on the top of the scan screen; the file is inside the collapsed "Saved uploads (1)" at the very bottom. Today promises "Every action opens the matching records."

**Hesitations (13).** (1) `Type instead` is a small underlined link under a greyed-out `Scan bill` ([02](J7-purchase-bill-screens/02-scan-or-enter-bill.jpg)). (2) A pristine typed form opens with "6 checks to finish", an amber "Products need attention" and five red blocks ([04](J7-purchase-bill-screens/04-type-instead-first-view.jpg)). (3) Two counters disagree on one screen: "6 checks to finish" above, "8 checks to review" in the bar; later "2" vs "1". (4) "Product" is free text with no suggestions — zero listbox/option elements after typing. (5) "Not in inventory" for a product with 18 tubes on the Stock list, with the create-new form above the search ([06](J7-purchase-bill-screens/06-product-not-in-inventory.jpg)). (6) HSN is required but hidden in a disclosure; DL No. is required but unmarked. (7) Expiry arrives prefilled 12 / next year and Paid Qty 1 — they read as data. (8) `Save draft` answers with three contradictory statuses ([08](J7-purchase-bill-screens/08-save-draft-interrupted.jpg)). (9) `Recover interrupted import` sits on every state, including a finished bill ([10](J7-purchase-bill-screens/10-stock-added-outcome.jpg)). (10) A bill entered as Bill Type `Cash` shows "Due" with `Mark paid`. (11) Task `Payments & dues` opens a page titled "Purchase Ledger" whose payment form starts 1,865 px down ([14](J7-purchase-bill-screens/14-payments-and-dues.jpg)). (12) "Ready for your final check" and "No outstanding OCR checks" are amber with a warning triangle. (13) The scan failure is reported in developer terms ([03](J7-purchase-bill-screens/03-scan-failed-no-ocr.jpg)).

---

## Take-away Pass

### 1. Today — [01-inventory-today.jpg](J7-purchase-bill-screens/01-inventory-today.jpg)
- One primary action, `Scan or enter bill`, and it is the right one. Nothing to remove for this journey.
- The data-quality strip (five chips, three in red/amber) outweighs the primary button above the fold; that belongs to the stock journey, not this one.

### 2. Scan or enter bill, before anything is chosen — [02-scan-or-enter-bill.jpg](J7-purchase-bill-screens/02-scan-or-enter-bill.jpg)
Above the upload control sit three things no step of STORY-084/085 uses on arrival:
- **Remove/move**: `Recover interrupted import` — an exception tool shown as the most button-like element on the screen (`:4062-4073`). Show it only when an interrupted import exists, or move it under a "Problems" disclosure.
- **Defer**: "Recent invoices (n)" — the register is one click away in the task strip.
- **Defer**: "Review status guide" — a legend for a screen the user has not reached.
- **Demote**: cue "Scan only · stock stays unchanged" plus an info icon — one sentence of helper text would do.
- **Promote**: `Type instead`. It is one of two ways to do the job and is drawn as a footnote. The primary button is disabled-grey until a file is chosen, so on arrival the screen has *no* visibly available action.
- "Automatic import" disclosure: collapsed, fine where it is.

### 3. After a failed scan — [03-scan-failed-no-ocr.jpg](J7-purchase-bill-screens/03-scan-failed-no-ocr.jpg)
- The same five problems are stated **three times**: as buttons in "Finish this purchase" (`Correct line 1 batch` …), as red blocks under "Check before adding stock" ("Line 1: Batch is missing." + "How to fix" + "Go to batch"), and as "Needs correction" badges on the fields. Keep the field badges and the `Next check` stepper; drop the other two lists.
- "Finish this purchase" holds **8 equal-weight outline buttons** and no primary. With no reading at all, only two matter: type the bill, or reject the upload.
- The error "Request Failed — Codex could not start. Check PHARMACY_AGENT_CODEX_PATH." is rendered below the buttons it should explain (`backend/src/shared/codex/codex-oauth.ts:39` passed through at `:4106`).
- With a file attached the page splits 50/50 (`:4145`); the form column shrinks until "Needs correction" badges wrap onto their own lines. Page height 5,782 px.
- What works: the file is kept ("Original file saved"), and the form to type into is already on the page.

### 4. Typed entry, first view — [04-type-instead-first-view.jpg](J7-purchase-bill-screens/04-type-instead-first-view.jpg)
- **Remove on a pristine form**: the red "6 checks to finish" cue, the five red missing-value blocks, and the amber "Products need attention — Check the saved products before final review" with `Retry product check` and `Copy product handoff`. Nothing has been entered; none of it is actionable.
- **Collapse**: the whole "Scan a bill" panel stays expanded above a bill the user chose to type.
- **Remove**: `Copy product handoff` — no story step uses it for a user who has create and commit rights.
- **Fix**: stale sentence "…then confirm your review and choose Save & Process" under the supplier fields; the button is now `Confirm reviewed values & add stock`.
- **Merge**: "Distributor" (text), "GSTIN" (text) and "Saved supplier" (select) are three controls for one choice. One searchable supplier box, with "add new" when nothing matches, replaces all three.
- Hierarchy: the sticky bar (guidance line, primary, `Save draft`, `More options`, status text, counter, `Previous`, `Next check`) occupies about 145 px and leaves a 24 px strip where page content shows *under* it ([05](J7-purchase-bill-screens/05-manual-line-entry.jpg), bottom edge). Between the app header and the bar there are about 660 px for a form that is 4,420 px tall when empty and 6,558 px with two lines and the matching card open (measured `scrollHeight`).

### 5. A product line — [05-manual-line-entry.jpg](J7-purchase-bill-screens/05-manual-line-entry.jpg)
- 14 inputs always visible + 5 under "Other commercial details" + 4 read-only results = 23 boxes per line.
- **Remove**: "OCR Confidence — Manual entry" on a typed line (`:5188`).
- **Fill from the product, don't ask**: Pack Size, Stock unit, HSN, CGST/SGST/IGST %.
- **Move up**: HSN, if it must be typed, belongs in the visible grid — it is required and currently lives in a disclosure that only opens itself while HSN is empty (`:5180`).
- **Defer** (already collapsed, good): Old MRP, Special %, Scheme amount, Manufacturer.
- **Change the default**: Exp. Month `12` / Exp. Year next-year (`:461-462`, `:383`) and Paid Qty `1`. A line whose expiry was never typed still posts with a plausible date. This is the one place where a default should be *removed*: expiry is a safety value and should start empty.
- Taxable / GST / Effective Cost read-outs earn their place for checking against the paper.

### 6. Product matching — [06-product-not-in-inventory.jpg](J7-purchase-bill-screens/06-product-not-in-inventory.jpg)
- Typing a Stock-list name exactly ("Calcipotriol 0.005% Ointment 20g", 20 g) produced "Not in inventory"; "Search saved products manually" → "No saved products found." (measured — seeded stock is not linked to catalogue products). The card then offers "New product details" → `Create new item` **before** the search box. Order should be: search existing, then create.
- **Remove**: "Invoice product kind" select (duplicate of "Product kind").
- **Rename**: panel heading "OCR / DRAFT LINE" on a typed line.
- The invoice-line panel repeats six values that are on the line itself a few hundred pixels below; for a typed bill only the name and pack are needed for comparison.
- Worth keeping: for a medicine, Category, Composition, Dosage form, Strength and "Prescription required" are mandatory and "Placeholder values cannot be used" — a real check for a clinic pharmacy. A cosmetic needs only Category (measured).
- Worth keeping: an exactly typed name + pack auto-matches with no click (measured on `J7-1001` line 1).

### 7. Doubtful match — [07-different-products-second-confirm.jpg](J7-purchase-bill-screens/07-different-products-second-confirm.jpg)
- The comparison is good content in the wrong place: it is the same two panels as the matching card, shown a second time, at the top of the page.
- `Confirm this match` — the action the user came to take — is the only *unstyled* button in a row of outlined ones.
- **Remove**: "Reference: 16dac046-54b1-…" (a UUID with no use to the pharmacist), `Fix products on this invoice`, `Save corrections and check again` (neither resolves this question).
- Simplest fix: show "Product names differ — confirm anyway?" inline, next to the `Confirm Match` that was pressed.

### 8. Save draft, interrupted — [08-save-draft-interrupted.jpg](J7-purchase-bill-screens/08-save-draft-interrupted.jpg)
Three statements on one screen: "Unfinished invoice saved to the server…", red "Fix Required — These corrections were not saved", and the bar's "Not saved · stock not added". Cause: `Save draft` sets the validation list and then calls `saveIncompleteDraft()` (`:3706-3711`); the bar text keys off `activeInvoice` (`:3720`). One line is enough: "Draft saved. 1 thing still to fill in before stock can be added."

### 9. Ready to post — [09-ready-to-post-total-and-bar.jpg](J7-purchase-bill-screens/09-ready-to-post-total-and-bar.jpg)
- Exactly one primary action, correctly labelled, with its consequence stated above it. No dialog. This part is right.
- "Check bill total": ten equal tiles and a 50-word paragraph. The number the pharmacist compares with the paper — **Net Payable** — is the same size as "Free stock units". Make Net Payable dominant; fold the stock-unit tiles and the margin explanation into a disclosure.
- **Remove**: `More options` › `Save & Process`.
- Bar status "Not saved · stock not added" repeats what the button label and guidance line already say.

### 10. Stock added — [10-stock-added-outcome.jpg](J7-purchase-bill-screens/10-stock-added-outcome.jpg)
- "Stock added" is stated **eight** times on the page: status pill, "Stock added - saved receipt", stepper "3. Add stock", the notice "Stock added for J7-1001. The saved record confirms the operation completed.", the heading, a badge, the sentence under it, and the bottom bar. One green receipt block is enough.
- 47 green "Verified" badges, one per field, on a read-only bill — emphasis inflation; a single "Checked and posted by Karthik R., 13 Nov" line carries the same fact.
- **Remove here**: `Recover interrupted import`, "Review status guide", the disabled `Add Line`, "Apply GST or discount to selected rows", `Remove line` on a posted bill.
- **Missing onward action**: nothing leads to the payable. A cash bill has just become "Due"; `Mark paid` and "View in Purchase bills" belong next to `New invoice`.
- Good: the receipt list links each batch and states units added.

### 11. Purchase bills register — [11-register-with-bill.jpg](J7-purchase-bill-screens/11-register-with-bill.jpg)
- Little to take away. One primary (`New purchase`), eight columns that are all used, filters behind `More filters`, a one-line distributor strip only when one distributor is in view, a footer total that links to dues.
- Minor: the "Due" pill is red-tinted for a bill not due until 13 Dec, so it reads like "Overdue".
- Minor: the button says `New purchase`; the destination is called "Scan or enter bill".

### 12. Mark paid — [12-mark-paid-dialog.jpg](J7-purchase-bill-screens/12-mark-paid-dialog.jpg)
- Already minimal: title carries amount and payee, Mode and Date are prefilled, the reference is optional, the submit button repeats the amount, and the row then shows "Paid · Undo". Two clicks. Nothing to remove.

### 13. Posted bill › Invoice history and documents — [13-posted-bill-history-and-documents.jpg](J7-purchase-bill-screens/13-posted-bill-history-and-documents.jpg)
- Ten equal outline buttons in three rows; the two that start a correction (`Correct posted purchase`, `Return to supplier`) lead to the same place (suspected, per STORY-088) and are not distinguished from `Logs` or `Print QR`.
- The section is the last collapsed disclosure of a ~4,000 px page, yet it is the only route to fixing a posted mistake. The sentence under the heading at the top says instead "To fix a saved quantity, price or product detail, open the batch below" — a different, stock-only route (both texts seen live).
- The sticky `Back to list` strip overlaps the content beneath it (top of the screenshot).

### 14. Payments & dues — [14-payments-and-dues.jpg](J7-purchase-bill-screens/14-payments-and-dues.jpg)
- The page opens on four tiles, a summary table, Aging and Alerts; the only form — "Bulk Payment Allocation" — begins 1,865 px down. For someone who came to record a payment, everything above it is a report.
- "Distributor Summary" is clipped at 1440 px: Net payable, Overdue and TCS Remaining are cut off, beside a large empty area in the same card.
- The `Max` button renders one letter per line ("M / a / x").
- After `Record Payment` the "Saved — Payment recorded and allocated." alert appears at the top of the page while the user is still scrolled 1,730 px down (measured); the only visible change is that the row disappears.
- Good: `Max` fills both the allocation and the Amount; the payment undone from the register is listed as "Reversed · Undone from purchase list".

---

## The Simpler Version

### Typed bill (STORY-085) — 6 steps
1. `Inventory` → **Record a bill**. The screen offers two equal choices, "Scan or upload" and "Type it in", and remembers the last one used.
2. **Supplier**: one search box. Picking "Jseven Pharma Distributors" fills GSTIN, DL No. and the usual bill type. Unknown name → "Add as new supplier" inline, as today.
3. **Invoice No.** Dates stay at today; change them only if needed.
4. **Each line**: pick the product from a typeahead (fills pack, unit, HSN, GST %), then type Batch, Expiry (empty, required), Qty, Free, Rate, MRP. Unknown product → "Add new product" in place, with today's kind-specific fields.
5. Compare one large **Net payable** with the paper.
6. **Add stock**. The receipt offers `Mark paid` (for a cash bill, one click), `Next bill`, `View in Purchase bills`.

### Scanned bill (STORY-084) — 6 steps, as the story's ideal path
1. `Inventory` → **Record a bill** → drop the pages (thumbnails show the order).
2. **Scan**.
3. `Next check` through only the flagged values, each beside its highlighted source.
4. Exact matches are accepted silently; each doubtful match is confirmed or changed **in its own row**.
5. Compare Net payable.
6. **Add stock**.

### Paying
Unchanged: `Mark paid` → `Record payment`. For several bills or a part payment, `Payments & dues` opens on the payment form for the chosen distributor.

### Changes to get there

| # | Change | Effort | Files |
|---|---|---|---|
| 1 | Product typeahead on the line's "Product" field, backed by the existing `/pharmacy/purchase-invoices/master-products` search; picking fills pack, unit, HSN and GST % and counts as the match | M | `frontend/src/components/pharmacy/PurchaseInvoiceWorkbench.tsx` (line grid ≈5150-5190), `PurchaseManualMatchSearch.tsx` |
| 2 | Fill DL No. from the saved supplier; store it on first use | S–M | `PurchaseSupplierReview.tsx:134`, `PurchaseInvoiceWorkbench.tsx:4508`, supplier DTO/service |
| 3 | Show the doubtful-match question inline at the `Confirm Match` that raised it (or at least scroll and focus to it); drop the UUID and the two unrelated buttons | S | `PurchaseInvoiceWorkbench.tsx` (`pendingMismatch` block ≈3560-3590, matching card ≈4790+) |
| 4 | `Save draft`: one outcome message; clear the validation list when the incomplete draft saves; bar reads "Draft saved · stock not added" | S | `PurchaseInvoiceWorkbench.tsx:2675, 3706-3711, 3720` |
| 5 | List unfinished typed bills in Purchase bills › `Not posted` and count them in Today › "Purchase invoices to review" | M | purchase register query (backend), `inventory/purchase/PurchaseRegister.tsx`, `InventoryWorkspace.tsx:700-714` |
| 6 | `Back to list` falls back to the register when there is no return target | S | `InventoryWorkspace.tsx:162-175` |
| 7 | Quiet pristine form: no red blocks or "Products need attention" until a field is touched or Save/Post is pressed; keep one issue list (field badges + `Next check`), delete the other two; one counter | M | `PurchaseInvoiceWorkbench.tsx:3320-3440, 3524-3600`, `PurchaseOcrChecklist.tsx` |
| 8 | Make `Type instead` a real secondary button (or a two-way chooser); collapse "Scan a bill" once typing starts | S | `PurchaseInvoiceWorkbench.tsx:4372-4377` |
| 9 | Start Expiry and Paid Qty empty | S | `PurchaseInvoiceWorkbench.tsx:451-475` |
| 10 | Typed-entry clean-up: hide "OCR Confidence", "No outstanding OCR checks", "OCR / DRAFT LINE"; show `Recover interrupted import` only when one exists | S | `PurchaseInvoiceWorkbench.tsx:3435, 4062-4073, 5188`, matching card |
| 11 | Matching card: search before create; one "Product kind" select | S | `PurchaseInvoiceWorkbench.tsx` ≈4790-4900, `PurchaseProductDetails.tsx` |
| 12 | Outcome screen: one receipt block; add `Mark paid` and `View in Purchase bills`; one "checked by" line instead of per-field "Verified" badges | M | `PurchaseInvoiceWorkbench.tsx:3901-3990`, `PurchaseFieldReview.tsx` |
| 13 | Scan failure copy: "Bill reading isn't available right now. Your file is saved — type the bill below or try again later."; place it above the actions | S | `PurchaseInvoiceWorkbench.tsx:4106`, `backend/src/shared/codex/codex-oauth.ts:39` |
| 14 | `Payments & dues`: payment form first (or scroll to it when a distributor is chosen); success message beside the button; fix clipped table and vertical `Max`; heading "Payments & dues"; ₹ and mode labels as in the register | M | `frontend/src/components/pharmacy/PurchaseLedger.tsx` |
| 15 | Remove `More options` › `Save & Process`; fix the stale "choose Save & Process" sentence | S | `PurchaseInvoiceWorkbench.tsx:3712-3718`, `PurchaseSupplierReview.tsx` |
| 16 | Sticky bar: one row, no content strip beneath it; make Net Payable the dominant total | S | `PurchaseInvoiceWorkbench.tsx:3681`, `PurchaseReviewSummary.tsx` |
| 17 | Today › "Original files awaiting intake" opens "Saved uploads" expanded and in view | S | `InventoryWorkspace.tsx:710-713`, `PurchaseInvoiceWorkbench.tsx` |
| 18 | Drop the native confirm on `Reject this upload` (nothing is lost); drop the supplier checkbox on typed bills | S | `PurchaseInvoiceWorkbench.tsx:3602`, `PurchaseSupplierReview.tsx` |

Changes 1 and 2 remove 8 of the 28 interactions on a routine typed bill. Changes 3–6 remove all four dead ends. Nothing here removes a check on batch, expiry, GST or money; change 9 adds one.

---

## Clarity Issues

**One thing, several names**
- The job: `Scan or enter bill` (Today, task strip, heading) · `New purchase` (register) · `New invoice` (workbench) · "Finish this purchase" · "Distributor Bill" · "Recent invoices" · "Purchase invoices to review" (Today).
- The party: card "Supplier" → field "Distributor" → select "Saved supplier" → `Save verified supplier`, all in one block ([04](J7-purchase-bill-screens/04-type-instead-first-view.jpg)).
- The catalogue: "Not in inventory" · "Saved product" · "Created drug master Jseven Adapalene Gel 15g" (notice) · `Create new item` · "Product matching and catalogue details".
- The payable: `Mark paid` → "Pay ₹… to …" → `Record payment` (register) vs `Payments & dues` → "Purchase Ledger" → "Bulk Payment Allocation" → `Record Payment`; "Bill No" there, "Invoice" here; "₹313.60" there, "Rs 313.60" here; "NEFT / RTGS" there, "NEFT" here.

**Labels that say the wrong thing**
- "Not in inventory" on a product with stock on the shelf — it means "not in the purchase catalogue".
- "Same product · confirm" — nothing needs confirming.
- "6 checks to finish" vs "8 checks to review" — two counts of nearly the same thing.
- Bill Type `Cash` — does not mean paid; the bill appears as "Due", and the ledger shows "Cash paid Rs 0.00 · Due -".
- "Ready for your final check" and "No outstanding OCR checks — compare with the bill" in amber with a warning triangle — good news dressed as a warning.
- "Stock added. To fix a saved quantity, price or product detail, open the batch below." vs "Correct posted purchase — Create a linked supplier return…" — two different instructions for the same mistake on one page.
- "…then confirm your review and choose Save & Process" — names a button that is no longer the main action.

**Words the pharmacist should never see**
- "Request Failed — Codex could not start. Check PHARMACY_AGENT_CODEX_PATH."
- "OCR / DRAFT LINE", "OCR Confidence: Manual entry", "No outstanding OCR checks" on a hand-typed bill.
- "Reference: 16dac046-54b1-4e96-9060-de3a228bc4ea"; `Copy product handoff`; `Recover interrupted import` (asks for an "Import attempt ID").
- "Unfinished invoice saved to the server."; "The saved record confirms the operation completed."
- "Line 2: purchased plus free quantity must be greater than zero" — "Line 2: enter a quantity".
- "No exact active product matches this name and pack. Correct the invoice identity or choose an existing product." — "invoice identity" means the name and pack typed on the line.
- "1 stock units added".

**Explanations doing a layout's job**
- Under the totals: "Quantities count each line's declared stock units, including free units, without multiplying by pack contents. Margin is a percentage of sales at each unit's MRP before selling discounts: GST is excluded from sales and purchase cost; TCS and rounding are excluded. Missing MRP makes margin unknown." — always visible, for a figure ("Indicative margin at MRP") no step of this journey uses.

---

## Already Minimal

- **`Mark paid`** — 2 clicks from the row, every field defaulted, amount on the button, `Undo` in the cell, and the reversal is recorded in the ledger. No change.
- **Posting** — a single button whose label is the confirmation ("Confirm reviewed values & add stock"), the first blocker shown in words above it when disabled, no modal. No change.
- **Purchase bills register** — sensible default period and sort, search by bill number, payment status as the one always-visible filter, distributor strip and totals only when relevant. No change beyond the button name.
- **`Next check`** — on a typed bill it walks focus through each missing value in turn ("Check 1 of 8 · supplier drug license" → the DL field). Keep it; it should be the *only* list of what is missing.
- **Exact match is silent** — a product typed exactly as catalogued needs no matching step.
- **Inline supplier and product creation** — neither sends the user to another screen, and the bill in progress survives both.
- **Failed scan keeps the file** and lets the user type on the same screen.
- **Entry from Today** — one primary button, one click to the workbench.
- **Checks that earn their step**: batch, expiry, quantity, rate and MRP per line; HSN and GST being present (they should be prefilled, not dropped); product kind and, for a medicine, composition / strength / dosage form / prescription flag; the "these look like different products" comparison (keep it, move it); the requirement for a supplier drug licence number (keep it, prefill it); the due date on a credit bill.
