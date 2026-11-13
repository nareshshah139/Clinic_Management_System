# J8 — Stock look-up, correction and reorder

> Critique pass (simplicity and clarity), not a test pass. Live traversal on 13 Nov 2026 at 1440×900 as `pharmacist` (Karthik Reddy) and `admin`.
> Primary story: STORY-103. Supporting: STORY-094, 096, 097, 098, 101 (`docs/ux-paths/topics/inventory-stock-reorder.md`).
> **Measured** = counted or seen live (screenshot, on-screen label, DOM position). **Suspected** = read from code or the story only.
> Out of scope (hand-off only): the supplier-bill intake workbench and stock counts.

**Verdict: convoluted.** The primary journey takes 25 actions against an ideal of 8, the reorder documents stack two components with duplicate controls, and four screens fail three or more heuristics. The individual dialogs (Edit stock, the change preview) are good; the cost is in finding things, in where the next action sits, and in how many parallel routes exist.

What was changed on the shared database while traversing: Calamine Lotion 26 → 25 bottles (raised and approved by me); Dapsone 5% Gel location `Rack J8-A1` and "Reorder at" 10 → 8; supplier `Jeight Distributors`; item `Jeight Sunscreen SPF50 gel` (requested and approved, 0 stock); four Shortbook drafts created by `Sync shortages`; `PO-NEED-2026-11-13-Electrocautery Tips (Pack of 10)` approved and "sent", not received; draft proposal `TARGET-2026-11-13` (nothing accepted).

## Friction Scorecard

| Measure | Count | Notes |
|---|---|---|
| Steps, primary journey (STORY-103) | **25 actual / 8 ideal** | Targets 6, shortage → order 8, approve + send 7, receive 4. Measured, except the final `Accept selected` click, which I did not press (it would rewrite targets for 78 shared items). |
| Steps, STORY-094 (is it in stock) | 3 + a scroll / 2 | The answer row is below the fold after searching. |
| Steps, STORY-098 (quantity edit + approval) | 11 / 4 | 7 for the pharmacist including navigation, 4 for the approver. |
| Steps, STORY-097 (expiry/shelf + alert) | 9 / 5 | Two saves and two reasons when `Set stock alert` is used as offered. |
| Steps, STORY-096 (new item) | 12 / 6 | And the approved item still has 0 stock, so a second flow follows. |
| Decisions | 14, of which **6 needless** | Listed below. |
| Re-entry | **3** | Second reason; today's date on new documents; stock for a new item through a second flow. |
| Confirmations guarding nothing | **3** | Two approve dialogs that show less than the card behind them; one success modal that needs `Close`. |
| Dead ends | **7** | Listed below. |
| Hesitations | **12** | Listed below. |

### Steps as measured (STORY-103)

- **A. Targets (admin), 6:** `Inventory` → `Reorder` → `Target proposals` → `Generate target proposal` → `Select unreviewed` → scroll 9,500 px → `Accept selected` (not pressed).
- **B. Shortage to order (pharmacist), 8:** `Inventory` → `Reorder` → `Sync shortages` → open the request → choose `Supplier` → change `Quantity` (495 → 5) → `Create purchase order` → `Submit for approval`.
- **C. Approve and send (admin), 7:** `Inventory` → `Reorder` → `Purchase orders` → open the order → `Approve document` → scroll 1,458 px → `Send purchase order` → export icon.
- **D. Receive (pharmacist), 4:** `Inventory` → `Orders awaiting receipt` → open the order → scroll → `Receive remaining stock` (hand-off to Purchases › Inward challans).

### Decisions

Needless (a default or a merge would carry them):

1. `Add manual request` (primary) or `Sync shortages` (secondary), on a Shortbook that says "0 matching records" while Today says "4 Low stock". Shortages should already be there.
2. Which of two `Supplier` pickers to use on a request ([09](J8-stock-reorder-screens/09-shortbook-request-lines-and-supplier.jpg): one in the form, one under "Supplier recommendation" with `Save supplier`). Choosing in the top one leaves the lower one on "Select a saved supplier" (measured).
3. `Save draft` or `Create purchase order`. `Create purchase order` on an unsaved request carried supplier and quantity (measured), so `Save draft` is never required on the happy path.
4. `Select unreviewed` selects 78 lines, 74 of which propose no change ("Saved min / max 5 / 500 → Proposed 5 / 500", [12](J8-stock-reorder-screens/12-target-proposal-bottom.jpg)). The user has to decide what to do with lines that do nothing.
5. After approval, `Receive remaining stock` (primary) or `Send purchase order` (secondary) ([10](J8-stock-reorder-screens/10-purchase-order-approved-delivery-panel.jpg)). The order has just been approved; only one of these makes sense.
6. `Send purchase order` or the export icon, when the caption under them already says sending will fail ("Supplier mail transport: setup required. Sending records the setup failure").

Real decisions (they earn their place): which supplier; the order quantity; priority; which proposal lines to accept; approve or reject; `Cancel document` versus `Cancel remaining quantities`; which mechanism to use for a wrong quantity (see "Routes that change a stock quantity"); `Price / stock` versus `New items` in the approval queue.

### Re-entry

1. **Reason typed twice** for one tidy-up of one batch: `Edit item` → save, then `Set stock alert` reopens the same form with an empty "Why are you changing it?" (measured; `StockDetailsEditor.tsx:215-226`).
2. **Date is blank** ("mm/dd/yyyy") on a new Loss & breakage draft and on the inward challan opened by `Receive remaining stock`, although the Shortbook request and the order carry today's date ([15](J8-stock-reorder-screens/15-loss-breakage-document.jpg), measured).
3. **Stock for a new item**: "Add Inventory Item" has 39 inputs and none for quantity ([13](J8-stock-reorder-screens/13-add-inventory-item-dialog.jpg)); the approved item appears as "0 PIECES · Previous / depleted" (measured), so the quantity in the pharmacist's hand goes through a second flow and, for `Edit stock`, a second approval.

Not counted, but related: the suggested order quantity fills to the saved maximum (495 packs, 498 Wood's Lamps), so the first thing the user does on every request is overwrite it. The reason is `inventory-replenishment.service.ts:212` ("replenish available stock to maximum") combined with a seeded maximum of 500.

### Confirmations

| Confirmation | Guards | Verdict |
|---|---|---|
| "Approve inventory change" dialog (approver, stock edit) | A stock write | Adds nothing: its text is "Calamine Lotion 100ml. Apply the reviewed price or stock change." while the card behind it shows "26 → 25" and the reason. Fold the optional note into the card. If the dialog stays, it must restate the change. |
| "Approve new item" dialog | Item creation | Same: "The item is added to inventory immediately." The card already lists every field. |
| "Sent to doctor for approval" modal with `Close` | Nothing | Title and body are the same sentence. A status line or toast does this without a click. |
| "Check your changes · Not saved yet" block in Edit stock and Edit item | — | Earns its place: inline, no extra click, shows saved → new. |
| Reason required on a quantity or detail change | Audit trail | Earns its place. |
| Reject needs a reason (new item) | — | Earns its place. |

No confirmation on `Create purchase order`, `Submit for approval`, `Approve document` or `Send purchase order`: correct, none is destructive.

### Dead ends

1. **After `Submit for approval` on Edit stock** the only feedback is a banner rendered above the "Stock" heading; the user is scrolled 693 px below it, the row still says 26 and carries no "pending" mark (measured; `WorkspaceStock.tsx:221-224`).
2. **Today › "4 Low stock"** opens the stock list with the chip "stock: LOW ×". There is no reorder action on that list, and the Shortbook did not contain those four items until `Sync shortages` was pressed (measured).
3. **Order "Awaiting manager approval"**, for the pharmacist: "Ask a manager with approval permission to review this document." No way to notify anyone. For the approver, Today's "What needs attention" has no row for it; it only appears under "Recent activity" (measured as admin).
4. **After `Approve document`** the sticky bar reads "Approved" with no button. The next actions are 1,458 px further down, below "Document history" ([10](J8-stock-reorder-screens/10-purchase-order-approved-delivery-panel.jpg)).
5. **`Send purchase order`** records "SETUP_REQUIRED · Supplier mail transport is not configured." The order stays "Approved"; there is no "mark as sent" (measured).
6. **"Sent to doctor for approval"** offers only `Close`, and what later arrives is a zero-stock batch labelled "Previous / depleted".
7. **Header bell** links `/dashboard/inventory?tab=low-stock` and `?tab=expiry` land on Today (measured by loading the URL; `components/layout/header.tsx:213,220,275,283`).

### Hesitations

1. Search result is off-screen: after typing "calamine" + Enter the first row sits at y = 1,225 px in a 900 px viewport ([02](J8-stock-reorder-screens/02-stock-list.jpg) is what the user sees; [03](J8-stock-reorder-screens/03-stock-search-result.jpg) is after scrolling).
2. `Edit item` opens its form at y = 897 px, below the fold, with no scroll and focus left on the button ([05](J8-stock-reorder-screens/05-item-page.jpg) is the screen before and, to within one line, after the click).
3. Two `Supplier` pickers on one page.
4. Shortbook empty while Today reports low stock; the primary button is `Add manual request`.
5. Suggested quantities of 495–499 with no visible basis on the row ("Wood's Lamp (Dermatology): 498 PIECES", [07](J8-stock-reorder-screens/07-shortbook-synced.jpg)).
6. Draft banner copy: "Review its details and the available recovery actions", "share the recovery handoff with a colleague who has both workflow permissions" ([08](J8-stock-reorder-screens/08-shortbook-request-top.jpg)).
7. After `Create purchase order` the page looks the same as before: "Draft", same banner, same form. Only the reference gains "PO-" and the task strip moves (measured).
8. After approval the primary button is `Receive remaining stock`, ahead of `Send purchase order`.
9. Proposal: 4 lines "Ready for review" among 78; `Accept selected` at y = 10,213 px.
10. Task names: `Approve corrections` (shown to a pharmacist who cannot approve; `Corrections` in `More tasks…` is something else), `Shortbook`, `Target proposals`, `Stock optimization`.
11. Item-page buttons `Blocked stock`, `Loss & breakage`, `Supplier returns` read as navigation but start a new document; `Blocked stock` is also a tab on the same page ([05](J8-stock-reorder-screens/05-item-page.jpg)).
12. `Add batch` opens "Add Inventory Item"; and on Manual targets the Minimum / Maximum / Reorder inputs look editable but are disabled for the pharmacist (measured `disabled: true`; the only cue is the sentence "An inventory manager with target-review access can change these values.").

## Take-away Pass

### Workspace structure (areas, tasks, tabs)

Measured inventory of the navigation: 5 areas; 31 tasks (Purchases 11, Stock 10, Sales 4, Reorder 6); each area shows its first 3–5 tasks as buttons and the rest in a `More tasks…` select; some tasks add a third row of tabs (Approve corrections: `Price / stock` | `New items`; item page: 8 tabs). From the sidebar that is up to four levels: Inventory → area → task → tab.

- **The five areas are fine.** Names are plain and Today is the right default.
- **Stock strip, removable:** the text link "Supplier returns are now in Purchase bills › Returns" (a migration notice occupying a permanent slot in the task row, `InventoryWorkspace.tsx:334-349`).
- **Stock strip, merge:** `Approve corrections` and `Corrections` (different things, near-identical names); `Manual opening stock` and `Opening stock import` (one goal, two tasks); `Loss & breakage`, `Blocked stock`, `Corrections`, `Manual opening stock` are four registers of the same kind of document, and the first two are started from the item page anyway (measured), so one "Stock adjustments" register with a type filter would replace four tasks.
- **Reorder strip, merge:** `Target proposals` and `Manual targets & exclusions` both set min / max; `Automation settings` and `Monitor` both end in the same "Saved run outcomes" block (measured: identical "No saved runs yet…" text on both).
- **Finding the right view depends on knowing the document model.** A user who wants to reorder has to know that "low stock" lives in Stock, "shortages" in Reorder › Shortbook, and that nothing connects them. A user who wants to approve has three counters that disagree: the sidebar badge and `Approve corrections (1)` counted my new-item request; Today's row read "Price/stock edits awaiting approval (0)" at the same moment ([14](J8-stock-reorder-screens/14-approve-new-item-admin.jpg), measured). Purchase orders awaiting approval are in none of them.
- **Today's count is printed twice** in the first row: "0 · Price/stock edits awaiting approval (0)" ([01](J8-stock-reorder-screens/01-inventory-today.jpg)).
- **Today repeats three rows as buttons** underneath: `Check low stock`, `Check next 3 months' expiry`, `Check overdue supplier balances` open the same targets as the rows "Low stock", "Expiring in the next 3 months", "Overdue supplier bills". Remove the three buttons.
- **Today's "Orders awaiting receipt"** showed 1 while the only order was "Awaiting manager approval" (measured). The row counts every non-final status (`InventoryWorkspace.tsx:660-727`).

### Routes that change a stock quantity

Seen live as pharmacist unless marked:

| # | Route | Control | Where |
|---|---|---|---|
| 1 | `Edit stock` on the stock-list row | Approval by doctor or admin | [03](J8-stock-reorder-screens/03-stock-search-result.jpg), [04](J8-stock-reorder-screens/04-edit-stock-dialog.jpg) |
| 2 | `Edit stock` on the item page | Same dialog (`StockEditDialog`, used at `InventoryItemPage.tsx:601` and `WorkspaceStock.tsx:725`) | [05](J8-stock-reorder-screens/05-item-page.jpg) |
| 3 | `Count this batch` (item page) | Sign-off, then approval | [05](J8-stock-reorder-screens/05-item-page.jpg); not exercised |
| 4 | `Count matching batches` / count selected (stock list) | Same | [03](J8-stock-reorder-screens/03-stock-search-result.jpg); not exercised |
| 5 | Stock counts › count an item | Same | suspected (story) |
| 6 | `Loss & breakage` → `Post stock loss` | Posts at once, no approver (suspected: STORY-101; the button is offered to the pharmacist as the primary action, not pressed) | [15](J8-stock-reorder-screens/15-loss-breakage-document.jpg) |
| 7 | Item ledger › `Correct` → `Post linked correction` | Approvers only | suspected (`InventoryItemPage.tsx:562`) |
| 8 | `Manual opening stock` document | Posts at once | task present; suspected |
| 9 | `Opening stock import` (Excel) | Posts at once | task present; suspected |
| 10 | `Receive stock` on an inward challan, or posting a purchase bill | Other critique | hand-off |

`Blocked stock` changes what is available, not what is on the shelf. Sales and returns also move stock but belong to other journeys.

For the single situation "the shelf does not match the screen" there are five mechanisms (edit, count, loss, correction, opening stock) under three control regimes. Routes 1–2 are a deliberate shortcut of one dialog and are fine. The problem is 1 against 6: a one-bottle `Edit stock` waits for a doctor, while `Loss & breakage`, two buttons to the right on the same row of the item page, is offered as an immediate post. Either both need approval or neither does; as built, the control on route 1 can be walked around.

### Today — [01](J8-stock-reorder-screens/01-inventory-today.jpg)

- Primary action: `Scan or enter bill` (filled). Reasonable for a pharmacy at delivery time; `Find or correct stock` is correctly secondary.
- The "Data quality" strip is the loudest element (red and amber chips reading 79) and sits above both the actions and "What needs attention". All 79 seeded batches lack a location and an HSN code, so it is permanently red and says nothing new. Move it below the attention list.
- Eight attention rows for the pharmacist, seven of them at 0. Hide zero rows or dim them; the one row with a number (Low stock 4) is not visually different from the rows without.
- Missing: a row for orders awaiting approval, and a route from "Low stock" to reordering.

### Stock list — [02](J8-stock-reorder-screens/02-stock-list.jpg), [03](J8-stock-reorder-screens/03-stock-search-result.jpg)

Fails step economy, hierarchy, progressive disclosure and once-only (four heuristics).

- Between the page title and the first batch row there are, in order: area bar, task bar, the returns notice and `More tasks…`, the Data quality strip, the "Stock" heading with `Add batch` and export, the search row, three batch-view buttons, a help sentence, Stock level, Expiry, a checkbox, the active-filter chip, Sort, and a "Value of matching batches" table. The row the user came for starts at 1,225 px.
- **Removable or collapsible:** the Data quality strip here (it is on Today); "Value of matching batches" (PTR / MRP / MRP excluding GST / landing value — an accountant's view, shown to everyone, above the results; collapse to a link or move under the table, `WorkspaceStock.tsx:478`); Stock level / Expiry / Sort into the existing `Filters` panel (the button is already there; per STORY-097 it holds other filters, not opened in this pass).
- **Two primaries:** `Add batch` and `Search` are both filled. Search is the primary on this screen.
- **Default batch view is `All batches`**, which includes depleted ones; `Current / on hand` is what STORY-094 needs.
- Active-filter chips print parameter names: "search: calamine ×", "stock: LOW ×" (`WorkspaceStock.tsx:435`).
- The row itself is good: name, pack, batch state, expiry, available, price, location, and two edit buttons.
- With the seeded data every row carries the same amber "On hand, expiry unverified" badge and "Batch missing". When every row warns, no row does.

### Edit stock dialog — [04](J8-stock-reorder-screens/04-edit-stock-dialog.jpg)

Already minimal; see the last section. One nit: "Current stock on shelf: 26 BOTTLES" sits directly above a field labelled "Counted physical stock (BOTTLES)" pre-filled with 26 and a preview reading "26 → 25". The figure is stated three times in a small dialog. Drop the "Current stock on shelf" line once the preview is showing.

### Item page — [05](J8-stock-reorder-screens/05-item-page.jpg)

Fails one-primary, once-only and hierarchy.

- **No primary action.** Nine outlined buttons in two rows (`Edit item`, `Set stock alert`, print, `Edit stock`, `Edit price`, `Blocked stock`, `Loss & breakage`, `Supplier returns`, `Count this batch`) above eight tabs.
- **`Set stock alert` is removable.** It opens the same form as `Edit item` with a different field focused; the "alert" is three numbers among roughly 25 fields including prescription defaults. Either make it a three-field popover or drop it.
- **Stated twice:** "Blocked stock" as a button and as a tab; item master data in the strip and again in the `Information` tab (story, not re-checked); "30 TUBES" in the header card, the Batches row and the Batches total.
- **Rename the document buttons as verbs:** `Block from sale`, `Record loss`, `Return to supplier`.
- The strip shows "Min qty" and "Max qty" but not "Reorder at", which is the third number the alert form asks for.
- Saving details shows "Corrected details saved. Stock quantity unchanged." above `Back to stock list`, again out of view after the scroll down to the form (measured, scrollTop 390).

### Edit item form — [06](J8-stock-reorder-screens/06-edit-item-details.jpg)

- Sound structure: basics first, "More details: tax, stock limits & codes" collapsed, change preview, one reason, one save.
- The naming block ("Name on prescriptions": Form, Medicine name, Strength, Combination, "Prints as") takes the top half of the form, ahead of batch number, expiry and shelf, which are what STORY-097 is about. For a batch-level correction, put Batch / Expiry / Rack first and collapse naming unless the suggestion applies.
- "Product name" (Dapsone 5% Gel 20g) and "Medicine name" (Acnedap) are both shown, with "Prints as Acnedap". Three names for one tube.
- Side effect to state on screen: after I changed "Reorder at" here, the next target proposal listed the item under "Excluded items (1): Dapsone 5% Gel 20g · Manual targets preserved" ([12](J8-stock-reorder-screens/12-target-proposal-bottom.jpg), measured). Nothing in the form says that setting a level by hand takes the item out of automatic proposals.

### Shortbook list — [07](J8-stock-reorder-screens/07-shortbook-synced.jpg)

- Five filter controls and an `Apply filters` button above a list that had 0, then 4, records. Collapse filters until the list is long. They also need an explicit `Apply filters`, where the stock list's selects apply on change (suspected: STORY-103 step 22).
- "0 matching records · all result pages included" — the second half is about pagination and means nothing to the user.
- Each row repeats the item name three times: in the reference ("NEED-2026-11-13-Electrocautery Tips (Pack of 10)"), in the summary line, and (once opened) in the heading. The reference is truncated for long names ("…Refillabl").
- "LOW_STOCK · NORMAL · 13 Nov 2026 · Requested by cmweppwk100047d00csuz4ukg": two enum values and a user ID (`ReplenishmentCenter.tsx:166`).
- "Draft • no stock change" on every row of a list where nothing can ever change stock.
- No way to act on several rows: one request per item, one order per request. Four low items from one distributor means four orders.

### Shortbook request and purchase order — [08](J8-stock-reorder-screens/08-shortbook-request-top.jpg), [09](J8-stock-reorder-screens/09-shortbook-request-lines-and-supplier.jpg), [10](J8-stock-reorder-screens/10-purchase-order-approved-delivery-panel.jpg)

Fails step economy, once-only, one-primary and hierarchy. The page is two components stacked (`InventoryWorkspace.tsx:518` and `:567-568`), 1,769 px tall for one line item.

- **Status banner, removable on the happy path.** Three sentences plus `Reload saved record` say that a draft is a draft ("This document is a draft…", "This draft has not changed stock.", "Correct the draft, then choose Create purchase order…"). The sticky bar already says "Draft" and holds the buttons. Keep the banner for exceptional states only (`workflow-document-state.ts:79-90`).
- **Status is stated up to four times:** sticky bar "Draft", banner, "Saved status confirmed. Review the outcome and recorded effects below.", and the history line.
- **Editable `Reference` field** holding a generated ID. Make it read-only text.
- **Line table columns** `Free`, `Discount %`, `Scheme ₹`, `GST %` on a shortage request; the same purchase columns appear on a Loss & breakage document ([15](J8-stock-reorder-screens/15-loss-breakage-document.jpg)). For a request only Quantity matters, plus Rate on an order.
- **"Add a batch"** search on a request for an item that has no batch yet; the line shows "— · PACKS · MRP ₹0.00 · Location not recorded".
- **Document history** prints "cmweppwk100047d00csuz4ukg · CREATE" and "(revision 1)" between the lines and the supplier panel. Collapse it by default and print names.
- **Supplier recommendation panel:** a second `Supplier` select and `Save supplier`, and one expandable row "Jseven Pharma Distributors · Alternative · 0 posted purchase records". With no purchase history it recommends nothing; hide it when empty, and when it has content let each row be a "Use this supplier" button that fills the one Supplier field.
- **Order after approval:** fields still look editable; `Cancel document` (toolbar) and "Cancel remaining quantities" (delivery panel) are both present; the caption under `Send purchase order` announces that it will fail.

### Target proposal — [11](J8-stock-reorder-screens/11-target-proposal-top.jpg), [12](J8-stock-reorder-screens/12-target-proposal-bottom.jpg)

Fails step economy, hierarchy and progressive disclosure.

- 79 lines, 10,336 px. 74 read "Cold start: retain saved targets" with identical saved and proposed values; 4 are "Ready for review"; 1 is excluded. The four that matter are scattered alphabetically among the 74.
- `Select unreviewed` is at y = 658; `Accept selected` and `Reject selected` are at y = 10,213, after the last line.
- Header copy is written for the developer: "observed-demand-cover-v2", "Posted SALE outflows plus enabled draft BOUNCE/REFILL quotations… Draft quotations are demand signals, not reservations. No supplier availability feed.", "60 days · 1 minimum orders · Bounce Off · Refill On", "10 / 60 min / max days".
- "Draft • no stock change" on a document that could never change stock.
- The proposals themselves look risky to accept without context: "Saved min / max 5 / 500 → Proposed 1 / 4 BOTTLES" for a sunscreen with 21 available. The line shows the inputs (Sales 4 · 3 orders) but not the consequence (21 on hand would be above the new maximum).

### Approval queue — [14](J8-stock-reorder-screens/14-approve-new-item-admin.jpg)

- The card is good: what, from → to, reason, who, when, `Approve` / `Reject`.
- The requester sees the same queue under the task name `Approve corrections` with no buttons and no way to withdraw a request.
- The status chip reads "Waiting for doctor" to an admin who is the approver; the heading says "Waiting for review".
- Tab choice is local state (`InventoryApprovals.tsx:11-12`): the queue opens on `New items` whenever one is pending, even when the user clicked Today's "Price/stock edits" row (suspected from code; when I followed that row no item request was pending).
- "MEDICINE", "PIECES" are raw enum values; cost and price have no currency symbol ("200", "300").

### Add Inventory Item — [13](J8-stock-reorder-screens/13-add-inventory-item-dialog.jpg)

- 39 inputs in one scrolling dialog; 6 are required (Type, Form, Medicine name, Cost price, Selling price, Unit). Everything else can sit behind "More details", as the edit form already does.
- No quantity, so the item lands empty (see Re-entry 3).
- Deferrable at creation: Description, Sub-Category, prescription defaults, Item code, Barcode, SKU, Reorder Qty, Storage Conditions, Controlled Substance.

### Loss & breakage document — [15](J8-stock-reorder-screens/15-loss-breakage-document.jpg)

- Same banner and same purchase-style line table as above. The one thing to enter (quantity, with a reason) is below the fold.
- `Post stock loss` is the filled primary for a pharmacist (see "Routes that change a stock quantity").

## The Simpler Version

Same goal as STORY-103, in 8 steps.

**Pharmacist**

1. Inventory › Today shows "4 items to reorder". Click it → the reorder list opens with shortages already there (no `Sync shortages`). Each line shows item, "2 on hand · min 5", a suggested quantity with its basis, and a supplier pre-chosen from the last purchase or the saved choice.
2. Adjust quantities inline, tick the lines for one supplier, click `Create order for Jeight Distributors (3 items)` → the order is created and submitted for approval in one action. "Save as draft" is the secondary option.

**Approver**

3. Today shows "1 purchase order awaiting your approval". Click it → the order opens.
4. `Approve` in the sticky bar. The bar's primary becomes `Export for supplier` (or `Send` when mail is configured).
5. `Export for supplier` → the order is marked "Sent".

**Receiver**

6. Today › "Orders awaiting receipt" → open the order.
7. `Receive stock` in the sticky bar → pre-filled inward challan (hand-off, as today).

**Targets (occasional, admin)**

8. Reorder › Min / max levels → the proposal lists only the lines that change, with `Accept all 4` at the top and "74 items keep their saved levels" collapsed.

### Changes to get there

| # | Change | Effort | Files |
|---|---|---|---|
| 1 | Put the state's next action in the sticky bar of reorder documents (Approved → `Send` / `Export`, then `Receive remaining stock`), instead of 1,458 px down | M | `WorkflowDocumentEditor.tsx:650`, `ReplenishmentCenter.tsx:134` |
| 2 | One supplier picker per request: remove `Supplier` + `Save supplier` from the recommendation panel; make recommendation rows fill the form field; hide the panel when it has no history | S–M | `ReplenishmentCenter.tsx:130` |
| 3 | Sync shortages automatically when the Shortbook opens; demote `Sync shortages` to a refresh icon; make Today's "Low stock" row offer "Reorder these" | M | `ReplenishmentCenter.tsx:164`, `InventoryWorkspace.tsx:691` |
| 4 | Today: add "Purchase orders awaiting approval" for approvers; count only approved / sent / part-received orders in "Orders awaiting receipt"; add new-item requests to the approvals row so it agrees with the sidebar badge; print each count once; remove the three duplicate `Check …` buttons | S | `InventoryWorkspace.tsx:660-800` |
| 5 | Target proposal: collapse no-change lines; `Select unreviewed` selects only lines with a change; sticky `Accept selected` bar | M | `ReplenishmentCenter.tsx:116-126` |
| 6 | Stock list: results directly under the search row; Stock level / Expiry / Sort into `Filters`; "Value of matching batches" collapsed or below the table; Data quality strip off this screen; default batch view `Current / on hand`; scroll to results after a search | M | `WorkspaceStock.tsx:221-478`, `InventoryWorkspace.tsx:360` |
| 7 | After `Submit for approval`: toast where the user is, and a "Pending approval: 26 → 25" mark on the row | S (toast), M (row mark, needs pending edits in the list response) | `WorkspaceStock.tsx:221-224,725-726` |
| 8 | `Edit item`: scroll to and focus the form on open; show the saved message next to the form; drop `Set stock alert` or make it a three-field popover | S | `InventoryItemPage.tsx:233-237,343` |
| 9 | Draft / approved banner: show only for exceptional states; rewrite without "recovery" | S | `workflow-document-state.ts:79-90` |
| 10 | Hide `Free`, `Discount %`, `Scheme ₹`, `GST %` and "Add a batch" on Shortbook, Loss and Blocked-stock documents; make `Reference` read-only; collapse Document history | M | `WorkflowDocumentEditor.tsx:1159-1162,1585` |
| 11 | When mail transport is not configured, replace `Send purchase order` with `Export for supplier` + `Mark as sent` | S | `ReplenishmentCenter.tsx:134-135` |
| 12 | Create several shortages into one order per supplier | L | `ReplenishmentCenter.tsx`, `inventory-replenishment.service.ts` |
| 13 | Approve inline on the card with an optional note; keep the dialog for Reject. Replace the "Sent to doctor for approval" modal with a status line that links to the request | S | `InventoryUpdates.tsx:112-114`, `InventoryItemRequests.tsx:125`, `AddInventoryItemDialog.tsx:220-222` |
| 14 | Add "Opening quantity" to Add Inventory Item; move the 33 optional inputs behind "More details" | M | `AddInventoryItemDialog.tsx`, backend `inventory.service.ts` |
| 15 | Decide one control regime for quantity fixes: either `Post stock loss` goes through the same approval as `Edit stock`, or small edits do not need one | M (policy first) | `StockEditDialog.tsx`, backend `inventory-workflow.service.ts` |
| 16 | Merge tasks: Target proposals + Manual targets → "Min / max levels"; Automation settings + Monitor → "Automation"; Loss / Blocked / Corrections / Manual opening stock → one "Stock adjustments" register; remove the returns notice from the Stock strip | M | `InventoryWorkspace.tsx:73-94,334-354` |
| 17 | Show the basis of a suggested quantity ("to reach max 500") and prefer the saved reorder quantity over fill-to-max | S (label), M (rule) | `ReplenishmentCenter.tsx:166`, `inventory-replenishment.service.ts:212` |
| 18 | Names instead of IDs for requester, actor and branch | S–M (API must return names) | `ReplenishmentCenter.tsx:157,166,200`, `WorkflowDocumentEditor.tsx:1585` |
| 19 | Prefill Date on new documents | S | `WorkflowDocumentEditor.tsx:791` |
| 20 | Point the bell's low-stock and expiry links at `?area=stock&view=list&stock=LOW` and `&expiryMonths=3` | S | `components/layout/header.tsx:213,220,275,283` |

Not proposed: removing approval from stock-quantity edits, purchase orders or new items; removing the reason field; removing the change preview. Those are the steps that make the numbers trustworthy in a pharmacy, and each costs one field or one click.

## Clarity Issues

| Where | Text on screen | Problem | Suggested |
|---|---|---|---|
| Reorder task | `Shortbook` | Trade term; nothing on Today or in Stock uses it | "To reorder" |
| Reorder tasks | `Target proposals`, `Manual targets & exclusions` | "Target" is called Min qty / Max qty on the item page, "Minimum stock" / "Reorder at" in the editor, "stock alert" on the button, "Missing min/max" in Data quality | One term: "Min / max levels" |
| Stock task | `Approve corrections`; `Corrections` | Two different things; the first is also shown to people who cannot approve; inside, the heading is "Price / stock approval queue" | "Approvals" for approvers, "My requests" for requesters |
| Stock task | `Stock optimization` | It finds slow stock to return | "Slow stock & returns" |
| Document banner | "Review its details and the available recovery actions"; "share the recovery handoff with a colleague who has both workflow permissions" | Incident vocabulary on a normal draft | Remove; one line only when something went wrong |
| Document banner | "Saved status confirmed. Review the outcome and recorded effects below." | Says nothing the user can act on | "Sent for approval." / "Approved." |
| Status label | "Draft • no stock change", "Approved • ready for next step" | The suffix is noise on requests, orders and proposals | "Draft", "Approved" |
| Status label | "Awaiting manager approval" | I approved this order as an admin; elsewhere the approver is called "doctor" (item requests) or "doctor or admin" (price / stock) | "Awaiting approval" everywhere |
| Status chip | "Waiting for doctor" (shown to an admin approver) | Wrong for the reader | "Waiting for approval" |
| Shortbook row | "LOW_STOCK · NORMAL · … · Requested by cmweppwk100047d00csuz4ukg" | Enum values and a user ID | "Low stock · Normal priority · Requested by Karthik Reddy" |
| Shortbook row | "Supplier selection required" | Reads as an error | "No supplier chosen yet" |
| Lists | "0 matching records · all result pages included" | Second half is about pagination | "No requests" |
| Manual targets, Monitor | "Branch branch-seed-1" | Internal ID | Branch name, or omit for a single-branch clinic |
| Filter | "Supplier GSTIN" | A pharmacist looks for a supplier by name | Supplier name select |
| Proposal header | "observed-demand-cover-v2"; "Posted SALE outflows plus enabled draft BOUNCE/REFILL quotations…"; "Bounce Off · Refill On" | Model internals | "Based on sales from 14 Sep to 13 Nov. Aims for 10–60 days of stock." |
| Proposal line | "Cold start: retain saved targets" | Jargon for "not enough sales to suggest a change" | "No change — too few sales" |
| Order panel | "Supplier mail transport: setup required. Sending records the setup failure; export is available for manual delivery." | Describes the implementation | "Email to suppliers is not set up. Export the order and send it yourself." |
| Order panel | "Paid plus free units consume the ordered quantity. Over-delivery is rejected; amend or create an approved order first." | Rules shown before they are relevant | Show when a receipt exceeds the order |
| Automation settings | "Every 30 minutes; target proposals follow the configured refresh-day cadence"; "Next scheduler / target run" | Scheduler vocabulary | "Checks every 30 minutes. New level suggestions every N days." |
| Stock list chips | "search: calamine ×", "stock: LOW ×" | Parameter names | "Search: calamine", "Low stock" |
| Stock list | `Add batch` → "Add Inventory Item" → `Add Item` | Batch, item, product used for one thing | "Add item" throughout |
| Stock list | "Batch missing"; "On hand, expiry unverified"; "Unverified" | Three warnings per row for one fact | One badge: "Batch and expiry not recorded" |
| Edit stock | "Counted physical stock (BOTTLES)"; "Include the 0 units set aside." | "set aside" is "held" on the item page and "Blocked stock" on the button | One term: "blocked" |
| Item page | `Blocked stock`, `Loss & breakage`, `Supplier returns` | Nouns on buttons that start an action | `Block from sale`, `Record loss`, `Return to supplier` |
| Item page | "Opened batch unspecified · Expiry Unverified"; "Unmapped batch only; link a verified product to group sibling batches." | Data-model language | "No batch number or expiry recorded." |
| Cost columns | "PTR", "Rate excl. GST", "Cost Price", "Landing price", "Known landing value" | Five names for what the clinic paid | "Purchase rate" plus one defined "Landed cost" |
| Supplier | "Supplier" in forms; "Distributor" in the Purchases register and Stock optimization | Two names | "Supplier" |
| Approval card | "MEDICINE", "PIECES", "200" | Enums and a bare number | "Medicine", "Pieces", "₹200.00" |

## Already Minimal

- **Edit stock dialog** ([04](J8-stock-reorder-screens/04-edit-stock-dialog.jpg)): one pre-filled number, an inline saved → new preview, one reason, one submit, and the approval consequence stated in the subtitle. Four inputs for a change that goes on the ledger; nothing to remove beyond the repeated figure noted above. The approval step earns its place.
- **`Create purchase order` straight from the request**: it worked on an unsaved draft, carried supplier and quantity, and landed on the new order (measured). That is shorter than the story's steps 18–20; no `Save draft` and no `Open linked purchase order` click was needed.
- **`Receive remaining stock`**: one click opens an inward challan with supplier, linked order, line, quantity and reason already filled (measured).
- **Approving a purchase order**: one click on `Approve document`, no dialog. Right for a reversible, non-stock action.
- **The stock search itself**: one field, Enter, a chip to clear it, and a row that answers STORY-094 (available, expiry, location) without opening the item. The problem is only where the row sits.
- **Approval card content**: item, batch, from → to, reason, who and when.
- **Change preview and required reason** in the details editor; the save button stays disabled until both exist.
- **`Set stock alert` focus**: opening it expanded "More details" and scrolled to "Minimum stock" (measured). The mechanism is right even if the button is redundant.
- **Empty states name the next action**: "No matching records. Create an order or start from a Shortbook request."
- **`Sync shortages` feedback**: "Shortbook refreshed from active targets. Existing requests are preserved." Clear about what it did and did not do.
- **The area bar**: five plain names, Today first.
